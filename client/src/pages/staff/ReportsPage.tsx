import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { SalesReport } from '@shared/types';
import { Button, Card, EmptyState, ErrorBox, Input, PageHeader, Spinner, tableClass } from '@/components/ui';
import { api, qs } from '@/lib/api';
import { CHANNEL_LABELS, formatBaht, formatDate, formatNumber, PAYMENT_LABELS, shiftDays, todayBkk } from '@/lib/format';

const PIE_COLORS = ['#047857', '#0ea5e9', '#f59e0b', '#8b5cf6', '#e11d48', '#64748b'];

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

  return (
    <div>
      <PageHeader
        title="รายงานยอดขาย"
        description="ตามวันที่ประเทศไทย ยอดรวม VAT"
        actions={
          <a href={`/api/reports/export/sales.csv${qs(range)}`}>
            <Button variant="secondary">
              <Download className="size-4" /> ส่งออก CSV (Excel)
            </Button>
          </a>
        }
      />
      <Card className="mb-6 flex flex-wrap items-end gap-3 p-4">
        <Input label="ตั้งแต่" type="date" value={range.from} max={range.to} onChange={(e) => setRange({ ...range, from: e.target.value })} />
        <Input label="ถึง" type="date" value={range.to} min={range.from} onChange={(e) => setRange({ ...range, to: e.target.value })} />
        {PRESETS.map((p) => (
          <Button key={p.label} variant="secondary" onClick={() => setRange({ from: shiftDays(today, -p.days), to: today })}>
            {p.label}
          </Button>
        ))}
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
            ].map(([label, value]) => (
              <Card key={label} className="p-5">
                <p className="text-sm text-muted">{label}</p>
                <p className="text-2xl font-bold">{value}</p>
              </Card>
            ))}
          </div>
          <Card className="p-5">
            <h2 className="mb-4 font-semibold">ยอดขายรายวัน</h2>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={r.byDay.map((d) => ({ ...d, label: formatDate(d.date) }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="label" fontSize={12} tickLine={false} />
                  <YAxis fontSize={12} tickLine={false} width={70} tickFormatter={(v) => formatNumber(v)} />
                  <Tooltip formatter={(v) => formatBaht(Number(v))} labelFormatter={(l) => `วันที่ ${l}`} />
                  <Bar dataKey="sales" name="ยอดขาย" fill="#047857" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="p-5 lg:col-span-2">
              <h2 className="mb-3 font-semibold">สินค้าขายดี</h2>
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
              <h2 className="mb-2 font-semibold">ตามหมวดหมู่</h2>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={r.byCategory} dataKey="sales" nameKey="category" innerRadius={45} outerRadius={80}>
                      {r.byCategory.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => formatBaht(Number(v))} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="mt-2 space-y-1 text-sm">
                {r.byCategory.map((c, i) => (
                  <li key={c.category} className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <span className="size-2.5 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                      {c.category}
                    </span>
                    <span>{formatBaht(c.sales)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 space-y-1 border-t border-line pt-3 text-sm">
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
