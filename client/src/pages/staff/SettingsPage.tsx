import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import type { Settings } from '@shared/types';
import { Button, Card, ErrorBox, Input, PageHeader, Spinner, Textarea, useToast } from '@/components/ui';
import { useStoreSettings } from '@/features/sales/ReceiptView';
import { api, ApiRequestError } from '@/lib/api';

export function SettingsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const settings = useStoreSettings();
  const [f, setF] = useState<Settings | null>(null);
  useEffect(() => {
    if (settings.data) setF(settings.data);
  }, [settings.data]);

  const save = useMutation({
    mutationFn: () => api.put<Settings>('/api/settings', f),
    onSuccess: (s) => {
      qc.setQueryData(['settings'], s);
      qc.invalidateQueries({ queryKey: ['public-settings'] });
      toast('บันทึกการตั้งค่าแล้ว');
    },
  });
  const err = save.error instanceof ApiRequestError ? save.error.fields : {};

  if (!f) return <Spinner />;
  const set = (k: keyof Settings) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value } as Settings);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };

  return (
    <div>
      <PageHeader title="ตั้งค่าร้าน" description="ข้อมูลนี้แสดงบนหน้าร้านออนไลน์และใบเสร็จ" />
      <form onSubmit={submit} className="grid gap-6 lg:grid-cols-2">
        <Card className="space-y-4 p-5">
          <h2 className="font-display text-lg font-semibold">ข้อมูลร้าน</h2>
          <Input label="ชื่อร้าน" required value={f.storeName} error={err.storeName} onChange={set('storeName')} />
          <Textarea label="ที่อยู่" value={f.storeAddress} error={err.storeAddress} onChange={set('storeAddress')} />
          <Input label="เบอร์โทร" value={f.storePhone} error={err.storePhone} onChange={set('storePhone')} />
          <Input label="เลขประจำตัวผู้เสียภาษี" value={f.taxId} error={err.taxId} onChange={set('taxId')} />
          <Textarea label="ข้อความท้ายใบเสร็จ" value={f.receiptFooter} error={err.receiptFooter} onChange={set('receiptFooter')} />
        </Card>
        <Card className="space-y-4 p-5">
          <h2 className="font-display text-lg font-semibold">การชำระเงินและภาษี</h2>
          <Input
            label="หมายเลขพร้อมเพย์ของร้าน"
            value={f.promptPayId}
            error={err.promptPayId}
            placeholder="0812345678 หรือเลขผู้เสียภาษี 13 หลัก"
            hint="ใช้สร้าง QR สำหรับลูกค้าสแกนจ่าย ว่างไว้ = ไม่รับพร้อมเพย์"
            onChange={set('promptPayId')}
          />
          <Input label="อัตรา VAT (%)" type="number" min={0} max={30} step="0.01" value={f.vatRate} error={err.vatRate} hint="ราคาสินค้ารวม VAT แล้ว ระบบคำนวณ VAT ในใบเสร็จจากยอดรวม" onChange={set('vatRate')} />
          <Input label="เวลากันสินค้าให้ออเดอร์ออนไลน์ (นาที)" type="number" min={5} max={1440} value={f.orderExpiryMinutes} error={err.orderExpiryMinutes} onChange={set('orderExpiryMinutes')} />
          {!Object.keys(err).length && <ErrorBox error={save.error} />}
          <Button type="submit" loading={save.isPending}>
            บันทึกการตั้งค่า
          </Button>
        </Card>
      </form>
    </div>
  );
}
