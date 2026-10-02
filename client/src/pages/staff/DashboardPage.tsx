import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ClipboardList, Receipt, ShoppingCart, Wallet } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { DashboardSummary } from '@shared/types';
import { Badge, Card, EmptyState, ErrorBox, Spinner, StatCard, tableClass } from '@/components/ui';
import { can, useMe } from '@/features/auth/auth';
import { api } from '@/lib/api';
import { CHANNEL_LABELS, formatBaht, formatDate, formatDateTime, formatNumber, PAYMENT_LABELS, todayBkk } from '@/lib/format';

function Stat({ icon, label, value, to, featured }: { icon: ReactNode; label: string; value: string; to?: string; featured?: boolean }) {
  const body = <StatCard icon={icon} label={label} value={value} featured={featured} className={to ? 'hover:shadow-pop' : undefined} />;
  return to ? (
    <Link to={to} className="block rounded-card">
      {body}
    </Link>
  ) : (
    body
  );
}

function PanelTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-5">
      <h2 className="font-display text-lg font-semibold">{children}</h2>
      {action}
    </div>
  );
}

export function DashboardPage() {
  const me = useMe();
  const q = useQuery({ queryKey: ['dashboard'], queryFn: () => api.get<DashboardSummary>('/api/reports/dashboard'), refetchInterval: 30_000 });
  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <ErrorBox error={q.error} />;
  const d = q.data;

  return (
    <div>
      <section className="relative mb-6 flex flex-wrap items-end justify-between gap-5 overflow-hidden rounded-[1.75rem] bg-forest px-6 py-7 text-white sm:px-8">
        <div aria-hidden className="pointer-events-none absolute -right-10 -top-20 size-64 rounded-full bg-lime/10" />
        <div className="relative min-w-0">
          <p className="text-sm text-white/70">ภาพรวมของวันนี้ · {formatDate(todayBkk())}</p>
          <h1 className="mt-1 text-balance font-display text-3xl font-bold tracking-tight">สวัสดี {me.data?.displayName ?? ''}</h1>
          <p className="mt-2 text-sm text-white/75">วันนี้ขายไปแล้ว {formatNumber(d.today.items)} ชิ้น จาก {formatNumber(d.today.bills)} บิล</p>
        </div>
        <Link
          to="/staff/pos"
          className="relative inline-flex h-12 items-center gap-2 rounded-full bg-lime px-6 font-semibold text-lime-ink transition-colors hover:bg-lime-strong"
        >
          <ShoppingCart className="size-5" aria-hidden /> เปิดหน้าขาย
        </Link>
      </section>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat featured icon={<Wallet className="size-[18px]" />} label="ยอดขายวันนี้" value={formatBaht(d.today.sales)} to={can(me.data, 'manager') ? '/staff/reports' : undefined} />
        <Stat icon={<Receipt className="size-[18px]" />} label="จำนวนบิลวันนี้" value={formatNumber(d.today.bills)} to="/staff/receipts" />
        <Stat icon={<ClipboardList className="size-[18px]" />} label="ออเดอร์รอชำระ" value={formatNumber(d.awaitingOrders)} to="/staff/orders" />
        <Stat icon={<AlertTriangle className="size-[18px]" />} label="สินค้าใกล้หมด" value={formatNumber(d.lowStock.length)} to={can(me.data, 'manager') ? '/staff/stock' : undefined} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <PanelTitle action={<Link to="/staff/receipts" className="text-sm font-medium text-brand-700 hover:underline">ดูทั้งหมด</Link>}>บิลล่าสุด</PanelTitle>
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
                      <span className="flex flex-wrap items-center gap-1.5">
                        <Badge tone={s.channel === 'online' ? 'blue' : 'slate'}>{CHANNEL_LABELS[s.channel]}</Badge>
                        <span className="text-xs text-muted">{PAYMENT_LABELS[s.paymentMethod]}</span>
                      </span>
                    </td>
                    <td className={`${tableClass.td} text-right font-semibold`}>{formatBaht(s.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <Card className="overflow-hidden">
          <PanelTitle>สินค้าใกล้หมด</PanelTitle>
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
