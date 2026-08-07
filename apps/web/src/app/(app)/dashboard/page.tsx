'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  MessageCircleQuestion,
  PiggyBank,
  Timer,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  PageHeader,
  Skeleton,
} from '@/components/ui';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import type { DashboardOverview } from '@/lib/types';

interface SpendResponse {
  byCategory: { id: string; name: string; total: number; count: number }[];
  byDepartment: { id: string; name: string; total: number; count: number }[];
  totalSpend: number;
  awardedCount: number;
}

interface RequestToOrderSavings {
  summary: {
    requests: number;
    estimated: number;
    actual: number;
    saved: number;
    savedPercent: number;
  };
  byMonth: { month: string; estimated: number; actual: number; saved: number }[];
  topSaved: {
    purchaseRequestId: string;
    code: string;
    title: string;
    estimated: number;
    actual: number;
    saved: number;
    savedPercent: number;
  }[];
  topOverrun: RequestToOrderSavings['topSaved'];
}

interface SavingsResponse {
  series: { month: string; baseline: number; awarded: number; saving: number; savingPercent: number }[];
  totalSaving: number;
}

interface TopSupplier {
  id: string;
  code: string;
  companyName: string;
  ratingAvg: string | null;
  awards: number;
  awardedValue: number;
}

interface SlaResponse {
  decided: number;
  averageHours: number;
  medianHours: number;
}

