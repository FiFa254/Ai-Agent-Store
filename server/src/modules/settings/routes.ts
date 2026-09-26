import { Router } from 'express';
import { settingsSchema } from '@shared/schemas';
import type { PublicSettings } from '@shared/types';
import type { Deps } from '../../app';
import { audit, auditContext } from '../../lib/audit';
import { requireAuth, requireRole } from '../../middleware/auth';
import { handle, parse } from '../../middleware/http';
import { getSettings } from './service';

export function publicSettingsRoute({ db, config }: Deps) {
  return handle(async (_req, res) => {
    const s = await getSettings(db);
    const body: PublicSettings = {
      storeName: s.storeName,
      storeAddress: s.storeAddress,
      storePhone: s.storePhone,
      promptPayEnabled: s.promptPayId !== '',
      vatRate: s.vatRate,
      aiEnabled: Boolean(config.GEMINI_API_KEY),
    };
    res.json(body);
  });
}

export function settingsRoutes({ db }: Deps): Router {
  const router = Router();

  router.get('/', requireAuth, handle(async (_req, res) => res.json(await getSettings(db))));

  router.put(
    '/',
    requireRole('admin'),
    handle(async (req, res) => {
      const s = parse(settingsSchema, req.body);
      await db.transaction(async (tx) => {
        await tx.run(
          `UPDATE dbo.Settings SET StoreName = ?, StoreAddress = ?, StorePhone = ?, TaxId = ?, PromptPayId = ?, VatRate = ?,
             ReceiptFooter = ?, OrderExpiryMinutes = ?, UpdatedAt = SYSUTCDATETIME() WHERE Id = 1`,
          [s.storeName, s.storeAddress, s.storePhone, s.taxId, s.promptPayId.replace(/-/g, ''), s.vatRate, s.receiptFooter, s.orderExpiryMinutes]
        );
        await audit(tx, auditContext(req), 'update', 'settings', 1, s);
      });
      res.json(await getSettings(db));
    })
  );

  return router;
}
