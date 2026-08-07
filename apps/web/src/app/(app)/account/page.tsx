'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { KeyRound, LogOut, UserRound } from 'lucide-react';
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
  Select,
  Skeleton,
} from '@/components/ui';
import { ConfirmButton } from '@/components/confirm-button';
import { api, apiErrorMessage, tokenStore } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import type { UserAccount } from '@/lib/types';

interface ProfileForm {
  fullName: string;
  phone: string;
  jobTitle: string;
  locale: string;
}

interface PasswordForm {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export default function AccountPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const logout = useAuthStore((s) => s.logout);
  const loadSession = useAuthStore((s) => s.loadSession);

  const { data, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: async () => (await api.get<UserAccount>('/users/me')).data,
  });

  const profile = useForm<ProfileForm>();
  const password = useForm<PasswordForm>();
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (data) {
      profile.reset({
        fullName: data.fullName,
        phone: data.phone ?? '',
        jobTitle: data.jobTitle ?? '',
        locale: data.locale ?? 'vi',
      });
    }
  }, [data, profile]);

  const saveProfile = useMutation({
    mutationFn: async (v: ProfileForm) => api.patch('/users/me', v),
    onSuccess: async () => {
      toast.success('Đã lưu thông tin');
      void queryClient.invalidateQueries({ queryKey: ['me'] });
      // Nạp lại phiên để tên hiển thị ở thanh bên đổi theo ngay.
      await loadSession();
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const changePassword = useMutation({
    mutationFn: async (v: PasswordForm) =>
      (
        await api.post<{ accessToken: string; refreshToken: string }>(
          '/users/me/password',
          { currentPassword: v.currentPassword, newPassword: v.newPassword },
        )
      ).data,
    onSuccess: (data) => {
      // Đổi mật khẩu thu hồi hết phiên cũ, nên phải nhận cặp token mới ngay
      // nếu không tab này cũng bị văng ra.
      if (data.accessToken && data.refreshToken) {
        tokenStore.set(data.accessToken, data.refreshToken);
      }
      toast.success('Đã đổi mật khẩu. Các thiết bị khác đã bị đăng xuất.');
      password.reset({ currentPassword: '', newPassword: '', confirmPassword: '' });
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const signOut = async () => {
    setSigningOut(true);
    await logout();
    router.replace('/login');
  };

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Tài khoản của tôi"
        description="Thông tin cơ bản, mật khẩu và đăng xuất."
      />

      <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserRound className="h-4 w-4" />
              Thông tin cơ bản
            </CardTitle>
            <CardDescription>
              Email, phòng ban và vai trò do quản trị viên đặt. Bạn tự sửa được phần còn lại.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4 grid gap-3 rounded-lg border border-border p-4 text-sm sm:grid-cols-2">
              <ReadOnly label="Email đăng nhập" value={data.email} />
              <ReadOnly label="Phòng ban" value={data.department?.name ?? '—'} />
              <div>
                <p className="text-xs text-muted-foreground">Vai trò</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {data.roles.length ? (
                    data.roles.map((r) => (
                      <Badge key={r.role.id} tone="info">
                        {r.role.name}
                      </Badge>
                    ))
                  ) : (
                    <span>—</span>
                  )}
                </div>
              </div>
              <ReadOnly
                label="Đăng nhập gần nhất"
                value={formatDateTime(data.lastLoginAt)}
              />
              {data.supplier ? (
                <ReadOnly
                  label="Nhà cung cấp"
                  value={data.supplier.companyName}
                  className="sm:col-span-2"
                />
              ) : null}
            </div>

            <form
              onSubmit={profile.handleSubmit((v) => saveProfile.mutate(v))}
              className="grid gap-4 sm:grid-cols-2"
            >
              <div>
                <Label required>Họ và tên</Label>
                <Input {...profile.register('fullName', { required: 'Bắt buộc' })} />
                <FieldError message={profile.formState.errors.fullName?.message} />
              </div>
              <div>
                <Label>Số điện thoại</Label>
                <Input {...profile.register('phone')} />
              </div>
              <div>
                <Label>Chức danh</Label>
                <Input {...profile.register('jobTitle')} />
              </div>
              <div>
                <Label>Ngôn ngữ</Label>
                <Select {...profile.register('locale')}>
                  <option value="vi">Tiếng Việt</option>
                  <option value="en">English</option>
                </Select>
              </div>
              <div className="flex justify-end gap-2 sm:col-span-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={!profile.formState.isDirty}
                  onClick={() =>
                    profile.reset({
                      fullName: data.fullName,
                      phone: data.phone ?? '',
                      jobTitle: data.jobTitle ?? '',
                      locale: data.locale ?? 'vi',
                    })
                  }
                >
                  Hoàn tác
                </Button>
                <Button type="submit" disabled={saveProfile.isPending}>
                  Lưu thông tin
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4" />
              Đổi mật khẩu
            </CardTitle>
            <CardDescription>
              Đổi mật khẩu sẽ đăng xuất mọi thiết bị khác đang dùng tài khoản này.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={password.handleSubmit((v) => changePassword.mutate(v))}
              className="grid gap-4 sm:grid-cols-3"
            >
              <div>
                <Label required>Mật khẩu hiện tại</Label>
                <Input
                  type="password"
                  autoComplete="current-password"
                  {...password.register('currentPassword', { required: 'Bắt buộc' })}
                />
                <FieldError message={password.formState.errors.currentPassword?.message} />
              </div>
              <div>
                <Label required>Mật khẩu mới</Label>
                <Input
                  type="password"
                  autoComplete="new-password"
                  {...password.register('newPassword', {
                    required: 'Bắt buộc',
                    minLength: { value: 8, message: 'Tối thiểu 8 ký tự' },
                  })}
                />
                <FieldError message={password.formState.errors.newPassword?.message} />
              </div>
              <div>
                <Label required>Nhập lại mật khẩu mới</Label>
                <Input
                  type="password"
                  autoComplete="new-password"
                  {...password.register('confirmPassword', {
                    required: 'Bắt buộc',
                    validate: (v) =>
                      v === password.getValues('newPassword') ||
                      'Hai lần nhập chưa khớp',
                  })}
                />
                <FieldError message={password.formState.errors.confirmPassword?.message} />
              </div>
              <div className="flex justify-end sm:col-span-3">
                <Button type="submit" disabled={changePassword.isPending}>
                  Đổi mật khẩu
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LogOut className="h-4 w-4" />
              Phiên đăng nhập
            </CardTitle>
            <CardDescription>
              Đăng xuất khỏi thiết bị này và thu hồi phiên hiện tại.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ConfirmButton
              variant="destructive"
              confirmLabel="Đăng xuất khỏi thiết bị này?"
              confirmActionLabel="Đăng xuất"
              disabled={signingOut}
              onConfirm={signOut}
            >
              <LogOut className="h-4 w-4" />
              {signingOut ? 'Đang đăng xuất…' : 'Đăng xuất'}
            </ConfirmButton>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ReadOnly({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5">{value}</p>
    </div>
  );
}
