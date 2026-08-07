'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Badge,
  Card,
  CardContent,
  EmptyState,
  PageHeader,
  Pagination,
  Skeleton,
  StatusFilterBar,
} from '@/components/ui';
import { RfqStatusBadge } from '@/components/status-badge';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import type { Paginated, Rfq, RfqStatus } from '@/lib/types';

/** Nhà cung cấp không thấy RFQ nháp của bên mua nên không liệt kê DRAFT. */
const STATUSES: { value: RfqStatus | ''; label: string }[] = [
  { value: '', label: 'Tất cả' },
  { value: 'SENT', label: 'Đang mời báo giá' },
  { value: 'CLOSED', label: 'Đã đóng' },
  { value: 'AWARDED', label: 'Đã có kết quả' },
  { value: 'CANCELLED', label: 'Đã hủy' },
];

export default function SupplierRfqsPage() {
  const supplier = useAuthStore((s) => s.user?.supplier);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [status, setStatus] = useState('');

  /** Đếm trên toàn bộ RFQ được mời, không riêng trang đang xem. */
  const counts = useQuery({
    queryKey: ['supplier-rfq-counts'],
    queryFn: async () =>
      (
        await api.get<{ total: number; counts: Record<RfqStatus, number> }>(
          '/rfqs/status-counts',
        )
      ).data,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['supplier-rfqs', { page, pageSize, status }],
    queryFn: async () =>
      (
        await api.get<Paginated<Rfq>>('/rfqs', {
          params: { page, pageSize, ...(status ? { status } : {}) },
        })
      ).data,
  });

  return (
    <div>
      <PageHeader
        title="Yêu cầu báo giá"
        description="Các RFQ bạn được mời tham gia."
      />

      {supplier && supplier.status !== 'APPROVED' ? (
        <Card className="mb-4 border-amber-300 dark:border-amber-800">
          <CardContent className="p-4">
            <p className="text-sm font-medium">
              Hồ sơ của bạn đang ở trạng thái{' '}
              {supplier.status === 'PENDING' ? 'chờ duyệt' : 'chưa được duyệt'}.
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Bạn sẽ nhận được yêu cầu báo giá sau khi bộ phận mua hàng duyệt hồ
              sơ.{' '}
              <Link href="/supplier/profile" className="text-primary hover:underline">
                Hoàn thiện hồ sơ
              </Link>
            </p>
          </CardContent>
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
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : !data?.data.length ? (
        <EmptyState
          title="Chưa có yêu cầu báo giá"
          description="Khi bộ phận mua hàng mời bạn tham gia, RFQ sẽ hiện ở đây."
        />
      ) : (
        <div className="grid gap-3">
          {data.data.map((rfq) => (
            <Link key={rfq.id} href={`/supplier/rfqs/${rfq.id}`}>
              <Card className="transition-colors hover:border-primary">
                <CardContent className="flex flex-wrap items-start justify-between gap-3 p-5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium">{rfq.title}</h3>
                      <RfqStatusBadge status={rfq.status} />
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {rfq.code} · Hạn nộp {formatDate(rfq.dueDate)}
                    </p>
                  </div>
                  {rfq.dueDate && new Date(rfq.dueDate) < new Date() ? (
                    <Badge tone="danger">Hết hạn</Badge>
                  ) : null}
                </CardContent>
              </Card>
            </Link>
          ))}
          <Card>
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
        </div>
      )}
    </div>
  );
}
