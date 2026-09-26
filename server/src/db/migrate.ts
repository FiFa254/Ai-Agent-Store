// Applies db/migrations/NNN_name.sql files in order; each file runs once, inside a transaction.
// Batches inside a file are separated by a line containing only "GO".
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Db } from './db';

function migrationsDir(): string {
  // Bundled server: dist/migrations next to dist/index.cjs. Source (tsx): src/db/migrations.
  const candidates: string[] = [];
  if (typeof __dirname !== 'undefined') candidates.push(path.resolve(__dirname, 'migrations'));
  if (import.meta.url) candidates.push(path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'migrations'));
  const found = candidates.find((dir) => fs.existsSync(dir));
  if (!found) throw new Error(`Migrations folder not found (looked in ${candidates.join(', ')})`);
  return found;
}

export async function migrate(db: Db, log: (msg: string) => void = () => undefined): Promise<string[]> {
  await db.run(`IF OBJECT_ID(N'dbo.SchemaMigrations') IS NULL
    CREATE TABLE dbo.SchemaMigrations (Name NVARCHAR(200) NOT NULL PRIMARY KEY, AppliedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME())`);

  const applied = new Set((await db.query<{ Name: string }>('SELECT Name FROM dbo.SchemaMigrations')).map((r) => r.Name));
  const dir = migrationsDir();
  const files = fs.readdirSync(dir).filter((f) => /^\d{3}_.+\.sql$/.test(f)).sort();
  const ran: string[] = [];

  for (const file of files) {
    if (applied.has(file)) continue;
    const batches = fs
      .readFileSync(path.join(dir, file), 'utf8')
      .split(/^\s*GO\s*$/im)
      .map((b) => b.trim())
      .filter(Boolean);

    await db.transaction(async (tx) => {
      for (const batch of batches) await tx.run(batch);
      await tx.run('INSERT INTO dbo.SchemaMigrations (Name) VALUES (?)', [file]);
    });
    log(`migration applied: ${file}`);
    ran.push(file);
  }
  return ran;
}
