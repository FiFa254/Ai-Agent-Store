// Storefront AI assistant (Gemini) with the live catalog. Without an API key it answers from the catalog directly.
import { GoogleGenAI, Type } from '@google/genai';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { chatSchema } from '@shared/schemas';
import type { CatalogProduct, ChatReply } from '@shared/types';
import type { Deps } from '../../app';
import { handle, parse } from '../../middleware/http';
import { publicCatalog } from '../catalog/repository';

const TIMEOUT_MS = 20_000;

function systemPrompt(storeName: string, products: CatalogProduct[]): string {
  const catalog = products.map((p) => ({
    id: p.id,
    name: p.name,
    category: p.categoryName,
    price: p.price,
    promoPrice: p.promoPrice,
    available: p.available,
    description: p.description,
  }));
  return `You are "พี่ชำใจดี", the friendly shop assistant of "${storeName}", a Thai grocery store.
Reply in polite, natural Thai (ครับ/ค่ะ), short and helpful.
Only talk about products in the catalog below; if something is not sold here, say so and suggest the closest alternatives from the catalog.
Stock: "available" is the live quantity. Never promise more than is available.
When the customer says what they want to buy, put those items in detectedCartItems (catalog id + quantity, capped at available) and say they were added to the cart; remind them to check out from the cart.
Recommend items on promotion (promoPrice set) when relevant via recommendedProductIds.
Prices are in Thai baht and already include VAT.

Catalog (JSON):
${JSON.stringify(catalog)}`;
}

/** Keyword fallback when Gemini is not configured or fails. */
function offlineReply(message: string, products: CatalogProduct[]): ChatReply {
  const words = message.toLowerCase().split(/\s+/).filter((w) => w.length >= 2);
  const matches = products.filter((p) => words.some((w) => p.name.toLowerCase().includes(w) || p.categoryName.toLowerCase().includes(w))).slice(0, 5);
  const promos = products.filter((p) => p.promoPrice !== null).slice(0, 3);
  let reply: string;
  if (matches.length > 0) {
    reply = 'สินค้าที่เกี่ยวข้องค่ะ:\n' + matches.map((p) => `- ${p.name} ${p.promoPrice ?? p.price} บาท (${p.available > 0 ? `เหลือ ${p.available}` : 'หมด'})`).join('\n');
  } else if (/โปร|ลด|promo/i.test(message) && promos.length > 0) {
    reply = 'โปรโมชันตอนนี้ค่ะ:\n' + promos.map((p) => `- ${p.name} ลดเหลือ ${p.promoPrice} บาท (จาก ${p.price})`).join('\n');
  } else {
    reply = 'ขออภัยค่ะ ผู้ช่วย AI ยังไม่พร้อมใช้งาน ลองค้นหาสินค้าจากช่องค้นหา หรือพิมพ์ชื่อสินค้าที่ต้องการได้เลยค่ะ';
  }
  return { reply, detectedCartItems: [], recommendedProductIds: promos.map((p) => p.id), offline: true };
}

export function chatRoutes({ db, config, logger }: Deps): Router {
  const router = Router();
  const ai = config.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: config.GEMINI_API_KEY }) : null;
  const limiter = rateLimit({ windowMs: 60_000, limit: config.NODE_ENV === 'test' ? 1000 : 15, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'ส่งข้อความบ่อยเกินไป กรุณารอสักครู่' } });

  router.post(
    '/',
    limiter,
    handle(async (req, res) => {
      const { message, history } = parse(chatSchema, req.body);
      const products = await publicCatalog(db);
      if (!ai) return res.json(offlineReply(message, products));

      const settingsRow = await db.queryOne<{ StoreName: string }>('SELECT StoreName FROM dbo.Settings WHERE Id = 1');
      // Gemini expects the conversation to start with a user turn.
      const turns = history.slice(history.findIndex((h) => h.role === 'user') >= 0 ? history.findIndex((h) => h.role === 'user') : history.length);

      try {
        const response = await Promise.race([
          ai.models.generateContent({
            model: config.GEMINI_MODEL,
            contents: [...turns.map((h) => ({ role: h.role, parts: [{ text: h.text }] })), { role: 'user', parts: [{ text: message }] }],
            config: {
              systemInstruction: systemPrompt(settingsRow!.StoreName, products),
              temperature: 0.6,
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                required: ['reply'],
                properties: {
                  reply: { type: Type.STRING },
                  detectedCartItems: {
                    type: Type.ARRAY,
                    items: { type: Type.OBJECT, required: ['productId', 'quantity'], properties: { productId: { type: Type.INTEGER }, quantity: { type: Type.INTEGER } } },
                  },
                  recommendedProductIds: { type: Type.ARRAY, items: { type: Type.INTEGER } },
                },
              },
            },
          }),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Gemini timeout')), TIMEOUT_MS)),
        ]);
        const parsed = JSON.parse(response.text ?? '{}');
        const byId = new Map(products.map((p) => [p.id, p]));
        const body: ChatReply = {
          reply: String(parsed.reply ?? ''),
          // Never trust the model: keep only real products and cap at what is available.
          detectedCartItems: (Array.isArray(parsed.detectedCartItems) ? parsed.detectedCartItems : [])
            .filter((i: any) => byId.has(Number(i.productId)) && Number(i.quantity) > 0)
            .map((i: any) => ({ productId: Number(i.productId), quantity: Math.min(Math.floor(Number(i.quantity)), byId.get(Number(i.productId))!.available) }))
            .filter((i: { quantity: number }) => i.quantity > 0),
          recommendedProductIds: (Array.isArray(parsed.recommendedProductIds) ? parsed.recommendedProductIds : []).map(Number).filter((id: number) => byId.has(id)),
          offline: false,
        };
        res.json(body);
      } catch (err) {
        logger.warn({ err }, 'gemini chat failed, using offline reply');
        res.json(offlineReply(message, products));
      }
    })
  );

  return router;
}
