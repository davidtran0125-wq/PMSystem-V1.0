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

/**
 * Toàn bộ tài khoản seed sẵn. Bấm vào một dòng là điền luôn vào form, khỏi phải
 * mở tài liệu ra tra. Mật khẩu giống nhau vì đây là dữ liệu demo — khi đưa lên
 * môi trường thật thì xóa hoặc khóa hết các tài khoản này.
 */
const DEMO_PASSWORD = 'Admin@123';

const DEMO_GROUPS: {
  title: string;
  hint: string;
  accounts: { email: string; role: string; note: string }[];
}[] = [
  {
    title: 'Bên mua',
    hint: 'Chuỗi duyệt: Department Manager → Buyer → Finance → Director',
    accounts: [
      { email: 'admin@pms.local', role: 'Super Admin', note: 'Toàn quyền, duyệt mã vật tư, quản lý tài khoản' },
      { email: 'buyer@pms.local', role: 'Buyer', note: 'Tạo RFQ, so sánh báo giá, trao thầu, lên đơn hàng' },
      { email: 'user@pms.local', role: 'End User', note: 'Lập yêu cầu mua hàng, đề xuất mã vật tư' },
      { email: 'manager@pms.local', role: 'Department Manager', note: 'Duyệt cấp 1 cho yêu cầu trên 100 triệu' },
      { email: 'finance@pms.local', role: 'Finance', note: 'Duyệt cấp 3 cho yêu cầu trên 500 triệu' },
      { email: 'director@pms.local', role: 'Director', note: 'Duyệt cấp cuối, duyệt hồ sơ nhà cung cấp' },
      { email: 'qa@pms.local', role: 'QA', note: 'Quản lý chứng chỉ nhà cung cấp' },
      { email: 'warehouse@pms.local', role: 'Warehouse', note: 'Tra cứu đơn hàng và hợp đồng' },
    ],
  },
  {
    title: 'Nhà cung cấp',
    hint: 'Chỉ thấy RFQ được mời và đơn hàng của chính mình',
    accounts: [
      { email: 'ncc-a@pms.local', role: 'Hóa chất Miền Nam', note: 'Lĩnh vực Chemical, Raw Material' },
      { email: 'ncc-b@pms.local', role: 'Thiết bị Công nghiệp Việt', note: 'Lĩnh vực Machine, Spare Part' },
    ],
  },
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
      <div className="w-full max-w-4xl">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold">PMS</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Hệ thống quản lý mua hàng
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <Card className="h-fit">
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

          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Tài khoản demo</CardTitle>
            <CardDescription>
              Bấm vào một dòng để điền sẵn vào form. Mật khẩu chung:{' '}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono">
                {DEMO_PASSWORD}
              </code>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {DEMO_GROUPS.map((group) => (
              <div key={group.title}>
                <p className="text-sm font-medium">{group.title}</p>
                <p className="mb-2 text-xs text-muted-foreground">{group.hint}</p>
                <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                  {group.accounts.map((account) => (
                    <li key={account.email}>
                      <button
                        type="button"
                        onClick={() => {
                          setValue('email', account.email);
                          setValue('password', DEMO_PASSWORD);
                        }}
                        className="flex w-full flex-wrap items-baseline gap-x-2 gap-y-0.5 px-3 py-2 text-left hover:bg-accent"
                      >
                        <span className="font-mono text-xs">{account.email}</span>
                        <span className="text-xs font-medium">{account.role}</span>
                        <span className="w-full text-xs text-muted-foreground">
                          {account.note}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              Đây là dữ liệu demo. Khi đưa lên môi trường thật, hãy xóa hoặc khóa toàn
              bộ tài khoản này trong mục Người dùng.
            </p>
          </CardContent>
        </Card>
        </div>

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
