import { useQuery } from '@tanstack/react-query';
import { BarChart3, ClipboardList, History, LayoutDashboard, Leaf, LogOut, Menu, Package, Receipt, Settings, ShieldCheck, ShoppingCart, Store, Users, Warehouse } from 'lucide-react';
import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import type { Role } from '@shared/schemas';
import { ROLE_LABELS } from '@shared/schemas';
import type { Order } from '@shared/types';
import { cx } from '@/components/ui';
import { can, useLogout, useMe } from '@/features/auth/auth';
import { api } from '@/lib/api';

const NAV: { to: string; label: string; icon: typeof Store; roles?: Role[]; end?: boolean }[] = [
  { to: '/staff', label: 'ภาพรวม', icon: LayoutDashboard, end: true },
  { to: '/staff/pos', label: 'ขายหน้าร้าน (POS)', icon: ShoppingCart },
  { to: '/staff/orders', label: 'คำสั่งซื้อออนไลน์', icon: ClipboardList },
  { to: '/staff/receipts', label: 'ใบเสร็จ', icon: Receipt },
  { to: '/staff/products', label: 'สินค้า', icon: Package, roles: ['manager'] },
  { to: '/staff/stock', label: 'สต็อก', icon: Warehouse, roles: ['manager'] },
  { to: '/staff/reports', label: 'รายงานยอดขาย', icon: BarChart3, roles: ['manager'] },
  { to: '/staff/users', label: 'ผู้ใช้งาน', icon: Users, roles: ['admin'] },
  { to: '/staff/settings', label: 'ตั้งค่าร้าน', icon: Settings, roles: ['admin'] },
  { to: '/staff/audit', label: 'บันทึกการใช้งาน', icon: History, roles: ['admin'] },
];

export function StaffLayout() {
  const me = useMe();
  const logout = useLogout();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const awaiting = useQuery({
    queryKey: ['orders', 'awaiting_payment'],
    queryFn: () => api.get<Order[]>('/api/orders?status=awaiting_payment'),
    refetchInterval: 20_000,
  });
  const user = me.data!;

  const nav = (
    <nav className="flex flex-col gap-1 px-3 py-4" aria-label="เมนูหลังร้าน">
      {NAV.filter((n) => !n.roles || can(user, ...n.roles)).map((n) => (
        <NavLink
          key={n.to}
          to={n.to}
          end={n.end}
          onClick={() => setOpen(false)}
          className={({ isActive }) =>
            cx(
              'flex items-center gap-3 rounded-full px-4 py-2.5 text-sm font-medium transition-colors',
              isActive ? 'bg-lime font-semibold text-lime-ink' : 'text-white/70 hover:bg-white/10 hover:text-white'
            )
          }
        >
          <n.icon className="size-4" aria-hidden />
          <span className="flex-1">{n.label}</span>
          {n.to === '/staff/orders' && (awaiting.data?.length ?? 0) > 0 && (
            <span className="min-w-6 rounded-full bg-amber-400 px-1.5 py-0.5 text-center text-xs font-bold text-ink tabular-nums">{awaiting.data!.length}</span>
          )}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen lg:flex">
      <aside className={cx('no-print fixed inset-y-0 left-0 z-40 w-68 flex-col bg-forest lg:sticky lg:top-0 lg:h-screen lg:flex', open ? 'flex' : 'hidden')}>
        <div className="flex h-18 items-center gap-2.5 px-6 text-white">
          <span className="flex size-9 items-center justify-center rounded-full bg-lime text-lime-ink">
            <Leaf className="size-[18px]" aria-hidden />
          </span>
          <span className="font-display text-lg font-bold tracking-tight">GrocerAI</span>
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/70">หลังร้าน</span>
        </div>
        <div className="flex-1 overflow-y-auto">{nav}</div>
        <div className="space-y-1 p-3 text-sm text-white/70">
          <NavLink to="/staff/account" className="flex items-center gap-3 rounded-2xl bg-white/5 px-3 py-2.5 hover:bg-white/10">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-forest-soft font-display font-bold text-lime" aria-hidden>
              {user.displayName.trim().charAt(0)}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-medium text-white">{user.displayName}</span>
              <span className="flex items-center gap-1 text-xs">
                <ShieldCheck className="size-3" aria-hidden /> {ROLE_LABELS[user.role]}
              </span>
            </span>
          </NavLink>
          <a href="/" target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-full px-4 py-2 hover:bg-white/10 hover:text-white">
            <Store className="size-4" aria-hidden /> เปิดหน้าร้านออนไลน์
          </a>
          <button
            onClick={() => logout.mutate(undefined, { onSuccess: () => navigate('/staff/login') })}
            className="flex w-full items-center gap-3 rounded-full px-4 py-2 text-left hover:bg-white/10 hover:text-white cursor-pointer"
          >
            <LogOut className="size-4" aria-hidden /> ออกจากระบบ
          </button>
        </div>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-forest/40 lg:hidden" onClick={() => setOpen(false)} />}
      <div className="min-w-0 flex-1">
        <div className="no-print sticky top-0 z-20 flex h-14 items-center border-b border-line bg-canvas/90 px-4 backdrop-blur-md lg:hidden">
          <button onClick={() => setOpen(true)} className="rounded-full p-2 hover:bg-forest/5 cursor-pointer" aria-label="เมนู">
            <Menu className="size-5" />
          </button>
          <span className="ml-2 font-display font-semibold">GrocerAI หลังร้าน</span>
        </div>
        <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
