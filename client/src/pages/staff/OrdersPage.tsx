import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ClipboardList, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Order, OrderStatus } from '@shared/types';
import { Badge, Button, Card, EmptyState, ErrorBox, PageHeader, Select, Spinner, useToast } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { formatBaht, formatDateTime, ORDER_STATUS_LABELS } from '@/lib/format';

const TONES: Record<OrderStatus, 'amber' | 'green' | 'red' | 'slate'> = { awaiting_payment: 'amber', paid: 'green', cancelled: 'red', expired: 'slate' };

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
      <PageHeader
        title="คำสั่งซื้อออนไลน์"
        description="ตรวจสอบยอดเงินเข้าก่อนยืนยัน สินค้าถูกกันไว้จนกว่าจะชำระหรือหมดเวลา"
        actions={
          <Select aria-label="สถานะ" value={status} onChange={(e) => setStatus(e.target.value as OrderStatus | 'all')} className="w-44">
            <option value="awaiting_payment">รอชำระเงิน</option>
            <option value="paid">ชำระแล้ว</option>
            <option value="cancelled">ยกเลิก</option>
            <option value="expired">หมดเวลา</option>
            <option value="all">ทั้งหมด</option>
          </Select>
        }
      />
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
            <Card key={o.id} className="p-5">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-lg font-bold">{o.orderNo}</p>
                  <p className="text-sm text-muted">
                    {o.customerName} · <a href={`tel:${o.customerPhone}`} className="underline">{o.customerPhone}</a>
                  </p>
                  <p className="text-xs text-muted">
                    สั่ง {formatDateTime(o.createdAt)}
                    {o.status === 'awaiting_payment' && ` · หมดเวลา ${formatDateTime(o.expiresAt)}`}
                  </p>
                </div>
                <Badge tone={TONES[o.status]}>{ORDER_STATUS_LABELS[o.status]}</Badge>
              </div>
              <ul className="mb-3 space-y-1 text-sm">
                {o.items.map((i) => (
                  <li key={i.productId} className="flex justify-between">
                    <span>
                      {i.name} × {i.quantity}
                    </span>
                    <span>{formatBaht(i.lineTotal)}</span>
                  </li>
                ))}
              </ul>
              {o.note && <p className="mb-3 rounded-lg bg-slate-50 p-2 text-sm">หมายเหตุ: {o.note}</p>}
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
                <span className="text-xl font-bold">{formatBaht(o.total)}</span>
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
