import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Receipt } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Paged, Sale } from '@shared/types';
import { Badge, Card, EmptyState, ErrorBox, Input, PageHeader, Pagination, Spinner, tableClass } from '@/components/ui';
import { api, qs } from '@/lib/api';
import { CHANNEL_LABELS, formatBaht, formatDateTime, PAYMENT_LABELS, todayBkk } from '@/lib/format';

export function ReceiptsPage() {
  const [filters, setFilters] = useState({ q: '', from: todayBkk(), to: todayBkk(), page: 1 });
  const sales = useQuery({
    queryKey: ['sales', filters],
    queryFn: () => api.get<Paged<Sale>>(`/api/sales${qs({ ...filters, pageSize: 30 })}`),
    placeholderData: keepPreviousData,
  });

  return (
    <div>
      <PageHeader title="ใบเสร็จ" description="ค้นหาและพิมพ์ใบเสร็จซ้ำ" />
      <Card className="mb-4 grid gap-3 p-4 sm:grid-cols-3">
        <Input label="เลขใบเสร็จ / เลขคำสั่งซื้อ" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value, page: 1 })} />
        <Input label="ตั้งแต่วันที่" type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value, page: 1 })} />
        <Input label="ถึงวันที่" type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value, page: 1 })} />
      </Card>
      <Card className="overflow-hidden">
        {sales.isLoading ? (
          <Spinner />
        ) : sales.error ? (
          <div className="p-4"><ErrorBox error={sales.error} /></div>
        ) : sales.data!.items.length === 0 ? (
          <EmptyState icon={<Receipt className="size-10" />} title="ไม่พบใบเสร็จ" description="ลองเปลี่ยนช่วงวันที่" />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className={tableClass.table}>
                <thead>
                  <tr>
                    <th className={tableClass.th}>เลขที่</th>
                    <th className={tableClass.th}>วันที่เวลา</th>
                    <th className={tableClass.th}>ช่องทาง</th>
                    <th className={tableClass.th}>ชำระโดย</th>
                    <th className={tableClass.th}>พนักงาน</th>
                    <th className={`${tableClass.th} text-right`}>ยอดรวม</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.data!.items.map((s) => (
                    <tr key={s.id} className="hover:bg-subtle">
                      <td className={tableClass.td}>
                        <Link to={`/staff/receipts/${s.receiptNo}`} className="font-semibold text-brand-700 hover:underline">
                          {s.receiptNo}
                        </Link>
                      </td>
                      <td className={tableClass.td}>{formatDateTime(s.createdAt)}</td>
                      <td className={tableClass.td}>
                        <Badge tone={s.channel === 'online' ? 'blue' : 'slate'}>{CHANNEL_LABELS[s.channel]}</Badge>
                        {s.orderNo && <span className="ml-1 text-xs text-muted">{s.orderNo}</span>}
                      </td>
                      <td className={tableClass.td}>{PAYMENT_LABELS[s.paymentMethod]}</td>
                      <td className={tableClass.td}>{s.cashierName ?? '-'}</td>
                      <td className={`${tableClass.td} text-right font-semibold`}>{formatBaht(s.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={sales.data!.page} pageSize={sales.data!.pageSize} total={sales.data!.total} onPage={(page) => setFilters({ ...filters, page })} />
          </>
        )}
      </Card>
    </div>
  );
}
