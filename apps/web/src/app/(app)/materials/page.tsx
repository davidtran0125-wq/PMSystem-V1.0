'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, History, Pencil, Plus, RotateCcw, Search, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  Badge,
  Button,
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
  StatusFilterBar,
  Textarea,
} from '@/components/ui';
import { ConfirmButton, ConfirmIconButton } from '@/components/confirm-button';
import { api, apiErrorMessage } from '@/lib/api';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import type {
  Category,
  Material,
  MaterialChangeRequest,
  MaterialChangeStatus,
  MaterialStatus,
  Paginated,
} from '@/lib/types';

type Tab = 'catalog' | 'requests';

interface MaterialForm {
  code: string;
  name: string;
  nameEn: string;
  unit: string;
  categoryId: string;
  specification: string;
  manufacturer: string;
  brand: string;
  hsCode: string;
  standardPrice: string;
  minStock: string;
  reason: string;
}

const STATUS_TONE: Record<MaterialStatus, 'success' | 'warning' | 'neutral'> = {
  ACTIVE: 'success',
  PENDING: 'warning',
  INACTIVE: 'neutral',
};
const STATUS_LABEL: Record<MaterialStatus, string> = {
  ACTIVE: 'Đang dùng',
  PENDING: 'Chờ duyệt',
  INACTIVE: 'Ngừng dùng',
};

const MATERIAL_STATUSES: { value: MaterialStatus | ''; label: string }[] = [
  { value: '', label: 'Tất cả trạng thái' },
  { value: 'ACTIVE', label: STATUS_LABEL.ACTIVE },
  { value: 'PENDING', label: STATUS_LABEL.PENDING },
  { value: 'INACTIVE', label: STATUS_LABEL.INACTIVE },
];

const CHANGE_STATUSES: { value: MaterialChangeStatus | ''; label: string }[] = [
  { value: '', label: 'Tất cả' },
  { value: 'PENDING', label: 'Đang chờ duyệt' },
  { value: 'APPROVED', label: 'Đã duyệt' },
  { value: 'REJECTED', label: 'Đã từ chối' },
  { value: 'CANCELLED', label: 'Đã rút lại' },
];

const CHANGE_LABEL = {
  CREATE: 'Tạo mã mới',
  UPDATE: 'Điều chỉnh',
  DELETE: 'Ngừng dùng',
} as const;

