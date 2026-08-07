'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Boxes, Plus, Trash2, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Input,
  Label,
  PageHeader,
  Select,
  Skeleton,
} from '@/components/ui';
import { ConfirmButton, ConfirmIconButton } from '@/components/confirm-button';
import { api, apiErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import type {
  Category,
  DynamicForm,
  FieldType,
  FormVersion,
  Paginated,
} from '@/lib/types';

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'TEXT', label: 'Văn bản ngắn' },
  { value: 'TEXTAREA', label: 'Văn bản dài' },
  { value: 'NUMBER', label: 'Số nguyên' },
  { value: 'DECIMAL', label: 'Số thập phân' },
  { value: 'DATE', label: 'Ngày' },
  { value: 'SELECT', label: 'Danh sách chọn' },
  { value: 'CHECKBOX', label: 'Checkbox' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'URL', label: 'Đường dẫn' },
];

interface DraftField {
  key: string;
  label: string;
  type: FieldType;
  isRequired: boolean;
  optionsText: string;
}

export default function CategoriesPage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fields, setFields] = useState<DraftField[]>([]);
  const [newCategory, setNewCategory] = useState({
    name: '',
    code: '',
    requiresMaterial: true,
  });

  const categories = useQuery({
    queryKey: ['categories', 'all'],
    queryFn: async () =>
      (await api.get<Paginated<Category>>('/categories', { params: { pageSize: 100 } }))
        .data,
  });

  const form = useQuery({
    queryKey: ['category-form', selectedId],
    queryFn: async () =>
      (await api.get<DynamicForm>(`/categories/${selectedId}/form`)).data,
    enabled: Boolean(selectedId),
  });

  useEffect(() => {
    if (!form.data) return;
    setFields(
      form.data.fields.map((f) => ({
        key: f.key,
        label: f.label,
        type: f.type,
        isRequired: f.isRequired,
        optionsText: (f.options ?? []).map((o) => o.label).join(', '),
      })),
    );
  }, [form.data]);

  const formVersions = useQuery({
    queryKey: ['category-forms', selectedId],
    queryFn: async () =>
      (await api.get<FormVersion[]>(`/categories/${selectedId}/forms`)).data,
    enabled: Boolean(selectedId),
  });

  const deleteForm = useMutation({
    mutationFn: async (formId: string) =>
      (await api.delete<{ activeVersion: number | null }>(
        `/categories/${selectedId}/forms/${formId}`,
      )).data,
    onSuccess: (result) => {
      toast.success(
        result.activeVersion
          ? `Đã xóa biểu mẫu, phiên bản ${result.activeVersion} được dùng thay`
          : 'Đã xóa biểu mẫu',
      );
      void queryClient.invalidateQueries({ queryKey: ['category-forms', selectedId] });
      void queryClient.invalidateQueries({ queryKey: ['category-form', selectedId] });
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const deleteCategory = useMutation({
    mutationFn: async () => api.delete(`/categories/${selectedId}`),
    onSuccess: () => {
      toast.success('Đã xóa lĩnh vực mua hàng');
      setSelectedId(null);
      void queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const createCategory = useMutation({
    mutationFn: async () => api.post('/categories', newCategory),
    onSuccess: () => {
      toast.success('Đã tạo lĩnh vực mới');
      setNewCategory({ name: '', code: '', requiresMaterial: true });
      void queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const updateCategory = useMutation({
    mutationFn: async (patch: Partial<Category>) =>
      api.patch(`/categories/${selectedId}`, patch),
    onSuccess: (_r, patch) => {
      toast.success(
        'requiresMaterial' in patch
          ? patch.requiresMaterial
            ? 'Lĩnh vực này giờ bắt buộc chọn mã vật tư'
            : 'Lĩnh vực này giờ là mua dịch vụ, không cần mã vật tư'
          : 'Đã cập nhật lĩnh vực',
      );
      void queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const saveForm = useMutation({
    mutationFn: async () => {
      const selected = categories.data?.data.find((c) => c.id === selectedId);
      return api.post(`/categories/${selectedId}/form`, {
        name: `${selected?.nameEn ?? selected?.name ?? 'Category'} form`,
        fields: fields.map((f, index) => ({
          key: f.key,
          label: f.label,
          type: f.type,
          isRequired: f.isRequired,
          sortOrder: index,
          ...(['SELECT', 'MULTISELECT', 'RADIO'].includes(f.type) && f.optionsText
            ? {
                options: f.optionsText
                  .split(',')
                  .map((o) => o.trim())
                  .filter(Boolean)
                  .map((o) => ({ value: o, label: o })),
              }
            : {}),
        })),
      });
    },
    onSuccess: () => {
      toast.success('Đã phát hành phiên bản biểu mẫu mới');
      void queryClient.invalidateQueries({ queryKey: ['category-form', selectedId] });
      void queryClient.invalidateQueries({ queryKey: ['category-forms', selectedId] });
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const selected = categories.data?.data.find((c) => c.id === selectedId);

  const updateField = (index: number, patch: Partial<DraftField>) =>
    setFields((prev) =>
      prev.map((f, i) => (i === index ? { ...f, ...patch } : f)),
    );

  return (
    <div>
      <PageHeader
        title="Danh mục & biểu mẫu"
        description="Mỗi lĩnh vực mua hàng có biểu mẫu riêng, cấu hình được mà không cần sửa mã nguồn."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="h-fit lg:col-span-1">
          <CardHeader>
            <CardTitle>Lĩnh vực mua hàng</CardTitle>
          </CardHeader>
          <CardContent>
            {categories.isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <div className="max-h-96 space-y-1 overflow-y-auto">
                {categories.data?.data.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setSelectedId(c.id)}
                    className={cn(
                      'w-full rounded-md px-3 py-2 text-left text-sm transition-colors',
                      selectedId === c.id
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-accent',
                    )}
                  >
                    <span className="block font-medium">{c.name}</span>
                    <span
                      className={cn(
                        'text-xs',
                        selectedId === c.id
                          ? 'text-primary-foreground/80'
                          : 'text-muted-foreground',
                      )}
                    >
                      {c.code}
                    </span>
                  </button>
                ))}
              </div>
            )}

            <div className="mt-4 space-y-2 border-t border-border pt-4">
              <Label>Thêm lĩnh vực mới</Label>
              <Input
                placeholder="Tên lĩnh vực"
                value={newCategory.name}
                onChange={(e) =>
                  setNewCategory((s) => ({ ...s, name: e.target.value }))
                }
              />
              <Input
                placeholder="MÃ_LINH_VUC"
                value={newCategory.code}
                onChange={(e) =>
                  setNewCategory((s) => ({
                    ...s,
                    code: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_'),
                  }))
                }
              />
              <Select
                value={newCategory.requiresMaterial ? 'goods' : 'service'}
                onChange={(e) =>
                  setNewCategory((s) => ({
                    ...s,
                    requiresMaterial: e.target.value === 'goods',
                  }))
                }
              >
                <option value="goods">Mua hàng hóa — cần mã vật tư</option>
                <option value="service">Mua dịch vụ — không cần mã</option>
              </Select>
              <Button
                size="sm"
                className="w-full"
                disabled={
                  !newCategory.name || !newCategory.code || createCategory.isPending
                }
                onClick={() => createCategory.mutate()}
              >
                <Plus className="h-4 w-4" />
                Tạo lĩnh vực
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4 lg:col-span-2">
        {selected ? (
          <Card>
            <CardHeader>
              <CardTitle>Cấu hình lĩnh vực {selected.name}</CardTitle>
              <CardDescription>
                Quyết định người lập yêu cầu mua hàng có phải chọn mã vật tư cho từng
                dòng hay không.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                {(
                  [
                    {
                      value: true,
                      icon: Boxes,
                      title: 'Mua hàng hóa',
                      desc: 'Mỗi dòng hàng bắt buộc chọn mã vật tư trong danh mục. Dùng cho hóa chất, bao bì, máy móc, phụ tùng…',
                    },
                    {
                      value: false,
                      icon: Wrench,
                      title: 'Mua dịch vụ',
                      desc: 'Không cần mã vật tư, người dùng mô tả trực tiếp nội dung công việc. Dùng cho dịch vụ, vận tải, phần mềm…',
                    },
                  ] as const
                ).map(({ value, icon: Icon, title, desc }) => {
                  const active = (selected.requiresMaterial ?? true) === value;
                  return (
                    <button
                      key={String(value)}
                      type="button"
                      disabled={updateCategory.isPending}
                      onClick={() =>
                        !active && updateCategory.mutate({ requiresMaterial: value })
                      }
                      className={cn(
                        'rounded-lg border p-3 text-left transition-colors',
                        active
                          ? 'border-primary bg-accent/50'
                          : 'border-border hover:bg-accent/30',
                      )}
                    >
                      <span className="flex items-center gap-2 text-sm font-medium">
                        <Icon className="h-4 w-4" />
                        {title}
                        {active ? <Badge tone="success">Đang chọn</Badge> : null}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {desc}
                      </span>
                    </button>
                  );
                })}
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-input"
                  checked={selected.isActive}
                  disabled={updateCategory.isPending}
                  onChange={(e) =>
                    updateCategory.mutate({ isActive: e.target.checked })
                  }
                />
                Đang sử dụng — bỏ chọn thì lĩnh vực không còn hiện khi lập yêu cầu mới
              </label>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                <p className="text-xs text-muted-foreground">
                  Xóa lĩnh vực chỉ được khi chưa có yêu cầu mua hàng nào dùng nó.
                </p>
                <ConfirmButton
                  variant="outline"
                  size="sm"
                  confirmLabel={`Xóa lĩnh vực ${selected.name}?`}
                  confirmActionLabel="Xóa"
                  disabled={deleteCategory.isPending}
                  onConfirm={() => deleteCategory.mutate()}
                >
                  <Trash2 className="h-4 w-4" />
                  Xóa lĩnh vực
                </ConfirmButton>
              </div>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              Biểu mẫu động
              {form.data?.version ? (
                <Badge tone="info">Phiên bản {form.data.version}</Badge>
              ) : null}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedId ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Chọn một lĩnh vực để cấu hình biểu mẫu.
              </p>
            ) : form.isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <div className="space-y-3">
                {fields.map((field, index) => (
                  <div
                    key={index}
                    className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-12"
                  >
                    <div className="sm:col-span-3">
                      <Label>Khóa</Label>
                      <Input
                        value={field.key}
                        onChange={(e) => updateField(index, { key: e.target.value })}
                      />
                    </div>
                    <div className="sm:col-span-4">
                      <Label>Nhãn hiển thị</Label>
                      <Input
                        value={field.label}
                        onChange={(e) => updateField(index, { label: e.target.value })}
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <Label>Kiểu dữ liệu</Label>
                      <Select
                        value={field.type}
                        onChange={(e) =>
                          updateField(index, { type: e.target.value as FieldType })
                        }
                      >
                        {FIELD_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="flex items-end gap-2 sm:col-span-2">
                      <label className="flex h-9 items-center gap-1.5 text-sm">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-input"
                          checked={field.isRequired}
                          onChange={(e) =>
                            updateField(index, { isRequired: e.target.checked })
                          }
                        />
                        Bắt buộc
                      </label>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Xóa trường"
                        onClick={() =>
                          setFields((prev) => prev.filter((_, i) => i !== index))
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    {['SELECT', 'MULTISELECT', 'RADIO'].includes(field.type) ? (
                      <div className="sm:col-span-12">
                        <Label>Các lựa chọn (phân cách bằng dấu phẩy)</Label>
                        <Input
                          placeholder="FOB, CIF, EXW"
                          value={field.optionsText}
                          onChange={(e) =>
                            updateField(index, { optionsText: e.target.value })
                          }
                        />
                      </div>
                    ) : null}
                  </div>
                ))}

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setFields((prev) => [
                        ...prev,
                        {
                          key: `field${prev.length + 1}`,
                          label: '',
                          type: 'TEXT',
                          isRequired: false,
                          optionsText: '',
                        },
                      ])
                    }
                  >
                    <Plus className="h-4 w-4" />
                    Thêm trường
                  </Button>
                  <ConfirmButton
                    confirmLabel="Phát hành phiên bản biểu mẫu mới?"
                    confirmActionLabel="Phát hành"
                    disabled={saveForm.isPending || fields.some((f) => !f.key || !f.label)}
                    onConfirm={() => saveForm.mutate()}
                  >
                    Phát hành phiên bản mới
                  </ConfirmButton>
                </div>

                <p className="text-xs text-muted-foreground">
                  Lưu biểu mẫu tạo ra một phiên bản mới; các yêu cầu đã tạo trước
                  đó vẫn giữ nguyên nhãn cũ.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {selectedId ? (
          <Card>
            <CardHeader>
              <CardTitle>Các phiên bản biểu mẫu</CardTitle>
              <CardDescription>
                Mỗi lần phát hành sinh thêm một phiên bản. Xóa bớt những biểu mẫu
                nháp hoặc không còn dùng để danh sách gọn lại.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {formVersions.isLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : !formVersions.data?.length ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Lĩnh vực này chưa có biểu mẫu nào.
                </p>
              ) : (
                <div className="space-y-1">
                  {formVersions.data.map((v) => (
                    <div
                      key={v.id}
                      className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2"
                    >
                      <span className="font-medium">Phiên bản {v.version}</span>
                      {v.isActive ? (
                        <Badge tone="success">Đang dùng</Badge>
                      ) : (
                        <Badge tone="neutral">Cũ</Badge>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {v.name} · {v.fieldCount} trường ·{' '}
                        {new Date(v.createdAt).toLocaleDateString('vi-VN')}
                      </span>
                      <ConfirmIconButton
                        className="ml-auto"
                        title={`Xóa biểu mẫu phiên bản ${v.version}`}
                        disabled={deleteForm.isPending}
                        onConfirm={() => deleteForm.mutate(v.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </ConfirmIconButton>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ) : null}
        </div>
      </div>
    </div>
  );
}
