'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  PageHeader,
  Skeleton,
  Textarea,
} from '@/components/ui';
import { SupplierStatusBadge } from '@/components/status-badge';
import { api, apiErrorMessage } from '@/lib/api';
import type { Category, Paginated, Supplier } from '@/lib/types';

type ProfileForm = Pick<
  Supplier,
  | 'companyName'
  | 'taxCode'
  | 'address'
  | 'country'
  | 'website'
  | 'email'
  | 'contactPerson'
  | 'phone'
  | 'bankAccount'
  | 'bankName'
  | 'swiftCode'
  | 'paymentTerm'
  | 'mainProducts'
  | 'mainServices'
>;

export default function SupplierProfilePage() {
  const queryClient = useQueryClient();
  const [categoryIds, setCategoryIds] = useState<string[]>([]);

  const { data: supplier, isLoading } = useQuery({
    queryKey: ['supplier-me'],
    queryFn: async () => (await api.get<Supplier>('/suppliers/me')).data,
  });

  const categories = useQuery({
    queryKey: ['categories', 'active'],
    queryFn: async () =>
      (
        await api.get<Paginated<Category>>('/categories', {
          params: { pageSize: 100, activeOnly: true },
        })
      ).data,
  });

  const { register, reset, handleSubmit } = useForm<ProfileForm>();

  useEffect(() => {
    if (!supplier) return;
    reset(supplier);
    setCategoryIds(supplier.categories?.map((c) => c.categoryId) ?? []);
  }, [supplier, reset]);

  const save = useMutation({
    mutationFn: async (values: ProfileForm) => {
      const payload = Object.fromEntries(
        Object.entries(values).filter(([, v]) => v !== null && v !== ''),
      );
      return api.patch('/suppliers/me', { ...payload, categoryIds });
    },
    onSuccess: () => {
      toast.success('Đã cập nhật hồ sơ');
      void queryClient.invalidateQueries({ queryKey: ['supplier-me'] });
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  if (isLoading || !supplier) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Hồ sơ nhà cung cấp"
        description={`Mã nhà cung cấp: ${supplier.code}`}
        actions={<SupplierStatusBadge status={supplier.status} />}
      />

      {supplier.status === 'REJECTED' && supplier.rejectReason ? (
        <Card className="mb-4 border-red-300 dark:border-red-900">
          <CardContent className="p-4">
            <p className="text-sm font-medium">Hồ sơ bị từ chối</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {supplier.rejectReason}
            </p>
          </CardContent>
        </Card>
      ) : null}

      <form onSubmit={handleSubmit((v) => save.mutate(v))} className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>Thông tin công ty</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Tên công ty</Label>
              <Input {...register('companyName')} />
            </div>
            <div>
              <Label>Mã số thuế</Label>
              <Input {...register('taxCode')} />
            </div>
            <div>
              <Label>Quốc gia</Label>
              <Input {...register('country')} />
            </div>
            <div className="sm:col-span-2">
              <Label>Địa chỉ</Label>
              <Input {...register('address')} />
            </div>
            <div>
              <Label>Website</Label>
              <Input {...register('website')} />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" {...register('email')} />
            </div>
            <div>
              <Label>Người liên hệ</Label>
              <Input {...register('contactPerson')} />
            </div>
            <div>
              <Label>Số điện thoại</Label>
              <Input {...register('phone')} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Thông tin thanh toán</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Số tài khoản</Label>
              <Input {...register('bankAccount')} />
            </div>
            <div>
              <Label>Ngân hàng</Label>
              <Input {...register('bankName')} />
            </div>
            <div>
              <Label>Swift code</Label>
              <Input {...register('swiftCode')} />
            </div>
            <div>
              <Label>Điều khoản thanh toán</Label>
              <Input placeholder="Net 30" {...register('paymentTerm')} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Năng lực cung cấp</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Sản phẩm chính</Label>
              <Textarea {...register('mainProducts')} />
            </div>
            <div>
              <Label>Dịch vụ chính</Label>
              <Textarea {...register('mainServices')} />
            </div>
            <div>
              <Label>Lĩnh vực muốn tham gia</Label>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {categories.data?.data.map((c) => (
                  <label
                    key={c.id}
                    className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-input"
                      checked={categoryIds.includes(c.id)}
                      onChange={(e) =>
                        setCategoryIds((prev) =>
                          e.target.checked
                            ? [...prev, c.id]
                            : prev.filter((id) => id !== c.id),
                        )
                      }
                    />
                    {c.nameEn ?? c.name}
                  </label>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" disabled={save.isPending}>
            Lưu hồ sơ
          </Button>
        </div>
      </form>
    </div>
  );
}
