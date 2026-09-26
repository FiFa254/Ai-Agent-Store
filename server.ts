import express from 'express';
import path from 'path';
import crypto from 'crypto';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import { Store } from './server/store';
import { DEFAULT_CONNECTION_STRING } from './server/db';
import { createServer as createViteServer } from 'vite';

dotenv.config();


// --- Admin authentication ---
// Protects mutating admin endpoints (create/update/delete products, resolve alerts).
// Set ADMIN_PASSWORD in .env; if it's not set, admin actions are refused outright
// rather than left open, so a missing config fails closed instead of open.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

function safeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!ADMIN_PASSWORD) {
    return res.status(503).json({
      error: 'Admin access is not configured on this server. Set ADMIN_PASSWORD in the environment.',
    });
  }
  const provided = req.header('x-admin-password') || '';
  if (!provided || !safeEquals(provided, ADMIN_PASSWORD)) {
    return res.status(401).json({ error: 'Unauthorized: invalid admin password.' });
  }
  next();
}

// Initialize Gemini SDK with custom user agent as strict guidelines demand
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT) || 3000;

// --- DATABASE (SQL Server, see server/store.ts) ---
// Default: local SQL Server, Windows login, database GroceryAI (created on first start).
// Override with MSSQL_CONNECTION_STRING in .env.
const DATA_DIR = path.join(process.cwd(), 'data');
const CONNECTION_STRING = process.env.MSSQL_CONNECTION_STRING || DEFAULT_CONNECTION_STRING;
let store: Store;

// Express 4 does not catch rejected promises from async handlers; forward them to the error handler.
for (const method of ['get', 'post', 'delete'] as const) {
  const original = app[method].bind(app) as (...args: any[]) => any;
  (app as any)[method] = (route: any, ...handlers: any[]) =>
    handlers.length === 0
      ? original(route)
      : original(route, ...handlers.map((h) =>
          typeof h === 'function' && h.length < 4
            ? (req: any, res: any, next: any) => Promise.resolve().then(() => h(req, res, next)).catch(next)
            : h));
}

// --- REST API ROUTES ---

// 1. PRODUCTS
app.get('/api/products', async (req, res) => {
  res.json(await store.listProducts());
});

// Lightweight endpoint the admin login form calls to verify a password without
// performing a mutation. Also gated by requireAdmin, so a right response means
// the supplied x-admin-password header is correct.
app.post('/api/admin/verify', requireAdmin, (req, res) => {
  res.json({ success: true });
});

app.post('/api/products', requireAdmin, async (req, res) => {
  const { id, name, price, promoPrice, category, stock, minStock, description } = req.body;

  const invalidNumber = (value: unknown) => value === '' || value === null || value === undefined || isNaN(Number(value)) || Number(value) < 0;
  if (!name || invalidNumber(price) || invalidNumber(stock) || invalidNumber(minStock)
      || (promoPrice !== undefined && promoPrice !== null && promoPrice !== '' && invalidNumber(promoPrice))) {
    return res.status(400).json({ error: 'Invalid product details provided.' });
  }

  const product = await store.upsertProduct({ id, name, price, promoPrice, category, stock, minStock, description });
  res.json({ success: true, product });
});

app.delete('/api/products/:id', requireAdmin, async (req, res) => {
  await store.deleteProduct(req.params.id);
  res.json({ success: true });
});

// 2. SALES
app.get('/api/sales', async (req, res) => {
  res.json(await store.listSales());
});

