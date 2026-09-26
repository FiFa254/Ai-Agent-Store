// Money helpers shared by the server (receipts) and the client (display).
// Prices include VAT; VAT is extracted from the total.

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** VAT portion of a VAT-inclusive total. */
export const vatFromInclusive = (total: number, vatRate: number) =>
  vatRate > 0 ? round2((total * vatRate) / (100 + vatRate)) : 0;

export const formatBaht = (n: number) =>
  new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 2 }).format(n);

export const effectivePrice = (p: { price: number; promoPrice: number | null }) => p.promoPrice ?? p.price;
