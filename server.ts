import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

const PORT = 3000;

// Persistent Database Files
const DATA_DIR = path.join(process.cwd(), 'data');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');
const SALES_FILE = path.join(DATA_DIR, 'sales.json');
const ALERTS_FILE = path.join(DATA_DIR, 'alerts.json');
const PENDING_CHECKOUTS_FILE = path.join(DATA_DIR, 'pendingCheckouts.json');

// Ensure database directory and files exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initial mock products dataset (Thai Grocery Theme)
const initialProducts = [
  {
    id: 'prod_1',
    name: 'ข้าวหอมมะลิ คัดพิเศษ (5 กก.)',
    price: 185,
    promoPrice: 165,
    category: 'ข้าวสาร/แป้ง',
    stock: 12,
    minStock: 4,
    description: 'ข้าวหอมมะลิแท้คัดพิเศษ หอม นุ่ม น่ารับประทาน หุงขึ้นหม้อ',
  },
  {
    id: 'prod_2',
    name: 'นมสดพาสเจอร์ไรส์ รสจืด Meiji (2 ลิตร)',
    price: 95,
    category: 'ของสด/นม',
    stock: 3,
    minStock: 5,
    description: 'นมโคแท้ 100% สดใหม่ แคลเซียมสูง ซ่อมแซมกระดูกและฟัน',
  },
  {
    id: 'prod_3',
    name: 'บะหมี่กึ่งสำเร็จรูป ไวไว รสปรุงสำเร็จ (แพ็ค 10)',
    price: 65,
    promoPrice: 59,
    category: 'อาหารแห้ง/กึ่งสำเร็จรูป',
    stock: 35,
    minStock: 8,
    description: 'บะหมี่เส้นเหนียวนุ่ม รสชาติเข้มข้น ถูกปากคนไทยมายาวนาน',
  },
  {
    id: 'prod_4',
    name: 'น้ำมันพืช ตราองุ่น (1 ลิตร)',
    price: 52,
    category: 'เครื่องปรุง/น้ำมัน',
    stock: 8,
    minStock: 4,
    description: 'น้ำมันถั่วเหลืองบริสุทธิ์ ผ่านกระบวนการกลั่นที่ทันสมัย ไม่มีคอเลสเตอรอล',
  },
  {
    id: 'prod_5',
    name: 'ไข่ไก่สด เบอร์ 2 (แผง 10 ฟอง)',
    price: 60,
    promoPrice: 52,
    category: 'ของสด/นม',
    stock: 15,
    minStock: 5,
    description: 'ไข่ไก่สดส่งตรงจากฟาร์ม สะอาด มั่นใจได้ในความสดใหม่ โปรตีนสูง',
  },
  {
    id: 'prod_6',
    name: 'กาแฟสำเร็จรูป 3-in-1 เบนเนตต์',
    price: 110,
    category: 'เครื่องดื่ม',
    stock: 2,
    minStock: 5,
    description: 'กาแฟปรุงสำเร็จสัญชาติอิตาลี หอม กลมกล่อม เข้มเต็มรสกาแฟแท้',
  },
  {
    id: 'prod_7',
    name: 'น้ำตาลทรายขาว มิตรผล (1 กก.)',
    price: 28,
    category: 'เครื่องปรุง/น้ำมัน',
    stock: 20,
    minStock: 5,
    description: 'น้ำตาลทรายบริสุทธิ์เกรดพรีเมียม สะอาด ละลายง่าย ไม่มีสารฟอกสี',
  },
  {
    id: 'prod_8',
    name: 'ยาบำรุงผม แพนทีน แชมพู (380 มล.)',
    price: 145,
    promoPrice: 125,
    category: 'ของใช้ส่วนประกอบ/ส่วนตัว',
    stock: 18,
    minStock: 4,
    description: 'แชมพูสูตรฟื้นบำรุงผมแห้งเสีย ให้ผมนุ่มลื่น มีน้ำหนัก สุขภาพดี',
  },
  {
    id: 'prod_9',
    name: 'สบู่อนามัย เดทตอล สูตรออริจินัล',
    price: 24,
    category: 'ของใช้ส่วนประกอบ/ส่วนตัว',
    stock: 22,
    minStock: 6,
    description: 'ช่วยปกป้องผิวจากแบคทีเรียได้อย่างมีประสิทธิภาพ สะอาด มั่นใจทุกวัน',
  },
  {
    id: 'prod_10',
    name: 'น้ำยาล้างจาน ตราซันไลต์ ถุงเติม (500 มล.)',
    price: 18,
    category: 'น้ำยา/ของใช้ในบ้าน',
    stock: 14,
    minStock: 4,
    description: 'ล้างคราบมัน คราบอาหาร ได้อย่างหมดจด ด้วยพลังเลมอนแท้',
  }
];

// Helper to read JSON DB
function readDb(file: string, fallback: any) {
  try {
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, JSON.stringify(fallback, null, 2));
      return fallback;
    }
    const data = fs.readFileSync(file, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error(`Error reading ${file}:`, err);
    return fallback;
  }
}

