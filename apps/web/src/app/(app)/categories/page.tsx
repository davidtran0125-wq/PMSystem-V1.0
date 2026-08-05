'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  PageHeader,
  Select,
  Skeleton,
} from '@/components/ui';
import { api, apiErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { Category, DynamicForm, FieldType, Paginated } from '@/lib/types';

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
  const [newCategory, setNewCategory] = useState({ name: '', code: '' });

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

  const createCategory = useMutation({
    mutationFn: async () => api.post('/categories', newCategory),
    onSuccess: () => {
      toast.success('Đã tạo lĩnh vực mới');
      setNewCategory({ name: '', code: '' });
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
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

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

        <Card className="lg:col-span-2">
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
                  <Button
                    disabled={saveForm.isPending || fields.some((f) => !f.key || !f.label)}
                    onClick={() => saveForm.mutate()}
                  >
                    Phát hành phiên bản mới
                  </Button>
                </div>

                <p className="text-xs text-muted-foreground">
                  Lưu biểu mẫu tạo ra một phiên bản mới; các yêu cầu đã tạo trước
                  đó vẫn giữ nguyên nhãn cũ.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
