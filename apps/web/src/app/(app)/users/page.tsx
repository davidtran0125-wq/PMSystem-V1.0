'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Lock, Pencil, Plus, Search, Trash2, Unlock } from 'lucide-react';
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
  StatusFilterBar,
  Skeleton,
} from '@/components/ui';
import { ConfirmIconButton } from '@/components/confirm-button';
import { api, apiErrorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import type {
  Department,
  Paginated,
  Role,
  UserAccount,
  UserStatus,
} from '@/lib/types';

interface UserForm {
  email: string;
  password: string;
  fullName: string;
  phone: string;
  jobTitle: string;
  departmentId: string;
  roleIds: string[];
}

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Đang hoạt động',
  PENDING: 'Chờ kích hoạt',
  SUSPENDED: 'Đã khóa',
};

const USER_STATUSES: { value: UserStatus | ''; label: string }[] = [
  { value: '', label: 'Tất cả trạng thái' },
  { value: 'ACTIVE', label: STATUS_LABEL.ACTIVE },
  { value: 'PENDING', label: STATUS_LABEL.PENDING },
  { value: 'SUSPENDED', label: STATUS_LABEL.SUSPENDED },
];

export default function UsersPage() {
  const queryClient = useQueryClient();
  const canWrite = useAuthStore((s) => s.can('user:write'));
  const me = useAuthStore((s) => s.user);

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [status, setStatus] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<UserAccount | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<UserForm>({ defaultValues: { roleIds: [] } });

  /** Đếm theo trạng thái, không phụ thuộc trạng thái đang chọn. */
  const counts = useQuery({
    queryKey: ['user-counts', { search }],
    queryFn: async () =>
      (
        await api.get<{ total: number; counts: Record<UserStatus, number> }>(
          '/users/status-counts',
          { params: { ...(search ? { search } : {}) } },
        )
      ).data,
  });

  const users = useQuery({
    queryKey: ['users', { search, status, page, pageSize }],
    queryFn: async () =>
      (
        await api.get<Paginated<UserAccount>>('/users', {
          params: {
            page,
            pageSize,
            ...(search ? { search } : {}),
            ...(status ? { status } : {}),
          },
        })
      ).data,
  });

  const roles = useQuery({
    queryKey: ['roles'],
    // Danh mục tham chiếu gần như không đổi trong một phiên làm việc.
    staleTime: 10 * 60_000,
    queryFn: async () => (await api.get<Role[]>('/roles')).data,
  });

  const departments = useQuery({
    queryKey: ['departments'],
    // Danh mục tham chiếu gần như không đổi trong một phiên làm việc.
    staleTime: 10 * 60_000,
    queryFn: async () =>
      (await api.get<Paginated<Department>>('/departments', { params: { pageSize: 100 } }))
        .data,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['users'] });

  useEffect(() => {
    if (editing) {
      reset({
        email: editing.email,
        password: '',
        fullName: editing.fullName,
        phone: editing.phone ?? '',
        jobTitle: editing.jobTitle ?? '',
        departmentId: editing.department?.id ?? '',
        roleIds: editing.roles.map((r) => r.role.id),
      });
    }
  }, [editing, reset]);

  const openCreate = () => {
    setEditing(null);
    setCreating(true);
    reset({
      email: '',
      password: '',
      fullName: '',
      phone: '',
      jobTitle: '',
      departmentId: '',
      roleIds: [],
    });
  };

  const closeForm = () => {
    setCreating(false);
    setEditing(null);
  };

  const submit = useMutation({
    mutationFn: async (v: UserForm) => {
      const roleIds = Array.isArray(v.roleIds) ? v.roleIds : [v.roleIds].filter(Boolean);
      if (!roleIds.length) throw new Error('Chọn ít nhất một vai trò');

      if (editing) {
        // Vai trò có endpoint riêng vì nó thay đổi toàn bộ quyền của tài khoản.
        await api.patch(`/users/${editing.id}`, {
          fullName: v.fullName,
          phone: v.phone,
          jobTitle: v.jobTitle,
          ...(v.departmentId ? { departmentId: v.departmentId } : {}),
        });
        return api.patch(`/users/${editing.id}/roles`, { roleIds });
      }
      return api.post('/users', {
        email: v.email,
        password: v.password,
        fullName: v.fullName,
        ...(v.phone ? { phone: v.phone } : {}),
        ...(v.jobTitle ? { jobTitle: v.jobTitle } : {}),
        ...(v.departmentId ? { departmentId: v.departmentId } : {}),
        roleIds,
      });
    },
    onSuccess: () => {
      toast.success(editing ? 'Đã cập nhật tài khoản' : 'Đã tạo tài khoản');
      closeForm();
      void invalidate();
    },
    onError: (error) =>
      toast.error(
        error instanceof Error && !('response' in error)
          ? error.message
          : apiErrorMessage(error),
      ),
  });

  const setStatusFor = useMutation({
    mutationFn: async ({ id, next }: { id: string; next: string }) =>
      api.patch(`/users/${id}`, { status: next }),
    onSuccess: (_r, v) => {
      toast.success(v.next === 'ACTIVE' ? 'Đã mở khóa tài khoản' : 'Đã khóa tài khoản');
      void invalidate();
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const resetPassword = useMutation({
    mutationFn: async ({ id, newPassword }: { id: string; newPassword: string }) =>
      api.post(`/users/${id}/reset-password`, { newPassword }),
    onSuccess: () => toast.success('Đã đặt lại mật khẩu, người dùng bị đăng xuất'),
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => {
      toast.success('Đã xóa tài khoản');
      void invalidate();
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const showForm = creating || editing;

  return (
    <div>
      <PageHeader
        title="Người dùng"
        description="Tạo tài khoản nội bộ, gán vai trò, khóa hoặc đặt lại mật khẩu."
        actions={
          canWrite ? (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Tạo tài khoản
            </Button>
          ) : null
        }
      />

      {showForm ? (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>
              {editing ? `Sửa tài khoản ${editing.email}` : 'Tài khoản mới'}
            </CardTitle>
            <CardDescription>
              Vai trò quyết định người này thấy và làm được gì. Có thể chọn nhiều vai trò.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={handleSubmit((v) => submit.mutate(v))}
              className="grid gap-4 sm:grid-cols-2"
            >
              <div>
                <Label required>Email đăng nhập</Label>
                <Input
                  type="email"
                  disabled={Boolean(editing)}
                  {...register('email', { required: 'Bắt buộc' })}
                />
                <FieldError message={errors.email?.message} />
              </div>
              {!editing ? (
                <div>
                  <Label required>Mật khẩu ban đầu</Label>
                  <Input
                    type="text"
                    autoComplete="new-password"
                    placeholder="Tối thiểu 8 ký tự"
                    {...register('password', {
                      required: 'Bắt buộc',
                      minLength: { value: 8, message: 'Tối thiểu 8 ký tự' },
                    })}
                  />
                  <FieldError message={errors.password?.message} />
                </div>
              ) : null}
              <div>
                <Label required>Họ và tên</Label>
                <Input {...register('fullName', { required: 'Bắt buộc' })} />
                <FieldError message={errors.fullName?.message} />
              </div>
              <div>
                <Label>Số điện thoại</Label>
                <Input {...register('phone')} />
              </div>
              <div>
                <Label>Chức danh</Label>
                <Input {...register('jobTitle')} />
              </div>
              <div>
                <Label>Phòng ban</Label>
                <Select {...register('departmentId')}>
                  <option value="">— Không chọn —</option>
                  {departments.data?.data.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label required>Vai trò</Label>
                <div className="mt-1 flex flex-wrap gap-3 rounded-lg border border-border p-3">
                  {roles.data?.map((r) => (
                    <label key={r.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-input"
                        value={r.id}
                        {...register('roleIds')}
                      />
                      {r.name}
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-2 sm:col-span-2">
                <Button type="button" variant="outline" onClick={closeForm}>
                  Hủy
                </Button>
                <Button type="submit" disabled={submit.isPending}>
                  {editing ? 'Lưu thay đổi' : 'Tạo tài khoản'}
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
            placeholder="Tìm theo tên hoặc email…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      <StatusFilterBar
        options={USER_STATUSES}
        value={status}
        onChange={(v) => {
          setStatus(v);
          setPage(1);
        }}
        counts={counts.data?.counts}
        total={counts.data?.total}
        isLoading={counts.isLoading}
      />

      {users.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : !users.data?.data.length ? (
        <EmptyState title="Không tìm thấy tài khoản nào" />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-y border-border bg-muted/40 text-left">
                <tr>
                  <th className="cell-head">Họ tên</th>
                  <th className="cell-head">Email</th>
                  <th className="cell-head">Phòng ban</th>
                  <th className="cell-head">Vai trò</th>
                  <th className="cell-head">Đăng nhập gần nhất</th>
                  <th className="cell-head">Trạng thái</th>
                  {canWrite ? <th className="cell-head" /> : null}
                </tr>
              </thead>
              <tbody>
                {users.data.data.map((u) => {
                  const isSelf = u.id === me?.id;
                  return (
                    <tr
                      key={u.id}
                      className="border-b border-border last:border-0 hover:bg-accent/50"
                    >
                      <td className="cell">
                        <p className="font-medium">
                          {u.fullName}
                          {isSelf ? (
                            <span className="ml-2 text-xs text-muted-foreground">(bạn)</span>
                          ) : null}
                        </p>
                        {u.jobTitle ? (
                          <p className="text-xs text-muted-foreground">{u.jobTitle}</p>
                        ) : null}
                      </td>
                      <td className="cell text-muted-foreground">{u.email}</td>
                      <td className="cell text-muted-foreground">
                        {u.department?.name ?? '—'}
                      </td>
                      <td className="cell">
                        <div className="flex flex-wrap gap-1">
                          {u.roles.map((r) => (
                            <Badge key={r.role.id}>{r.role.name}</Badge>
                          ))}
                          {u.supplier ? <Badge tone="info">Nhà cung cấp</Badge> : null}
                        </div>
                      </td>
                      <td className="cell text-muted-foreground">
                        {formatDateTime(u.lastLoginAt)}
                      </td>
                      <td className="cell">
                        <Badge
                          tone={
                            u.status === 'ACTIVE'
                              ? 'success'
                              : u.status === 'SUSPENDED'
                                ? 'danger'
                                : 'warning'
                          }
                        >
                          {STATUS_LABEL[u.status] ?? u.status}
                        </Badge>
                      </td>
                      {canWrite ? (
                        <td className="cell">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Sửa"
                              onClick={() => {
                                setCreating(false);
                                setEditing(u);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <ConfirmIconButton
                              title="Đặt lại mật khẩu"
                              disabled={resetPassword.isPending}
                              onConfirm={() => {
                                const pwd = prompt(
                                  `Mật khẩu mới cho ${u.email} (tối thiểu 8 ký tự):`,
                                );
                                if (pwd) resetPassword.mutate({ id: u.id, newPassword: pwd });
                              }}
                            >
                              <KeyRound className="h-4 w-4" />
                            </ConfirmIconButton>
                            {!isSelf ? (
                              <>
                                <ConfirmIconButton
                                  title={u.status === 'ACTIVE' ? 'Khóa' : 'Mở khóa'}
                                  disabled={setStatusFor.isPending}
                                  onConfirm={() =>
                                    setStatusFor.mutate({
                                      id: u.id,
                                      next: u.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE',
                                    })
                                  }
                                >
                                  {u.status === 'ACTIVE' ? (
                                    <Lock className="h-4 w-4" />
                                  ) : (
                                    <Unlock className="h-4 w-4 text-emerald-600" />
                                  )}
                                </ConfirmIconButton>
                                <ConfirmIconButton
                                  title={`Xóa tài khoản ${u.email}`}
                                  disabled={remove.isPending}
                                  onConfirm={() => remove.mutate(u.id)}
                                >
                                  <Trash2 className="h-4 w-4 text-red-600" />
                                </ConfirmIconButton>
                              </>
                            ) : null}
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination
            page={page}
            pageSize={pageSize}
            total={users.data.meta.total}
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
