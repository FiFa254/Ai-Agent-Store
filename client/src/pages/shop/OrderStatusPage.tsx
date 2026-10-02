import { useMutation, useQuery } from '@tanstack/react-query';
import { Check, CheckCircle2, Circle, Clock, X, XCircle, type LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import type { OrderStatus, PublicOrder } from '@shared/types';
import { Badge, Button, Card, ErrorBox, PageHeader, Spinner, cx } from '@/components/ui';
import { api } from '@/lib/api';
import { formatBaht, formatDateTime, ORDER_STATUS_LABELS } from '@/lib/format';

function useCountdown(iso: string | undefined) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!iso) return '';
  const ms = Math.max(0, new Date(iso).getTime() - now);
  return `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;
}

type StepState = 'done' | 'current' | 'todo' | 'failed';

const STEP_STYLE: Record<StepState, { dot: string; label: string; icon: LucideIcon }> = {
  done: { dot: 'bg-forest text-lime', label: 'text-ink', icon: Check },
  current: { dot: 'bg-lime text-lime-ink ring-4 ring-lime/35', label: 'text-ink', icon: Clock },
  todo: { dot: 'bg-surface text-line-strong ring-1 ring-line-strong', label: 'text-muted', icon: Circle },
  failed: { dot: 'bg-rose-600 text-white', label: 'text-rose-700', icon: X },
};

const FAILED: OrderStatus[] = ['cancelled', 'expired'];

function trackingSteps(o: PublicOrder): { label: string; detail?: string; state: StepState }[] {
  const failed = FAILED.includes(o.status);
  const paid = o.status === 'paid';
  return [
    { label: 'สั่งซื้อแล้ว', detail: formatDateTime(o.createdAt), state: 'done' },
    { label: ORDER_STATUS_LABELS.awaiting_payment, state: o.status === 'awaiting_payment' ? 'current' : 'done' },
    failed
      ? { label: ORDER_STATUS_LABELS[o.status], state: 'failed' }
      : { label: ORDER_STATUS_LABELS.paid, detail: o.paidAt ? formatDateTime(o.paidAt) : undefined, state: paid ? 'done' : 'todo' },
  ];
}

function OrderTracker({ order }: { order: PublicOrder }) {
  const steps = trackingSteps(order);
  return (
    <Card className="mb-6 px-5 py-6 sm:px-8">
      <ol className="grid grid-cols-3" aria-label="สถานะคำสั่งซื้อ">
        {steps.map((s, i) => {
          const Icon = STEP_STYLE[s.state].icon;
          return (
            <li key={s.label} className="relative flex flex-col items-center text-center" aria-current={s.state === 'current' ? 'step' : undefined}>
              {i > 0 && (
                <span aria-hidden className={cx('absolute right-1/2 top-4 h-0.5 w-full -translate-y-1/2', s.state === 'todo' ? 'bg-line-strong' : 'bg-forest')} />
              )}
              <span className={cx('relative flex size-8 items-center justify-center rounded-full', STEP_STYLE[s.state].dot)}>
                <Icon className="size-4" aria-hidden />
              </span>
              <span className={cx('mt-2.5 text-sm font-semibold', STEP_STYLE[s.state].label)}>{s.label}</span>
              {s.detail && <span className="mt-0.5 text-xs text-muted">{s.detail}</span>}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

export function OrderStatusPage() {
  const { orderNo = '' } = useParams();
  const [params] = useSearchParams();
  const key = params.get('key') ?? '';
  const url = `/api/public/orders/${encodeURIComponent(orderNo)}?key=${encodeURIComponent(key)}`;
  const order = useQuery({
    queryKey: ['public-order', orderNo, key],
    queryFn: () => api.get<PublicOrder>(url),
    refetchInterval: (q) => (q.state.data?.status === 'awaiting_payment' ? 5000 : false),
  });
  const cancel = useMutation({
    mutationFn: () => api.post(`/api/public/orders/${encodeURIComponent(orderNo)}/cancel?key=${encodeURIComponent(key)}`),
    onSuccess: () => order.refetch(),
  });
  const countdown = useCountdown(order.data?.expiresAt);

  if (order.isLoading) return <Spinner />;
  if (order.error || !order.data) return <ErrorBox error={order.error ?? 'ไม่พบคำสั่งซื้อ'} />;
  const o = order.data;
  const tone = o.status === 'paid' ? 'green' : o.status === 'awaiting_payment' ? 'amber' : 'red';

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={`คำสั่งซื้อ ${o.orderNo}`} description={`สั่งเมื่อ ${formatDateTime(o.createdAt)}`} actions={<Badge tone={tone}>{ORDER_STATUS_LABELS[o.status]}</Badge>} />
      <OrderTracker order={o} />

      {o.status === 'awaiting_payment' && (
        <Card className="mb-6 p-6 text-center">
          {o.promptPayQrSvg ? (
            <>
              <p className="mb-1 font-semibold">สแกนจ่ายด้วยแอปธนาคาร (พร้อมเพย์)</p>
              <p className="mb-5 font-display text-4xl font-bold tabular-nums">{formatBaht(o.total)}</p>
              <div className="qr mx-auto w-64 rounded-2xl border border-line bg-white p-3 shadow-card" dangerouslySetInnerHTML={{ __html: o.promptPayQrSvg }} />
              <p className="mt-4 text-sm text-muted">หลังโอนแล้ว พนักงานจะตรวจสอบและยืนยัน หน้านี้จะอัปเดตเอง</p>
            </>
          ) : (
            <p className="text-sm">ชำระเงิน {formatBaht(o.total)} ที่หน้าร้าน {o.storeName} แจ้งเลขคำสั่งซื้อ {o.orderNo}</p>
          )}
          <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-sm font-medium text-warn tabular-nums">
            <Clock className="size-4" aria-hidden /> กันสินค้าไว้ให้อีก {countdown} นาที
          </p>
          <div className="mt-4">
            <Button variant="secondary" size="sm" loading={cancel.isPending} onClick={() => window.confirm('ยกเลิกคำสั่งซื้อนี้?') && cancel.mutate()}>
              ยกเลิกคำสั่งซื้อ
            </Button>
          </div>
        </Card>
      )}
      {o.status === 'paid' && (
        <Card className="mb-6 flex items-center gap-4 border-lime-strong/60 bg-lime-soft p-5 text-lime-ink">
          <CheckCircle2 className="size-9 shrink-0 text-brand-700" aria-hidden />
          <div>
            <p className="font-semibold">ชำระเงินเรียบร้อย ขอบคุณค่ะ</p>
            <p className="text-sm">ใบเสร็จเลขที่ {o.receiptNo} · {o.paidAt && formatDateTime(o.paidAt)}</p>
          </div>
        </Card>
      )}
      {(o.status === 'cancelled' || o.status === 'expired') && (
        <Card className="mb-6 flex items-center gap-4 border-rose-200 bg-rose-50 p-5 text-rose-800">
          <XCircle className="size-8" aria-hidden />
          <p className="font-semibold">{o.status === 'expired' ? 'หมดเวลาชำระเงิน คำสั่งซื้อถูกยกเลิกแล้ว' : 'คำสั่งซื้อถูกยกเลิกแล้ว'}</p>
        </Card>
      )}

      <Card className="overflow-hidden">
        <table className="w-full text-sm tabular-nums">
          <tbody>
            {o.items.map((i) => (
              <tr key={i.productId} className="border-b border-line">
                <td className="px-4 py-3">{i.name}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-muted">
                  {i.quantity} × {formatBaht(i.unitPrice)}
                </td>
                <td className="px-4 py-3 text-right font-semibold">{formatBaht(i.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-subtle">
            <tr>
              <td className="px-4 py-3 font-semibold" colSpan={2}>
                รวมทั้งสิ้น (รวม VAT)
              </td>
              <td className="px-4 py-4 text-right font-display text-lg font-bold">{formatBaht(o.total)}</td>
            </tr>
          </tfoot>
        </table>
      </Card>
      <p className="mt-4 text-center text-sm text-muted">
        บันทึกลิงก์หน้านี้ไว้เพื่อติดตามสถานะ · <Link to="/" className="font-medium text-brand-700 underline underline-offset-2">กลับไปหน้าร้าน</Link>
      </p>
    </div>
  );
}
