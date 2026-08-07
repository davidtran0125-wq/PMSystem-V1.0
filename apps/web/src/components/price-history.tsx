'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { History, X } from 'lucide-react';
import { Skeleton } from '@/components/ui';
import { api } from '@/lib/api';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import type { MaterialOrderHistory, MaterialPriceSummary } from '@/lib/types';

/**
 * Tra giá lịch sử cho nhiều mã trong một request. Dùng chung cho màn duyệt yêu
 * cầu mua và màn tạo đơn hàng, nơi người duyệt cần biết ngay lần trước mua bao
 * nhiêu trước khi đặt bút.
 */
export function usePriceHistory(materialIds: (string | null | undefined)[]) {
  const ids = [...new Set(materialIds.filter(Boolean) as string[])].sort();
  return useQuery({
    queryKey: ['material-price-summary', ids],
    enabled: ids.length > 0,
    queryFn: async () =>
      (
        await api.get<Record<string, MaterialPriceSummary>>(
          '/materials/price-summary',
          { params: { ids: ids.join(',') } },
        )
      ).data,
  });
}

function diffPercent(current?: number | null, reference?: number | null) {
  if (!current || !reference) return null;
  return ((current - reference) / reference) * 100;
}

/**
 * Chỉ một biểu tượng trong bảng cho đỡ chật; bấm vào mới mở popup chi tiết.
 * Popup vẽ qua portal ở body và định vị tuyệt đối theo màn hình, nếu không nó
 * sẽ bị chính ô có `overflow` của bảng cắt mất.
 */
export function PriceHistoryButton({
  materialId,
  materialCode,
  summary,
  currentPrice,
  loading,
}: {
  materialId?: string | null;
  materialCode?: string | null;
  summary?: MaterialPriceSummary;
  /** Giá của dòng hàng đang xét, để tính chênh lệch so với lần mua gần nhất. */
  currentPrice?: number | null;
  loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);

  if (!materialId) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  if (loading) return <Skeleton className="h-7 w-7" />;
  if (!summary?.orders) {
    return (
      <span className="text-xs text-muted-foreground" title="Mã này chưa từng được mua">
        —
      </span>
    );
  }

  const diff = diffPercent(currentPrice, summary.lastPrice);
  const tone =
    diff === null || Math.abs(diff) < 0.5
      ? 'text-muted-foreground'
      : diff > 0
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-emerald-600 dark:text-emerald-400';

  return (
    <>
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Xem lịch sử giá"
        title={`Đã mua ${summary.orders} lần · gần nhất ${formatCurrency(
          summary.lastPrice ?? 0,
        )}${diff === null ? '' : ` (${diff > 0 ? '+' : ''}${diff.toFixed(1)}%)`}`}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border transition-colors hover:bg-accent"
      >
        <History className={cn('h-4 w-4', tone)} />
        {diff !== null && Math.abs(diff) >= 0.5 ? (
          <span className="sr-only">
            {diff > 0 ? 'cao hơn' : 'thấp hơn'} {Math.abs(diff).toFixed(1)}%
          </span>
        ) : null}
      </button>

      {open ? (
        <PricePopoverPortal anchor={trigger} onClose={() => setOpen(false)}>
          <PriceHistoryPopover
            materialId={materialId}
            materialCode={materialCode}
            summary={summary}
            currentPrice={currentPrice}
            onClose={() => setOpen(false)}
          />
        </PricePopoverPortal>
      ) : null}
    </>
  );
}

/**
 * Đưa popup ra khỏi cây DOM của bảng và neo theo tọa độ màn hình của nút, nên
 * `overflow-x-auto` của bảng không cắt được nó. Tự lật lên trên hoặc sang trái
 * khi sát mép màn hình.
 */
