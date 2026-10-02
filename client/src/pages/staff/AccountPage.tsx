import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { ROLE_LABELS } from '@shared/schemas';
import { Button, Card, ErrorBox, Input, PageHeader, useToast } from '@/components/ui';
import { useMe } from '@/features/auth/auth';
import { api, ApiRequestError } from '@/lib/api';

export function AccountPage() {
  const me = useMe();
  const toast = useToast();
  const [f, setF] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [mismatch, setMismatch] = useState(false);
  const change = useMutation({
    mutationFn: () => api.post('/api/auth/password', { currentPassword: f.currentPassword, newPassword: f.newPassword }),
    onSuccess: () => {
      toast('เปลี่ยนรหัสผ่านแล้ว อุปกรณ์อื่นถูกออกจากระบบ');
      setF({ currentPassword: '', newPassword: '', confirm: '' });
    },
  });
  const err = change.error instanceof ApiRequestError ? change.error.fields : {};
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (f.newPassword !== f.confirm) return setMismatch(true);
    setMismatch(false);
    change.mutate();
  };

  return (
    <div className="max-w-lg">
      <PageHeader title="บัญชีของฉัน" description={`${me.data?.displayName} (${me.data?.username}) · ${me.data ? ROLE_LABELS[me.data.role] : ''}`} />
      <Card className="p-5">
        <h2 className="mb-4 font-display text-lg font-semibold">เปลี่ยนรหัสผ่าน</h2>
        <form onSubmit={submit} className="space-y-4">
          <Input label="รหัสผ่านปัจจุบัน" type="password" autoComplete="current-password" required value={f.currentPassword} error={err.currentPassword} onChange={(e) => setF({ ...f, currentPassword: e.target.value })} />
          <Input label="รหัสผ่านใหม่" type="password" autoComplete="new-password" required value={f.newPassword} error={err.newPassword} hint="อย่างน้อย 8 ตัว มีตัวอักษรและตัวเลข" onChange={(e) => setF({ ...f, newPassword: e.target.value })} />
          <Input label="ยืนยันรหัสผ่านใหม่" type="password" autoComplete="new-password" required value={f.confirm} error={mismatch ? 'รหัสผ่านไม่ตรงกัน' : undefined} onChange={(e) => setF({ ...f, confirm: e.target.value })} />
          {!Object.keys(err).length && <ErrorBox error={change.error} />}
          <Button type="submit" loading={change.isPending}>
            บันทึกรหัสผ่านใหม่
          </Button>
        </form>
      </Card>
    </div>
  );
}
