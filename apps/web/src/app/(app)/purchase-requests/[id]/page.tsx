'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Send } from 'lucide-react';
import { toast } from 'sonner';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Label,
  PageHeader,
  Skeleton,
  Textarea,
} from '@/components/ui';
import { PriorityBadge, PrStatusBadge } from '@/components/status-badge';
import {
  AiFinding,
  AiList,
  AiPanel,
  ScoreBadge,
} from '@/components/ai-panel';
import { ConfirmButton } from '@/components/confirm-button';
import { PriceHistoryButton, usePriceHistory } from '@/components/price-history';
import { CommentBody, MentionInput } from '@/components/mention-input';
import { api, apiErrorMessage } from '@/lib/api';
import { cn, formatCurrency, formatDate, formatDateTime } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import type {
  ApprovalStep,
  ApprovalWorkflowRef,
  Comment,
  MentionableUser,
  PurchaseRequest,
  PurchaseRequestAnalysis,
  SupplierSuggestionResult,
} from '@/lib/types';

type ReviewAction = 'approve' | 'reject' | 'request-clarification';

export default function PurchaseRequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const canReview = useAuthStore((s) => s.can('purchase_request:review'));
  const canCreateRfq = useAuthStore((s) => s.can('rfq:write'));

  const [reviewComment, setReviewComment] = useState('');
  const [commentBody, setCommentBody] = useState('');
  const [mentioned, setMentioned] = useState<MentionableUser[]>([]);
  const [internal, setInternal] = useState(false);

  const { data: pr, isLoading } = useQuery({
    queryKey: ['purchase-request', id],
    queryFn: async () =>
      (
        await api.get<
          PurchaseRequest & {
            currentStep: ApprovalStep | null;
            approvalWorkflow: (ApprovalWorkflowRef & { steps: ApprovalStep[] }) | null;
          }
        >(`/purchase-requests/${id}`)
      ).data,
  });

  const { data: comments } = useQuery({
    queryKey: ['pr-comments', id],
    queryFn: async () =>
      (await api.get<Comment[]>(`/purchase-requests/${id}/comments`)).data,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['purchase-request', id] });
    void queryClient.invalidateQueries({ queryKey: ['pr-comments', id] });
    void queryClient.invalidateQueries({ queryKey: ['purchase-requests'] });
  };

  const review = useMutation({
    mutationFn: async (action: ReviewAction) => {
      const { data } = await api.post<PurchaseRequest>(
        `/purchase-requests/${id}/${action}`,
        { comment: reviewComment || undefined },
      );
      return data;
    },
    onSuccess: () => {
      toast.success('Đã cập nhật yêu cầu');
      setReviewComment('');
      invalidate();
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const submit = useMutation({
    mutationFn: async () => api.post(`/purchase-requests/${id}/submit`),
    onSuccess: () => {
      toast.success('Đã gửi yêu cầu để duyệt');
      invalidate();
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const startReview = useMutation({
    mutationFn: async () => api.post(`/purchase-requests/${id}/start-review`),
    onSuccess: () => {
      toast.success('Bạn đang phụ trách yêu cầu này');
      invalidate();
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const addComment = useMutation({
    mutationFn: async () =>
      api.post(`/purchase-requests/${id}/comments`, {
        body: commentBody,
        mentionUserIds: mentioned.map((u) => u.id),
        isInternal: internal,
      }),
    onSuccess: () => {
      setCommentBody('');
      setMentioned([]);
      invalidate();
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  // Người duyệt cần thấy ngay lần trước mua bao nhiêu trước khi bấm Duyệt.
  // Hook phải đứng trước mọi lần return sớm.
  const priceHistory = usePriceHistory((pr?.items ?? []).map((i) => i.materialId));

  if (isLoading || !pr) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const isRequester = pr.requesterId === user?.id;

  const canEdit =
    isRequester && ['DRAFT', 'NEED_CLARIFICATION'].includes(pr.status);
  const isReviewable = ['SUBMITTED', 'BUYER_REVIEW'].includes(pr.status);

  return (
    <div className="mx-auto max-w-5xl">
      <Button
        variant="ghost"
        size="sm"
        className="mb-3"
        onClick={() => router.push('/purchase-requests')}
      >
        <ArrowLeft className="h-4 w-4" />
        Danh sách yêu cầu
      </Button>

      <PageHeader
        title={`${pr.code} — ${pr.title}`}
        description={`${pr.category.nameEn ?? pr.category.name} · ${pr.department.name} · ${pr.requester.fullName}`}
        actions={
          <div className="flex flex-wrap gap-2">
            {canEdit ? (
              <ConfirmButton
                variant="outline"
                confirmLabel="Gửi yêu cầu đi duyệt?"
                confirmActionLabel="Gửi"
                onConfirm={() => submit.mutate()}
                disabled={submit.isPending}
              >
                <Send className="h-4 w-4" />
                Gửi duyệt
              </ConfirmButton>
            ) : null}
            {canReview && pr.status === 'SUBMITTED' ? (
              <Button
                variant="outline"
                onClick={() => startReview.mutate()}
                disabled={startReview.isPending}
              >
                Nhận xem xét
              </Button>
            ) : null}
            {canCreateRfq && pr.status === 'APPROVED' ? (
              <Link href={`/rfqs/new?purchaseRequestId=${pr.id}`}>
                <Button>Tạo RFQ</Button>
              </Link>
            ) : null}
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <PrStatusBadge status={pr.status} />
        <PriorityBadge priority={pr.priority} />
        {pr.buyer ? (
          <Badge tone="neutral">Buyer: {pr.buyer.fullName}</Badge>
        ) : null}
      </div>

      {pr.status === 'NEED_CLARIFICATION' && pr.clarificationNote ? (
        <Card className="mb-4 border-amber-300 dark:border-amber-800">
          <CardContent className="p-4">
            <p className="text-sm font-medium">Bộ phận mua hàng cần bổ sung:</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {pr.clarificationNote}
            </p>
          </CardContent>
        </Card>
      ) : null}

      {pr.status === 'REJECTED' && pr.rejectReason ? (
        <Card className="mb-4 border-red-300 dark:border-red-900">
          <CardContent className="p-4">
            <p className="text-sm font-medium">Lý do từ chối:</p>
            <p className="mt-1 text-sm text-muted-foreground">{pr.rejectReason}</p>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Thông tin chung</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <Detail label="Người yêu cầu" value={pr.requester.fullName} />
              <Detail label="Bộ phận" value={pr.department.name} />
              <Detail label="Dự án" value={pr.project?.name ?? '—'} />
              <Detail label="Ngày cần hàng" value={formatDate(pr.neededByDate)} />
              <Detail
                label="Ngân sách"
                value={formatCurrency(pr.budgetAmount, pr.currency)}
              />
              <Detail
                label="Giá trị dự kiến"
                value={formatCurrency(pr.estimatedTotal, pr.currency)}
              />
              {pr.reason ? (
                <Detail label="Lý do mua" value={pr.reason} className="sm:col-span-2" />
              ) : null}
              {pr.description ? (
                <Detail label="Mô tả" value={pr.description} className="sm:col-span-2" />
              ) : null}
            </CardContent>
          </Card>

          {pr.dynamicValues.length ? (
            <Card>
              <CardHeader>
                <CardTitle>Thông tin theo lĩnh vực</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                {pr.dynamicValues
                  .slice()
                  .sort((a, b) => a.field.sortOrder - b.field.sortOrder)
                  .map((v) => (
                    <Detail
                      key={v.id}
                      label={v.field.label}
                      value={v.value ?? '—'}
                    />
                  ))}
              </CardContent>
            </Card>
          ) : null}

          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>Hàng hóa / dịch vụ</CardTitle>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-y border-border bg-muted/40 text-left">
                  <tr>
                    <th className="cell-head">#</th>
                    <th className="cell-head">Tên hàng</th>
                    <th className="cell-head">Số lượng</th>
                    <th className="cell-head">Đơn giá dự kiến</th>
                    <th className="cell-head">Thành tiền</th>
                    <th className="cell-head">Lịch sử mua</th>
                  </tr>
                </thead>
                <tbody>
                  {pr.items.map((item) => (
                    <tr key={item.id} className="border-b border-border last:border-0">
                      <td className="cell">{item.lineNo}</td>
                      <td className="cell">
                        <p>{item.name}</p>
                        {item.material ? (
                          <Link
                            href={`/materials/${item.material.id}`}
                            className="font-mono text-xs text-primary hover:underline"
                          >
                            {item.material.code}
                          </Link>
                        ) : null}
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
                        {formatCurrency(item.estimatedPrice, pr.currency)}
                      </td>
                      <td className="cell tabular-nums">
                        {item.estimatedPrice
                          ? formatCurrency(
                              Number(item.estimatedPrice) * Number(item.quantity),
                              pr.currency,
                            )
                          : '—'}
                      </td>
                      <td className="min-w-52 cell">
                        <PriceHistoryButton
                          materialId={item.materialId}
                          materialCode={item.material?.code}
                          loading={priceHistory.isLoading}
                          summary={
                            item.materialId
                              ? priceHistory.data?.[item.materialId]
                              : undefined
                          }
                          currentPrice={
                            item.estimatedPrice ? Number(item.estimatedPrice) : null
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {canReview && isReviewable ? (
            <Card>
              <CardHeader>
                <CardTitle>Xử lý yêu cầu</CardTitle>
              </CardHeader>
              <CardContent>
                <Label>Ý kiến của bộ phận mua hàng</Label>
                <Textarea
                  placeholder="Bắt buộc khi từ chối hoặc yêu cầu bổ sung."
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  <ConfirmButton
                    confirmLabel="Duyệt yêu cầu này?"
                    confirmActionLabel="Duyệt"
                    onConfirm={() => review.mutate('approve')}
                    disabled={review.isPending}
                  >
                    Duyệt
                  </ConfirmButton>
                  <ConfirmButton
                    variant="outline"
                    confirmLabel="Trả lại để bổ sung?"
                    confirmActionLabel="Trả lại"
                    onConfirm={() => review.mutate('request-clarification')}
                    disabled={review.isPending || !reviewComment.trim()}
                  >
                    Yêu cầu bổ sung
                  </ConfirmButton>
                  <ConfirmButton
                    variant="destructive"
                    confirmLabel="Từ chối yêu cầu này?"
                    confirmActionLabel="Từ chối"
                    onConfirm={() => review.mutate('reject')}
                    disabled={review.isPending || !reviewComment.trim()}
                  >
                    Từ chối
                  </ConfirmButton>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {canReview ? (
            <AiPanel<PurchaseRequestAnalysis>
              title="Rà soát yêu cầu"
              description="Kiểm tra thông tin còn thiếu, rủi ro và câu hỏi nên hỏi lại người yêu cầu."
              buttonLabel="Rà soát bằng AI"
              endpoint={`/ai/purchase-requests/${pr.id}/analyze`}
            >
              {(a) => (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <ScoreBadge score={a.completenessScore} suffix="/100 đầy đủ" />
                    <Badge tone={a.readyForRfq ? 'success' : 'warning'}>
                      {a.readyForRfq ? 'Đủ điều kiện tạo RFQ' : 'Chưa nên tạo RFQ'}
                    </Badge>
                  </div>
                  <p className="text-sm">{a.summary}</p>

                  {a.missingInformation.length ? (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">
                        Thông tin còn thiếu
                      </p>
                      {a.missingInformation.map((m, i) => (
                        <AiFinding key={i} title={m.field} body={m.why} severity={m.severity} />
                      ))}
                    </div>
                  ) : null}

                  {a.risks.length ? (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">Rủi ro</p>
                      {a.risks.map((r, i) => (
                        <AiFinding key={i} title={r.title} body={r.detail} severity={r.severity} />
                      ))}
                    </div>
                  ) : null}

                  <AiList label="Câu hỏi nên làm rõ" items={a.suggestedQuestions} />
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">
                      Nhận xét ngân sách
                    </p>
                    <p className="text-sm">{a.budgetAssessment}</p>
                  </div>
                </div>
              )}
            </AiPanel>
          ) : null}

          {canCreateRfq && pr.status === 'APPROVED' ? (
            <AiPanel<SupplierSuggestionResult>
              title="Gợi ý nhà cung cấp"
              description="Xếp hạng nhà cung cấp đã duyệt theo mức phù hợp với yêu cầu này."
              buttonLabel="Gợi ý bằng AI"
              endpoint={`/ai/purchase-requests/${pr.id}/suggest-suppliers`}
            >
              {(r) => (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">{r.reasoning}</p>
                  {r.suggestions.map((s) => (
                    <div key={s.supplierId} className="rounded-md border border-border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-medium">{s.companyName}</span>
                        <div className="flex items-center gap-2">
                          <ScoreBadge score={s.fitScore} suffix="/100" />
                          <Badge
                            tone={
                              s.recommendation === 'mời_ngay'
                                ? 'success'
                                : s.recommendation === 'cân_nhắc'
                                  ? 'warning'
                                  : 'neutral'
                            }
                          >
                            {s.recommendation.replace(/_/g, ' ')}
                          </Badge>
                        </div>
                      </div>
                      <AiList label="Điểm mạnh" items={s.strengths} className="mt-2" />
                      <AiList label="Cần lưu ý" items={s.concerns} className="mt-2" />
                    </div>
                  ))}
                </div>
              )}
            </AiPanel>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Trao đổi</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {!comments?.length ? (
                  <p className="text-sm text-muted-foreground">Chưa có bình luận.</p>
                ) : (
                  comments.map((c) => (
                    <div key={c.id} className="rounded-md bg-muted p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">{c.author.fullName}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatDateTime(c.createdAt)}
                        </span>
                      </div>
                      {c.isInternal ? (
                        <Badge tone="warning" className="mt-1">
                          Nội bộ
                        </Badge>
                      ) : null}
                      <CommentBody body={c.body} mentions={c.mentions} />
                    </div>
                  ))
                )}
              </div>

              <div className="mt-4">
                <MentionInput
                  purchaseRequestId={pr.id}
                  value={commentBody}
                  onChange={setCommentBody}
                  mentioned={mentioned}
                  onMentionedChange={setMentioned}
                />
                <div className="mt-2 flex items-center justify-between">
                  {canReview ? (
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-input"
                        checked={internal}
                        onChange={(e) => setInternal(e.target.checked)}
                      />
                      Ghi chú nội bộ
                    </label>
                  ) : (
                    <span />
                  )}
                  <Button
                    size="sm"
                    disabled={!commentBody.trim() || addComment.isPending}
                    onClick={() => addComment.mutate()}
                  >
                    Gửi
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
        {pr.approvalWorkflow?.steps?.length ? (
          <Card>
            <CardHeader>
              <CardTitle>Tiến trình duyệt</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                {pr.approvalWorkflow.name}
              </p>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3">
                {pr.approvalWorkflow.steps.map((step) => {
                  const currentOrder = pr.currentStep?.stepOrder ?? Infinity;
                  const done =
                    pr.status === 'APPROVED' || step.stepOrder < currentOrder;
                  const active = step.id === pr.currentStep?.id;
                  return (
                    <li key={step.id} className="flex items-start gap-3">
                      <span
                        className={cn(
                          'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                          done
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                            : active
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted text-muted-foreground',
                        )}
                      >
                        {done ? '✓' : step.stepOrder}
                      </span>
                      <div className="min-w-0">
                        <p
                          className={cn(
                            'text-sm',
                            active ? 'font-semibold' : 'font-medium',
                          )}
                        >
                          {step.name}
                        </p>
                        {step.role ? (
                          <p className="text-xs text-muted-foreground">
                            {step.role.name}
                          </p>
                        ) : null}
                        {active ? (
                          <Badge tone="info" className="mt-1">
                            Đang chờ duyệt
                          </Badge>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </CardContent>
          </Card>
        ) : null}

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Lịch sử xử lý</CardTitle>
          </CardHeader>
          <CardContent>
            {!pr.approvalHistories.length ? (
              <p className="text-sm text-muted-foreground">Chưa có hoạt động.</p>
            ) : (
              <ol className="space-y-4">
                {pr.approvalHistories.map((h) => (
                  <li key={h.id} className="border-l-2 border-border pl-3">
                    <p className="text-sm font-medium">
                      {h.fromStatus} → {h.toStatus}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {h.actor.fullName} · {formatDateTime(h.createdAt)}
                    </p>
                    {h.comment ? (
                      <p className="mt-1 text-sm text-muted-foreground">{h.comment}</p>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
        </div>
      </div>
    </div>
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
