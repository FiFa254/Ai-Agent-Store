import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Plus, UserCheck, UserX } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { ROLES, ROLE_LABELS, type Role } from '@shared/schemas';
import type { UserRow } from '@shared/types';
import { Badge, Button, Card, Dialog, ErrorBox, Input, PageHeader, Select, Spinner, tableClass, useToast } from '@/components/ui';
import { useMe } from '@/features/auth/auth';
import { api, ApiRequestError, errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';

export function UsersPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const me = useMe();
  const users = useQuery({ queryKey: ['users'], queryFn: () => api.get<UserRow[]>('/api/users') });
  const [creating, setCreating] = useState(false);
  const [resetting, setResetting] = useState<UserRow | null>(null);

  const update = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) => api.patch(`/api/users/${id}`, body),
    onSuccess: () => {
      toast('บันทึกแล้ว');
      qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  });

  return (
    <div>
      <PageHeader
        title="ผู้ใช้งาน"
        description="แคชเชียร์: ขายหน้าร้าน ยืนยันออเดอร์ ใบเสร็จ · ผู้จัดการ: + สินค้า สต็อก รายงาน · ผู้ดูแลระบบ: ทุกอย่าง"
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" /> เพิ่มผู้ใช้
          </Button>
        }
      />
      <Card className="overflow-hidden">
        {users.isLoading ? (
          <Spinner />
        ) : users.error ? (
          <div className="p-4"><ErrorBox error={users.error} /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className={tableClass.table}>
              <thead>
                <tr>
                  <th className={tableClass.th}>ผู้ใช้</th>
                  <th className={tableClass.th}>สิทธิ์</th>
                  <th className={tableClass.th}>สถานะ</th>
                  <th className={tableClass.th}>เข้าใช้ล่าสุด</th>
                  <th className={tableClass.th}></th>
                </tr>
              </thead>
              <tbody>
                {users.data!.map((u) => (
                  <tr key={u.id} className={u.isActive ? '' : 'bg-subtle text-muted'}>
                    <td className={tableClass.td}>
                      <p className="font-medium">{u.displayName}</p>
                      <p className="text-xs text-muted">{u.username}</p>
                    </td>
                    <td className={tableClass.td}>
                      <Select
                        aria-label={`สิทธิ์ของ ${u.username}`}
                        value={u.role}
                        disabled={u.id === me.data?.id}
                        onChange={(e) => update.mutate({ id: u.id, body: { role: e.target.value as Role } })}
                        className="w-40"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className={tableClass.td}>
                      {u.lockedUntil ? <Badge tone="red">ถูกล็อกถึง {formatDateTime(u.lockedUntil)}</Badge> : u.isActive ? <Badge tone="green">ใช้งาน</Badge> : <Badge>ปิดใช้งาน</Badge>}
                    </td>
                    <td className={tableClass.td}>{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : '-'}</td>
                    <td className={`${tableClass.td} whitespace-nowrap text-right`}>
                      <Button variant="ghost" size="sm" onClick={() => setResetting(u)}>
                        <KeyRound className="size-4" /> ตั้งรหัสใหม่
                      </Button>
                      {u.id !== me.data?.id && (
                        <Button variant="ghost" size="sm" onClick={() => update.mutate({ id: u.id, body: { isActive: !u.isActive } })}>
                          {u.isActive ? <UserX className="size-4 text-danger" /> : <UserCheck className="size-4" />}
                          {u.isActive ? 'ปิด' : 'เปิด'}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {creating && <CreateUserDialog onClose={() => setCreating(false)} />}
      {resetting && <ResetPasswordDialog user={resetting} onClose={() => setResetting(null)} />}
    </div>
  );
}

function CreateUserDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [f, setF] = useState({ username: '', displayName: '', password: '', role: 'cashier' as Role });
  const create = useMutation({
    mutationFn: () => api.post('/api/users', f),
    onSuccess: () => {
      toast('เพิ่มผู้ใช้แล้ว');
      qc.invalidateQueries({ queryKey: ['users'] });
      onClose();
    },
  });
  const err = create.error instanceof ApiRequestError ? create.error.fields : {};
  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title="เพิ่มผู้ใช้"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button type="submit" form="user-form" loading={create.isPending}>
            เพิ่ม
          </Button>
        </>
      }
    >
      <form id="user-form" onSubmit={submit} className="space-y-4">
        <Input label="ชื่อที่แสดง" required value={f.displayName} error={err.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} />
        <Input label="ชื่อผู้ใช้" required autoComplete="off" value={f.username} error={err.username} onChange={(e) => setF({ ...f, username: e.target.value })} />
        <Input label="รหัสผ่านเริ่มต้น" type="password" autoComplete="new-password" required value={f.password} error={err.password} hint="อย่างน้อย 8 ตัว มีตัวอักษรและตัวเลข" onChange={(e) => setF({ ...f, password: e.target.value })} />
        <Select label="สิทธิ์" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </Select>
        {!Object.keys(err).length && <ErrorBox error={create.error} />}
      </form>
    </Dialog>
  );
}

function ResetPasswordDialog({ user, onClose }: { user: UserRow; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [password, setPassword] = useState('');
  const reset = useMutation({
    mutationFn: () => api.patch(`/api/users/${user.id}`, { password }),
    onSuccess: () => {
      toast('ตั้งรหัสผ่านใหม่และปลดล็อกแล้ว');
      qc.invalidateQueries({ queryKey: ['users'] });
      onClose();
    },
  });
  const err = reset.error instanceof ApiRequestError ? reset.error.fields : {};
  return (
    <Dialog
      open
      onClose={onClose}
      title={`ตั้งรหัสผ่านใหม่ให้ ${user.displayName}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button onClick={() => reset.mutate()} loading={reset.isPending} disabled={!password}>
            บันทึก
          </Button>
        </>
      }
    >
      <Input label="รหัสผ่านใหม่" type="password" autoComplete="new-password" value={password} error={err.password} hint="ผู้ใช้จะถูกออกจากระบบทุกอุปกรณ์" onChange={(e) => setPassword(e.target.value)} />
      {!Object.keys(err).length && <ErrorBox error={reset.error} />}
    </Dialog>
  );
}
