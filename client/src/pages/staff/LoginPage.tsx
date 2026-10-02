import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Leaf } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import type { SessionUser } from '@shared/types';
import { Button, ErrorBox, Input, Spinner } from '@/components/ui';
import { useMe, useSetupStatus } from '@/features/auth/auth';
import { api } from '@/lib/api';

const BACK_OFFICE_FEATURES = ['ขายหน้าร้าน (POS) และพิมพ์ใบเสร็จ', 'รับคำสั่งซื้อออนไลน์', 'จัดการสินค้า สต็อก และรายงานยอดขาย'];

export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="grid min-h-screen bg-canvas lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <aside className="relative hidden overflow-hidden bg-forest p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div aria-hidden className="pointer-events-none absolute -bottom-32 -right-24 size-96 rounded-full bg-lime/10" />
        <div aria-hidden className="pointer-events-none absolute -bottom-10 right-40 size-40 rounded-full bg-brand-500/25" />
        <span className="flex items-center gap-2.5 font-display text-lg font-bold">
          <span className="flex size-10 items-center justify-center rounded-full bg-lime text-lime-ink">
            <Leaf className="size-5" aria-hidden />
          </span>
          GrocerAI หลังร้าน
        </span>
        <div className="relative max-w-md">
          <p className="text-balance font-display text-4xl font-bold leading-tight tracking-tight">ระบบหลังร้านสำหรับร้านชำของคุณ</p>
          <ul className="mt-8 space-y-3 text-white/80">
            {BACK_OFFICE_FEATURES.map((f) => (
              <li key={f} className="flex items-center gap-3">
                <CheckCircle2 className="size-5 shrink-0 text-lime" aria-hidden /> {f}
              </li>
            ))}
          </ul>
        </div>
      </aside>
      <main className="flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-md rounded-[1.75rem] bg-surface p-7 shadow-card sm:p-10">
          <span className="mb-8 flex size-11 items-center justify-center rounded-full bg-forest text-lime lg:hidden">
            <Leaf className="size-5" aria-hidden />
          </span>
          <h1 className="font-display text-[1.75rem] font-bold leading-tight tracking-tight">{title}</h1>
          <p className="mb-7 mt-1.5 text-sm text-muted">{subtitle}</p>
          {children}
        </div>
      </main>
    </div>
  );
}

export function LoginPage() {
  const me = useMe();
  const setup = useSetupStatus();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [form, setForm] = useState({ username: '', password: '' });
  const login = useMutation({
    mutationFn: () => api.post<SessionUser>('/api/auth/login', form),
    onSuccess: (user) => {
      qc.setQueryData(['me'], user);
      const next = params.get('next');
      navigate(next && next.startsWith('/staff') ? next : '/staff', { replace: true });
    },
  });

  if (me.isLoading || setup.isLoading) return <Spinner />;
  if (setup.data?.needsSetup) return <Navigate to="/staff/setup" replace />;
  if (me.data) return <Navigate to="/staff" replace />;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    login.mutate();
  };

  return (
    <AuthShell title="เข้าสู่ระบบหลังร้าน" subtitle="สำหรับพนักงานและผู้ดูแลร้าน">
      <form onSubmit={submit} className="space-y-4">
        <Input label="ชื่อผู้ใช้" autoComplete="username" autoFocus required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
        <Input label="รหัสผ่าน" type="password" autoComplete="current-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <ErrorBox error={login.error} />
        <Button type="submit" size="lg" className="w-full" loading={login.isPending}>
          เข้าสู่ระบบ
        </Button>
      </form>
    </AuthShell>
  );
}
