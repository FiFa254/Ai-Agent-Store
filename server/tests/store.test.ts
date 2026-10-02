import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import request from 'supertest';
import { crc16, promptPayPayload } from '../src/lib/promptpay';
import { expireOrders } from '../src/modules/orders/service';
import { bangkokDate } from '../src/lib/time';
import { createProduct, createTestApp, createUser, dropTestDatabase, setupAdmin, type TestApp } from './helpers';

let t: TestApp;
let admin: request.Agent;
let manager: request.Agent;
let cashier: request.Agent;

before(async () => {
  t = await createTestApp();
  admin = await setupAdmin(t);
  manager = await createUser(admin, t, 'manager', 'mgr');
  cashier = await createUser(admin, t, 'cashier', 'cash');
});

after(async () => {
  await t?.db.close();
  await dropTestDatabase();
});

const stockOf = async (id: number) => (await manager.get(`/api/catalog/products/${id}`).expect(200)).body.stock;

describe('PromptPay payload', () => {
  test('CRC-16/CCITT-FALSE check value', () => {
    assert.equal(crc16('123456789'), '29B1');
  });

  test('mobile number payload with amount is well-formed and self-consistent', () => {
    const payload = promptPayPayload('081-234-5678', 105.5);
    assert.match(payload, /^000201010212/);
    assert.ok(payload.includes('0016A000000677010111011300668123456785'), 'merchant account with 0066 phone');
    assert.ok(payload.includes('5802TH5303764540' + '6105.50'), 'country, currency, amount');
    assert.equal(payload.slice(-4), crc16(payload.slice(0, -4)));
  });

  test('tax id and static QR', () => {
    const payload = promptPayPayload('1234567890123');
    assert.match(payload, /^000201010211/);
    assert.ok(payload.includes('02131234567890123'));
    assert.ok(!payload.includes('5406'));
  });
});

describe('catalog and stock', () => {
  test('manager creates categories/products; SKU is unique; promo must be below price', async () => {
    const cat = (await manager.post('/api/catalog/categories').send({ name: 'ข้าวสาร' }).expect(201)).body;
    await manager.post('/api/catalog/categories').send({ name: 'ข้าวสาร' }).expect(409);
    const p = await createProduct(manager, { categoryId: cat.id, sku: 'RICE-5KG', promoPrice: 165 });
    assert.equal(p.stock, 10);
    assert.equal(p.categoryName, 'ข้าวสาร');
    await createProduct(manager, { categoryId: cat.id, sku: 'RICE-5KG' }).catch(() => undefined);
    const dup = await manager.post('/api/catalog/products').send({ sku: 'RICE-5KG', name: 'x', price: 1, categoryId: cat.id });
    assert.equal(dup.status, 409);
    const badPromo = await manager.post('/api/catalog/products').send({ sku: 'X1', name: 'x', price: 10, promoPrice: 12, categoryId: cat.id });
    assert.equal(badPromo.status, 400);
    assert.equal(badPromo.body.fields.promoPrice, 'ราคาโปรโมชันต้องต่ำกว่าราคาปกติ');
    await manager.delete(`/api/catalog/categories/${cat.id}`).expect(400); // still has products
  });

  test('restock and adjustment write the ledger; stock never goes negative', async () => {
    const p = await createProduct(manager);
    await manager.post('/api/catalog/stock').send({ productId: p.id, change: 5, reason: 'restock', note: 'รับของ' }).expect(200);
    assert.equal(await stockOf(p.id), 15);
    const neg = await manager.post('/api/catalog/stock').send({ productId: p.id, change: -99, reason: 'adjustment' });
    assert.equal(neg.status, 409);
    assert.equal(await stockOf(p.id), 15);

    const moves = (await manager.get(`/api/catalog/stock/movements?productId=${p.id}`).expect(200)).body.items;
    assert.deepEqual(moves.map((m: any) => [m.reason, m.change, m.stockAfter]), [['restock', 5, 15], ['initial', 10, 10]]);
  });

  test('public catalog lists active products only, without staff fields', async () => {
    const p = await createProduct(manager, { name: 'สินค้าเลิกขาย' });
    await manager.delete(`/api/catalog/products/${p.id}`).expect(204);
    const catalog = (await request(t.app).get('/api/public/catalog/products').expect(200)).body;
    assert.ok(!catalog.some((c: any) => c.id === p.id));
    assert.ok(catalog.length > 0);
    assert.equal(catalog[0].sku, undefined);
  });
});

