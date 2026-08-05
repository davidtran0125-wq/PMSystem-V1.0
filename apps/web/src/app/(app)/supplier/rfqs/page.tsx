'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Badge,
  Card,
  CardContent,
  EmptyState,
  PageHeader,
  Skeleton,
} from '@/components/ui';
import { RfqStatusBadge } from '@/components/status-badge';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import type { Paginated, Rfq } from '@/lib/types';

export default function SupplierRfqsPage() {
  const supplier = useAuthStore((s) => s.user?.supplier);

  const { data, isLoading } = useQuery({
    queryKey: ['supplier-rfqs'],
    queryFn: async () =>
      (await api.get<Paginated<Rfq>>('/rfqs', { params: { pageSize: 50 } })).data,
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
        </div>
      )}
    </div>
  );
}
