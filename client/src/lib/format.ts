export { formatBaht } from '@shared/money';

export const formatNumber = (n: number) => new Intl.NumberFormat('th-TH').format(n);

export const formatDateTime = (iso: string) =>
  new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(new Date(iso));

export const formatDate = (ymd: string) =>
  new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${ymd}T00:00:00Z`));

/** Today in Bangkok as YYYY-MM-DD. */
export const todayBkk = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);

export const shiftDays = (ymd: string, days: number) =>
  new Date(Date.parse(`${ymd}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

export const PAYMENT_LABELS: Record<string, string> = { cash: 'เงินสด', promptpay: 'พร้อมเพย์' };
export const CHANNEL_LABELS: Record<string, string> = { pos: 'หน้าร้าน', online: 'ออนไลน์' };
export const ORDER_STATUS_LABELS: Record<string, string> = {
  awaiting_payment: 'รอชำระเงิน',
  paid: 'ชำระแล้ว',
  cancelled: 'ยกเลิก',
  expired: 'หมดเวลา',
};
