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
import { QuotationStatusBadge } from '@/components/status-badge';
import { api } from '@/lib/api';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import type { Paginated, Quotation, QuotationStatus } from '@/lib/types';

const STATUSES: { value: QuotationStatus | ''; label: string }[] = [
  { value: '', label: 'Tất cả' },
  { value: 'DRAFT', label: 'Nháp' },
  { value: 'SUBMITTED', label: 'Đã gửi' },
  { value: 'SHORTLISTED', label: 'Vào danh sách ngắn' },
  { value: 'AWARDED', label: 'Trúng thầu' },
  { value: 'REJECTED', label: 'Không trúng' },
];

export default function SupplierQuotationsPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [status, setStatus] = useState('');

  /** Đếm trên toàn bộ báo giá của mình, không riêng trang đang xem. */
  const counts = useQuery({
    queryKey: ['my-quotation-counts'],
    queryFn: async () =>
      (
        await api.get<{ total: number; counts: Record<QuotationStatus, number> }>(
          '/rfqs/my-quotations/status-counts',
        )
      ).data,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['my-quotations', { page, pageSize, status }],
    queryFn: async () =>
      (
        await api.get<Paginated<Quotation>>('/rfqs/my-quotations', {
          params: {
            page,
            pageSize,
            ...(status ? { quotationStatus: status } : {}),
          },
        })
      ).data,
  });

  return (
    <div>
      <PageHeader
        title="Báo giá của tôi"
        description="Lịch sử báo giá đã gửi cho bên mua."
      />

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
          title="Chưa gửi báo giá nào"
          description="Báo giá bạn gửi sẽ được lưu lại tại đây."
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-y border-border bg-muted/40 text-left">
                <tr>
                  <th className="cell-head">Mã báo giá</th>
                  <th className="cell-head">RFQ</th>
                  <th className="cell-head">Tổng giá trị</th>
                  <th className="cell-head">Giao hàng</th>
                  <th className="cell-head">Ngày gửi</th>
                  <th className="cell-head">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((q) => (
                  <tr
                    key={q.id}
                    className="border-b border-border last:border-0 hover:bg-accent/50"
                  >
                    <td className="cell font-medium">{q.code}</td>
                    <td className="cell">
                      {q.rfq ? (
                        <Link
                          href={`/supplier/rfqs/${q.rfq.id}`}
                          className="text-primary hover:underline"
                        >
                          {q.rfq.code} — {q.rfq.title}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="cell tabular-nums">
                      {formatCurrency(q.totalAmount, q.currency)}
                    </td>
                    <td className="cell tabular-nums">
                      {q.leadTimeDays ? `${q.leadTimeDays} ngày` : '—'}
                    </td>
                    <td className="cell text-muted-foreground">
                      {formatDateTime(q.submittedAt)}
                    </td>
                    <td className="cell">
                      <QuotationStatusBadge status={q.status} />
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
