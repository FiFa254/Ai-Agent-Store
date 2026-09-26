// Thai QR Payment (PromptPay) payload, EMVCo merchant-presented format, and its QR code.
// Spec summary: ID 00 format, 01 point of initiation (12 = dynamic, has amount), 29 PromptPay
// merchant account (AID A000000677010111 + 01 phone / 02 tax id / 03 e-wallet), 53 currency 764,
// 54 amount, 58 country TH, 63 CRC-16/CCITT-FALSE over the whole payload including "6304".
import QRCode from 'qrcode';

const PROMPTPAY_AID = 'A000000677010111';

const field = (id: string, value: string) => `${id}${value.length.toString().padStart(2, '0')}${value}`;

export function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** Normalizes a mobile number (0812345678 → 0066812345678) or keeps a 13-digit tax id / 15-digit e-wallet id. */
function target(id: string): { tag: string; value: string } {
  const digits = id.replace(/\D/g, '');
  if (digits.length === 10 && digits.startsWith('0')) return { tag: '01', value: `0066${digits.slice(1)}` };
  if (digits.length === 13) return { tag: '02', value: digits };
  if (digits.length === 15) return { tag: '03', value: digits };
  throw new Error('PromptPay ID must be a 10-digit mobile number, 13-digit tax id or 15-digit e-wallet id');
}

export function promptPayPayload(promptPayId: string, amount?: number): string {
  const t = target(promptPayId);
  const parts = [
    field('00', '01'),
    field('01', amount ? '12' : '11'),
    field('29', field('00', PROMPTPAY_AID) + field(t.tag, t.value)),
    field('58', 'TH'),
    field('53', '764'),
    ...(amount ? [field('54', amount.toFixed(2))] : []),
  ];
  const withoutCrc = parts.join('') + '6304';
  return withoutCrc + crc16(withoutCrc);
}

export async function promptPayQrSvg(promptPayId: string, amount: number): Promise<string> {
  return QRCode.toString(promptPayPayload(promptPayId, amount), { type: 'svg', errorCorrectionLevel: 'M', margin: 2 });
}
