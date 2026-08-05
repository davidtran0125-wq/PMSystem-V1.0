'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Card,
  EmptyState,
  PageHeader,
  Skeleton,
} from '@/components/ui';
import { QuotationStatusBadge } from '@/components/status-badge';
import { api } from '@/lib/api';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import type { Paginated, Quotation } from '@/lib/types';

export default function SupplierQuotationsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['my-quotations'],
    queryFn: async () =>
      (
        await api.get<Paginated<Quotation>>('/rfqs/my-quotations', {
          params: { pageSize: 50 },
        })
      ).data,
  });

  return (
    <div>
      <PageHeader
        title="Báo giá của tôi"
        description="Lịch sử báo giá đã gửi cho bên mua."
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
              <thead className="border-b border-border bg-muted/50 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">Mã báo giá</th>
                  <th className="px-4 py-3 font-medium">RFQ</th>
                  <th className="px-4 py-3 font-medium">Tổng giá trị</th>
                  <th className="px-4 py-3 font-medium">Giao hàng</th>
                  <th className="px-4 py-3 font-medium">Ngày gửi</th>
                  <th className="px-4 py-3 font-medium">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((q) => (
                  <tr
                    key={q.id}
                    className="border-b border-border last:border-0 hover:bg-accent/50"
                  >
                    <td className="px-4 py-3 font-medium">{q.code}</td>
                    <td className="px-4 py-3">
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
                    <td className="px-4 py-3 tabular-nums">
                      {formatCurrency(q.totalAmount, q.currency)}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {q.leadTimeDays ? `${q.leadTimeDays} ngày` : '—'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDateTime(q.submittedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <QuotationStatusBadge status={q.status} />
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
