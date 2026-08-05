'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trophy } from 'lucide-react';
import { toast } from 'sonner';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  FieldError,
  Input,
  Label,
  PageHeader,
  Select,
  Skeleton,
  Textarea,
} from '@/components/ui';
import { api, apiErrorMessage } from '@/lib/api';
import { cn, formatDate } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import type {
  Paginated,
  Supplier,
  SupplierPerformance,
  SupplierRanking,
} from '@/lib/types';

const CRITERIA = [
  { key: 'priceScore', label: 'Giá', weight: '25%' },
  { key: 'qualityScore', label: 'Chất lượng', weight: '30%' },
  { key: 'deliveryScore', label: 'Giao hàng', weight: '20%' },
  { key: 'responseScore', label: 'Thời gian phản hồi', weight: '10%' },
  { key: 'cooperationScore', label: 'Hợp tác', weight: '15%' },
] as const;

interface FormValues {
  supplierId: string;
  periodStart: string;
  periodEnd: string;
  priceScore: string;
  qualityScore: string;
  deliveryScore: string;
  responseScore: string;
  cooperationScore: string;
  complaintRate: string;
  note: string;
}

function scoreTone(score: number) {
  if (score >= 85) return 'success';
  if (score >= 70) return 'info';
  if (score >= 50) return 'warning';
  return 'danger';
}

