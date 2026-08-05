'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
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
import { cn } from '@/lib/utils';
import type { AuthProfile } from '@/lib/types';

const employeeSchema = z.object({
  fullName: z.string().min(2, 'Nhập họ tên'),
  email: z.string().email('Email không hợp lệ'),
  password: z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự'),
  phone: z.string().optional(),
});

const supplierSchema = z.object({
  companyName: z.string().min(2, 'Nhập tên công ty'),
  contactPerson: z.string().min(2, 'Nhập người liên hệ'),
  email: z.string().email('Email không hợp lệ'),
  password: z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự'),
  taxCode: z.string().optional(),
  phone: z.string().optional(),
});

type Mode = 'employee' | 'supplier';

export default function RegisterPage() {
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);
  const [mode, setMode] = useState<Mode>('employee');

  const employeeForm = useForm<z.infer<typeof employeeSchema>>({
    resolver: zodResolver(employeeSchema),
  });
  const supplierForm = useForm<z.infer<typeof supplierSchema>>({
    resolver: zodResolver(supplierSchema),
  });

  const finish = (data: { accessToken: string; refreshToken: string; user: AuthProfile }) => {
    tokenStore.set(data.accessToken, data.refreshToken);
    setUser(data.user);
    router.push(data.user.supplier ? '/supplier/profile' : '/dashboard');
  };

  const submitEmployee = employeeForm.handleSubmit(async (values) => {
    try {
      const { data } = await api.post('/auth/register', values);
      toast.success('Tạo tài khoản thành công');
      finish(data);
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Đăng ký thất bại'));
    }
  });

  const submitSupplier = supplierForm.handleSubmit(async (values) => {
    try {
      const { data } = await api.post('/auth/register/supplier', values);
      toast.success('Đã gửi hồ sơ, chờ bộ phận mua hàng phê duyệt');
      finish(data);
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Đăng ký thất bại'));
    }
  });

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg">
        <Card>
          <CardHeader>
            <CardTitle>Đăng ký tài khoản</CardTitle>
            <CardDescription>
              Chọn loại tài khoản phù hợp với bạn.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-5 grid grid-cols-2 gap-2 rounded-lg bg-muted p-1">
              {(
                [
                  ['employee', 'Nhân viên'],
                  ['supplier', 'Nhà cung cấp'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMode(value)}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                    mode === value
                      ? 'bg-card shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {mode === 'employee' ? (
              <form onSubmit={submitEmployee} className="space-y-4">
                <div>
                  <Label required>Họ và tên</Label>
                  <Input {...employeeForm.register('fullName')} />
                  <FieldError message={employeeForm.formState.errors.fullName?.message} />
                </div>
                <div>
                  <Label required>Email</Label>
                  <Input type="email" {...employeeForm.register('email')} />
                  <FieldError message={employeeForm.formState.errors.email?.message} />
                </div>
                <div>
                  <Label required>Mật khẩu</Label>
                  <Input type="password" {...employeeForm.register('password')} />
                  <FieldError message={employeeForm.formState.errors.password?.message} />
                </div>
                <div>
                  <Label>Số điện thoại</Label>
                  <Input {...employeeForm.register('phone')} />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={employeeForm.formState.isSubmitting}
                >
                  Đăng ký
                </Button>
              </form>
            ) : (
              <form onSubmit={submitSupplier} className="space-y-4">
                <div>
                  <Label required>Tên công ty</Label>
                  <Input {...supplierForm.register('companyName')} />
                  <FieldError message={supplierForm.formState.errors.companyName?.message} />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label required>Người liên hệ</Label>
                    <Input {...supplierForm.register('contactPerson')} />
                    <FieldError
                      message={supplierForm.formState.errors.contactPerson?.message}
                    />
                  </div>
                  <div>
                    <Label>Mã số thuế</Label>
                    <Input {...supplierForm.register('taxCode')} />
                  </div>
                </div>
                <div>
                  <Label required>Email</Label>
                  <Input type="email" {...supplierForm.register('email')} />
                  <FieldError message={supplierForm.formState.errors.email?.message} />
                </div>
                <div>
                  <Label required>Mật khẩu</Label>
                  <Input type="password" {...supplierForm.register('password')} />
                  <FieldError message={supplierForm.formState.errors.password?.message} />
                </div>
                <div>
                  <Label>Số điện thoại</Label>
                  <Input {...supplierForm.register('phone')} />
                </div>
                <p className="text-xs text-muted-foreground">
                  Hồ sơ nhà cung cấp cần được bộ phận mua hàng duyệt trước khi
                  nhận được yêu cầu báo giá.
                </p>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={supplierForm.formState.isSubmitting}
                >
                  Gửi hồ sơ
                </Button>
              </form>
            )}
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
