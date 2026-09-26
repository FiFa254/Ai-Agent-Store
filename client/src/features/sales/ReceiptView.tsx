// Printable receipt (80 mm). Wrap with .print-area to print only this block.
import { useQuery } from '@tanstack/react-query';
import type { Sale, Settings } from '@shared/types';
import { api } from '@/lib/api';
import { formatBaht, formatDateTime, PAYMENT_LABELS } from '@/lib/format';

export function useStoreSettings() {
  return useQuery({ queryKey: ['settings'], queryFn: () => api.get<Settings>('/api/settings'), staleTime: 300_000 });
}

export function ReceiptView({ sale }: { sale: Sale }) {
  const settings = useStoreSettings().data;
  return (
    <div className="print-area mx-auto w-full max-w-sm rounded-lg border border-line bg-white p-5 font-mono text-[13px] leading-relaxed">
      <div className="text-center">
        <p className="text-base font-bold">{settings?.storeName}</p>
        {settings?.storeAddress && <p>{settings.storeAddress}</p>}
        {settings?.storePhone && <p>โทร {settings.storePhone}</p>}
        {settings?.taxId && <p>เลขประจำตัวผู้เสียภาษี {settings.taxId}</p>}
        <p className="mt-2 font-bold">ใบเสร็จรับเงิน / ใบกำกับภาษีอย่างย่อ</p>
      </div>
      <div className="my-3 border-t border-dashed border-slate-400" />
      <p>เลขที่ {sale.receiptNo}</p>
      <p>วันที่ {formatDateTime(sale.createdAt)}</p>
      {sale.orderNo && <p>คำสั่งซื้อออนไลน์ {sale.orderNo}</p>}
      {sale.cashierName && <p>พนักงาน {sale.cashierName}</p>}
      <div className="my-3 border-t border-dashed border-slate-400" />
      {sale.items.map((i) => (
        <div key={i.productId} className="mb-1">
          <p>{i.name}</p>
          <p className="flex justify-between pl-3">
            <span>
              {i.quantity} × {i.unitPrice.toFixed(2)}
            </span>
            <span>{i.lineTotal.toFixed(2)}</span>
          </p>
        </div>
      ))}
      <div className="my-3 border-t border-dashed border-slate-400" />
      <p className="flex justify-between">
        <span>มูลค่าสินค้า</span>
        <span>{sale.subtotal.toFixed(2)}</span>
      </p>
      <p className="flex justify-between">
        <span>VAT</span>
        <span>{sale.vatAmount.toFixed(2)}</span>
      </p>
      <p className="flex justify-between text-base font-bold">
        <span>รวมทั้งสิ้น</span>
        <span>{formatBaht(sale.total)}</span>
      </p>
      <p className="flex justify-between">
        <span>ชำระโดย</span>
        <span>{PAYMENT_LABELS[sale.paymentMethod]}</span>
      </p>
      {sale.cashReceived !== null && (
        <>
          <p className="flex justify-between">
            <span>รับเงิน</span>
            <span>{sale.cashReceived.toFixed(2)}</span>
          </p>
          <p className="flex justify-between">
            <span>เงินทอน</span>
            <span>{(sale.change ?? 0).toFixed(2)}</span>
          </p>
        </>
      )}
      <div className="my-3 border-t border-dashed border-slate-400" />
      <p className="text-center">{settings?.receiptFooter || 'ขอบคุณที่ใช้บริการ'}</p>
    </div>
  );
}
