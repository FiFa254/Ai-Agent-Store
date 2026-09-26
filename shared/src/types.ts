// Response shapes returned by the API.
import type { Role, Settings } from './schemas';

export interface ApiError {
  error: string;
  code?: string;
  fields?: Record<string, string>;
}

export interface SessionUser {
  id: number;
  username: string;
  displayName: string;
  role: Role;
}

export interface UserRow extends SessionUser {
  isActive: boolean;
  lastLoginAt: string | null;
  lockedUntil: string | null;
  createdAt: string;
}

export interface Category {
  id: number;
  name: string;
  sortOrder: number;
  productCount: number;
}

export interface Product {
  id: number;
  sku: string;
  barcode: string;
  name: string;
  description: string;
  categoryId: number;
  categoryName: string;
  price: number;
  promoPrice: number | null;
  stock: number;
  minStock: number;
  isActive: boolean;
}

/** Public catalog entry: no cost/stock numbers beyond availability. */
export interface CatalogProduct {
  id: number;
  name: string;
  description: string;
  categoryId: number;
  categoryName: string;
  price: number;
  promoPrice: number | null;
  available: number;
}

export interface StockMovement {
  id: number;
  productId: number;
  productName: string;
  change: number;
  stockAfter: number;
  reason: 'sale' | 'order' | 'order-cancel' | 'restock' | 'adjustment' | 'initial';
  refNo: string | null;
  note: string;
  userName: string | null;
  createdAt: string;
}

export interface LineItem {
  productId: number;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface Sale {
  id: number;
  receiptNo: string;
  channel: 'pos' | 'online';
  orderNo: string | null;
  paymentMethod: 'cash' | 'promptpay';
  subtotal: number;
  vatAmount: number;
  total: number;
  cashReceived: number | null;
  change: number | null;
  cashierName: string | null;
  createdAt: string;
  items: LineItem[];
}

export type OrderStatus = 'awaiting_payment' | 'paid' | 'cancelled' | 'expired';

export interface Order {
  id: number;
  orderNo: string;
  customerName: string;
  customerPhone: string;
  note: string;
  status: OrderStatus;
  total: number;
  createdAt: string;
  expiresAt: string;
  paidAt: string | null;
  receiptNo: string | null;
  items: LineItem[];
}

/** What the customer sees for their order (plus the QR while unpaid). */
export interface PublicOrder extends Omit<Order, 'customerPhone' | 'note'> {
  promptPayQrSvg: string | null;
  storeName: string;
}

export interface PublicSettings {
  storeName: string;
  storeAddress: string;
  storePhone: string;
  promptPayEnabled: boolean;
  vatRate: number;
  aiEnabled: boolean;
}

export type { Settings };

export interface SetupStatus {
  needsSetup: boolean;
}

export interface DashboardSummary {
  today: { sales: number; bills: number; items: number };
  awaitingOrders: number;
  lowStock: Product[];
  recentSales: Sale[];
}

export interface SalesReport {
  from: string;
  to: string;
  totals: { sales: number; bills: number; items: number; vat: number; averageBill: number };
  byDay: { date: string; sales: number; bills: number }[];
  byMethod: { method: string; sales: number; bills: number }[];
  byChannel: { channel: string; sales: number; bills: number }[];
  topProducts: { productId: number; name: string; quantity: number; sales: number }[];
  byCategory: { category: string; sales: number }[];
}

export interface AuditEntry {
  id: number;
  userName: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  details: string | null;
  ip: string | null;
  createdAt: string;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ChatReply {
  reply: string;
  detectedCartItems: { productId: number; quantity: number }[];
  recommendedProductIds: number[];
  offline: boolean;
}
