import { useMutation, useQuery } from '@tanstack/react-query';
import { Bot, Package, Plus, Search, Send, Sparkles, Tag } from 'lucide-react';
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
  const settings = usePublicSettings();
  const catalog = useCatalog();
  const categories = useQuery({ queryKey: ['public-categories'], queryFn: () => api.get<Category[]>('/api/public/catalog/categories') });
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [search, setSearch] = useState('');

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (catalog.data ?? []).filter((p) => (categoryId === null || p.categoryId === categoryId) && (!q || p.name.toLowerCase().includes(q)));
  }, [catalog.data, categoryId, search]);
  const promoCount = useMemo(() => (catalog.data ?? []).filter((p) => p.promoPrice !== null && p.available > 0).length, [catalog.data]);

  return (
    <div className="space-y-8">
      <section aria-labelledby="shop-hero" className="relative overflow-hidden rounded-[1.75rem] bg-forest px-6 py-9 text-white sm:px-10 sm:py-12">
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-24 size-72 rounded-full bg-lime/15" />
        <div aria-hidden className="pointer-events-none absolute -bottom-28 right-24 size-56 rounded-full bg-brand-500/25" />
        <div className="relative max-w-2xl">
          <h1 id="shop-hero" className="text-balance font-display text-3xl font-bold leading-tight tracking-tight sm:text-[2.6rem]">
            {settings.data?.storeName ?? 'GrocerAI'}
          </h1>
          <p className="mt-3 max-w-xl text-pretty text-base text-white/75">เลือกของใช้ประจำบ้านได้เลย หรือบอกผู้ช่วย AI ว่าอยากได้อะไร แล้วให้หยิบใส่ตะกร้าให้</p>
          <label className="relative mt-7 block max-w-xl">
            <span className="sr-only">ค้นหาสินค้า</span>
            <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted" aria-hidden />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาสินค้า เช่น นมสด ข้าวหอมมะลิ"
              className="h-13 w-full rounded-full border-0 bg-white pl-12 pr-4 text-base text-ink shadow-pop placeholder:text-muted/80 focus:outline-none focus:ring-4 focus:ring-lime/60"
            />
          </label>
          {promoCount > 0 && (
            <p className="mt-5 inline-flex items-center gap-2 rounded-full bg-lime px-3.5 py-1.5 text-sm font-semibold text-lime-ink">
              <Tag className="size-4" aria-hidden /> สินค้าโปรโมชัน {promoCount} รายการ
            </p>
          )}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <section aria-label="สินค้า" className="min-w-0">
          <div className="mb-5 flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible">
            {[{ id: null as number | null, name: 'ทั้งหมด' }, ...(categories.data ?? [])].map((c) => (
              <button
                key={c.id ?? 'all'}
                onClick={() => setCategoryId(c.id)}
                aria-pressed={categoryId === c.id}
                className={cx(
                  'shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-colors cursor-pointer',
                  categoryId === c.id ? 'border-forest bg-forest text-white' : 'border-line-strong bg-surface text-ink hover:border-forest/40'
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
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-4">
              {visible.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          )}
        </section>
        <ChatPanel products={catalog.data ?? []} />
      </div>
    </div>
  );
}

function ProductCard({ product: p }: { product: CatalogProduct }) {
  const cart = useCart();
  const toast = useToast();
  const inCart = cart.lines.find((l) => l.productId === p.id)?.quantity ?? 0;
  const soldOut = p.available <= 0;
  return (
    <Card className={cx('flex flex-col p-2.5 transition-shadow hover:shadow-pop sm:p-3', soldOut && 'opacity-75')}>
      <div className="relative mb-3 flex aspect-[4/3] items-center justify-center rounded-2xl bg-subtle text-brand-600">
        <Package className="size-10 stroke-[1.5]" aria-hidden />
        <div className="absolute left-2 top-2 flex flex-wrap gap-1">
          {p.promoPrice !== null && <Badge tone="lime">โปรโมชัน</Badge>}
          {soldOut ? <Badge tone="red">สินค้าหมด</Badge> : p.available <= 5 && <Badge tone="amber">เหลือ {p.available}</Badge>}
        </div>
      </div>
      <div className="flex flex-1 flex-col px-1 pb-1">
        <p className="text-xs text-muted">{p.categoryName}</p>
        <h3 className="mt-0.5 line-clamp-2 min-h-10 text-sm font-semibold leading-5">{p.name}</h3>
        <div className="mb-3 mt-2 flex flex-wrap items-baseline gap-x-2 tabular-nums">
          <span className="font-display text-lg font-bold">{formatBaht(effectivePrice(p))}</span>
          {p.promoPrice !== null && <span className="text-xs text-muted line-through">{formatBaht(p.price)}</span>}
        </div>
        <Button
          className="mt-auto w-full"
          size="sm"
          variant={inCart ? 'secondary' : 'accent'}
          disabled={soldOut || inCart >= p.available}
          onClick={() => {
            cart.add(p.id, 1, p.available);
            toast(`เพิ่ม ${p.name} ลงตะกร้าแล้ว`);
          }}
        >
          {!inCart && <Plus className="size-4" aria-hidden />}
          {inCart ? `ในตะกร้า ${inCart} · เพิ่มอีก` : 'ใส่ตะกร้า'}
        </Button>
      </div>
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
    <Card className="flex h-[640px] flex-col overflow-hidden lg:sticky lg:top-24">
      <div className="flex items-center gap-3 bg-forest px-4 py-3.5 text-white">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-lime text-lime-ink">
          <Bot className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="font-display font-semibold">พี่ชำใจดี ผู้ช่วยช้อปปิ้ง</p>
          <p className="text-xs text-white/70">{settings.data?.aiEnabled ? 'ถามสต็อก โปรโมชัน หรือบอกของที่อยากซื้อ' : 'โหมดค้นหาสินค้าพื้นฐาน (ยังไม่ได้เปิด AI)'}</p>
        </div>
      </div>
      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
        {messages.length === 0 && (
          <div className="rounded-2xl rounded-tl-md bg-lime-soft p-3.5 text-sm text-lime-ink">
            <Sparkles className="mb-1.5 size-4" aria-hidden />
            สวัสดีค่ะ บอกพี่ชำได้เลยว่าอยากได้อะไร เช่น "เอาข้าว 1 ถุง" พี่จะใส่ตะกร้าให้ค่ะ
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={cx(
              'max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm',
              m.role === 'user' ? 'ml-auto rounded-br-md bg-forest text-white' : 'rounded-tl-md bg-subtle text-ink ring-1 ring-line'
            )}
          >
            {m.text}
          </div>
        ))}
        {send.isPending && (
          <div className="flex w-16 items-center justify-center gap-1 rounded-2xl rounded-tl-md bg-subtle px-3 py-3.5 ring-1 ring-line" role="status" aria-label="กำลังพิมพ์">
            {[0, 150, 300].map((delay) => (
              <span key={delay} className="size-1.5 animate-bounce rounded-full bg-muted" style={{ animationDelay: `${delay}ms` }} />
            ))}
          </div>
        )}
      </div>
      {messages.length === 0 && (
        <div className="flex flex-wrap gap-2 px-4 pb-2">
          {suggestions.map((s) => (
            <button key={s} onClick={() => setInput(s)} className="rounded-full border border-line-strong bg-surface px-3 py-1.5 text-xs transition-colors hover:border-forest/40 hover:bg-subtle cursor-pointer">
              {s}
            </button>
          ))}
        </div>
      )}
      <form onSubmit={submit} className="flex items-center gap-2 border-t border-line bg-subtle p-3">
        <label className="flex-1">
          <span className="sr-only">ข้อความ</span>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={1000}
            placeholder="พิมพ์ข้อความ..."
            className="h-11 w-full rounded-full border border-line-strong bg-surface px-4 text-sm focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-lime/40"
          />
        </label>
        <Button type="submit" variant="accent" className="size-11 px-0" aria-label="ส่ง" disabled={!input.trim()} loading={send.isPending}>
          {!send.isPending && <Send className="size-4" aria-hidden />}
        </Button>
      </form>
    </Card>
  );
}
