// User management (admin only).
import { Router } from 'express';
import { createUserSchema, updateUserSchema } from '@shared/schemas';
import type { UserRow } from '@shared/types';
import type { Deps } from '../../app';
import { audit, auditContext } from '../../lib/audit';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { hashPassword } from '../../lib/password';
import { toIso, toIsoOrNull } from '../../lib/time';
import { requireRole } from '../../middleware/auth';
import { handle, intParam, parse } from '../../middleware/http';

const toUser = (r: any): UserRow => ({
  id: r.Id,
  username: r.Username,
  displayName: r.DisplayName,
  role: r.Role,
  isActive: Boolean(r.IsActive),
  lastLoginAt: toIsoOrNull(r.LastLoginAt),
  lockedUntil: r.LockedUntil && new Date(r.LockedUntil).getTime() > Date.now() ? toIso(r.LockedUntil) : null,
  createdAt: toIso(r.CreatedAt),
});

export function userRoutes({ db }: Deps): Router {
  const router = Router();
  router.use(requireRole('admin'));

  router.get(
    '/',
    handle(async (_req, res) => {
      res.json((await db.query('SELECT * FROM dbo.Users ORDER BY IsActive DESC, Username')).map(toUser));
    })
  );

  router.post(
    '/',
    handle(async (req, res) => {
      const input = parse(createUserSchema, req.body);
      const exists = await db.queryOne('SELECT 1 AS x FROM dbo.Users WHERE Username = ?', [input.username]);
      if (exists) throw conflict('ชื่อผู้ใช้นี้มีอยู่แล้ว');
      const row = await db.transaction(async (tx) => {
        const created = await tx.queryOne(
          'INSERT INTO dbo.Users (Username, DisplayName, PasswordHash, Role) OUTPUT inserted.* VALUES (?, ?, ?, ?)',
          [input.username, input.displayName, await hashPassword(input.password), input.role]
        );
        await audit(tx, auditContext(req), 'create', 'user', created!.Id, { username: input.username, role: input.role });
        return created!;
      });
      res.status(201).json(toUser(row));
    })
  );

  router.patch(
    '/:id',
    handle(async (req, res) => {
      const id = intParam(req.params.id);
      const input = parse(updateUserSchema, req.body);
      if (id === req.user!.id && (input.role && input.role !== 'admin' || input.isActive === false)) {
        throw badRequest('ไม่สามารถลดสิทธิ์หรือปิดบัญชีของตัวเองได้');
      }
      const row = await db.transaction(async (tx) => {
        const current = await tx.queryOne('SELECT * FROM dbo.Users WITH (UPDLOCK) WHERE Id = ?', [id]);
        if (!current) throw notFound('ไม่พบผู้ใช้');
        if (current.Role === 'admin' && (input.role && input.role !== 'admin' || input.isActive === false)) {
          const admins = await tx.queryOne<{ n: number }>("SELECT COUNT(*) AS n FROM dbo.Users WHERE Role = N'admin' AND IsActive = 1");
          if (admins!.n <= 1) throw badRequest('ต้องมีผู้ดูแลระบบที่ใช้งานได้อย่างน้อย 1 คน');
        }
        const passwordHash = input.password ? await hashPassword(input.password) : null;
        const updated = await tx.queryOne(
          `UPDATE dbo.Users SET
             DisplayName = COALESCE(?, DisplayName),
             Role = COALESCE(?, Role),
             IsActive = COALESCE(?, IsActive),
             PasswordHash = COALESCE(?, PasswordHash),
             FailedLogins = CASE WHEN ? = 1 THEN 0 ELSE FailedLogins END,
             LockedUntil = CASE WHEN ? = 1 THEN NULL ELSE LockedUntil END
           OUTPUT inserted.*
           WHERE Id = ?`,
          [
            input.displayName ?? null,
            input.role ?? null,
            input.isActive === undefined ? null : input.isActive ? 1 : 0,
            passwordHash,
            passwordHash ? 1 : 0,
            passwordHash ? 1 : 0,
            id,
          ]
        );
        if (input.isActive === false || passwordHash || input.role) {
          await tx.run('DELETE FROM dbo.Sessions WHERE UserId = ?', [id]);
        }
        const changes = { ...input, password: input.password ? '(changed)' : undefined };
        await audit(tx, auditContext(req), 'update', 'user', id, changes);
        return updated!;
      });
      res.json(toUser(row));
    })
  );

  return router;
}
