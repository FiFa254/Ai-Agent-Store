import { useQuery } from '@tanstack/react-query';
import { ShoppingBasket, Store } from 'lucide-react';
import { Link, Outlet } from 'react-router-dom';
import type { PublicSettings } from '@shared/types';
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
      <header className="no-print sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-lg bg-brand-700 text-white">
              <Store className="size-5" aria-hidden />
            </span>
            <span className="text-lg font-bold">{settings.data?.storeName ?? 'GrocerAI'}</span>
          </Link>
          <Link to="/checkout" className="relative inline-flex h-10 items-center gap-2 rounded-lg border border-line px-3 text-sm font-semibold hover:bg-slate-50">
            <ShoppingBasket className="size-5" aria-hidden />
            ตะกร้า
            {cart.count > 0 && <span className="rounded-full bg-brand-700 px-2 py-0.5 text-xs text-white">{cart.count}</span>}
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        <Outlet />
      </main>
      <footer className="no-print border-t border-line bg-white py-6 text-center text-xs text-muted">
        <p>{[settings.data?.storeName, settings.data?.storeAddress, settings.data?.storePhone && `โทร ${settings.data.storePhone}`].filter(Boolean).join(' · ')}</p>
        <p className="mt-1">
          ราคารวม VAT แล้ว · <Link to="/staff" className="underline hover:text-ink">สำหรับพนักงาน</Link>
        </p>
      </footer>
    </div>
  );
}
