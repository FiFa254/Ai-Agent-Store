// Dashboard and sales reports (Bangkok days), plus CSV exports that open correctly in Excel.
import { Router, type Response } from 'express';
import { dateRangeSchema } from '@shared/schemas';
import { round2 } from '@shared/money';
import type { DashboardSummary, SalesReport } from '@shared/types';
import type { Deps } from '../../app';
import type { Db } from '../../db/db';
import { audit, auditContext } from '../../lib/audit';
import { badRequest } from '../../lib/errors';
import { addDays, bangkokDate, bangkokDayStartUtc } from '../../lib/time';
import { requireRole } from '../../middleware/auth';
import { handle, parse } from '../../middleware/http';
import { listProducts } from '../catalog/repository';
import { loadSales } from '../sales/service';

/** Converts a SQL Server UTC datetime to a Bangkok date string inside queries. */
const BKK_DATE = (col: string) => `CONVERT(CHAR(10), DATEADD(HOUR, 7, ${col}), 23)`;

function range(query: unknown) {
  const { from, to } = parse(dateRangeSchema, query);
  if (from > to) throw badRequest('วันที่เริ่มต้องไม่เกินวันที่สิ้นสุด');
  if (Date.parse(to) - Date.parse(from) > 366 * 86_400_000) throw badRequest('ช่วงวันที่ยาวเกิน 1 ปี');
  return { from, to, start: bangkokDayStartUtc(from), end: bangkokDayStartUtc(addDays(to, 1)) };
}

export async function salesReport(db: Db, from: string, to: string): Promise<SalesReport> {
  const start = bangkokDayStartUtc(from);
  const end = bangkokDayStartUtc(addDays(to, 1));
  const p = [start, end];
  const [t] = await db.query(
    `SELECT CAST(ISNULL(SUM(s.Total), 0) AS FLOAT) AS sales, COUNT(*) AS bills, CAST(ISNULL(SUM(s.VatAmount), 0) AS FLOAT) AS vat,
       ISNULL((SELECT SUM(i.Quantity) FROM dbo.SaleItems i JOIN dbo.Sales x ON x.Id = i.SaleId WHERE x.CreatedAt >= ? AND x.CreatedAt < ?), 0) AS items
     FROM dbo.Sales s WHERE s.CreatedAt >= ? AND s.CreatedAt < ?`,
    [...p, ...p]
  );
  const byDayRows = await db.query(
    `SELECT ${BKK_DATE('CreatedAt')} AS d, CAST(SUM(Total) AS FLOAT) AS sales, COUNT(*) AS bills
     FROM dbo.Sales WHERE CreatedAt >= ? AND CreatedAt < ? GROUP BY ${BKK_DATE('CreatedAt')}`,
    p
  );
  const byDay: SalesReport['byDay'] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const row = byDayRows.find((r) => r.d === d);
    byDay.push({ date: d, sales: row ? round2(row.sales) : 0, bills: row?.bills ?? 0 });
  }
  const byMethod = await db.query(
    'SELECT PaymentMethod AS method, CAST(SUM(Total) AS FLOAT) AS sales, COUNT(*) AS bills FROM dbo.Sales WHERE CreatedAt >= ? AND CreatedAt < ? GROUP BY PaymentMethod',
    p
  );
  const byChannel = await db.query(
    'SELECT Channel AS channel, CAST(SUM(Total) AS FLOAT) AS sales, COUNT(*) AS bills FROM dbo.Sales WHERE CreatedAt >= ? AND CreatedAt < ? GROUP BY Channel',
    p
  );
  const topProducts = await db.query(
    `SELECT TOP 10 i.ProductId AS productId, MAX(i.Name) AS name, SUM(i.Quantity) AS quantity, CAST(SUM(i.Quantity * i.UnitPrice) AS FLOAT) AS sales
     FROM dbo.SaleItems i JOIN dbo.Sales s ON s.Id = i.SaleId WHERE s.CreatedAt >= ? AND s.CreatedAt < ?
     GROUP BY i.ProductId ORDER BY sales DESC`,
    p
  );
  const byCategory = await db.query(
    `SELECT c.Name AS category, CAST(SUM(i.Quantity * i.UnitPrice) AS FLOAT) AS sales
     FROM dbo.SaleItems i JOIN dbo.Sales s ON s.Id = i.SaleId JOIN dbo.Products pr ON pr.Id = i.ProductId JOIN dbo.Categories c ON c.Id = pr.CategoryId
     WHERE s.CreatedAt >= ? AND s.CreatedAt < ? GROUP BY c.Name ORDER BY sales DESC`,
    p
  );
  return {
    from,
    to,
    totals: { sales: round2(t.sales), bills: t.bills, items: t.items, vat: round2(t.vat), averageBill: t.bills ? round2(t.sales / t.bills) : 0 },
    byDay,
    byMethod: byMethod as SalesReport['byMethod'],
    byChannel: byChannel as SalesReport['byChannel'],
    topProducts: topProducts as SalesReport['topProducts'],
    byCategory: byCategory as SalesReport['byCategory'],
  };
}

