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
  Select,
  Skeleton,
} from '@/components/ui';
import { PoStatusBadge } from '@/components/status-badge';
import { api } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { Paginated, PurchaseOrder } from '@/lib/types';

const STATUSES = [
  { value: '', label: 'Tất cả trạng thái' },
  { value: 'DRAFT', label: 'Nháp' },
  { value: 'ISSUED', label: 'Đã phát hành' },
  { value: 'ACKNOWLEDGED', label: 'NCC đã xác nhận' },
  { value: 'COMPLETED', label: 'Hoàn tất' },
  { value: 'CANCELLED', label: 'Đã hủy' },
];

function PurchaseOrderList() {
  const params = useSearchParams();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(params.get('status') ?? '');

  const { data, isLoading } = useQuery({
    queryKey: ['purchase-orders', { search, status }],
    queryFn: async () =>
      (
        await api.get<Paginated<PurchaseOrder>>('/purchase-orders', {
          params: {
            pageSize: 50,
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
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          className="w-52"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
      </div>

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
              <thead className="border-b border-border bg-muted/50 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">Mã đơn</th>
                  <th className="px-4 py-3 font-medium">Tiêu đề</th>
                  <th className="px-4 py-3 font-medium">Nhà cung cấp</th>
                  <th className="px-4 py-3 font-medium">Yêu cầu gốc</th>
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
                        href={`/purchase-orders/${po.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {po.code}
                      </Link>
                    </td>
                    <td className="max-w-56 truncate px-4 py-3">{po.title}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {po.supplier?.companyName}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {po.purchaseRequest?.code}
                    </td>
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

export default function PurchaseOrdersPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <PurchaseOrderList />
    </Suspense>
  );
}
