import { useQuery } from '@tanstack/react-query';
import { BarChart3, ClipboardList, History, LayoutDashboard, LogOut, Menu, Package, Receipt, Settings, ShieldCheck, ShoppingCart, Store, UserCircle, Users, Warehouse } from 'lucide-react';
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
    <nav className="flex flex-col gap-1 p-3">
      {NAV.filter((n) => !n.roles || can(user, ...n.roles)).map((n) => (
        <NavLink
          key={n.to}
          to={n.to}
          end={n.end}
          onClick={() => setOpen(false)}
          className={({ isActive }) =>
            cx('flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium', isActive ? 'bg-brand-700 text-white' : 'text-slate-300 hover:bg-white/10 hover:text-white')
          }
        >
          <n.icon className="size-4" aria-hidden />
          <span className="flex-1">{n.label}</span>
          {n.to === '/staff/orders' && (awaiting.data?.length ?? 0) > 0 && (
            <span className="rounded-full bg-amber-400 px-2 text-xs font-bold text-ink">{awaiting.data!.length}</span>
          )}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen lg:flex">
      <aside className={cx('no-print fixed inset-y-0 left-0 z-40 w-64 flex-col bg-ink lg:static lg:flex', open ? 'flex' : 'hidden')}>
        <div className="flex h-16 items-center gap-2.5 border-b border-white/10 px-5 text-white">
          <span className="flex size-8 items-center justify-center rounded-lg bg-brand-600">
            <Store className="size-4" aria-hidden />
          </span>
          <span className="font-bold">GrocerAI หลังร้าน</span>
        </div>
        <div className="flex-1 overflow-y-auto">{nav}</div>
        <div className="border-t border-white/10 p-3 text-sm text-slate-300">
          <NavLink to="/staff/account" className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-white/10">
            <UserCircle className="size-5" aria-hidden />
            <span className="min-w-0">
              <span className="block truncate font-medium text-white">{user.displayName}</span>
              <span className="flex items-center gap-1 text-xs">
                <ShieldCheck className="size-3" aria-hidden /> {ROLE_LABELS[user.role]}
              </span>
            </span>
          </NavLink>
          <a href="/" target="_blank" rel="noreferrer" className="mt-1 flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-white/10">
            <Store className="size-4" aria-hidden /> เปิดหน้าร้านออนไลน์
          </a>
          <button
            onClick={() => logout.mutate(undefined, { onSuccess: () => navigate('/staff/login') })}
            className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-white/10 cursor-pointer"
          >
            <LogOut className="size-4" aria-hidden /> ออกจากระบบ
          </button>
        </div>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />}
      <div className="min-w-0 flex-1">
        <div className="no-print flex h-14 items-center border-b border-line bg-white px-4 lg:hidden">
          <button onClick={() => setOpen(true)} className="rounded-md p-2 hover:bg-slate-100 cursor-pointer" aria-label="เมนู">
            <Menu className="size-5" />
          </button>
          <span className="ml-2 font-semibold">GrocerAI หลังร้าน</span>
        </div>
        <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
