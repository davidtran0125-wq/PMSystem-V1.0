'use client';

import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, FileDown } from 'lucide-react';
import { toast } from 'sonner';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  PageHeader,
  Skeleton,
} from '@/components/ui';
import { PoStatusBadge } from '@/components/status-badge';
import { saveFile } from '@/components/attachments';
import { ConfirmButton } from '@/components/confirm-button';
import { api, apiErrorMessage } from '@/lib/api';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils';
import type { PurchaseOrder } from '@/lib/types';

export default function SupplierPurchaseOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: po, isLoading } = useQuery({
    queryKey: ['supplier-purchase-order', id],
    queryFn: async () =>
      (await api.get<PurchaseOrder>(`/purchase-orders/${id}`)).data,
  });

  const acknowledge = useMutation({
    mutationFn: async () => api.post(`/purchase-orders/${id}/acknowledge`),
    onSuccess: () => {
      toast.success('Đã xác nhận đơn hàng');
      void queryClient.invalidateQueries({ queryKey: ['supplier-purchase-order', id] });
      void queryClient.invalidateQueries({ queryKey: ['supplier-purchase-orders'] });
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const pdf = useMutation({
    mutationFn: async () => saveFile(`/purchase-orders/${id}/pdf`, `${po?.code ?? 'don-hang'}.pdf`),
    onError: (error) => toast.error(apiErrorMessage(error, 'Không tải được file PDF')),
  });

  if (isLoading || !po) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <Button
        variant="ghost"
        size="sm"
        className="mb-3"
        onClick={() => router.push('/supplier/purchase-orders')}
      >
        <ArrowLeft className="h-4 w-4" />
        Danh sách đơn hàng
      </Button>

      <PageHeader
        title={`${po.code} — ${po.title}`}
        description={`Bên mua: ${po.buyer.fullName} · Phát hành ${formatDateTime(po.issuedAt)}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={pdf.isPending}
              onClick={() => pdf.mutate()}
            >
              <FileDown className="h-4 w-4" />
              {pdf.isPending ? 'Đang tạo PDF…' : 'Tải PDF'}
            </Button>
            {po.status === 'ISSUED' ? (
              <ConfirmButton
                confirmLabel="Xác nhận nhận đơn hàng này?"
                confirmActionLabel="Xác nhận"
                onConfirm={() => acknowledge.mutate()}
                disabled={acknowledge.isPending}
              >
                <CheckCircle2 className="h-4 w-4" />
                Xác nhận đơn hàng
              </ConfirmButton>
            ) : null}
          </div>
        }
      />

      <div className="mb-4">
        <PoStatusBadge status={po.status} />
      </div>

      {po.status === 'CANCELLED' && po.cancelReason ? (
        <Card className="mb-4 border-red-300 dark:border-red-900">
          <CardContent className="p-4">
            <p className="text-sm font-medium">Bên mua đã hủy đơn hàng này</p>
            <p className="mt-1 text-sm text-muted-foreground">{po.cancelReason}</p>
          </CardContent>
        </Card>
      ) : null}

      <Card className="mb-4 overflow-hidden">
        <CardHeader>
          <CardTitle>Chi tiết hàng hóa</CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-y border-border bg-muted/40 text-left">
              <tr>
                <th className="cell-head">#</th>
                <th className="cell-head">Hàng hóa</th>
                <th className="cell-head">Số lượng</th>
                <th className="cell-head">Đơn giá</th>
                <th className="cell-head">Thành tiền</th>
              </tr>
            </thead>
            <tbody>
              {po.items.map((item) => (
                <tr key={item.id} className="border-b border-border last:border-0">
                  <td className="cell">{item.lineNo}</td>
                  <td className="cell">{item.name}</td>
                  <td className="cell tabular-nums">
                    {Number(item.quantity).toLocaleString('vi-VN')} {item.unit}
                  </td>
                  <td className="cell tabular-nums">
                    {formatCurrency(item.unitPrice, po.currency)}
                  </td>
                  <td className="cell tabular-nums">
                    {formatCurrency(item.lineTotal, po.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <CardContent className="pt-4">
          <div className="ml-auto max-w-xs space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tạm tính</span>
              <span className="tabular-nums">
                {formatCurrency(po.subtotal, po.currency)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                Thuế VAT ({Number(po.taxRate)}%)
              </span>
              <span className="tabular-nums">
                {formatCurrency(po.taxAmount, po.currency)}
              </span>
            </div>
            <div className="flex justify-between border-t border-border pt-1.5 font-semibold">
              <span>Tổng cộng</span>
              <span className="tabular-nums">
                {formatCurrency(po.totalAmount, po.currency)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Điều khoản giao hàng</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <Detail label="Điều khoản thanh toán" value={po.paymentTerm ?? '—'} />
          <Detail label="Incoterm" value={po.incoterm ?? '—'} />
          <Detail label="Ngày giao hàng" value={formatDate(po.deliveryDate)} />
          <Detail label="Bảo hành" value={po.warranty ?? '—'} />
          <Detail
            label="Địa chỉ giao hàng"
            value={po.deliveryAddress ?? '—'}
            className="sm:col-span-2"
          />
          {po.note ? (
            <Detail label="Ghi chú từ bên mua" value={po.note} className="sm:col-span-2" />
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function Detail({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 whitespace-pre-wrap">{value}</p>
    </div>
  );
}
