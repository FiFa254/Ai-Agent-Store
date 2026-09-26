// Categories and products (manager/admin), public catalog, stock changes and history.
import { Router } from 'express';
import { z } from 'zod';
import { categorySchema, pageSchema, productSchema, stockChangeSchema } from '@shared/schemas';
import type { Paged, StockMovement } from '@shared/types';
import type { Deps } from '../../app';
import { audit, auditContext } from '../../lib/audit';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { toIso } from '../../lib/time';
import { requireAuth, requireRole } from '../../middleware/auth';
import { handle, intParam, parse } from '../../middleware/http';
import { applyStockChange, stockConflict } from '../inventory/service';
import { getProduct, listCategories, listProducts, publicCatalog } from './repository';

const isUniqueViolation = (err: any) => /UNIQUE KEY|duplicate key/i.test(err?.message ?? '');

export function publicCatalogRoutes({ db }: Deps): Router {
  const router = Router();
  router.get('/categories', handle(async (_req, res) => res.json((await listCategories(db)).filter((c) => c.productCount > 0))));
  router.get('/products', handle(async (_req, res) => res.json(await publicCatalog(db))));
  return router;
}

export function catalogRoutes({ db }: Deps): Router {
  const router = Router();

  // ---- categories ----
  router.get('/categories', requireAuth, handle(async (_req, res) => res.json(await listCategories(db))));

  router.post(
    '/categories',
    requireRole('manager'),
    handle(async (req, res) => {
      const input = parse(categorySchema, req.body);
      try {
        const row = await db.transaction(async (tx) => {
          const created = await tx.queryOne('INSERT INTO dbo.Categories (Name, SortOrder) OUTPUT inserted.Id VALUES (?, ?)', [input.name, input.sortOrder]);
          await audit(tx, auditContext(req), 'create', 'category', created!.Id, input);
          return created!;
        });
        res.status(201).json({ id: row.Id, ...input, productCount: 0 });
      } catch (err) {
        if (isUniqueViolation(err)) throw conflict('มีหมวดหมู่นี้อยู่แล้ว');
        throw err;
      }
    })
  );

  router.put(
    '/categories/:id',
    requireRole('manager'),
    handle(async (req, res) => {
      const id = intParam(req.params.id);
      const input = parse(categorySchema, req.body);
      try {
        await db.transaction(async (tx) => {
          if ((await tx.run('UPDATE dbo.Categories SET Name = ?, SortOrder = ? WHERE Id = ?', [input.name, input.sortOrder, id])) === 0) throw notFound();
          await audit(tx, auditContext(req), 'update', 'category', id, input);
        });
      } catch (err) {
        if (isUniqueViolation(err)) throw conflict('มีหมวดหมู่นี้อยู่แล้ว');
        throw err;
      }
      res.json({ id, ...input });
    })
  );

  router.delete(
    '/categories/:id',
    requireRole('manager'),
    handle(async (req, res) => {
      const id = intParam(req.params.id);
      await db.transaction(async (tx) => {
        const used = await tx.queryOne<{ n: number }>('SELECT COUNT(*) AS n FROM dbo.Products WHERE CategoryId = ?', [id]);
        if (used!.n > 0) throw badRequest('ยังมีสินค้าในหมวดหมู่นี้ ย้ายสินค้าออกก่อน');
        if ((await tx.run('DELETE FROM dbo.Categories WHERE Id = ?', [id])) === 0) throw notFound();
        await audit(tx, auditContext(req), 'delete', 'category', id);
      });
      res.status(204).end();
    })
  );

  // ---- products ----
  router.get(
    '/products',
    requireAuth,
    handle(async (req, res) => {
      const q = parse(z.object({ q: z.string().trim().max(100).default(''), all: z.enum(['0', '1']).default('0'), low: z.enum(['0', '1']).default('0') }), req.query);
      res.json(await listProducts(db, { q: q.q, includeInactive: q.all === '1', lowStockOnly: q.low === '1' }));
    })
  );

  router.get(
    '/products/:id',
    requireAuth,
    handle(async (req, res) => {
      const p = await getProduct(db, intParam(req.params.id));
      if (!p) throw notFound('ไม่พบสินค้า');
      res.json(p);
    })
  );

  router.post(
    '/products',
    requireRole('manager'),
    handle(async (req, res) => {
      const input = parse(productSchema, req.body);
      const initialStock = parse(z.coerce.number().int().min(0).max(99999).default(0), req.body?.initialStock);
      try {
        const id = await db.transaction(async (tx) => {
          const created = await tx.queryOne(
            `INSERT INTO dbo.Products (Sku, Barcode, Name, Description, CategoryId, Price, PromoPrice, MinStock, IsActive)
             OUTPUT inserted.Id VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [input.sku, input.barcode, input.name, input.description, input.categoryId, input.price, input.promoPrice, input.minStock, input.isActive ? 1 : 0]
          );
          if (initialStock > 0) {
            await applyStockChange(tx, { productId: created!.Id, change: initialStock, reason: 'initial', userId: req.user!.id });
          }
          await audit(tx, auditContext(req), 'create', 'product', created!.Id, { ...input, initialStock });
          return created!.Id as number;
        });
        res.status(201).json(await getProduct(db, id));
      } catch (err) {
        if (isUniqueViolation(err)) throw conflict('รหัสสินค้า (SKU) นี้มีอยู่แล้ว');
        if (/FOREIGN KEY/i.test((err as any)?.message ?? '')) throw badRequest('ไม่พบหมวดหมู่ที่เลือก');
        throw err;
      }
    })
  );

  router.put(
    '/products/:id',
    requireRole('manager'),
    handle(async (req, res) => {
      const id = intParam(req.params.id);
      const input = parse(productSchema, req.body);
      try {
        await db.transaction(async (tx) => {
          const before = await tx.queryOne('SELECT Name, Price, PromoPrice, IsActive FROM dbo.Products WHERE Id = ?', [id]);
          if (!before) throw notFound('ไม่พบสินค้า');
          await tx.run(
            `UPDATE dbo.Products SET Sku = ?, Barcode = ?, Name = ?, Description = ?, CategoryId = ?, Price = ?, PromoPrice = ?,
               MinStock = ?, IsActive = ?, UpdatedAt = SYSUTCDATETIME() WHERE Id = ?`,
            [input.sku, input.barcode, input.name, input.description, input.categoryId, input.price, input.promoPrice, input.minStock, input.isActive ? 1 : 0, id]
          );
          await audit(tx, auditContext(req), 'update', 'product', id, {
            ...input,
            previous: { name: before.Name, price: Number(before.Price), promoPrice: before.PromoPrice === null ? null : Number(before.PromoPrice), isActive: Boolean(before.IsActive) },
          });
        });
      } catch (err) {
        if (isUniqueViolation(err)) throw conflict('รหัสสินค้า (SKU) นี้มีอยู่แล้ว');
        throw err;
      }
      res.json(await getProduct(db, id));
    })
  );

  // Products that were sold keep their history, so "delete" hides the product instead.
  router.delete(
    '/products/:id',
    requireRole('manager'),
    handle(async (req, res) => {
      const id = intParam(req.params.id);
      await db.transaction(async (tx) => {
        if ((await tx.run('UPDATE dbo.Products SET IsActive = 0, UpdatedAt = SYSUTCDATETIME() WHERE Id = ?', [id])) === 0) throw notFound('ไม่พบสินค้า');
        await audit(tx, auditContext(req), 'deactivate', 'product', id);
      });
      res.status(204).end();
    })
  );

  // ---- stock ----
  router.post(
    '/stock',
    requireRole('manager'),
    handle(async (req, res) => {
      const input = parse(stockChangeSchema, req.body);
      const stockAfter = await db
        .transaction(async (tx) => {
          const after = await applyStockChange(tx, { ...input, userId: req.user!.id });
          await audit(tx, auditContext(req), input.reason, 'stock', input.productId, { change: input.change, note: input.note, stockAfter: after });
          return after;
        })
        .catch(stockConflict);
      res.json({ productId: input.productId, stock: stockAfter });
    })
  );

  router.get(
    '/stock/movements',
    requireRole('manager'),
    handle(async (req, res) => {
      const f = parse(pageSchema.extend({ productId: z.coerce.number().int().positive().optional() }), req.query);
      const where = f.productId ? 'WHERE m.ProductId = ?' : '';
      const params = f.productId ? [f.productId] : [];
      const total = (await db.queryOne<{ n: number }>(`SELECT COUNT(*) AS n FROM dbo.StockMovements m ${where}`, params))!.n;
      const rows = await db.query(
        `SELECT m.*, p.Name AS ProductName, u.DisplayName AS UserName FROM dbo.StockMovements m
         JOIN dbo.Products p ON p.Id = m.ProductId LEFT JOIN dbo.Users u ON u.Id = m.UserId
         ${where} ORDER BY m.Id DESC OFFSET ? ROWS FETCH NEXT ? ROWS ONLY`,
        [...params, (f.page - 1) * f.pageSize, f.pageSize]
      );
      const body: Paged<StockMovement> = {
        total,
        page: f.page,
        pageSize: f.pageSize,
        items: rows.map((r) => ({
          id: Number(r.Id),
          productId: r.ProductId,
          productName: r.ProductName,
          change: r.Change,
          stockAfter: r.StockAfter,
          reason: r.Reason,
          refNo: r.RefNo,
          note: r.Note,
          userName: r.UserName ?? null,
          createdAt: toIso(r.CreatedAt),
        })),
      };
      res.json(body);
    })
  );

  return router;
}
