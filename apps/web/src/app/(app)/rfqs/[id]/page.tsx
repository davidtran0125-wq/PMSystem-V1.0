'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Award,
  Clock,
  ReceiptText,
  Send,
  TrendingDown,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  PageHeader,
  Skeleton,
} from '@/components/ui';
import { QuotationStatusBadge, RfqStatusBadge } from '@/components/status-badge';
import { AiFinding, AiList, AiPanel, ScoreBadge } from '@/components/ai-panel';
import { api, apiErrorMessage } from '@/lib/api';
import { cn, formatCurrency, formatDate, formatDateTime } from '@/lib/utils';
import type { Comparison, QuotationAnalysis, Rfq } from '@/lib/types';

export default function RfqDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: rfq, isLoading } = useQuery({
    queryKey: ['rfq', id],
    queryFn: async () => (await api.get<Rfq>(`/rfqs/${id}`)).data,
  });

  const { data: comparison } = useQuery({
    queryKey: ['rfq-compare', id],
    queryFn: async () => (await api.get<Comparison>(`/rfqs/${id}/compare`)).data,
    enabled: Boolean(rfq && rfq.status !== 'DRAFT'),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['rfq', id] });
    void queryClient.invalidateQueries({ queryKey: ['rfq-compare', id] });
    void queryClient.invalidateQueries({ queryKey: ['rfqs'] });
  };

  const send = useMutation({
    mutationFn: async () => api.post(`/rfqs/${id}/send`),
    onSuccess: () => {
      toast.success('Đã gửi RFQ tới nhà cung cấp');
      invalidate();
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const close = useMutation({
    mutationFn: async () => api.post(`/rfqs/${id}/close`),
    onSuccess: () => {
      toast.success('Đã đóng RFQ');
      invalidate();
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const award = useMutation({
    mutationFn: async (quotationId: string) =>
      api.post(`/rfqs/${id}/award`, { quotationId }),
    onSuccess: () => {
      toast.success('Đã chọn nhà cung cấp trúng thầu');
      invalidate();
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  if (isLoading || !rfq) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const rows = comparison?.quotations ?? [];

  return (
    <div>
      <Button
        variant="ghost"
        size="sm"
        className="mb-3"
        onClick={() => router.push('/rfqs')}
      >
        <ArrowLeft className="h-4 w-4" />
        Danh sách RFQ
      </Button>

      <PageHeader
        title={`${rfq.code} — ${rfq.title}`}
        description={`Từ yêu cầu ${rfq.purchaseRequest.code} · Hạn nộp ${formatDate(rfq.dueDate)}`}
        actions={
          <div className="flex flex-wrap gap-2">
            {rfq.status === 'DRAFT' ? (
              <Button onClick={() => send.mutate()} disabled={send.isPending}>
                <Send className="h-4 w-4" />
                Gửi nhà cung cấp
              </Button>
            ) : null}
            {rfq.status === 'SENT' ? (
              <Button
                variant="outline"
                onClick={() => close.mutate()}
                disabled={close.isPending}
              >
                Đóng nhận báo giá
              </Button>
            ) : null}
            {rfq.status === 'AWARDED' ? (
              <Link href={`/purchase-orders/new?rfqId=${rfq.id}`}>
                <Button>
                  <ReceiptText className="h-4 w-4" />
                  Tạo đơn hàng
                </Button>
              </Link>
            ) : null}
            <Link href={`/purchase-requests/${rfq.purchaseRequest.id}`}>
              <Button variant="outline">Xem yêu cầu gốc</Button>
            </Link>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <RfqStatusBadge status={rfq.status} />
        <Badge tone="neutral">
          {comparison?.summary.responded ?? 0}/{comparison?.summary.invited ?? rfq.suppliers?.length ?? 0} đã báo giá
        </Badge>
        {comparison?.summary.lowestTotal ? (
          <Badge tone="success">
            Thấp nhất: {formatCurrency(comparison.summary.lowestTotal)}
          </Badge>
        ) : null}
      </div>

      {rfq.instructions ? (
        <Card className="mb-4">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Hướng dẫn báo giá</p>
            <p className="mt-1 whitespace-pre-wrap text-sm">{rfq.instructions}</p>
          </CardContent>
        </Card>
      ) : null}

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Nhà cung cấp được mời</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {(rfq.suppliers ?? []).map((invite) => (
            <div
              key={invite.id}
              className="rounded-md border border-border px-3 py-2 text-sm"
            >
              <p className="font-medium">{invite.supplier.companyName}</p>
              <p className="text-xs text-muted-foreground">
                {invite.status === 'QUOTED'
                  ? 'Đã báo giá'
                  : invite.status === 'VIEWED'
                    ? 'Đã xem'
                    : invite.status === 'DECLINED'
                      ? 'Từ chối'
                      : 'Đã mời'}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>So sánh báo giá</CardTitle>
        </CardHeader>

        {!rows.length ? (
          <CardContent>
            <p className="py-8 text-center text-sm text-muted-foreground">
              Chưa có nhà cung cấp nào gửi báo giá.
            </p>
          </CardContent>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-y border-border bg-muted/50 text-left">
                <tr>
                  <th className="sticky left-0 bg-muted/50 px-4 py-3 font-medium">
                    Tiêu chí
                  </th>
                  {rows.map((row) => (
                    <th key={row.quotationId} className="min-w-56 px-4 py-3 font-medium">
                      <div className="flex items-center gap-2">
                        {row.supplier.companyName}
                        {rfq.awardedQuotationId === row.quotationId ? (
                          <Badge tone="success">Trúng thầu</Badge>
                        ) : null}
                      </div>
                      <p className="text-xs font-normal text-muted-foreground">
                        {row.code}
                      </p>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <ComparisonRow label="Tổng giá trị" rows={rows}>
                  {(row) => (
                    <div
                      className={cn(
                        'flex items-center gap-1.5 font-semibold tabular-nums',
                        row.isLowestPrice && 'text-emerald-600 dark:text-emerald-400',
                      )}
                    >
                      {formatCurrency(row.totalAmount, row.currency)}
                      {row.isLowestPrice ? <TrendingDown className="h-4 w-4" /> : null}
                    </div>
                  )}
                </ComparisonRow>

                <ComparisonRow label="Chênh lệch so với giá thấp nhất" rows={rows}>
                  {(row) => (
                    <span className="tabular-nums">
                      {row.diffFromLowestPercent === 0
                        ? '—'
                        : `+${row.diffFromLowestPercent}%`}
                    </span>
                  )}
                </ComparisonRow>

                <ComparisonRow label="Thời gian giao hàng" rows={rows}>
                  {(row) => (
                    <div
                      className={cn(
                        'flex items-center gap-1.5 tabular-nums',
                        row.isShortestLeadTime && 'text-emerald-600 dark:text-emerald-400',
                      )}
                    >
                      {row.leadTimeDays !== null ? `${row.leadTimeDays} ngày` : '—'}
                      {row.isShortestLeadTime ? <Clock className="h-4 w-4" /> : null}
                    </div>
                  )}
                </ComparisonRow>

                <ComparisonRow label="Điều khoản thanh toán" rows={rows}>
                  {(row) => row.paymentTerm ?? '—'}
                </ComparisonRow>
                <ComparisonRow label="Incoterm" rows={rows}>
                  {(row) => row.incoterm ?? '—'}
                </ComparisonRow>
                <ComparisonRow label="Giao hàng" rows={rows}>
                  {(row) => row.deliveryTerm ?? '—'}
                </ComparisonRow>
                <ComparisonRow label="Bảo hành" rows={rows}>
                  {(row) => row.warranty ?? '—'}
                </ComparisonRow>
                <ComparisonRow label="MOQ" rows={rows}>
                  {(row) => row.moq ?? '—'}
                </ComparisonRow>
                <ComparisonRow label="Hiệu lực báo giá" rows={rows}>
                  {(row) => formatDate(row.validUntil)}
                </ComparisonRow>
                <ComparisonRow label="Ngày gửi" rows={rows}>
                  {(row) => formatDateTime(row.submittedAt)}
                </ComparisonRow>
                <ComparisonRow label="Trạng thái" rows={rows}>
                  {(row) => <QuotationStatusBadge status={row.status} />}
                </ComparisonRow>
                <ComparisonRow label="Ghi chú" rows={rows}>
                  {(row) => (
                    <span className="whitespace-pre-wrap">{row.remark ?? '—'}</span>
                  )}
                </ComparisonRow>

                <tr>
                  <td className="sticky left-0 bg-card px-4 py-3 font-medium">
                    Quyết định
                  </td>
                  {rows.map((row) => (
                    <td key={row.quotationId} className="px-4 py-3">
                      {rfq.status === 'AWARDED' ? (
                        rfq.awardedQuotationId === row.quotationId ? (
                          <Badge tone="success">Đã chọn</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )
                      ) : (
                        <Button
                          size="sm"
                          disabled={award.isPending}
                          onClick={() => award.mutate(row.quotationId)}
                        >
                          <Award className="h-4 w-4" />
                          Chọn
                        </Button>
                      )}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {rows.length >= 2 ? (
        <div className="mt-4">
          <AiPanel<QuotationAnalysis>
            title="Phân tích báo giá"
            description="So sánh theo tổng chi phí sở hữu, không chỉ dựa trên giá thấp nhất."
            buttonLabel="Phân tích bằng AI"
            endpoint={`/ai/rfqs/${rfq.id}/analyze-quotations`}
          >
            {(a) => {
              const winner = rows.find((r) => r.quotationId === a.recommendedQuotationId);
              return (
                <div className="space-y-4">
                  <div className="rounded-md border border-border p-3">
                    <p className="text-xs font-medium text-muted-foreground">
                      Khuyến nghị
                    </p>
                    <p className="mt-1 font-medium">
                      {winner ? winner.supplier.companyName : 'Chưa đủ căn cứ để khuyến nghị'}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {a.recommendationReason}
                    </p>
                  </div>

                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">
                      Tổng chi phí sở hữu
                    </p>
                    <p className="text-sm">{a.totalCostOfOwnership}</p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    {a.comparison.map((c) => (
                      <div key={c.quotationId} className="rounded-md border border-border p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium">{c.supplierName}</span>
                          <ScoreBadge score={c.valueScore} suffix="/100" />
                        </div>
                        <AiList label="Ưu điểm" items={c.pros} className="mt-2" />
                        <AiList label="Nhược điểm" items={c.cons} className="mt-2" />
                      </div>
                    ))}
                  </div>

                  {a.redFlags.length ? (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">
                        Dấu hiệu bất thường
                      </p>
                      {a.redFlags.map((f, i) => {
                        const q = rows.find((r) => r.quotationId === f.quotationId);
                        return (
                          <AiFinding
                            key={i}
                            title={q ? q.supplier.companyName : 'Chung'}
                            body={f.issue}
                            severity={f.severity}
                          />
                        );
                      })}
                    </div>
                  ) : null}

                  <AiList label="Điểm nên đàm phán" items={a.negotiationPoints} />
                </div>
              );
            }}
          </AiPanel>
        </div>
      ) : null}

      {rows.length ? (
        <Card className="mt-4 overflow-hidden">
          <CardHeader>
            <CardTitle>Chi tiết dòng hàng</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-y border-border bg-muted/50 text-left">
                <tr>
                  <th className="px-4 py-2 font-medium">Nhà cung cấp</th>
                  <th className="px-4 py-2 font-medium">Hàng hóa</th>
                  <th className="px-4 py-2 font-medium">Số lượng</th>
                  <th className="px-4 py-2 font-medium">Đơn giá</th>
                  <th className="px-4 py-2 font-medium">Thành tiền</th>
                </tr>
              </thead>
              <tbody>
                {rows.flatMap((row) =>
                  row.items.map((item, index) => (
                    <tr
                      key={item.id}
                      className="border-b border-border last:border-0"
                    >
                      <td className="px-4 py-2">
                        {index === 0 ? row.supplier.companyName : ''}
                      </td>
                      <td className="px-4 py-2">{item.name}</td>
                      <td className="px-4 py-2 tabular-nums">
                        {Number(item.quantity).toLocaleString('vi-VN')} {item.unit}
                      </td>
                      <td className="px-4 py-2 tabular-nums">
                        {formatCurrency(item.unitPrice, row.currency)}
                      </td>
                      <td className="px-4 py-2 tabular-nums">
                        {formatCurrency(item.lineTotal, row.currency)}
                      </td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function ComparisonRow({
  label,
  rows,
  children,
}: {
  label: string;
  rows: Comparison['quotations'];
  children: (row: Comparison['quotations'][number]) => React.ReactNode;
}) {
  return (
    <tr className="border-b border-border">
      <td className="sticky left-0 bg-card px-4 py-3 font-medium text-muted-foreground">
        {label}
      </td>
      {rows.map((row) => (
        <td key={row.quotationId} className="px-4 py-3">
          {children(row)}
        </td>
      ))}
    </tr>
  );
}
