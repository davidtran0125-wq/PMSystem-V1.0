'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Button,
  Card,
  CardContent,
  EmptyState,
  Input,
  PageHeader,
  Select,
  Skeleton,
  Textarea,
} from '@/components/ui';
import { SupplierStatusBadge } from '@/components/status-badge';
import { api, apiErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import type { Paginated, Supplier } from '@/lib/types';

export default function SuppliersPage() {
  const queryClient = useQueryClient();
  const canApprove = useAuthStore((s) => s.can('supplier:approve'));

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['suppliers', { search, status }],
    queryFn: async () =>
      (
        await api.get<Paginated<Supplier>>('/suppliers', {
          params: {
            pageSize: 50,
            ...(search ? { search } : {}),
            ...(status ? { status } : {}),
          },
        })
      ).data,
  });

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ['suppliers'] });

  const approve = useMutation({
    mutationFn: async (id: string) => api.post(`/suppliers/${id}/approve`),
    onSuccess: () => {
      toast.success('Đã duyệt nhà cung cấp');
      void refresh();
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const reject = useMutation({
    mutationFn: async (id: string) => api.post(`/suppliers/${id}/reject`, { reason }),
    onSuccess: () => {
      toast.success('Đã từ chối hồ sơ');
      setRejecting(null);
      setReason('');
      void refresh();
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  return (
    <div>
      <PageHeader
        title="Nhà cung cấp"
        description="Duyệt hồ sơ trước khi nhà cung cấp được mời tham gia RFQ."
      />

      <div className="mb-4 flex flex-wrap gap-3">
        <Input
          className="min-w-56 flex-1"
          placeholder="Tìm theo tên, mã số thuế, email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          className="w-52"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">Tất cả trạng thái</option>
          <option value="PENDING">Chờ duyệt</option>
          <option value="APPROVED">Đã duyệt</option>
          <option value="REJECTED">Từ chối</option>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : !data?.data.length ? (
        <EmptyState
          title="Chưa có nhà cung cấp"
          description="Nhà cung cấp tự đăng ký qua trang đăng ký và chờ được duyệt."
        />
      ) : (
        <div className="grid gap-3">
          {data.data.map((supplier) => (
            <Card key={supplier.id}>
              <CardContent className="flex flex-wrap items-start justify-between gap-4 p-5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium">{supplier.companyName}</h3>
                    <SupplierStatusBadge status={supplier.status} />
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {supplier.code}
                    {supplier.taxCode ? ` · MST ${supplier.taxCode}` : ''}
                    {supplier.email ? ` · ${supplier.email}` : ''}
                  </p>
                  {supplier.contactPerson ? (
                    <p className="text-sm text-muted-foreground">
                      Liên hệ: {supplier.contactPerson}
                      {supplier.phone ? ` · ${supplier.phone}` : ''}
                    </p>
                  ) : null}
                  {supplier.categories?.length ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {supplier.categories.map((c) => (
                        <span
                          key={c.categoryId}
                          className="rounded-full bg-muted px-2 py-0.5 text-xs"
                        >
                          {c.category.nameEn ?? c.category.name}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {supplier.rejectReason ? (
                    <p className="mt-2 text-sm text-destructive">
                      Lý do từ chối: {supplier.rejectReason}
                    </p>
                  ) : null}
                </div>

                {canApprove && supplier.status !== 'APPROVED' ? (
                  <div className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      onClick={() => approve.mutate(supplier.id)}
                      disabled={approve.isPending}
                    >
                      Duyệt
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setRejecting(rejecting === supplier.id ? null : supplier.id)
                      }
                    >
                      Từ chối
                    </Button>
                  </div>
                ) : null}

                {rejecting === supplier.id ? (
                  <div className="w-full">
                    <Textarea
                      placeholder="Lý do từ chối hồ sơ…"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                    <div className="mt-2 flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setRejecting(null);
                          setReason('');
                        }}
                      >
                        Hủy
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={!reason.trim() || reject.isPending}
                        onClick={() => reject.mutate(supplier.id)}
                      >
                        Xác nhận từ chối
                      </Button>
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
