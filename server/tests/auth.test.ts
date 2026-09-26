import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import request from 'supertest';
import { ADMIN, createTestApp, createUser, dropTestDatabase, setupAdmin, type TestApp } from './helpers';

let t: TestApp;

before(async () => {
  t = await createTestApp();
});

after(async () => {
  await t.db.close();
  await dropTestDatabase();
});

describe('first-run setup', () => {
  test('needs setup, creates the first admin once, then refuses', async () => {
    assert.equal((await request(t.app).get('/api/auth/setup')).body.needsSetup, true);
    const admin = await setupAdmin(t);
    const me = (await admin.get('/api/auth/me').expect(200)).body;
    assert.equal(me.role, 'admin');
    assert.equal((await request(t.app).get('/api/public/settings')).body.storeName, ADMIN.storeName);

    await request(t.app).post('/api/auth/setup').send({ ...ADMIN, username: 'another' }).expect(409);
    assert.equal((await request(t.app).get('/api/auth/setup')).body.needsSetup, false);
  });

  test('user management needs a login', async () => {
    const res = await request(t.app).post('/api/users').send({ username: 'x', password: '123' });
    assert.equal(res.status, 401);
  });
});

describe('login', () => {
  test('wrong password, lockout after 5 failures, admin reset unlocks', async () => {
    const admin = request.agent(t.app);
    await admin.post('/api/auth/login').send({ username: ADMIN.username, password: ADMIN.password }).expect(200);
    await createUser(admin, t, 'cashier', 'locky');

    for (let i = 0; i < 5; i++) {
      const res = await request(t.app).post('/api/auth/login').send({ username: 'locky', password: 'wrong-pass1' });
      assert.equal(res.status, 401);
    }
    const locked = await request(t.app).post('/api/auth/login').send({ username: 'locky', password: 'Passw0rd1' });
    assert.equal(locked.status, 401);
    assert.match(locked.body.error, /ล็อก/);

    const users = (await admin.get('/api/users').expect(200)).body;
    const locky = users.find((u: any) => u.username === 'locky');
    assert.ok(locky.lockedUntil);
    await admin.patch(`/api/users/${locky.id}`).send({ password: 'NewPassw0rd' }).expect(200);
    await request(t.app).post('/api/auth/login').send({ username: 'locky', password: 'NewPassw0rd' }).expect(200);

    const audit = (await admin.get('/api/audit?q=login').expect(200)).body.items.map((a: any) => a.action);
    assert.ok(audit.includes('login_lockout'));
    assert.ok(audit.includes('login_failed'));
  });

  test('unknown user and deactivated user cannot log in; logout ends the session', async () => {
    await request(t.app).post('/api/auth/login').send({ username: 'nobody', password: 'Passw0rd1' }).expect(401);

    const admin = request.agent(t.app);
    await admin.post('/api/auth/login').send({ username: ADMIN.username, password: ADMIN.password }).expect(200);
    const staff = await createUser(admin, t, 'manager', 'temp_mgr');
    await staff.get('/api/auth/me').expect(200);

    const id = (await admin.get('/api/users')).body.find((u: any) => u.username === 'temp_mgr').id;
    await admin.patch(`/api/users/${id}`).send({ isActive: false }).expect(200);
    await staff.get('/api/auth/me').expect(401); // sessions were revoked
    await request(t.app).post('/api/auth/login').send({ username: 'temp_mgr', password: 'Passw0rd1' }).expect(401);

    await admin.post('/api/auth/logout').expect(204);
    await admin.get('/api/auth/me').expect(401);
  });

  test('changing own password needs the current one', async () => {
    const admin = request.agent(t.app);
    await admin.post('/api/auth/login').send({ username: ADMIN.username, password: ADMIN.password }).expect(200);
    const cashier = await createUser(admin, t, 'cashier', 'pw_user');
    await cashier.post('/api/auth/password').send({ currentPassword: 'nope', newPassword: 'Another123' }).expect(400);
    await cashier.post('/api/auth/password').send({ currentPassword: 'Passw0rd1', newPassword: 'Another123' }).expect(204);
    await request(t.app).post('/api/auth/login').send({ username: 'pw_user', password: 'Another123' }).expect(200);
  });
});

describe('roles', () => {
  test('each role reaches only its areas', async () => {
    const admin = request.agent(t.app);
    await admin.post('/api/auth/login').send({ username: ADMIN.username, password: ADMIN.password }).expect(200);
    const cashier = await createUser(admin, t, 'cashier', 'role_cashier');
    const manager = await createUser(admin, t, 'manager', 'role_manager');

    await request(t.app).get('/api/reports/dashboard').expect(401);
    await cashier.get('/api/reports/dashboard').expect(200);
    await cashier.get('/api/reports/sales?from=2026-01-01&to=2026-01-31').expect(403);
    await cashier.post('/api/catalog/categories').send({ name: 'x' }).expect(403);
    await cashier.get('/api/users').expect(403);
    await manager.get('/api/reports/sales?from=2026-01-01&to=2026-01-31').expect(200);
    await manager.post('/api/catalog/categories').send({ name: 'เครื่องดื่ม' }).expect(201);
    await manager.get('/api/users').expect(403);
    await manager.get('/api/audit').expect(403);
    await manager.put('/api/settings').send({ storeName: 'x' }).expect(403);
    await admin.get('/api/audit').expect(200);
  });

  test('admin cannot demote or deactivate the last admin (themselves)', async () => {
    const admin = request.agent(t.app);
    const me = (await admin.post('/api/auth/login').send({ username: ADMIN.username, password: ADMIN.password }).expect(200)).body;
    await admin.patch(`/api/users/${me.id}`).send({ role: 'cashier' }).expect(400);
    await admin.patch(`/api/users/${me.id}`).send({ isActive: false }).expect(400);
  });

  test('cross-site POST is refused', async () => {
    await request(t.app).post('/api/auth/login').set('Origin', 'https://evil.example').send({ username: 'a', password: 'b' }).expect(403);
  });
});
