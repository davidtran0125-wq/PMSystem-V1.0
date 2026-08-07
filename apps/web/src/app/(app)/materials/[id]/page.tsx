'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, TrendingDown, TrendingUp } from 'lucide-react';
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  PageHeader,
  Skeleton,
  Button,
} from '@/components/ui';
import { PoStatusBadge, PrStatusBadge } from '@/components/status-badge';
import { api } from '@/lib/api';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils';
import type { Material, MaterialOrderHistory } from '@/lib/types';

export default function MaterialDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const material = useQuery({
    queryKey: ['material', id],
    queryFn: async () => (await api.get<Material>(`/materials/${id}`)).data,
  });

  const history = useQuery({
    queryKey: ['material-history', id],
    queryFn: async () =>
      (await api.get<MaterialOrderHistory>(`/materials/${id}/order-history`)).data,
  });

  if (material.isLoading || !material.data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const m = material.data;
  const h = history.data;
  const standard = m.standardPrice ? Number(m.standardPrice) : null;
  const average = h?.summary.averagePrice ?? null;
  /** So giá mua thực tế với giá tham chiếu để thấy ngay mức lệch. */
  const drift =
    standard && average ? ((average - standard) / standard) * 100 : null;

  return (
    <div>
      <Button variant="ghost" size="sm" className="mb-3" onClick={() => router.push('/materials')}>
        <ArrowLeft className="h-4 w-4" />
        Danh mục vật tư
      </Button>

      <PageHeader
        title={`${m.code} — ${m.name}`}
        description={[
          m.nameEn,
          m.category?.name,
          `Đơn vị tính: ${m.unit}`,
        ]
          .filter(Boolean)
          .join(' · ')}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge
          tone={m.status === 'ACTIVE' ? 'success' : m.status === 'PENDING' ? 'warning' : 'neutral'}
        >
          {m.status === 'ACTIVE'
            ? 'Đang dùng'
            : m.status === 'PENDING'
              ? 'Chờ duyệt'
              : 'Ngừng dùng'}
        </Badge>
        {m.approvedBy ? (
          <span className="text-xs text-muted-foreground">
            {m.approvedBy.fullName} duyệt {formatDate(m.approvedAt)}
          </span>
        ) : null}
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Thông tin mã</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
            <Detail label="Quy cách" value={m.specification} className="sm:col-span-2" />
            <Detail label="Hãng sản xuất" value={m.manufacturer} />
            <Detail label="Nhãn hiệu / model" value={[m.brand, m.model].filter(Boolean).join(' / ')} />
            <Detail label="Mã HS" value={m.hsCode} />
            <Detail
              label="Giá tham chiếu"
              value={standard ? formatCurrency(standard, m.currency) : null}
            />
            <Detail
              label="Tồn tối thiểu"
              value={m.minStock ? `${Number(m.minStock).toLocaleString('vi-VN')} ${m.unit}` : null}
            />
            <Detail label="Người tạo mã" value={m.createdBy?.fullName} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tổng hợp mua hàng</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {history.isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : !h?.summary.orders ? (
              <p className="text-muted-foreground">Mã này chưa từng được đặt hàng.</p>
            ) : (
              <>
                <Stat label="Số lần đặt" value={String(h.summary.orders)} />
                <Stat
                  label="Tổng sản lượng"
                  value={`${h.summary.totalQuantity.toLocaleString('vi-VN')} ${m.unit}`}
                />
                <Stat label="Tổng giá trị" value={formatCurrency(h.summary.totalValue)} />
                <Stat
                  label="Giá bình quân gia quyền"
                  value={average === null ? '—' : formatCurrency(average)}
                />
                <Stat
                  label="Khoảng giá"
                  value={
                    h.summary.lowestPrice === null
                      ? '—'
                      : `${formatCurrency(h.summary.lowestPrice)} – ${formatCurrency(h.summary.highestPrice ?? 0)}`
                  }
                />
                <Stat label="Số nhà cung cấp" value={String(h.summary.suppliers)} />
                <Stat label="Lần mua gần nhất" value={formatDate(h.summary.lastOrderedAt)} />

                {drift !== null ? (
                  <div
                    className={`flex items-center gap-2 rounded-md px-3 py-2 text-xs ${
                      drift > 0
                        ? 'bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200'
                        : 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200'
                    }`}
                  >
                    {drift > 0 ? (
                      <TrendingUp className="h-4 w-4 shrink-0" />
                    ) : (
                      <TrendingDown className="h-4 w-4 shrink-0" />
                    )}
                    Giá mua thực tế {drift > 0 ? 'cao hơn' : 'thấp hơn'} giá tham chiếu{' '}
                    {Math.abs(drift).toFixed(1)}%
                  </div>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {h?.bySupplier.length ? (
        <Card className="mb-4 overflow-hidden">
          <CardHeader>
            <CardTitle>Theo nhà cung cấp</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-y border-border bg-muted/40 text-left">
                <tr>
                  <th className="cell-head">Nhà cung cấp</th>
                  <th className="cell-head">Số đơn</th>
                  <th className="cell-head">Sản lượng</th>
                  <th className="cell-head">Giá trị</th>
                  <th className="cell-head">Giá gần nhất</th>
                  <th className="cell-head">Mua gần nhất</th>
                </tr>
              </thead>
              <tbody>
                {h.bySupplier.map((s) => (
                  <tr key={s.supplier.id} className="border-b border-border last:border-0">
                    <td className="cell font-medium">{s.supplier.companyName}</td>
                    <td className="cell tabular-nums">{s.orders}</td>
                    <td className="cell tabular-nums">
                      {s.quantity.toLocaleString('vi-VN')} {m.unit}
                    </td>
                    <td className="cell tabular-nums">{formatCurrency(s.value)}</td>
                    <td className="cell tabular-nums">{formatCurrency(s.lastPrice)}</td>
                    <td className="cell text-muted-foreground">
                      {formatDate(s.lastOrderedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      <Card className="mb-4 overflow-hidden">
        <CardHeader>
          <CardTitle>Lịch sử đặt hàng</CardTitle>
        </CardHeader>
        {!h?.orders.length ? (
          <CardContent>
            <EmptyState
              title="Chưa có đơn hàng nào"
              description="Khi mã này được dùng trong một đơn hàng, lịch sử giá sẽ hiện ở đây."
            />
          </CardContent>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-y border-border bg-muted/40 text-left">
                <tr>
                  <th className="cell-head">Đơn hàng</th>
                  <th className="cell-head">Nhà cung cấp</th>
                  <th className="cell-head">Ngày</th>
                  <th className="cell-head">Số lượng</th>
                  <th className="cell-head">Đơn giá</th>
                  <th className="cell-head">Thành tiền</th>
                  <th className="cell-head">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {h.orders.map((o) => {
                  const price = Number(o.unitPrice);
                  const isLowest = price === h.summary.lowestPrice;
                  const isHighest =
                    price === h.summary.highestPrice && h.summary.lowestPrice !== price;
                  return (
                    <tr key={o.id} className="border-b border-border last:border-0">
                      <td className="cell">
                        <Link
                          href={`/purchase-orders/${o.purchaseOrder.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {o.purchaseOrder.code}
                        </Link>
                      </td>
                      <td className="cell">{o.purchaseOrder.supplier.companyName}</td>
                      <td className="cell text-muted-foreground">
                        {formatDate(o.orderedAt)}
                      </td>
                      <td className="cell tabular-nums">
                        {Number(o.quantity).toLocaleString('vi-VN')} {o.unit}
                      </td>
                      <td className="cell">
                        <span
                          className={
                            isLowest
                              ? 'font-semibold tabular-nums text-emerald-600 dark:text-emerald-400'
                              : isHighest
                                ? 'font-semibold tabular-nums text-amber-600 dark:text-amber-400'
                                : 'tabular-nums'
                          }
                        >
                          {formatCurrency(o.unitPrice, o.purchaseOrder.currency)}
                        </span>
                      </td>
                      <td className="cell tabular-nums">
                        {formatCurrency(o.lineTotal, o.purchaseOrder.currency)}
                      </td>
                      <td className="cell">
                        <PoStatusBadge status={o.purchaseOrder.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {h?.requests.length ? (
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Nhu cầu đã ghi nhận</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-y border-border bg-muted/40 text-left">
                <tr>
                  <th className="cell-head">Yêu cầu</th>
                  <th className="cell-head">Người yêu cầu</th>
                  <th className="cell-head">Ngày</th>
                  <th className="cell-head">Số lượng</th>
                  <th className="cell-head">Giá ước tính</th>
                  <th className="cell-head">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {h.requests.map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-0">
                    <td className="cell">
                      <Link
                        href={`/purchase-requests/${r.purchaseRequest.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {r.purchaseRequest.code}
                      </Link>
                      <p className="max-w-xs truncate text-xs text-muted-foreground">
                        {r.purchaseRequest.title}
                      </p>
                    </td>
                    <td className="cell text-muted-foreground">
                      {r.purchaseRequest.requester.fullName}
                    </td>
                    <td className="cell text-muted-foreground">
                      {formatDateTime(r.purchaseRequest.createdAt)}
                    </td>
                    <td className="cell tabular-nums">
                      {Number(r.quantity).toLocaleString('vi-VN')} {r.unit}
                    </td>
                    <td className="cell tabular-nums">
                      {r.estimatedPrice ? formatCurrency(r.estimatedPrice) : '—'}
                    </td>
                    <td className="cell">
                      <PrStatusBadge status={r.purchaseRequest.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function Detail({
  label,
  value,
  className,
}: {
  label: string;
  value?: string | null;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 whitespace-pre-wrap">{value || '—'}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}
