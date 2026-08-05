'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { CheckSquare } from 'lucide-react';
import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
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

type PendingRequest = PurchaseRequest & {
  currentStep: (ApprovalStep & { role?: { name: string } | null }) | null;
  approvalWorkflow: ApprovalWorkflowRef | null;
};

export default function ApprovalsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['pending-approvals'],
    queryFn: async () =>
      (
        await api.get<Paginated<PendingRequest>>(
          '/purchase-requests/pending-approval',
          { params: { pageSize: 50 } },
        )
      ).data,
  });

  return (
    <div>
      <PageHeader
        title="Chờ tôi duyệt"
        description="Yêu cầu đang dừng ở cấp duyệt mà bạn phụ trách."
      />

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
      )}
    </div>
  );
}
