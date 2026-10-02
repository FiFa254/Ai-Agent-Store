import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ClipboardList, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Order, OrderStatus } from '@shared/types';
import { Badge, Button, Card, EmptyState, ErrorBox, PageHeader, Spinner, cx, useToast } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { formatBaht, formatDateTime, ORDER_STATUS_LABELS } from '@/lib/format';

const TONES: Record<OrderStatus, 'amber' | 'green' | 'red' | 'slate'> = { awaiting_payment: 'amber', paid: 'green', cancelled: 'red', expired: 'slate' };
const STATUS_FILTERS: { value: OrderStatus | 'all'; label: string }[] = [
  { value: 'awaiting_payment', label: 'รอชำระเงิน' },
  { value: 'paid', label: 'ชำระแล้ว' },
  { value: 'cancelled', label: 'ยกเลิก' },
  { value: 'expired', label: 'หมดเวลา' },
  { value: 'all', label: 'ทั้งหมด' },
];

export function OrdersPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState<OrderStatus | 'all'>('awaiting_payment');
  const orders = useQuery({ queryKey: ['orders', status], queryFn: () => api.get<Order[]>(`/api/orders?status=${status}`), refetchInterval: 15_000 });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['orders'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };
  const confirm = useMutation({
    mutationFn: ({ orderNo, method }: { orderNo: string; method: 'promptpay' | 'cash' }) => api.post<{ receiptNo: string }>(`/api/orders/${orderNo}/confirm`, { paymentMethod: method }),
    onSuccess: (r) => {
      toast(`ยืนยันการชำระแล้ว ใบเสร็จ ${r.receiptNo}`);
      refresh();
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  });
  const cancel = useMutation({
    mutationFn: (orderNo: string) => api.post(`/api/orders/${orderNo}/cancel`),
    onSuccess: () => {
      toast('ยกเลิกคำสั่งซื้อและคืนสต็อกแล้ว', 'info');
      refresh();
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  });

  return (
    <div>
      <PageHeader title="คำสั่งซื้อออนไลน์" description="ตรวจสอบยอดเงินเข้าก่อนยืนยัน สินค้าถูกกันไว้จนกว่าจะชำระหรือหมดเวลา" />
      <div className="-mt-2 mb-6 flex gap-2 overflow-x-auto pb-1" role="group" aria-label="สถานะ">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            aria-pressed={status === f.value}
            onClick={() => setStatus(f.value)}
            className={cx(
              'h-9 shrink-0 rounded-full border px-4 text-sm font-medium transition-colors cursor-pointer',
              status === f.value ? 'border-forest bg-forest text-white' : 'border-line-strong bg-surface text-ink hover:border-forest/40'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>
      {orders.isLoading ? (
        <Spinner />
      ) : orders.error ? (
        <ErrorBox error={orders.error} />
      ) : orders.data!.length === 0 ? (
        <Card>
          <EmptyState icon={<ClipboardList className="size-10" />} title="ไม่มีคำสั่งซื้อ" description={status === 'awaiting_payment' ? 'ออเดอร์จากหน้าร้านออนไลน์จะแสดงที่นี่' : undefined} />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {orders.data!.map((o) => (
            <Card key={o.id} className="flex flex-col p-5">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-display text-lg font-bold tracking-tight">{o.orderNo}</p>
                  <p className="mt-0.5 text-sm text-muted">
                    {o.customerName} · <a href={`tel:${o.customerPhone}`} className="font-medium text-brand-700 underline underline-offset-2">{o.customerPhone}</a>
                  </p>
                  <p className="text-xs text-muted">
                    สั่ง {formatDateTime(o.createdAt)}
                    {o.status === 'awaiting_payment' && ` · หมดเวลา ${formatDateTime(o.expiresAt)}`}
                  </p>
                </div>
                <Badge tone={TONES[o.status]}>{ORDER_STATUS_LABELS[o.status]}</Badge>
              </div>
              <ul className="mb-3 space-y-1.5 text-sm tabular-nums">
                {o.items.map((i) => (
                  <li key={i.productId} className="flex justify-between">
                    <span>
                      {i.name} × {i.quantity}
                    </span>
                    <span>{formatBaht(i.lineTotal)}</span>
                  </li>
                ))}
              </ul>
              {o.note && <p className="mb-3 rounded-xl bg-subtle px-3 py-2 text-sm ring-1 ring-line">หมายเหตุ: {o.note}</p>}
              <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
                <span className="font-display text-xl font-bold tabular-nums">{formatBaht(o.total)}</span>
                {o.status === 'awaiting_payment' ? (
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" size="sm" loading={cancel.isPending && cancel.variables === o.orderNo} onClick={() => window.confirm(`ยกเลิก ${o.orderNo} และคืนสต็อก?`) && cancel.mutate(o.orderNo)}>
                      <X className="size-4" /> ยกเลิก
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => confirm.mutate({ orderNo: o.orderNo, method: 'cash' })}>
                      รับเงินสด
                    </Button>
                    <Button size="sm" loading={confirm.isPending && confirm.variables?.orderNo === o.orderNo} onClick={() => confirm.mutate({ orderNo: o.orderNo, method: 'promptpay' })}>
                      <Check className="size-4" /> ยืนยันโอนแล้ว
                    </Button>
                  </div>
                ) : (
                  o.receiptNo && (
                    <Link to={`/staff/receipts/${o.receiptNo}`} className="text-sm font-semibold text-brand-700 hover:underline">
                      ใบเสร็จ {o.receiptNo}
                    </Link>
                  )
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
