import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import type { SessionUser } from '@shared/types';
import { Button, ErrorBox, Input, Spinner } from '@/components/ui';
import { useSetupStatus } from '@/features/auth/auth';
import { api, ApiRequestError } from '@/lib/api';
import { AuthShell } from './LoginPage';

export function SetupPage() {
  const setup = useSetupStatus();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [form, setForm] = useState({ storeName: '', displayName: '', username: '', password: '', confirm: '' });
  const [mismatch, setMismatch] = useState(false);
  const create = useMutation({
    mutationFn: () => api.post<SessionUser>('/api/auth/setup', form),
    onSuccess: (user) => {
      qc.setQueryData(['me'], user);
      qc.setQueryData(['setup'], { needsSetup: false });
      navigate('/staff/settings', { replace: true });
    },
  });
  const fields = create.error instanceof ApiRequestError ? create.error.fields : {};

  if (setup.isLoading) return <Spinner />;
  if (!setup.data?.needsSetup) return <Navigate to="/staff/login" replace />;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (form.password !== form.confirm) return setMismatch(true);
    setMismatch(false);
    create.mutate();
  };

  return (
    <AuthShell title="ตั้งค่าร้านครั้งแรก" subtitle="สร้างบัญชีผู้ดูแลระบบคนแรก">
      <form onSubmit={submit} className="space-y-4">
        <Input label="ชื่อร้าน" required value={form.storeName} error={fields.storeName} onChange={(e) => setForm({ ...form, storeName: e.target.value })} />
        <Input label="ชื่อที่แสดง" required value={form.displayName} error={fields.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
        <Input label="ชื่อผู้ใช้" autoComplete="username" required value={form.username} error={fields.username} hint="a-z, 0-9, _ และ . อย่างน้อย 3 ตัว" onChange={(e) => setForm({ ...form, username: e.target.value })} />
        <Input label="รหัสผ่าน" type="password" autoComplete="new-password" required value={form.password} error={fields.password} hint="อย่างน้อย 8 ตัว มีตัวอักษรและตัวเลข" onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <Input label="ยืนยันรหัสผ่าน" type="password" autoComplete="new-password" required value={form.confirm} error={mismatch ? 'รหัสผ่านไม่ตรงกัน' : undefined} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
        {!Object.keys(fields).length && <ErrorBox error={create.error} />}
        <Button type="submit" size="lg" className="w-full" loading={create.isPending}>
          สร้างบัญชีและเริ่มใช้งาน
        </Button>
      </form>
    </AuthShell>
  );
}
