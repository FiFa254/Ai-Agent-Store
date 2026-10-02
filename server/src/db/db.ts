// SQL Server access through msnodesqlv8 (ODBC, Windows authentication).
// A small pool of connections: reads run in parallel, a transaction holds one connection until it ends.
import { openConnection, runOnce, type Conn, type Row } from './driver';

export type { Row };

export interface Queryable {
  query<T = Row>(text: string, params?: unknown[]): Promise<T[]>;
  queryOne<T = Row>(text: string, params?: unknown[]): Promise<T | undefined>;
  /** Rows changed by the last statement. */
  run(text: string, params?: unknown[]): Promise<number>;
}

const lastCount = (result: { counts?: number[] }) => {
  const counts: number[] = result?.counts ?? [];
  return counts.length > 0 ? counts[counts.length - 1] : 0;
};

export class Db implements Queryable {
  private readonly idle: Conn[] = [];
  private readonly waiters: ((c: Conn) => void)[] = [];
  private closed = false;

  private constructor(private readonly all: Conn[], readonly databaseName: string) {
    this.idle.push(...all);
  }

  /** Creates the database named in the connection string when missing, then opens `size` connections. */
  static async connect(connectionString: string, size = 4): Promise<Db> {
    const database = databaseName(connectionString);
    const master = connectionString.replace(/((?:^|;)\s*(?:Database|Initial Catalog)\s*=)\s*[^;]+/i, '$1master');
    await runOnce(master, `IF DB_ID(N'${database}') IS NULL CREATE DATABASE [${database}]`).catch(() => undefined);

    const connections: Conn[] = [];
    for (let i = 0; i < size; i++) {
      const c: Conn = await openConnection(connectionString);
      await c.promises.query('SET XACT_ABORT ON');
      connections.push(c);
    }
    return new Db(connections, database);
  }

  async query<T = Row>(text: string, params: unknown[] = []): Promise<T[]> {
    return this.use(async (c) => ((await c.promises.query(text, params)).first ?? []) as T[]);
  }

  async queryOne<T = Row>(text: string, params: unknown[] = []): Promise<T | undefined> {
    return (await this.query<T>(text, params))[0];
  }

  async run(text: string, params: unknown[] = []): Promise<number> {
    return this.use(async (c) => lastCount(await c.promises.query(text, params)));
  }

  /** Runs fn inside one transaction on one connection; rolls back if fn throws. */
  async transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
    return this.use(async (c) => {
      const tx: Queryable = {
        query: async <R = Row>(text: string, params: unknown[] = []) => ((await c.promises.query(text, params)).first ?? []) as R[],
        queryOne: async <R = Row>(text: string, params: unknown[] = []) => (((await c.promises.query(text, params)).first ?? []) as R[])[0],
        run: async (text: string, params: unknown[] = []) => lastCount(await c.promises.query(text, params)),
      };
      await c.promises.query('BEGIN TRANSACTION');
      try {
        const result = await fn(tx);
        await c.promises.query('COMMIT TRANSACTION');
        return result;
      } catch (err) {
        await c.promises.query('IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION').catch(() => undefined);
        throw err;
      }
    });
  }

  async close(): Promise<void> {
    this.closed = true;
    await Promise.all(this.all.map((c) => c.promises.close().catch(() => undefined)));
  }

  private async use<T>(work: (c: Conn) => Promise<T>): Promise<T> {
    if (this.closed) throw new Error('Database is closed');
    const c = this.idle.pop() ?? (await new Promise<Conn>((resolve) => this.waiters.push(resolve)));
    try {
      return await work(c);
    } finally {
      const next = this.waiters.shift();
      if (next) next(c);
      else this.idle.push(c);
    }
  }
}

export function databaseName(connectionString: string): string {
  const name = /(?:^|;)\s*(?:Database|Initial Catalog)\s*=\s*([^;]+)/i.exec(connectionString)?.[1]?.trim();
  if (!name || !/^[A-Za-z0-9_]+$/.test(name)) {
    throw new Error('The connection string must name a database (letters, digits, underscore), e.g. Database=GroceryAI;');
  }
  return name;
}