export default function DashboardPage() {
  const overview = useQuery({
    queryKey: ['dashboard', 'overview'],
    queryFn: async () =>
      (await api.get<DashboardOverview>('/dashboard/overview')).data,
  });
  const spend = useQuery({
    queryKey: ['dashboard', 'spend'],
    queryFn: async () => (await api.get<SpendResponse>('/dashboard/spend')).data,
  });
  const savings = useQuery({
    queryKey: ['dashboard', 'savings'],
    queryFn: async () => (await api.get<SavingsResponse>('/dashboard/savings')).data,
  });
  /** Chênh lệch giữa dự toán trên yêu cầu và giá chốt trên đơn hàng. */
  const prToPo = useQuery({
    queryKey: ['dashboard', 'request-to-order-savings'],
    queryFn: async () =>
      (await api.get<RequestToOrderSavings>('/dashboard/request-to-order-savings'))
        .data,
  });

  const topSuppliers = useQuery({
    queryKey: ['dashboard', 'top-suppliers'],
    queryFn: async () => (await api.get<TopSupplier[]>('/dashboard/top-suppliers')).data,
  });
  const sla = useQuery({
    queryKey: ['dashboard', 'sla'],
    queryFn: async () => (await api.get<SlaResponse>('/dashboard/sla')).data,
  });

  const o = overview.data;

  const tiles = [
    { label: 'PR mới chờ xử lý', value: o?.purchaseRequests.new, icon: FileText, href: '/purchase-requests?status=SUBMITTED' },
    { label: 'Đang xem xét', value: o?.purchaseRequests.inReview, icon: Clock, href: '/purchase-requests?status=BUYER_REVIEW' },
    { label: 'Chờ bổ sung', value: o?.purchaseRequests.needClarification, icon: MessageCircleQuestion, href: '/purchase-requests?status=NEED_CLARIFICATION' },
    { label: 'Đã duyệt', value: o?.purchaseRequests.approved, icon: CheckCircle2, href: '/purchase-requests?status=APPROVED' },
    { label: 'RFQ đang mở', value: o?.rfqs.open, icon: FileText, href: '/rfqs?status=SENT' },
    { label: 'PR quá hạn cần hàng', value: o?.purchaseRequests.overdue, icon: AlertTriangle, href: '/purchase-requests' },
  ];

  return (
    <div>
      <PageHeader
        title="Tổng quan"
        description="Khối lượng công việc mua hàng và hiệu quả xử lý."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {tiles.map((tile) => {
          const Icon = tile.icon;
          return (
            <Link key={tile.label} href={tile.href}>
              <Card className="transition-colors hover:border-primary">
                <CardContent className="flex items-center justify-between p-5">
                  <div>
                    <p className="text-sm text-muted-foreground">{tile.label}</p>
                    {overview.isLoading ? (
                      <Skeleton className="mt-2 h-8 w-12" />
                    ) : (
                      <p className="mt-1 text-3xl font-semibold tabular-nums">
                        {tile.value ?? 0}
                      </p>
                    )}
                  </div>
                  <Icon className="h-8 w-8 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <Card className="mt-6 overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <PiggyBank className="h-4 w-4" />
            Chênh lệch dự toán và giá chốt
          </CardTitle>
          <CardDescription>
            So giá trị dự kiến ghi trên yêu cầu mua với giá thật đã chốt trên đơn hàng.
            Một yêu cầu chia thầu cho nhiều nhà cung cấp được cộng dồn lại rồi mới so.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {prToPo.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : !prToPo.data?.summary.requests ? (
            <p className="text-sm text-muted-foreground">
              Chưa có yêu cầu nào đã lên đơn hàng để so sánh.
            </p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-4">
                <Figure
                  label="Dự toán trên yêu cầu"
                  value={formatCurrency(prToPo.data.summary.estimated)}
                />
                <Figure
                  label="Giá chốt trên đơn hàng"
                  value={formatCurrency(prToPo.data.summary.actual)}
                />
                <Figure
                  label={prToPo.data.summary.saved >= 0 ? 'Tiết kiệm' : 'Vượt dự toán'}
                  value={formatCurrency(Math.abs(prToPo.data.summary.saved))}
                  tone={prToPo.data.summary.saved >= 0 ? 'good' : 'warn'}
                />
                <Figure
                  label="Tỷ lệ"
                  value={`${prToPo.data.summary.savedPercent >= 0 ? '' : '+'}${Math.abs(
                    prToPo.data.summary.savedPercent,
                  ).toFixed(1)}%`}
                  tone={prToPo.data.summary.savedPercent >= 0 ? 'good' : 'warn'}
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Trên {prToPo.data.summary.requests} yêu cầu đã lên đơn trong 12 tháng.
              </p>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <SavingList
                  title="Tiết kiệm nhiều nhất"
                  rows={prToPo.data.topSaved.filter((r) => r.saved > 0)}
                  tone="good"
                />
                <SavingList
                  title="Vượt dự toán nhiều nhất"
                  rows={prToPo.data.topOverrun}
                  tone="warn"
                  emptyHint="Không có yêu cầu nào vượt dự toán."
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Chi tiêu theo lĩnh vực</CardTitle>
          </CardHeader>
          <CardContent>
            {spend.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : !spend.data?.byCategory.length ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Chưa có RFQ nào được chốt nhà cung cấp.
              </p>
            ) : (
              <div className="space-y-3">
                {spend.data.byCategory.slice(0, 6).map((row) => {
                  const max = spend.data.byCategory[0].total || 1;
                  return (
                    <div key={row.id}>
                      <div className="mb-1 flex justify-between text-sm">
                        <span>{row.name}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {formatCurrency(row.total)}
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${Math.max((row.total / max) * 100, 3)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                <p className="border-t border-border pt-3 text-sm">
                  Tổng chi tiêu:{' '}
                  <span className="font-semibold">
                    {formatCurrency(spend.data.totalSpend)}
                  </span>
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tiết kiệm theo tháng</CardTitle>
          </CardHeader>
          <CardContent>
            {savings.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : !savings.data?.series.length ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Cần ít nhất 2 báo giá trên một RFQ để tính tiết kiệm.
              </p>
            ) : (
              <div className="space-y-2">
                {savings.data.series.map((row) => (
                  <div
                    key={row.month}
                    className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm"
                  >
                    <span className="font-medium">{row.month}</span>
                    <span className="tabular-nums">
                      {formatCurrency(row.saving)}{' '}
                      <span className="text-muted-foreground">
                        ({row.savingPercent}%)
                      </span>
                    </span>
                  </div>
                ))}
                <p className="border-t border-border pt-3 text-sm">
                  Tổng tiết kiệm:{' '}
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(savings.data.totalSaving)}
                  </span>
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Nhà cung cấp hàng đầu</CardTitle>
          </CardHeader>
          <CardContent>
            {topSuppliers.isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : !topSuppliers.data?.length ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Chưa có nhà cung cấp nào được duyệt.
              </p>
            ) : (
              <div className="space-y-2">
                {topSuppliers.data.slice(0, 5).map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between border-b border-border pb-2 text-sm last:border-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{s.companyName}</p>
                      <p className="text-xs text-muted-foreground">{s.code}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="tabular-nums">{s.awards} lần trúng</p>
                      <p className="text-xs text-muted-foreground">
                        {formatCurrency(s.awardedValue)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>SLA xử lý yêu cầu</CardTitle>
          </CardHeader>
          <CardContent>
            {sla.isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Đã quyết định', value: sla.data?.decided ?? 0, suffix: '' },
                  { label: 'Trung bình', value: sla.data?.averageHours ?? 0, suffix: 'giờ' },
                  { label: 'Trung vị', value: sla.data?.medianHours ?? 0, suffix: 'giờ' },
                ].map((stat) => (
                  <div key={stat.label} className="rounded-md bg-muted p-3 text-center">
                    <Timer className="mx-auto mb-1 h-4 w-4 text-muted-foreground" />
                    <p className="text-xl font-semibold tabular-nums">{stat.value}</p>
                    <p className="text-xs text-muted-foreground">
                      {stat.label} {stat.suffix}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Figure({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'good' | 'warn';
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={
          tone === 'good'
            ? 'mt-0.5 text-lg font-semibold tabular-nums text-emerald-600 dark:text-emerald-400'
            : tone === 'warn'
              ? 'mt-0.5 text-lg font-semibold tabular-nums text-amber-600 dark:text-amber-400'
              : 'mt-0.5 text-lg font-semibold tabular-nums'
        }
      >
        {value}
      </p>
    </div>
  );
}

function SavingList({
  title,
  rows,
  tone,
  emptyHint = 'Chưa có dữ liệu.',
}: {
  title: string;
  rows: RequestToOrderSavings['topSaved'];
  tone: 'good' | 'warn';
  emptyHint?: string;
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">{title}</p>
      {!rows.length ? (
        <p className="text-xs text-muted-foreground">{emptyHint}</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {rows.map((r) => (
            <li key={r.purchaseRequestId} className="px-3 py-2 text-sm">
              <Link
                href={`/purchase-requests/${r.purchaseRequestId}`}
                className="flex items-center justify-between gap-2 hover:underline"
              >
                <span className="min-w-0">
                  <span className="font-medium">{r.code}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {r.title}
                  </span>
                </span>
                <span
                  className={
                    tone === 'good'
                      ? 'shrink-0 tabular-nums font-medium text-emerald-600 dark:text-emerald-400'
                      : 'shrink-0 tabular-nums font-medium text-amber-600 dark:text-amber-400'
                  }
                >
                  {r.savedPercent >= 0 ? '' : '+'}
                  {Math.abs(r.savedPercent).toFixed(1)}%
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
