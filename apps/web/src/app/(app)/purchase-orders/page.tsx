'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import {
  Button,
  Card,
  EmptyState,
  Input,
  PageHeader,
  Pagination,
  StatusFilterBar,
  Skeleton,
} from '@/components/ui';
import { PoStatusBadge } from '@/components/status-badge';
import { api } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import type {
  Paginated,
  PurchaseOrder,
  PurchaseOrderStatus,
} from '@/lib/types';

const STATUSES: { value: PurchaseOrderStatus | ''; label: string }[] = [
  { value: '', label: 'Tất cả trạng thái' },
  { value: 'DRAFT', label: 'Nháp' },
  { value: 'PENDING_APPROVAL', label: 'Chờ duyệt' },
  { value: 'APPROVED', label: 'Đã duyệt' },
  { value: 'ISSUED', label: 'Đã phát hành' },
  { value: 'ACKNOWLEDGED', label: 'NCC đã xác nhận' },
  { value: 'PARTIALLY_RECEIVED', label: 'Nhận một phần' },
  { value: 'COMPLETED', label: 'Hoàn tất' },
  { value: 'CANCELLED', label: 'Đã hủy' },
];

function PurchaseOrderList() {
  const params = useSearchParams();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [status, setStatus] = useState(params.get('status') ?? '');

  /** Đếm theo trạng thái, không phụ thuộc trạng thái đang chọn. */
  const counts = useQuery({
    queryKey: ['purchase-order-counts', { search }],
    queryFn: async () =>
      (
        await api.get<{ total: number; counts: Record<PurchaseOrderStatus, number> }>(
          '/purchase-orders/status-counts',
          { params: { ...(search ? { search } : {}) } },
        )
      ).data,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['purchase-orders', { search, status, page, pageSize }],
    queryFn: async () =>
      (
        await api.get<Paginated<PurchaseOrder>>('/purchase-orders', {
          params: {
                        page,
            pageSize,
            ...(search ? { search } : {}),
            ...(status ? { status } : {}),
          },
        })
      ).data,
  });

  return (
    <div>
      <PageHeader
        title="Đơn hàng"
        description="Đơn đặt hàng phát hành cho nhà cung cấp, lấy giá từ báo giá đã chốt."
        actions={
          <Link href="/purchase-orders/new">
            <Button>
              <Plus className="h-4 w-4" />
              Tạo đơn hàng
            </Button>
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Tìm theo mã hoặc tiêu đề…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

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
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : !data?.data.length ? (
        <EmptyState
          title="Chưa có đơn hàng nào"
          description="Đơn hàng được tạo từ RFQ đã chọn nhà cung cấp trúng thầu."
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-y border-border bg-muted/40 text-left">
                <tr>
                  <th className="cell-head">Mã đơn</th>
                  <th className="cell-head">Tiêu đề</th>
                  <th className="cell-head">Nhà cung cấp</th>
                  <th className="cell-head">Yêu cầu gốc</th>
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
                        href={`/purchase-orders/${po.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {po.code}
                      </Link>
                    </td>
                    <td className="max-w-56 truncate cell">{po.title}</td>
                    <td className="cell text-muted-foreground">
                      {po.supplier?.companyName}
                    </td>
                    <td className="cell text-muted-foreground">
                      {po.purchaseRequest?.code}
                    </td>
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
            page={page}
            pageSize={pageSize}
            total={data.meta.total}
            onPageChange={setPage}
            onPageSizeChange={(n) => {
              setPageSize(n);
              setPage(1);
            }}
          />
        </Card>
      )}
    </div>
  );
}

export default function PurchaseOrdersPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <PurchaseOrderList />
    </Suspense>
  );
}
