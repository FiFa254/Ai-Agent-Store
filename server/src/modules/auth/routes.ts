// First-run setup, login/logout, current user, own password change.
import crypto from 'node:crypto';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { changePasswordSchema, loginSchema, setupSchema } from '@shared/schemas';
import type { SessionUser } from '@shared/types';
import type { Deps } from '../../app';
import { audit, auditContext } from '../../lib/audit';
import { badRequest, conflict, unauthorized } from '../../lib/errors';
import { DUMMY_HASH, hashPassword, verifyPassword } from '../../lib/password';
import { SESSION_COOKIE, hashToken, requireAuth } from '../../middleware/auth';
import { handle, parse } from '../../middleware/http';

export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MINUTES = 15;

export function authRoutes({ db, config }: Deps): Router {
  const router = Router();
  const secureCookie = config.NODE_ENV === 'production' && process.env.COOKIE_SECURE === 'true';

  const startSession = async (res: import('express').Response, req: import('express').Request, userId: number) => {
    const token = crypto.randomBytes(32).toString('base64url');
    await db.run(
      'INSERT INTO dbo.Sessions (TokenHash, UserId, ExpiresAt, Ip, UserAgent) VALUES (?, ?, DATEADD(HOUR, ?, SYSUTCDATETIME()), ?, ?)',
      [hashToken(token), userId, config.SESSION_HOURS, req.ip ?? null, (req.get('user-agent') ?? '').slice(0, 300)]
    );
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: secureCookie,
      path: '/',
      maxAge: config.SESSION_HOURS * 3_600_000,
    });
  };

  const loginLimiter = rateLimit({
    windowMs: 60_000,
    limit: config.NODE_ENV === 'test' ? 1000 : 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'ลองเข้าสู่ระบบบ่อยเกินไป กรุณารอสักครู่' },
  });

  router.get(
    '/setup',
    handle(async (_req, res) => {
      const row = await db.queryOne<{ n: number }>('SELECT COUNT(*) AS n FROM dbo.Users');
      res.json({ needsSetup: row!.n === 0 });
    })
  );

  // Creates the first admin. Refused as soon as any user exists.
  router.post(
    '/setup',
    handle(async (req, res) => {
      const input = parse(setupSchema, req.body);
      const passwordHash = await hashPassword(input.password);
      const userId = await db.transaction(async (tx) => {
        const existing = await tx.queryOne<{ n: number }>('SELECT COUNT(*) AS n FROM dbo.Users WITH (UPDLOCK, HOLDLOCK)');
        if (existing!.n > 0) throw conflict('ตั้งค่าระบบไปแล้ว กรุณาเข้าสู่ระบบ', 'already_setup');
        const row = await tx.queryOne<{ Id: number }>(
          "INSERT INTO dbo.Users (Username, DisplayName, PasswordHash, Role) OUTPUT inserted.Id VALUES (?, ?, ?, N'admin')",
          [input.username, input.displayName, passwordHash]
        );
        await tx.run('UPDATE dbo.Settings SET StoreName = ?, UpdatedAt = SYSUTCDATETIME() WHERE Id = 1', [input.storeName]);
        await audit(tx, { userId: row!.Id, ip: req.ip ?? null }, 'setup', 'system', null, { username: input.username });
        return row!.Id;
      });
      await startSession(res, req, userId);
      const user: SessionUser = { id: userId, username: input.username, displayName: input.displayName, role: 'admin' };
      res.status(201).json(user);
    })
  );

  router.post(
    '/login',
    loginLimiter,
    handle(async (req, res) => {
      const { username, password } = parse(loginSchema, req.body);
      const user = await db.queryOne(
        'SELECT Id, Username, DisplayName, Role, PasswordHash, IsActive, FailedLogins, LockedUntil FROM dbo.Users WHERE Username = ?',
        [username]
      );
      const ok = await verifyPassword(password, user?.PasswordHash ?? DUMMY_HASH);
      const ctx = { userId: user?.Id ?? null, ip: req.ip ?? null };

      if (user?.LockedUntil && new Date(user.LockedUntil).getTime() > Date.now()) {
        await audit(db, ctx, 'login_locked', 'user', user.Id);
        const minutes = Math.ceil((new Date(user.LockedUntil).getTime() - Date.now()) / 60_000);
        throw unauthorized(`บัญชีถูกล็อกชั่วคราว ลองใหม่ในอีก ${minutes} นาที`);
      }
      if (!user || !ok || !user.IsActive) {
        if (user && user.IsActive) {
          const failed = user.FailedLogins + 1;
          const lock = failed >= MAX_FAILED_LOGINS;
          await db.run(
            `UPDATE dbo.Users SET FailedLogins = ?, LockedUntil = ${lock ? 'DATEADD(MINUTE, ?, SYSUTCDATETIME())' : 'NULL'} WHERE Id = ?`,
            lock ? [0, LOCKOUT_MINUTES, user.Id] : [failed, user.Id]
          );
          await audit(db, ctx, lock ? 'login_lockout' : 'login_failed', 'user', user.Id);
        } else {
          await audit(db, ctx, 'login_failed', 'user', null, { username });
        }
        throw unauthorized('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
      }

      await db.run('UPDATE dbo.Users SET FailedLogins = 0, LockedUntil = NULL, LastLoginAt = SYSUTCDATETIME() WHERE Id = ?', [user.Id]);
      await startSession(res, req, user.Id);
      await audit(db, ctx, 'login', 'user', user.Id);
      const sessionUser: SessionUser = { id: user.Id, username: user.Username, displayName: user.DisplayName, role: user.Role };
      res.json(sessionUser);
    })
  );

  router.post(
    '/logout',
    handle(async (req, res) => {
      if (req.sessionTokenHash) {
        await db.run('DELETE FROM dbo.Sessions WHERE TokenHash = ?', [req.sessionTokenHash]);
        await audit(db, auditContext(req), 'logout', 'user', req.user?.id ?? null);
      }
      res.clearCookie(SESSION_COOKIE, { path: '/' });
      res.status(204).end();
    })
  );

  router.get('/me', requireAuth, (req, res) => res.json(req.user));

  router.post(
    '/password',
    requireAuth,
    handle(async (req, res) => {
      const input = parse(changePasswordSchema, req.body);
      const row = await db.queryOne('SELECT PasswordHash FROM dbo.Users WHERE Id = ?', [req.user!.id]);
      if (!row || !(await verifyPassword(input.currentPassword, row.PasswordHash))) {
        throw badRequest('รหัสผ่านปัจจุบันไม่ถูกต้อง', { currentPassword: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' });
      }
      await db.run('UPDATE dbo.Users SET PasswordHash = ? WHERE Id = ?', [await hashPassword(input.newPassword), req.user!.id]);
      // Sign out other sessions of this user.
      await db.run('DELETE FROM dbo.Sessions WHERE UserId = ? AND TokenHash <> ?', [req.user!.id, req.sessionTokenHash ?? '']);
      await audit(db, auditContext(req), 'password_change', 'user', req.user!.id);
      res.status(204).end();
    })
  );

  return router;
}
