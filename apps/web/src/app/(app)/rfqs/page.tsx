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
  Select,
  Skeleton,
} from '@/components/ui';
import { RfqStatusBadge } from '@/components/status-badge';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import type { Paginated, Rfq } from '@/lib/types';

function RfqList() {
  const params = useSearchParams();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(params.get('status') ?? '');

  const { data, isLoading } = useQuery({
    queryKey: ['rfqs', { search, status }],
    queryFn: async () =>
      (
        await api.get<Paginated<Rfq>>('/rfqs', {
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
        title="RFQ & Báo giá"
        description="Yêu cầu báo giá đã gửi tới nhà cung cấp."
      />

      <div className="mb-4 flex flex-wrap gap-3">
        <Input
          className="min-w-56 flex-1"
          placeholder="Tìm theo mã hoặc tiêu đề…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          className="w-52"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">Tất cả trạng thái</option>
          <option value="DRAFT">Nháp</option>
          <option value="SENT">Đã gửi NCC</option>
          <option value="CLOSED">Đã đóng</option>
          <option value="AWARDED">Đã chọn NCC</option>
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
          title="Chưa có RFQ nào"
          description="RFQ được tạo từ một yêu cầu mua hàng đã được duyệt."
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/50 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">Mã RFQ</th>
                  <th className="px-4 py-3 font-medium">Tiêu đề</th>
                  <th className="px-4 py-3 font-medium">Yêu cầu gốc</th>
                  <th className="px-4 py-3 font-medium">NCC mời</th>
                  <th className="px-4 py-3 font-medium">Đã báo giá</th>
                  <th className="px-4 py-3 font-medium">Hạn nộp</th>
                  <th className="px-4 py-3 font-medium">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((rfq) => (
                  <tr
                    key={rfq.id}
                    className="border-b border-border last:border-0 hover:bg-accent/50"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/rfqs/${rfq.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {rfq.code}
                      </Link>
                    </td>
                    <td className="max-w-64 truncate px-4 py-3">{rfq.title}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {rfq.purchaseRequest.code}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {rfq._count?.suppliers ?? 0}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {rfq._count?.quotations ?? 0}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(rfq.dueDate)}
                    </td>
                    <td className="px-4 py-3">
                      <RfqStatusBadge status={rfq.status} />
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

export default function RfqsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <RfqList />
    </Suspense>
  );
}
