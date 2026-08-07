'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Paperclip, Plus, Search } from 'lucide-react';
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
  Pagination,
  Select,
  StatusFilterBar,
  Skeleton,
  Textarea,
} from '@/components/ui';
import { ContractStatusBadge, DaysRemaining } from '@/components/status-badge';
import { AiFinding, AiList, AiPanel, useAiStatus } from '@/components/ai-panel';
import { Attachments } from '@/components/attachments';
import { api, apiErrorMessage } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import type {
  Category,
  Contract,
  ContractReview,
  ContractStatus,
  Paginated,
  Supplier,
} from '@/lib/types';

interface FormValues {
  contractNumber: string;
  title: string;
  supplierId: string;
  categoryId: string;
  startDate: string;
  endDate: string;
  contractValue: string;
  currency: string;
  renewalOption: boolean;
  note: string;
}

const CONTRACT_STATUSES: { value: ContractStatus | ''; label: string }[] = [
  { value: '', label: 'Tất cả trạng thái' },
  { value: 'DRAFT', label: 'Nháp' },
  { value: 'ACTIVE', label: 'Đang hiệu lực' },
  { value: 'EXPIRING', label: 'Sắp hết hạn' },
  { value: 'EXPIRED', label: 'Đã hết hạn' },
  { value: 'TERMINATED', label: 'Đã chấm dứt' },
  { value: 'RENEWED', label: 'Đã gia hạn' },
];

