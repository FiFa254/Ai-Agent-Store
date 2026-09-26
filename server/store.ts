// SQL Server data store for the grocery backend (database GroceryAI by default).
// Replaces the old data/*.json files. Every method returns the same JSON shapes
// the frontend already uses (src/types.ts).
import fs from 'fs';
import path from 'path';
import { Db, Tx } from './db';
import { initialProducts } from './seed';

export interface ProductRow {
  id: string;
  name: string;
  price: number;
  promoPrice?: number;
  category: string;
  stock: number;
  minStock: number;
  description: string;
  image?: string;
}

export interface SaleItem {
  productId: string;
  name: string;
  quantity: number;
  price: number;
}

export interface Sale {
  id: string;
  timestamp: string;
  items: SaleItem[];
  total: number;
  paymentMethod: string;
}

export interface StockAlert {
  id: string;
  productId: string;
  productName: string;
  currentStock: number;
  minStock: number;
  timestamp: string;
  resolved: boolean;
}

export interface Shortage {
  name: string;
  requested: number;
  available: number;
}

export type CheckoutResult =
  | { ok: true; sale: Sale }
  | { ok: false; status: number; error: string; details?: Shortage[] };

// Idempotent: safe to run on every start.
const SCHEMA = `
IF OBJECT_ID(N'dbo.Products') IS NULL
CREATE TABLE dbo.Products (
  Id          NVARCHAR(64)   NOT NULL PRIMARY KEY,
  Name        NVARCHAR(200)  NOT NULL,
  Price       DECIMAL(12, 2) NOT NULL CHECK (Price >= 0),
  PromoPrice  DECIMAL(12, 2) NULL CHECK (PromoPrice IS NULL OR PromoPrice >= 0),
  Category    NVARCHAR(100)  NOT NULL DEFAULT N'ทั่วไป',
  Stock       INT            NOT NULL CHECK (Stock >= 0),
  MinStock    INT            NOT NULL CHECK (MinStock >= 0),
  Description NVARCHAR(1000) NOT NULL DEFAULT N'',
  Image       NVARCHAR(500)  NULL,
  SortOrder   INT            IDENTITY(1, 1) NOT NULL,
  UpdatedAt   DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME()
);

-- Sales keep the product name and price at the time of sale, so deleting or
-- repricing a product never changes sales history.
IF OBJECT_ID(N'dbo.Sales') IS NULL
CREATE TABLE dbo.Sales (
  Id            NVARCHAR(64)   NOT NULL PRIMARY KEY,
  CreatedAt     DATETIME2      NOT NULL,
  Total         DECIMAL(12, 2) NOT NULL,
  PaymentMethod NVARCHAR(20)   NOT NULL
);
IF OBJECT_ID(N'dbo.SaleItems') IS NULL
CREATE TABLE dbo.SaleItems (
  SaleId    NVARCHAR(64)   NOT NULL REFERENCES dbo.Sales(Id) ON DELETE CASCADE,
  LineNumber    INT            NOT NULL,
  ProductId NVARCHAR(64)   NOT NULL,
  Name      NVARCHAR(200)  NOT NULL,
  Quantity  INT            NOT NULL CHECK (Quantity > 0),
  Price     DECIMAL(12, 2) NOT NULL,
  PRIMARY KEY (SaleId, LineNumber)
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Sales_CreatedAt')
  CREATE INDEX IX_Sales_CreatedAt ON dbo.Sales(CreatedAt);

-- QR / PromptPay orders waiting for payment confirmation (stock not deducted yet).
IF OBJECT_ID(N'dbo.PendingCheckouts') IS NULL
CREATE TABLE dbo.PendingCheckouts (
  Id            NVARCHAR(64)   NOT NULL PRIMARY KEY,
  CreatedAt     DATETIME2      NOT NULL,
  Total         DECIMAL(12, 2) NOT NULL,
  PaymentMethod NVARCHAR(20)   NOT NULL
);
IF OBJECT_ID(N'dbo.PendingCheckoutItems') IS NULL
CREATE TABLE dbo.PendingCheckoutItems (
  CheckoutId NVARCHAR(64)   NOT NULL REFERENCES dbo.PendingCheckouts(Id) ON DELETE CASCADE,
  LineNumber     INT            NOT NULL,
  ProductId  NVARCHAR(64)   NOT NULL,
  Name       NVARCHAR(200)  NOT NULL,
  Quantity   INT            NOT NULL CHECK (Quantity > 0),
  Price      DECIMAL(12, 2) NOT NULL,
  PRIMARY KEY (CheckoutId, LineNumber)
);

IF OBJECT_ID(N'dbo.StockAlerts') IS NULL
CREATE TABLE dbo.StockAlerts (
  Id           NVARCHAR(64)  NOT NULL PRIMARY KEY,
  ProductId    NVARCHAR(64)  NOT NULL,
  ProductName  NVARCHAR(200) NOT NULL,
  CurrentStock INT           NOT NULL,
  MinStock     INT           NOT NULL,
  CreatedAt    DATETIME2     NOT NULL,
  Resolved     BIT           NOT NULL DEFAULT 0
);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_StockAlerts_Open')
  CREATE INDEX IX_StockAlerts_Open ON dbo.StockAlerts(ProductId, Resolved);
`;

