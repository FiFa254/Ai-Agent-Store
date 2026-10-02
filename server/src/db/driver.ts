import { Connection, Request, TYPES } from 'tedious';

export type Row = Record<string, any>;

export interface QueryResult {
  first?: Row[];
  counts?: number[];
}

export interface Conn {
  promises: {
    query(text: string, params?: unknown[], options?: { timeoutMs?: number }): Promise<QueryResult>;
    close(): Promise<void>;
  };
}

const REQUEST_TIMEOUT_MS = 30_000;
const CONNECT_TIMEOUT_MS = 15_000;
const INT32_MAX = 2_147_483_647;
const ODBC_MODULE = 'msnodesqlv8';

export const usesOdbc = (connectionString: string) =>
  /(?:^|;)\s*(?:Driver|DSN)\s*=/i.test(connectionString) || /Trusted_Connection\s*=\s*(?:yes|true)/i.test(connectionString);

export async function openConnection(connectionString: string): Promise<Conn> {
  return usesOdbc(connectionString) ? openOdbc(connectionString) : openTedious(connectionString);
}

export async function runOnce(connectionString: string, text: string): Promise<void> {
  const conn = await openConnection(connectionString);
  try {
    await conn.promises.query(text);
  } finally {
    await conn.promises.close().catch(() => undefined);
  }
}

async function openOdbc(connectionString: string): Promise<Conn> {
  let odbc: any;
  try {
    const mod: any = await import(ODBC_MODULE);
    odbc = mod.default ?? mod;
  } catch {
    throw new Error(
      'This connection string needs the ODBC driver (msnodesqlv8, Windows only). ' +
        'Use a SQL login string instead, e.g. Server=localhost,1433;Database=GroceryAI;User Id=sa;Password=...;TrustServerCertificate=true;'
    );
  }
  return odbc.promises.open(connectionString);
}

export function parseConnectionString(connectionString: string): Record<string, string> {
  const result: Record<string, string> = {};
  let i = 0;
  const s = connectionString;
  while (i < s.length) {
    const eq = s.indexOf('=', i);
    if (eq === -1) break;
    const key = s.slice(i, eq).trim().toLowerCase().replace(/\s+/g, '');
    i = eq + 1;
    while (s[i] === ' ') i++;
    let value = '';
    const quote = s[i] === '{' ? '}' : s[i] === '"' || s[i] === "'" ? s[i] : '';
    if (quote) {
      i++;
      while (i < s.length) {
        if (s[i] === quote) {
          if (quote !== '}' && s[i + 1] === quote) {
            value += quote;
            i += 2;
            continue;
          }
          break;
        }
        value += s[i++];
      }
      i = s.indexOf(';', i);
      i = i === -1 ? s.length : i + 1;
    } else {
      const end = s.indexOf(';', i);
      value = s.slice(i, end === -1 ? s.length : end).trim();
      i = end === -1 ? s.length : end + 1;
    }
    if (key) result[key] = value;
  }
  return result;
}

const first = (map: Record<string, string>, ...keys: string[]) => keys.map((k) => map[k]).find((v) => v !== undefined);
const asBool = (value: string | undefined, fallback: boolean) =>
  value === undefined ? fallback : /^(true|yes|1|mandatory|strict)$/i.test(value.trim());

export function tediousConfig(connectionString: string) {
  const map = parseConnectionString(connectionString);
  const serverValue = (first(map, 'server', 'datasource', 'address', 'addr', 'networkaddress') ?? 'localhost').replace(/^tcp:/i, '');
  const [hostAndInstance, portText] = serverValue.split(',');
  const [host, instanceName] = hostAndInstance!.trim().split('\\');
  const userName = first(map, 'userid', 'uid', 'user');
  const password = first(map, 'password', 'pwd');
  if (!userName || password === undefined) {
    throw new Error('The connection string needs User Id and Password (SQL login). Windows login works only with an ODBC "Driver=..." string.');
  }
  const port = portText ? Number(portText) : undefined;
  return {
    server: host || 'localhost',
    authentication: { type: 'default' as const, options: { userName, password } },
    options: {
      database: first(map, 'database', 'initialcatalog'),
      ...(instanceName ? { instanceName } : {}),
      ...(port ? { port } : {}),
      encrypt: asBool(map.encrypt, true),
      trustServerCertificate: asBool(map.trustservercertificate, false),
      connectTimeout: Number(first(map, 'connecttimeout', 'connectiontimeout')) * 1000 || CONNECT_TIMEOUT_MS,
      requestTimeout: REQUEST_TIMEOUT_MS,
      useUTC: true,
    },
  };
}

function openTedious(connectionString: string): Promise<Conn> {
  const connection = new Connection(tediousConfig(connectionString));
  return new Promise<Conn>((resolve, reject) => {
    connection.connect((err) => {
      if (err) return reject(err);
      connection.on('error', () => undefined);
      resolve({
        promises: {
          query: (text, params = [], options) => runQuery(connection, text, params, options?.timeoutMs),
          close: () =>
            new Promise<void>((done) => {
              connection.once('end', () => done());
              connection.close();
            }),
        },
      });
    });
  });
}

export function toPlaceholders(text: string): { sql: string; count: number } {
  let sql = '';
  let count = 0;
  let inString = false;
  for (const ch of text) {
    if (ch === "'") inString = !inString;
    sql += ch === '?' && !inString ? `@p${count++}` : ch;
  }
  return { sql, count };
}

function parameterType(value: unknown) {
  if (typeof value === 'string') return TYPES.NVarChar;
  if (typeof value === 'boolean') return TYPES.Bit;
  if (typeof value === 'bigint') return TYPES.BigInt;
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) return TYPES.Float;
    return Math.abs(value) <= INT32_MAX ? TYPES.Int : TYPES.BigInt;
  }
  if (value instanceof Date) return TYPES.DateTime2;
  if (Buffer.isBuffer(value)) return TYPES.VarBinary;
  return TYPES.NVarChar;
}

function runQuery(connection: Connection, text: string, params: unknown[], timeoutMs?: number): Promise<QueryResult> {
  const { sql, count } = toPlaceholders(text);
  if (count !== params.length) {
    return Promise.reject(new Error(`Query expects ${count} parameters but got ${params.length}`));
  }
  return new Promise<QueryResult>((resolve, reject) => {
    const recordsets: Row[][] = [];
    const counts: number[] = [];
    const request = new Request(sql, (err) => (err ? reject(err) : resolve({ first: recordsets[0], counts })));
    if (timeoutMs) request.setTimeout(timeoutMs);
    request.on('columnMetadata', () => recordsets.push([]));
    request.on('row', (columns: any[]) => {
      const row: Row = {};
      for (const column of columns) {
        const name: string = column.metadata.colName;
        if (name in row) continue;
        const isBigInt = column.metadata.type?.name === 'BigInt';
        row[name] = isBigInt && column.value !== null ? Number(column.value) : column.value;
      }
      recordsets[recordsets.length - 1]!.push(row);
    });
    const collect = (rowCount?: number) => {
      if (typeof rowCount === 'number') counts.push(rowCount);
    };
    request.on('doneInProc', collect);
    request.on('doneProc', collect);
    request.on('done', collect);
    params.forEach((value, index) => {
      request.addParameter(`p${index}`, parameterType(value), value ?? null);
    });
    if (params.length === 0) connection.execSqlBatch(request);
    else connection.execSql(request);
  });
}
