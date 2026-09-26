import { Router } from 'express';
import { z } from 'zod';
import { pageSchema } from '@shared/schemas';
import type { AuditEntry, Paged } from '@shared/types';
import type { Deps } from '../../app';
import { toIso } from '../../lib/time';
import { requireRole } from '../../middleware/auth';
import { handle, parse } from '../../middleware/http';

const filterSchema = pageSchema.extend({
  entity: z.string().trim().max(40).default(''),
  userId: z.coerce.number().int().positive().optional(),
});

export function auditRoutes({ db }: Deps): Router {
  const router = Router();
  router.use(requireRole('admin'));

  router.get(
    '/',
    handle(async (req, res) => {
      const f = parse(filterSchema, req.query);
      const where: string[] = [];
      const params: unknown[] = [];
      if (f.entity) {
        where.push('a.Entity = ?');
        params.push(f.entity);
      }
      if (f.userId) {
        where.push('a.UserId = ?');
        params.push(f.userId);
      }
      if (f.q) {
        where.push("(a.Action LIKE ? OR a.EntityId LIKE ? OR a.Details LIKE ? OR u.Username LIKE ?)");
        const like = `%${f.q}%`;
        params.push(like, like, like, like);
      }
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const total = (await db.queryOne<{ n: number }>(
        `SELECT COUNT(*) AS n FROM dbo.AuditLog a LEFT JOIN dbo.Users u ON u.Id = a.UserId ${whereSql}`,
        params
      ))!.n;
      const rows = await db.query(
        `SELECT a.*, u.DisplayName FROM dbo.AuditLog a LEFT JOIN dbo.Users u ON u.Id = a.UserId ${whereSql}
         ORDER BY a.Id DESC OFFSET ? ROWS FETCH NEXT ? ROWS ONLY`,
        [...params, (f.page - 1) * f.pageSize, f.pageSize]
      );
      const body: Paged<AuditEntry> = {
        total,
        page: f.page,
        pageSize: f.pageSize,
        items: rows.map((r) => ({
          id: Number(r.Id),
          userName: r.DisplayName ?? null,
          action: r.Action,
          entity: r.Entity,
          entityId: r.EntityId,
          details: r.Details,
          ip: r.Ip,
          createdAt: toIso(r.CreatedAt),
        })),
      };
      res.json(body);
    })
  );

  return router;
}
