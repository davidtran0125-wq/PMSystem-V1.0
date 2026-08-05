'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  FieldError,
  Input,
  Label,
  PageHeader,
  Skeleton,
  Textarea,
} from '@/components/ui';
import { QuotationStatusBadge, RfqStatusBadge } from '@/components/status-badge';
import { api, apiErrorMessage } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { Rfq } from '@/lib/types';

interface QuoteForm {
  currency: string;
  leadTimeDays: string;
  moq: string;
  paymentTerm: string;
  incoterm: string;
  deliveryTerm: string;
  warranty: string;
  validUntil: string;
  remark: string;
  items: { name: string; quantity: string; unit: string; unitPrice: string }[];
}

export default function SupplierRfqDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: rfq, isLoading } = useQuery({
    queryKey: ['supplier-rfq', id],
    queryFn: async () => (await api.get<Rfq>(`/rfqs/${id}`)).data,
  });

  // Acknowledging the invitation lets the buyer see who has opened the RFQ.
  useEffect(() => {
    if (rfq?.status === 'SENT') {
      void api.post(`/rfqs/${id}/view`).catch(() => undefined);
    }
  }, [rfq?.status, id]);

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<QuoteForm>({
    defaultValues: {
      currency: 'VND',
      leadTimeDays: '',
      moq: '',
      paymentTerm: '',
      incoterm: '',
      deliveryTerm: '',
      warranty: '',
      validUntil: '',
      remark: '',
      items: [],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  // Pre-fill the quote lines from what the buyer asked for.
  useEffect(() => {
    const prItems = rfq?.purchaseRequest?.items;
    if (!prItems?.length || fields.length) return;
    reset((current) => ({
      ...current,
      items: prItems.map((item) => ({
        name: item.name,
        quantity: String(Number(item.quantity)),
        unit: item.unit,
        unitPrice: '',
      })),
    }));
  }, [rfq, fields.length, reset]);

  const items = watch('items');
  const total = items.reduce((sum, item) => {
    const qty = Number(item.quantity);
    const price = Number(item.unitPrice);
    return Number.isFinite(qty) && Number.isFinite(price) ? sum + qty * price : sum;
  }, 0);

  const submitQuote = useMutation({
    mutationFn: async (values: QuoteForm) =>
      api.post(`/rfqs/${id}/quotations`, {
        currency: values.currency || 'VND',
        ...(values.leadTimeDays ? { leadTimeDays: Number(values.leadTimeDays) } : {}),
        ...(values.moq ? { moq: values.moq } : {}),
        ...(values.paymentTerm ? { paymentTerm: values.paymentTerm } : {}),
        ...(values.incoterm ? { incoterm: values.incoterm } : {}),
        ...(values.deliveryTerm ? { deliveryTerm: values.deliveryTerm } : {}),
        ...(values.warranty ? { warranty: values.warranty } : {}),
        ...(values.validUntil
          ? { validUntil: new Date(values.validUntil).toISOString() }
          : {}),
        ...(values.remark ? { remark: values.remark } : {}),
        items: values.items.map((item) => ({
          name: item.name,
          quantity: Number(item.quantity),
          unit: item.unit,
          unitPrice: Number(item.unitPrice),
        })),
      }),
    onSuccess: () => {
      toast.success('Đã gửi báo giá');
      void queryClient.invalidateQueries({ queryKey: ['supplier-rfq', id] });
    },
    onError: (error) => toast.error(apiErrorMessage(error, 'Không gửi được báo giá')),
  });

  if (isLoading || !rfq) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const myQuote = rfq.quotations?.[0];
  const expired = rfq.dueDate ? new Date(rfq.dueDate) < new Date() : false;
  const canQuote = rfq.status === 'SENT' && !expired && !myQuote;

  return (
    <div className="mx-auto max-w-4xl">
      <Button
        variant="ghost"
        size="sm"
        className="mb-3"
        onClick={() => router.push('/supplier/rfqs')}
      >
        <ArrowLeft className="h-4 w-4" />
        Danh sách RFQ
      </Button>

      <PageHeader
        title={`${rfq.code} — ${rfq.title}`}
        description={`Hạn nộp báo giá: ${formatDate(rfq.dueDate)}`}
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <RfqStatusBadge status={rfq.status} />
        {expired ? <Badge tone="danger">Đã hết hạn</Badge> : null}
        {myQuote ? <QuotationStatusBadge status={myQuote.status} /> : null}
      </div>

      {rfq.instructions ? (
        <Card className="mb-4">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Hướng dẫn từ bên mua</p>
            <p className="mt-1 whitespace-pre-wrap text-sm">{rfq.instructions}</p>
          </CardContent>
        </Card>
      ) : null}

      {myQuote ? (
        <Card>
          <CardHeader>
            <CardTitle>Báo giá đã gửi — {myQuote.code}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
              <Detail
                label="Tổng giá trị"
                value={formatCurrency(myQuote.totalAmount, myQuote.currency)}
              />
              <Detail
                label="Thời gian giao"
                value={myQuote.leadTimeDays ? `${myQuote.leadTimeDays} ngày` : '—'}
              />
              <Detail label="Thanh toán" value={myQuote.paymentTerm ?? '—'} />
              <Detail label="Incoterm" value={myQuote.incoterm ?? '—'} />
              <Detail label="Bảo hành" value={myQuote.warranty ?? '—'} />
              <Detail label="Hiệu lực" value={formatDate(myQuote.validUntil)} />
            </div>

            <table className="mt-4 w-full text-sm">
              <thead className="border-y border-border text-left">
                <tr>
                  <th className="py-2 font-medium">Hàng hóa</th>
                  <th className="py-2 font-medium">Số lượng</th>
                  <th className="py-2 font-medium">Đơn giá</th>
                  <th className="py-2 font-medium">Thành tiền</th>
                </tr>
              </thead>
              <tbody>
                {myQuote.items.map((item) => (
                  <tr key={item.id} className="border-b border-border last:border-0">
                    <td className="py-2">{item.name}</td>
                    <td className="py-2 tabular-nums">
                      {Number(item.quantity).toLocaleString('vi-VN')} {item.unit}
                    </td>
                    <td className="py-2 tabular-nums">
                      {formatCurrency(item.unitPrice, myQuote.currency)}
                    </td>
                    <td className="py-2 tabular-nums">
                      {formatCurrency(item.lineTotal, myQuote.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : !canQuote ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            {expired
              ? 'Đã quá hạn nộp báo giá cho yêu cầu này.'
              : 'Yêu cầu này hiện không nhận báo giá.'}
          </CardContent>
        </Card>
      ) : (
        <form
          onSubmit={handleSubmit((values) => submitQuote.mutate(values))}
          className="space-y-5"
        >
          <Card>
            <CardHeader>
              <CardTitle>Điều khoản thương mại</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label>Tiền tệ</Label>
                <Input {...register('currency')} />
              </div>
              <div>
                <Label>Thời gian giao (ngày)</Label>
                <Input type="number" {...register('leadTimeDays')} />
              </div>
              <div>
                <Label>MOQ</Label>
                <Input {...register('moq')} />
              </div>
              <div>
                <Label>Điều khoản thanh toán</Label>
                <Input placeholder="Net 30" {...register('paymentTerm')} />
              </div>
              <div>
                <Label>Incoterm</Label>
                <Input placeholder="CIF" {...register('incoterm')} />
              </div>
              <div>
                <Label>Điều kiện giao hàng</Label>
                <Input {...register('deliveryTerm')} />
              </div>
              <div>
                <Label>Bảo hành</Label>
                <Input placeholder="12 tháng" {...register('warranty')} />
              </div>
              <div>
                <Label>Hiệu lực báo giá đến</Label>
                <Input type="date" {...register('validUntil')} />
              </div>
              <div className="sm:col-span-3">
                <Label>Ghi chú</Label>
                <Textarea {...register('remark')} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Bảng giá</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {fields.map((field, index) => (
                <div
                  key={field.id}
                  className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-12"
                >
                  <div className="sm:col-span-5">
                    <Label required>Hàng hóa</Label>
                    <Input
                      {...register(`items.${index}.name`, { required: 'Bắt buộc' })}
                    />
                    <FieldError message={errors.items?.[index]?.name?.message} />
                  </div>
                  <div className="sm:col-span-2">
                    <Label required>Số lượng</Label>
                    <Input
                      type="number"
                      step="any"
                      {...register(`items.${index}.quantity`, { required: 'Bắt buộc' })}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label required>Đơn vị</Label>
                    <Input
                      {...register(`items.${index}.unit`, { required: 'Bắt buộc' })}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label required>Đơn giá</Label>
                    <Input
                      type="number"
                      step="any"
                      {...register(`items.${index}.unitPrice`, { required: 'Bắt buộc' })}
                    />
                  </div>
                  <div className="flex items-end sm:col-span-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Xóa dòng"
                      onClick={() => remove(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}

              <div className="flex items-center justify-between">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    append({ name: '', quantity: '', unit: '', unitPrice: '' })
                  }
                >
                  <Plus className="h-4 w-4" />
                  Thêm dòng
                </Button>
                <p className="text-sm">
                  Tổng cộng:{' '}
                  <span className="font-semibold tabular-nums">
                    {formatCurrency(total)}
                  </span>
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button type="submit" disabled={isSubmitting || !fields.length}>
              Gửi báo giá
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5">{value}</p>
    </div>
  );
}
