'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Card,
  EmptyState,
  PageHeader,
  Skeleton,
} from '@/components/ui';
import { PoStatusBadge } from '@/components/status-badge';
import { api } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { Paginated, PurchaseOrder } from '@/lib/types';

export default function SupplierPurchaseOrdersPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['supplier-purchase-orders'],
    queryFn: async () =>
      (
        await api.get<Paginated<PurchaseOrder>>('/purchase-orders', {
          params: { pageSize: 50 },
        })
      ).data,
  });

  const pending = data?.data.filter((po) => po.status === 'ISSUED').length ?? 0;

  return (
    <div>
      <PageHeader
        title="Đơn hàng"
        description="Đơn đặt hàng bên mua đã phát hành cho bạn."
      />

      {pending > 0 ? (
        <Card className="mb-4 border-amber-300 dark:border-amber-800">
          <div className="p-4 text-sm">
            Bạn có <span className="font-semibold">{pending}</span> đơn hàng chờ
            xác nhận. Mở đơn và bấm <span className="font-medium">Xác nhận đơn hàng</span>.
          </div>
        </Card>
      ) : null}

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : !data?.data.length ? (
        <EmptyState
          title="Chưa có đơn hàng nào"
          description="Sau khi bạn trúng thầu, bên mua sẽ phát hành đơn hàng ở đây."
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/50 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">Mã đơn</th>
                  <th className="px-4 py-3 font-medium">Tiêu đề</th>
                  <th className="px-4 py-3 font-medium">Tổng tiền</th>
                  <th className="px-4 py-3 font-medium">Ngày giao</th>
                  <th className="px-4 py-3 font-medium">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((po) => (
                  <tr
                    key={po.id}
                    className="border-b border-border last:border-0 hover:bg-accent/50"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/supplier/purchase-orders/${po.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {po.code}
                      </Link>
                    </td>
                    <td className="max-w-64 truncate px-4 py-3">{po.title}</td>
                    <td className="px-4 py-3 font-medium tabular-nums">
                      {formatCurrency(po.totalAmount, po.currency)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(po.deliveryDate)}
                    </td>
                    <td className="px-4 py-3">
                      <PoStatusBadge status={po.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
