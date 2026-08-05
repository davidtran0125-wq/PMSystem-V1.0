'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
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
import { api, apiErrorMessage } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import type { Comparison, Paginated, PurchaseOrder, Rfq } from '@/lib/types';

function NewPurchaseOrderForm() {
  const router = useRouter();
  const params = useSearchParams();

  const [rfqId, setRfqId] = useState(params.get('rfqId') ?? '');
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
    queryFn: async () =>
      (await api.get<Comparison>(`/rfqs/${rfqId}/compare`)).data,
    enabled: Boolean(rfqId),
  });

  const winner = preview.data?.quotations.find(
    (q) => q.quotationId === preview.data?.rfq.awardedQuotationId,
  );
  const subtotal = winner ? Number(winner.totalAmount) : 0;
  const tax = (subtotal * Number(taxRate || 0)) / 100;

  useEffect(() => {
    if (!rfqId && awarded.data?.data.length === 1) {
      setRfqId(awarded.data.data[0].id);
    }
  }, [awarded.data, rfqId]);

  const submit = async () => {
    if (!rfqId) {
      toast.error('Chọn RFQ đã có nhà cung cấp trúng thầu');
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.post<PurchaseOrder>('/purchase-orders/from-rfq', {
        rfqId,
        taxRate: Number(taxRate || 0),
        ...(deliveryDate ? { deliveryDate: new Date(deliveryDate).toISOString() } : {}),
        ...(deliveryAddress ? { deliveryAddress } : {}),
        ...(note ? { note } : {}),
      });
      toast.success(`Đã tạo đơn hàng ${data.code}`);
      router.push(`/purchase-orders/${data.id}`);
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Không tạo được đơn hàng'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Tạo đơn hàng"
        description="Dòng hàng và đơn giá được lấy từ báo giá đã trúng thầu."
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
            ) : winner ? (
              <div className="rounded-lg border border-border p-4 text-sm">
                <p className="font-medium">{winner.supplier.companyName}</p>
                <p className="text-xs text-muted-foreground">
                  Báo giá {winner.code} · {winner.items.length} dòng hàng
                  {winner.leadTimeDays ? ` · giao ${winner.leadTimeDays} ngày` : ''}
                </p>
                <div className="mt-3 space-y-1">
                  <Row label="Tạm tính" value={formatCurrency(subtotal, winner.currency)} />
                  <Row
                    label={`Thuế VAT (${Number(taxRate || 0)}%)`}
                    value={formatCurrency(tax, winner.currency)}
                  />
                  <div className="flex justify-between border-t border-border pt-1 font-semibold">
                    <span>Tổng cộng</span>
                    <span className="tabular-nums">
                      {formatCurrency(subtotal + tax, winner.currency)}
                    </span>
                  </div>
                </div>
              </div>
            ) : null}
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
          <Button disabled={saving || !rfqId} onClick={submit}>
            Tạo đơn hàng (nháp)
          </Button>
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
