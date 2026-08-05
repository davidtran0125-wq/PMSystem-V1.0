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
import { apiErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

const schema = z.object({
  email: z.string().email('Email không hợp lệ'),
  password: z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự'),
});

type FormValues = z.infer<typeof schema>;

const DEMO_ACCOUNTS = [
  { label: 'Buyer', email: 'buyer@pms.local' },
  { label: 'End User', email: 'user@pms.local' },
  { label: 'Admin', email: 'admin@pms.local' },
];

export default function LoginPage() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (values: FormValues) => {
    try {
      const user = await login(values.email, values.password);
      toast.success(`Xin chào ${user.fullName}`);
      router.push(user.supplier ? '/supplier/rfqs' : '/dashboard');
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Đăng nhập thất bại'));
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">PMS</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Hệ thống quản lý mua hàng
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Đăng nhập</CardTitle>
            <CardDescription>
              Nhập thông tin tài khoản để tiếp tục.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <Label htmlFor="email" required>
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="ban@congty.com"
                  {...register('email')}
                />
                <FieldError message={errors.email?.message} />
              </div>

              <div>
                <Label htmlFor="password" required>
                  Mật khẩu
                </Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  {...register('password')}
                />
                <FieldError message={errors.password?.message} />
              </div>

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? 'Đang đăng nhập…' : 'Đăng nhập'}
              </Button>
            </form>

            <div className="mt-5 border-t border-border pt-4">
              <p className="mb-2 text-xs text-muted-foreground">
                Tài khoản demo (mật khẩu: Admin@123)
              </p>
              <div className="flex flex-wrap gap-2">
                {DEMO_ACCOUNTS.map((account) => (
                  <Button
                    key={account.email}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setValue('email', account.email);
                      setValue('password', 'Admin@123');
                    }}
                  >
                    {account.label}
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          Chưa có tài khoản?{' '}
          <Link href="/register" className="font-medium text-primary hover:underline">
            Đăng ký
          </Link>
        </p>
      </div>
    </div>
  );
}