const newId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

export class Store {
  private constructor(readonly db: Db) {}

  static async open(connectionString: string): Promise<Store> {
    const db = await Db.connect(connectionString);
    await db.run(SCHEMA);
    return new Store(db);
  }

  /**
   * First start with an empty database: import the old data/*.json files if they exist.
   * Demo products are inserted only when asked for (SEED_DEMO_DATA=true); otherwise the store starts empty
   * and products are added in the Admin Panel. Does nothing when the database already has products.
   */
  async seed(options: { legacyJsonDir?: string; demo?: boolean } = {}): Promise<'existing' | 'imported' | 'seeded' | 'empty'> {
    const legacyJsonDir = options.legacyJsonDir;
    const { n } = (await this.db.queryOne<{ n: number }>('SELECT COUNT(*) AS n FROM dbo.Products'))!;
    if (n > 0) {
      return 'existing';
    }

    const readJson = (name: string): any[] => {
      if (!legacyJsonDir) return [];
      const file = path.join(legacyJsonDir, name);
      try {
        return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
      } catch {
        return [];
      }
    };

    const legacyProducts = readJson('products.json');
    const imported = legacyProducts.length > 0;
    if (!imported && !options.demo) {
      return 'empty';
    }

    await this.db.transaction(async (tx) => {
      for (const p of imported ? legacyProducts : initialProducts) {
        await upsertProductRow(tx, normalizeProduct(p));
      }
      if (!imported) return;

      for (const s of readJson('sales.json')) {
        await insertSale(tx, 'Sales', 'SaleItems', 'SaleId', { ...s, paymentMethod: s.paymentMethod || 'promptpay' });
      }
      for (const c of readJson('pendingCheckouts.json')) {
        await insertSale(tx, 'PendingCheckouts', 'PendingCheckoutItems', 'CheckoutId', { ...c, paymentMethod: c.paymentMethod || 'promptpay' });
      }
      for (const a of readJson('alerts.json')) {
        await tx.run(
          `IF NOT EXISTS (SELECT 1 FROM dbo.StockAlerts WHERE Id = ?)
           INSERT INTO dbo.StockAlerts (Id, ProductId, ProductName, CurrentStock, MinStock, CreatedAt, Resolved)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [a.id, a.id, a.productId, a.productName, a.currentStock, a.minStock, new Date(a.timestamp), a.resolved ? 1 : 0]
        );
      }
    });

    await this.checkLowStockAlerts();
    return imported ? 'imported' : 'seeded';
  }

  // ---------- Products ----------

  async listProducts(): Promise<ProductRow[]> {
    return (await this.db.query('SELECT * FROM dbo.Products ORDER BY SortOrder')).map(toProduct);
  }

  async getProduct(id: string): Promise<ProductRow | undefined> {
    const row = await this.db.queryOne('SELECT * FROM dbo.Products WHERE Id = ?', [id]);
    return row ? toProduct(row) : undefined;
  }

  async upsertProduct(input: Partial<ProductRow>): Promise<ProductRow> {
    const product = normalizeProduct({ ...input, id: input.id || newId('prod') });
    await this.db.transaction((tx) => upsertProductRow(tx, product));
    await this.checkLowStockAlerts();
    return product;
  }

  async deleteProduct(id: string): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      await tx.run('DELETE FROM dbo.StockAlerts WHERE ProductId = ? AND Resolved = 0', [id]);
      return (await tx.run('DELETE FROM dbo.Products WHERE Id = ?', [id])) > 0;
    });
  }

  // ---------- Checkout ----------

  /** Checks stock and prices the cart (promo price when set). Does not change anything. */
  async priceCart(items: { productId: string; quantity: number }[]): Promise<
    | { ok: true; items: SaleItem[]; total: number }
    | { ok: false; status: number; error: string; details?: Shortage[] }
  > {
    const lines: SaleItem[] = [];
    const shortages: Shortage[] = [];

    for (const item of items) {
      const quantity = Number(item.quantity);
      if (!Number.isInteger(quantity) || quantity <= 0) {
        return { ok: false, status: 400, error: 'จำนวนสินค้าไม่ถูกต้อง' };
      }
      const product = await this.getProduct(item.productId);
      if (!product) {
        return { ok: false, status: 404, error: `ไม่พบสินค้า ID: ${item.productId}` };
      }
      if (product.stock < quantity) {
        shortages.push({ name: product.name, requested: quantity, available: product.stock });
      }
      lines.push({ productId: product.id, name: product.name, quantity, price: product.promoPrice ?? product.price });
    }

    if (shortages.length > 0) {
      return { ok: false, status: 400, error: 'บางสินค้ามีสต็อกไม่เพียงพอสําหรับการสั่งซื้อ', details: shortages };
    }

    const total = Math.round(lines.reduce((sum, line) => sum + line.price * line.quantity, 0) * 100) / 100;
    return { ok: true, items: lines, total };
  }

  /** Cash: deduct stock and record the sale in one transaction. */
  async completeSale(items: SaleItem[], total: number, paymentMethod: string): Promise<CheckoutResult> {
    const sale: Sale = { id: newId('sale'), timestamp: new Date().toISOString(), items, total, paymentMethod };
    try {
      await this.db.transaction(async (tx) => {
        await deductStock(tx, items);
        await insertSale(tx, 'Sales', 'SaleItems', 'SaleId', sale);
      });
    } catch (err) {
      if (err instanceof StockChanged) {
        return { ok: false, status: 400, error: 'บางสินค้ามีสต็อกไม่เพียงพอสําหรับการสั่งซื้อ', details: err.shortages };
      }
      throw err;
    }
    await this.checkLowStockAlerts();
    return { ok: true, sale };
  }

  async createPending(items: SaleItem[], total: number, paymentMethod: string): Promise<Sale> {
    const pending: Sale = { id: newId('pending'), timestamp: new Date().toISOString(), items, total, paymentMethod };
    await this.db.transaction((tx) => insertSale(tx, 'PendingCheckouts', 'PendingCheckoutItems', 'CheckoutId', pending));
    return pending;
  }

  /** QR confirmed: deduct stock and record the sale, or drop the order if stock ran out meanwhile. */
  async confirmPending(id: string): Promise<CheckoutResult> {
    const pending = await this.getPending(id);
    if (!pending) {
      return { ok: false, status: 404, error: 'ไม่พบรายการที่รอชำระเงินนี้ อาจถูกยกเลิกหรือหมดอายุไปแล้ว กรุณาทำรายการใหม่' };
    }

    const sale: Sale = {
      id: newId('sale'),
      timestamp: new Date().toISOString(),
      items: pending.items,
      total: pending.total,
      paymentMethod: pending.paymentMethod,
    };

    try {
      await this.db.transaction(async (tx) => {
        // Delete first: if two confirms race, only one of them removes the row and continues.
        if ((await tx.run('DELETE FROM dbo.PendingCheckouts WHERE Id = ?', [id])) === 0) {
          throw new PendingGone();
        }
        await deductStock(tx, pending.items);
        await insertSale(tx, 'Sales', 'SaleItems', 'SaleId', sale);
      });
    } catch (err) {
      if (err instanceof PendingGone) {
        return { ok: false, status: 404, error: 'ไม่พบรายการที่รอชำระเงินนี้ อาจถูกยกเลิกหรือหมดอายุไปแล้ว กรุณาทำรายการใหม่' };
      }
      if (err instanceof StockChanged) {
        await this.cancelPending(id);
        return { ok: false, status: 400, error: 'สต็อกสินค้าเปลี่ยนแปลงระหว่างรอชำระเงิน กรุณาทำรายการใหม่', details: err.shortages };
      }
      throw err;
    }

    await this.checkLowStockAlerts();
    return { ok: true, sale };
  }

  async cancelPending(id: string): Promise<void> {
    await this.db.run('DELETE FROM dbo.PendingCheckouts WHERE Id = ?', [id]);
  }

  async getPending(id: string): Promise<Sale | undefined> {
    const row = await this.db.queryOne('SELECT * FROM dbo.PendingCheckouts WHERE Id = ?', [id]);
    if (!row) return undefined;
    const items = await this.db.query(
      'SELECT ProductId, Name, Quantity, Price FROM dbo.PendingCheckoutItems WHERE CheckoutId = ? ORDER BY LineNumber',
      [id]
    );
    return toSale(row, items.map(toSaleItem));
  }

  // ---------- Sales ----------

  async listSales(): Promise<Sale[]> {
    const sales = await this.db.query('SELECT * FROM dbo.Sales ORDER BY CreatedAt');
    const items = await this.db.query('SELECT SaleId, ProductId, Name, Quantity, Price FROM dbo.SaleItems ORDER BY SaleId, LineNumber');

    const bySale = new Map<string, SaleItem[]>();
    for (const item of items) {
      const list = bySale.get(item.SaleId) ?? [];
      list.push(toSaleItem(item));
      bySale.set(item.SaleId, list);
    }
    return sales.map((s) => toSale(s, bySale.get(s.Id) ?? []));
  }

  // ---------- Stock alerts ----------

  async listAlerts(): Promise<StockAlert[]> {
    return (await this.db.query('SELECT * FROM dbo.StockAlerts ORDER BY CreatedAt')).map((a) => ({
      id: a.Id,
      productId: a.ProductId,
      productName: a.ProductName,
      currentStock: a.CurrentStock,
      minStock: a.MinStock,
      timestamp: toIso(a.CreatedAt),
      resolved: Boolean(a.Resolved),
    }));
  }

  async resolveAlert(id: string): Promise<boolean> {
    return (await this.db.run('UPDATE dbo.StockAlerts SET Resolved = 1 WHERE Id = ?', [id])) > 0;
  }

  /** Opens one alert per product at or below its minimum stock (skips products that already have an open alert). */
  async checkLowStockAlerts(): Promise<number> {
    const low = await this.db.query(
      `SELECT p.Id, p.Name, p.Stock, p.MinStock FROM dbo.Products p
       WHERE p.Stock <= p.MinStock
         AND NOT EXISTS (SELECT 1 FROM dbo.StockAlerts a WHERE a.ProductId = p.Id AND a.Resolved = 0)`
    );
    for (const p of low) {
      await this.db.run(
        `INSERT INTO dbo.StockAlerts (Id, ProductId, ProductName, CurrentStock, MinStock, CreatedAt, Resolved)
         VALUES (?, ?, ?, ?, ?, SYSUTCDATETIME(), 0)`,
        [newId('alert'), p.Id, p.Name, p.Stock, p.MinStock]
      );
    }
    return low.length;
  }

  close(): Promise<void> {
    return this.db.close();
  }
}

class StockChanged extends Error {
  constructor(readonly shortages: Shortage[]) {
    super('Stock changed');
  }
}

class PendingGone extends Error {}

async function upsertProductRow(tx: Tx, p: ProductRow): Promise<void> {
  const params = [p.name, p.price, p.promoPrice ?? null, p.category, p.stock, p.minStock, p.description, p.image ?? null];
  const updated = await tx.run(
    `UPDATE dbo.Products SET Name = ?, Price = ?, PromoPrice = ?, Category = ?, Stock = ?, MinStock = ?,
       Description = ?, Image = ?, UpdatedAt = SYSUTCDATETIME()
     WHERE Id = ?`,
    [...params, p.id]
  );
  if (updated === 0) {
    await tx.run(
      `INSERT INTO dbo.Products (Name, Price, PromoPrice, Category, Stock, MinStock, Description, Image, Id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [...params, p.id]
    );
  }
}

/** Atomic per line: only succeeds when enough stock is left; throws StockChanged (rolls back) otherwise. */
async function deductStock(tx: Tx, items: SaleItem[]): Promise<void> {
  const shortages: Shortage[] = [];
  for (const item of items) {
    const changed = await tx.run(
      'UPDATE dbo.Products SET Stock = Stock - ?, UpdatedAt = SYSUTCDATETIME() WHERE Id = ? AND Stock >= ?',
      [item.quantity, item.productId, item.quantity]
    );
    if (changed === 0) {
      const row = (await tx.query<{ Stock: number }>('SELECT Stock FROM dbo.Products WHERE Id = ?', [item.productId]))[0];
      shortages.push({ name: item.name, requested: item.quantity, available: row?.Stock ?? 0 });
    }
  }
  if (shortages.length > 0) {
    throw new StockChanged(shortages);
  }
}

async function insertSale(tx: Tx, table: string, itemTable: string, keyColumn: string, sale: Sale): Promise<void> {
  await tx.run(`INSERT INTO dbo.${table} (Id, CreatedAt, Total, PaymentMethod) VALUES (?, ?, ?, ?)`, [
    sale.id,
    new Date(sale.timestamp),
    sale.total,
    sale.paymentMethod,
  ]);
  for (let i = 0; i < sale.items.length; i++) {
    const item = sale.items[i];
    await tx.run(
      `INSERT INTO dbo.${itemTable} (${keyColumn}, LineNumber, ProductId, Name, Quantity, Price) VALUES (?, ?, ?, ?, ?, ?)`,
      [sale.id, i, item.productId, item.name, item.quantity, item.price]
    );
  }
}

function normalizeProduct(p: any): ProductRow {
  const promo = p.promoPrice === undefined || p.promoPrice === null || p.promoPrice === '' ? undefined : Number(p.promoPrice);
  return {
    id: String(p.id),
    name: String(p.name),
    price: Number(p.price),
    promoPrice: promo,
    category: p.category || 'ทั่วไป',
    stock: Number(p.stock),
    minStock: Number(p.minStock),
    description: p.description || '',
    image: p.image || undefined,
  };
}

function toProduct(row: any): ProductRow {
  const product: ProductRow = {
    id: row.Id,
    name: row.Name,
    price: Number(row.Price),
    category: row.Category,
    stock: row.Stock,
    minStock: row.MinStock,
    description: row.Description,
  };
  if (row.PromoPrice !== null && row.PromoPrice !== undefined) product.promoPrice = Number(row.PromoPrice);
  if (row.Image) product.image = row.Image;
  return product;
}

function toSale(row: any, items: SaleItem[]): Sale {
  return { id: row.Id, timestamp: toIso(row.CreatedAt), total: Number(row.Total), paymentMethod: row.PaymentMethod, items };
}

function toSaleItem(row: any): SaleItem {
  return { productId: row.ProductId, name: row.Name, quantity: row.Quantity, price: Number(row.Price) };
}

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}