// 3. CHECKOUT (Handles QR Payment and registers sales)
//
// Cash and QR/PromptPay are handled differently on purpose: cash is paid at the
// counter the instant checkout is triggered, so stock is deducted and the sale
// logged right away (in one database transaction). QR payment is NOT confirmed
// yet at this point — the customer has only just been shown the QR code — so
// stock is left untouched and the order is held as "pending" until
// /api/checkout/confirm is called.
app.post('/api/checkout', async (req, res) => {
  const { items, paymentMethod } = req.body; // Array of { productId, quantity }

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Cart must not be empty.' });
  }

  const priced = await store.priceCart(items);
  if (priced.ok === false) {
    return res.status(priced.status).json({ error: priced.error, details: priced.details });
  }

  const method = paymentMethod || 'promptpay';

  if (method === 'cash') {
    const result = await store.completeSale(priced.items, priced.total, method);
    if (result.ok === false) {
      return res.status(result.status).json({ error: result.error, details: result.details });
    }
    return res.json({ success: true, sale: result.sale, pending: false });
  }

  const pending = await store.createPending(priced.items, priced.total, method);
  res.json({ success: true, sale: pending, pending: true });
});

// 3b. CONFIRM a pending QR/PromptPay checkout — deducts stock and records the
// sale in one transaction. Called once the customer confirms they've paid.
app.post('/api/checkout/confirm', async (req, res) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ error: 'Missing checkout id.' });
  }

  const result = await store.confirmPending(id);
  if (result.ok === false) {
    return res.status(result.status).json({ error: result.error, details: result.details });
  }
  res.json({ success: true, sale: result.sale });
});

// 3c. CANCEL a pending QR/PromptPay checkout (e.g. the customer closed the
// modal without paying). Stock was never deducted for a pending checkout.
app.post('/api/checkout/cancel', async (req, res) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ error: 'Missing checkout id.' });
  }
  await store.cancelPending(id);
  res.json({ success: true });
});

// 4. ALERTS
app.get('/api/alerts', async (req, res) => {
  res.json(await store.listAlerts());
});

app.post('/api/alerts/resolve', requireAdmin, async (req, res) => {
  if (await store.resolveAlert(req.body.id)) {
    return res.json({ success: true });
  }
  res.status(404).json({ error: 'Alert not found' });
});

