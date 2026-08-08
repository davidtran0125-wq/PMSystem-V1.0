'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  FieldError,
  Input,
  Label,
} from '@/components/ui';
import { api, apiErrorMessage, tokenStore } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import type { AuthProfile } from '@/lib/types';

const supplierSchema = z.object({
  companyName: z.string().min(2, 'Nhập tên công ty'),
  contactPerson: z.string().min(2, 'Nhập người liên hệ'),
  email: z.string().email('Email không hợp lệ'),
  password: z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự'),
  taxCode: z.string().optional(),
  phone: z.string().optional(),
});

/**
 * Chỉ nhà cung cấp mới tự đăng ký được.
 *
 * Tài khoản nhân viên do quản trị viên tạo trong mục Người dùng. Trước đây
 * trang này có thêm tab đăng ký cho nhân viên, mở công khai: bất kỳ ai trên
 * internet cũng tạo được tài khoản đọc được danh mục vật tư, cơ cấu phòng ban,
 * và đẩy yêu cầu mua hàng vào hàng chờ duyệt của bộ phận mua hàng.
 */
export default function RegisterPage() {
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);

  const form = useForm<z.infer<typeof supplierSchema>>({
    resolver: zodResolver(supplierSchema),
  });

  const submit = form.handleSubmit(async (values) => {
    try {
      const { data } = await api.post<{
        accessToken: string;
        refreshToken: string;
        user: AuthProfile;
      }>('/auth/register/supplier', values);
      tokenStore.set(data.accessToken, data.refreshToken);
      setUser(data.user);
      toast.success('Đã gửi hồ sơ, chờ bộ phận mua hàng phê duyệt');
      router.push('/supplier/profile');
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Đăng ký thất bại'));
    }
  });

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg">
        <Card>
          <CardHeader>
            <CardTitle>Đăng ký nhà cung cấp</CardTitle>
            <CardDescription>
              Dành cho nhà cung cấp muốn tham gia báo giá. Hồ sơ cần được bộ phận
              mua hàng duyệt trước khi bạn nhận được yêu cầu báo giá.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div>
                <Label required>Tên công ty</Label>
                <Input {...form.register('companyName')} />
                <FieldError message={form.formState.errors.companyName?.message} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label required>Người liên hệ</Label>
                  <Input {...form.register('contactPerson')} />
                  <FieldError
                    message={form.formState.errors.contactPerson?.message}
                  />
                </div>
                <div>
                  <Label>Mã số thuế</Label>
                  <Input {...form.register('taxCode')} />
                </div>
              </div>
              <div>
                <Label required>Email</Label>
                <Input type="email" {...form.register('email')} />
                <FieldError message={form.formState.errors.email?.message} />
              </div>
              <div>
                <Label required>Mật khẩu</Label>
                <Input type="password" {...form.register('password')} />
                <FieldError message={form.formState.errors.password?.message} />
              </div>
              <div>
                <Label>Số điện thoại</Label>
                <Input {...form.register('phone')} />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={form.formState.isSubmitting}
              >
                Gửi hồ sơ
              </Button>
            </form>

            <p className="mt-5 border-t border-border pt-4 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Bạn là nhân viên?</span>{' '}
              Tài khoản nội bộ do quản trị viên cấp. Liên hệ bộ phận mua hàng
              hoặc quản trị hệ thống để được tạo tài khoản.
            </p>
          </CardContent>
        </Card>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          Đã có tài khoản?{' '}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Đăng nhập
          </Link>
        </p>
      </div>
    </div>
  );
}