// Helper to write JSON DB
function writeDb(file: string, data: any) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error(`Error writing ${file}:`, err);
  }
}

// Initialize database data
let products = readDb(PRODUCTS_FILE, initialProducts);
let sales = readDb(SALES_FILE, []);
let alerts = readDb(ALERTS_FILE, []);
let pendingCheckouts = readDb(PENDING_CHECKOUTS_FILE, []);

// Initial generation of low stock alerts if products are already low
function checkLowStockAlerts() {
  const currentProducts = readDb(PRODUCTS_FILE, products);
  const currentAlerts = readDb(ALERTS_FILE, alerts);
  let changed = false;

  currentProducts.forEach((p: any) => {
    if (p.stock <= p.minStock) {
      const exists = currentAlerts.find((a: any) => a.productId === p.id && !a.resolved);
      if (!exists) {
        currentAlerts.push({
          id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          productId: p.id,
          productName: p.name,
          currentStock: p.stock,
          minStock: p.minStock,
          timestamp: new Date().toISOString(),
          resolved: false,
        });
        changed = true;
      }
    }
  });

  if (changed) {
    writeDb(ALERTS_FILE, currentAlerts);
    alerts = currentAlerts;
  }
}
checkLowStockAlerts();

// --- REST API ROUTES ---

// 1. PRODUCTS
app.get('/api/products', (req, res) => {
  products = readDb(PRODUCTS_FILE, initialProducts);
  res.json(products);
});

// Lightweight endpoint the admin login form calls to verify a password without
// performing a mutation. Also gated by requireAdmin, so a right response means
// the supplied x-admin-password header is correct.
app.post('/api/admin/verify', requireAdmin, (req, res) => {
  res.json({ success: true });
});

app.post('/api/products', requireAdmin, (req, res) => {
  const { id, name, price, promoPrice, category, stock, minStock, description } = req.body;
  
  if (!name || isNaN(Number(price)) || isNaN(Number(stock)) || isNaN(Number(minStock))) {
    return res.status(400).json({ error: 'Invalid product details provided.' });
  }

  products = readDb(PRODUCTS_FILE, initialProducts);
  const targetId = id || `prod_${Date.now()}`;
  const existIdx = products.findIndex((p: any) => p.id === targetId);

  const productData = {
    id: targetId,
    name,
    price: Number(price),
    promoPrice: promoPrice ? Number(promoPrice) : undefined,
    category: category || 'ทั่วไป',
    stock: Number(stock),
    minStock: Number(minStock),
    description: description || '',
  };

  if (existIdx >= 0) {
    products[existIdx] = productData;
  } else {
    products.push(productData);
  }

  writeDb(PRODUCTS_FILE, products);
  checkLowStockAlerts(); // Check stock limits instantly
  res.json({ success: true, product: productData });
});

app.delete('/api/products/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  products = readDb(PRODUCTS_FILE, initialProducts);
  const updatedProducts = products.filter((p: any) => p.id !== id);
  writeDb(PRODUCTS_FILE, updatedProducts);
  products = updatedProducts;
  res.json({ success: true });
});

// 2. SALES
app.get('/api/sales', (req, res) => {
  sales = readDb(SALES_FILE, []);
  res.json(sales);
});

// 3. CHECKOUT (Handles QR Payment and registers sales)
//
// Cash and QR/PromptPay are handled differently on purpose: cash is paid at the
// counter the instant checkout is triggered, so it's safe to deduct stock and
// log the sale right away. QR payment is NOT confirmed yet at this point — the
// customer has only just been shown the QR code — so stock is left untouched
// and the order is held as "pending" until /api/checkout/confirm is called.
// (Previously this endpoint deducted stock and logged the sale for both
// payment methods immediately, so a customer who opened the QR modal and never
// actually paid still left behind a "completed" sale and reduced stock.)
app.post('/api/checkout', (req, res) => {
  const { items, paymentMethod } = req.body; // Array of { productId, quantity }

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Cart must not be empty.' });
  }

  products = readDb(PRODUCTS_FILE, initialProducts);

  let total = 0;
  const itemsSold = [];
  const stockShortages = [];

  // Verify stock levels first to prevent negative stock
  for (const item of items) {
    const prod = products.find((p: any) => p.id === item.productId);
    if (!prod) {
      return res.status(404).json({ error: `ไม่พบสินค้า ID: ${item.productId}` });
    }
    if (prod.stock < item.quantity) {
      stockShortages.push({ name: prod.name, requested: item.quantity, available: prod.stock });
    }
  }

  if (stockShortages.length > 0) {
    return res.status(400).json({
      error: 'บางสินค้ามีสต็อกไม่เพียงพอสําหรับการสั่งซื้อ',
      details: stockShortages
    });
  }

  // Price the order (use promo price if available). Stock is not touched here.
  for (const item of items) {
    const prod = products.find((p: any) => p.id === item.productId)!;
    const actualPrice = prod.promoPrice !== undefined ? prod.promoPrice : prod.price;
    const lineTotal = actualPrice * item.quantity;
    total += lineTotal;

    itemsSold.push({
      productId: prod.id,
      name: prod.name,
      quantity: item.quantity,
      price: actualPrice,
    });
  }

  const method = paymentMethod || 'promptpay';

  if (method === 'cash') {
    // Cash is paid immediately at the counter: commit right away.
    products = readDb(PRODUCTS_FILE, initialProducts);
    for (const item of items) {
      const prod = products.find((p: any) => p.id === item.productId)!;
      prod.stock -= item.quantity;
    }
    writeDb(PRODUCTS_FILE, products);
    checkLowStockAlerts();

    sales = readDb(SALES_FILE, []);
    const newSale = {
      id: `sale_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      timestamp: new Date().toISOString(),
      items: itemsSold,
      total,
      paymentMethod: method,
    };
    sales.push(newSale);
    writeDb(SALES_FILE, sales);

    return res.json({ success: true, sale: newSale, pending: false });
  }

  // QR / PromptPay: hold the order as pending. Stock is reserved conceptually
  // (we already checked availability above) but not deducted, and no sale is
  // recorded, until the customer confirms payment via /api/checkout/confirm.
  pendingCheckouts = readDb(PENDING_CHECKOUTS_FILE, []);
  const pendingCheckout = {
    id: `pending_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    timestamp: new Date().toISOString(),
    items: itemsSold,
    total,
    paymentMethod: method,
  };
  pendingCheckouts.push(pendingCheckout);
  writeDb(PENDING_CHECKOUTS_FILE, pendingCheckouts);

  res.json({ success: true, sale: pendingCheckout, pending: true });
});

