import { useMutation } from '@tanstack/react-query';
import { Minus, Package, Plus, ShoppingBasket, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { effectivePrice } from '@shared/money';
import { Button, Card, EmptyState, ErrorBox, Input, PageHeader, Spinner, Textarea } from '@/components/ui';
import { useCart } from '@/features/shop/cart';
import { rememberOrder } from '@/features/shop/orders';
import { usePublicSettings } from '@/layouts/PublicLayout';
import { api, ApiRequestError } from '@/lib/api';
import { formatBaht } from '@/lib/format';
import { useCatalog } from './ShopPage';

export function CheckoutPage() {
  const catalog = useCatalog();
  const settings = usePublicSettings();
  const cart = useCart();
  const navigate = useNavigate();
  const [form, setForm] = useState({ customerName: '', customerPhone: '', note: '' });

  const place = useMutation({
    mutationFn: () => api.post<{ orderNo: string; accessKey: string }>('/api/public/orders', { ...form, items: cart.lines }),
    onSuccess: (order) => {
      rememberOrder(order.orderNo, order.accessKey);
      cart.clear();
      navigate(`/orders/${order.orderNo}?key=${order.accessKey}`);
    },
  });
  const fields = place.error instanceof ApiRequestError ? place.error.fields : {};

  if (catalog.isLoading) return <Spinner />;
  const products = catalog.data ?? [];
  const lines = cart.lines.map((l) => ({ ...l, product: products.find((p) => p.id === l.productId) })).filter((l) => l.product);

  if (lines.length === 0) {
    return (
      <Card>
        <EmptyState icon={<ShoppingBasket className="size-10" />} title="ตะกร้าว่าง" description="เลือกสินค้าหรือบอกผู้ช่วย AI ว่าอยากได้อะไร" action={<Link to="/" className="inline-flex h-10 items-center rounded-full bg-forest px-5 text-sm font-semibold text-white hover:bg-forest-soft">ไปเลือกสินค้า</Link>} />
      </Card>
    );
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    place.mutate();
  };

  return (
    <div>
      <PageHeader title="ตะกร้าและสั่งซื้อ" description="ชำระเงินด้วยพร้อมเพย์ หรือชำระที่หน้าร้านเมื่อมารับสินค้า" />
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <Card className="h-fit divide-y divide-line">
          {lines.map(({ productId, quantity, product }) => (
            <div key={productId} className="flex flex-wrap items-center gap-x-4 gap-y-3 p-4 sm:p-5">
              <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-subtle text-brand-600" aria-hidden>
                <Package className="size-6 stroke-[1.5]" />
              </span>
              <div className="min-w-40 flex-1">
                <p className="font-semibold">{product!.name}</p>
                <p className="mt-0.5 text-sm text-muted tabular-nums">
                  {formatBaht(effectivePrice(product!))} / ชิ้น {product!.available < quantity && <span className="text-danger">(เหลือเพียง {product!.available})</span>}
                </p>
              </div>
              <div className="flex items-center rounded-full border border-line-strong bg-surface p-0.5">
                <Button variant="ghost" size="icon" aria-label="ลดจำนวน" onClick={() => cart.setQuantity(productId, quantity - 1)}>
                  <Minus className="size-4" />
                </Button>
                <span className="w-9 text-center font-semibold tabular-nums" aria-label="จำนวน">{quantity}</span>
                <Button variant="ghost" size="icon" aria-label="เพิ่มจำนวน" disabled={quantity >= product!.available} onClick={() => cart.setQuantity(productId, quantity + 1)}>
                  <Plus className="size-4" />
                </Button>
              </div>
              <span className="w-24 text-right font-display font-semibold tabular-nums">{formatBaht(effectivePrice(product!) * quantity)}</span>
              <Button variant="ghost" size="icon" aria-label={`ลบ ${product!.name}`} onClick={() => cart.remove(productId)}>
                <Trash2 className="size-4 text-danger" />
              </Button>
            </div>
          ))}
        </Card>

        <Card className="h-fit overflow-hidden lg:sticky lg:top-24">
          <div className="bg-forest px-5 py-5 text-white">
            <p className="text-sm text-white/70">ยอดรวม ({cart.count} ชิ้น)</p>
            <p className="mt-1 font-display text-3xl font-bold tabular-nums">{formatBaht(cart.total(products))}</p>
          </div>
          <form onSubmit={submit} className="space-y-4 p-5">
            <Input label="ชื่อผู้สั่ง" required value={form.customerName} error={fields.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} autoComplete="name" />
            <Input label="เบอร์โทรศัพท์" required inputMode="tel" value={form.customerPhone} error={fields.customerPhone} placeholder="0812345678" onChange={(e) => setForm({ ...form, customerPhone: e.target.value })} autoComplete="tel" />
            <Textarea label="หมายเหตุ (ไม่บังคับ)" value={form.note} maxLength={300} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            {place.error && !Object.keys(fields).length && <ErrorBox error={place.error} />}
            <Button type="submit" variant="accent" size="lg" className="w-full" loading={place.isPending}>
              ยืนยันคำสั่งซื้อ
            </Button>
            <p className="text-xs text-muted">
              ร้านจะกันสินค้าไว้ให้ระยะหนึ่งเพื่อรอการชำระเงิน {settings.data?.promptPayEnabled ? 'สแกนจ่ายด้วยพร้อมเพย์ได้ในหน้าถัดไป' : 'ชำระเงินที่หน้าร้าน'}
            </p>
          </form>
        </Card>
      </div>
    </div>
  );
}