export default function ContractsPage() {
  const queryClient = useQueryClient();
  const canWrite = useAuthStore((s) => s.can('contract:write'));

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [status, setStatus] = useState('');
  const [expiringOnly, setExpiringOnly] = useState(false);
  const [creating, setCreating] = useState(false);
  const [reviewing, setReviewing] = useState<Contract | null>(null);
  const [docsFor, setDocsFor] = useState<Contract | null>(null);
  const ai = useAiStatus();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    defaultValues: { currency: 'VND', renewalOption: false },
  });

  /** Đếm theo trạng thái, không phụ thuộc trạng thái đang chọn. */
  const counts = useQuery({
    queryKey: ['contract-counts', { search, expiringOnly }],
    queryFn: async () =>
      (
        await api.get<{ total: number; counts: Record<ContractStatus, number> }>(
          '/contracts/status-counts',
          {
            params: {
              ...(search ? { search } : {}),
              ...(expiringOnly ? { expiringOnly: true } : {}),
            },
          },
        )
      ).data,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['contracts', { search, status, expiringOnly, page, pageSize }],
    queryFn: async () =>
      (
        await api.get<Paginated<Contract>>('/contracts', {
          params: {
                        page,
            pageSize,
            ...(search ? { search } : {}),
            ...(status ? { status } : {}),
            ...(expiringOnly ? { expiringOnly: true } : {}),
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

  const categories = useQuery({
    queryKey: ['categories', 'active'],
    // Danh mục tham chiếu gần như không đổi trong một phiên làm việc.
    staleTime: 10 * 60_000,
    queryFn: async () =>
      (
        await api.get<Paginated<Category>>('/categories', {
          params: { pageSize: 100, activeOnly: true },
        })
      ).data,
    enabled: creating,
  });

  const create = useMutation({
    mutationFn: async (values: FormValues) =>
      api.post('/contracts', {
        contractNumber: values.contractNumber,
        title: values.title,
        supplierId: values.supplierId,
        ...(values.categoryId ? { categoryId: values.categoryId } : {}),
        startDate: new Date(values.startDate).toISOString(),
        endDate: new Date(values.endDate).toISOString(),
        contractValue: Number(values.contractValue),
        currency: values.currency || 'VND',
        renewalOption: values.renewalOption,
        ...(values.note ? { note: values.note } : {}),
      }),
    onSuccess: () => {
      toast.success('Đã tạo hợp đồng');
      setCreating(false);
      reset({ currency: 'VND', renewalOption: false });
      void queryClient.invalidateQueries({ queryKey: ['contracts'] });
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  return (
    <div>
      <PageHeader
        title="Hợp đồng"
        description="Theo dõi hiệu lực hợp đồng, hệ thống tự nhắc trước 90/60/30/15/7/1 ngày."
        actions={
          canWrite ? (
            <Button onClick={() => setCreating((v) => !v)}>
              <Plus className="h-4 w-4" />
              Thêm hợp đồng
            </Button>
          ) : null
        }
      />

      {creating ? (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>Hợp đồng mới</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={handleSubmit((v) => create.mutate(v))}
              className="grid gap-4 sm:grid-cols-2"
            >
              <div>
                <Label required>Số hợp đồng</Label>
                <Input
                  placeholder="HD-2026-001"
                  {...register('contractNumber', { required: 'Bắt buộc' })}
                />
                <FieldError message={errors.contractNumber?.message} />
              </div>
              <div>
                <Label required>Tên hợp đồng</Label>
                <Input {...register('title', { required: 'Bắt buộc' })} />
                <FieldError message={errors.title?.message} />
              </div>
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
                <Label>Lĩnh vực</Label>
                <Select {...register('categoryId')}>
                  <option value="">— Không chọn —</option>
                  {categories.data?.data.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nameEn ?? c.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label required>Ngày bắt đầu</Label>
                <Input
                  type="date"
                  {...register('startDate', { required: 'Bắt buộc' })}
                />
                <FieldError message={errors.startDate?.message} />
              </div>
              <div>
                <Label required>Ngày kết thúc</Label>
                <Input
                  type="date"
                  {...register('endDate', { required: 'Bắt buộc' })}
                />
                <FieldError message={errors.endDate?.message} />
              </div>
              <div>
                <Label required>Giá trị hợp đồng</Label>
                <Input
                  type="number"
                  step="any"
                  {...register('contractValue', { required: 'Bắt buộc' })}
                />
                <FieldError message={errors.contractValue?.message} />
              </div>
              <div>
                <Label>Tiền tệ</Label>
                <Input {...register('currency')} />
              </div>
              <div className="sm:col-span-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-input"
                    {...register('renewalOption')}
                  />
                  Có điều khoản gia hạn
                </label>
              </div>
              <div className="sm:col-span-2">
                <Label>Ghi chú</Label>
                <Textarea {...register('note')} />
              </div>
              <div className="flex justify-end gap-2 sm:col-span-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCreating(false)}
                >
                  Hủy
                </Button>
                <Button type="submit" disabled={isSubmitting || create.isPending}>
                  Lưu hợp đồng
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Tìm theo số hoặc tên hợp đồng…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-input"
            checked={expiringOnly}
            onChange={(e) => setExpiringOnly(e.target.checked)}
          />
          Sắp hết hạn trong 90 ngày
        </label>
      </div>

      <StatusFilterBar
        options={CONTRACT_STATUSES}
        value={status}
        onChange={(v) => {
          setStatus(v);
          setPage(1);
        }}
        counts={counts.data?.counts}
        total={counts.data?.total}
        isLoading={counts.isLoading}
      />

      {reviewing ? (
        <div className="mb-4">
          <AiPanel<ContractReview>
            key={reviewing.id}
            title={`Rà soát hợp đồng ${reviewing.contractNumber}`}
            description="Phát hiện điều khoản bất lợi cho bên mua và điều khoản tiêu chuẩn còn thiếu."
            buttonLabel="Rà soát bằng AI"
            endpoint={`/ai/contracts/${reviewing.id}/review`}
          >
            {(r) => (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm">Mức rủi ro:</span>
                  <Badge
                    tone={
                      r.riskLevel === 'cao'
                        ? 'danger'
                        : r.riskLevel === 'trung_bình'
                          ? 'warning'
                          : 'success'
                    }
                  >
                    {r.riskLevel.replace(/_/g, ' ')}
                  </Badge>
                </div>
                <p className="text-sm">{r.summary}</p>

                {r.findings.length ? (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      Điều khoản cần lưu ý
                    </p>
                    {r.findings.map((f, i) => (
                      <AiFinding
                        key={i}
                        title={f.clause}
                        body={f.finding}
                        severity={f.severity}
                        extra={`Đề xuất: ${f.suggestion}`}
                      />
                    ))}
                  </div>
                ) : null}

                {r.missingClauses.length ? (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      Điều khoản còn thiếu
                    </p>
                    {r.missingClauses.map((m, i) => (
                      <AiFinding key={i} title={m.clause} body={m.why} />
                    ))}
                  </div>
                ) : null}

                <AiList
                  label="Mốc thời gian cần theo dõi"
                  items={r.keyDates.map((d) => `${d.label} (${d.date}): ${d.note}`)}
                />
              </div>
            )}
          </AiPanel>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2"
            onClick={() => setReviewing(null)}
          >
            Đóng rà soát
          </Button>
        </div>
      ) : null}

      {docsFor ? (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>Tài liệu hợp đồng {docsFor.contractNumber}</CardTitle>
          </CardHeader>
          <CardContent>
            <Attachments
              key={docsFor.id}
              target="CONTRACT"
              entityId={docsFor.id}
              canWrite={canWrite}
              documentTypes={['Bản gốc', 'Phụ lục', 'Bản scan có dấu', 'Biên bản']}
              emptyHint="Chưa đính kèm file hợp đồng nào."
            />
          </CardContent>
        </Card>
      ) : null}

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : !data?.data.length ? (
        <EmptyState
          title="Chưa có hợp đồng nào"
          description="Thêm hợp đồng để hệ thống theo dõi hiệu lực và tự nhắc trước khi hết hạn."
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-y border-border bg-muted/40 text-left">
                <tr>
                  <th className="cell-head">Số hợp đồng</th>
                  <th className="cell-head">Tên</th>
                  <th className="cell-head">Nhà cung cấp</th>
                  <th className="cell-head">Hiệu lực</th>
                  <th className="cell-head">Còn lại</th>
                  <th className="cell-head">Giá trị</th>
                  <th className="cell-head">Trạng thái</th>
                  <th className="cell-head">Tài liệu</th>
                  {ai.data?.enabled ? <th className="cell-head" /> : null}
                </tr>
              </thead>
              <tbody>
                {data.data.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-border last:border-0 hover:bg-accent/50"
                  >
                    <td className="cell font-medium">{c.contractNumber}</td>
                    <td className="max-w-56 truncate cell">{c.title}</td>
                    <td className="cell text-muted-foreground">
                      {c.supplier.companyName}
                    </td>
                    <td className="cell text-muted-foreground">
                      {formatDate(c.startDate)} – {formatDate(c.endDate)}
                    </td>
                    <td className="cell">
                      <DaysRemaining days={c.daysRemaining} />
                    </td>
                    <td className="cell tabular-nums">
                      {formatCurrency(c.contractValue, c.currency)}
                    </td>
                    <td className="cell">
                      <ContractStatusBadge status={c.status} />
                    </td>
                    <td className="cell">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDocsFor((v) => (v?.id === c.id ? null : c))}
                      >
                        <Paperclip className="h-4 w-4" />
                        {docsFor?.id === c.id ? 'Đóng' : 'Tài liệu'}
                      </Button>
                    </td>
                    {ai.data?.enabled ? (
                      <td className="cell">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setReviewing(c)}
                        >
                          Rà soát AI
                        </Button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={page}
            pageSize={pageSize}
            total={data.meta.total}
            onPageChange={setPage}
            onPageSizeChange={(n) => {
              setPageSize(n);
              setPage(1);
            }}
          />
        </Card>
      )}
    </div>
  );
}
