// Environment configuration, validated once at startup.
import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ path: path.resolve(process.cwd(), '.env'), quiet: true });
dotenv.config({ path: path.resolve(process.cwd(), '..', '.env'), quiet: true });

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().default(3000),
  HOST: z.string().default('127.0.0.1'),
  TRUST_PROXY: z.string().default('loopback'),
  MSSQL_CONNECTION_STRING: z
    .string()
    .default('Driver={ODBC Driver 17 for SQL Server};Server=localhost;Database=GroceryAI;Trusted_Connection=yes;'),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
  SESSION_HOURS: z.coerce.number().min(1).max(24 * 30).default(12),
  /** Comma-separated extra origins allowed to send non-GET requests (the app's own origin is always allowed). */
  ALLOWED_ORIGINS: z.string().default(''),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(overrides: Partial<Record<keyof Config, string>> = {}): Config {
  const parsed = schema.safeParse({ ...process.env, ...overrides });
  if (!parsed.success) {
    throw new Error(`Invalid configuration: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  }
  const config = parsed.data;
  if (config.GEMINI_API_KEY && /^MY_|^$/.test(config.GEMINI_API_KEY)) {
    config.GEMINI_API_KEY = undefined;
  }
  return config;
}