export default function MaterialsPage() {
  const queryClient = useQueryClient();
  const canWrite = useAuthStore((s) => s.can('material:write'));
  const canApprove = useAuthStore((s) => s.can('material:approve'));

  const [tab, setTab] = useState<Tab>('catalog');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [status, setStatus] = useState('');
  const [editing, setEditing] = useState<Material | null>(null);
  const [creating, setCreating] = useState(false);
  const [requestStatus, setRequestStatus] = useState('PENDING');
  const [requestPage, setRequestPage] = useState(1);
  const [requestPageSize, setRequestPageSize] = useState(10);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<MaterialForm>();

  /** Đếm theo trạng thái, không phụ thuộc trạng thái đang chọn. */
  const materialCounts = useQuery({
    queryKey: ['material-counts', { search }],
    queryFn: async () =>
      (
        await api.get<{ total: number; counts: Record<MaterialStatus, number> }>(
          '/materials/status-counts',
          { params: { ...(search ? { search } : {}) } },
        )
      ).data,
  });

  const materials = useQuery({
    queryKey: ['materials', { search, status, page, pageSize }],
    queryFn: async () =>
      (
        await api.get<Paginated<Material>>('/materials', {
          params: {
            page,
            pageSize,
            ...(search ? { search } : {}),
            ...(status ? { status } : {}),
          },
        })
      ).data,
  });

  const pending = useQuery({
    queryKey: [
      'material-change-requests',
      { requestStatus, requestPage, requestPageSize },
    ],
    queryFn: async () =>
      (
        await api.get<Paginated<MaterialChangeRequest>>('/materials/change-requests', {
          params: {
            page: requestPage,
            pageSize: requestPageSize,
            ...(requestStatus ? { status: requestStatus } : {}),
          },
        })
      ).data,
  });

  /** Đếm theo trạng thái, không phụ thuộc trạng thái đang chọn. */
  const requestCounts = useQuery({
    queryKey: ['material-change-request-counts'],
    queryFn: async () =>
      (
        await api.get<{
          total: number;
          counts: Record<MaterialChangeStatus, number>;
        }>('/materials/change-requests/status-counts')
      ).data,
  });
  const pendingCount = { data: requestCounts.data?.counts.PENDING };

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
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['materials'] });
    void queryClient.invalidateQueries({ queryKey: ['material-change-requests'] });
  };

  const openCreate = () => {
    setEditing(null);
    setCreating(true);
    reset({ code: '', name: '', unit: '', standardPrice: '', minStock: '' });
  };

  const openEdit = (m: Material) => {
    setCreating(false);
    setEditing(m);
    reset({
      code: m.code,
      name: m.name,
      nameEn: m.nameEn ?? '',
      unit: m.unit,
      categoryId: m.categoryId ?? '',
      specification: m.specification ?? '',
      manufacturer: m.manufacturer ?? '',
      brand: m.brand ?? '',
      hsCode: m.hsCode ?? '',
      standardPrice: m.standardPrice ? String(Number(m.standardPrice)) : '',
      minStock: m.minStock ? String(Number(m.minStock)) : '',
      reason: '',
    });
  };

  const closeForm = () => {
    setCreating(false);
    setEditing(null);
  };

  const submit = useMutation({
    mutationFn: async (v: MaterialForm) => {
      const body = {
        name: v.name,
        ...(v.nameEn ? { nameEn: v.nameEn } : {}),
        unit: v.unit,
        ...(v.categoryId ? { categoryId: v.categoryId } : {}),
        ...(v.specification ? { specification: v.specification } : {}),
        ...(v.manufacturer ? { manufacturer: v.manufacturer } : {}),
        ...(v.brand ? { brand: v.brand } : {}),
        ...(v.hsCode ? { hsCode: v.hsCode } : {}),
        ...(v.standardPrice ? { standardPrice: Number(v.standardPrice) } : {}),
        ...(v.minStock ? { minStock: Number(v.minStock) } : {}),
        ...(v.reason ? { reason: v.reason } : {}),
      };
      return editing
        ? api.patch(`/materials/${editing.id}`, body)
        : api.post('/materials', { ...body, ...(v.code ? { code: v.code } : {}) });
    },
    onSuccess: (res) => {
      const request = res.data as MaterialChangeRequest;
      toast.success(
        request.status === 'APPROVED'
          ? 'Đã áp dụng thay đổi'
          : 'Đã gửi đề xuất, chờ admin duyệt',
      );
      closeForm();
      invalidate();
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const remove = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) =>
      api.delete(`/materials/${id}`, { data: { reason } }),
    onSuccess: (res) => {
      const request = res.data as MaterialChangeRequest;
      toast.success(
        request.status === 'APPROVED'
          ? 'Đã ngừng dùng mã'
          : 'Đã gửi đề xuất ngừng dùng, chờ admin duyệt',
      );
      invalidate();
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const restore = useMutation({
    mutationFn: async (id: string) => api.post(`/materials/${id}/restore`, {}),
    onSuccess: () => {
      toast.success('Đã khôi phục mã');
      invalidate();
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const review = useMutation({
    mutationFn: async ({
      id,
      action,
      note,
    }: {
      id: string;
      action: 'approve' | 'reject' | 'cancel';
      note?: string;
    }) =>
      api.post(`/materials/change-requests/${id}/${action}`, note ? { note } : {}),
    onSuccess: (_res, v) => {
      toast.success(
        v.action === 'approve'
          ? 'Đã duyệt và áp dụng'
          : v.action === 'reject'
            ? 'Đã từ chối đề xuất'
            : 'Đã rút lại đề xuất',
      );
      invalidate();
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const showForm = creating || editing;

  return (
    <div>
      <PageHeader
        title="Danh mục vật tư"
        description="Mã vật tư dùng chung cho yêu cầu mua hàng, báo giá và đơn hàng. Mã mới do người dùng đề xuất và admin duyệt."
        actions={
          canWrite ? (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Đề xuất mã mới
            </Button>
          ) : null
        }
      />

      <div className="mb-5 flex gap-1 border-b border-border">
        {(
          [
            { key: 'catalog', label: 'Danh mục' },
            {
              key: 'requests',
              label: canApprove
                ? `Chờ duyệt (${pendingCount.data ?? 0})`
                : 'Đề xuất của tôi',
            },
          ] as const
        ).map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === key
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {showForm ? (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>
              {editing ? `Điều chỉnh mã ${editing.code}` : 'Đề xuất mã vật tư mới'}
            </CardTitle>
            <CardDescription>
              {canApprove
                ? 'Bạn có quyền duyệt nên thay đổi được áp dụng ngay và vẫn được ghi vào lịch sử.'
                : 'Đề xuất sẽ chuyển tới admin. Mã chỉ dùng được sau khi duyệt.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={handleSubmit((v) => submit.mutate(v))}
              className="grid gap-4 sm:grid-cols-3"
            >
              <div>
                <Label>Mã vật tư</Label>
                <Input
                  placeholder="Bỏ trống để hệ thống tự cấp"
                  disabled={Boolean(editing)}
                  {...register('code')}
                />
                <FieldError message={errors.code?.message} />
                {editing ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Mã đã ban hành không đổi được, vì đơn hàng cũ tham chiếu tới nó.
                  </p>
                ) : null}
              </div>
              <div>
                <Label required>Tên vật tư</Label>
                <Input {...register('name', { required: 'Bắt buộc' })} />
                <FieldError message={errors.name?.message} />
              </div>
              <div>
                <Label required>Đơn vị tính</Label>
                <Input placeholder="kg, cái, bộ…" {...register('unit', { required: 'Bắt buộc' })} />
                <FieldError message={errors.unit?.message} />
              </div>
              <div>
                <Label>Tên tiếng Anh</Label>
                <Input {...register('nameEn')} />
              </div>
              <div>
                <Label>Lĩnh vực</Label>
                <Select {...register('categoryId')}>
                  <option value="">— Không chọn —</option>
                  {categories.data?.data.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Mã HS</Label>
                <Input {...register('hsCode')} />
              </div>
              <div className="sm:col-span-3">
                <Label>Quy cách</Label>
                <Textarea rows={2} {...register('specification')} />
              </div>
              <div>
                <Label>Hãng sản xuất</Label>
                <Input {...register('manufacturer')} />
              </div>
              <div>
                <Label>Giá tham chiếu</Label>
                <Input type="number" step="any" min="0" {...register('standardPrice')} />
              </div>
              <div>
                <Label>Tồn tối thiểu</Label>
                <Input type="number" step="any" min="0" {...register('minStock')} />
              </div>
              <div className="sm:col-span-3">
                <Label>Lý do đề xuất</Label>
                <Textarea
                  rows={2}
                  placeholder="Giúp người duyệt hiểu vì sao cần mã này."
                  {...register('reason')}
                />
              </div>
              <div className="flex justify-end gap-2 sm:col-span-3">
                <Button type="button" variant="outline" onClick={closeForm}>
                  Hủy
                </Button>
                <Button type="submit" disabled={submit.isPending}>
                  {editing ? 'Gửi đề xuất điều chỉnh' : 'Gửi đề xuất'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {tab === 'catalog' ? (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="relative min-w-56 flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Tìm theo mã, tên hoặc quy cách…"
                value={search}
                onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
              />
            </div>
          </div>

          <StatusFilterBar
            options={MATERIAL_STATUSES}
            value={status}
            onChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
            counts={materialCounts.data?.counts}
            total={materialCounts.data?.total}
            isLoading={materialCounts.isLoading}
          />

          {materials.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : !materials.data?.data.length ? (
            <EmptyState
              title="Chưa có mã vật tư nào"
              description="Đề xuất mã mới để bắt đầu xây dựng danh mục."
            />
          ) : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-y border-border bg-muted/40 text-left">
                    <tr>
                      <th className="cell-head">Mã</th>
                      <th className="cell-head">Tên vật tư</th>
                      <th className="cell-head">ĐVT</th>
                      <th className="cell-head">Lĩnh vực</th>
                      <th className="cell-head">Giá tham chiếu</th>
                      <th className="cell-head">Trạng thái</th>
                      <th className="cell-head" />
                    </tr>
                  </thead>
                  <tbody>
                    {materials.data.data.map((m) => (
                      <tr
                        key={m.id}
                        className="border-b border-border last:border-0 hover:bg-accent/50"
                      >
                        <td className="cell font-mono text-xs font-medium">{m.code}</td>
                        <td className="cell">
                          <p className="font-medium">{m.name}</p>
                          {m.specification ? (
                            <p className="max-w-md truncate text-xs text-muted-foreground">
                              {m.specification}
                            </p>
                          ) : null}
                        </td>
                        <td className="cell text-muted-foreground">{m.unit}</td>
                        <td className="cell text-muted-foreground">
                          {m.category?.name ?? '—'}
                        </td>
                        <td className="cell tabular-nums">
                          {m.standardPrice
                            ? formatCurrency(m.standardPrice, m.currency)
                            : '—'}
                        </td>
                        <td className="cell">
                          <Badge tone={STATUS_TONE[m.status]}>{STATUS_LABEL[m.status]}</Badge>
                        </td>
                        <td className="cell">
                          <div className="flex justify-end gap-1">
                            <Link href={`/materials/${m.id}`} title="Lịch sử đặt hàng">
                              <Button variant="ghost" size="sm">
                                <History className="h-4 w-4" />
                              </Button>
                            </Link>
                            {canWrite && m.status !== 'INACTIVE' ? (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  title="Điều chỉnh"
                                  onClick={() => openEdit(m)}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <ConfirmIconButton
                                  title="Ngừng dùng"
                                  disabled={remove.isPending}
                                  onConfirm={() => {
                                    const reason = prompt(
                                      `Lý do ngừng dùng mã ${m.code}?`,
                                    );
                                    if (reason !== null) remove.mutate({ id: m.id, reason });
                                  }}
                                >
                                  <Trash2 className="h-4 w-4 text-red-600" />
                                </ConfirmIconButton>
                              </>
                            ) : null}
                            {canWrite && m.status === 'INACTIVE' ? (
                              <ConfirmIconButton
                                title="Khôi phục"
                                disabled={restore.isPending}
                                onConfirm={() => restore.mutate(m.id)}
                              >
                                <RotateCcw className="h-4 w-4" />
                              </ConfirmIconButton>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
          <Pagination
                page={page}
                pageSize={pageSize}
                total={materials.data.meta.total}
                onPageChange={setPage}
                onPageSizeChange={(n) => {
                  setPageSize(n);
                  setPage(1);
                }}
              />
            </Card>
          )}
        </>
      ) : (
        <>
          <StatusFilterBar
            options={CHANGE_STATUSES}
            value={requestStatus}
            onChange={(v) => {
              setRequestStatus(v);
              setRequestPage(1);
            }}
            counts={requestCounts.data?.counts}
            total={requestCounts.data?.total}
            isLoading={requestCounts.isLoading}
          />
          <ChangeRequestList
            data={pending.data?.data ?? []}
            isLoading={pending.isLoading}
            canApprove={canApprove}
            pending={review.isPending}
            onReview={(id, action, note) => review.mutate({ id, action, note })}
          />
          {pending.data?.data.length ? (
            <Card className="mt-3">
              <Pagination
                page={pending.data.meta.page}
                pageSize={pending.data.meta.pageSize}
                total={pending.data.meta.total}
                onPageChange={setRequestPage}
                onPageSizeChange={(size) => {
                  setRequestPageSize(size);
                  setRequestPage(1);
                }}
              />
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}

function ChangeRequestList({
  data,
  isLoading,
  canApprove,
  pending,
  onReview,
}: {
  data: MaterialChangeRequest[];
  isLoading: boolean;
  canApprove: boolean;
  pending: boolean;
  onReview: (id: string, action: 'approve' | 'reject' | 'cancel', note?: string) => void;
}) {
  if (isLoading) return <Skeleton className="h-48 w-full" />;
  if (!data.length) {
    return (
      <EmptyState
        title="Không có đề xuất nào"
        description={
          canApprove
            ? 'Khi người dùng đề xuất mã mới hoặc điều chỉnh, đề xuất sẽ hiện ở đây.'
            : 'Đề xuất bạn gửi đi sẽ hiện ở đây kèm kết quả duyệt.'
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      {data.map((r) => (
        <Card key={r.id}>
          <CardContent className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    tone={
                      r.type === 'DELETE' ? 'danger' : r.type === 'CREATE' ? 'info' : 'neutral'
                    }
                  >
                    {CHANGE_LABEL[r.type]}
                  </Badge>
                  <span className="font-mono text-xs font-medium">
                    {r.material?.code ?? '—'}
                  </span>
                  <span className="text-sm">{r.material?.name}</span>
                  <Badge
                    tone={
                      r.status === 'APPROVED'
                        ? 'success'
                        : r.status === 'REJECTED'
                          ? 'danger'
                          : r.status === 'CANCELLED'
                            ? 'neutral'
                            : 'warning'
                    }
                  >
                    {r.status === 'APPROVED'
                      ? 'Đã duyệt'
                      : r.status === 'REJECTED'
                        ? 'Từ chối'
                        : r.status === 'CANCELLED'
                          ? 'Đã rút lại'
                          : 'Chờ duyệt'}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {r.requestedBy.fullName} đề xuất lúc {formatDateTime(r.createdAt)}
                  {r.reviewedBy
                    ? ` · ${r.reviewedBy.fullName} xử lý ${formatDateTime(r.reviewedAt)}`
                    : ''}
                </p>
                {r.reason ? <p className="mt-1 text-sm">Lý do: {r.reason}</p> : null}
                {r.reviewNote ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    Ghi chú duyệt: {r.reviewNote}
                  </p>
                ) : null}

                {r.payload ? <ChangeDiff payload={r.payload} snapshot={r.snapshot} /> : null}
              </div>

              {r.status === 'PENDING' ? (
                <div className="flex gap-2">
                  {canApprove ? (
                    <>
                      <ConfirmButton
                        size="sm"
                        confirmLabel="Duyệt và áp dụng thay đổi?"
                        confirmActionLabel="Duyệt"
                        disabled={pending}
                        onConfirm={() => onReview(r.id, 'approve')}
                      >
                        <Check className="h-4 w-4" />
                        Duyệt
                      </ConfirmButton>
                      <ConfirmButton
                        size="sm"
                        variant="outline"
                        confirmLabel="Từ chối đề xuất này?"
                        confirmActionLabel="Từ chối"
                        disabled={pending}
                        onConfirm={() => {
                          const note = prompt('Lý do từ chối?');
                          if (note) onReview(r.id, 'reject', note);
                        }}
                      >
                        <X className="h-4 w-4" />
                        Từ chối
                      </ConfirmButton>
                    </>
                  ) : (
                    <ConfirmButton
                      size="sm"
                      variant="outline"
                      confirmLabel="Rút lại đề xuất?"
                      confirmActionLabel="Rút lại"
                      disabled={pending}
                      onConfirm={() => onReview(r.id, 'cancel')}
                    >
                      Rút lại
                    </ConfirmButton>
                  )}
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/** Chỉ liệt kê những trường thực sự đổi, kèm giá trị cũ để người duyệt đối chiếu. */
function ChangeDiff({
  payload,
  snapshot,
}: {
  payload: Record<string, string | number | null>;
  snapshot: Record<string, string | number | null> | null;
}) {
  const rows = Object.entries(payload).filter(
    ([key, value]) => String(snapshot?.[key] ?? '') !== String(value ?? ''),
  );
  if (!rows.length) return null;

  return (
    <table className="mt-2 text-xs">
      <tbody>
        {rows.map(([key, value]) => (
          <tr key={key}>
            <td className="py-0.5 pr-3 text-muted-foreground">{key}</td>
            <td className="py-0.5 pr-2 text-muted-foreground line-through">
              {snapshot?.[key] === null || snapshot?.[key] === undefined
                ? '—'
                : String(snapshot[key])}
            </td>
            <td className="py-0.5 font-medium">{value === null ? '—' : String(value)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
