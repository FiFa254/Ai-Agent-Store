// POS checkout and receipt lookup (all staff roles).
import { Router } from 'express';
import { z } from 'zod';
import { pageSchema, posSaleSchema } from '@shared/schemas';
import type { Paged, Sale } from '@shared/types';
import type { Deps } from '../../app';
import { audit, auditContext } from '../../lib/audit';
import { badRequest, notFound } from '../../lib/errors';
import { promptPayQrSvg } from '../../lib/promptpay';
import { getSettings } from '../settings/service';
import { addDays, bangkokDayStartUtc } from '../../lib/time';
import { requireRole } from '../../middleware/auth';
import { handle, parse } from '../../middleware/http';
import { applyStockChange, stockConflict } from '../inventory/service';
import { getSaleByReceipt, loadSales, priceItems, recordSale } from './service';

export function salesRoutes({ db }: Deps): Router {
  const router = Router();
  router.use(requireRole('cashier', 'manager'));

  // Counter sale: prices from the database, stock deducted, sale recorded — all in one transaction.
  router.post(
    '/pos',
    handle(async (req, res) => {
      const input = parse(posSaleSchema, req.body);
      const receiptNo = await db
        .transaction(async (tx) => {
          const lines = await priceItems(tx, input.items);
          const sale = await recordSale(tx, {
            channel: 'pos',
            paymentMethod: input.paymentMethod,
            lines,
            cashReceived: input.cashReceived,
            cashierId: req.user!.id,
          });
          for (const l of lines) {
            await applyStockChange(tx, { productId: l.productId, change: -l.quantity, reason: 'sale', refNo: sale.receiptNo, userId: req.user!.id });
          }
          await audit(tx, auditContext(req), 'sale', 'sale', sale.receiptNo, { method: input.paymentMethod, items: lines.length });
          return sale.receiptNo;
        })
        .catch(stockConflict);
      res.status(201).json(await getSaleByReceipt(db, receiptNo));
    })
  );

  router.get(
    '/',
    handle(async (req, res) => {
      const f = parse(
        pageSchema.extend({
          from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
          to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        }),
        req.query
      );
      const where: string[] = [];
      const params: unknown[] = [];
      if (f.from) {
        where.push('s.CreatedAt >= ?');
        params.push(bangkokDayStartUtc(f.from));
      }
      if (f.to) {
        where.push('s.CreatedAt < ?');
        params.push(bangkokDayStartUtc(addDays(f.to, 1)));
      }
      if (f.q) {
        where.push('(s.ReceiptNo LIKE ? OR o.OrderNo LIKE ?)');
        params.push(`%${f.q}%`, `%${f.q}%`);
      }
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const total = (await db.queryOne<{ n: number }>(
        `SELECT COUNT(*) AS n FROM dbo.Sales s LEFT JOIN dbo.Orders o ON o.Id = s.OrderId ${whereSql}`,
        params
      ))!.n;
      const items = await loadSales(db, whereSql, [...params, (f.page - 1) * f.pageSize, f.pageSize], 'ORDER BY s.Id DESC OFFSET ? ROWS FETCH NEXT ? ROWS ONLY');
      const body: Paged<Sale> = { items, total, page: f.page, pageSize: f.pageSize };
      res.json(body);
    })
  );

  // QR for a counter sale paid by PromptPay (shown to the customer before the cashier confirms).
  router.get(
    '/promptpay-qr',
    handle(async (req, res) => {
      const amount = parse(z.coerce.number().positive().max(9_999_999), req.query.amount);
      const settings = await getSettings(db);
      if (!settings.promptPayId) throw badRequest('ยังไม่ได้ตั้งค่าหมายเลข PromptPay ของร้าน (หน้า ตั้งค่า)');
      res.json({ svg: await promptPayQrSvg(settings.promptPayId, amount), promptPayId: settings.promptPayId });
    })
  );

  router.get(
    '/:receiptNo',
    handle(async (req, res) => {
      const sale = await getSaleByReceipt(db, String(req.params.receiptNo));
      if (!sale) throw notFound('ไม่พบใบเสร็จ');
      res.json(sale);
    })
  );

  return router;
}
