'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { FileUp, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  PageHeader,
  Skeleton,
} from '@/components/ui';
import { ScoreBadge, useAiStatus } from '@/components/ai-panel';
import { api, apiErrorMessage } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import type { QuotationExtraction } from '@/lib/types';

export default function QuotationReaderPage() {
  const ai = useAiStatus();
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<QuotationExtraction | null>(null);

  const extract = useMutation({
    mutationFn: async (pdf: File) => {
      const form = new FormData();
      form.append('file', pdf);
      const { data } = await api.post<QuotationExtraction>(
        '/ai/quotations/extract',
        form,
        { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120_000 },
      );
      return data;
    },
    onSuccess: (data) => {
      setResult(data);
      toast.success('Đã đọc xong báo giá');
    },
    onError: (error) => toast.error(apiErrorMessage(error, 'Không đọc được file')),
  });

  if (ai.isLoading) return <Skeleton className="h-64 w-full" />;

  if (!ai.data?.enabled) {
    return (
      <div>
        <PageHeader title="Đọc báo giá PDF" />
        <EmptyState
          title="Trợ lý AI chưa được bật"
          description="Thêm ANTHROPIC_API_KEY vào apps/api/.env rồi khởi động lại API để dùng tính năng này."
        />
      </div>
    );
  }

  const total =
    result?.items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0) ?? 0;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Đọc báo giá PDF"
        description="Tải lên file báo giá nhà cung cấp gửi, AI sẽ trích xuất thành dữ liệu có cấu trúc."
      />

      <Card className="mb-4">
        <CardContent className="p-5">
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-border py-10 text-center hover:bg-accent">
            <FileUp className="mb-2 h-8 w-8 text-muted-foreground" />
            <span className="text-sm font-medium">
              {file ? file.name : 'Chọn file PDF báo giá'}
            </span>
            <span className="mt-1 text-xs text-muted-foreground">
              Chỉ nhận PDF, tối đa 20MB
            </span>
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setResult(null);
              }}
            />
          </label>

          <div className="mt-3 flex justify-end">
            <Button
              disabled={!file || extract.isPending}
              onClick={() => file && extract.mutate(file)}
            >
              <Sparkles className="h-4 w-4" />
              {extract.isPending ? 'Đang đọc…' : 'Đọc báo giá'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {extract.isPending ? (
        <Card>
          <CardContent className="space-y-2 p-5">
            <p className="text-sm text-muted-foreground">
              Đang đọc chứng từ, có thể mất 15–60 giây…
            </p>
            <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
      ) : result ? (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                Thông tin đọc được
                <ScoreBadge score={result.confidence} suffix="% tin cậy" />
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
              <Field label="Nhà cung cấp" value={result.supplierName} />
              <Field label="Số báo giá" value={result.quotationNumber} />
              <Field label="Ngày báo giá" value={result.quotationDate} />
              <Field label="Tiền tệ" value={result.currency} />
              <Field label="Điều khoản thanh toán" value={result.paymentTerm} />
              <Field label="Incoterm" value={result.incoterm} />
              <Field
                label="Thời gian giao"
                value={result.leadTimeDays ? `${result.leadTimeDays} ngày` : null}
              />
              <Field label="Bảo hành" value={result.warranty} />
              <Field label="Hiệu lực đến" value={result.validUntil} />
            </CardContent>
          </Card>

          {result.warnings.length ? (
            <Card className="border-amber-300 dark:border-amber-800">
              <CardContent className="p-4">
                <p className="text-sm font-medium">Cần kiểm tra lại</p>
                <ul className="mt-1 list-inside list-disc text-sm text-muted-foreground">
                  {result.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>Dòng hàng</CardTitle>
            </CardHeader>
            {result.items.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-y border-border bg-muted/40 text-left">
                    <tr>
                      <th className="cell-head">Hàng hóa</th>
                      <th className="cell-head">Số lượng</th>
                      <th className="cell-head">Đơn giá</th>
                      <th className="cell-head">Thành tiền</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.items.map((item, i) => (
                      <tr key={i} className="border-b border-border last:border-0">
                        <td className="cell">
                          <p>{item.name}</p>
                          {item.description ? (
                            <p className="text-xs text-muted-foreground">
                              {item.description}
                            </p>
                          ) : null}
                        </td>
                        <td className="cell tabular-nums">
                          {item.quantity.toLocaleString('vi-VN')} {item.unit}
                        </td>
                        <td className="cell tabular-nums">
                          {formatCurrency(item.unitPrice, result.currency ?? 'VND')}
                        </td>
                        <td className="cell tabular-nums">
                          {formatCurrency(
                            item.quantity * item.unitPrice,
                            result.currency ?? 'VND',
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <CardContent>
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Không đọc được dòng hàng nào từ chứng từ.
                </p>
              </CardContent>
            )}
            <CardContent className="pt-4">
              <div className="ml-auto max-w-xs space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tổng tính lại</span>
                  <span className="tabular-nums">
                    {formatCurrency(total, result.currency ?? 'VND')}
                  </span>
                </div>
                {result.totalAmount !== null ? (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tổng ghi trên chứng từ</span>
                    <span className="tabular-nums">
                      {formatCurrency(result.totalAmount, result.currency ?? 'VND')}
                    </span>
                  </div>
                ) : null}
                {result.totalAmount !== null &&
                Math.abs(result.totalAmount - total) > 1 ? (
                  <Badge tone="warning">Tổng tiền lệch, cần đối chiếu lại</Badge>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5">{value ?? '—'}</p>
    </div>
  );
}
