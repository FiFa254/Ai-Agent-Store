// Small HTTP helpers: async handler wrapper, zod parsing, origin check (CSRF), error handler.
import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from 'express';
import type { z } from 'zod';
import { AppError, badRequest, forbidden } from '../lib/errors';
import type { Logger } from '../lib/logger';

export const handle =
  (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next: NextFunction) => {
    fn(req, res).catch(next);
  };

export function parse<S extends z.ZodType>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || '_';
    fields[key] ??= issue.message;
  }
  throw badRequest(Object.values(fields)[0] ?? 'ข้อมูลไม่ถูกต้อง', fields);
}

export const intParam = (value: unknown, name = 'id') => {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw badRequest(`${name} ไม่ถูกต้อง`);
  return n;
};

/**
 * CSRF defence for cookie auth: state-changing requests must come from this site.
 * Browsers always send Origin on cross-site POST/PUT/DELETE; tools without Origin (tests, curl) are allowed.
 */
export function originCheck(extraOrigins: string[]): RequestHandler {
  return (req, _res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.get('origin');
    if (!origin) return next();
    const self = `${req.protocol}://${req.get('host')}`;
    if (origin === self || extraOrigins.includes(origin)) return next();
    next(forbidden('คำขอมาจากเว็บไซต์อื่น'));
  };
}

export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (err, req, res, next) => {
    if (res.headersSent) return next(err);
    if (err instanceof AppError) {
      return res.status(err.status).json({ error: err.message, code: err.code, fields: err.fields });
    }
    if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'ข้อมูลใหญ่เกินไป' });
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' });
    logger.error({ err, method: req.method, path: req.path }, 'request failed');
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง', code: 'internal' });
  };
}
