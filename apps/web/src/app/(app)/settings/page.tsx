'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Building2,
  CheckCircle2,
  Pencil,
  Plus,
  GitBranch,
  Sliders,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  FieldError,
  Input,
  Label,
  PageHeader,
  Skeleton,
  Textarea,
} from '@/components/ui';
import { ConfirmIconButton } from '@/components/confirm-button';
import { WorkflowsTab } from './approval-workflows';
import { api, apiErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import type { CompanyProfile, CriteriaSummary, EvaluationCriteria } from '@/lib/types';

type Tab = 'company' | 'criteria' | 'workflows';

export default function SettingsPage() {
  const canWrite = useAuthStore((s) => s.can('setting:write'));
  const [tab, setTab] = useState<Tab>('company');

  return (
    <div>
      <PageHeader
        title="Thiết lập"
        description="Thông tin công ty in trên đơn hàng, bộ tiêu chí chấm điểm nhà cung cấp và các luồng duyệt theo hạn mức."
      />

      {!canWrite ? (
        <p className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Tài khoản của bạn chỉ xem được thiết lập. Cần quyền <code>setting:write</code> để thay đổi.
        </p>
      ) : null}

      <div className="mb-5 flex gap-1 border-b border-border">
        {(
          [
            { key: 'company', label: 'Thông tin công ty', icon: Building2 },
            { key: 'criteria', label: 'Tiêu chí đánh giá NCC', icon: Sliders },
            { key: 'workflows', label: 'Luồng duyệt & hạn mức', icon: GitBranch },
          ] as const
        ).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === key
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'company' ? (
        <CompanyTab canWrite={canWrite} />
      ) : tab === 'criteria' ? (
        <CriteriaTab canWrite={canWrite} />
      ) : (
        <WorkflowsTab canWrite={canWrite} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Thông tin công ty
// ---------------------------------------------------------------------------

const COMPANY_FIELDS: { key: keyof CompanyProfile; label: string; hint?: string }[] = [
  { key: 'name', label: 'Tên công ty' },
  { key: 'taxCode', label: 'Mã số thuế' },
  { key: 'address', label: 'Địa chỉ' },
  { key: 'phone', label: 'Điện thoại' },
  { key: 'email', label: 'Email' },
  { key: 'website', label: 'Website' },
  { key: 'representative', label: 'Người đại diện' },
  { key: 'representativeTitle', label: 'Chức danh người đại diện' },
  { key: 'bankName', label: 'Ngân hàng' },
  { key: 'bankAccount', label: 'Số tài khoản' },
];

function CompanyTab({ canWrite }: { canWrite: boolean }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['settings', 'company'],
    queryFn: async () => (await api.get<CompanyProfile>('/settings/company')).data,
  });

  const { register, handleSubmit, reset, formState } = useForm<CompanyProfile>();

  useEffect(() => {
    if (data) reset(data);
  }, [data, reset]);

  const save = useMutation({
    mutationFn: async (values: CompanyProfile) => api.patch('/settings/company', values),
    onSuccess: () => {
      toast.success('Đã lưu thông tin công ty. Đơn hàng xuất PDF sẽ dùng thông tin mới.');
      void queryClient.invalidateQueries({ queryKey: ['settings', 'company'] });
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  if (isLoading) return <Skeleton className="h-96 w-full" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Thông tin in trên đơn hàng</CardTitle>
        <CardDescription>
          Các thông tin này xuất hiện ở phần đầu và phần chữ ký của file PDF đơn hàng.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={handleSubmit((v) => save.mutate(v))}
          className="grid gap-4 sm:grid-cols-2"
        >
          {COMPANY_FIELDS.map((f) => (
            <div key={f.key} className={f.key === 'address' ? 'sm:col-span-2' : undefined}>
              <Label>{f.label}</Label>
              <Input disabled={!canWrite} {...register(f.key)} />
            </div>
          ))}
          <div className="sm:col-span-2">
            <Label>Ghi chú cuối đơn hàng</Label>
            <Textarea
              rows={3}
              disabled={!canWrite}
              placeholder="Ví dụ: Đơn hàng có hiệu lực khi có chữ ký và đóng dấu của hai bên."
              {...register('poFooterNote')}
            />
          </div>
          {canWrite ? (
            <div className="flex justify-end gap-2 sm:col-span-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => data && reset(data)}
                disabled={!formState.isDirty}
              >
                Hoàn tác
              </Button>
              <Button type="submit" disabled={save.isPending}>
                Lưu thông tin
              </Button>
            </div>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Tiêu chí đánh giá
// ---------------------------------------------------------------------------

interface CriteriaForm {
  name: string;
  description: string;
  weight: string;
  maxScore: string;
}

function CriteriaTab({ canWrite }: { canWrite: boolean }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<EvaluationCriteria | null>(null);
  const [adding, setAdding] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['settings', 'criteria'],
    queryFn: async () =>
      (await api.get<CriteriaSummary>('/settings/evaluation-criteria')).data,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['settings', 'criteria'] });
    void queryClient.invalidateQueries({ queryKey: ['evaluation-criteria'] });
  };

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CriteriaForm>({ defaultValues: { weight: '10', maxScore: '5' } });

  useEffect(() => {
    if (editing) {
      reset({
        name: editing.name,
        description: editing.description ?? '',
        weight: String(Number(editing.weight)),
        maxScore: String(editing.maxScore),
      });
    } else {
      reset({ name: '', description: '', weight: '10', maxScore: '5' });
    }
  }, [editing, reset]);

  const save = useMutation({
    mutationFn: async (values: CriteriaForm) => {
      const body = {
        name: values.name,
        description: values.description || undefined,
        weight: Number(values.weight),
        maxScore: Number(values.maxScore),
      };
      return editing
        ? api.patch(`/settings/evaluation-criteria/${editing.id}`, body)
        : api.post('/settings/evaluation-criteria', body);
    },
    onSuccess: () => {
      toast.success(editing ? 'Đã cập nhật tiêu chí' : 'Đã thêm tiêu chí');
      setEditing(null);
      setAdding(false);
      invalidate();
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const remove = useMutation({
    mutationFn: async (id: string) =>
      (await api.delete<{ deactivated: boolean }>(`/settings/evaluation-criteria/${id}`)).data,
    onSuccess: (res) => {
      toast.success(
        res.deactivated
          ? 'Tiêu chí đã dùng trong đánh giá cũ nên chỉ được tắt, không xóa hẳn.'
          : 'Đã xóa tiêu chí',
      );
      invalidate();
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const reorder = useMutation({
    mutationFn: async (ids: string[]) =>
      api.patch('/settings/evaluation-criteria/reorder', { ids }),
    onSuccess: invalidate,
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  function move(index: number, delta: number) {
    const list = data?.criteria ?? [];
    const target = index + delta;
    if (target < 0 || target >= list.length) return;
    const ids = list.map((c) => c.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    reorder.mutate(ids);
  }

  if (isLoading) return <Skeleton className="h-80 w-full" />;

  const list = data?.criteria ?? [];
  const showForm = adding || editing;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>Bộ tiêu chí chấm điểm</CardTitle>
            <CardDescription>
              Điểm tổng được quy về thang 100 theo trọng số, nên tổng trọng số không bắt buộc
              bằng 100 — nhưng để 100 thì dễ đọc hơn.
            </CardDescription>
          </div>
          {canWrite ? (
            <Button
              onClick={() => {
                setEditing(null);
                setAdding((v) => !v);
              }}
            >
              <Plus className="h-4 w-4" />
              Thêm tiêu chí
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          <div
            className={`mb-4 flex items-center gap-2 rounded-lg px-4 py-3 text-sm ${
              data?.balanced
                ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200'
                : 'bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200'
            }`}
          >
            {data?.balanced ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0" />
            )}
            Tổng trọng số hiện tại: <strong>{data?.totalWeight}</strong>
            {data?.balanced ? ' — cân đối.' : ' — khác 100, điểm vẫn được chuẩn hóa về thang 100.'}
          </div>

          {!list.length ? (
            <p className="text-sm text-muted-foreground">Chưa có tiêu chí nào đang bật.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-y border-border bg-muted/40 text-left">
                  <tr>
                    <th className="cell-head">Tiêu chí</th>
                    <th className="cell-head">Trọng số</th>
                    <th className="cell-head">Thang điểm</th>
                    <th className="cell-head">Nguồn</th>
                    {canWrite ? <th className="cell-head">Thứ tự</th> : null}
                    {canWrite ? <th className="cell-head" /> : null}
                  </tr>
                </thead>
                <tbody>
                  {list.map((c, i) => (
                    <tr key={c.id} className="border-b border-border last:border-0">
                      <td className="cell">
                        <p className="font-medium">{c.name}</p>
                        {c.description ? (
                          <p className="text-xs text-muted-foreground">{c.description}</p>
                        ) : null}
                      </td>
                      <td className="cell tabular-nums">{Number(c.weight)}</td>
                      <td className="cell tabular-nums">0 – {c.maxScore}</td>
                      <td className="cell">
                        {c.isSystem ? (
                          <Badge>Mặc định</Badge>
                        ) : (
                          <Badge tone="info">Tự tạo</Badge>
                        )}
                      </td>
                      {canWrite ? (
                        <td className="cell">
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={i === 0 || reorder.isPending}
                              onClick={() => move(i, -1)}
                            >
                              <ArrowUp className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={i === list.length - 1 || reorder.isPending}
                              onClick={() => move(i, 1)}
                            >
                              <ArrowDown className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      ) : null}
                      {canWrite ? (
                        <td className="cell">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setAdding(false);
                                setEditing(c);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <ConfirmIconButton
                              title={`Xóa tiêu chí ${c.name}`}
                              disabled={remove.isPending}
                              onConfirm={() => remove.mutate(c.id)}
                            >
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </ConfirmIconButton>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {showForm && canWrite ? (
        <Card>
          <CardHeader>
            <CardTitle>{editing ? `Sửa tiêu chí: ${editing.name}` : 'Tiêu chí mới'}</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={handleSubmit((v) => save.mutate(v))}
              className="grid gap-4 sm:grid-cols-2"
            >
              <div className="sm:col-span-2">
                <Label required>Tên tiêu chí</Label>
                <Input
                  placeholder="Ví dụ: Tuân thủ ESG"
                  {...register('name', { required: 'Bắt buộc' })}
                />
                <FieldError message={errors.name?.message} />
              </div>
              <div className="sm:col-span-2">
                <Label>Mô tả</Label>
                <Textarea
                  rows={2}
                  placeholder="Người chấm điểm sẽ đọc mô tả này khi đánh giá."
                  {...register('description')}
                />
              </div>
              <div>
                <Label required>Trọng số</Label>
                <Input
                  type="number"
                  step="any"
                  min="0"
                  {...register('weight', { required: 'Bắt buộc' })}
                />
                <FieldError message={errors.weight?.message} />
              </div>
              <div>
                <Label required>Điểm tối đa</Label>
                <Input
                  type="number"
                  min="1"
                  max="100"
                  {...register('maxScore', { required: 'Bắt buộc' })}
                />
                <FieldError message={errors.maxScore?.message} />
              </div>
              <div className="flex justify-end gap-2 sm:col-span-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditing(null);
                    setAdding(false);
                  }}
                >
                  Hủy
                </Button>
                <Button type="submit" disabled={save.isPending}>
                  {editing ? 'Lưu thay đổi' : 'Thêm tiêu chí'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
