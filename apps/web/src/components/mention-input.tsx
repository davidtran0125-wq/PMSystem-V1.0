'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AtSign } from 'lucide-react';
import { Badge, Textarea } from '@/components/ui';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { MentionableUser } from '@/lib/types';

/** Từ khóa đang gõ sau dấu @ ở ngay trước con trỏ, null nếu không đang nhắc ai. */
function activeQuery(text: string, caret: number): string | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf('@');
  if (at === -1) return null;
  // Dấu @ phải đứng đầu dòng hoặc sau khoảng trắng, và phần sau chưa xuống dòng.
  if (at > 0 && !/\s/.test(before[at - 1])) return null;
  const term = before.slice(at + 1);
  if (/[\n]/.test(term)) return null;
  return term;
}

/**
 * Ô nhập bình luận có gợi ý nhắc tên. Người được nhắc lưu thành danh sách id
 * kèm theo, chứ không dò lại từ nội dung — tên người dùng đổi được, dò chuỗi
 * thì không chắc chắn.
 */
export function MentionInput({
  purchaseRequestId,
  value,
  onChange,
  mentioned,
  onMentionedChange,
  placeholder = 'Nhập bình luận… gõ @ để nhắc tên ai đó',
  disabled,
}: {
  purchaseRequestId: string;
  value: string;
  onChange: (value: string) => void;
  mentioned: MentionableUser[];
  onMentionedChange: (users: MentionableUser[]) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [highlight, setHighlight] = useState(0);

  const people = useQuery({
    queryKey: ['mentionable-users', purchaseRequestId],
    queryFn: async () =>
      (
        await api.get<MentionableUser[]>(
          `/purchase-requests/${purchaseRequestId}/comments/mentionable-users`,
        )
      ).data,
  });

  const matches = useMemo(() => {
    if (query === null) return [];
    const term = query.trim().toLowerCase();
    return (people.data ?? [])
      .filter(
        (u) =>
          !term ||
          u.fullName.toLowerCase().includes(term) ||
          u.email.toLowerCase().includes(term),
      )
      .slice(0, 6);
  }, [people.data, query]);

  useEffect(() => setHighlight(0), [query]);

  // Người bị xóa khỏi nội dung thì bỏ khỏi danh sách nhắc, tránh gửi thông báo
  // cho người không còn xuất hiện trong câu.
  useEffect(() => {
    const still = mentioned.filter((u) => value.includes(`@${u.fullName}`));
    if (still.length !== mentioned.length) onMentionedChange(still);
  }, [value, mentioned, onMentionedChange]);

  const pick = (user: MentionableUser) => {
    const el = ref.current;
    if (!el) return;
    const caret = el.selectionStart ?? value.length;
    const before = value.slice(0, caret);
    const at = before.lastIndexOf('@');
    const next = `${value.slice(0, at)}@${user.fullName} ${value.slice(caret)}`;
    onChange(next);
    if (!mentioned.some((u) => u.id === user.id)) {
      onMentionedChange([...mentioned, user]);
    }
    setQuery(null);
    requestAnimationFrame(() => {
      const pos = at + user.fullName.length + 2;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  return (
    <div className="relative">
      <Textarea
        ref={ref}
        rows={3}
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.value);
          setQuery(activeQuery(e.target.value, e.target.selectionStart ?? 0));
        }}
        onClick={(e) =>
          setQuery(
            activeQuery(value, (e.target as HTMLTextAreaElement).selectionStart ?? 0),
          )
        }
        onBlur={() => setTimeout(() => setQuery(null), 150)}
        onKeyDown={(e) => {
          if (query === null || !matches.length) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlight((h) => (h + 1) % matches.length);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlight((h) => (h - 1 + matches.length) % matches.length);
          } else if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            pick(matches[highlight]);
          } else if (e.key === 'Escape') {
            setQuery(null);
          }
        }}
      />

      {query !== null && matches.length ? (
        <ul className="absolute bottom-full z-30 mb-1 w-72 overflow-hidden rounded-lg border border-border bg-card shadow-lg">
          {matches.map((u, i) => (
            <li key={u.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(u)}
                className={cn(
                  'flex w-full flex-col px-3 py-2 text-left text-sm',
                  i === highlight ? 'bg-accent' : 'hover:bg-accent/60',
                )}
              >
                <span className="font-medium">{u.fullName}</span>
                <span className="text-xs text-muted-foreground">
                  {[u.jobTitle, u.department?.name].filter(Boolean).join(' · ') ||
                    u.email}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {mentioned.length ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <AtSign className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Sẽ báo cho:</span>
          {mentioned.map((u) => (
            <Badge key={u.id} tone="info">
              {u.fullName}
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Tô đậm tên những người được nhắc trong nội dung bình luận. */
export function CommentBody({
  body,
  mentions,
}: {
  body: string;
  mentions?: { user: { id: string; fullName: string } }[];
}) {
  const names = (mentions ?? []).map((m) => m.user.fullName);
  if (!names.length) {
    return <p className="mt-1 whitespace-pre-wrap text-sm">{body}</p>;
  }

  // Tên dài đứng trước để "Nguyễn Văn A" không bị "Nguyễn Văn" cắt mất.
  const pattern = new RegExp(
    `@(${names
      .sort((a, b) => b.length - a.length)
      .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|')})`,
    'g',
  );

  return (
    <p className="mt-1 whitespace-pre-wrap text-sm">
      {body.split(pattern).map((part, i) =>
        names.includes(part) ? (
          <span
            key={i}
            className="rounded bg-sky-100 px-1 font-medium text-sky-900 dark:bg-sky-950 dark:text-sky-200"
          >
            @{part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </p>
  );
}
