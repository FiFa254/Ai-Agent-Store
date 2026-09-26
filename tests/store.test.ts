// Integration tests against the local SQL Server (database GroceryAI_Test, recreated for each run).
// Run: npm test   (override the server with MSSQL_TEST_CONNECTION_STRING)
import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import sql from 'msnodesqlv8';
import { Store } from '../server/store';

const CONNECTION_STRING =
  process.env.MSSQL_TEST_CONNECTION_STRING ||
  'Driver={ODBC Driver 17 for SQL Server};Server=localhost;Database=GroceryAI_Test;Trusted_Connection=yes;';

let store: Store;

async function dropTestDatabase() {
  const master = CONNECTION_STRING.replace(/Database=[^;]+/i, 'Database=master');
  await sql.promises.query(
    master,
    `IF DB_ID(N'GroceryAI_Test') IS NOT NULL
     BEGIN
       ALTER DATABASE GroceryAI_Test SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
       DROP DATABASE GroceryAI_Test;
     END`
  );
}

before(async () => {
  await dropTestDatabase();
  store = await Store.open(CONNECTION_STRING);
});

after(async () => {
  await store.close();
  await dropTestDatabase();
});

beforeEach(async () => {
  await store.db.run(
    'DELETE FROM dbo.SaleItems; DELETE FROM dbo.Sales; DELETE FROM dbo.PendingCheckoutItems; ' +
      'DELETE FROM dbo.PendingCheckouts; DELETE FROM dbo.StockAlerts; DELETE FROM dbo.Products;'
  );
  await store.seed({ demo: true });
});

const stockOf = async (id: string) => (await store.getProduct(id))!.stock;

describe('seed', () => {
  test('inserts the demo products once and opens alerts for low stock', async () => {
    const products = await store.listProducts();
    assert.equal(products.length, 10);
    assert.equal(products[0].id, 'prod_1');
    assert.equal(products[0].name, 'ข้าวหอมมะลิ คัดพิเศษ (5 กก.)');
    assert.equal(products[0].promoPrice, 165);
    assert.equal(products[1].promoPrice, undefined);

    const open = (await store.listAlerts()).filter((a) => !a.resolved).map((a) => a.productId).sort();
    assert.deepEqual(open, ['prod_2', 'prod_6']);

    assert.equal(await store.seed({ demo: true }), 'existing');
    assert.equal((await store.listProducts()).length, 10);
  });

  test('starts empty unless demo data is requested', async () => {
    await store.db.run('DELETE FROM dbo.StockAlerts; DELETE FROM dbo.Products;');
    assert.equal(await store.seed(), 'empty');
    assert.equal((await store.listProducts()).length, 0);
  });

  test('imports legacy data/*.json when the database is empty', async () => {
    await store.db.run('DELETE FROM dbo.StockAlerts; DELETE FROM dbo.Products;');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grocery-json-'));
    fs.writeFileSync(path.join(dir, 'products.json'), JSON.stringify([
      { id: 'old_1', name: 'สินค้าเก่า', price: 10, category: 'ทั่วไป', stock: 1, minStock: 2, description: '' },
    ]));
    fs.writeFileSync(path.join(dir, 'sales.json'), JSON.stringify([
      { id: 'sale_old', timestamp: '2026-01-02T03:04:05.000Z', total: 20, paymentMethod: 'cash',
        items: [{ productId: 'old_1', name: 'สินค้าเก่า', quantity: 2, price: 10 }] },
    ]));

    assert.equal(await store.seed({ legacyJsonDir: dir }), 'imported');
    assert.deepEqual((await store.listProducts()).map((p) => p.id), ['old_1']);
    const sales = await store.listSales();
    assert.equal(sales.length, 1);
    assert.equal(sales[0].timestamp, '2026-01-02T03:04:05.000Z');
    assert.equal(sales[0].items[0].quantity, 2);
    fs.rmSync(dir, { recursive: true });
  });
});

describe('products', () => {
  test('upsert updates an existing product and creates a new one', async () => {
    await store.upsertProduct({ id: 'prod_1', name: 'ข้าวหอมมะลิ', price: 200, stock: 50, minStock: 4 } as any);
    const updated = (await store.getProduct('prod_1'))!;
    assert.equal(updated.price, 200);
    assert.equal(updated.promoPrice, undefined);
    assert.equal(updated.stock, 50);

    const created = await store.upsertProduct({ name: 'ชาเขียว', price: 25, stock: 1, minStock: 3 } as any);
    assert.match(created.id, /^prod_/);
    assert.equal((await store.listProducts()).at(-1)!.id, created.id);
    assert.ok((await store.listAlerts()).some((a) => a.productId === created.id && !a.resolved));
  });

  test('delete removes the product and its open alerts', async () => {
    assert.equal(await store.deleteProduct('prod_2'), true);
    assert.equal(await store.getProduct('prod_2'), undefined);
    assert.ok(!(await store.listAlerts()).some((a) => a.productId === 'prod_2'));
    assert.equal(await store.deleteProduct('nope'), false);
  });

  test('resolve alert', async () => {
    const alert = (await store.listAlerts())[0];
    assert.equal(await store.resolveAlert(alert.id), true);
    assert.equal((await store.listAlerts()).find((a) => a.id === alert.id)!.resolved, true);
  });
});

