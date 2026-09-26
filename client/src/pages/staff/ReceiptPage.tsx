import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Printer } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import type { Sale } from '@shared/types';
import { Button, ErrorBox, Spinner } from '@/components/ui';
import { ReceiptView } from '@/features/sales/ReceiptView';
import { api } from '@/lib/api';

export function ReceiptPage() {
  const { receiptNo = '' } = useParams();
  const sale = useQuery({ queryKey: ['sale', receiptNo], queryFn: () => api.get<Sale>(`/api/sales/${encodeURIComponent(receiptNo)}`) });
  if (sale.isLoading) return <Spinner />;
  if (sale.error || !sale.data) return <ErrorBox error={sale.error} />;
  return (
    <div>
      <div className="no-print mb-4 flex items-center justify-between">
        <Link to="/staff/receipts" className="inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-ink">
          <ArrowLeft className="size-4" /> ใบเสร็จทั้งหมด
        </Link>
        <Button onClick={() => window.print()}>
          <Printer className="size-4" /> พิมพ์ใบเสร็จ
        </Button>
      </div>
      <ReceiptView sale={sale.data} />
    </div>
  );
}
