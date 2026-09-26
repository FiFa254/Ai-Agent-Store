import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Store } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import type { SessionUser } from '@shared/types';
import { Button, Card, ErrorBox, Input, Spinner } from '@/components/ui';
import { useMe, useSetupStatus } from '@/features/auth/auth';
import { api } from '@/lib/api';

export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-4">
      <Card className="w-full max-w-md p-8">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl bg-brand-700 text-white">
            <Store className="size-6" aria-hidden />
          </span>
          <div>
            <h1 className="text-xl font-bold">{title}</h1>
            <p className="text-sm text-muted">{subtitle}</p>
          </div>
        </div>
        {children}
      </Card>
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
