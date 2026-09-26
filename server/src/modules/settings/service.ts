import type { Settings } from '@shared/schemas';
import type { Queryable } from '../../db/db';

export async function getSettings(db: Queryable): Promise<Settings> {
  const r = (await db.queryOne('SELECT * FROM dbo.Settings WHERE Id = 1'))!;
  return {
    storeName: r.StoreName,
    storeAddress: r.StoreAddress,
    storePhone: r.StorePhone,
    taxId: r.TaxId,
    promptPayId: r.PromptPayId,
    vatRate: Number(r.VatRate),
    receiptFooter: r.ReceiptFooter,
    orderExpiryMinutes: r.OrderExpiryMinutes,
  };
}
