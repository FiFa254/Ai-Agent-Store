import { useMutation, useQuery } from '@tanstack/react-query';
import { Bot, Package, Search, Send, Sparkles } from 'lucide-react';
import { useMemo, useRef, useState, type FormEvent } from 'react';
import { effectivePrice } from '@shared/money';
import type { CatalogProduct, Category, ChatReply } from '@shared/types';
import { Badge, Button, Card, EmptyState, ErrorBox, Spinner, cx, useToast } from '@/components/ui';
import { useCart } from '@/features/shop/cart';
import { usePublicSettings } from '@/layouts/PublicLayout';
import { api } from '@/lib/api';
import { formatBaht } from '@/lib/format';

export function useCatalog() {
  return useQuery({ queryKey: ['catalog'], queryFn: () => api.get<CatalogProduct[]>('/api/public/catalog/products'), refetchInterval: 60_000 });
}

export function ShopPage() {
  const catalog = useCatalog();
  const categories = useQuery({ queryKey: ['public-categories'], queryFn: () => api.get<Category[]>('/api/public/catalog/categories') });
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [search, setSearch] = useState('');

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (catalog.data ?? []).filter((p) => (categoryId === null || p.categoryId === categoryId) && (!q || p.name.toLowerCase().includes(q)));
  }, [catalog.data, categoryId, search]);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <section aria-label="สินค้า">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <label className="relative min-w-60 flex-1">
            <span className="sr-only">ค้นหาสินค้า</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาสินค้า..."
              className="h-10 w-full rounded-lg border border-line bg-white pl-9 pr-3 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </label>
        </div>
        <div className="mb-5 flex flex-wrap gap-2">
          {[{ id: null as number | null, name: 'ทั้งหมด' }, ...(categories.data ?? [])].map((c) => (
            <button
              key={c.id ?? 'all'}
              onClick={() => setCategoryId(c.id)}
              className={cx(
                'rounded-full border px-3.5 py-1.5 text-sm font-medium cursor-pointer',
                categoryId === c.id ? 'border-brand-700 bg-brand-700 text-white' : 'border-line bg-white text-ink hover:bg-slate-50'
              )}
            >
              {c.name}
            </button>
          ))}
        </div>

        {catalog.isLoading ? (
          <Spinner />
        ) : catalog.error ? (
          <ErrorBox error={catalog.error} />
        ) : visible.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Package className="size-10" />}
              title={catalog.data?.length ? 'ไม่พบสินค้าที่ค้นหา' : 'ร้านยังไม่มีสินค้า'}
              description={catalog.data?.length ? 'ลองเปลี่ยนคำค้นหาหรือหมวดหมู่' : 'แวะมาใหม่เร็ว ๆ นี้'}
            />
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
            {visible.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </section>
      <ChatPanel products={catalog.data ?? []} />
    </div>
  );
}

function ProductCard({ product: p }: { product: CatalogProduct }) {
  const cart = useCart();
  const toast = useToast();
  const inCart = cart.lines.find((l) => l.productId === p.id)?.quantity ?? 0;
  const soldOut = p.available <= 0;
  return (
    <Card className="flex flex-col p-4">
      <div className="mb-3 flex h-24 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
        <Package className="size-9" aria-hidden />
      </div>
      <div className="mb-1 flex flex-wrap gap-1">
        {p.promoPrice !== null && <Badge tone="amber">โปรโมชัน</Badge>}
        {soldOut ? <Badge tone="red">สินค้าหมด</Badge> : p.available <= 5 && <Badge tone="slate">เหลือ {p.available}</Badge>}
      </div>
      <h3 className="line-clamp-2 min-h-10 text-sm font-semibold">{p.name}</h3>
      <p className="text-xs text-muted">{p.categoryName}</p>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-lg font-bold text-brand-700">{formatBaht(effectivePrice(p))}</span>
        {p.promoPrice !== null && <span className="text-xs text-muted line-through">{formatBaht(p.price)}</span>}
      </div>
      <Button
        className="mt-3"
        size="sm"
        variant={inCart ? 'secondary' : 'primary'}
        disabled={soldOut || inCart >= p.available}
        onClick={() => {
          cart.add(p.id, 1, p.available);
          toast(`เพิ่ม ${p.name} ลงตะกร้าแล้ว`);
        }}
      >
        {inCart ? `ในตะกร้า ${inCart} · เพิ่มอีก` : 'ใส่ตะกร้า'}
      </Button>
    </Card>
  );
}

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

