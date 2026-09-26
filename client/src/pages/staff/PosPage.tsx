// Counter sale: scan/search products, adjust quantities, take cash (with change) or PromptPay, print receipt.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, Minus, Plus, Printer, QrCode, ScanLine, Trash2 } from 'lucide-react';
import { useMemo, useRef, useState, type FormEvent } from 'react';
import { effectivePrice, round2 } from '@shared/money';
import type { Product, Sale } from '@shared/types';
import { Button, Card, Dialog, EmptyState, ErrorBox, Input, cx, useToast } from '@/components/ui';
import { ReceiptView } from '@/features/sales/ReceiptView';
import { api, qs } from '@/lib/api';
import { formatBaht } from '@/lib/format';

interface Line {
  product: Product;
  quantity: number;
}

export function PosPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const products = useQuery({ queryKey: ['products', 'pos'], queryFn: () => api.get<Product[]>(`/api/catalog/products${qs({})}`) });
  const [search, setSearch] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [payment, setPayment] = useState<'cash' | 'promptpay' | null>(null);
  const [cashReceived, setCashReceived] = useState('');
  const [receipt, setReceipt] = useState<Sale | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const total = round2(lines.reduce((s, l) => s + effectivePrice(l.product) * l.quantity, 0));
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return (products.data ?? []).slice(0, 30);
    return (products.data ?? []).filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.barcode === q).slice(0, 30);
  }, [products.data, search]);

  const add = (p: Product) => {
    setLines((cur) => {
      const existing = cur.find((l) => l.product.id === p.id);
      const qty = (existing?.quantity ?? 0) + 1;
      if (qty > p.stock) {
        toast(`${p.name} เหลือเพียง ${p.stock}`, 'error');
        return cur;
      }
      return existing ? cur.map((l) => (l.product.id === p.id ? { ...l, quantity: qty } : l)) : [...cur, { product: p, quantity: 1 }];
    });
  };
  const setQty = (id: number, qty: number) => setLines((cur) => (qty <= 0 ? cur.filter((l) => l.product.id !== id) : cur.map((l) => (l.product.id === id ? { ...l, quantity: Math.min(qty, l.product.stock) } : l))));

  // Enter in the search box: exact barcode/SKU match adds directly (barcode scanners type + Enter).
  const onSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    const q = search.trim();
    const exact = (products.data ?? []).find((p) => p.barcode === q || p.sku.toLowerCase() === q.toLowerCase());
    const pick = exact ?? (matches.length === 1 ? matches[0] : undefined);
    if (pick) {
      add(pick);
      setSearch('');
    }
  };

  const qr = useQuery({
    queryKey: ['pos-qr', total],
    queryFn: () => api.get<{ svg: string }>(`/api/sales/promptpay-qr${qs({ amount: total })}`),
    enabled: payment === 'promptpay' && total > 0,
  });

  const sell = useMutation({
    mutationFn: () =>
      api.post<Sale>('/api/sales/pos', {
        items: lines.map((l) => ({ productId: l.product.id, quantity: l.quantity })),
        paymentMethod: payment,
        cashReceived: payment === 'cash' ? Number(cashReceived) : undefined,
      }),
    onSuccess: (sale) => {
      setReceipt(sale);
      setLines([]);
      setPayment(null);
      setCashReceived('');
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  const cash = Number(cashReceived);
  const change = cashReceived !== '' && cash >= total ? round2(cash - total) : null;
  const quickCash = [...new Set([total, Math.ceil(total / 100) * 100, Math.ceil(total / 500) * 500, 1000].filter((v) => v >= total))].slice(0, 4);

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
      <section>
        <form onSubmit={onSearchSubmit} className="mb-4">
          <Input
            ref={searchRef}
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="สแกนบาร์โค้ด หรือค้นหาชื่อ / รหัสสินค้า แล้วกด Enter"
            aria-label="ค้นหาสินค้า"
          />
        </form>
        {products.error && <ErrorBox error={products.error} />}
        {matches.length === 0 && !products.isLoading ? (
          <Card>
            <EmptyState icon={<ScanLine className="size-10" />} title={products.data?.length ? 'ไม่พบสินค้า' : 'ยังไม่มีสินค้า'} description={products.data?.length ? undefined : 'เพิ่มสินค้าที่หน้า "สินค้า" ก่อน'} />
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {matches.map((p) => (
              <button
                key={p.id}
                disabled={p.stock <= 0}
                onClick={() => add(p)}
                className="rounded-xl border border-line bg-white p-3 text-left hover:border-brand-500 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
              >
                <p className="line-clamp-2 min-h-10 text-sm font-semibold">{p.name}</p>
                <p className="text-xs text-muted">{p.sku}</p>
                <p className="mt-1 font-bold text-brand-700">{formatBaht(effectivePrice(p))}</p>
                <p className={cx('text-xs', p.stock <= p.minStock ? 'text-warn' : 'text-muted')}>คงเหลือ {p.stock}</p>
              </button>
            ))}
          </div>
        )}
      </section>

      <Card className="flex h-fit flex-col xl:sticky xl:top-6">
        <h2 className="border-b border-line px-5 py-3 font-semibold">รายการขาย</h2>
        {lines.length === 0 ? (
          <EmptyState title="ยังไม่มีสินค้า" description="สแกนหรือเลือกสินค้าทางซ้าย" />
        ) : (
          <ul className="max-h-[45vh] divide-y divide-line overflow-y-auto">
            {lines.map((l) => (
              <li key={l.product.id} className="flex items-center gap-2 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{l.product.name}</p>
                  <p className="text-xs text-muted">{formatBaht(effectivePrice(l.product))}</p>
                </div>
                <Button variant="ghost" size="sm" aria-label="ลด" onClick={() => setQty(l.product.id, l.quantity - 1)}>
                  <Minus className="size-4" />
                </Button>
                <span className="w-7 text-center text-sm font-semibold">{l.quantity}</span>
                <Button variant="ghost" size="sm" aria-label="เพิ่ม" onClick={() => setQty(l.product.id, l.quantity + 1)}>
                  <Plus className="size-4" />
                </Button>
                <span className="w-20 text-right text-sm font-semibold">{formatBaht(effectivePrice(l.product) * l.quantity)}</span>
                <Button variant="ghost" size="sm" aria-label="ลบ" onClick={() => setQty(l.product.id, 0)}>
                  <Trash2 className="size-4 text-danger" />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="border-t border-line p-5">
          <div className="mb-4 flex items-baseline justify-between">
            <span className="text-muted">ยอดชำระ</span>
            <span className="text-3xl font-bold">{formatBaht(total)}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button size="lg" variant={payment === 'cash' ? 'primary' : 'secondary'} disabled={!lines.length} onClick={() => setPayment('cash')}>
              <Banknote className="size-5" /> เงินสด
            </Button>
            <Button size="lg" variant={payment === 'promptpay' ? 'primary' : 'secondary'} disabled={!lines.length} onClick={() => setPayment('promptpay')}>
              <QrCode className="size-5" /> พร้อมเพย์
            </Button>
          </div>

          {payment === 'cash' && lines.length > 0 && (
            <div className="mt-4 space-y-3">
              <Input label="รับเงินมา (บาท)" type="number" min={0} step="0.01" inputMode="decimal" autoFocus value={cashReceived} onChange={(e) => setCashReceived(e.target.value)} />
              <div className="flex flex-wrap gap-2">
                {quickCash.map((v) => (
                  <Button key={v} size="sm" variant="secondary" onClick={() => setCashReceived(String(v))}>
                    {v === total ? 'พอดี' : formatBaht(v)}
                  </Button>
                ))}
              </div>
              <p className="flex justify-between text-lg">
                <span>เงินทอน</span>
                <span className="font-bold text-brand-700">{change === null ? '-' : formatBaht(change)}</span>
              </p>
            </div>
          )}
          {payment === 'promptpay' && lines.length > 0 && (
            <div className="mt-4 text-center">
              {qr.error ? <ErrorBox error={qr.error} /> : qr.data ? <div className="qr mx-auto w-52" dangerouslySetInnerHTML={{ __html: qr.data.svg }} /> : <p className="py-8 text-sm text-muted">กำลังสร้าง QR...</p>}
              <p className="mt-2 text-sm text-muted">ให้ลูกค้าสแกน แล้วตรวจสอบยอดเงินเข้าก่อนกดยืนยัน</p>
            </div>
          )}
          <ErrorBox error={sell.error} />
          <Button
            size="lg"
            className="mt-4 w-full"
            disabled={!lines.length || !payment || (payment === 'cash' && change === null) || (payment === 'promptpay' && !qr.data)}
            loading={sell.isPending}
            onClick={() => sell.mutate()}
          >
            {payment === 'promptpay' ? 'ยืนยันได้รับเงินแล้ว' : 'รับเงินและออกใบเสร็จ'}
          </Button>
        </div>
      </Card>

      <Dialog
        open={receipt !== null}
        onClose={() => {
          setReceipt(null);
          searchRef.current?.focus();
        }}
        title="ขายสำเร็จ"
        footer={
          <>
            <Button variant="secondary" onClick={() => setReceipt(null)}>
              ขายรายการถัดไป
            </Button>
            <Button onClick={() => window.print()}>
              <Printer className="size-4" /> พิมพ์ใบเสร็จ
            </Button>
          </>
        }
      >
        {receipt && (
          <>
            {receipt.change !== null && receipt.change > 0 && <p className="no-print mb-3 rounded-lg bg-brand-50 p-3 text-center text-lg font-bold text-brand-800">ทอนเงิน {formatBaht(receipt.change)}</p>}
            <ReceiptView sale={receipt} />
          </>
        )}
      </Dialog>
    </div>
  );
}
