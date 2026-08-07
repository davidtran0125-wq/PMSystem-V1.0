'use client';

import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileText, Paperclip, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Badge, Button, Input, Skeleton } from '@/components/ui';
import { ConfirmIconButton } from '@/components/confirm-button';
import { api, apiErrorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import type { Attachment, AttachmentTarget } from '@/lib/types';

const MAX_SIZE = 25 * 1024 * 1024;

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Trình duyệt không gửi kèm Authorization khi mở link, nên file được tải qua
 * axios rồi mới dựng blob URL để lưu.
 */
async function saveFile(url: string, fallbackName: string) {
  const res = await api.get<Blob>(url, { responseType: 'blob' });
  const disposition = String(res.headers['content-disposition'] ?? '');
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
  const name = encoded ? decodeURIComponent(encoded) : fallbackName;

  const href = URL.createObjectURL(res.data);
  const link = document.createElement('a');
  link.href = href;
  link.download = name;
  link.click();
  URL.revokeObjectURL(href);
}

export function Attachments({
  target,
  entityId,
  canWrite = true,
  documentTypes,
  emptyHint = 'Chưa có tài liệu nào.',
}: {
  target: AttachmentTarget;
  entityId: string;
  canWrite?: boolean;
  /** Gợi ý phân loại tài liệu, ví dụ ISO / Bản scan có dấu. */
  documentTypes?: string[];
  emptyHint?: string;
}) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [documentType, setDocumentType] = useState(documentTypes?.[0] ?? '');
  const [dragging, setDragging] = useState(false);
  const queryKey = ['attachments', target, entityId];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () =>
      (await api.get<Attachment[]>('/attachments', { params: { target, entityId } })).data,
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const body = new FormData();
      body.append('file', file);
      return api.post('/attachments', body, {
        params: { target, entityId, ...(documentType ? { documentType } : {}) },
      });
    },
    onSuccess: (res) => {
      const created = res.data as Attachment;
      toast.success(
        created.version > 1
          ? `Đã tải lên phiên bản ${created.version} của ${created.originalName}`
          : `Đã tải lên ${created.originalName}`,
      );
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) => toast.error(apiErrorMessage(error, 'Không tải file lên được')),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/attachments/${id}`),
    onSuccess: () => {
      toast.success('Đã xóa tài liệu');
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const download = useMutation({
    mutationFn: async (a: Attachment) =>
      saveFile(`/attachments/${a.id}/download`, a.originalName),
    onError: (error) => toast.error(apiErrorMessage(error, 'Không tải file về được')),
  });

  function send(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (file.size > MAX_SIZE) {
      toast.error(`File tối đa 25 MB, file này ${humanSize(file.size)}`);
      return;
    }
    upload.mutate(file);
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div className="space-y-3">
      {canWrite ? (
        <div className="space-y-2">
          {documentTypes?.length ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Loại tài liệu:</span>
              {documentTypes.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setDocumentType(t)}
                  className={
                    documentType === t
                      ? 'rounded-full bg-primary px-3 py-1 text-xs text-primary-foreground'
                      : 'rounded-full border border-border px-3 py-1 text-xs hover:bg-accent'
                  }
                >
                  {t}
                </button>
              ))}
            </div>
          ) : null}

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              send(e.dataTransfer.files);
            }}
            className={`flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-6 text-center text-sm transition-colors ${
              dragging ? 'border-primary bg-accent/50' : 'border-border'
            }`}
          >
            <Upload className="h-5 w-5 text-muted-foreground" />
            <p className="text-muted-foreground">
              Kéo thả file vào đây hoặc chọn từ máy. Tối đa 25 MB — PDF, Word, Excel, ảnh, ZIP.
            </p>
            <Input
              ref={inputRef}
              type="file"
              className="hidden"
              onChange={(e) => send(e.target.files)}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={upload.isPending}
              onClick={() => inputRef.current?.click()}
            >
              <Paperclip className="h-4 w-4" />
              {upload.isPending ? 'Đang tải lên…' : 'Chọn file'}
            </Button>
            <p className="text-xs text-muted-foreground">
              Tải lên file trùng tên sẽ tạo phiên bản mới, bản cũ vẫn giữ lại.
            </p>
          </div>
        </div>
      ) : null}

      {isLoading ? (
        <Skeleton className="h-12 w-full" />
      ) : !data?.length ? (
        <p className="text-sm text-muted-foreground">{emptyHint}</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {data.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-3 py-2.5">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-medium">{a.originalName}</span>
                  {a.version > 1 ? <Badge tone="info">v{a.version}</Badge> : null}
                  {a.documentType ? <Badge>{a.documentType}</Badge> : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  {humanSize(a.size)} · {formatDateTime(a.createdAt)}
                  {a.uploadedBy ? ` · ${a.uploadedBy.fullName}` : ''}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                title="Tải về"
                disabled={download.isPending}
                onClick={() => download.mutate(a)}
              >
                <Download className="h-4 w-4" />
              </Button>
              {canWrite ? (
                <ConfirmIconButton
                  title={`Xóa tài liệu ${a.originalName}`}
                  disabled={remove.isPending}
                  onConfirm={() => remove.mutate(a.id)}
                >
                  <Trash2 className="h-4 w-4 text-red-600" />
                </ConfirmIconButton>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export { saveFile };