function PricePopoverPortal({
  anchor,
  onClose,
  children,
}: {
  anchor: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useLayoutEffect(() => {
    const place = () => {
      const rect = anchor.current?.getBoundingClientRect();
      if (!rect) return;
      const width = 384;
      const height = 420;
      const left = Math.min(
        Math.max(8, rect.right - width),
        window.innerWidth - width - 8,
      );
      const below = rect.bottom + 6;
      const top =
        below + height > window.innerHeight ? Math.max(8, rect.top - height - 6) : below;
      setPos({ top, left });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [anchor]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!mounted || !pos) return null;

  return createPortal(
    <>
      <button
        aria-label="Đóng lịch sử giá"
        className="fixed inset-0 z-40 cursor-default"
        onClick={onClose}
      />
      <div className="fixed z-50" style={{ top: pos.top, left: pos.left }}>
        {children}
      </div>
    </>,
    document.body,
  );
}

function PriceHistoryPopover({
  materialId,
  materialCode,
  summary,
  currentPrice,
  onClose,
}: {
  materialId: string;
  materialCode?: string | null;
  summary: MaterialPriceSummary;
  currentPrice?: number | null;
  onClose: () => void;
}) {
  const detail = useQuery({
    queryKey: ['material-history', materialId],
    queryFn: async () =>
      (await api.get<MaterialOrderHistory>(`/materials/${materialId}/order-history`))
        .data,
  });

  const orders = (detail.data?.orders ?? []).slice(0, 6);
  const diff = diffPercent(currentPrice, summary.lastPrice);

  return (
    <div className="w-96 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-border bg-card text-left shadow-xl">
      <div className="flex items-start justify-between gap-2 border-b border-border px-4 py-2.5">
        <div className="min-w-0">
          <p className="text-sm font-medium">Lịch sử mua</p>
          <p className="truncate font-mono text-xs text-muted-foreground">
            {materialCode ?? detail.data?.material.code ?? ''}
          </p>
        </div>
        <button
          type="button"
          aria-label="Đóng"
          onClick={onClose}
          className="rounded p-1 hover:bg-accent"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-px bg-border">
        <Figure
          label="Thấp nhất"
          value={formatCurrency(summary.lowestPrice ?? 0)}
          tone="good"
        />
        <Figure label="Bình quân" value={formatCurrency(summary.averagePrice ?? 0)} />
        <Figure
          label="Cao nhất"
          value={formatCurrency(summary.highestPrice ?? 0)}
          tone="warn"
        />
      </div>

      <div className="space-y-1 border-t border-border px-4 py-3 text-xs">
        <p>
          <span className="text-muted-foreground">Lần mua gần nhất: </span>
          <span className="font-medium tabular-nums">
            {formatCurrency(summary.lastPrice ?? 0)}
          </span>
          <span className="text-muted-foreground">
            {' '}
            ngày {formatDate(summary.lastOrderedAt)}
          </span>
        </p>
        {summary.lastSupplier ? (
          <p className="text-muted-foreground">
            Từ {summary.lastSupplier}
            {summary.lastPurchaseOrder ? (
              <>
                {' · '}
                <Link
                  href={`/purchase-orders/${summary.lastPurchaseOrder.id}`}
                  className="text-primary hover:underline"
                >
                  {summary.lastPurchaseOrder.code}
                </Link>
              </>
            ) : null}
          </p>
        ) : null}
        {diff !== null ? (
          <p
            className={cn(
              'font-medium',
              diff > 0
                ? 'text-amber-700 dark:text-amber-400'
                : 'text-emerald-700 dark:text-emerald-400',
            )}
          >
            Giá đang xét {diff > 0 ? 'cao hơn' : 'thấp hơn'} lần trước{' '}
            {Math.abs(diff).toFixed(1)}%
          </p>
        ) : null}
      </div>

      <div className="max-h-56 overflow-y-auto border-t border-border">
        {detail.isLoading ? (
          <div className="p-3">
            <Skeleton className="h-24 w-full" />
          </div>
        ) : !orders.length ? (
          <p className="px-4 py-3 text-xs text-muted-foreground">
            Chưa có đơn hàng nào.
          </p>
        ) : (
          <table className="w-full text-xs">
            <thead className="border-y border-border bg-muted/40 text-left">
              <tr>
                <th className="cell-head !px-3">Đơn</th>
                <th className="cell-head !px-3">Nhà cung cấp</th>
                <th className="cell-head !px-3">SL</th>
                <th className="cell-head !px-3">Đơn giá</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-t border-border">
                  <td className="cell !px-3">
                    <Link
                      href={`/purchase-orders/${o.purchaseOrder.id}`}
                      className="text-primary hover:underline"
                    >
                      {o.purchaseOrder.code}
                    </Link>
                    <p className="text-muted-foreground">{formatDate(o.orderedAt)}</p>
                  </td>
                  <td className="max-w-28 truncate cell !px-3 text-muted-foreground">
                    {o.purchaseOrder.supplier.companyName}
                  </td>
                  <td className="cell !px-3 tabular-nums">
                    {Number(o.quantity).toLocaleString('vi-VN')}
                  </td>
                  <td
                    className={cn(
                      'px-3 py-1.5 tabular-nums',
                      Number(o.unitPrice) === summary.lowestPrice &&
                        'font-semibold text-emerald-700 dark:text-emerald-400',
                    )}
                  >
                    {formatCurrency(o.unitPrice, o.purchaseOrder.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="border-t border-border px-4 py-2">
        <Link
          href={`/materials/${materialId}`}
          className="text-xs font-medium text-primary hover:underline"
        >
          Xem toàn bộ lịch sử của mã này →
        </Link>
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
    <div className="bg-card px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          'text-xs font-semibold tabular-nums',
          tone === 'good' && 'text-emerald-700 dark:text-emerald-400',
          tone === 'warn' && 'text-amber-700 dark:text-amber-400',
        )}
      >
        {value}
      </p>
    </div>
  );
}
