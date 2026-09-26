// Request schemas shared by the server (validation) and the client (form typing).
// Keep messages in Thai: they are shown to users as-is.
import { z } from 'zod';

export const ROLES = ['admin', 'manager', 'cashier'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'ผู้ดูแลระบบ',
  manager: 'ผู้จัดการร้าน',
  cashier: 'แคชเชียร์',
};

const money = z.coerce.number().min(0, 'ต้องไม่ติดลบ').max(9_999_999, 'จำนวนเงินสูงเกินไป');
const qty = z.coerce.number().int('ต้องเป็นจำนวนเต็ม').min(1, 'อย่างน้อย 1').max(999, 'ไม่เกิน 999');

export const passwordSchema = z
  .string()
  .min(8, 'รหัสผ่านอย่างน้อย 8 ตัวอักษร')
  .max(128, 'รหัสผ่านยาวเกินไป')
  .regex(/[A-Za-z]/, 'ต้องมีตัวอักษรภาษาอังกฤษ')
  .regex(/\d/, 'ต้องมีตัวเลข');

export const usernameSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_.]{3,50}$/, 'ชื่อผู้ใช้ 3-50 ตัว ใช้ได้ a-z, 0-9, _ และ .');

export const loginSchema = z.object({
  username: z.string().trim().min(1, 'กรุณากรอกชื่อผู้ใช้'),
  password: z.string().min(1, 'กรุณากรอกรหัสผ่าน'),
});

export const setupSchema = z.object({
  username: usernameSchema,
  displayName: z.string().trim().min(1, 'กรุณากรอกชื่อที่แสดง').max(100),
  password: passwordSchema,
  storeName: z.string().trim().min(1, 'กรุณากรอกชื่อร้าน').max(100),
});

export const createUserSchema = z.object({
  username: usernameSchema,
  displayName: z.string().trim().min(1, 'กรุณากรอกชื่อที่แสดง').max(100),
  password: passwordSchema,
  role: z.enum(ROLES),
});

export const updateUserSchema = z.object({
  displayName: z.string().trim().min(1).max(100).optional(),
  role: z.enum(ROLES).optional(),
  isActive: z.boolean().optional(),
  password: passwordSchema.optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'กรุณากรอกรหัสผ่านปัจจุบัน'),
  newPassword: passwordSchema,
});

export const settingsSchema = z.object({
  storeName: z.string().trim().min(1, 'กรุณากรอกชื่อร้าน').max(100),
  storeAddress: z.string().trim().max(300).default(''),
  storePhone: z.string().trim().max(30).default(''),
  taxId: z.string().trim().max(20).default(''),
  promptPayId: z
    .string()
    .trim()
    .max(20)
    .refine((v) => v === '' || /^(\d{10}|\d{13}|\d{15})$/.test(v.replace(/-/g, '')), 'PromptPay ต้องเป็นเบอร์มือถือ 10 หลัก หรือเลขผู้เสียภาษี 13 หลัก')
    .default(''),
  vatRate: z.coerce.number().min(0).max(30).default(7),
  receiptFooter: z.string().trim().max(300).default(''),
  orderExpiryMinutes: z.coerce.number().int().min(5).max(24 * 60).default(30),
});
export type Settings = z.infer<typeof settingsSchema>;

export const categorySchema = z.object({
  name: z.string().trim().min(1, 'กรุณากรอกชื่อหมวดหมู่').max(100),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
});

export const productSchema = z
  .object({
    sku: z.string().trim().regex(/^[A-Za-z0-9-_]{1,40}$/, 'รหัสสินค้า 1-40 ตัว ใช้ได้ a-z, 0-9, - และ _'),
    barcode: z.string().trim().max(40).default(''),
    name: z.string().trim().min(1, 'กรุณากรอกชื่อสินค้า').max(200),
    description: z.string().trim().max(1000).default(''),
    categoryId: z.coerce.number().int().positive('กรุณาเลือกหมวดหมู่'),
    price: money,
    promoPrice: money.nullable().default(null),
    minStock: z.coerce.number().int().min(0).max(99999).default(5),
    isActive: z.boolean().default(true),
  })
  .refine((p) => p.promoPrice === null || p.promoPrice < p.price, {
    message: 'ราคาโปรโมชันต้องต่ำกว่าราคาปกติ',
    path: ['promoPrice'],
  });
export type ProductInput = z.infer<typeof productSchema>;

export const stockChangeSchema = z.object({
  productId: z.coerce.number().int().positive(),
  change: z.coerce.number().int().refine((n) => n !== 0, 'จำนวนต้องไม่เป็น 0').refine((n) => Math.abs(n) <= 99999, 'จำนวนมากเกินไป'),
  reason: z.enum(['restock', 'adjustment']),
  note: z.string().trim().max(300).default(''),
});

export const cartItemSchema = z.object({
  productId: z.coerce.number().int().positive(),
  quantity: qty,
});

export const posSaleSchema = z
  .object({
    items: z.array(cartItemSchema).min(1, 'ยังไม่มีสินค้าในรายการ').max(100),
    paymentMethod: z.enum(['cash', 'promptpay']),
    cashReceived: money.optional(),
  })
  .refine((s) => s.paymentMethod !== 'cash' || s.cashReceived !== undefined, {
    message: 'กรุณากรอกจำนวนเงินที่รับมา',
    path: ['cashReceived'],
  });

export const createOrderSchema = z.object({
  customerName: z.string().trim().min(1, 'กรุณากรอกชื่อ').max(100),
  customerPhone: z.string().trim().regex(/^0\d{8,9}$/, 'เบอร์โทรไม่ถูกต้อง'),
  note: z.string().trim().max(300).default(''),
  items: z.array(cartItemSchema).min(1, 'ตะกร้าว่าง').max(50),
});

export const chatSchema = z.object({
  message: z.string().trim().min(1).max(1000),
  history: z
    .array(z.object({ role: z.enum(['user', 'model']), text: z.string().max(4000) }))
    .max(20)
    .default([]),
});

export const dateRangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const pageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  q: z.string().trim().max(100).default(''),
});
