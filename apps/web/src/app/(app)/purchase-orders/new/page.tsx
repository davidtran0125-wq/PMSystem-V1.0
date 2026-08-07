'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  PageHeader,
  Select,
  Skeleton,
  Textarea,
} from '@/components/ui';
import { ConfirmButton } from '@/components/confirm-button';
import { PriceHistoryButton, usePriceHistory } from '@/components/price-history';
import { api, apiErrorMessage } from '@/lib/api';
import { cn, formatCurrency } from '@/lib/utils';
import type { Comparison, Paginated, PurchaseOrder, Rfq } from '@/lib/types';

function NewPurchaseOrderForm() {
  const router = useRouter();
  const params = useSearchParams();

  const [rfqId, setRfqId] = useState(params.get('rfqId') ?? '');
  const [selected, setSelected] = useState<string[]>([]);
  const [taxRate, setTaxRate] = useState('10');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  // Only RFQs that already have a winning quotation can become an order.
  const awarded = useQuery({
    queryKey: ['rfqs', 'awarded'],
    queryFn: async () =>
      (
        await api.get<Paginated<Rfq>>('/rfqs', {
          params: { status: 'AWARDED', pageSize: 100 },
        })
      ).data,
  });

  const preview = useQuery({
    queryKey: ['rfq-compare', rfqId],
    queryFn: async () => (await api.get<Comparison>(`/rfqs/${rfqId}/compare`)).data,
    enabled: Boolean(rfqId),
  });

  /** Đơn hàng đã tạo từ RFQ này, để không chào tạo trùng cho cùng một báo giá. */
  const existing = useQuery({
    queryKey: ['purchase-orders', 'by-rfq', rfqId],
    queryFn: async () =>
      (
        await api.get<Paginated<PurchaseOrder & { quotation?: { id: string } | null }>>(
          '/purchase-orders',
          { params: { rfqId, pageSize: 100 } },
        )
      ).data,
    enabled: Boolean(rfqId),
  });

  /** Báo giá nào đã sinh đơn hàng, và đơn đó là đơn nào — để dẫn thẳng sang. */
  const orderByQuotation = useMemo(() => {
    const map = new Map<string, { id: string; code: string }>();
    for (const order of existing.data?.data ?? []) {
      if (order.quotation?.id) {
        map.set(order.quotation.id, { id: order.id, code: order.code });
      }
    }
    return map;
  }, [existing.data]);
  const usedQuotationIds = useMemo(
    () => new Set(orderByQuotation.keys()),
    [orderByQuotation],
  );

  const winners = useMemo(
    () => (preview.data?.quotations ?? []).filter((q) => q.isAwarded),
    [preview.data],
  );
  const available = winners.filter((w) => !usedQuotationIds.has(w.quotationId));

  // Người tạo đơn cần đối chiếu giá sắp chốt với giá đã từng mua.
  const priceHistory = usePriceHistory(
    winners.flatMap((w) => w.items.map((i) => i.materialId)),
  );

  useEffect(() => {
    if (!rfqId && awarded.data?.data.length === 1) setRfqId(awarded.data.data[0].id);
  }, [awarded.data, rfqId]);

  // Mặc định chọn hết những báo giá trúng thầu chưa có đơn hàng.
  useEffect(() => {
    setSelected(available.map((w) => w.quotationId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rfqId, winners.length, usedQuotationIds.size]);

  /** Chỉ tính trên các dòng thực sự trúng thầu của báo giá đó. */
  const awardedTotal = (quotationId: string) => {
    const w = winners.find((q) => q.quotationId === quotationId);
    if (!w) return 0;
    return w.items
      .filter((i) => w.awardedItemIds.includes(i.id))
      .reduce((sum, i) => sum + Number(i.lineTotal), 0);
  };

  const subtotal = selected.reduce((sum, id) => sum + awardedTotal(id), 0);
  const tax = (subtotal * Number(taxRate || 0)) / 100;

  const submit = async () => {
    if (!rfqId) {
      toast.error('Chọn RFQ đã có nhà cung cấp trúng thầu');
      return;
    }
    if (!selected.length) {
      toast.error('Chọn ít nhất một nhà cung cấp trúng thầu');
      return;
    }
    setSaving(true);
    const created: PurchaseOrder[] = [];
    try {
      // Mỗi báo giá trúng thầu thành một đơn hàng riêng, tạo tuần tự để mã đơn
      // không bị cấp trùng.
      for (const quotationId of selected) {
        const { data } = await api.post<PurchaseOrder>('/purchase-orders/from-rfq', {
          rfqId,
          quotationId,
          taxRate: Number(taxRate || 0),
          ...(deliveryDate ? { deliveryDate: new Date(deliveryDate).toISOString() } : {}),
          ...(deliveryAddress ? { deliveryAddress } : {}),
          ...(note ? { note } : {}),
        });
        created.push(data);
      }
      toast.success(
        created.length > 1
          ? `Đã tạo ${created.length} đơn hàng: ${created.map((o) => o.code).join(', ')}`
          : `Đã tạo đơn hàng ${created[0].code}`,
      );
      router.push(created.length > 1 ? '/purchase-orders' : `/purchase-orders/${created[0].id}`);
    } catch (error) {
      if (created.length) {
        toast.error(
          `Đã tạo ${created.map((o) => o.code).join(', ')} nhưng dừng ở đơn tiếp theo: ${apiErrorMessage(error)}`,
        );
      } else {
        toast.error(apiErrorMessage(error, 'Không tạo được đơn hàng'));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Tạo đơn hàng"
        description="Dòng hàng và đơn giá lấy từ báo giá đã trúng thầu. RFQ chia thầu cho nhiều nhà cung cấp sẽ sinh ra nhiều đơn hàng từ cùng một yêu cầu mua."
      />

      <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>Nguồn đơn hàng</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label required>RFQ đã chọn nhà cung cấp</Label>
              <Select value={rfqId} onChange={(e) => setRfqId(e.target.value)}>
                <option value="">— Chọn RFQ —</option>
                {awarded.data?.data.map((rfq) => (
                  <option key={rfq.id} value={rfq.id}>
                    {rfq.code} — {rfq.title}
                  </option>
                ))}
              </Select>
              {awarded.data && !awarded.data.data.length ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Chưa có RFQ nào chốt nhà cung cấp.
                </p>
              ) : null}
            </div>

            {preview.isLoading && rfqId ? (
              <Skeleton className="h-28 w-full" />
            ) : !rfqId ? null : !winners.length ? (
              <p className="text-sm text-muted-foreground">
                RFQ này chưa trao thầu cho nhà cung cấp nào.
              </p>
            ) : (
              <div className="space-y-2">
                <Label>
                  Nhà cung cấp trúng thầu {winners.length > 1 ? `(${winners.length})` : ''}
                </Label>
                {winners.map((w) => {
                  const madeOrder = orderByQuotation.get(w.quotationId);
                  const done = Boolean(madeOrder);
                  const checked = selected.includes(w.quotationId);
                  return (
                    <label
                      key={w.quotationId}
                      className={cn(
                        'flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm',
                        done
                          ? 'cursor-default border-border bg-muted/40'
                          : checked
                            ? 'border-primary bg-accent/40'
                            : 'border-border',
                      )}
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4"
                        disabled={done}
                        checked={checked}
                        onChange={(e) =>
                          setSelected((prev) =>
                            e.target.checked
                              ? [...prev, w.quotationId]
                              : prev.filter((id) => id !== w.quotationId),
                          )
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{w.supplier.companyName}</span>
                          {madeOrder ? (
                            <>
                              <Badge tone="success">
                                <CheckCircle2 className="mr-1 h-3 w-3" />
                                Đã tạo đơn
                              </Badge>
                              <Link
                                href={`/purchase-orders/${madeOrder.id}`}
                                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                              >
                                {madeOrder.code}
                                <ArrowRight className="h-3 w-3" />
                              </Link>
                            </>
                          ) : null}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Báo giá {w.code} · trúng {w.awardedItemIds.length}/{w.items.length}{' '}
                          dòng hàng
                          {w.leadTimeDays ? ` · giao ${w.leadTimeDays} ngày` : ''}
                        </p>
                        <p className="mt-1 tabular-nums">
                          {formatCurrency(awardedTotal(w.quotationId), w.currency)}
                        </p>

                        <ul className="mt-2 space-y-1.5">
                          {w.items
                            .filter((i) => w.awardedItemIds.includes(i.id))
                            .map((i) => (
                              <li
                                key={i.id}
                                className="flex flex-wrap items-center gap-2 text-xs"
                              >
                                <span className="min-w-32">{i.name}</span>
                                <span className="tabular-nums text-muted-foreground">
                                  {Number(i.quantity).toLocaleString('vi-VN')} {i.unit} ×{' '}
                                  {formatCurrency(i.unitPrice, w.currency)}
                                </span>
                                <PriceHistoryButton
                                  materialId={i.materialId}
                                  loading={priceHistory.isLoading}
                                  summary={
                                    i.materialId
                                      ? priceHistory.data?.[i.materialId]
                                      : undefined
                                  }
                                  currentPrice={Number(i.unitPrice)}
                                />
                              </li>
                            ))}
                        </ul>
                      </div>
                    </label>
                  );
                })}

                {!available.length ? (
                  <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm dark:border-emerald-900 dark:bg-emerald-950">
                    <p className="font-medium">
                      RFQ này đã tạo đủ đơn hàng cho mọi nhà cung cấp trúng thầu.
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-muted-foreground">
                      Mở đơn đã tạo:
                      {[...orderByQuotation.values()].map((o) => (
                        <Link
                          key={o.id}
                          href={`/purchase-orders/${o.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {o.code}
                        </Link>
                      ))}
                    </p>
                  </div>
                ) : null}

                {selected.length ? (
                  <div className="rounded-lg border border-border p-4 text-sm">
                    <Row label="Tạm tính" value={formatCurrency(subtotal)} />
                    <Row
                      label={`Thuế VAT (${Number(taxRate || 0)}%)`}
                      value={formatCurrency(tax)}
                    />
                    <div className="mt-1 flex justify-between border-t border-border pt-1 font-semibold">
                      <span>Tổng cộng {selected.length > 1 ? `(${selected.length} đơn)` : ''}</span>
                      <span className="tabular-nums">{formatCurrency(subtotal + tax)}</span>
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Thông tin giao hàng</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Thuế VAT (%)</Label>
              <Input
                type="number"
                min="0"
                max="100"
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
              />
            </div>
            <div>
              <Label>Ngày giao hàng</Label>
              <Input
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Địa chỉ giao hàng</Label>
              <Input
                placeholder="VD: Kho A, KCN Tân Bình, TP.HCM"
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Ghi chú cho nhà cung cấp</Label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => router.back()}>
            Hủy
          </Button>
          <ConfirmButton
            disabled={saving || !selected.length}
            confirmLabel={
              selected.length > 1
                ? `Tạo ${selected.length} đơn hàng?`
                : 'Tạo đơn hàng?'
            }
            confirmActionLabel="Tạo"
            onConfirm={submit}
          >
            {selected.length > 1
              ? `Tạo ${selected.length} đơn hàng (nháp)`
              : 'Tạo đơn hàng (nháp)'}
          </ConfirmButton>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

export default function NewPurchaseOrderPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <NewPurchaseOrderForm />
    </Suspense>
  );
}
