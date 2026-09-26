// Sales, receipts and document numbers. Callers handle stock; this module records the sale.
import { effectivePrice, round2, vatFromInclusive } from '@shared/money';
import type { LineItem, Sale } from '@shared/types';
import type { Queryable } from '../../db/db';
import { badRequest } from '../../lib/errors';
import { bangkokDate, toIso } from '../../lib/time';
import { getSettings } from '../settings/service';

/** Next running number for today (Bangkok), e.g. R260926-0001. Must run inside a transaction. */
export async function nextDocNo(tx: Queryable, prefix: 'R' | 'W'): Promise<string> {
  const day = bangkokDate();
  const updated = await tx.query<{ LastNo: number }>(
    'UPDATE dbo.DocumentCounters WITH (UPDLOCK, HOLDLOCK) SET LastNo = LastNo + 1 OUTPUT inserted.LastNo WHERE Prefix = ? AND Day = ?',
    [prefix, day]
  );
  let no = updated[0]?.LastNo;
  if (no === undefined) {
    await tx.run('INSERT INTO dbo.DocumentCounters (Prefix, Day, LastNo) VALUES (?, ?, 1)', [prefix, day]);
    no = 1;
  }
  return `${prefix}${day.slice(2).replace(/-/g, '')}-${String(no).padStart(4, '0')}`;
}

/** Looks up current prices for a cart (merging repeated products). Inactive or unknown products are rejected. */
export async function priceItems(tx: Queryable, items: { productId: number; quantity: number }[]): Promise<LineItem[]> {
  const merged = new Map<number, number>();
  for (const i of items) merged.set(i.productId, (merged.get(i.productId) ?? 0) + i.quantity);

  const lines: LineItem[] = [];
  for (const [productId, quantity] of merged) {
    const p = await tx.queryOne('SELECT Id, Name, Price, PromoPrice, IsActive FROM dbo.Products WHERE Id = ?', [productId]);
    if (!p || !p.IsActive) throw badRequest(`ไม่พบสินค้ารหัส ${productId} หรือสินค้าเลิกขายแล้ว`);
    const unitPrice = effectivePrice({ price: Number(p.Price), promoPrice: p.PromoPrice === null ? null : Number(p.PromoPrice) });
    lines.push({ productId, name: p.Name, quantity, unitPrice, lineTotal: round2(unitPrice * quantity) });
  }
  return lines;
}

export const linesTotal = (lines: LineItem[]) => round2(lines.reduce((sum, l) => sum + l.lineTotal, 0));

export async function recordSale(
  tx: Queryable,
  sale: {
    channel: 'pos' | 'online';
    orderId?: number | null;
    paymentMethod: 'cash' | 'promptpay';
    lines: LineItem[];
    cashReceived?: number | null;
    cashierId: number | null;
  }
): Promise<{ id: number; receiptNo: string }> {
  const settings = await getSettings(tx);
  const total = linesTotal(sale.lines);
  const vatAmount = vatFromInclusive(total, settings.vatRate);
  let change: number | null = null;
  if (sale.paymentMethod === 'cash') {
    const received = sale.cashReceived ?? total;
    if (received < total) throw badRequest(`รับเงินไม่พอ ยอดที่ต้องชำระ ${total.toFixed(2)} บาท`, { cashReceived: 'รับเงินไม่พอ' });
    change = round2(received - total);
  }

  const receiptNo = await nextDocNo(tx, 'R');
  const row = await tx.queryOne<{ Id: number }>(
    `INSERT INTO dbo.Sales (ReceiptNo, Channel, OrderId, PaymentMethod, Subtotal, VatRate, VatAmount, Total, CashReceived, Change, CashierId)
     OUTPUT inserted.Id VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      receiptNo,
      sale.channel,
      sale.orderId ?? null,
      sale.paymentMethod,
      round2(total - vatAmount),
      settings.vatRate,
      vatAmount,
      total,
      sale.paymentMethod === 'cash' ? sale.cashReceived ?? total : null,
      change,
      sale.cashierId,
    ]
  );
  let n = 0;
  for (const l of sale.lines) {
    await tx.run('INSERT INTO dbo.SaleItems (SaleId, LineNumber, ProductId, Name, Quantity, UnitPrice) VALUES (?, ?, ?, ?, ?, ?)', [
      row!.Id,
      ++n,
      l.productId,
      l.name,
      l.quantity,
      l.unitPrice,
    ]);
  }
  return { id: row!.Id, receiptNo };
}

const SALE_SELECT = `SELECT s.*, u.DisplayName AS CashierName, o.OrderNo FROM dbo.Sales s
  LEFT JOIN dbo.Users u ON u.Id = s.CashierId LEFT JOIN dbo.Orders o ON o.Id = s.OrderId`;

export async function loadSales(db: Queryable, where: string, params: unknown[], suffix = ''): Promise<Sale[]> {
  const rows = await db.query(`${SALE_SELECT} ${where} ${suffix}`, params);
  if (rows.length === 0) return [];
  const ids = rows.map((r) => Number(r.Id));
  const items = await db.query(
    `SELECT SaleId, ProductId, Name, Quantity, UnitPrice FROM dbo.SaleItems WHERE SaleId IN (${ids.map(() => '?').join(',')}) ORDER BY SaleId, LineNumber`,
    ids
  );
  const bySale = new Map<number, LineItem[]>();
  for (const i of items) {
    const list = bySale.get(i.SaleId) ?? [];
    const unitPrice = Number(i.UnitPrice);
    list.push({ productId: i.ProductId, name: i.Name, quantity: i.Quantity, unitPrice, lineTotal: round2(unitPrice * i.Quantity) });
    bySale.set(i.SaleId, list);
  }
  return rows.map((r) => ({
    id: r.Id,
    receiptNo: r.ReceiptNo,
    channel: r.Channel,
    orderNo: r.OrderNo ?? null,
    paymentMethod: r.PaymentMethod,
    subtotal: Number(r.Subtotal),
    vatAmount: Number(r.VatAmount),
    total: Number(r.Total),
    cashReceived: r.CashReceived === null ? null : Number(r.CashReceived),
    change: r.Change === null ? null : Number(r.Change),
    cashierName: r.CashierName ?? null,
    createdAt: toIso(r.CreatedAt),
    items: bySale.get(r.Id) ?? [],
  }));
}

export async function getSaleByReceipt(db: Queryable, receiptNo: string): Promise<Sale | undefined> {
  return (await loadSales(db, 'WHERE s.ReceiptNo = ?', [receiptNo]))[0];
}
