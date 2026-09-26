import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ClipboardList, Receipt, ShoppingCart, Wallet } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { DashboardSummary } from '@shared/types';
import { Badge, Button, Card, EmptyState, ErrorBox, PageHeader, Spinner, tableClass } from '@/components/ui';
import { can, useMe } from '@/features/auth/auth';
import { api } from '@/lib/api';
import { CHANNEL_LABELS, formatBaht, formatDateTime, formatNumber, PAYMENT_LABELS } from '@/lib/format';

function Stat({ icon, label, value, to }: { icon: ReactNode; label: string; value: string; to?: string }) {
  const body = (
    <Card className="flex items-center gap-4 p-5 transition-colors hover:border-brand-500">
      <span className="flex size-11 items-center justify-center rounded-lg bg-brand-50 text-brand-700">{icon}</span>
      <div>
        <p className="text-sm text-muted">{label}</p>
        <p className="text-2xl font-bold">{value}</p>
      </div>
    </Card>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

export function DashboardPage() {
  const me = useMe();
  const q = useQuery({ queryKey: ['dashboard'], queryFn: () => api.get<DashboardSummary>('/api/reports/dashboard'), refetchInterval: 30_000 });
  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <ErrorBox error={q.error} />;
  const d = q.data;

  return (
    <div>
      <PageHeader
        title={`สวัสดี ${me.data?.displayName ?? ''}`}
        description="ภาพรวมของวันนี้"
        actions={
          <Link to="/staff/pos">
            <Button>
              <ShoppingCart className="size-4" /> เปิดหน้าขาย
            </Button>
          </Link>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={<Wallet className="size-5" />} label="ยอดขายวันนี้" value={formatBaht(d.today.sales)} to={can(me.data, 'manager') ? '/staff/reports' : undefined} />
        <Stat icon={<Receipt className="size-5" />} label="จำนวนบิลวันนี้" value={formatNumber(d.today.bills)} to="/staff/receipts" />
        <Stat icon={<ClipboardList className="size-5" />} label="ออเดอร์รอชำระ" value={formatNumber(d.awaitingOrders)} to="/staff/orders" />
        <Stat icon={<AlertTriangle className="size-5" />} label="สินค้าใกล้หมด" value={formatNumber(d.lowStock.length)} to={can(me.data, 'manager') ? '/staff/stock' : undefined} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="border-b border-line px-5 py-3 font-semibold">บิลล่าสุด</h2>
          {d.recentSales.length === 0 ? (
            <EmptyState title="ยังไม่มีการขาย" description="เริ่มขายจากหน้า POS" />
          ) : (
            <table className={tableClass.table}>
              <tbody>
                {d.recentSales.map((s) => (
                  <tr key={s.id}>
                    <td className={tableClass.td}>
                      <Link to={`/staff/receipts/${s.receiptNo}`} className="font-medium text-brand-700 hover:underline">
                        {s.receiptNo}
                      </Link>
                      <p className="text-xs text-muted">{formatDateTime(s.createdAt)}</p>
                    </td>
                    <td className={tableClass.td}>
                      <Badge tone={s.channel === 'online' ? 'blue' : 'slate'}>{CHANNEL_LABELS[s.channel]}</Badge> <span className="text-xs text-muted">{PAYMENT_LABELS[s.paymentMethod]}</span>
                    </td>
                    <td className={`${tableClass.td} text-right font-semibold`}>{formatBaht(s.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <Card>
          <h2 className="border-b border-line px-5 py-3 font-semibold">สินค้าใกล้หมด</h2>
          {d.lowStock.length === 0 ? (
            <EmptyState title="สต็อกเพียงพอทุกรายการ" />
          ) : (
            <table className={tableClass.table}>
              <tbody>
                {d.lowStock.slice(0, 10).map((p) => (
                  <tr key={p.id}>
                    <td className={tableClass.td}>
                      {p.name}
                      <p className="text-xs text-muted">{p.sku}</p>
                    </td>
                    <td className={`${tableClass.td} text-right`}>
                      <Badge tone={p.stock === 0 ? 'red' : 'amber'}>
                        เหลือ {p.stock} / ขั้นต่ำ {p.minStock}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}