function ChatPanel({ products }: { products: CatalogProduct[] }) {
  const settings = usePublicSettings();
  const cart = useCart();
  const toast = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const send = useMutation({
    mutationFn: (message: string) => api.post<ChatReply>('/api/public/chat', { message, history: messages.slice(-10) }),
    onSuccess: (reply) => {
      setMessages((m) => [...m, { role: 'model', text: reply.reply }]);
      const added = reply.detectedCartItems.filter((i) => byId.has(i.productId));
      for (const item of added) cart.add(item.productId, item.quantity, byId.get(item.productId)!.available);
      if (added.length > 0) toast(`เพิ่ม ${added.length} รายการลงตะกร้าจากแชท`);
      requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight }));
    },
    onError: (err) => setMessages((m) => [...m, { role: 'model', text: err instanceof Error ? err.message : 'ขออภัย ระบบขัดข้อง' }]),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || send.isPending) return;
    setMessages((m) => [...m, { role: 'user', text }]);
    setInput('');
    send.mutate(text);
    requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight }));
  };

  const suggestions = ['มีโปรอะไรบ้าง', 'ขอไข่ 1 แผง กับนมสด 2 กล่อง', 'น้ำมันพืชเหลือไหม'];

  return (
    <Card className="flex h-[640px] flex-col lg:sticky lg:top-24">
      <div className="flex items-center gap-3 border-b border-line px-4 py-3">
        <span className="flex size-9 items-center justify-center rounded-full bg-brand-700 text-white">
          <Bot className="size-5" aria-hidden />
        </span>
        <div>
          <p className="font-semibold">พี่ชำใจดี ผู้ช่วยช้อปปิ้ง</p>
          <p className="text-xs text-muted">{settings.data?.aiEnabled ? 'ถามสต็อก โปรโมชัน หรือบอกของที่อยากซื้อ' : 'โหมดค้นหาสินค้าพื้นฐาน (ยังไม่ได้เปิด AI)'}</p>
        </div>
      </div>
      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
        {messages.length === 0 && (
          <div className="rounded-lg bg-brand-50 p-3 text-sm text-brand-800">
            <Sparkles className="mb-1 size-4" aria-hidden />
            สวัสดีค่ะ บอกพี่ชำได้เลยว่าอยากได้อะไร เช่น "เอาข้าว 1 ถุง" พี่จะใส่ตะกร้าให้ค่ะ
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={cx('max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm', m.role === 'user' ? 'ml-auto bg-brand-700 text-white' : 'bg-slate-100 text-ink')}>
            {m.text}
          </div>
        ))}
        {send.isPending && <div className="w-16 rounded-2xl bg-slate-100 px-3 py-2 text-sm text-muted">...</div>}
      </div>
      {messages.length === 0 && (
        <div className="flex flex-wrap gap-2 px-4 pb-2">
          {suggestions.map((s) => (
            <button key={s} onClick={() => setInput(s)} className="rounded-full border border-line px-3 py-1 text-xs hover:bg-slate-50 cursor-pointer">
              {s}
            </button>
          ))}
        </div>
      )}
      <form onSubmit={submit} className="flex gap-2 border-t border-line p-3">
        <label className="flex-1">
          <span className="sr-only">ข้อความ</span>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={1000}
            placeholder="พิมพ์ข้อความ..."
            className="h-10 w-full rounded-lg border border-line px-3 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </label>
        <Button type="submit" aria-label="ส่ง" disabled={!input.trim()} loading={send.isPending}>
          <Send className="size-4" aria-hidden />
        </Button>
      </form>
    </Card>
  );
}
