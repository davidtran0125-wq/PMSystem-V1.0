'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, Send, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  PageHeader,
  Skeleton,
  Textarea,
} from '@/components/ui';
import { PoStatusBadge } from '@/components/status-badge';
import { api, apiErrorMessage } from '@/lib/api';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils';
import type { PurchaseOrder } from '@/lib/types';

export default function PurchaseOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');

  const { data: po, isLoading } = useQuery({
    queryKey: ['purchase-order', id],
    queryFn: async () =>
      (await api.get<PurchaseOrder>(`/purchase-orders/${id}`)).data,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['purchase-order', id] });
    void queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
  };

  const onDone = (message: string) => () => {
    toast.success(message);
    setCancelling(false);
    setReason('');
    invalidate();
  };
  const onFail = (error: unknown) => toast.error(apiErrorMessage(error));

  const issue = useMutation({
    mutationFn: async () => api.post(`/purchase-orders/${id}/issue`),
    onSuccess: onDone('Đã phát hành đơn hàng tới nhà cung cấp'),
    onError: onFail,
  });

  const complete = useMutation({
    mutationFn: async () => api.post(`/purchase-orders/${id}/complete`),
    onSuccess: onDone('Đã đánh dấu hoàn tất'),
    onError: onFail,
  });

  const cancel = useMutation({
    mutationFn: async (body: { reason: string }) =>
      api.post(`/purchase-orders/${id}/cancel`, body),
    onSuccess: onDone('Đã hủy đơn hàng'),
    onError: onFail,
  });

  if (isLoading || !po) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const canIssue = po.status === 'DRAFT';
  const canComplete = ['ISSUED', 'ACKNOWLEDGED', 'PARTIALLY_RECEIVED'].includes(
    po.status,
  );
  const canCancel = !['COMPLETED', 'CANCELLED'].includes(po.status);

  return (
    <div className="mx-auto max-w-5xl">
      <Button
        variant="ghost"
        size="sm"
        className="mb-3"
        onClick={() => router.push('/purchase-orders')}
      >
        <ArrowLeft className="h-4 w-4" />
        Danh sách đơn hàng
      </Button>

      <PageHeader
        title={`${po.code} — ${po.title}`}
        description={`Nhà cung cấp: ${po.supplier.companyName} · Từ yêu cầu ${po.purchaseRequest.code}`}
        actions={
          <div className="flex flex-wrap gap-2">
            {canIssue ? (
              <Button onClick={() => issue.mutate()} disabled={issue.isPending}>
                <Send className="h-4 w-4" />
                Phát hành
              </Button>
            ) : null}
            {canComplete ? (
              <Button
                variant="outline"
                onClick={() => complete.mutate()}
                disabled={complete.isPending}
              >
                <CheckCircle2 className="h-4 w-4" />
                Hoàn tất
              </Button>
            ) : null}
            {canCancel ? (
              <Button variant="outline" onClick={() => setCancelling((v) => !v)}>
                <XCircle className="h-4 w-4" />
                Hủy đơn
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <PoStatusBadge status={po.status} />
        {po.rfq ? (
          <Link
            href={`/rfqs/${po.rfq.id}`}
            className="text-sm text-primary hover:underline"
          >
            {po.rfq.code}
          </Link>
        ) : null}
        <Link
          href={`/purchase-requests/${po.purchaseRequest.id}`}
          className="text-sm text-primary hover:underline"
        >
          {po.purchaseRequest.code}
        </Link>
      </div>

      {cancelling ? (
        <Card className="mb-4 border-red-300 dark:border-red-900">
          <CardContent className="p-4">
            <p className="mb-2 text-sm font-medium">Lý do hủy đơn hàng</p>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Nêu rõ lý do để nhà cung cấp nắm được."
            />
            <div className="mt-2 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setCancelling(false)}>
                Đóng
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={!reason.trim() || cancel.isPending}
                onClick={() => cancel.mutate({ reason })}
              >
                Xác nhận hủy
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {po.status === 'CANCELLED' && po.cancelReason ? (
        <Card className="mb-4 border-red-300 dark:border-red-900">
          <CardContent className="p-4">
            <p className="text-sm font-medium">Đơn hàng đã hủy</p>
            <p className="mt-1 text-sm text-muted-foreground">{po.cancelReason}</p>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>Chi tiết hàng hóa</CardTitle>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-y border-border bg-muted/50 text-left">
                  <tr>
                    <th className="px-4 py-2 font-medium">#</th>
                    <th className="px-4 py-2 font-medium">Hàng hóa</th>
                    <th className="px-4 py-2 font-medium">Số lượng</th>
                    <th className="px-4 py-2 font-medium">Đơn giá</th>
                    <th className="px-4 py-2 font-medium">Thành tiền</th>
                  </tr>
                </thead>
                <tbody>
                  {po.items.map((item) => (
                    <tr key={item.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-2">{item.lineNo}</td>
                      <td className="px-4 py-2">
                        <p>{item.name}</p>
                        {item.specification ? (
                          <p className="text-xs text-muted-foreground">
                            {item.specification}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-2 tabular-nums">
                        {Number(item.quantity).toLocaleString('vi-VN')} {item.unit}
                      </td>
                      <td className="px-4 py-2 tabular-nums">
                        {formatCurrency(item.unitPrice, po.currency)}
                      </td>
                      <td className="px-4 py-2 tabular-nums">
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
              <CardTitle>Điều khoản</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <Detail label="Điều khoản thanh toán" value={po.paymentTerm ?? '—'} />
              <Detail label="Incoterm" value={po.incoterm ?? '—'} />
              <Detail label="Điều kiện giao hàng" value={po.deliveryTerm ?? '—'} />
              <Detail label="Bảo hành" value={po.warranty ?? '—'} />
              <Detail label="Ngày giao hàng" value={formatDate(po.deliveryDate)} />
              <Detail label="Địa chỉ giao" value={po.deliveryAddress ?? '—'} />
              {po.note ? (
                <Detail label="Ghi chú" value={po.note} className="sm:col-span-2" />
              ) : null}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Nhà cung cấp</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="font-medium">{po.supplier.companyName}</p>
              <p className="text-muted-foreground">{po.supplier.code}</p>
              {po.supplier.contactPerson ? (
                <p className="text-muted-foreground">
                  Liên hệ: {po.supplier.contactPerson}
                </p>
              ) : null}
              {po.supplier.email ? (
                <p className="text-muted-foreground">{po.supplier.email}</p>
              ) : null}
              {po.supplier.taxCode ? (
                <p className="text-muted-foreground">MST: {po.supplier.taxCode}</p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tiến trình</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Detail label="Người tạo" value={po.buyer.fullName} />
              <Detail label="Ngày tạo" value={formatDateTime(po.createdAt)} />
              <Detail label="Ngày phát hành" value={formatDateTime(po.issuedAt)} />
              <Detail
                label="NCC xác nhận"
                value={formatDateTime(po.acknowledgedAt)}
              />
              <Detail label="Hoàn tất" value={formatDateTime(po.completedAt)} />
            </CardContent>
          </Card>
        </div>
      </div>
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
