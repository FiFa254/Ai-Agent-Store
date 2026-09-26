import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { History } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import type { Paged, Product, StockMovement } from '@shared/types';
import { Badge, Button, Card, EmptyState, ErrorBox, Input, PageHeader, Pagination, Select, Spinner, tableClass, useToast } from '@/components/ui';
import { api, ApiRequestError, qs } from '@/lib/api';
import { formatDateTime } from '@/lib/format';

const REASONS: Record<StockMovement['reason'], string> = {
  sale: 'ขาย',
  order: 'สั่งออนไลน์ (กันสินค้า)',
  'order-cancel': 'คืนจากออเดอร์',
  restock: 'รับเข้า',
  adjustment: 'ปรับยอด',
  initial: 'ยอดตั้งต้น',
};

export function StockPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const products = useQuery({ queryKey: ['products', 'stock'], queryFn: () => api.get<Product[]>('/api/catalog/products') });
  const [productFilter, setProductFilter] = useState('');
  const [page, setPage] = useState(1);
  const movements = useQuery({
    queryKey: ['movements', productFilter, page],
    queryFn: () => api.get<Paged<StockMovement>>(`/api/catalog/stock/movements${qs({ productId: productFilter, page, pageSize: 30 })}`),
    placeholderData: keepPreviousData,
  });
  const [form, setForm] = useState({ productId: '', mode: 'restock' as 'restock' | 'add' | 'remove', quantity: '', note: '' });

  const change = useMutation({
    mutationFn: () => {
      const qty = Number(form.quantity);
      return api.post<{ stock: number }>('/api/catalog/stock', {
        productId: form.productId,
        change: form.mode === 'remove' ? -qty : qty,
        reason: form.mode === 'restock' ? 'restock' : 'adjustment',
        note: form.note,
      });
    },
    onSuccess: (r) => {
      toast(`บันทึกแล้ว คงเหลือ ${r.stock}`);
      setForm({ ...form, quantity: '', note: '' });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['movements'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
  const fields = change.error instanceof ApiRequestError ? change.error.fields : {};
  const selected = products.data?.find((p) => String(p.id) === form.productId);
  const low = (products.data ?? []).filter((p) => p.stock <= p.minStock);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    change.mutate();
  };

  return (
    <div>
      <PageHeader title="สต็อกสินค้า" description="ทุกการเปลี่ยนแปลงสต็อกถูกบันทึกพร้อมผู้ทำรายการ" />
      <div className="mb-6 grid gap-6 lg:grid-cols-[420px_1fr]">
        <Card className="p-5">
          <h2 className="mb-4 font-semibold">รับเข้า / ปรับยอด</h2>
          <form onSubmit={submit} className="space-y-4">
            <Select label="สินค้า" required value={form.productId} error={fields.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })}>
              <option value="">เลือกสินค้า</option>
              {products.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} (คงเหลือ {p.stock})
                </option>
              ))}
            </Select>
            <Select label="ประเภท" value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value as typeof form.mode })}>
              <option value="restock">รับสินค้าเข้า</option>
              <option value="add">ปรับเพิ่ม (นับสต็อก)</option>
              <option value="remove">ปรับลด (เสีย / หาย / หมดอายุ)</option>
            </Select>
            <Input label="จำนวน" type="number" min={1} required value={form.quantity} error={fields.change} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
            <Input label="หมายเหตุ" value={form.note} maxLength={300} placeholder={form.mode === 'remove' ? 'เช่น สินค้าหมดอายุ' : 'เช่น เลขใบส่งของ'} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            {selected && form.quantity && (
              <p className="text-sm text-muted">
                คงเหลือหลังบันทึก: <strong>{selected.stock + (form.mode === 'remove' ? -1 : 1) * Number(form.quantity)}</strong>
              </p>
            )}
            {!Object.keys(fields).length && <ErrorBox error={change.error} />}
            <Button type="submit" className="w-full" loading={change.isPending}>
              บันทึก
            </Button>
          </form>
        </Card>
        <Card>
          <h2 className="border-b border-line px-5 py-3 font-semibold">สินค้าที่ต่ำกว่าขั้นต่ำ ({low.length})</h2>
          {low.length === 0 ? (
            <EmptyState title="สต็อกเพียงพอทุกรายการ" />
          ) : (
            <ul className="max-h-80 divide-y divide-line overflow-y-auto">
              {low.map((p) => (
                <li key={p.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                  <button className="text-left font-medium hover:underline cursor-pointer" onClick={() => setForm({ ...form, productId: String(p.id), mode: 'restock' })}>
                    {p.name}
                  </button>
                  <Badge tone={p.stock === 0 ? 'red' : 'amber'}>
                    {p.stock} / {p.minStock}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
          <h2 className="flex items-center gap-2 font-semibold">
            <History className="size-4" /> ประวัติการเคลื่อนไหว
          </h2>
          <Select aria-label="กรองสินค้า" value={productFilter} onChange={(e) => { setProductFilter(e.target.value); setPage(1); }} className="w-64">
            <option value="">ทุกสินค้า</option>
            {products.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>
        {movements.isLoading ? (
          <Spinner />
        ) : movements.error ? (
          <div className="p-4"><ErrorBox error={movements.error} /></div>
        ) : movements.data!.items.length === 0 ? (
          <EmptyState title="ยังไม่มีรายการ" />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className={tableClass.table}>
                <thead>
                  <tr>
                    <th className={tableClass.th}>เวลา</th>
                    <th className={tableClass.th}>สินค้า</th>
                    <th className={tableClass.th}>ประเภท</th>
                    <th className={`${tableClass.th} text-right`}>จำนวน</th>
                    <th className={`${tableClass.th} text-right`}>คงเหลือ</th>
                    <th className={tableClass.th}>อ้างอิง / หมายเหตุ</th>
                    <th className={tableClass.th}>ผู้ทำรายการ</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.data!.items.map((m) => (
                    <tr key={m.id}>
                      <td className={`${tableClass.td} whitespace-nowrap`}>{formatDateTime(m.createdAt)}</td>
                      <td className={tableClass.td}>{m.productName}</td>
                      <td className={tableClass.td}>{REASONS[m.reason]}</td>
                      <td className={`${tableClass.td} text-right font-semibold ${m.change > 0 ? 'text-brand-700' : 'text-danger'}`}>{m.change > 0 ? `+${m.change}` : m.change}</td>
                      <td className={`${tableClass.td} text-right`}>{m.stockAfter}</td>
                      <td className={tableClass.td}>{[m.refNo, m.note].filter(Boolean).join(' · ') || '-'}</td>
                      <td className={tableClass.td}>{m.userName ?? 'ลูกค้า / ระบบ'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={movements.data!.page} pageSize={movements.data!.pageSize} total={movements.data!.total} onPage={setPage} />
          </>
        )}
      </Card>
    </div>
  );
}
