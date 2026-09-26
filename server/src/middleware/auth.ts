// Session cookie → req.user. The cookie holds a random token; the database stores only its SHA-256.
import crypto from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Role } from '@shared/schemas';
import type { Db } from '../db/db';
import { forbidden, unauthorized } from '../lib/errors';

export const SESSION_COOKIE = 'grocerai_session';

export const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

export function loadSession(db: Db, sessionHours: number): RequestHandler {
  return async (req, _res, next) => {
    const token: string | undefined = req.cookies?.[SESSION_COOKIE];
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return next();
    try {
      const tokenHash = hashToken(token);
      const row = await db.queryOne(
        `SELECT u.Id, u.Username, u.DisplayName, u.Role, s.ExpiresAt
         FROM dbo.Sessions s JOIN dbo.Users u ON u.Id = s.UserId
         WHERE s.TokenHash = ? AND s.ExpiresAt > SYSUTCDATETIME() AND u.IsActive = 1`,
        [tokenHash]
      );
      if (row) {
        req.user = { id: row.Id, username: row.Username, displayName: row.DisplayName, role: row.Role };
        req.sessionTokenHash = tokenHash;
        // Sliding expiry: extend when less than half of the lifetime is left.
        const remainingMs = new Date(row.ExpiresAt).getTime() - Date.now();
        if (remainingMs < (sessionHours * 3_600_000) / 2) {
          await db.run('UPDATE dbo.Sessions SET ExpiresAt = DATEADD(HOUR, ?, SYSUTCDATETIME()) WHERE TokenHash = ?', [sessionHours, tokenHash]);
        }
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

export const requireAuth: RequestHandler = (req, _res, next) => (req.user ? next() : next(unauthorized()));

/** Allows the listed roles; admin is always allowed. */
export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    if (req.user.role === 'admin' || roles.includes(req.user.role)) return next();
    next(forbidden());
  };
