'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckSquare } from 'lucide-react';
import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  Pagination,
  Skeleton,
} from '@/components/ui';
import { PriorityBadge, PrStatusBadge } from '@/components/status-badge';
import { api } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import type {
  ApprovalStep,
  ApprovalWorkflowRef,
  Paginated,
  PurchaseRequest,
} from '@/lib/types';

type PendingQueue = Paginated<PendingRequest> & {
  counts: Record<PurchaseRequest['status'], number>;
};

type PendingRequest = PurchaseRequest & {
  currentStep: (ApprovalStep & { role?: { name: string } | null }) | null;
  approvalWorkflow: ApprovalWorkflowRef | null;
};

export default function ApprovalsPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const { data, isLoading } = useQuery({
    queryKey: ['pending-approvals', { page, pageSize }],
    queryFn: async () =>
      (
        await api.get<PendingQueue>(
          '/purchase-requests/pending-approval',
          { params: { page, pageSize } },
        )
      ).data,
  });

  /** Đếm trên cả hàng chờ, do máy chủ trả về, không chỉ trang đang xem. */
  const byStatus = Object.entries(data?.counts ?? {}).filter(([, n]) => n > 0);

  return (
    <div>
      <PageHeader
        title="Chờ tôi duyệt"
        description="Yêu cầu đang dừng ở cấp duyệt mà bạn phụ trách."
      />

      {data?.meta.total ? (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <Badge tone="info">Tổng cộng {data.meta.total}</Badge>
          {byStatus.map(([status, n]) => (
            <span
              key={status}
              className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1"
            >
              <PrStatusBadge status={status as PendingRequest['status']} />
              <span className="tabular-nums text-muted-foreground">{n}</span>
            </span>
          ))}
        </div>
      ) : null}

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : !data?.data.length ? (
        <EmptyState
          title="Không có yêu cầu nào chờ bạn"
          description="Khi một yêu cầu đi tới cấp duyệt của bạn, nó sẽ xuất hiện ở đây."
        />
      ) : (
        <>
        <div className="grid gap-3">
          {data.data.map((pr) => (
            <Link key={pr.id} href={`/purchase-requests/${pr.id}`}>
              <Card className="transition-colors hover:border-primary">
                <div className="flex flex-wrap items-start justify-between gap-3 p-5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{pr.code}</span>
                      <PrStatusBadge status={pr.status} />
                      <PriorityBadge priority={pr.priority} />
                    </div>
                    <p className="mt-1 font-medium">{pr.title}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {pr.requester.fullName} · {pr.department.name} ·{' '}
                      {pr.category.nameEn ?? pr.category.name}
                    </p>
                    {pr.currentStep ? (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Badge tone="info">
                          <CheckSquare className="mr-1 inline h-3 w-3" />
                          Cấp: {pr.currentStep.name}
                        </Badge>
                        {pr.approvalWorkflow ? (
                          <span className="text-xs text-muted-foreground">
                            Quy trình: {pr.approvalWorkflow.name}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="font-semibold tabular-nums">
                      {formatCurrency(pr.estimatedTotal, pr.currency)}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Gửi ngày {formatDate(pr.submittedAt)}
                    </p>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
        <Card className="mt-3">
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
        </>
      )}
    </div>
  );
}