// 5. AI AGENT CHAT API (With rich Gemini integration)
app.post('/api/chat', async (req, res) => {
  const { message, history } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message payload is required' });
  }

  try {
    const products = await store.listProducts();

    // Filter active promotions
    const promos = products.filter((p: any) => p.promoPrice !== undefined && p.promoPrice < p.price);

    // Prepare clear database context for Gemini
    const simpleProductContext = products.map((p: any) => ({
      id: p.id,
      name: p.name,
      price: p.price,
      promoPrice: p.promoPrice,
      stock: p.stock,
      category: p.category,
      description: p.description
    }));

    const systemInstruction = `
You are an intelligent, friendly AI Grocery Shop Assistant "พี่ชำใจดี" for a local Thai grocery store (ร้านขายของชำอัจฉริยะ).
Your main tasks are:
1. Greet customers warmly in polite Thai language (using ครับ/ค่ะ where appropriate).
2. Help users check real-time stock levels of grocery items based strictly on the provided Product Database.
3. Recommend and highlight active promotional offers to boost sales.
4. Auto-summarize purchases accurately when the customer requests products or hints at checking out.
5. Identify specific products and quantities matching the customer query.

Product Database (Real-time schema):
${JSON.stringify(simpleProductContext, null, 2)}

Active Promotions:
${JSON.stringify(promos.map(p => ({ name: p.name, originalPrice: p.price, promoPrice: p.promoPrice })), null, 2)}

Strict Guidelines:
- If a customer asks about items not in the database, politely check and mention that we don't carry them yet, but we have other high-quality matching alternatives.
- If they ask about stocks, clearly list the stock status (e.g. "มีสินค้าพร้อมส่งค่ะ เหลืออยู่ 12 ถุง", or "นมสดยังมีเหลืออีก 3 ชิ้นค่ะ").
- If they state items they want to buy (e.g., "เอาบะหมี่ 3 ถุง และนม 1 ลิตร"), detect these items and populate the 'detectedCartItems' array in the JSON response structure with the matching productId and quantity. Provide a receipt summary inside the reply.
- When they want to buy, remind them polite that they can click "Checkout" or purchase via the cart.
- Recommend corresponding promotional items where relevant.

IMPORTANT: You MUST respond in a strict valid JSON structure matching the schema.
Schema:
{
  "reply": "friendly natural language Thai reply",
  "detectedCartItems": [
    { "productId": "prod_x", "quantity": Y }
  ],
  "recommendPromotions": [
    { "productId": "prod_y" }
  ],
  "stockCheckResult": "Optional status line summary or null"
}
`;

    // Package chat history for Gemini API
    const formattedHistory = (history || []).map((h: any) => ({
      role: h.sender === 'user' ? 'user' : 'model',
      parts: [{ text: h.text }],
    }));

    // Generate output with gemini-3.5-flash as the fallback basic text model
    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: [
        ...formattedHistory,
        { role: 'user', parts: [{ text: message }] }
      ],
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          required: ['reply'],
          properties: {
            reply: {
              type: Type.STRING,
              description: 'The natural, polite Thai greeting or reply answering the customer query.'
            },
            detectedCartItems: {
              type: Type.ARRAY,
              description: 'List of matching products and quantities user wants to purchase, if any.',
              items: {
                type: Type.OBJECT,
                required: ['productId', 'quantity'],
                properties: {
                  productId: { type: Type.STRING },
                  quantity: { type: Type.INTEGER }
                }
              }
            },
            recommendPromotions: {
              type: Type.ARRAY,
              description: 'Recommended products which are currently on sale or match user needs.',
              items: {
                type: Type.OBJECT,
                required: ['productId'],
                properties: {
                  productId: { type: Type.STRING }
                }
              }
            },
            stockCheckResult: {
              type: Type.STRING,
              description: 'Summary statement describing stock levels or warning, if asked.'
            }
          }
        },
        temperature: 0.7,
      },
    });

    const outputText = response.text;
    if (!outputText) {
      throw new Error('No text returned from Gemini API call');
    }

    try {
      const parsed = JSON.parse(outputText.trim());
      res.json(parsed);
    } catch (parseErr) {
      console.warn('Gemini returned invalid JSON structure, sending back layout', outputText);
      res.json({
        reply: outputText,
        detectedCartItems: [],
        recommendPromotions: []
      });
    }

  } catch (error: any) {
    console.error('Gemini API Chat generation error:', error);
    res.status(500).json({
      error: 'ขออภัย ระบบตอบกลับ AI ขัดข้องชั่วคราวกรุณาลองใหม่อีกครั้ง',
      details: error.message
    });
  }
});

// Setup Vite Dev server or production build delivery
async function startServer() {
  try {
    store = await Store.open(CONNECTION_STRING);
    const seeded = await store.seed({ legacyJsonDir: DATA_DIR, demo: process.env.SEED_DEMO_DATA === 'true' });
    console.log(
      seeded === 'imported' ? 'Database: imported data/*.json into SQL Server'
        : seeded === 'seeded' ? 'Database: added demo products (SEED_DEMO_DATA=true)'
        : seeded === 'empty' ? 'Database: no products yet - add them in the Admin Panel'
        : 'Database: connected'
    );
  } catch (err: any) {
    console.error('Cannot connect to SQL Server. Check that the SQL Server service is running and MSSQL_CONNECTION_STRING in .env.');
    console.error(err?.message ?? err);
    process.exit(1);
  }

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Serve production static assets
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Last: turns thrown / rejected errors into a JSON 500 instead of crashing or an HTML page.
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error(`${req.method} ${req.path} failed:`, err?.message ?? err);
    if (res.headersSent) return next(err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดของฐานข้อมูล กรุณาลองใหม่อีกครั้ง' });
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`grocery-server: Grocery AI Backend running on port ${PORT}`);
  });
}

startServer();