/** CSV with a UTF-8 BOM so Excel shows Thai correctly; every cell quoted. */
function sendCsv(res: Response, filename: string, header: string[], rows: (string | number | null)[][]) {
  const cell = (v: string | number | null) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const body = '﻿' + [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(body);
}

export function reportRoutes({ db }: Deps): Router {
  const router = Router();

  router.get(
    '/dashboard',
    requireRole('cashier', 'manager'),
    handle(async (_req, res) => {
      const today = bangkokDate();
      const report = await salesReport(db, today, today);
      const awaiting = await db.queryOne<{ n: number }>("SELECT COUNT(*) AS n FROM dbo.Orders WHERE Status = N'awaiting_payment'");
      const body: DashboardSummary = {
        today: { sales: report.totals.sales, bills: report.totals.bills, items: report.totals.items },
        awaitingOrders: awaiting!.n,
        lowStock: await listProducts(db, { lowStockOnly: true }),
        recentSales: await loadSales(db, '', [], 'ORDER BY s.Id DESC OFFSET 0 ROWS FETCH NEXT 8 ROWS ONLY'),
      };
      res.json(body);
    })
  );

  router.get(
    '/sales',
    requireRole('manager'),
    handle(async (req, res) => {
      const r = range(req.query);
      res.json(await salesReport(db, r.from, r.to));
    })
  );

  router.get(
    '/export/sales.csv',
    requireRole('manager'),
    handle(async (req, res) => {
      const r = range(req.query);
      const rows = await db.query(
        `SELECT s.ReceiptNo, ${BKK_DATE('s.CreatedAt')} AS D, CONVERT(CHAR(5), DATEADD(HOUR, 7, s.CreatedAt), 108) AS T, s.Channel, o.OrderNo,
           s.PaymentMethod, i.Name, i.Quantity, CAST(i.UnitPrice AS FLOAT) AS UnitPrice, CAST(i.Quantity * i.UnitPrice AS FLOAT) AS LineTotal,
           CAST(s.Total AS FLOAT) AS Total, CAST(s.VatAmount AS FLOAT) AS Vat, u.DisplayName AS Cashier
         FROM dbo.Sales s JOIN dbo.SaleItems i ON i.SaleId = s.Id LEFT JOIN dbo.Orders o ON o.Id = s.OrderId LEFT JOIN dbo.Users u ON u.Id = s.CashierId
         WHERE s.CreatedAt >= ? AND s.CreatedAt < ? ORDER BY s.Id, i.LineNumber`,
        [r.start, r.end]
      );
      await audit(db, auditContext(req), 'export', 'report', 'sales.csv', { from: r.from, to: r.to, rows: rows.length });
      sendCsv(
        res,
        `sales_${r.from}_${r.to}.csv`,
        ['เลขที่ใบเสร็จ', 'วันที่', 'เวลา', 'ช่องทาง', 'เลขคำสั่งซื้อ', 'วิธีชำระ', 'สินค้า', 'จำนวน', 'ราคาต่อหน่วย', 'รวมรายการ', 'ยอดบิล', 'VAT', 'ผู้ขาย'],
        rows.map((x) => [x.ReceiptNo, x.D, x.T, x.Channel, x.OrderNo, x.PaymentMethod, x.Name, x.Quantity, x.UnitPrice, x.LineTotal, x.Total, x.Vat, x.Cashier])
      );
    })
  );

  router.get(
    '/export/inventory.csv',
    requireRole('manager'),
    handle(async (req, res) => {
      const products = await listProducts(db, { includeInactive: true });
      await audit(db, auditContext(req), 'export', 'report', 'inventory.csv', { rows: products.length });
      sendCsv(
        res,
        `inventory_${bangkokDate()}.csv`,
        ['รหัสสินค้า', 'บาร์โค้ด', 'ชื่อสินค้า', 'หมวดหมู่', 'ราคา', 'ราคาโปรโมชัน', 'คงเหลือ', 'ขั้นต่ำ', 'สถานะ'],
        products.map((p) => [p.sku, p.barcode, p.name, p.categoryName, p.price, p.promoPrice, p.stock, p.minStock, p.isActive ? 'ขายอยู่' : 'เลิกขาย'])
      );
    })
  );

  return router;
}

