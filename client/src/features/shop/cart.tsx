// Storefront cart, kept in localStorage so it survives reloads. Prices are re-checked by the server on order.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { effectivePrice, round2 } from '@shared/money';
import type { CatalogProduct } from '@shared/types';

export interface CartLine {
  productId: number;
  quantity: number;
}

interface CartApi {
  lines: CartLine[];
  count: number;
  add: (productId: number, quantity?: number, max?: number) => void;
  setQuantity: (productId: number, quantity: number) => void;
  remove: (productId: number) => void;
  clear: () => void;
  total: (products: CatalogProduct[]) => number;
}

const KEY = 'grocerai_cart_v2';
const CartContext = createContext<CartApi | null>(null);

function load(): CartLine[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((l) => Number.isInteger(l.productId) && Number.isInteger(l.quantity) && l.quantity > 0) : [];
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>(load);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(lines));
    } catch {
      /* storage unavailable: cart stays in memory */
    }
  }, [lines]);

  const add = useCallback((productId: number, quantity = 1, max = 999) => {
    setLines((current) => {
      const existing = current.find((l) => l.productId === productId);
      const next = Math.min(max, (existing?.quantity ?? 0) + quantity);
      if (next <= 0) return current;
      return existing ? current.map((l) => (l.productId === productId ? { ...l, quantity: next } : l)) : [...current, { productId, quantity: next }];
    });
  }, []);

  const setQuantity = useCallback((productId: number, quantity: number) => {
    setLines((current) => (quantity <= 0 ? current.filter((l) => l.productId !== productId) : current.map((l) => (l.productId === productId ? { ...l, quantity } : l))));
  }, []);

  const value = useMemo<CartApi>(
    () => ({
      lines,
      count: lines.reduce((n, l) => n + l.quantity, 0),
      add,
      setQuantity,
      remove: (productId) => setLines((c) => c.filter((l) => l.productId !== productId)),
      clear: () => setLines([]),
      total: (products) =>
        round2(
          lines.reduce((sum, l) => {
            const p = products.find((x) => x.id === l.productId);
            return p ? sum + effectivePrice(p) * l.quantity : sum;
          }, 0)
        ),
    }),
    [lines, add, setQuantity]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart outside CartProvider');
  return ctx;
}
