import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import type { PublicOrder } from '@shared/types';
import { Badge, Button, Card, ErrorBox, PageHeader, Spinner } from '@/components/ui';
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

      {o.status === 'awaiting_payment' && (
        <Card className="mb-6 p-6 text-center">
          {o.promptPayQrSvg ? (
            <>
              <p className="mb-1 font-semibold">สแกนจ่ายด้วยแอปธนาคาร (พร้อมเพย์)</p>
              <p className="mb-4 text-3xl font-bold text-brand-700">{formatBaht(o.total)}</p>
              <div className="qr mx-auto w-64 rounded-xl border border-line bg-white p-2" dangerouslySetInnerHTML={{ __html: o.promptPayQrSvg }} />
              <p className="mt-4 text-sm text-muted">หลังโอนแล้ว พนักงานจะตรวจสอบและยืนยัน หน้านี้จะอัปเดตเอง</p>
            </>
          ) : (
            <p className="text-sm">ชำระเงิน {formatBaht(o.total)} ที่หน้าร้าน {o.storeName} แจ้งเลขคำสั่งซื้อ {o.orderNo}</p>
          )}
          <p className="mt-3 inline-flex items-center gap-1 text-sm text-warn">
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
        <Card className="mb-6 flex items-center gap-3 p-5 text-brand-800">
          <CheckCircle2 className="size-8 text-brand-600" aria-hidden />
          <div>
            <p className="font-semibold">ชำระเงินเรียบร้อย ขอบคุณค่ะ</p>
            <p className="text-sm">ใบเสร็จเลขที่ {o.receiptNo} · {o.paidAt && formatDateTime(o.paidAt)}</p>
          </div>
        </Card>
      )}
      {(o.status === 'cancelled' || o.status === 'expired') && (
        <Card className="mb-6 flex items-center gap-3 p-5 text-rose-700">
          <XCircle className="size-8" aria-hidden />
          <p className="font-semibold">{o.status === 'expired' ? 'หมดเวลาชำระเงิน คำสั่งซื้อถูกยกเลิกแล้ว' : 'คำสั่งซื้อถูกยกเลิกแล้ว'}</p>
        </Card>
      )}

      <Card>
        <table className="w-full text-sm">
          <tbody>
            {o.items.map((i) => (
              <tr key={i.productId} className="border-b border-line">
                <td className="px-4 py-3">{i.name}</td>
                <td className="px-4 py-3 text-right text-muted">
                  {i.quantity} × {formatBaht(i.unitPrice)}
                </td>
                <td className="px-4 py-3 text-right font-semibold">{formatBaht(i.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="px-4 py-3 font-semibold" colSpan={2}>
                รวมทั้งสิ้น (รวม VAT)
              </td>
              <td className="px-4 py-3 text-right text-lg font-bold">{formatBaht(o.total)}</td>
            </tr>
          </tfoot>
        </table>
      </Card>
      <p className="mt-4 text-center text-sm text-muted">
        บันทึกลิงก์หน้านี้ไว้เพื่อติดตามสถานะ · <Link to="/" className="underline">กลับไปหน้าร้าน</Link>
      </p>
    </div>
  );
}
