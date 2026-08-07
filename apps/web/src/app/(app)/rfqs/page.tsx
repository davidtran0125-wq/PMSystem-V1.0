'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  Card,
  EmptyState,
  Input,
  PageHeader,
  Pagination,
  Skeleton,
  StatusFilterBar,
} from '@/components/ui';
import { RfqStatusBadge } from '@/components/status-badge';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import type { Paginated, Rfq, RfqStatus } from '@/lib/types';

const STATUSES: { value: RfqStatus | ''; label: string }[] = [
  { value: '', label: 'Tất cả trạng thái' },
  { value: 'DRAFT', label: 'Nháp' },
  { value: 'SENT', label: 'Đã gửi NCC' },
  { value: 'CLOSED', label: 'Đã đóng' },
  { value: 'AWARDED', label: 'Đã chọn NCC' },
  { value: 'CANCELLED', label: 'Đã hủy' },
];

function RfqList() {
  const params = useSearchParams();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(params.get('status') ?? '');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  /** Đếm theo trạng thái, không phụ thuộc trạng thái đang chọn. */
  const counts = useQuery({
    queryKey: ['rfq-counts', { search }],
    queryFn: async () =>
      (
        await api.get<{ total: number; counts: Record<RfqStatus, number> }>(
          '/rfqs/status-counts',
          {
            params: { ...(search ? { search } : {}) },
          },
        )
      ).data,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['rfqs', { search, status, page, pageSize }],
    queryFn: async () =>
      (
        await api.get<Paginated<Rfq>>('/rfqs', {
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
        title="RFQ & Báo giá"
        description="Yêu cầu báo giá đã gửi tới nhà cung cấp."
      />

      <div className="mb-4 flex flex-wrap gap-3">
        <Input
          className="min-w-56 flex-1"
          placeholder="Tìm theo mã hoặc tiêu đề…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
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
          title="Chưa có RFQ nào"
          description="RFQ được tạo từ một yêu cầu mua hàng đã được duyệt."
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-y border-border bg-muted/40 text-left">
                <tr>
                  <th className="cell-head">Mã RFQ</th>
                  <th className="cell-head">Tiêu đề</th>
                  <th className="cell-head">Yêu cầu gốc</th>
                  <th className="cell-head">NCC mời</th>
                  <th className="cell-head">Đã báo giá</th>
                  <th className="cell-head">Hạn nộp</th>
                  <th className="cell-head">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((rfq) => (
                  <tr
                    key={rfq.id}
                    className="border-b border-border last:border-0 hover:bg-accent/50"
                  >
                    <td className="cell">
                      <Link
                        href={`/rfqs/${rfq.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {rfq.code}
                      </Link>
                    </td>
                    <td className="max-w-64 truncate cell">{rfq.title}</td>
                    <td className="cell text-muted-foreground">
                      {rfq.purchaseRequest.code}
                    </td>
                    <td className="cell tabular-nums">
                      {rfq._count?.suppliers ?? 0}
                    </td>
                    <td className="cell tabular-nums">
                      {rfq._count?.quotations ?? 0}
                    </td>
                    <td className="cell text-muted-foreground">
                      {formatDate(rfq.dueDate)}
                    </td>
                    <td className="cell">
                      <RfqStatusBadge status={rfq.status} />
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

export default function RfqsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <RfqList />
    </Suspense>
  );
}
