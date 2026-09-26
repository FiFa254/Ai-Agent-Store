// Audit trail: who did what, when, from where. Written inside the caller's transaction when given one.
import type { Request } from 'express';
import type { Queryable } from '../db/db';

export interface AuditContext {
  userId: number | null;
  ip: string | null;
}

export const auditContext = (req: Request): AuditContext => ({
  userId: req.user?.id ?? null,
  ip: req.ip ?? null,
});

export async function audit(
  db: Queryable,
  ctx: AuditContext,
  action: string,
  entity: string,
  entityId: string | number | null = null,
  details: Record<string, unknown> | null = null
): Promise<void> {
  await db.run(
    'INSERT INTO dbo.AuditLog (UserId, Action, Entity, EntityId, Details, Ip) VALUES (?, ?, ?, ?, ?, ?)',
    [ctx.userId, action, entity, entityId === null ? null : String(entityId), details ? JSON.stringify(details) : null, ctx.ip]
  );
}