describe('POS', () => {
  test('cash sale: change, VAT, receipt number, stock deducted', async () => {
    const p = await createProduct(manager, { price: 100, promoPrice: 90 });
    const sale = (await cashier.post('/api/sales/pos').send({ items: [{ productId: p.id, quantity: 3 }], paymentMethod: 'cash', cashReceived: 500 }).expect(201)).body;
    assert.equal(sale.total, 270);
    assert.equal(sale.change, 230);
    assert.equal(sale.vatAmount, 17.66); // 270 * 7 / 107
    assert.equal(sale.subtotal, 252.34);
    assert.match(sale.receiptNo, new RegExp(`^R${bangkokDate().slice(2).replace(/-/g, '')}-\\d{4}$`));
    assert.equal(sale.cashierName, 'cash');
    assert.equal(await stockOf(p.id), 7);

    const next = (await cashier.post('/api/sales/pos').send({ items: [{ productId: p.id, quantity: 1 }], paymentMethod: 'promptpay' }).expect(201)).body;
    assert.equal(Number(next.receiptNo.slice(-4)), Number(sale.receiptNo.slice(-4)) + 1);
    assert.equal((await cashier.get(`/api/sales/${sale.receiptNo}`).expect(200)).body.items[0].quantity, 3);
  });

  test('not enough cash or stock: nothing is saved', async () => {
    const p = await createProduct(manager, { price: 50 });
    await cashier.post('/api/sales/pos').send({ items: [{ productId: p.id, quantity: 2 }], paymentMethod: 'cash', cashReceived: 20 }).expect(400);
    const tooMany = await cashier.post('/api/sales/pos').send({ items: [{ productId: p.id, quantity: 11 }], paymentMethod: 'cash', cashReceived: 1000 });
    assert.equal(tooMany.status, 409);
    assert.equal(tooMany.body.code, 'insufficient_stock');
    assert.equal(await stockOf(p.id), 10);
  });

  test('PromptPay QR needs the store PromptPay id', async () => {
    await cashier.get('/api/sales/promptpay-qr?amount=10').expect(400);
    const settings = (await admin.get('/api/settings').expect(200)).body;
    await admin.put('/api/settings').send({ ...settings, promptPayId: '0812345678' }).expect(200);
    const qr = (await cashier.get('/api/sales/promptpay-qr?amount=10').expect(200)).body;
    assert.match(qr.svg, /^<svg/);
  });
});

