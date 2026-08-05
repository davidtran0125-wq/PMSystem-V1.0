'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  FieldError,
  Input,
  Label,
  PageHeader,
  Select,
  Skeleton,
  Textarea,
} from '@/components/ui';
import { DynamicFields } from '@/components/dynamic-fields';
import { api, apiErrorMessage } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import type {
  Category,
  Department,
  DynamicForm,
  Paginated,
  PurchaseRequest,
} from '@/lib/types';

interface FormValues {
  title: string;
  categoryId: string;
  departmentId: string;
  priority: string;
  reason: string;
  description: string;
  neededByDate: string;
  budgetAmount: string;
  items: {
    name: string;
    specification: string;
    quantity: string;
    unit: string;
    estimatedPrice: string;
  }[];
  dynamicValues: Record<string, unknown>;
}

const emptyItem = {
  name: '',
  specification: '',
  quantity: '',
  unit: '',
  estimatedPrice: '',
};

export default function NewPurchaseRequestPage() {
  const router = useRouter();

  const {
    register,
    control,
    handleSubmit,
    watch,
    resetField,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    defaultValues: {
      title: '',
      categoryId: '',
      departmentId: '',
      priority: 'NORMAL',
      reason: '',
      description: '',
      neededByDate: '',
      budgetAmount: '',
      items: [{ ...emptyItem }],
      dynamicValues: {},
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const categoryId = watch('categoryId');
  const items = watch('items');

  const categories = useQuery({
    queryKey: ['categories', 'active'],
    queryFn: async () =>
      (
        await api.get<Paginated<Category>>('/categories', {
          params: { pageSize: 100, activeOnly: true },
        })
      ).data,
  });

  const departments = useQuery({
    queryKey: ['departments'],
    queryFn: async () =>
      (await api.get<Paginated<Department>>('/departments', { params: { pageSize: 100 } })).data,
  });

  const form = useQuery({
    queryKey: ['category-form', categoryId],
    queryFn: async () =>
      (await api.get<DynamicForm>(`/categories/${categoryId}/form`)).data,
    enabled: Boolean(categoryId),
  });

  // Switching category swaps the whole dynamic section; stale keys from the
  // previous category would be rejected by the API.
  useEffect(() => {
    resetField('dynamicValues', { defaultValue: {} });
  }, [categoryId, resetField]);

  const estimatedTotal = items.reduce((sum, item) => {
    const qty = Number(item.quantity);
    const price = Number(item.estimatedPrice);
    return Number.isFinite(qty) && Number.isFinite(price) ? sum + qty * price : sum;
  }, 0);

  const onSubmit = async (values: FormValues, submitAfter: boolean) => {
    try {
      const payload = {
        title: values.title,
        categoryId: values.categoryId,
        ...(values.departmentId ? { departmentId: values.departmentId } : {}),
        priority: values.priority,
        ...(values.reason ? { reason: values.reason } : {}),
        ...(values.description ? { description: values.description } : {}),
        ...(values.neededByDate
          ? { neededByDate: new Date(values.neededByDate).toISOString() }
          : {}),
        ...(values.budgetAmount ? { budgetAmount: Number(values.budgetAmount) } : {}),
        items: values.items
          .filter((item) => item.name && item.quantity && item.unit)
          .map((item) => ({
            name: item.name,
            ...(item.specification ? { specification: item.specification } : {}),
            quantity: Number(item.quantity),
            unit: item.unit,
            ...(item.estimatedPrice
              ? { estimatedPrice: Number(item.estimatedPrice) }
              : {}),
          })),
        dynamicValues: values.dynamicValues ?? {},
      };

      const { data } = await api.post<PurchaseRequest>('/purchase-requests', payload);

      if (submitAfter) {
        await api.post(`/purchase-requests/${data.id}/submit`);
        toast.success(`Đã gửi yêu cầu ${data.code} để duyệt`);
      } else {
        toast.success(`Đã lưu nháp ${data.code}`);
      }
      router.push(`/purchase-requests/${data.id}`);
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Không tạo được yêu cầu'));
    }
  };

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Tạo yêu cầu mua hàng"
        description="Điền thông tin chung, sau đó hoàn tất biểu mẫu riêng của lĩnh vực."
      />

      <form className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>Thông tin chung</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label required>Tiêu đề</Label>
              <Input
                placeholder="VD: Mua NaOH 37% cho line 2"
                {...register('title', { required: 'Nhập tiêu đề' })}
              />
              <FieldError message={errors.title?.message} />
            </div>

            <div>
              <Label required>Lĩnh vực mua hàng</Label>
              <Select
                {...register('categoryId', { required: 'Chọn lĩnh vực' })}
                disabled={categories.isLoading}
              >
                <option value="">— Chọn lĩnh vực —</option>
                {categories.data?.data.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nameEn ? `${c.name} (${c.nameEn})` : c.name}
                  </option>
                ))}
              </Select>
              <FieldError message={errors.categoryId?.message} />
            </div>

            <div>
              <Label>Bộ phận</Label>
              <Select {...register('departmentId')}>
                <option value="">— Theo hồ sơ của tôi —</option>
                {departments.data?.data.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label>Mức độ ưu tiên</Label>
              <Select {...register('priority')}>
                <option value="LOW">Thấp</option>
                <option value="NORMAL">Bình thường</option>
                <option value="HIGH">Cao</option>
                <option value="URGENT">Khẩn cấp</option>
              </Select>
            </div>

            <div>
              <Label>Ngày cần hàng</Label>
              <Input type="date" {...register('neededByDate')} />
            </div>

            <div>
              <Label>Ngân sách dự kiến (VND)</Label>
              <Input type="number" step="any" {...register('budgetAmount')} />
            </div>

            <div className="sm:col-span-2">
              <Label>Lý do mua</Label>
              <Textarea
                placeholder="Giải thích nhu cầu để bộ phận mua hàng xử lý nhanh hơn."
                {...register('reason')}
              />
            </div>

            <div className="sm:col-span-2">
              <Label>Mô tả thêm</Label>
              <Textarea {...register('description')} />
            </div>
          </CardContent>
        </Card>

        {categoryId ? (
          <Card>
            <CardHeader>
              <CardTitle>
                Thông tin theo lĩnh vực
                {form.data?.name ? (
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    {form.data.name} v{form.data.version}
                  </span>
                ) : null}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {form.isLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : !form.data?.fields.length ? (
                <p className="text-sm text-muted-foreground">
                  Lĩnh vực này chưa cấu hình biểu mẫu riêng.
                </p>
              ) : (
                <DynamicFields
                  fields={form.data.fields}
                  control={control}
                  errors={errors}
                />
              )}
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Danh sách hàng hóa / dịch vụ</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {fields.map((field, index) => (
              <div
                key={field.id}
                className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-12"
              >
                <div className="sm:col-span-5">
                  <Label required>Tên hàng</Label>
                  <Input
                    {...register(`items.${index}.name`, {
                      required: index === 0 ? 'Nhập ít nhất một dòng hàng' : false,
                    })}
                  />
                  <FieldError message={errors.items?.[index]?.name?.message} />
                </div>
                <div className="sm:col-span-2">
                  <Label required>Số lượng</Label>
                  <Input
                    type="number"
                    step="any"
                    {...register(`items.${index}.quantity`, {
                      required: index === 0 ? 'Bắt buộc' : false,
                    })}
                  />
                  <FieldError message={errors.items?.[index]?.quantity?.message} />
                </div>
                <div className="sm:col-span-2">
                  <Label required>Đơn vị</Label>
                  <Input
                    placeholder="kg"
                    {...register(`items.${index}.unit`, {
                      required: index === 0 ? 'Bắt buộc' : false,
                    })}
                  />
                  <FieldError message={errors.items?.[index]?.unit?.message} />
                </div>
                <div className="sm:col-span-2">
                  <Label>Đơn giá dự kiến</Label>
                  <Input
                    type="number"
                    step="any"
                    {...register(`items.${index}.estimatedPrice`)}
                  />
                </div>
                <div className="flex items-end sm:col-span-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Xóa dòng"
                    disabled={fields.length === 1}
                    onClick={() => remove(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="sm:col-span-12">
                  <Label>Quy cách / thông số</Label>
                  <Input {...register(`items.${index}.specification`)} />
                </div>
              </div>
            ))}

            <div className="flex items-center justify-between">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append({ ...emptyItem })}
              >
                <Plus className="h-4 w-4" />
                Thêm dòng
              </Button>
              <p className="text-sm">
                Tổng dự kiến:{' '}
                <span className="font-semibold tabular-nums">
                  {formatCurrency(estimatedTotal)}
                </span>
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Hủy
          </Button>
          <Button
            type="button"
            variant="subtle"
            disabled={isSubmitting}
            onClick={handleSubmit((v) => onSubmit(v, false))}
          >
            Lưu nháp
          </Button>
          <Button
            type="button"
            disabled={isSubmitting}
            onClick={handleSubmit((v) => onSubmit(v, true))}
          >
            Gửi duyệt
          </Button>
        </div>
      </form>
    </div>
  );
}
