export interface Product {
  id: string;
  name: string;
  price: number;
  promoPrice?: number;
  category: string;
  stock: number;
  minStock: number;
  description?: string;
  image?: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface SalesLog {
  id: string;
  timestamp: string; // ISO string
  items: {
    productId: string;
    name: string;
    quantity: number;
    price: number;
  }[];
  total: number;
  paymentMethod: 'promptpay' | 'cash';
}

export interface StockAlert {
  id: string;
  productId: string;
  productName: string;
  currentStock: number;
  minStock: number;
  timestamp: string;
  resolved: boolean;
}

export interface Message {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  timestamp: string;
  type?: 'text' | 'receipt' | 'promo' | 'stock';
  receiptData?: {
    items: { name: string; qty: number; price: number }[];
    total: number;
    qrData?: string;
  };
  promoData?: {
    name: string;
    originalPrice: number;
    promoPrice: number;
    description: string;
  }[];
}
