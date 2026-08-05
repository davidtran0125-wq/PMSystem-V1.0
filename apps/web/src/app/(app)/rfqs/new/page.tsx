'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
  Select,
  Skeleton,
  Textarea,
} from '@/components/ui';
import { api, apiErrorMessage } from '@/lib/api';
import type { Paginated, PurchaseRequest, Rfq, Supplier } from '@/lib/types';

function NewRfqForm() {
  const router = useRouter();
  const params = useSearchParams();

  const [purchaseRequestId, setPurchaseRequestId] = useState(
    params.get('purchaseRequestId') ?? '',
  );
  const [instructions, setInstructions] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const approvedRequests = useQuery({
    queryKey: ['purchase-requests', 'approved'],
    queryFn: async () =>
      (
        await api.get<Paginated<PurchaseRequest>>('/purchase-requests', {
          params: { status: 'APPROVED', pageSize: 100 },
        })
      ).data,
  });

  const selectedRequest = approvedRequests.data?.data.find(
    (pr) => pr.id === purchaseRequestId,
  );

  const suppliers = useQuery({
    queryKey: ['suppliers', 'approved', selectedRequest?.category.id],
    queryFn: async () =>
      (
        await api.get<Paginated<Supplier>>('/suppliers', {
          params: { status: 'APPROVED', pageSize: 100 },
        })
      ).data,
  });

  // Suppliers that registered for this category are the natural shortlist, but
  // the buyer can still invite any approved supplier.
  const categoryId = selectedRequest?.category.id;
  const ranked = (suppliers.data?.data ?? []).slice().sort((a, b) => {
    const aMatch = a.categories?.some((c) => c.categoryId === categoryId) ? 1 : 0;
    const bMatch = b.categories?.some((c) => c.categoryId === categoryId) ? 1 : 0;
    return bMatch - aMatch || a.companyName.localeCompare(b.companyName);
  });

  const submit = async (sendNow: boolean) => {
    if (!purchaseRequestId) {
      toast.error('Chọn yêu cầu mua hàng đã duyệt');
      return;
    }
    if (!selected.length) {
      toast.error('Chọn ít nhất một nhà cung cấp');
      return;
    }

    setSaving(true);
    try {
      const { data } = await api.post<Rfq>('/rfqs', {
        purchaseRequestId,
        supplierIds: selected,
        ...(instructions ? { instructions } : {}),
        ...(dueDate ? { dueDate: new Date(dueDate).toISOString() } : {}),
      });

      if (sendNow) {
        await api.post(`/rfqs/${data.id}/send`);
        toast.success(`Đã gửi ${data.code} tới ${selected.length} nhà cung cấp`);
      } else {
        toast.success(`Đã tạo nháp ${data.code}`);
      }
      router.push(`/rfqs/${data.id}`);
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Không tạo được RFQ'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Tạo yêu cầu báo giá"
        description="Chọn yêu cầu đã duyệt và mời các nhà cung cấp tham gia."
      />

      <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>Thông tin RFQ</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label required>Yêu cầu mua hàng đã duyệt</Label>
              <Select
                value={purchaseRequestId}
                onChange={(e) => {
                  setPurchaseRequestId(e.target.value);
                  setSelected([]);
                }}
              >
                <option value="">— Chọn yêu cầu —</option>
                {approvedRequests.data?.data.map((pr) => (
                  <option key={pr.id} value={pr.id}>
                    {pr.code} — {pr.title}
                  </option>
                ))}
              </Select>
              {approvedRequests.data && !approvedRequests.data.data.length ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Chưa có yêu cầu nào ở trạng thái đã duyệt.
                </p>
              ) : null}
            </div>

            <div>
              <Label>Hạn nộp báo giá</Label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>

            <div>
              <Label>Hướng dẫn cho nhà cung cấp</Label>
              <Textarea
                placeholder="VD: Báo giá CIF cảng HCM, hiệu lực tối thiểu 30 ngày."
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              Nhà cung cấp{' '}
              <span className="text-sm font-normal text-muted-foreground">
                ({selected.length} đã chọn)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {suppliers.isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : !ranked.length ? (
              <p className="text-sm text-muted-foreground">
                Chưa có nhà cung cấp nào được duyệt.
              </p>
            ) : (
              <div className="space-y-2">
                {ranked.map((supplier) => {
                  const matches = supplier.categories?.some(
                    (c) => c.categoryId === categoryId,
                  );
                  return (
                    <label
                      key={supplier.id}
                      className="flex cursor-pointer items-center gap-3 rounded-md border border-border p-3 hover:bg-accent"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-input"
                        checked={selected.includes(supplier.id)}
                        onChange={(e) =>
                          setSelected((prev) =>
                            e.target.checked
                              ? [...prev, supplier.id]
                              : prev.filter((id) => id !== supplier.id),
                          )
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {supplier.companyName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {supplier.code}
                          {supplier.email ? ` · ${supplier.email}` : ''}
                        </p>
                      </div>
                      {matches && categoryId ? (
                        <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                          Đúng lĩnh vực
                        </span>
                      ) : null}
                    </label>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => router.back()}>
            Hủy
          </Button>
          <Button variant="subtle" disabled={saving} onClick={() => submit(false)}>
            Lưu nháp
          </Button>
          <Button disabled={saving} onClick={() => submit(true)}>
            Tạo và gửi ngay
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function NewRfqPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <NewRfqForm />
    </Suspense>
  );
}