export default function SupplierPerformancePage() {
  const queryClient = useQueryClient();
  const canWrite = useAuthStore((s) => s.can('supplier:write'));
  const [creating, setCreating] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    defaultValues: {
      priceScore: '3',
      qualityScore: '3',
      deliveryScore: '3',
      responseScore: '3',
      cooperationScore: '3',
      complaintRate: '0',
    },
  });

  const ranking = useQuery({
    queryKey: ['supplier-ranking'],
    queryFn: async () =>
      (await api.get<SupplierRanking[]>('/supplier-performance/ranking')).data,
  });

  const history = useQuery({
    queryKey: ['supplier-performance'],
    queryFn: async () =>
      (
        await api.get<Paginated<SupplierPerformance>>('/supplier-performance', {
          params: { pageSize: 50 },
        })
      ).data,
  });

  const suppliers = useQuery({
    queryKey: ['suppliers', 'approved'],
    queryFn: async () =>
      (
        await api.get<Paginated<Supplier>>('/suppliers', {
          params: { status: 'APPROVED', pageSize: 100 },
        })
      ).data,
    enabled: creating,
  });

  const create = useMutation({
    mutationFn: async (values: FormValues) =>
      api.post('/supplier-performance', {
        supplierId: values.supplierId,
        periodStart: new Date(values.periodStart).toISOString(),
        periodEnd: new Date(values.periodEnd).toISOString(),
        priceScore: Number(values.priceScore),
        qualityScore: Number(values.qualityScore),
        deliveryScore: Number(values.deliveryScore),
        responseScore: Number(values.responseScore),
        cooperationScore: Number(values.cooperationScore),
        complaintRate: Number(values.complaintRate || 0),
        ...(values.note ? { note: values.note } : {}),
      }),
    onSuccess: () => {
      toast.success('Đã lưu đánh giá');
      setCreating(false);
      reset();
      void queryClient.invalidateQueries({ queryKey: ['supplier-ranking'] });
      void queryClient.invalidateQueries({ queryKey: ['supplier-performance'] });
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  return (
    <div>
      <PageHeader
        title="Đánh giá nhà cung cấp"
        description="Chấm điểm theo 5 tiêu chí có trọng số, trừ tỷ lệ khiếu nại."
        actions={
          canWrite ? (
            <Button onClick={() => setCreating((v) => !v)}>
              <Plus className="h-4 w-4" />
              Chấm điểm
            </Button>
          ) : null
        }
      />

      {creating ? (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>Đánh giá kỳ mới</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={handleSubmit((v) => create.mutate(v))}
              className="space-y-4"
            >
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <Label required>Nhà cung cấp</Label>
                  <Select {...register('supplierId', { required: 'Bắt buộc' })}>
                    <option value="">— Chọn —</option>
                    {suppliers.data?.data.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.companyName}
                      </option>
                    ))}
                  </Select>
                  <FieldError message={errors.supplierId?.message} />
                </div>
                <div>
                  <Label required>Từ ngày</Label>
                  <Input
                    type="date"
                    {...register('periodStart', { required: 'Bắt buộc' })}
                  />
                  <FieldError message={errors.periodStart?.message} />
                </div>
                <div>
                  <Label required>Đến ngày</Label>
                  <Input
                    type="date"
                    {...register('periodEnd', { required: 'Bắt buộc' })}
                  />
                  <FieldError message={errors.periodEnd?.message} />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-5">
                {CRITERIA.map((c) => (
                  <div key={c.key}>
                    <Label>
                      {c.label}{' '}
                      <span className="text-xs text-muted-foreground">
                        ({c.weight})
                      </span>
                    </Label>
                    <Select {...register(c.key)}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <option key={n} value={n}>
                          {n} điểm
                        </option>
                      ))}
                    </Select>
                  </div>
                ))}
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <Label>Tỷ lệ khiếu nại (%)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="any"
                    {...register('complaintRate')}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label>Ghi chú</Label>
                  <Textarea {...register('note')} />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCreating(false)}
                >
                  Hủy
                </Button>
                <Button type="submit" disabled={isSubmitting || create.isPending}>
                  Lưu đánh giá
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-4 w-4" />
              Xếp hạng
            </CardTitle>
          </CardHeader>
          <CardContent>
            {ranking.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : !ranking.data?.length ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Chưa có đánh giá nào.
              </p>
            ) : (
              <div className="space-y-3">
                {ranking.data.map((r, index) => (
                  <div
                    key={r.supplier?.id ?? index}
                    className="border-b border-border pb-3 last:border-0 last:pb-0"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className={cn(
                            'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                            index === 0
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                              : 'bg-muted text-muted-foreground',
                          )}
                        >
                          {index + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {r.supplier?.companyName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {r.evaluations} lần đánh giá
                          </p>
                        </div>
                      </div>
                      <Badge tone={scoreTone(r.averageScore)}>
                        {r.averageScore} điểm
                      </Badge>
                    </div>
                    <div className="mt-2 grid grid-cols-5 gap-1 text-center text-xs">
                      {CRITERIA.map((c) => {
                        const key = c.key.replace('Score', '') as keyof typeof r.breakdown;
                        return (
                          <div key={c.key} className="rounded bg-muted px-1 py-1">
                            <p className="text-muted-foreground">{c.label}</p>
                            <p className="font-medium tabular-nums">
                              {r.breakdown[key]}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Lịch sử đánh giá</CardTitle>
          </CardHeader>
          <CardContent>
            {history.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : !history.data?.data.length ? (
              <EmptyState title="Chưa có đánh giá" />
            ) : (
              <div className="space-y-3">
                {history.data.data.map((h) => (
                  <div
                    key={h.id}
                    className="rounded-md border border-border p-3 text-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">
                        {h.supplier.companyName}
                      </span>
                      <Badge tone={scoreTone(Number(h.totalScore))}>
                        {Number(h.totalScore)} điểm
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Kỳ {formatDate(h.periodStart)} – {formatDate(h.periodEnd)} ·{' '}
                      {h.evaluator.fullName}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Giá {h.priceScore} · CL {h.qualityScore} · Giao{' '}
                      {h.deliveryScore} · Phản hồi {h.responseScore} · Hợp tác{' '}
                      {h.cooperationScore} · Khiếu nại {Number(h.complaintRate)}%
                    </p>
                    {h.note ? <p className="mt-1">{h.note}</p> : null}
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
