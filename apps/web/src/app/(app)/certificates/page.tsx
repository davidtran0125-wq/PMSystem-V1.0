'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Paperclip, Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import {
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
  Skeleton,
  StatusFilterBar,
} from '@/components/ui';
import { CertificateStatusBadge, DaysRemaining } from '@/components/status-badge';
import { Attachments } from '@/components/attachments';
import { api, apiErrorMessage } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import type {
  Certificate,
  CertificateStatus,
  Paginated,
  Supplier,
} from '@/lib/types';

const COMMON_TYPES = [
  'ISO',
  'FSC',
  'BSCI',
  'ESG',
  'GMP',
  'HACCP',
  'Halal',
  'Kosher',
  'MSDS',
  'COA',
];

interface FormValues {
  name: string;
  type: string;
  supplierId: string;
  issuedBy: string;
  issueDate: string;
  expiryDate: string;
}

const CERTIFICATE_STATUSES: { value: CertificateStatus | ''; label: string }[] = [
  { value: '', label: 'Tất cả trạng thái' },
  { value: 'VALID', label: 'Còn hiệu lực' },
  { value: 'EXPIRING', label: 'Sắp hết hạn' },
  { value: 'EXPIRED', label: 'Đã hết hạn' },
  { value: 'REVOKED', label: 'Đã thu hồi' },
];

export default function CertificatesPage() {
  const queryClient = useQueryClient();
  const canWrite = useAuthStore((s) => s.can('certificate:write'));

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [status, setStatus] = useState('');
  const [expiringOnly, setExpiringOnly] = useState(false);
  const [creating, setCreating] = useState(false);
  const [docsFor, setDocsFor] = useState<Certificate | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>();

  /** Đếm theo trạng thái, không phụ thuộc trạng thái đang chọn. */
  const counts = useQuery({
    queryKey: ['certificate-counts', { search, expiringOnly }],
    queryFn: async () =>
      (
        await api.get<{ total: number; counts: Record<CertificateStatus, number> }>(
          '/certificates/status-counts',
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
    queryKey: ['certificates', { search, status, expiringOnly, page, pageSize }],
    queryFn: async () =>
      (
        await api.get<Paginated<Certificate>>('/certificates', {
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

  const create = useMutation({
    mutationFn: async (values: FormValues) =>
      api.post('/certificates', {
        name: values.name,
        ...(values.type ? { type: values.type } : {}),
        supplierId: values.supplierId,
        ...(values.issuedBy ? { issuedBy: values.issuedBy } : {}),
        issueDate: new Date(values.issueDate).toISOString(),
        expiryDate: new Date(values.expiryDate).toISOString(),
      }),
    onSuccess: () => {
      toast.success('Đã thêm chứng chỉ');
      setCreating(false);
      reset();
      void queryClient.invalidateQueries({ queryKey: ['certificates'] });
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  return (
    <div>
      <PageHeader
        title="Chứng chỉ"
        description="Chứng chỉ của nhà cung cấp, tự cảnh báo khi gần hết hạn."
        actions={
          canWrite ? (
            <Button onClick={() => setCreating((v) => !v)}>
              <Plus className="h-4 w-4" />
              Thêm chứng chỉ
            </Button>
          ) : null
        }
      />

      {creating ? (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>Chứng chỉ mới</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={handleSubmit((v) => create.mutate(v))}
              className="grid gap-4 sm:grid-cols-2"
            >
              <div>
                <Label required>Tên chứng chỉ</Label>
                <Input
                  placeholder="ISO 9001:2015"
                  {...register('name', { required: 'Bắt buộc' })}
                />
                <FieldError message={errors.name?.message} />
              </div>
              <div>
                <Label>Loại</Label>
                <Select {...register('type')}>
                  <option value="">— Không chọn —</option>
                  {COMMON_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
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
                <Label>Nơi cấp</Label>
                <Input placeholder="BSI, SGS…" {...register('issuedBy')} />
              </div>
              <div>
                <Label required>Ngày cấp</Label>
                <Input
                  type="date"
                  {...register('issueDate', { required: 'Bắt buộc' })}
                />
                <FieldError message={errors.issueDate?.message} />
              </div>
              <div>
                <Label required>Ngày hết hạn</Label>
                <Input
                  type="date"
                  {...register('expiryDate', { required: 'Bắt buộc' })}
                />
                <FieldError message={errors.expiryDate?.message} />
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
                  Lưu chứng chỉ
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
            placeholder="Tìm theo tên hoặc loại chứng chỉ…"
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
        options={CERTIFICATE_STATUSES}
        value={status}
        onChange={(v) => {
          setStatus(v);
          setPage(1);
        }}
        counts={counts.data?.counts}
        total={counts.data?.total}
        isLoading={counts.isLoading}
      />

      {docsFor ? (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>
              Tài liệu chứng chỉ {docsFor.name} — {docsFor.supplier.companyName}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Attachments
              key={docsFor.id}
              target="CERTIFICATE"
              entityId={docsFor.id}
              canWrite={canWrite}
              documentTypes={['Bản gốc', 'Bản scan có dấu', 'Bản dịch', 'Kết quả kiểm định']}
              emptyHint="Chưa đính kèm bản scan chứng chỉ."
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
          title="Chưa có chứng chỉ nào"
          description="Thêm chứng chỉ ISO, HACCP, GMP… để theo dõi hạn hiệu lực."
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-y border-border bg-muted/40 text-left">
                <tr>
                  <th className="cell-head">Chứng chỉ</th>
                  <th className="cell-head">Loại</th>
                  <th className="cell-head">Nhà cung cấp</th>
                  <th className="cell-head">Nơi cấp</th>
                  <th className="cell-head">Hết hạn</th>
                  <th className="cell-head">Còn lại</th>
                  <th className="cell-head">Trạng thái</th>
                  <th className="cell-head">Tài liệu</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-border last:border-0 hover:bg-accent/50"
                  >
                    <td className="cell font-medium">{c.name}</td>
                    <td className="cell text-muted-foreground">
                      {c.type ?? '—'}
                    </td>
                    <td className="cell text-muted-foreground">
                      {c.supplier.companyName}
                    </td>
                    <td className="cell text-muted-foreground">
                      {c.issuedBy ?? '—'}
                    </td>
                    <td className="cell text-muted-foreground">
                      {formatDate(c.expiryDate)}
                    </td>
                    <td className="cell">
                      <DaysRemaining days={c.daysRemaining} />
                    </td>
                    <td className="cell">
                      <CertificateStatusBadge status={c.status} />
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