describe('online orders', () => {
  test('order reserves stock; staff confirm records an online sale', async () => {
    const p = await createProduct(manager, { price: 30 });
    const created = (await request(t.app)
      .post('/api/public/orders')
      .send({ customerName: 'สมชาย', customerPhone: '0812345678', items: [{ productId: p.id, quantity: 4 }] })
      .expect(201)).body;
    assert.equal(await stockOf(p.id), 6);

    await request(t.app).get(`/api/public/orders/${created.orderNo}?key=wrong`).expect(404);
    const view = (await request(t.app).get(`/api/public/orders/${created.orderNo}?key=${created.accessKey}`).expect(200)).body;
    assert.equal(view.status, 'awaiting_payment');
    assert.equal(view.total, 120);
    assert.match(view.promptPayQrSvg, /^<svg/);
    assert.equal(view.customerPhone, undefined);

    const queue = (await cashier.get('/api/orders').expect(200)).body;
    assert.ok(queue.some((o: any) => o.orderNo === created.orderNo));

    const { receiptNo } = (await cashier.post(`/api/orders/${created.orderNo}/confirm`).send({ paymentMethod: 'promptpay' }).expect(200)).body;
    await cashier.post(`/api/orders/${created.orderNo}/confirm`).send({}).expect(409);
    assert.equal(await stockOf(p.id), 6, 'no second deduction');
    const sale = (await cashier.get(`/api/sales/${receiptNo}`).expect(200)).body;
    assert.equal(sale.channel, 'online');
    assert.equal(sale.orderNo, created.orderNo);
    const paid = (await request(t.app).get(`/api/public/orders/${created.orderNo}?key=${created.accessKey}`).expect(200)).body;
    assert.equal(paid.status, 'paid');
    assert.equal(paid.promptPayQrSvg, null);
  });

  test('customer cancel and expiry give stock back', async () => {
    const p = await createProduct(manager, { price: 10 });
    const a = (await request(t.app).post('/api/public/orders').send({ customerName: 'A', customerPhone: '0899999999', items: [{ productId: p.id, quantity: 3 }] }).expect(201)).body;
    const b = (await request(t.app).post('/api/public/orders').send({ customerName: 'B', customerPhone: '0899999998', items: [{ productId: p.id, quantity: 2 }] }).expect(201)).body;
    assert.equal(await stockOf(p.id), 5);

    await request(t.app).post(`/api/public/orders/${a.orderNo}/cancel?key=${a.accessKey}`).expect(204);
    assert.equal(await stockOf(p.id), 8);

    await t.db.run('UPDATE dbo.Orders SET ExpiresAt = DATEADD(MINUTE, -1, SYSUTCDATETIME()) WHERE OrderNo = ?', [b.orderNo]);
    assert.equal(await expireOrders(t.db), 1);
    assert.equal(await stockOf(p.id), 10);
    const view = (await request(t.app).get(`/api/public/orders/${b.orderNo}?key=${b.accessKey}`).expect(200)).body;
    assert.equal(view.status, 'expired');
    await cashier.post(`/api/orders/${b.orderNo}/confirm`).send({}).expect(409);
  });

  test('ordering more than available is refused', async () => {
    const p = await createProduct(manager, { price: 10 });
    const res = await request(t.app).post('/api/public/orders').send({ customerName: 'C', customerPhone: '0811111111', items: [{ productId: p.id, quantity: 50 }] });
    assert.equal(res.status, 409);
    assert.equal(await stockOf(p.id), 10);
  });
});

describe('reports and audit', () => {
  test('dashboard and sales report match recorded sales; CSV has a BOM', async () => {
    const today = bangkokDate();
    const report = (await manager.get(`/api/reports/sales?from=${today}&to=${today}`).expect(200)).body;
    const [{ sum, bills }] = await t.db.query('SELECT CAST(SUM(Total) AS FLOAT) AS sum, COUNT(*) AS bills FROM dbo.Sales');
    assert.equal(report.totals.sales, sum);
    assert.equal(report.totals.bills, bills);
    assert.equal(report.byDay.length, 1);
    assert.ok(report.byChannel.some((c: any) => c.channel === 'online'));

    const dash = (await cashier.get('/api/reports/dashboard').expect(200)).body;
    assert.equal(dash.today.sales, sum);

    const csv = await manager.get(`/api/reports/export/sales.csv?from=${today}&to=${today}`).expect(200);
    assert.ok(csv.text.startsWith('﻿"เลขที่ใบเสร็จ"'));
    await manager.get('/api/reports/export/inventory.csv').expect(200);
  });

  test('audit log records the actions', async () => {
    const actions = (await admin.get('/api/audit?pageSize=200').expect(200)).body.items.map((a: any) => `${a.entity}:${a.action}`);
    for (const expected of ['system:setup', 'user:create', 'product:create', 'stock:restock', 'sale:sale', 'order:create', 'order:confirm_payment', 'order:cancel', 'order:expire', 'settings:update', 'report:export']) {
      assert.ok(actions.includes(expected), expected);
    }
  });
});
