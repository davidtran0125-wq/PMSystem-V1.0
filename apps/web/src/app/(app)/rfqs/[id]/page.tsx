'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Award,
  Clock,
  Lock,
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
  DataTable,
  PageHeader,
  Skeleton,
  Td,
  Th,
  Tr,
} from '@/components/ui';
import { QuotationStatusBadge, RfqStatusBadge } from '@/components/status-badge';
import { AiFinding, AiList, AiPanel, ScoreBadge } from '@/components/ai-panel';
import { ConfirmButton } from '@/components/confirm-button';
import { PriceHistoryButton, usePriceHistory } from '@/components/price-history';
import { api, apiErrorMessage } from '@/lib/api';
import { cn, formatCurrency, formatDate, formatDateTime } from '@/lib/utils';
import type {
  Comparison,
  ComparisonRow as ComparisonRowData,
  QuotationAnalysis,
  Rfq,
  SealedQuotationRow,
} from '@/lib/types';

/**
 * Khóa gộp dòng hàng giữa các báo giá. Trùng khóa nghĩa là cùng một dòng của
 * yêu cầu mua hàng, nên chỉ được trao cho một nhà cung cấp — API cũng chặn
 * bằng đúng khóa này.
 */
function lineKey(item: { purchaseRequestItemId?: string | null; lineNo: number }) {
  return item.purchaseRequestItemId ?? `line:${item.lineNo}`;
}

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

  // Người so sánh báo giá cần đối chiếu ngay với giá đã từng mua.
  const priceHistory = usePriceHistory(
    (comparison?.quotations ?? []).flatMap((q) => (q.items ?? []).map((i) => i.materialId)),
  );

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
    mutationFn: async (awards: { quotationId: string; itemIds?: string[] }[]) =>
      api.post(`/rfqs/${id}/award`, { awards }),
    onSuccess: (_res, awards) => {
      toast.success(
        awards.length > 1
          ? `Đã chia thầu cho ${awards.length} nhà cung cấp`
          : 'Đã chọn nhà cung cấp trúng thầu',
      );
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
              <ConfirmButton
                confirmLabel="Gửi RFQ tới các nhà cung cấp?"
                confirmActionLabel="Gửi"
                onConfirm={() => send.mutate()}
                disabled={send.isPending}
              >
                <Send className="h-4 w-4" />
                Gửi nhà cung cấp
              </ConfirmButton>
            ) : null}
            {rfq.status === 'SENT' ? (
              <ConfirmButton
                variant="outline"
                confirmLabel="Đóng, không nhận thêm báo giá?"
                confirmActionLabel="Đóng"
                onConfirm={() => close.mutate()}
                disabled={close.isPending}
              >
                Đóng nhận báo giá
              </ConfirmButton>
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

      {comparison?.sealed ? (
        <Card className="mb-4 border-amber-300 dark:border-amber-900">
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <Lock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
              <div>
                <p className="font-semibold">Giá đang được niêm phong</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {comparison.seal?.message}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Niêm phong tự mở khi bạn bấm <strong>Đóng nhận báo giá</strong>,
                  khi quá hạn nộp, hoặc khi mọi nhà cung cấp được mời đều đã trả lời.
                </p>
              </div>
            </div>

            {rows.length ? (
              <div className="mt-4 overflow-hidden rounded-lg border border-border">
                <DataTable
                  head={
                    <>
                      <Th>Nhà cung cấp</Th>
                      <Th>Mã báo giá</Th>
                      <Th>Số dòng hàng</Th>
                      <Th>Tệp đính kèm</Th>
                      <Th>Thời điểm nộp</Th>
                    </>
                  }
                >
                  {(rows as unknown as SealedQuotationRow[]).map((row) => (
                    <Tr key={row.quotationId}>
                      <Td className="font-medium">{row.supplier.companyName}</Td>
                      <Td className="text-muted-foreground">{row.code}</Td>
                      <Td className="tabular-nums">{row.itemCount}</Td>
                      <Td className="tabular-nums">{row.attachmentCount}</Td>
                      <Td className="text-muted-foreground">
                        {formatDateTime(row.submittedAt)}
                      </Td>
                    </Tr>
                  ))}
                </DataTable>
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">
                Chưa có nhà cung cấp nào gửi báo giá.
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
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
              <thead className="border-y border-border bg-muted/40 text-left">
                <tr>
                  <th className="sticky left-0 z-10 bg-muted/40 cell-head">
                    Tiêu chí
                  </th>
                  {rows.map((row) => (
                    <th key={row.quotationId} className="min-w-56 px-4 py-2.5 font-medium">
                      <div className="flex items-center gap-2">
                        {row.supplier.companyName}
                        {row.isAwarded ? (
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
                  <td className="sticky left-0 bg-card cell font-medium">
                    Kết quả
                  </td>
                  {rows.map((row) => (
                    <td key={row.quotationId} className="px-4 py-2.5">
                      {row.isAwarded ? (
                        <Badge tone="success">
                          Trúng {row.awardedItemIds.length}/{row.items.length} dòng
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Card>
      )}

      {rows.length && !comparison?.sealed ? (
        <AwardPanel
          rows={rows}
          locked={rfq.status === 'AWARDED' || rfq.status === 'CANCELLED'}
          pending={award.isPending}
          onSubmit={(awards) => award.mutate(awards)}
        />
      ) : null}

      {rows.length >= 2 && !comparison?.sealed ? (
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

      {rows.length && !comparison?.sealed ? (
        <Card className="mt-4 overflow-hidden">
          <CardHeader>
            <CardTitle>Chi tiết dòng hàng</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-y border-border bg-muted/40 text-left">
                <tr>
                  <th className="cell-head">Nhà cung cấp</th>
                  <th className="cell-head">Hàng hóa</th>
                  <th className="cell-head">Số lượng</th>
                  <th className="cell-head">Đơn giá</th>
                  <th className="cell-head">Thành tiền</th>
                  <th className="cell-head" title="Lịch sử giá đã mua">
                    LS
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.flatMap((row) =>
                  row.items.map((item, index) => (
                    <tr
                      key={item.id}
                      className="border-b border-border last:border-0"
                    >
                      <td className="cell">
                        {index === 0 ? row.supplier.companyName : ''}
                      </td>
                      <td className="cell">{item.name}</td>
                      <td className="cell tabular-nums">
                        {Number(item.quantity).toLocaleString('vi-VN')} {item.unit}
                      </td>
                      <td className="cell tabular-nums">
                        {formatCurrency(item.unitPrice, row.currency)}
                      </td>
                      <td className="cell tabular-nums">
                        {formatCurrency(item.lineTotal, row.currency)}
                      </td>
                      <td className="cell">
                        <PriceHistoryButton
                          materialId={item.materialId}
                          loading={priceHistory.isLoading}
                          summary={
                            item.materialId
                              ? priceHistory.data?.[item.materialId]
                              : undefined
                          }
                          currentPrice={Number(item.unitPrice)}
                        />
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
      <td className="sticky left-0 bg-card cell font-medium text-muted-foreground">
        {label}
      </td>
      {rows.map((row) => (
        <td key={row.quotationId} className="px-4 py-2.5">
          {children(row)}
        </td>
      ))}
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Trao thầu theo dòng hàng — một RFQ có thể chia cho nhiều nhà cung cấp
// ---------------------------------------------------------------------------

function AwardPanel({
  rows,
  locked,
  pending,
  onSubmit,
}: {
  rows: ComparisonRowData[];
  locked: boolean;
  pending: boolean;
  onSubmit: (awards: { quotationId: string; itemIds: string[] }[]) => void;
}) {
  /** Mỗi dòng hàng gom lại từ tất cả báo giá, kèm phương án của từng NCC. */
  const lines = useMemo(() => {
    const map = new Map<
      string,
      { key: string; label: string; unit: string; quantity: string; offers: Map<string, ComparisonRowData['items'][number]> }
    >();
    for (const row of rows) {
      for (const item of row.items) {
        const key = lineKey(item);
        const entry = map.get(key) ?? {
          key,
          label: item.name,
          unit: item.unit,
          quantity: item.quantity,
          offers: new Map(),
        };
        entry.offers.set(row.quotationId, item);
        map.set(key, entry);
      }
    }
    return [...map.values()];
  }, [rows]);

  /** key dòng hàng -> quotationId được chọn ('' nghĩa là không trao dòng này). */
  const [picks, setPicks] = useState<Record<string, string>>({});

  useEffect(() => {
    const initial: Record<string, string> = {};
    for (const line of lines) {
      const winner = [...line.offers.entries()].find(([, item]) => item.isAwarded);
      if (winner) {
        initial[line.key] = winner[0];
        continue;
      }
      // Mặc định gợi ý nhà cung cấp rẻ nhất trên từng dòng.
      const cheapest = [...line.offers.entries()].sort(
        (a, b) => Number(a[1].unitPrice) - Number(b[1].unitPrice),
      )[0];
      initial[line.key] = cheapest ? cheapest[0] : '';
    }
    setPicks(initial);
  }, [lines]);

  const awards = useMemo(() => {
    const byQuotation = new Map<string, string[]>();
    for (const line of lines) {
      const quotationId = picks[line.key];
      if (!quotationId) continue;
      const item = line.offers.get(quotationId);
      if (!item) continue;
      byQuotation.set(quotationId, [...(byQuotation.get(quotationId) ?? []), item.id]);
    }
    return [...byQuotation.entries()].map(([quotationId, itemIds]) => ({
      quotationId,
      itemIds,
    }));
  }, [lines, picks]);

  const totalByQuotation = (quotationId: string) => {
    const row = rows.find((r) => r.quotationId === quotationId);
    const itemIds = awards.find((a) => a.quotationId === quotationId)?.itemIds ?? [];
    return (row?.items ?? [])
      .filter((i) => itemIds.includes(i.id))
      .reduce((sum, i) => sum + Number(i.lineTotal), 0);
  };

  const grandTotal = awards.reduce((sum, a) => sum + totalByQuotation(a.quotationId), 0);
  const unassigned = lines.filter((l) => !picks[l.key]).length;

  return (
    <Card className="mt-4 overflow-hidden">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Award className="h-4 w-4" />
          {locked ? 'Kết quả trao thầu theo dòng hàng' : 'Trao thầu theo dòng hàng'}
        </CardTitle>
        {!locked ? (
          <p className="text-sm text-muted-foreground">
            Mỗi dòng hàng chọn một nhà cung cấp. Có thể chia cho nhiều nhà cung cấp cùng
            lúc, sau đó mỗi bên sẽ có một đơn hàng riêng từ cùng yêu cầu mua này.
          </p>
        ) : null}
      </CardHeader>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-y border-border bg-muted/40 text-left">
            <tr>
              <th className="sticky left-0 z-10 bg-muted/40 cell-head">Dòng hàng</th>
              {rows.map((row) => (
                <th key={row.quotationId} className="min-w-48 px-4 py-2.5 font-medium">
                  {row.supplier.companyName}
                </th>
              ))}
              {!locked ? <th className="cell-head">Không trao</th> : null}
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => {
              const prices = [...line.offers.values()].map((i) => Number(i.unitPrice));
              const best = prices.length ? Math.min(...prices) : null;
              return (
                <tr key={line.key} className="border-b border-border last:border-0">
                  <td className="sticky left-0 bg-card cell">
                    <p className="font-medium">{line.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {Number(line.quantity).toLocaleString('vi-VN')} {line.unit}
                    </p>
                  </td>
                  {rows.map((row) => {
                    const item = line.offers.get(row.quotationId);
                    const selected = picks[line.key] === row.quotationId;
                    if (!item) {
                      return (
                        <td key={row.quotationId} className="px-4 py-2.5 text-muted-foreground">
                          Không báo giá
                        </td>
                      );
                    }
                    return (
                      <td key={row.quotationId} className="px-4 py-2.5">
                        <label
                          className={cn(
                            'flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5',
                            selected ? 'border-primary bg-accent/60' : 'border-transparent',
                            locked && 'cursor-default',
                          )}
                        >
                          {!locked ? (
                            <input
                              type="radio"
                              name={`line-${line.key}`}
                              className="h-4 w-4"
                              checked={selected}
                              onChange={() =>
                                setPicks((p) => ({ ...p, [line.key]: row.quotationId }))
                              }
                            />
                          ) : null}
                          <span
                            className={cn(
                              'tabular-nums',
                              best !== null &&
                                Number(item.unitPrice) === best &&
                                'font-semibold text-emerald-600 dark:text-emerald-400',
                            )}
                          >
                            {formatCurrency(item.unitPrice, row.currency)}
                          </span>
                          {locked && item.isAwarded ? (
                            <Badge tone="success">Trúng</Badge>
                          ) : null}
                        </label>
                      </td>
                    );
                  })}
                  {!locked ? (
                    <td className="cell">
                      <input
                        type="radio"
                        name={`line-${line.key}`}
                        className="h-4 w-4"
                        checked={!picks[line.key]}
                        onChange={() => setPicks((p) => ({ ...p, [line.key]: '' }))}
                      />
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <CardContent className="border-t border-border pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1 text-sm">
            {awards.length ? (
              awards.map((a) => {
                const row = rows.find((r) => r.quotationId === a.quotationId)!;
                return (
                  <p key={a.quotationId}>
                    <span className="font-medium">{row.supplier.companyName}</span>{' '}
                    <span className="text-muted-foreground">
                      — {a.itemIds.length} dòng ·{' '}
                      {formatCurrency(totalByQuotation(a.quotationId), row.currency)}
                    </span>
                  </p>
                );
              })
            ) : (
              <p className="text-muted-foreground">Chưa chọn dòng hàng nào.</p>
            )}
            {unassigned ? (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Còn {unassigned} dòng chưa trao cho ai.
              </p>
            ) : null}
            {awards.length > 1 ? (
              <p className="text-xs text-muted-foreground">
                Tổng cộng {formatCurrency(grandTotal)} · sẽ tạo {awards.length} đơn hàng.
              </p>
            ) : null}
          </div>

          {!locked ? (
            <ConfirmButton
              disabled={pending || !awards.length}
              confirmLabel={
                unassigned
                  ? `Còn ${unassigned} dòng chưa trao. Vẫn chốt?`
                  : 'Chốt kết quả trao thầu?'
              }
              confirmActionLabel="Chốt"
              onConfirm={() => onSubmit(awards)}
            >
              <Award className="h-4 w-4" />
              {awards.length > 1 ? `Chia thầu cho ${awards.length} NCC` : 'Trao thầu'}
            </ConfirmButton>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
