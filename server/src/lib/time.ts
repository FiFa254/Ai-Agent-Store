// The store runs in Thailand (UTC+7, no daylight saving). Business days, receipt numbers
// and reports use Bangkok dates; the database stores UTC.
const OFFSET_MS = 7 * 60 * 60 * 1000;

/** YYYY-MM-DD in Bangkok for the given instant. */
export const bangkokDate = (d = new Date()) => new Date(d.getTime() + OFFSET_MS).toISOString().slice(0, 10);

/** UTC instant at 00:00 Bangkok time of the given YYYY-MM-DD. */
export const bangkokDayStartUtc = (ymd: string) => new Date(Date.parse(`${ymd}T00:00:00Z`) - OFFSET_MS).toISOString();

export const addDays = (ymd: string, days: number) =>
  new Date(Date.parse(`${ymd}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

export const toIso = (value: unknown): string =>
  value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();

export const toIsoOrNull = (value: unknown): string | null => (value === null || value === undefined ? null : toIso(value));
