'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
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
import { PriorityBadge, PrStatusBadge } from '@/components/status-badge';
import { api } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import type { Paginated, PurchaseRequest, PurchaseRequestStatus } from '@/lib/types';

const STATUSES: { value: PurchaseRequestStatus | ''; label: string }[] = [
  { value: '', label: 'Tất cả trạng thái' },
  { value: 'DRAFT', label: 'Nháp' },
  { value: 'SUBMITTED', label: 'Đã gửi' },
  { value: 'BUYER_REVIEW', label: 'Đang xem xét' },
  { value: 'NEED_CLARIFICATION', label: 'Cần bổ sung' },
  { value: 'APPROVED', label: 'Đã duyệt' },
  { value: 'REJECTED', label: 'Từ chối' },
];

function PurchaseRequestList() {
  const router = useRouter();
  const params = useSearchParams();
  const canReview = useAuthStore((s) => s.can('purchase_request:review'));
  const canWrite = useAuthStore((s) => s.can('purchase_request:write'));

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>(params.get('status') ?? '');
  const [mine, setMine] = useState(false);
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['purchase-requests', { search, status, mine, page }],
    queryFn: async () => {
      const { data } = await api.get<Paginated<PurchaseRequest>>(
        '/purchase-requests',
        {
          params: {
            page,
            pageSize: 20,
            ...(search ? { search } : {}),
            ...(status ? { status } : {}),
            ...(mine ? { mine: true } : {}),
          },
        },
      );
      return data;
    },
  });

  return (
    <div>
      <PageHeader
        title="Yêu cầu mua hàng"
        description={
          canReview
            ? 'Xem xét và xử lý yêu cầu từ các bộ phận.'
            : 'Theo dõi các yêu cầu mua hàng của bạn.'
        }
        actions={
          canWrite ? (
            <Button onClick={() => router.push('/purchase-requests/new')}>
              <Plus className="h-4 w-4" />
              Tạo yêu cầu
            </Button>
          ) : null
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
        <Select
          className="w-52"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
        {canReview ? (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-input"
              checked={mine}
              onChange={(e) => {
                setMine(e.target.checked);
                setPage(1);
              }}
            />
            Chỉ yêu cầu của tôi
          </label>
        ) : null}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : !data?.data.length ? (
        <EmptyState
          title="Chưa có yêu cầu nào"
          description="Tạo yêu cầu mua hàng đầu tiên để bắt đầu quy trình."
          action={
            canWrite ? (
              <Button onClick={() => router.push('/purchase-requests/new')}>
                <Plus className="h-4 w-4" />
                Tạo yêu cầu
              </Button>
            ) : null
          }
        />
      ) : (
        <>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/50 text-left">
                  <tr>
                    <th className="px-4 py-3 font-medium">Mã</th>
                    <th className="px-4 py-3 font-medium">Tiêu đề</th>
                    <th className="px-4 py-3 font-medium">Lĩnh vực</th>
                    <th className="px-4 py-3 font-medium">Người yêu cầu</th>
                    <th className="px-4 py-3 font-medium">Ưu tiên</th>
                    <th className="px-4 py-3 font-medium">Giá trị dự kiến</th>
                    <th className="px-4 py-3 font-medium">Trạng thái</th>
                    <th className="px-4 py-3 font-medium">Ngày tạo</th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((pr) => (
                    <tr
                      key={pr.id}
                      className="border-b border-border last:border-0 hover:bg-accent/50"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/purchase-requests/${pr.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {pr.code}
                        </Link>
                      </td>
                      <td className="max-w-64 truncate px-4 py-3">{pr.title}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {pr.category.nameEn ?? pr.category.name}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {pr.requester.fullName}
                      </td>
                      <td className="px-4 py-3">
                        <PriorityBadge priority={pr.priority} />
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {formatCurrency(pr.estimatedTotal, pr.currency)}
                      </td>
                      <td className="px-4 py-3">
                        <PrStatusBadge status={pr.status} />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDate(pr.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {data.meta.totalPages > 1 ? (
            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Trang {data.meta.page} / {data.meta.totalPages} — {data.meta.total} yêu cầu
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Trước
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= data.meta.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Sau
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

export default function PurchaseRequestsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <PurchaseRequestList />
    </Suspense>
  );
}
