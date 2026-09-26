import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Package, Pencil, Plus, Tags, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import type { Category, Product } from '@shared/types';
import { Badge, Button, Card, Dialog, EmptyState, ErrorBox, Input, PageHeader, Select, Spinner, Textarea, tableClass, useToast } from '@/components/ui';
import { api, ApiRequestError, errorMessage, qs } from '@/lib/api';
import { formatBaht } from '@/lib/format';

type FormState = {
  sku: string;
  barcode: string;
  name: string;
  description: string;
  categoryId: string;
  price: string;
  promoPrice: string;
  minStock: string;
  isActive: boolean;
  initialStock: string;
};

const empty: FormState = { sku: '', barcode: '', name: '', description: '', categoryId: '', price: '', promoPrice: '', minStock: '5', isActive: true, initialStock: '0' };

export function ProductsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const products = useQuery({ queryKey: ['products', 'manage', q, showInactive], queryFn: () => api.get<Product[]>(`/api/catalog/products${qs({ q, all: showInactive ? 1 : 0 })}`) });
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => api.get<Category[]>('/api/catalog/categories') });

  const deactivate = useMutation({
    mutationFn: (p: Product) => api.delete(`/api/catalog/products/${p.id}`),
    onSuccess: () => {
      toast('ปิดการขายสินค้าแล้ว', 'info');
      qc.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  });

  return (
    <div>
      <PageHeader
        title="สินค้า"
        description="ราคารวม VAT · สินค้าที่เคยขายจะถูกปิดการขายแทนการลบ"
        actions={
          <>
            <a href="/api/reports/export/inventory.csv">
              <Button variant="secondary">
                <Download className="size-4" /> ส่งออก CSV
              </Button>
            </a>
            <Button variant="secondary" onClick={() => setCategoriesOpen(true)}>
              <Tags className="size-4" /> หมวดหมู่
            </Button>
            <Button onClick={() => setEditing('new')} disabled={!categories.data?.length} title={categories.data?.length ? undefined : 'สร้างหมวดหมู่ก่อน'}>
              <Plus className="size-4" /> เพิ่มสินค้า
            </Button>
          </>
        }
      />
      <Card className="mb-4 flex flex-wrap items-center gap-4 p-4">
        <Input aria-label="ค้นหา" placeholder="ค้นหาชื่อ รหัส หรือบาร์โค้ด" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="size-4 accent-brand-700" /> แสดงสินค้าที่เลิกขาย
        </label>
      </Card>
      <Card>
        {products.isLoading ? (
          <Spinner />
        ) : products.error ? (
          <div className="p-4"><ErrorBox error={products.error} /></div>
        ) : products.data!.length === 0 ? (
          <EmptyState
            icon={<Package className="size-10" />}
            title={q ? 'ไม่พบสินค้า' : 'ยังไม่มีสินค้า'}
            description={categories.data?.length ? 'กด "เพิ่มสินค้า" เพื่อเริ่มต้น' : 'สร้างหมวดหมู่ก่อน แล้วจึงเพิ่มสินค้า'}
            action={!categories.data?.length && <Button onClick={() => setCategoriesOpen(true)}>สร้างหมวดหมู่</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className={tableClass.table}>
              <thead>
                <tr>
                  <th className={tableClass.th}>สินค้า</th>
                  <th className={tableClass.th}>หมวดหมู่</th>
                  <th className={`${tableClass.th} text-right`}>ราคา</th>
                  <th className={`${tableClass.th} text-right`}>คงเหลือ</th>
                  <th className={tableClass.th}></th>
                </tr>
              </thead>
              <tbody>
                {products.data!.map((p) => (
                  <tr key={p.id} className={p.isActive ? 'hover:bg-slate-50' : 'bg-slate-50 text-muted'}>
                    <td className={tableClass.td}>
                      <p className="font-medium">{p.name}</p>
                      <p className="text-xs text-muted">
                        {p.sku}
                        {p.barcode && ` · ${p.barcode}`}
                        {!p.isActive && ' · เลิกขาย'}
                      </p>
                    </td>
                    <td className={tableClass.td}>{p.categoryName}</td>
                    <td className={`${tableClass.td} text-right`}>
                      {p.promoPrice !== null ? (
                        <>
                          <span className="font-semibold text-brand-700">{formatBaht(p.promoPrice)}</span>
                          <span className="block text-xs text-muted line-through">{formatBaht(p.price)}</span>
                        </>
                      ) : (
                        formatBaht(p.price)
                      )}
                    </td>
                    <td className={`${tableClass.td} text-right`}>
                      <Badge tone={p.stock === 0 ? 'red' : p.stock <= p.minStock ? 'amber' : 'green'}>{p.stock}</Badge>
                    </td>
                    <td className={`${tableClass.td} text-right whitespace-nowrap`}>
                      <Button variant="ghost" size="sm" aria-label={`แก้ไข ${p.name}`} onClick={() => setEditing(p)}>
                        <Pencil className="size-4" />
                      </Button>
                      {p.isActive && (
                        <Button variant="ghost" size="sm" aria-label={`เลิกขาย ${p.name}`} onClick={() => window.confirm(`ปิดการขาย "${p.name}"?`) && deactivate.mutate(p)}>
                          <Trash2 className="size-4 text-danger" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {editing && <ProductDialog product={editing === 'new' ? null : editing} categories={categories.data ?? []} onClose={() => setEditing(null)} />}
      <CategoriesDialog open={categoriesOpen} onClose={() => setCategoriesOpen(false)} categories={categories.data ?? []} />
    </div>
  );
}

function ProductDialog({ product, categories, onClose }: { product: Product | null; categories: Category[]; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [f, setF] = useState<FormState>(
    product
      ? {
          sku: product.sku,
          barcode: product.barcode,
          name: product.name,
          description: product.description,
          categoryId: String(product.categoryId),
          price: String(product.price),
          promoPrice: product.promoPrice === null ? '' : String(product.promoPrice),
          minStock: String(product.minStock),
          isActive: product.isActive,
          initialStock: '0',
        }
      : { ...empty, categoryId: String(categories[0]?.id ?? '') }
  );
  const save = useMutation({
    mutationFn: () => {
      const body = { ...f, promoPrice: f.promoPrice === '' ? null : f.promoPrice };
      return product ? api.put(`/api/catalog/products/${product.id}`, body) : api.post('/api/catalog/products', body);
    },
    onSuccess: () => {
      toast(product ? 'บันทึกสินค้าแล้ว' : 'เพิ่มสินค้าแล้ว');
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['categories'] });
      onClose();
    },
  });
  const err = save.error instanceof ApiRequestError ? save.error.fields : {};
  const set = (k: keyof FormState) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };

  return (
    <Dialog
      open
      wide
      onClose={onClose}
      title={product ? `แก้ไข ${product.name}` : 'เพิ่มสินค้า'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button type="submit" form="product-form" loading={save.isPending}>
            บันทึก
          </Button>
        </>
      }
    >
      <form id="product-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Input label="ชื่อสินค้า" required value={f.name} error={err.name} onChange={set('name')} className="sm:col-span-2" />
        <Input label="รหัสสินค้า (SKU)" required value={f.sku} error={err.sku} onChange={set('sku')} />
        <Input label="บาร์โค้ด (ถ้ามี)" value={f.barcode} error={err.barcode} onChange={set('barcode')} />
        <Select label="หมวดหมู่" required value={f.categoryId} error={err.categoryId} onChange={set('categoryId')}>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Input label="สต็อกขั้นต่ำ (แจ้งเตือน)" type="number" min={0} value={f.minStock} error={err.minStock} onChange={set('minStock')} />
        <Input label="ราคาขาย (บาท)" type="number" min={0} step="0.01" required value={f.price} error={err.price} onChange={set('price')} />
        <Input label="ราคาโปรโมชัน (ว่าง = ไม่มี)" type="number" min={0} step="0.01" value={f.promoPrice} error={err.promoPrice} onChange={set('promoPrice')} />
        {!product && <Input label="จำนวนเริ่มต้นในสต็อก" type="number" min={0} value={f.initialStock} onChange={set('initialStock')} hint="เพิ่ม/ปรับทีหลังได้ที่หน้า สต็อก" />}
        <Textarea label="รายละเอียด" value={f.description} error={err.description} onChange={set('description')} className="sm:col-span-2" />
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} className="size-4 accent-brand-700" /> เปิดขาย (แสดงในหน้าร้านและ POS)
        </label>
        {!Object.keys(err).length && <div className="sm:col-span-2"><ErrorBox error={save.error} /></div>}
      </form>
    </Dialog>
  );
}

function CategoriesDialog({ open, onClose, categories }: { open: boolean; onClose: () => void; categories: Category[] }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState('');
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['categories'] });
    qc.invalidateQueries({ queryKey: ['public-categories'] });
  };
  const add = useMutation({
    mutationFn: () => api.post('/api/catalog/categories', { name, sortOrder: categories.length }),
    onSuccess: () => {
      setName('');
      refresh();
    },
  });
  const rename = useMutation({
    mutationFn: (c: Category) => api.put(`/api/catalog/categories/${c.id}`, { name: c.name, sortOrder: c.sortOrder }),
    onSuccess: refresh,
    onError: (err) => toast(errorMessage(err), 'error'),
  });
  const remove = useMutation({
    mutationFn: (c: Category) => api.delete(`/api/catalog/categories/${c.id}`),
    onSuccess: refresh,
    onError: (err) => toast(errorMessage(err), 'error'),
  });

  return (
    <Dialog open={open} onClose={onClose} title="หมวดหมู่สินค้า">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate();
        }}
        className="mb-4 flex gap-2"
      >
        <Input aria-label="ชื่อหมวดหมู่ใหม่" placeholder="ชื่อหมวดหมู่ใหม่" value={name} onChange={(e) => setName(e.target.value)} required />
        <Button type="submit" loading={add.isPending}>
          เพิ่ม
        </Button>
      </form>
      <ErrorBox error={add.error} />
      {categories.length === 0 ? (
        <EmptyState title="ยังไม่มีหมวดหมู่" />
      ) : (
        <ul className="divide-y divide-line">
          {categories.map((c) => (
            <li key={c.id} className="flex items-center gap-2 py-2">
              <input
                aria-label={`ชื่อหมวดหมู่ ${c.name}`}
                defaultValue={c.name}
                onBlur={(e) => e.target.value.trim() && e.target.value !== c.name && rename.mutate({ ...c, name: e.target.value.trim() })}
                className="h-9 flex-1 rounded-md border border-transparent px-2 text-sm hover:border-line focus:border-brand-600 focus:outline-none"
              />
              <span className="text-xs text-muted">{c.productCount} สินค้า</span>
              <Button variant="ghost" size="sm" aria-label={`ลบ ${c.name}`} disabled={c.productCount > 0} onClick={() => remove.mutate(c)}>
                <Trash2 className="size-4 text-danger" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