// 3b. CONFIRM a pending QR/PromptPay checkout — actually deducts stock and
// records the sale. Called once the customer confirms they've paid.
app.post('/api/checkout/confirm', (req, res) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ error: 'Missing checkout id.' });
  }

  pendingCheckouts = readDb(PENDING_CHECKOUTS_FILE, []);
  const idx = pendingCheckouts.findIndex((c: any) => c.id === id);
  if (idx < 0) {
    return res.status(404).json({ error: 'ไม่พบรายการที่รอชำระเงินนี้ อาจถูกยกเลิกหรือหมดอายุไปแล้ว กรุณาทำรายการใหม่' });
  }
  const pending = pendingCheckouts[idx];

  // Re-check stock now, in case it changed while the customer was looking at
  // the QR code (e.g. another customer bought the last unit in the meantime).
  products = readDb(PRODUCTS_FILE, initialProducts);
  const stockShortages: any[] = [];
  for (const item of pending.items) {
    const prod = products.find((p: any) => p.id === item.productId);
    if (!prod || prod.stock < item.quantity) {
      stockShortages.push({ name: item.name, requested: item.quantity, available: prod ? prod.stock : 0 });
    }
  }
  if (stockShortages.length > 0) {
    pendingCheckouts.splice(idx, 1);
    writeDb(PENDING_CHECKOUTS_FILE, pendingCheckouts);
    return res.status(400).json({
      error: 'สต็อกสินค้าเปลี่ยนแปลงระหว่างรอชำระเงิน กรุณาทำรายการใหม่',
      details: stockShortages,
    });
  }

  for (const item of pending.items) {
    const prod = products.find((p: any) => p.id === item.productId)!;
    prod.stock -= item.quantity;
  }
  writeDb(PRODUCTS_FILE, products);
  checkLowStockAlerts();

  sales = readDb(SALES_FILE, []);
  const newSale = {
    id: `sale_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    timestamp: new Date().toISOString(),
    items: pending.items,
    total: pending.total,
    paymentMethod: pending.paymentMethod,
  };
  sales.push(newSale);
  writeDb(SALES_FILE, sales);

  pendingCheckouts.splice(idx, 1);
  writeDb(PENDING_CHECKOUTS_FILE, pendingCheckouts);

  res.json({ success: true, sale: newSale });
});

// 3c. CANCEL a pending QR/PromptPay checkout (e.g. the customer closed the
// modal without paying). Stock was never deducted for a pending checkout, so
// this just cleans up the pending record.
app.post('/api/checkout/cancel', (req, res) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ error: 'Missing checkout id.' });
  }
  pendingCheckouts = readDb(PENDING_CHECKOUTS_FILE, []);
  pendingCheckouts = pendingCheckouts.filter((c: any) => c.id !== id);
  writeDb(PENDING_CHECKOUTS_FILE, pendingCheckouts);
  res.json({ success: true });
});

// 4. ALERTS
app.get('/api/alerts', (req, res) => {
  alerts = readDb(ALERTS_FILE, []);
  res.json(alerts);
});

app.post('/api/alerts/resolve', requireAdmin, (req, res) => {
  const { id } = req.body;
  alerts = readDb(ALERTS_FILE, []);
  const alertIndex = alerts.findIndex((a: any) => a.id === id);
  if (alertIndex >= 0) {
    alerts[alertIndex].resolved = true;
    writeDb(ALERTS_FILE, alerts);
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
    products = readDb(PRODUCTS_FILE, initialProducts);

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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`grocery-server: Grocery AI Backend running on port ${PORT}`);
  });
}

startServer();
