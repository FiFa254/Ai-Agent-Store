// Online orders: stock is reserved when the order is placed, returned when it is cancelled or expires,
// and a sale (receipt) is recorded when staff confirm the payment.
import crypto from 'node:crypto';
import type { Order, OrderStatus } from '@shared/types';
import { round2 } from '@shared/money';
import type { Db, Queryable } from '../../db/db';
import { audit, type AuditContext } from '../../lib/audit';
import { conflict, notFound } from '../../lib/errors';
import { toIso, toIsoOrNull } from '../../lib/time';
import { applyStockChange } from '../inventory/service';
import { linesTotal, nextDocNo, priceItems, recordSale } from '../sales/service';
import { getSettings } from '../settings/service';

export async function createOrder(
  db: Db,
  ctx: AuditContext,
  input: { customerName: string; customerPhone: string; note: string; items: { productId: number; quantity: number }[] }
): Promise<{ orderNo: string; accessKey: string }> {
  return db.transaction(async (tx) => {
    const settings = await getSettings(tx);
    const lines = await priceItems(tx, input.items);
    const orderNo = await nextDocNo(tx, 'W');
    const accessKey = crypto.randomBytes(16).toString('hex');
    const order = await tx.queryOne<{ Id: number }>(
      `INSERT INTO dbo.Orders (OrderNo, AccessKey, CustomerName, CustomerPhone, Note, Status, Total, ExpiresAt)
       OUTPUT inserted.Id VALUES (?, ?, ?, ?, ?, N'awaiting_payment', ?, DATEADD(MINUTE, ?, SYSUTCDATETIME()))`,
      [orderNo, accessKey, input.customerName, input.customerPhone, input.note, linesTotal(lines), settings.orderExpiryMinutes]
    );
    let n = 0;
    for (const l of lines) {
      await tx.run('INSERT INTO dbo.OrderItems (OrderId, LineNumber, ProductId, Name, Quantity, UnitPrice) VALUES (?, ?, ?, ?, ?, ?)', [
        order!.Id,
        ++n,
        l.productId,
        l.name,
        l.quantity,
        l.unitPrice,
      ]);
      await applyStockChange(tx, { productId: l.productId, change: -l.quantity, reason: 'order', refNo: orderNo });
    }
    await audit(tx, ctx, 'create', 'order', orderNo, { total: linesTotal(lines), items: lines.length });
    return { orderNo, accessKey };
  });
}

async function lockOrder(tx: Queryable, orderNo: string) {
  const order = await tx.queryOne('SELECT * FROM dbo.Orders WITH (UPDLOCK, ROWLOCK) WHERE OrderNo = ?', [orderNo]);
  if (!order) throw notFound('ไม่พบคำสั่งซื้อ');
  return order;
}

/** Staff confirmed the money arrived: record the sale (stock was already reserved). */
export async function confirmOrder(db: Db, ctx: AuditContext, orderNo: string, paymentMethod: 'cash' | 'promptpay'): Promise<string> {
  return db.transaction(async (tx) => {
    const order = await lockOrder(tx, orderNo);
    if (order.Status !== 'awaiting_payment') throw conflict(`คำสั่งซื้อนี้${statusText(order.Status)}แล้ว`, 'order_closed');
    const items = await tx.query('SELECT ProductId, Name, Quantity, UnitPrice FROM dbo.OrderItems WHERE OrderId = ? ORDER BY LineNumber', [order.Id]);
    const lines = items.map((i) => ({
      productId: i.ProductId,
      name: i.Name,
      quantity: i.Quantity,
      unitPrice: Number(i.UnitPrice),
      lineTotal: round2(Number(i.UnitPrice) * i.Quantity),
    }));
    const sale = await recordSale(tx, { channel: 'online', orderId: order.Id, paymentMethod, lines, cashierId: ctx.userId });
    await tx.run("UPDATE dbo.Orders SET Status = N'paid', PaidAt = SYSUTCDATETIME(), ClosedByUserId = ? WHERE Id = ?", [ctx.userId, order.Id]);
    await audit(tx, ctx, 'confirm_payment', 'order', orderNo, { receiptNo: sale.receiptNo, method: paymentMethod });
    return sale.receiptNo;
  });
}

/** Cancels (or expires) an unpaid order and returns its reserved stock. */
export async function closeUnpaidOrder(db: Db, ctx: AuditContext, orderNo: string, status: 'cancelled' | 'expired'): Promise<void> {
  await db.transaction(async (tx) => {
    const order = await lockOrder(tx, orderNo);
    if (order.Status !== 'awaiting_payment') {
      if (status === 'expired') return;
      throw conflict(`คำสั่งซื้อนี้${statusText(order.Status)}แล้ว`, 'order_closed');
    }
    const items = await tx.query('SELECT ProductId, Quantity FROM dbo.OrderItems WHERE OrderId = ?', [order.Id]);
    for (const i of items) {
      await applyStockChange(tx, { productId: i.ProductId, change: i.Quantity, reason: 'order-cancel', refNo: orderNo, userId: ctx.userId });
    }
    await tx.run('UPDATE dbo.Orders SET Status = ?, ClosedByUserId = ? WHERE Id = ?', [status, ctx.userId, order.Id]);
    await audit(tx, ctx, status === 'expired' ? 'expire' : 'cancel', 'order', orderNo);
  });
}

/** Background job: expire unpaid orders past their deadline. */
export async function expireOrders(db: Db): Promise<number> {
  const due = await db.query<{ OrderNo: string }>(
    "SELECT OrderNo FROM dbo.Orders WHERE Status = N'awaiting_payment' AND ExpiresAt <= SYSUTCDATETIME()"
  );
  for (const o of due) await closeUnpaidOrder(db, { userId: null, ip: null }, o.OrderNo, 'expired');
  return due.length;
}

export async function loadOrders(db: Queryable, where: string, params: unknown[], suffix = ''): Promise<(Order & { accessKey: string })[]> {
  const rows = await db.query(
    `SELECT o.*, s.ReceiptNo FROM dbo.Orders o LEFT JOIN dbo.Sales s ON s.OrderId = o.Id ${where} ${suffix}`,
    params
  );
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.Id);
  const items = await db.query(
    `SELECT OrderId, ProductId, Name, Quantity, UnitPrice FROM dbo.OrderItems WHERE OrderId IN (${ids.map(() => '?').join(',')}) ORDER BY OrderId, LineNumber`,
    ids
  );
  return rows.map((r) => ({
    id: r.Id,
    orderNo: r.OrderNo,
    accessKey: r.AccessKey,
    customerName: r.CustomerName,
    customerPhone: r.CustomerPhone,
    note: r.Note,
    status: r.Status as OrderStatus,
    total: Number(r.Total),
    createdAt: toIso(r.CreatedAt),
    expiresAt: toIso(r.ExpiresAt),
    paidAt: toIsoOrNull(r.PaidAt),
    receiptNo: r.ReceiptNo ?? null,
    items: items
      .filter((i) => i.OrderId === r.Id)
      .map((i) => ({
        productId: i.ProductId,
        name: i.Name,
        quantity: i.Quantity,
        unitPrice: Number(i.UnitPrice),
        lineTotal: round2(Number(i.UnitPrice) * i.Quantity),
      })),
  }));
}

function statusText(status: OrderStatus): string {
  return { awaiting_payment: 'รอชำระเงิน', paid: 'ชำระเงิน', cancelled: 'ถูกยกเลิก', expired: 'หมดเวลาชำระ' }[status];
}
