import { useQuery } from '@tanstack/react-query';
import { Leaf, ShoppingBasket } from 'lucide-react';
import { Link, Outlet } from 'react-router-dom';
import type { PublicSettings } from '@shared/types';
import { cx } from '@/components/ui';
import { useCart } from '@/features/shop/cart';
import { api } from '@/lib/api';

export function usePublicSettings() {
  return useQuery({ queryKey: ['public-settings'], queryFn: () => api.get<PublicSettings>('/api/public/settings'), staleTime: 300_000 });
}

export function PublicLayout() {
  const settings = usePublicSettings();
  const cart = useCart();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="no-print sticky top-0 z-30 border-b border-line/80 bg-canvas/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4">
          <Link to="/" className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-forest text-lime">
              <Leaf className="size-[18px]" aria-hidden />
            </span>
            <span className="truncate font-display text-lg font-bold tracking-tight">{settings.data?.storeName ?? 'GrocerAI'}</span>
          </Link>
          <Link
            to="/checkout"
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full bg-forest pl-3.5 pr-2 text-sm font-semibold text-white transition-colors hover:bg-forest-soft"
          >
            <ShoppingBasket className="size-[18px]" aria-hidden />
            ตะกร้า
            <span className={cx('min-w-6 rounded-full px-1.5 py-0.5 text-center text-xs font-bold tabular-nums', cart.count > 0 ? 'bg-lime text-lime-ink' : 'bg-white/15 text-white/80')}>
              {cart.count}
            </span>
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:py-8">
        <Outlet />
      </main>
      <footer className="no-print mt-8 bg-forest py-8 text-center text-xs text-white/70">
        <p className="font-display text-sm font-semibold text-white">{settings.data?.storeName ?? 'GrocerAI'}</p>
        <p className="mt-1.5">{[settings.data?.storeAddress, settings.data?.storePhone && `โทร ${settings.data.storePhone}`].filter(Boolean).join(' · ')}</p>
        <p className="mt-3">
          ราคารวม VAT แล้ว · <Link to="/staff" className="underline underline-offset-2 hover:text-lime">สำหรับพนักงาน</Link>
        </p>
      </footer>
    </div>
  );
}
