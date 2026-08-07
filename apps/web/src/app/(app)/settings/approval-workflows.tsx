'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  GitBranch,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  Skeleton,
  Textarea,
} from '@/components/ui';
import { ConfirmIconButton } from '@/components/confirm-button';
import { api, apiErrorMessage } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import type {
  ApprovalTarget,
  ApprovalWorkflow,
  Category,
  Department,
  Paginated,
  Role,
  RoutingPreview,
} from '@/lib/types';

const TARGETS: { value: ApprovalTarget; label: string }[] = [
  { value: 'PURCHASE_REQUEST', label: 'Yêu cầu mua hàng' },
  { value: 'PURCHASE_ORDER', label: 'Đơn hàng' },
];

interface DraftStep {
  name: string;
  roleId: string;
  slaHours: string;
}

interface Draft {
  id: string | null;
  name: string;
  description: string;
  appliesTo: ApprovalTarget;
  categoryId: string;
  departmentId: string;
  minAmount: string;
  maxAmount: string;
  priority: string;
  isActive: boolean;
  steps: DraftStep[];
}

const emptyDraft = (appliesTo: ApprovalTarget): Draft => ({
  id: null,
  name: '',
  description: '',
  appliesTo,
  categoryId: '',
  departmentId: '',
  minAmount: '',
  maxAmount: '',
  priority: '0',
  isActive: true,
  steps: [{ name: 'Cấp duyệt 1', roleId: '', slaHours: '' }],
});

const toDraft = (w: ApprovalWorkflow): Draft => ({
  id: w.id,
  name: w.name,
  description: w.description ?? '',
  appliesTo: w.appliesTo,
  categoryId: w.categoryId ?? '',
  departmentId: w.departmentId ?? '',
  minAmount: w.minAmount ?? '',
  maxAmount: w.maxAmount ?? '',
  priority: String(w.priority),
  isActive: w.isActive,
  steps: w.steps.map((s) => ({
    name: s.name,
    roleId: s.roleId ?? '',
    slaHours: s.slaHours ? String(s.slaHours) : '',
  })),
});

const band = (min: string | null, max: string | null) => {
  if (!min && !max) return 'Mọi giá trị';
  if (!min) return `Dưới ${formatCurrency(max!)}`;
  if (!max) return `Từ ${formatCurrency(min)} trở lên`;
  return `${formatCurrency(min)} – ${formatCurrency(max)}`;
};

/**
 * Cho admin tự dựng chuỗi duyệt: mỗi luồng là một khoảng giá trị cộng với danh
 * sách cấp duyệt theo thứ tự. Hồ sơ nào rơi vào khoảng nào thì đi theo luồng đó.
 */
