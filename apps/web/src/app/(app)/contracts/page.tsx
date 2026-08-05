'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
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
import { ContractStatusBadge, DaysRemaining } from '@/components/status-badge';
import { AiFinding, AiList, AiPanel, useAiStatus } from '@/components/ai-panel';
import { api, apiErrorMessage } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import type {
  Category,
  Contract,
  ContractReview,
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

export default function ContractsPage() {
  const queryClient = useQueryClient();
  const canWrite = useAuthStore((s) => s.can('contract:write'));

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [expiringOnly, setExpiringOnly] = useState(false);
  const [creating, setCreating] = useState(false);
  const [reviewing, setReviewing] = useState<Contract | null>(null);
  const ai = useAiStatus();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    defaultValues: { currency: 'VND', renewalOption: false },
  });

  const { data, isLoading } = useQuery({
    queryKey: ['contracts', { search, status, expiringOnly }],
    queryFn: async () =>
      (
        await api.get<Paginated<Contract>>('/contracts', {
          params: {
            pageSize: 50,
            ...(search ? { search } : {}),
            ...(status ? { status } : {}),
            ...(expiringOnly ? { expiringOnly: true } : {}),
          },
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

  const categories = useQuery({
    queryKey: ['categories', 'active'],
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
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          className="w-52"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">Tất cả trạng thái</option>
          <option value="ACTIVE">Đang hiệu lực</option>
          <option value="EXPIRING">Sắp hết hạn</option>
          <option value="EXPIRED">Đã hết hạn</option>
          <option value="TERMINATED">Đã chấm dứt</option>
        </Select>
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
              <thead className="border-b border-border bg-muted/50 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">Số hợp đồng</th>
                  <th className="px-4 py-3 font-medium">Tên</th>
                  <th className="px-4 py-3 font-medium">Nhà cung cấp</th>
                  <th className="px-4 py-3 font-medium">Hiệu lực</th>
                  <th className="px-4 py-3 font-medium">Còn lại</th>
                  <th className="px-4 py-3 font-medium">Giá trị</th>
                  <th className="px-4 py-3 font-medium">Trạng thái</th>
                  {ai.data?.enabled ? <th className="px-4 py-3 font-medium" /> : null}
                </tr>
              </thead>
              <tbody>
                {data.data.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-border last:border-0 hover:bg-accent/50"
                  >
                    <td className="px-4 py-3 font-medium">{c.contractNumber}</td>
                    <td className="max-w-56 truncate px-4 py-3">{c.title}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {c.supplier.companyName}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(c.startDate)} – {formatDate(c.endDate)}
                    </td>
                    <td className="px-4 py-3">
                      <DaysRemaining days={c.daysRemaining} />
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {formatCurrency(c.contractValue, c.currency)}
                    </td>
                    <td className="px-4 py-3">
                      <ContractStatusBadge status={c.status} />
                    </td>
                    {ai.data?.enabled ? (
                      <td className="px-4 py-3">
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
        </Card>
      )}
    </div>
  );
}