describe('checkout', () => {
  test('prices the cart with promo prices and rejects bad input', async () => {
    const priced = await store.priceCart([{ productId: 'prod_1', quantity: 2 }, { productId: 'prod_2', quantity: 1 }]);
    assert.ok(priced.ok);
    if (priced.ok) assert.equal(priced.total, 165 * 2 + 95);

    const zero = await store.priceCart([{ productId: 'prod_1', quantity: 0 }]);
    assert.equal(zero.ok, false);
    const missing = await store.priceCart([{ productId: 'nope', quantity: 1 }]);
    assert.ok(missing.ok === false && missing.status === 404);
    const tooMany = await store.priceCart([{ productId: 'prod_6', quantity: 3 }]);
    assert.ok(tooMany.ok === false && tooMany.details![0].available === 2);
  });

  test('cash sale deducts stock and records the sale in one step', async () => {
    const priced = await store.priceCart([{ productId: 'prod_1', quantity: 2 }]);
    assert.ok(priced.ok);
    if (!priced.ok) return;

    const result = await store.completeSale(priced.items, priced.total, 'cash');
    assert.ok(result.ok);
    assert.equal(await stockOf('prod_1'), 10);

    const [sale] = await store.listSales();
    assert.equal(sale.paymentMethod, 'cash');
    assert.equal(sale.total, 330);
    assert.deepEqual(sale.items, [{ productId: 'prod_1', name: 'ข้าวหอมมะลิ คัดพิเศษ (5 กก.)', quantity: 2, price: 165 }]);
  });

  test('QR order: no stock change until confirmed, then only once', async () => {
    const priced = await store.priceCart([{ productId: 'prod_3', quantity: 5 }]);
    if (!priced.ok) throw new Error('priceCart failed');

    const pending = await store.createPending(priced.items, priced.total, 'promptpay');
    assert.equal(await stockOf('prod_3'), 35);
    assert.equal((await store.listSales()).length, 0);

    const confirmed = await store.confirmPending(pending.id);
    assert.ok(confirmed.ok);
    assert.equal(await stockOf('prod_3'), 30);
    assert.equal((await store.listSales()).length, 1);

    const again = await store.confirmPending(pending.id);
    assert.ok(again.ok === false && again.status === 404);
    assert.equal(await stockOf('prod_3'), 30);
  });

  test('QR order is dropped when stock ran out before confirmation', async () => {
    const priced = await store.priceCart([{ productId: 'prod_6', quantity: 2 }]);
    if (!priced.ok) throw new Error('priceCart failed');
    const pending = await store.createPending(priced.items, priced.total, 'promptpay');

    const cash = await store.priceCart([{ productId: 'prod_6', quantity: 1 }]);
    if (!cash.ok) throw new Error('priceCart failed');
    await store.completeSale(cash.items, cash.total, 'cash');

    const result = await store.confirmPending(pending.id);
    assert.ok(result.ok === false && result.status === 400 && result.details![0].available === 1);
    assert.equal(await stockOf('prod_6'), 1);
    assert.equal(await store.getPending(pending.id), undefined);
  });

  test('cancel removes the pending order', async () => {
    const priced = await store.priceCart([{ productId: 'prod_1', quantity: 1 }]);
    if (!priced.ok) throw new Error('priceCart failed');
    const pending = await store.createPending(priced.items, priced.total, 'promptpay');

    await store.cancelPending(pending.id);
    assert.equal(await store.getPending(pending.id), undefined);
    assert.equal(await stockOf('prod_1'), 12);
  });

  test('a failed sale rolls back every stock change', async () => {
    const items = [
      { productId: 'prod_1', name: 'a', quantity: 1, price: 1 },
      { productId: 'prod_6', name: 'b', quantity: 99, price: 1 },
    ];
    const result = await store.completeSale(items, 2, 'cash');
    assert.ok(!result.ok);
    assert.equal(await stockOf('prod_1'), 12);
    assert.equal((await store.listSales()).length, 0);
  });
});
