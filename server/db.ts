// Thin async wrapper around msnodesqlv8 (SQL Server over ODBC, Windows authentication).
// One connection, with every call serialized, so a transaction always runs on the
// connection it started on. That is plenty for a single local store.
import sql from 'msnodesqlv8';

export const DEFAULT_CONNECTION_STRING =
  'Driver={ODBC Driver 17 for SQL Server};Server=localhost;Database=GroceryAI;Trusted_Connection=yes;';

export type Row = Record<string, any>;

export class Db {
  private constructor(private readonly connection: any) {}

  private queue: Promise<unknown> = Promise.resolve();

  /**
   * Creates the database named in the connection string if it does not exist, then connects to it.
   * Connects to `master` first because the target database may not exist yet.
   */
  static async connect(connectionString: string): Promise<Db> {
    const database = /(?:^|;)\s*(?:Database|Initial Catalog)\s*=\s*([^;]+)/i.exec(connectionString)?.[1]?.trim();
    if (!database || !/^[A-Za-z0-9_]+$/.test(database)) {
      throw new Error('The connection string must name a database (letters, digits, underscore), e.g. Database=GroceryAI;');
    }

    const masterConnectionString = connectionString.replace(/((?:^|;)\s*(?:Database|Initial Catalog)\s*=)\s*[^;]+/i, '$1master');
    await sql.promises.query(masterConnectionString, `IF DB_ID(N'${database}') IS NULL CREATE DATABASE [${database}]`);

    const connection = await sql.promises.open(connectionString);
    const db = new Db(connection);
    await db.run('SET XACT_ABORT ON');
    return db;
  }

  /** Rows of the first result set. */
  query<T = Row>(text: string, params: unknown[] = []): Promise<T[]> {
    return this.enqueue(async () => ((await this.connection.promises.query(text, params)).first ?? []) as T[]);
  }

  async queryOne<T = Row>(text: string, params: unknown[] = []): Promise<T | undefined> {
    return (await this.query<T>(text, params))[0];
  }

  /** Runs a statement and returns the number of rows the last statement changed. */
  run(text: string, params: unknown[] = []): Promise<number> {
    return this.enqueue(async () => {
      const counts: number[] = (await this.connection.promises.query(text, params)).counts ?? [];
      return counts.length > 0 ? counts[counts.length - 1] : 0;
    });
  }

  /**
   * Runs fn in one transaction on this connection; rolls back if it throws.
   * Other callers wait until the transaction finishes.
   */
  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.enqueue(async () => {
      const exec = async (text: string, params: unknown[] = []) => this.connection.promises.query(text, params);
      const tx: Tx = {
        query: async (text, params) => ((await exec(text, params)).first ?? []) as any[],
        run: async (text, params) => {
          const counts: number[] = (await exec(text, params)).counts ?? [];
          return counts.length > 0 ? counts[counts.length - 1] : 0;
        },
      };

      await exec('BEGIN TRANSACTION');
      try {
        const result = await fn(tx);
        await exec('COMMIT TRANSACTION');
        return result;
      } catch (err) {
        await exec('IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION').catch(() => undefined);
        throw err;
      }
    });
  }

  close(): Promise<void> {
    return this.enqueue(() => this.connection.promises.close());
  }

  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const next = this.queue.then(work, work);
    this.queue = next.catch(() => undefined);
    return next;
  }
}

export interface Tx {
  query<T = Row>(text: string, params?: unknown[]): Promise<T[]>;
  run(text: string, params?: unknown[]): Promise<number>;
}
