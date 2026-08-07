'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  FileDown,
  Pencil,
  Send,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CollapsibleCard,
  Input,
  Label,
  PageHeader,
  Skeleton,
  Textarea,
} from '@/components/ui';
import { PoStatusBadge } from '@/components/status-badge';
import { Attachments, saveFile } from '@/components/attachments';
import { ConfirmButton } from '@/components/confirm-button';
import { api, apiErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { cn, formatCurrency, formatDate, formatDateTime } from '@/lib/utils';
import type { OrderRevision, PurchaseOrder } from '@/lib/types';

export default function PurchaseOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [cancelling, setCancelling] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftItems, setDraftItems] = useState<
    { lineNo: number; name: string; quantity: string; unit: string; unitPrice: string }[]
  >([]);
  const [draftNote, setDraftNote] = useState('');
  const [reason, setReason] = useState('');

  const { data: po, isLoading } = useQuery({
    queryKey: ['purchase-order', id],
    queryFn: async () =>
      (await api.get<PurchaseOrder>(`/purchase-orders/${id}`)).data,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['purchase-order', id] });
    void queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
  };

  const onDone = (message: string) => () => {
    toast.success(message);
    setCancelling(false);
    setEditing(false);
    setReason('');
    invalidate();
  };
  const onFail = (error: unknown) => toast.error(apiErrorMessage(error));

  const issue = useMutation({
    mutationFn: async () => api.post(`/purchase-orders/${id}/issue`),
    onSuccess: onDone('Đã phát hành đơn hàng tới nhà cung cấp'),
    onError: onFail,
  });

  const complete = useMutation({
    mutationFn: async () => api.post(`/purchase-orders/${id}/complete`),
    onSuccess: onDone('Đã đánh dấu hoàn tất'),
    onError: onFail,
  });

  const cancel = useMutation({
    mutationFn: async (body: { reason: string }) =>
      api.post(`/purchase-orders/${id}/cancel`, body),
    onSuccess: onDone('Đã hủy đơn hàng'),
    onError: onFail,
  });

  const canWritePo = useAuthStore((s) => s.can('purchase_order:write'));
  const canApprovePo = useAuthStore((s) => s.can('purchase_order:approve'));
  const user = useAuthStore((s) => s.user);

  const saveEdit = useMutation({
    mutationFn: async () =>
      api.patch(`/purchase-orders/${id}`, {
        ...(draftNote !== (po?.note ?? '') ? { note: draftNote } : {}),
        items: draftItems.map((i) => ({
          lineNo: i.lineNo,
          name: i.name,
          quantity: Number(i.quantity),
          unit: i.unit,
          unitPrice: Number(i.unitPrice),
        })),
      }),
    onSuccess: (res) => {
      const next = res.data as PurchaseOrder;
      toast.success(
        next.status === 'DRAFT'
          ? 'Đã lưu. Đơn quay về nháp và phải trình duyệt lại từ đầu.'
          : 'Đã lưu thay đổi',
      );
      setEditing(false);
      invalidate();
      void queryClient.invalidateQueries({
        queryKey: ['purchase-order-revisions', id],
      });
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const submitApproval = useMutation({
    mutationFn: async () => api.post(`/purchase-orders/${id}/submit-for-approval`),
    onSuccess: () => {
      toast.success('Đã trình duyệt');
      invalidate();
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const approveStep = useMutation({
    mutationFn: async (comment?: string) =>
      api.post(`/purchase-orders/${id}/approve`, comment ? { comment } : {}),
    onSuccess: () => {
      toast.success('Đã duyệt cấp này');
      invalidate();
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const rejectApproval = useMutation({
    mutationFn: async (comment: string) =>
      api.post(`/purchase-orders/${id}/reject`, { comment }),
    onSuccess: () => {
      toast.success('Đã trả đơn về nháp');
      invalidate();
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const revisions = useQuery({
    queryKey: ['purchase-order-revisions', id],
    queryFn: async () =>
      (await api.get<OrderRevision[]>(`/purchase-orders/${id}/revisions`)).data,
  });

  const pdf = useMutation({
    mutationFn: async () => saveFile(`/purchase-orders/${id}/pdf`, `${po?.code ?? 'don-hang'}.pdf`),
    onError: (error) => toast.error(apiErrorMessage(error, 'Không tạo được file PDF')),
  });

  if (isLoading || !po) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const canAttach = canWritePo;
  const canSubmitApproval = canWritePo && po.status === 'DRAFT';
  const canIssue = po.status === 'APPROVED';
  const isMyTurn =
    po.status === 'PENDING_APPROVAL' &&
    canApprovePo &&
    Boolean(po.currentStep?.role && user?.roles.includes(po.currentStep.role.code));
  const canComplete = ['ISSUED', 'ACKNOWLEDGED', 'PARTIALLY_RECEIVED'].includes(
    po.status,
  );
  const canCancel = !['COMPLETED', 'CANCELLED'].includes(po.status);

  return (
    <div className="mx-auto max-w-5xl">
      <Button
        variant="ghost"
        size="sm"
        className="mb-3"
        onClick={() => router.push('/purchase-orders')}
      >
        <ArrowLeft className="h-4 w-4" />
        Danh sách đơn hàng
      </Button>

      <PageHeader
        title={`${po.code} — ${po.title}`}
        description={`Nhà cung cấp: ${po.supplier.companyName} · Từ yêu cầu ${po.purchaseRequest.code}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={pdf.isPending}
              onClick={() => pdf.mutate()}
            >
              <FileDown className="h-4 w-4" />
              {pdf.isPending ? 'Đang tạo PDF…' : 'Tải PDF'}
            </Button>
            {canWritePo && ['DRAFT', 'PENDING_APPROVAL', 'APPROVED'].includes(po.status) ? (
              <Button
                variant="outline"
                onClick={() => {
                  setDraftItems(
                    po.items.map((i) => ({
                      lineNo: i.lineNo,
                      name: i.name,
                      quantity: String(Number(i.quantity)),
                      unit: i.unit,
                      unitPrice: String(Number(i.unitPrice)),
                    })),
                  );
                  setDraftNote(po.note ?? '');
                  setEditing((v) => !v);
                }}
              >
                <Pencil className="h-4 w-4" />
                {editing ? 'Đóng sửa' : 'Sửa đơn'}
              </Button>
            ) : null}
            {canSubmitApproval ? (
              <ConfirmButton
                confirmLabel="Trình đơn hàng đi duyệt?"
                confirmActionLabel="Trình duyệt"
                onConfirm={() => submitApproval.mutate()}
                disabled={submitApproval.isPending}
              >
                <Send className="h-4 w-4" />
                Trình duyệt
              </ConfirmButton>
            ) : null}
            {isMyTurn ? (
              <>
                <ConfirmButton
                  confirmLabel={`Duyệt cấp "${po.currentStep?.name}"?`}
                  confirmActionLabel="Duyệt"
                  onConfirm={() => approveStep.mutate(undefined)}
                  disabled={approveStep.isPending}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Duyệt cấp này
                </ConfirmButton>
                <ConfirmButton
                  variant="destructive"
                  confirmLabel="Trả đơn về nháp?"
                  confirmActionLabel="Trả lại"
                  disabled={rejectApproval.isPending}
                  onConfirm={() => {
                    const why = prompt('Lý do trả lại đơn hàng?');
                    if (why) rejectApproval.mutate(why);
                  }}
                >
                  <XCircle className="h-4 w-4" />
                  Trả lại
                </ConfirmButton>
              </>
            ) : null}
            {canIssue ? (
              <ConfirmButton
                confirmLabel="Phát hành đơn tới nhà cung cấp?"
                confirmActionLabel="Phát hành"
                onConfirm={() => issue.mutate()}
                disabled={issue.isPending}
              >
                <Send className="h-4 w-4" />
                Phát hành
              </ConfirmButton>
            ) : null}
            {canComplete ? (
              <ConfirmButton
                variant="outline"
                confirmLabel="Đánh dấu đơn đã hoàn tất?"
                confirmActionLabel="Hoàn tất"
                onConfirm={() => complete.mutate()}
                disabled={complete.isPending}
              >
                <CheckCircle2 className="h-4 w-4" />
                Hoàn tất
              </ConfirmButton>
            ) : null}
            {canCancel ? (
              <Button variant="outline" onClick={() => setCancelling((v) => !v)}>
                <XCircle className="h-4 w-4" />
                Hủy đơn
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <PoStatusBadge status={po.status} />
        {po.rfq ? (
          <Link
            href={`/rfqs/${po.rfq.id}`}
            className="text-sm text-primary hover:underline"
          >
            {po.rfq.code}
          </Link>
        ) : null}
        <Link
          href={`/purchase-requests/${po.purchaseRequest.id}`}
          className="text-sm text-primary hover:underline"
        >
          {po.purchaseRequest.code}
        </Link>
      </div>

      {editing ? (
        <Card className="mb-4">
          <CardHeader className="pb-3">
            <CardTitle>Sửa đơn hàng</CardTitle>
            {po.status !== 'DRAFT' ? (
              <p className="text-sm text-amber-700 dark:text-amber-400">
                Đơn đang ở trạng thái {po.status === 'APPROVED' ? 'đã duyệt' : 'chờ duyệt'}.
                Lưu thay đổi sẽ đưa đơn về nháp và phải duyệt lại từ cấp đầu tiên.
              </p>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-3">
            {draftItems.map((item, index) => (
              <div key={index} className="grid gap-2 sm:grid-cols-12">
                <div className="sm:col-span-5">
                  <Label>Hàng hóa</Label>
                  <Input
                    value={item.name}
                    onChange={(e) =>
                      setDraftItems((prev) =>
                        prev.map((it, i) =>
                          i === index ? { ...it, name: e.target.value } : it,
                        ),
                      )
                    }
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label>Số lượng</Label>
                  <Input
                    type="number"
                    step="any"
                    value={item.quantity}
                    onChange={(e) =>
                      setDraftItems((prev) =>
                        prev.map((it, i) =>
                          i === index ? { ...it, quantity: e.target.value } : it,
                        ),
                      )
                    }
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label>Đơn vị</Label>
                  <Input
                    value={item.unit}
                    onChange={(e) =>
                      setDraftItems((prev) =>
                        prev.map((it, i) =>
                          i === index ? { ...it, unit: e.target.value } : it,
                        ),
                      )
                    }
                  />
                </div>
                <div className="sm:col-span-3">
                  <Label>Đơn giá</Label>
                  <Input
                    type="number"
                    step="any"
                    value={item.unitPrice}
                    onChange={(e) =>
                      setDraftItems((prev) =>
                        prev.map((it, i) =>
                          i === index ? { ...it, unitPrice: e.target.value } : it,
                        ),
                      )
                    }
                  />
                </div>
              </div>
            ))}
            <div>
              <Label>Ghi chú cho nhà cung cấp</Label>
              <Textarea
                rows={2}
                value={draftNote}
                onChange={(e) => setDraftNote(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditing(false)}>
                Hủy
              </Button>
              <ConfirmButton
                confirmLabel={
                  po.status === 'DRAFT'
                    ? 'Lưu thay đổi?'
                    : 'Lưu và bắt đầu duyệt lại từ đầu?'
                }
                confirmActionLabel="Lưu"
                disabled={saveEdit.isPending}
                onConfirm={() => saveEdit.mutate()}
              >
                Lưu thay đổi
              </ConfirmButton>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {cancelling ? (
        <Card className="mb-4 border-red-300 dark:border-red-900">
          <CardContent className="p-4">
            <p className="mb-2 text-sm font-medium">Lý do hủy đơn hàng</p>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Nêu rõ lý do để nhà cung cấp nắm được."
            />
            <div className="mt-2 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setCancelling(false)}>
                Đóng
              </Button>
              <ConfirmButton
                variant="destructive"
                size="sm"
                confirmLabel="Hủy hẳn đơn hàng này?"
                confirmActionLabel="Hủy đơn"
                disabled={!reason.trim() || cancel.isPending}
                onConfirm={() => cancel.mutate({ reason })}
              >
                Xác nhận hủy
              </ConfirmButton>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {po.status === 'CANCELLED' && po.cancelReason ? (
        <Card className="mb-4 border-red-300 dark:border-red-900">
          <CardContent className="p-4">
            <p className="text-sm font-medium">Đơn hàng đã hủy</p>
            <p className="mt-1 text-sm text-muted-foreground">{po.cancelReason}</p>
          </CardContent>
        </Card>
      ) : null}

      {po.approvalWorkflow || po.status === 'PENDING_APPROVAL' ? (
        <ApprovalProgress order={po} />
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>Chi tiết hàng hóa</CardTitle>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-y border-border bg-muted/40 text-left">
                  <tr>
                    <th className="cell-head">#</th>
                    <th className="cell-head">Hàng hóa</th>
                    <th className="cell-head">Số lượng</th>
                    <th className="cell-head">Đơn giá</th>
                    <th className="cell-head">Thành tiền</th>
                  </tr>
                </thead>
                <tbody>
                  {po.items.map((item) => (
                    <tr key={item.id} className="border-b border-border last:border-0">
                      <td className="cell">{item.lineNo}</td>
                      <td className="cell">
                        <p>{item.name}</p>
                        {item.specification ? (
                          <p className="text-xs text-muted-foreground">
                            {item.specification}
                          </p>
                        ) : null}
                      </td>
                      <td className="cell tabular-nums">
                        {Number(item.quantity).toLocaleString('vi-VN')} {item.unit}
                      </td>
                      <td className="cell tabular-nums">
                        {formatCurrency(item.unitPrice, po.currency)}
                      </td>
                      <td className="cell tabular-nums">
                        {formatCurrency(item.lineTotal, po.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <CardContent className="pt-4">
              <div className="ml-auto max-w-xs space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tạm tính</span>
                  <span className="tabular-nums">
                    {formatCurrency(po.subtotal, po.currency)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Thuế VAT ({Number(po.taxRate)}%)
                  </span>
                  <span className="tabular-nums">
                    {formatCurrency(po.taxAmount, po.currency)}
                  </span>
                </div>
                <div className="flex justify-between border-t border-border pt-1.5 font-semibold">
                  <span>Tổng cộng</span>
                  <span className="tabular-nums">
                    {formatCurrency(po.totalAmount, po.currency)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Điều khoản</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <Detail label="Điều khoản thanh toán" value={po.paymentTerm ?? '—'} />
              <Detail label="Incoterm" value={po.incoterm ?? '—'} />
              <Detail label="Điều kiện giao hàng" value={po.deliveryTerm ?? '—'} />
              <Detail label="Bảo hành" value={po.warranty ?? '—'} />
              <Detail label="Ngày giao hàng" value={formatDate(po.deliveryDate)} />
              <Detail label="Địa chỉ giao" value={po.deliveryAddress ?? '—'} />
              {po.note ? (
                <Detail label="Ghi chú" value={po.note} className="sm:col-span-2" />
              ) : null}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Nhà cung cấp</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="font-medium">{po.supplier.companyName}</p>
              <p className="text-muted-foreground">{po.supplier.code}</p>
              {po.supplier.contactPerson ? (
                <p className="text-muted-foreground">
                  Liên hệ: {po.supplier.contactPerson}
                </p>
              ) : null}
              {po.supplier.email ? (
                <p className="text-muted-foreground">{po.supplier.email}</p>
              ) : null}
              {po.supplier.taxCode ? (
                <p className="text-muted-foreground">MST: {po.supplier.taxCode}</p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tiến trình</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Detail label="Người tạo" value={po.buyer.fullName} />
              <Detail label="Ngày tạo" value={formatDateTime(po.createdAt)} />
              <Detail label="Ngày phát hành" value={formatDateTime(po.issuedAt)} />
              <Detail
                label="NCC xác nhận"
                value={formatDateTime(po.acknowledgedAt)}
              />
              <Detail label="Hoàn tất" value={formatDateTime(po.completedAt)} />
            </CardContent>
          </Card>

        </div>
      </div>

      {po.approvalHistories?.length ? (
        <CollapsibleCard
          className="mt-4"
          title="Lịch sử xử lý"
          description="Toàn bộ lần trình, duyệt và trả lại của đơn hàng này."
          storageKey="po-approval-history"
          defaultOpen={false}
          badge={<Badge>{po.approvalHistories.length}</Badge>}
        >
          <ul className="divide-y divide-border rounded-lg border border-border">
            {po.approvalHistories.map((h) => (
              <li key={h.id} className="px-3 py-2.5 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">
                    {h.step ? `Cấp "${h.step.name}"` : 'Toàn đơn'} ·{' '}
                    {h.decision === 'APPROVED'
                      ? 'Duyệt'
                      : h.decision === 'REJECTED'
                        ? 'Trả lại'
                        : 'Trình duyệt'}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {h.actor.fullName} · {formatDateTime(h.createdAt)}
                  </span>
                </div>
                {h.comment ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">{h.comment}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </CollapsibleCard>
      ) : null}

      {revisions.data?.length ? (
        <CollapsibleCard
          className="mt-4"
          title="Lịch sử chỉnh sửa"
          description="Mỗi lần sửa một đơn đã trình duyệt đều đưa đơn về nháp và phải duyệt lại từ cấp đầu tiên."
          storageKey="po-revisions"
          badge={<Badge tone="warning">{revisions.data.length} lần sửa</Badge>}
        >
          <div className="space-y-3">
            {revisions.data.map((rev) => (
              <div key={rev.id} className="overflow-hidden rounded-lg border border-border">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-2">
                  <span className="text-sm font-medium">
                    Bản {rev.version} · {rev.changedBy.fullName}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(rev.createdAt)} · sửa khi đơn đang{' '}
                    {rev.previousStatus === 'APPROVED' ? 'đã duyệt' : 'chờ duyệt'}
                  </span>
                </div>
                <table className="w-full text-sm">
                  <thead className="border-y border-border bg-muted/40 text-left">
                    <tr>
                      <th className="cell-head !px-3">Nội dung</th>
                      <th className="cell-head !px-3">Trước</th>
                      <th className="cell-head !px-3">Sau</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rev.changes.map((c, i) => (
                      <tr key={i} className="border-t border-border align-top">
                        <td className="cell !px-3">{c.label}</td>
                        <td className="cell !px-3 text-muted-foreground line-through">
                          {c.before}
                        </td>
                        <td className="cell !px-3 font-medium text-emerald-700 dark:text-emerald-400">
                          {c.after}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </CollapsibleCard>
      ) : null}

      <CollapsibleCard
        className="mt-4"
        title="Tài liệu đính kèm"
        description="Đơn hàng đã ký, biên bản giao nhận, hóa đơn…"
        storageKey="po-attachments"
        defaultOpen={false}
      >
        <Attachments
          target="PURCHASE_ORDER"
          entityId={po.id}
          canWrite={canAttach}
          documentTypes={['Đơn hàng ký', 'Biên bản giao nhận', 'Hóa đơn']}
          emptyHint="Chưa đính kèm tài liệu nào cho đơn hàng này."
        />
      </CollapsibleCard>
    </div>
  );
}

/**
 * Tiến trình duyệt dạng thanh ngang: nhìn một cái là biết đang đứng ở cấp nào,
 * cấp nào đã qua và cấp kế tiếp là ai.
 */
function ApprovalProgress({ order }: { order: PurchaseOrder }) {
  const steps = order.approvalWorkflow?.steps ?? [];
  const currentOrder = order.currentStep?.stepOrder ?? (order.status === 'APPROVED' ? steps.length + 1 : 1);
  const doneCount = order.status === 'APPROVED' ? steps.length : currentOrder - 1;
  const nextStep = steps.find((s) => s.stepOrder === currentOrder + 1);

  /**
   * Ai đã duyệt cấp nào trong *vòng duyệt hiện tại*. Đơn bị sửa rồi trình lại
   * vẫn giữ lịch sử của vòng trước, lấy nhầm sẽ hiện "đã duyệt" ở cấp đang chờ.
   */
  const since = order.submittedForApprovalAt
    ? new Date(order.submittedForApprovalAt).getTime()
    : 0;
  const approvedBy = new Map<string, { name: string; at: string }>();
  for (const h of order.approvalHistories ?? []) {
    if (
      h.decision === 'APPROVED' &&
      h.step &&
      new Date(h.createdAt).getTime() >= since
    ) {
      approvedBy.set(h.step.id, { name: h.actor.fullName, at: h.createdAt });
    }
  }

  return (
    <Card className="mb-4">
      <CardContent className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-semibold">Tiến trình duyệt</p>
            <p className="text-sm text-muted-foreground">
              {order.approvalWorkflow?.name} · {doneCount}/{steps.length} cấp đã duyệt
            </p>
          </div>
          <Badge tone={order.status === 'APPROVED' ? 'success' : 'warning'}>
            {order.status === 'APPROVED'
              ? 'Đã duyệt đủ các cấp'
              : `Đang chờ: ${order.currentStep?.name ?? '—'}`}
          </Badge>
        </div>

        <ol className="flex flex-col gap-3 sm:flex-row sm:items-start">
          {steps.map((step, index) => {
            const done = step.stepOrder < currentOrder || order.status === 'APPROVED';
            const active = order.currentStep?.id === step.id;
            const who = approvedBy.get(step.id);
            return (
              <li key={step.id} className="flex flex-1 items-start gap-3 sm:flex-col sm:gap-2">
                <div className="flex w-full items-center gap-2">
                  <span
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
                      done
                        ? 'bg-emerald-600 text-white'
                        : active
                          ? 'bg-amber-500 text-white'
                          : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {done ? <Check className="h-4 w-4" /> : step.stepOrder}
                  </span>
                  {index < steps.length - 1 ? (
                    <span
                      className={cn(
                        'hidden h-0.5 flex-1 sm:block',
                        done ? 'bg-emerald-600' : 'bg-border',
                      )}
                    />
                  ) : null}
                </div>
                <div className="min-w-0">
                  <p
                    className={cn(
                      'text-sm font-medium',
                      active && 'text-amber-700 dark:text-amber-400',
                    )}
                  >
                    {step.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {step.role?.name ?? 'Chưa gán vai trò'}
                  </p>
                  {who ? (
                    <p className="text-xs text-emerald-700 dark:text-emerald-400">
                      {who.name} · {formatDate(who.at)}
                    </p>
                  ) : active ? (
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      Đang chờ duyệt
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Chưa tới lượt</p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>

        <p className="mt-4 rounded-md bg-muted px-3 py-2 text-sm">
          {order.status === 'APPROVED' ? (
            <>Đã qua đủ các cấp. Bước tiếp theo: <strong>phát hành đơn cho nhà cung cấp</strong>.</>
          ) : nextStep ? (
            <>
              Bước tiếp theo sau khi <strong>{order.currentStep?.name}</strong> duyệt:{' '}
              <strong>{nextStep.name}</strong> ({nextStep.role?.name}).
            </>
          ) : (
            <>
              Đây là cấp duyệt cuối. <strong>{order.currentStep?.name}</strong> duyệt xong
              là đơn có thể phát hành.
            </>
          )}
        </p>
      </CardContent>
    </Card>
  );
}

function Detail({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 whitespace-pre-wrap">{value}</p>
    </div>
  );
}