export function WorkflowsTab({ canWrite }: { canWrite: boolean }) {
  const queryClient = useQueryClient();
  const [target, setTarget] = useState<ApprovalTarget>('PURCHASE_REQUEST');
  const [draft, setDraft] = useState<Draft | null>(null);

  const workflows = useQuery({
    queryKey: ['approval-workflows', target],
    queryFn: async () =>
      (
        await api.get<{ data: ApprovalWorkflow[] }>('/approval-workflows', {
          params: { appliesTo: target },
        })
      ).data.data,
  });

  const roles = useQuery({
    queryKey: ['roles'],
    queryFn: async () => (await api.get<Role[]>('/roles')).data,
  });

  const departments = useQuery({
    queryKey: ['departments', 'all'],
    queryFn: async () =>
      (
        await api.get<Paginated<Department>>('/departments', {
          params: { pageSize: 100 },
        })
      ).data.data,
  });

  const categories = useQuery({
    queryKey: ['categories', 'all'],
    queryFn: async () =>
      (
        await api.get<Paginated<Category>>('/categories', {
          params: { pageSize: 100 },
        })
      ).data.data,
  });

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ['approval-workflows'] });

  const save = useMutation({
    mutationFn: async (d: Draft) => {
      const body = {
        name: d.name,
        appliesTo: d.appliesTo,
        priority: Number(d.priority) || 0,
        isActive: d.isActive,
        ...(d.description ? { description: d.description } : {}),
        ...(d.categoryId ? { categoryId: d.categoryId } : {}),
        ...(d.departmentId ? { departmentId: d.departmentId } : {}),
        ...(d.minAmount ? { minAmount: Number(d.minAmount) } : {}),
        ...(d.maxAmount ? { maxAmount: Number(d.maxAmount) } : {}),
        steps: d.steps.map((s) => ({
          name: s.name,
          ...(s.roleId ? { roleId: s.roleId } : {}),
          ...(s.slaHours ? { slaHours: Number(s.slaHours) } : {}),
        })),
      };
      return d.id
        ? api.put(`/approval-workflows/${d.id}`, body)
        : api.post('/approval-workflows', body);
    },
    onSuccess: () => {
      toast.success('Đã lưu luồng duyệt');
      setDraft(null);
      invalidate();
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/approval-workflows/${id}`),
    onSuccess: () => {
      toast.success('Đã xóa luồng duyệt');
      invalidate();
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const patchDraft = (patch: Partial<Draft>) =>
    setDraft((d) => (d ? { ...d, ...patch } : d));

  const patchStep = (index: number, patch: Partial<DraftStep>) =>
    setDraft((d) =>
      d
        ? {
            ...d,
            steps: d.steps.map((s, i) => (i === index ? { ...s, ...patch } : s)),
          }
        : d,
    );

  const moveStep = (index: number, delta: number) =>
    setDraft((d) => {
      if (!d) return d;
      const to = index + delta;
      if (to < 0 || to >= d.steps.length) return d;
      const steps = [...d.steps];
      [steps[index], steps[to]] = [steps[to], steps[index]];
      return { ...d, steps };
    });

  const roleName = (id: string | null) =>
    id ? (roles.data?.find((r) => r.id === id)?.name ?? '—') : 'Ai cũng duyệt được';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {TARGETS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => {
              setTarget(t.value);
              setDraft(null);
            }}
            className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
              target === t.value
                ? 'border-primary bg-accent font-medium'
                : 'border-border text-muted-foreground hover:bg-accent/40'
            }`}
          >
            {t.label}
          </button>
        ))}
        {canWrite ? (
          <Button
            size="sm"
            className="ml-auto"
            onClick={() => setDraft(emptyDraft(target))}
          >
            <Plus className="h-4 w-4" />
            Thêm luồng duyệt
          </Button>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitBranch className="h-4 w-4" />
            Các luồng đang cấu hình
          </CardTitle>
          <CardDescription>
            Hồ sơ được xếp vào luồng có khoảng giá trị phù hợp. Nhiều luồng cùng
            khớp thì luồng có độ ưu tiên cao hơn thắng.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {workflows.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : !workflows.data?.length ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Chưa có luồng duyệt nào cho {TARGETS.find((t) => t.value === target)?.label.toLowerCase()}.
              Hồ sơ sẽ được duyệt thẳng, không qua cấp nào.
            </p>
          ) : (
            <div className="space-y-2">
              {workflows.data.map((w) => (
                <div
                  key={w.id}
                  className="rounded-lg border border-border p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{w.name}</span>
                    <Badge tone="info">{band(w.minAmount, w.maxAmount)}</Badge>
                    {w.priority ? (
                      <Badge tone="neutral">Ưu tiên {w.priority}</Badge>
                    ) : null}
                    {w.isActive ? (
                      <Badge tone="success">Đang bật</Badge>
                    ) : (
                      <Badge tone="warning">Đã tắt</Badge>
                    )}
                    {canWrite ? (
                      <span className="ml-auto flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Sửa luồng"
                          onClick={() => setDraft(toDraft(w))}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <ConfirmIconButton
                          title={`Xóa luồng ${w.name}`}
                          disabled={remove.isPending}
                          onConfirm={() => remove.mutate(w.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </ConfirmIconButton>
                      </span>
                    ) : null}
                  </div>

                  <ol className="mt-2 flex flex-wrap items-center gap-1.5">
                    {w.steps.map((s, i) => (
                      <li key={s.id} className="flex items-center gap-1.5">
                        {i > 0 ? (
                          <span className="text-muted-foreground">→</span>
                        ) : null}
                        <span className="rounded-md bg-muted px-2 py-1 text-xs">
                          <b className="font-medium">{s.stepOrder}. {s.name}</b>
                          <span className="text-muted-foreground">
                            {' '}· {s.role?.name ?? 'mọi người'}
                            {s.slaHours ? ` · ${s.slaHours}h` : ''}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {draft ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {draft.id ? 'Sửa luồng duyệt' : 'Luồng duyệt mới'}
              <Button
                variant="ghost"
                size="icon"
                className="ml-auto"
                aria-label="Đóng"
                onClick={() => setDraft(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </CardTitle>
            <CardDescription>
              Bỏ trống “Giá trị từ / đến” nghĩa là không giới hạn. Khoảng tính
              theo giá trị hồ sơ: từ giá trị đầu (bao gồm) đến giá trị cuối
              (không bao gồm), nên các khoảng nối nhau không bị chồng.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Tên luồng</Label>
                <Input
                  value={draft.name}
                  placeholder="Đơn hàng dưới 100 triệu"
                  onChange={(e) => patchDraft({ name: e.target.value })}
                />
              </div>
              <div>
                <Label>Áp dụng cho</Label>
                <Select
                  value={draft.appliesTo}
                  onChange={(e) =>
                    patchDraft({ appliesTo: e.target.value as ApprovalTarget })
                  }
                >
                  {TARGETS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Giá trị từ (VND)</Label>
                <Input
                  inputMode="numeric"
                  value={draft.minAmount}
                  placeholder="0"
                  onChange={(e) =>
                    patchDraft({ minAmount: e.target.value.replace(/[^\d]/g, '') })
                  }
                />
              </div>
              <div>
                <Label>Giá trị đến (VND)</Label>
                <Input
                  inputMode="numeric"
                  value={draft.maxAmount}
                  placeholder="Không giới hạn"
                  onChange={(e) =>
                    patchDraft({ maxAmount: e.target.value.replace(/[^\d]/g, '') })
                  }
                />
              </div>
              <div>
                <Label>Chỉ áp dụng cho lĩnh vực</Label>
                <Select
                  value={draft.categoryId}
                  onChange={(e) => patchDraft({ categoryId: e.target.value })}
                >
                  <option value="">Mọi lĩnh vực</option>
                  {categories.data?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Chỉ áp dụng cho bộ phận</Label>
                <Select
                  value={draft.departmentId}
                  onChange={(e) => patchDraft({ departmentId: e.target.value })}
                >
                  <option value="">Mọi bộ phận</option>
                  {departments.data?.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Độ ưu tiên</Label>
                <Input
                  inputMode="numeric"
                  value={draft.priority}
                  onChange={(e) =>
                    patchDraft({ priority: e.target.value.replace(/[^\d]/g, '') })
                  }
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Ghi chú</Label>
                <Textarea
                  rows={2}
                  value={draft.description}
                  onChange={(e) => patchDraft({ description: e.target.value })}
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-input"
                checked={draft.isActive}
                onChange={(e) => patchDraft({ isActive: e.target.checked })}
              />
              Đang bật — tắt thì luồng không được dùng cho hồ sơ mới
            </label>

            <div className="space-y-2 border-t border-border pt-3">
              <Label>Các cấp duyệt, theo đúng thứ tự</Label>
              {draft.steps.map((s, index) => (
                <div
                  key={index}
                  className="grid gap-2 rounded-lg border border-border p-2 sm:grid-cols-12"
                >
                  <div className="flex items-center justify-center text-sm font-medium text-muted-foreground sm:col-span-1">
                    {index + 1}
                  </div>
                  <div className="sm:col-span-4">
                    <Input
                      value={s.name}
                      placeholder="Tên cấp duyệt"
                      onChange={(e) => patchStep(index, { name: e.target.value })}
                    />
                  </div>
                  <div className="sm:col-span-4">
                    <Select
                      value={s.roleId}
                      onChange={(e) => patchStep(index, { roleId: e.target.value })}
                    >
                      <option value="">Ai cũng duyệt được</option>
                      {roles.data?.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="sm:col-span-2">
                    <Input
                      inputMode="numeric"
                      value={s.slaHours}
                      placeholder="Hạn (giờ)"
                      onChange={(e) =>
                        patchStep(index, {
                          slaHours: e.target.value.replace(/[^\d]/g, ''),
                        })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-end gap-1 sm:col-span-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Lên"
                      disabled={index === 0}
                      onClick={() => moveStep(index, -1)}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Xuống"
                      disabled={index === draft.steps.length - 1}
                      onClick={() => moveStep(index, 1)}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Xóa cấp"
                      disabled={draft.steps.length === 1}
                      onClick={() =>
                        patchDraft({
                          steps: draft.steps.filter((_, i) => i !== index),
                        })
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}

              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  patchDraft({
                    steps: [
                      ...draft.steps,
                      {
                        name: `Cấp duyệt ${draft.steps.length + 1}`,
                        roleId: '',
                        slaHours: '',
                      },
                    ],
                  })
                }
              >
                <Plus className="h-4 w-4" />
                Thêm cấp duyệt
              </Button>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
              <Button variant="outline" onClick={() => setDraft(null)}>
                Hủy
              </Button>
              <Button
                disabled={
                  save.isPending ||
                  !draft.name.trim() ||
                  draft.steps.some((s) => !s.name.trim())
                }
                onClick={() => save.mutate(draft)}
              >
                <CheckCircle2 className="h-4 w-4" />
                Lưu luồng duyệt
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <RoutingTester target={target} roleName={roleName} />
    </div>
  );
}

/**
 * Nhập thử một số tiền để biết hồ sơ sẽ đi qua những cấp nào — cách nhanh nhất
 * để kiểm tra các khoảng giá trị có bị hở hay chồng nhau không.
 */
function RoutingTester({
  target,
  roleName,
}: {
  target: ApprovalTarget;
  roleName: (id: string | null) => string;
}) {
  const [amount, setAmount] = useState('');
  const [result, setResult] = useState<RoutingPreview | null>(null);

  const preview = useMutation({
    mutationFn: async () =>
      (
        await api.post<RoutingPreview>('/approval-workflows/preview', {
          amount: Number(amount) || 0,
          appliesTo: target,
        })
      ).data,
    onSuccess: setResult,
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Thử một số tiền</CardTitle>
        <CardDescription>
          Nhập giá trị hồ sơ để xem hệ thống sẽ đưa nó qua những cấp duyệt nào.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-48 flex-1">
            <Label>Giá trị hồ sơ (VND)</Label>
            <Input
              inputMode="numeric"
              value={amount}
              placeholder="250000000"
              onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))}
            />
          </div>
          <Button
            variant="outline"
            disabled={!amount || preview.isPending}
            onClick={() => preview.mutate()}
          >
            Thử
          </Button>
        </div>

        {result ? (
          !result.matched ? (
            <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
              Không luồng nào khớp — hồ sơ ở mức này sẽ được duyệt thẳng, không
              qua cấp nào.
            </p>
          ) : (
            <div className="rounded-lg border border-border p-3">
              <p className="font-medium">{result.name}</p>
              <ol className="mt-2 space-y-1">
                {result.steps.map((s) => (
                  <li key={s.id} className="text-sm">
                    <span className="text-muted-foreground">{s.stepOrder}.</span>{' '}
                    {s.name}{' '}
                    <span className="text-muted-foreground">
                      · {s.roleName ?? roleName(s.roleId)}
                      {s.slaHours ? ` · hạn ${s.slaHours}h` : ''}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )
        ) : null}
      </CardContent>
    </Card>
  );
}
