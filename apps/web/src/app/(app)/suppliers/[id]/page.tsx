'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Star } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CollapsibleCard,
  EmptyState,
  PageHeader,
  Pagination,
  Skeleton,
} from '@/components/ui';
import { CertificateStatusBadge, PoStatusBadge } from '@/components/status-badge';
import { Attachments } from '@/components/attachments';
import { api } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import { useState } from 'react';
import type {
  Certificate,
  Paginated,
  PurchaseOrder,
  Supplier,
  SupplierPerformance,
} from '@/lib/types';

const PAGE_SIZE = 5;

export default function SupplierDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const canWrite = useAuthStore((s) => s.can('supplier:write'));
  const [orderPage, setOrderPage] = useState(1);
  const [evalPage, setEvalPage] = useState(1);

  const supplier = useQuery({
    queryKey: ['supplier', id],
    queryFn: async () => (await api.get<Supplier>(`/suppliers/${id}`)).data,
  });

  // Mỗi khối chỉ lấy vài dòng một trang, để trang chi tiết không dài lê thê.
  const orders = useQuery({
    queryKey: ['supplier-orders', id, orderPage],
    queryFn: async () =>
      (
        await api.get<Paginated<PurchaseOrder>>('/purchase-orders', {
          params: { supplierId: id, page: orderPage, pageSize: PAGE_SIZE },
        })
      ).data,
  });

  const evaluations = useQuery({
    queryKey: ['supplier-evaluations', id, evalPage],
    queryFn: async () =>
      (
        await api.get<Paginated<SupplierPerformance>>('/supplier-performance', {
          params: { supplierId: id, page: evalPage, pageSize: PAGE_SIZE },
        })
      ).data,
  });

  if (supplier.isLoading || !supplier.data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const s = supplier.data;
  const certificates = (s.certificates ?? []) as Certificate[];

  return (
    <div>
      <Button
        variant="ghost"
        size="sm"
        className="mb-3"
        onClick={() => router.push('/suppliers')}
      >
        <ArrowLeft className="h-4 w-4" />
        Danh sách nhà cung cấp
      </Button>

      <PageHeader
        title={`${s.code} — ${s.companyName}`}
        description={[s.taxCode && `MST ${s.taxCode}`, s.address]
          .filter(Boolean)
          .join(' · ')}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge
          tone={
            s.status === 'APPROVED'
              ? 'success'
              : s.status === 'REJECTED'
                ? 'danger'
                : 'warning'
          }
        >
          {s.status === 'APPROVED'
            ? 'Đã duyệt'
            : s.status === 'REJECTED'
              ? 'Từ chối'
              : 'Chờ duyệt'}
        </Badge>
        {s.ratingAvg ? (
          <Badge tone="info">
            <Star className="mr-1 h-3 w-3" />
            {Number(s.ratingAvg).toFixed(1)} điểm
          </Badge>
        ) : null}
        {(s.categories ?? []).map((c) => (
          <Badge key={c.category.id}>{c.category.name}</Badge>
        ))}
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Thông tin liên hệ</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-3">
            <Detail label="Người liên hệ" value={s.contactPerson} />
            <Detail label="Email" value={s.email} />
            <Detail label="Điện thoại" value={s.phone} />
            <Detail label="Website" value={s.website} />
            <Detail label="Điều khoản thanh toán" value={s.paymentTerm} />
            <Detail label="Ngày tham gia" value={formatDate(s.createdAt)} />
          </CardContent>
        </Card>

        <CollapsibleCard
          title="Đơn hàng đã đặt"
          storageKey="supplier-orders"
          badge={
            orders.data ? <Badge>{orders.data.meta.total}</Badge> : null
          }
        >
          {orders.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : !orders.data?.data.length ? (
            <EmptyState title="Chưa có đơn hàng nào" />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-y border-border bg-muted/40 text-left">
                    <tr>
                      <th className="cell-head !px-3">Mã đơn</th>
                      <th className="cell-head !px-3">Tiêu đề</th>
                      <th className="cell-head !px-3">Giá trị</th>
                      <th className="cell-head !px-3">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.data.data.map((o) => (
                      <tr key={o.id} className="border-b border-border last:border-0">
                        <td className="cell !px-3">
                          <Link
                            href={`/purchase-orders/${o.id}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {o.code}
                          </Link>
                        </td>
                        <td className="max-w-56 truncate cell !px-3">{o.title}</td>
                        <td className="cell !px-3 tabular-nums">
                          {formatCurrency(o.totalAmount, o.currency)}
                        </td>
                        <td className="cell !px-3">
                          <PoStatusBadge status={o.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination
                page={orderPage}
                pageSize={PAGE_SIZE}
                total={orders.data.meta.total}
                onPageChange={setOrderPage}
              />
            </>
          )}
        </CollapsibleCard>

        <CollapsibleCard
          title="Lịch sử đánh giá"
          storageKey="supplier-evaluations"
          badge={
            evaluations.data ? <Badge>{evaluations.data.meta.total}</Badge> : null
          }
        >
          {evaluations.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : !evaluations.data?.data.length ? (
            <EmptyState title="Chưa được đánh giá lần nào" />
          ) : (
            <>
              <ul className="divide-y divide-border rounded-lg border border-border">
                {evaluations.data.data.map((e) => (
                  <li key={e.id} className="px-3 py-2.5 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">
                        Kỳ {formatDate(e.periodStart)} – {formatDate(e.periodEnd)} ·{' '}
                        {e.evaluator.fullName}
                      </span>
                      <Badge
                        tone={
                          Number(e.totalScore) >= 85
                            ? 'success'
                            : Number(e.totalScore) >= 70
                              ? 'info'
                              : Number(e.totalScore) >= 50
                                ? 'warning'
                                : 'danger'
                        }
                      >
                        {Number(e.totalScore)} điểm
                      </Badge>
                    </div>
                    {e.scores?.length ? (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {e.scores.map((sc) => (
                          <span
                            key={sc.id}
                            className="rounded bg-muted px-2 py-0.5 text-xs"
                            title={sc.comment ?? undefined}
                          >
                            {sc.criteria.name}: {sc.score}/{sc.criteria.maxScore}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {e.note ? <p className="mt-1 text-xs">{e.note}</p> : null}
                  </li>
                ))}
              </ul>
              <Pagination
                page={evalPage}
                pageSize={PAGE_SIZE}
                total={evaluations.data.meta.total}
                onPageChange={setEvalPage}
              />
            </>
          )}
        </CollapsibleCard>

        <CollapsibleCard
          title="Chứng chỉ"
          storageKey="supplier-certificates"
          defaultOpen={false}
          badge={<Badge>{certificates.length}</Badge>}
        >
          {!certificates.length ? (
            <EmptyState title="Chưa có chứng chỉ" />
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {certificates.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
                >
                  <span>
                    <span className="font-medium">{c.name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      hết hạn {formatDate(c.expiryDate)}
                    </span>
                  </span>
                  <CertificateStatusBadge status={c.status} />
                </li>
              ))}
            </ul>
          )}
        </CollapsibleCard>

        <CollapsibleCard
          title="Hồ sơ đính kèm"
          storageKey="supplier-attachments"
          defaultOpen={false}
        >
          <Attachments
            target="SUPPLIER"
            entityId={s.id}
            canWrite={canWrite}
            documentTypes={['Giấy phép kinh doanh', 'Hồ sơ năng lực', 'Bảng giá']}
            emptyHint="Chưa có hồ sơ nào của nhà cung cấp này."
          />
        </CollapsibleCard>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 break-words">{value || '—'}</p>
    </div>
  );
}
