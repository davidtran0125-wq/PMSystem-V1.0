'use client';

import { useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { ChevronRight, Plus, Search, Settings, Trophy, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  Badge,
  Button,
  buttonVariants,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  FieldError,
  Input,
  Label,
  PageHeader,
  Pagination,
  Select,
  Skeleton,
  Textarea,
} from '@/components/ui';
import { api, apiErrorMessage } from '@/lib/api';
import { cn, formatDate } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import type {
  CriteriaSummary,
  Paginated,
  Supplier,
  SupplierPerformance,
  SupplierRanking,
} from '@/lib/types';

interface FormValues {
  supplierId: string;
  periodStart: string;
  periodEnd: string;
  complaintRate: string;
  note: string;
  /** Khóa theo id tiêu chí, do bộ tiêu chí là cấu hình được. */
  scores: Record<string, string>;
  comments: Record<string, string>;
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
  const canConfigure = useAuthStore((s) => s.can('setting:write'));
  const [creating, setCreating] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [historyPage, setHistoryPage] = useState(1);
  const [openEval, setOpenEval] = useState<SupplierPerformance | null>(null);
  const [showAllRanking, setShowAllRanking] = useState(false);
  const HISTORY_PAGE_SIZE = 5;

  const criteria = useQuery({
    queryKey: ['evaluation-criteria'],
    queryFn: async () =>
      (await api.get<CriteriaSummary>('/settings/evaluation-criteria')).data,
  });
  const criteriaList = useMemo(() => criteria.data?.criteria ?? [], [criteria.data]);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    defaultValues: { complaintRate: '0', scores: {}, comments: {} },
  });

  const ranking = useQuery({
    queryKey: ['supplier-ranking'],
    queryFn: async () =>
      (await api.get<SupplierRanking[]>('/supplier-performance/ranking')).data,
  });

  // Chỉ 5 lần đánh giá gần nhất mỗi trang, kèm tìm theo tên nhà cung cấp — danh
  // sách đầy đủ dài hơn một màn hình rất nhanh.
  const history = useQuery({
    queryKey: ['supplier-performance', { historySearch, historyPage }],
    queryFn: async () =>
      (
        await api.get<Paginated<SupplierPerformance>>('/supplier-performance', {
          params: {
            page: historyPage,
            pageSize: HISTORY_PAGE_SIZE,
            ...(historySearch ? { search: historySearch } : {}),
          },
        })
      ).data,
  });

  const suppliers = useQuery({
    queryKey: ['suppliers', 'approved'],
    // Danh mục tham chiếu gần như không đổi trong một phiên làm việc.
    staleTime: 10 * 60_000,
    queryFn: async () =>
      (
        await api.get<Paginated<Supplier>>('/suppliers', {
          params: { status: 'APPROVED', pageSize: 100 },
        })
      ).data,
    enabled: creating,
  });

  /**
   * Xem trước điểm tổng bằng đúng công thức của API, để người chấm thấy ngay
   * tác động. Chỉ theo dõi hai trường thực sự ảnh hưởng tới điểm — `watch()`
   * không tham số sẽ render lại cả trang mỗi lần gõ một ký tự vào ô nhận xét.
   */
  const watchedScores = useWatch({ control, name: 'scores' });
  const watchedComplaint = useWatch({ control, name: 'complaintRate' });
  const previewScore = useMemo(() => {
    let weighted = 0;
    let totalWeight = 0;
    for (const c of criteriaList) {
      const raw = watchedScores?.[c.id];
      if (raw === undefined || raw === '') continue;
      const weight = Number(c.weight);
      weighted += (Number(raw) / c.maxScore) * weight;
      totalWeight += weight;
    }
    if (totalWeight === 0) return null;
    const value =
      (weighted / totalWeight) * 100 - Number(watchedComplaint || 0);
    return Number(Math.min(100, Math.max(0, value)).toFixed(2));
  }, [criteriaList, watchedScores, watchedComplaint]);

  const create = useMutation({
    mutationFn: async (values: FormValues) => {
      const scores = criteriaList
        .filter((c) => values.scores?.[c.id] !== undefined && values.scores[c.id] !== '')
        .map((c) => ({
          criteriaId: c.id,
          score: Number(values.scores[c.id]),
          ...(values.comments?.[c.id] ? { comment: values.comments[c.id] } : {}),
        }));
      if (!scores.length) throw new Error('Cần chấm ít nhất một tiêu chí');

      return api.post('/supplier-performance', {
        supplierId: values.supplierId,
        periodStart: new Date(values.periodStart).toISOString(),
        periodEnd: new Date(values.periodEnd).toISOString(),
        complaintRate: Number(values.complaintRate || 0),
        ...(values.note ? { note: values.note } : {}),
        scores,
      });
    },
    onSuccess: () => {
      toast.success('Đã lưu đánh giá');
      setCreating(false);
      reset({ complaintRate: '0', scores: {}, comments: {} });
      void queryClient.invalidateQueries({ queryKey: ['supplier-ranking'] });
      void queryClient.invalidateQueries({ queryKey: ['supplier-performance'] });
    },
    onError: (error) =>
      toast.error(
        error instanceof Error && !('response' in error)
          ? error.message
          : apiErrorMessage(error),
      ),
  });

  return (
    <div>
      <PageHeader
        title="Đánh giá nhà cung cấp"
        description={
          criteria.data
            ? `Chấm theo ${criteriaList.length} tiêu chí tự cấu hình (tổng trọng số ${criteria.data.totalWeight}), trừ tỷ lệ khiếu nại.`
            : 'Chấm điểm theo bộ tiêu chí tự cấu hình, trừ tỷ lệ khiếu nại.'
        }
        actions={
          <>
            {canConfigure ? (
              <Link href="/settings" className={buttonVariants({ variant: 'outline' })}>
                <Settings className="h-4 w-4" />
                Sửa tiêu chí
              </Link>
            ) : null}
            {canWrite ? (
              <Button onClick={() => setCreating((v) => !v)}>
                <Plus className="h-4 w-4" />
                Chấm điểm
              </Button>
            ) : null}
          </>
        }
      />

      {creating ? (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>Đánh giá kỳ mới</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit((v) => create.mutate(v))} className="space-y-4">
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
                  <Input type="date" {...register('periodStart', { required: 'Bắt buộc' })} />
                  <FieldError message={errors.periodStart?.message} />
                </div>
                <div>
                  <Label required>Đến ngày</Label>
                  <Input type="date" {...register('periodEnd', { required: 'Bắt buộc' })} />
                  <FieldError message={errors.periodEnd?.message} />
                </div>
              </div>

              {criteria.isLoading ? (
                <Skeleton className="h-40 w-full" />
              ) : !criteriaList.length ? (
                <EmptyState
                  title="Chưa có tiêu chí đánh giá"
                  description="Vào Thiết lập để tạo bộ tiêu chí trước khi chấm điểm."
                  action={
                    canConfigure ? (
                      <Link href="/settings" className={buttonVariants()}>
                        Mở Thiết lập
                      </Link>
                    ) : null
                  }
                />
              ) : (
                <div className="space-y-3">
                  {criteriaList.map((c) => (
                    <div
                      key={c.id}
                      className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-[minmax(0,1fr)_9rem]"
                    >
                      <div className="sm:col-span-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{c.name}</span>
                          <Badge>trọng số {Number(c.weight)}</Badge>
                          <Badge tone="neutral">thang 0–{c.maxScore}</Badge>
                        </div>
                        {c.description ? (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {c.description}
                          </p>
                        ) : null}
                      </div>
                      <div className="sm:order-2">
                        <Label>Điểm</Label>
                        <Select {...register(`scores.${c.id}` as const)}>
                          <option value="">— Bỏ qua —</option>
                          {Array.from({ length: c.maxScore + 1 }, (_, n) => n).map((n) => (
                            <option key={n} value={n}>
                              {n} / {c.maxScore}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div className="sm:order-1">
                        <Label>Nhận xét cho tiêu chí này</Label>
                        <Textarea
                          rows={2}
                          placeholder="Ví dụ: có 2 lần giao trễ 3 ngày trong kỳ."
                          {...register(`comments.${c.id}` as const)}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

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
                  <Label>Nhận xét chung cả kỳ</Label>
                  <Textarea rows={2} {...register('note')} />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  Điểm tổng dự kiến:{' '}
                  {previewScore === null ? (
                    <span>chưa chấm tiêu chí nào</span>
                  ) : (
                    <Badge tone={scoreTone(previewScore)}>{previewScore} điểm</Badge>
                  )}
                </p>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => setCreating(false)}>
                    Hủy
                  </Button>
                  <Button
                    type="submit"
                    disabled={isSubmitting || create.isPending || !criteriaList.length}
                  >
                    Lưu đánh giá
                  </Button>
                </div>
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
                {(showAllRanking ? ranking.data : ranking.data.slice(0, 5)).map((r, index) => (
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
                          {r.supplier ? (
                            <Link
                              href={`/suppliers/${r.supplier.id}`}
                              className="block truncate text-sm font-medium hover:underline"
                            >
                              {r.supplier.companyName}
                            </Link>
                          ) : (
                            <p className="truncate text-sm font-medium">—</p>
                          )}
                          <p className="text-xs text-muted-foreground">
                            {r.evaluations} lần đánh giá
                          </p>
                        </div>
                      </div>
                      <Badge tone={scoreTone(r.averageScore)}>{r.averageScore} điểm</Badge>
                    </div>
                    {r.breakdown.length ? (
                      <div className="mt-2 flex flex-wrap gap-1 text-xs">
                        {r.breakdown.slice(0, 3).map((b) => (
                          <div key={b.criteriaId} className="rounded bg-muted px-2 py-1">
                            <span className="text-muted-foreground">{b.name}: </span>
                            <span className="font-medium tabular-nums">
                              {b.average}/{b.maxScore}
                            </span>
                          </div>
                        ))}
                        {r.breakdown.length > 3 ? (
                          <span className="rounded bg-muted px-2 py-1 text-muted-foreground">
                            +{r.breakdown.length - 3} tiêu chí
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ))}
                {ranking.data.length > 5 ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={() => setShowAllRanking((v) => !v)}
                  >
                    {showAllRanking
                      ? 'Thu gọn'
                      : `Xem thêm ${ranking.data.length - 5} nhà cung cấp`}
                  </Button>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle>Lịch sử đánh giá</CardTitle>
            <CardDescription>
              5 lần gần nhất mỗi trang. Bấm vào một dòng để xem chi tiết từng tiêu chí.
            </CardDescription>
          </CardHeader>
          <CardContent className="pb-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Tìm theo tên nhà cung cấp…"
                value={historySearch}
                onChange={(e) => {
                  setHistorySearch(e.target.value);
                  setHistoryPage(1);
                }}
              />
            </div>

            {history.isLoading ? (
              <Skeleton className="mt-3 h-40 w-full" />
            ) : !history.data?.data.length ? (
              <div className="mt-3">
                <EmptyState title="Chưa có đánh giá nào khớp" />
              </div>
            ) : (
              <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
                {history.data.data.map((h) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      onClick={() => setOpenEval(h)}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm hover:bg-accent/50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">
                          {h.supplier.companyName}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          Kỳ {formatDate(h.periodStart)} – {formatDate(h.periodEnd)}
                          {' · '}
                          {h.evaluator.fullName}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <Badge tone={scoreTone(Number(h.totalScore))}>
                          {Number(h.totalScore)} điểm
                        </Badge>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
          {history.data ? (
            <Pagination
              page={historyPage}
              pageSize={HISTORY_PAGE_SIZE}
              total={history.data.meta.total}
              onPageChange={setHistoryPage}
            />
          ) : null}
        </Card>

        {openEval ? (
          <EvaluationDetail evaluation={openEval} onClose={() => setOpenEval(null)} />
        ) : null}
      </div>
    </div>
  );
}

/** Chi tiết một lần đánh giá, mở khi bấm vào dòng trong lịch sử. */
function EvaluationDetail({
  evaluation,
  onClose,
}: {
  evaluation: SupplierPerformance;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <button aria-label="Đóng" className="absolute inset-0" onClick={onClose} />
      <Card className="relative flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden">
        <CardHeader className="flex-row items-start justify-between gap-3 pb-3">
          <div className="min-w-0">
            <CardTitle className="truncate">{evaluation.supplier.companyName}</CardTitle>
            <CardDescription>
              Kỳ {formatDate(evaluation.periodStart)} – {formatDate(evaluation.periodEnd)}
              {' · '}
              {evaluation.evaluator.fullName}
            </CardDescription>
          </div>
          <Button variant="ghost" size="icon" aria-label="Đóng" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 space-y-3 overflow-y-auto">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge tone={scoreTone(Number(evaluation.totalScore))}>
              {Number(evaluation.totalScore)} điểm
            </Badge>
            <span className="text-muted-foreground">
              Tỷ lệ khiếu nại {Number(evaluation.complaintRate)}%
            </span>
          </div>

          {evaluation.scores?.length ? (
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="border-y border-border bg-muted/40 text-left">
                  <tr>
                    <th className="cell-head !px-3">Tiêu chí</th>
                    <th className="cell-head !px-3">Điểm</th>
                  </tr>
                </thead>
                <tbody>
                  {evaluation.scores.map((sc) => (
                    <tr key={sc.id} className="border-t border-border align-top">
                      <td className="cell !px-3">
                        <p className="font-medium">{sc.criteria.name}</p>
                        {sc.comment ? (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {sc.comment}
                          </p>
                        ) : (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            Không có nhận xét
                          </p>
                        )}
                      </td>
                      <td className="whitespace-nowrap cell !px-3 tabular-nums">
                        {sc.score}/{sc.criteria.maxScore}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {evaluation.note ? (
            <div>
              <p className="text-xs text-muted-foreground">Nhận xét chung cả kỳ</p>
              <p className="mt-0.5 whitespace-pre-wrap text-sm">{evaluation.note}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
