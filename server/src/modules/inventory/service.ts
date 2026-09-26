// All stock changes go through applyStockChange: Products.Stock and the StockMovements ledger
// are updated together, and stock can never go below zero.
import type { Queryable } from '../../db/db';
import { conflict, notFound } from '../../lib/errors';

export type StockReason = 'sale' | 'order' | 'order-cancel' | 'restock' | 'adjustment' | 'initial';

export class InsufficientStock extends Error {
  constructor(readonly productId: number, readonly name: string, readonly available: number, readonly requested: number) {
    super(`สินค้า "${name}" มีไม่พอ (เหลือ ${available} ต้องการ ${requested})`);
  }
}

export async function applyStockChange(
  tx: Queryable,
  change: { productId: number; change: number; reason: StockReason; refNo?: string | null; note?: string; userId?: number | null }
): Promise<number> {
  const rows = await tx.query<{ Stock: number }>(
    'UPDATE dbo.Products SET Stock = Stock + ?, UpdatedAt = SYSUTCDATETIME() OUTPUT inserted.Stock WHERE Id = ? AND Stock + ? >= 0',
    [change.change, change.productId, change.change]
  );
  if (rows.length === 0) {
    const p = await tx.queryOne('SELECT Name, Stock FROM dbo.Products WHERE Id = ?', [change.productId]);
    if (!p) throw notFound('ไม่พบสินค้า');
    throw new InsufficientStock(change.productId, p.Name, p.Stock, -change.change);
  }
  const stockAfter = rows[0].Stock;
  await tx.run(
    'INSERT INTO dbo.StockMovements (ProductId, Change, StockAfter, Reason, RefNo, Note, UserId) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [change.productId, change.change, stockAfter, change.reason, change.refNo ?? null, change.note ?? '', change.userId ?? null]
  );
  return stockAfter;
}

/** Converts InsufficientStock into a 409 the client can show. */
export function stockConflict(err: unknown): never {
  if (err instanceof InsufficientStock) throw conflict(err.message, 'insufficient_stock');
  throw err;
}
