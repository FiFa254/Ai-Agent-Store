import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { AuditEntry, Paged } from '@shared/types';
import { Card, EmptyState, ErrorBox, Input, PageHeader, Pagination, Select, Spinner, tableClass } from '@/components/ui';
import { api, qs } from '@/lib/api';
import { formatDateTime } from '@/lib/format';

const ENTITIES: Record<string, string> = {
  '': 'ทุกประเภท',
  user: 'ผู้ใช้ / การเข้าระบบ',
  product: 'สินค้า',
  category: 'หมวดหมู่',
  stock: 'สต็อก',
  sale: 'การขาย',
  order: 'คำสั่งซื้อ',
  settings: 'ตั้งค่า',
  report: 'รายงาน',
  system: 'ระบบ',
};

export function AuditPage() {
  const [f, setF] = useState({ q: '', entity: '', page: 1 });
  const log = useQuery({ queryKey: ['audit', f], queryFn: () => api.get<Paged<AuditEntry>>(`/api/audit${qs({ ...f, pageSize: 50 })}`), placeholderData: keepPreviousData });

  return (
    <div>
      <PageHeader title="บันทึกการใช้งาน" description="ทุกการเปลี่ยนแปลงข้อมูลและการเข้าสู่ระบบ" />
      <Card className="mb-4 grid gap-3 p-4 sm:grid-cols-2">
        <Input label="ค้นหา" placeholder="การกระทำ เลขเอกสาร ผู้ใช้..." value={f.q} onChange={(e) => setF({ ...f, q: e.target.value, page: 1 })} />
        <Select label="ประเภท" value={f.entity} onChange={(e) => setF({ ...f, entity: e.target.value, page: 1 })}>
          {Object.entries(ENTITIES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
      </Card>
      <Card className="overflow-hidden">
        {log.isLoading ? (
          <Spinner />
        ) : log.error ? (
          <div className="p-4"><ErrorBox error={log.error} /></div>
        ) : log.data!.items.length === 0 ? (
          <EmptyState title="ไม่พบรายการ" />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className={tableClass.table}>
                <thead>
                  <tr>
                    <th className={tableClass.th}>เวลา</th>
                    <th className={tableClass.th}>ผู้ใช้</th>
                    <th className={tableClass.th}>การกระทำ</th>
                    <th className={tableClass.th}>รายการ</th>
                    <th className={tableClass.th}>รายละเอียด</th>
                    <th className={tableClass.th}>IP</th>
                  </tr>
                </thead>
                <tbody>
                  {log.data!.items.map((a) => (
                    <tr key={a.id}>
                      <td className={`${tableClass.td} whitespace-nowrap`}>{formatDateTime(a.createdAt)}</td>
                      <td className={`${tableClass.td} whitespace-nowrap`}>{a.userName ?? 'ลูกค้า / ระบบ'}</td>
                      <td className={tableClass.td}>
                        <code className="rounded-md bg-subtle px-1.5 py-0.5 font-mono text-xs ring-1 ring-line">{a.action}</code>
                      </td>
                      <td className={tableClass.td}>
                        {ENTITIES[a.entity] ?? a.entity}
                        {a.entityId && <span className="text-muted"> #{a.entityId}</span>}
                      </td>
                      <td className={`${tableClass.td} max-w-md truncate font-mono text-xs text-muted`} title={a.details ?? ''}>
                        {a.details ?? '-'}
                      </td>
                      <td className={`${tableClass.td} text-xs text-muted`}>{a.ip ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={log.data!.page} pageSize={log.data!.pageSize} total={log.data!.total} onPage={(page) => setF({ ...f, page })} />
          </>
        )}
      </Card>
    </div>
  );
}
