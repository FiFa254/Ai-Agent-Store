// Test harness: a fresh GroceryAI_Test database (migrated) and the real Express app.
import request from 'supertest';
import type { Role } from '@shared/schemas';
import { createApp } from '../src/app';
import { loadConfig } from '../src/config';
import { Db } from '../src/db/db';
import { runOnce } from '../src/db/driver';
import { migrate } from '../src/db/migrate';
import { createLogger } from '../src/lib/logger';

export const TEST_CONNECTION_STRING =
  process.env.MSSQL_TEST_CONNECTION_STRING ||
  'Driver={ODBC Driver 17 for SQL Server};Server=localhost;Database=GroceryAI_Test;Trusted_Connection=yes;';

export async function dropTestDatabase() {
  const master = TEST_CONNECTION_STRING.replace(/Database=[^;]+/i, 'Database=master');
  await runOnce(
    master,
    `IF DB_ID(N'GroceryAI_Test') IS NOT NULL
     BEGIN ALTER DATABASE GroceryAI_Test SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE GroceryAI_Test; END`
  );
}

export async function createTestApp() {
  await dropTestDatabase();
  const db = await Db.connect(TEST_CONNECTION_STRING, 2);
  await migrate(db);
  const config = loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent', GEMINI_API_KEY: '' });
  const app = createApp({ db, config, logger: createLogger('silent') });
  return { db, app };
}

export type TestApp = Awaited<ReturnType<typeof createTestApp>>;

export const ADMIN = { username: 'owner', displayName: 'Owner', password: 'Admin1234', storeName: 'ร้านทดสอบ' };

/** Runs first-run setup and returns a logged-in admin agent. */
export async function setupAdmin(t: TestApp) {
  const agent = request.agent(t.app);
  await agent.post('/api/auth/setup').send(ADMIN).expect(201);
  return agent;
}

export async function createUser(admin: request.Agent, t: TestApp, role: Role, username: string = role) {
  await admin.post('/api/users').send({ username, displayName: username, password: 'Passw0rd1', role }).expect(201);
  const agent = request.agent(t.app);
  await agent.post('/api/auth/login').send({ username, password: 'Passw0rd1' }).expect(200);
  return agent;
}

/** Category + product with stock, created by a manager/admin agent. */
export async function createProduct(agent: request.Agent, over: Record<string, unknown> = {}) {
  let categoryId = over.categoryId as number | undefined;
  if (!categoryId) {
    const cats = (await agent.get('/api/catalog/categories').expect(200)).body;
    categoryId = cats[0]?.id ?? (await agent.post('/api/catalog/categories').send({ name: 'ของแห้ง' }).expect(201)).body.id;
  }
  const res = await agent
    .post('/api/catalog/products')
    .send({ sku: `SKU${Math.random().toString(36).slice(2, 8)}`, name: 'ข้าวหอมมะลิ 5 กก.', price: 185, categoryId, initialStock: 10, minStock: 3, ...over })
    .expect(201);
  return res.body;
}
