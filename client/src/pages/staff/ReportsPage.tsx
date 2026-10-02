import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { SalesReport } from '@shared/types';
import { Card, EmptyState, ErrorBox, Input, PageHeader, Spinner, StatCard, cx, tableClass } from '@/components/ui';
import { api, qs } from '@/lib/api';
import { CHANNEL_LABELS, formatBaht, formatDate, formatNumber, PAYMENT_LABELS, shiftDays, todayBkk } from '@/lib/format';

const CHART = { bar: '#1f7d4a', grid: '#e2e7df', axis: '#5a665e' };
const TOOLTIP_STYLE = { borderRadius: 14, border: '1px solid #e2e7df', boxShadow: '0 10px 28px -14px rgb(19 33 26 / 0.25)', fontSize: 13 };

const PRESETS = [
  { label: 'วันนี้', days: 0 },
  { label: '7 วัน', days: 6 },
  { label: '30 วัน', days: 29 },
];

export function ReportsPage() {
  const today = todayBkk();
  const [range, setRange] = useState({ from: shiftDays(today, -6), to: today });
  const report = useQuery({
    queryKey: ['report', range],
    queryFn: () => api.get<SalesReport>(`/api/reports/sales${qs(range)}`),
    placeholderData: keepPreviousData,
  });
  const r = report.data;
  const topCategory = Math.max(1, ...(r?.byCategory.map((c) => c.sales) ?? []));

  return (
    <div>
      <PageHeader
        title="รายงานยอดขาย"
        description="ตามวันที่ประเทศไทย ยอดรวม VAT"
        actions={
          <a
            href={`/api/reports/export/sales.csv${qs(range)}`}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-line-strong bg-surface px-5 text-sm font-semibold transition-colors hover:border-forest/40 hover:bg-subtle"
          >
            <Download className="size-4" aria-hidden /> ส่งออก CSV (Excel)
          </a>
        }
      />
      <Card className="mb-6 flex flex-wrap items-end gap-3 p-4 sm:p-5">
        <Input label="ตั้งแต่" type="date" value={range.from} max={range.to} onChange={(e) => setRange({ ...range, from: e.target.value })} />
        <Input label="ถึง" type="date" value={range.to} min={range.from} onChange={(e) => setRange({ ...range, to: e.target.value })} />
        <div className="flex rounded-full bg-subtle p-1 ring-1 ring-line" role="group" aria-label="ช่วงเวลาสำเร็จรูป">
          {PRESETS.map((p) => {
            const active = range.to === today && range.from === shiftDays(today, -p.days);
            return (
              <button
                key={p.label}
                type="button"
                aria-pressed={active}
                onClick={() => setRange({ from: shiftDays(today, -p.days), to: today })}
                className={cx('h-8 rounded-full px-4 text-sm font-medium transition-colors cursor-pointer', active ? 'bg-forest text-white' : 'text-muted hover:text-ink')}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </Card>
      {report.isLoading ? (
        <Spinner />
      ) : report.error ? (
        <ErrorBox error={report.error} />
      ) : r && r.totals.bills === 0 ? (
        <Card>
          <EmptyState title="ไม่มียอดขายในช่วงนี้" />
        </Card>
      ) : r ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['ยอดขายรวม', formatBaht(r.totals.sales)],
              ['จำนวนบิล', formatNumber(r.totals.bills)],
              ['เฉลี่ยต่อบิล', formatBaht(r.totals.averageBill)],
              ['VAT ในยอดขาย', formatBaht(r.totals.vat)],
            ].map(([label, value], i) => (
              <StatCard key={label} label={label} value={value} featured={i === 0} />
            ))}
          </div>
          <Card className="p-5 sm:p-6">
            <h2 className="mb-5 font-display text-lg font-semibold">ยอดขายรายวัน</h2>
            <div className="h-72" aria-hidden>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={r.byDay.map((d) => ({ ...d, label: formatDate(d.date) }))} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={CHART.grid} vertical={false} />
                  <XAxis dataKey="label" fontSize={12} tickLine={false} axisLine={{ stroke: CHART.grid }} tick={{ fill: CHART.axis }} />
                  <YAxis fontSize={12} tickLine={false} axisLine={false} width={64} tick={{ fill: CHART.axis }} tickFormatter={(v) => formatNumber(v)} />
                  <Tooltip cursor={{ fill: '#f6f8f3' }} contentStyle={TOOLTIP_STYLE} formatter={(v) => formatBaht(Number(v))} labelFormatter={(l) => `วันที่ ${l}`} />
                  <Bar dataKey="sales" name="ยอดขาย" fill={CHART.bar} maxBarSize={24} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <table className="sr-only">
              <caption>ยอดขายรายวัน</caption>
              <thead>
                <tr>
                  <th>วันที่</th>
                  <th>ยอดขาย</th>
                </tr>
              </thead>
              <tbody>
                {r.byDay.map((d) => (
                  <tr key={d.date}>
                    <td>{formatDate(d.date)}</td>
                    <td>{formatBaht(d.sales)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="overflow-hidden lg:col-span-2">
              <h2 className="px-5 pb-3 pt-5 font-display text-lg font-semibold">สินค้าขายดี</h2>
              <table className={tableClass.table}>
                <thead>
                  <tr>
                    <th className={tableClass.th}>สินค้า</th>
                    <th className={`${tableClass.th} text-right`}>จำนวน</th>
                    <th className={`${tableClass.th} text-right`}>ยอดขาย</th>
                  </tr>
                </thead>
                <tbody>
                  {r.topProducts.map((p) => (
                    <tr key={p.productId}>
                      <td className={tableClass.td}>{p.name}</td>
                      <td className={`${tableClass.td} text-right`}>{formatNumber(p.quantity)}</td>
                      <td className={`${tableClass.td} text-right font-semibold`}>{formatBaht(p.sales)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
            <Card className="p-5">
              <h2 className="mb-4 font-display text-lg font-semibold">ตามหมวดหมู่</h2>
              <ul className="space-y-3.5 text-sm">
                {r.byCategory.map((c) => (
                  <li key={c.category}>
                    <div className="mb-1.5 flex items-baseline justify-between gap-3">
                      <span className="truncate">{c.category}</span>
                      <span className="font-semibold tabular-nums">{formatBaht(c.sales)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-subtle" aria-hidden>
                      <div className="h-full rounded-full bg-brand-600" style={{ width: `${(c.sales / topCategory) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-5 space-y-1.5 border-t border-line pt-4 text-sm tabular-nums">
                {r.byChannel.map((c) => (
                  <p key={c.channel} className="flex justify-between">
                    <span>{CHANNEL_LABELS[c.channel] ?? c.channel}</span>
                    <span>
                      {formatBaht(c.sales)} ({c.bills} บิล)
                    </span>
                  </p>
                ))}
                {r.byMethod.map((m) => (
                  <p key={m.method} className="flex justify-between text-muted">
                    <span>{PAYMENT_LABELS[m.method] ?? m.method}</span>
                    <span>{formatBaht(m.sales)}</span>
                  </p>
                ))}
              </div>
            </Card>
          </div>
        </div>
      ) : null}
    </div>
  );
}
