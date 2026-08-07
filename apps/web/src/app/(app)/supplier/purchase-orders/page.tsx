'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Card,
  EmptyState,
  PageHeader,
  Pagination,
  Skeleton,
  StatusFilterBar,
} from '@/components/ui';
import { PoStatusBadge } from '@/components/status-badge';
import { api } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import type {
  Paginated,
  PurchaseOrder,
  PurchaseOrderStatus,
} from '@/lib/types';

/** Nhà cung cấp không nhìn thấy đơn nháp của bên mua nên không liệt kê DRAFT. */
const STATUSES: { value: PurchaseOrderStatus | ''; label: string }[] = [
  { value: '', label: 'Tất cả' },
  { value: 'ISSUED', label: 'Chờ tôi xác nhận' },
  { value: 'ACKNOWLEDGED', label: 'Đã xác nhận' },
  { value: 'PARTIALLY_RECEIVED', label: 'Giao một phần' },
  { value: 'COMPLETED', label: 'Hoàn tất' },
  { value: 'CANCELLED', label: 'Đã hủy' },
];

export default function SupplierPurchaseOrdersPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [status, setStatus] = useState('');

  /** Đếm trên toàn bộ đơn của mình, không riêng trang đang xem. */
  const counts = useQuery({
    queryKey: ['supplier-purchase-order-counts'],
    queryFn: async () =>
      (
        await api.get<{ total: number; counts: Record<PurchaseOrderStatus, number> }>(
          '/purchase-orders/status-counts',
        )
      ).data,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['supplier-purchase-orders', { page, pageSize, status }],
    queryFn: async () =>
      (
        await api.get<Paginated<PurchaseOrder>>('/purchase-orders', {
          params: { page, pageSize, ...(status ? { status } : {}) },
        })
      ).data,
  });

  const pending = counts.data?.counts.ISSUED ?? 0;

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

      <StatusFilterBar
        options={STATUSES}
        value={status}
        onChange={(v) => {
          setStatus(v);
          setPage(1);
        }}
        counts={counts.data?.counts}
        total={counts.data?.total}
        isLoading={counts.isLoading}
      />

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
              <thead className="border-y border-border bg-muted/40 text-left">
                <tr>
                  <th className="cell-head">Mã đơn</th>
                  <th className="cell-head">Tiêu đề</th>
                  <th className="cell-head">Tổng tiền</th>
                  <th className="cell-head">Ngày giao</th>
                  <th className="cell-head">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((po) => (
                  <tr
                    key={po.id}
                    className="border-b border-border last:border-0 hover:bg-accent/50"
                  >
                    <td className="cell">
                      <Link
                        href={`/supplier/purchase-orders/${po.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {po.code}
                      </Link>
                    </td>
                    <td className="max-w-64 truncate cell">{po.title}</td>
                    <td className="cell font-medium tabular-nums">
                      {formatCurrency(po.totalAmount, po.currency)}
                    </td>
                    <td className="cell text-muted-foreground">
                      {formatDate(po.deliveryDate)}
                    </td>
                    <td className="cell">
                      <PoStatusBadge status={po.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={data.meta.page}
            pageSize={data.meta.pageSize}
            total={data.meta.total}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        </Card>
      )}
    </div>
  );
}
