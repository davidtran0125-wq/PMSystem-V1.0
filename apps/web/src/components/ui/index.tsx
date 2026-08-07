'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { ChevronDown } from 'lucide-react';
import * as React from 'react';
import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

export const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[background-color,box-shadow,transform] active:translate-y-px disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-sm hover:brightness-110',
        outline: 'border border-input bg-card hover:bg-accent',
        ghost: 'hover:bg-accent',
        destructive: 'bg-destructive text-white shadow-sm hover:brightness-110',
        subtle: 'bg-muted text-foreground hover:brightness-95 dark:hover:brightness-125',
      },
      size: {
        default: 'h-9 px-3.5',
        sm: 'h-8 px-3 text-xs',
        lg: 'h-10 px-5',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
);
Button.displayName = 'Button';

// ---------------------------------------------------------------------------
// Form controls
// ---------------------------------------------------------------------------

// Cùng chiều cao 36px với nút, để hàng nút và ô nhập nằm thẳng nhau.
const fieldStyles =
  'flex w-full rounded-md border border-input bg-card px-3 py-1.5 text-sm shadow-[inset_0_1px_1px_rgba(11,21,36,.03)] placeholder:text-muted-foreground transition-colors hover:border-muted-foreground/40 disabled:cursor-not-allowed disabled:opacity-60 disabled:bg-muted';

export const Input = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(fieldStyles, 'h-9', className)} {...props} />
));
Input.displayName = 'Input';

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(fieldStyles, 'min-h-20', className)}
    {...props}
  />
));
Textarea.displayName = 'Textarea';

export const Select = forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...props }, ref) => (
  <select ref={ref} className={cn(fieldStyles, 'h-9', className)} {...props} />
));
Select.displayName = 'Select';

export function Label({
  className,
  required,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement> & { required?: boolean }) {
  return (
    <label
      className={cn(
        'mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground',
        className,
      )}
      {...props}
    >
      {props.children}
      {required ? <span className="text-destructive ml-0.5">*</span> : null}
    </label>
  );
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-destructive">{message}</p>;
}

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------

export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-card text-card-foreground shadow-[var(--shadow-card)]',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5 pb-3', className)} {...props} />;
}

export function CardTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn('text-lg font-semibold leading-tight', className)}
      {...props}
    />
  );
}

export function CardDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn('text-sm text-muted-foreground mt-1', className)} {...props} />
  );
}

export function CardContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5 pt-0', className)} {...props} />;
}

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------

const badgeVariants = cva(
  'inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium leading-5',
  {
    variants: {
      tone: {
        neutral: 'border-border bg-muted text-muted-foreground',
        info: 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-300',
        success:
          'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300',
        warning:
          'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300',
        danger: 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export function Badge({
  className,
  tone,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('skeleton', className)} {...props} />;
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-14 text-center">
      <p className="font-medium">{title}</p>
      {description ? (
        <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {description ? (
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bảng
// ---------------------------------------------------------------------------

/**
 * Khung bảng dùng chung. Trước đây mỗi trang tự dựng thẻ `table` với một kiểu
 * đệm ô riêng — sáu kiểu khác nhau trên cùng một ứng dụng — nên bảng ở mỗi màn
 * hình lại cao thấp một khác.
 */
export function DataTable({
  head,
  children,
  className,
}: {
  head: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full text-sm">
        <thead className="border-y border-border bg-muted/40 text-left">
          <tr>{head}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Th({
  className,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn('cell-head', className)} {...props} />;
}

export function Td({
  className,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('cell', className)} {...props} />;
}

export function Tr({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn(
        'border-b border-border transition-colors last:border-0 hover:bg-accent/40',
        className,
      )}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// Phân trang
// ---------------------------------------------------------------------------

/**
 * Thanh phân trang cho danh sách dài. Trước đây các trang gọi cứng pageSize
 * lớn rồi đổ hết ra một màn, nên quá số đó là dữ liệu biến mất mà không báo gì.
 */
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm">
      <p className="text-muted-foreground">
        {from}–{to} trên {total.toLocaleString('vi-VN')}
      </p>
      <div className="flex items-center gap-2">
        {onPageSizeChange ? (
          <Select
            className="h-8 w-28 py-1 text-xs"
            value={String(pageSize)}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            aria-label="Số dòng mỗi trang"
          >
            {[10, 20, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n} / trang
              </option>
            ))}
          </Select>
        ) : null}
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Trước
        </Button>
        <span className="tabular-nums text-muted-foreground">
          {page} / {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Sau
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ngăn thu gọn được
// ---------------------------------------------------------------------------

/**
 * Thẻ có thể thu gọn. Các trang nghiệp vụ dài hơn một màn hình, nên phần nào
 * không cần nhìn thường xuyên thì gập lại cho gọn; trạng thái gập được nhớ theo
 * `storageKey` để lần sau mở lại vẫn như cũ.
 */
export function CollapsibleCard({
  title,
  description,
  actions,
  badge,
  defaultOpen = true,
  storageKey,
  className,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  storageKey?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(defaultOpen);

  React.useEffect(() => {
    if (!storageKey || typeof window === 'undefined') return;
    const saved = window.localStorage.getItem(`pms.panel.${storageKey}`);
    if (saved !== null) setOpen(saved === '1');
  }, [storageKey]);

  const toggle = () =>
    setOpen((v) => {
      if (storageKey && typeof window !== 'undefined') {
        window.localStorage.setItem(`pms.panel.${storageKey}`, v ? '0' : '1');
      }
      return !v;
    });

  return (
    <Card className={cn('overflow-hidden', className)}>
      <div className="flex items-start justify-between gap-3 p-5 pb-3">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-start gap-2 text-left"
        >
          <ChevronDown
            className={cn(
              'mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform',
              !open && '-rotate-90',
            )}
          />
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2 font-semibold tracking-tight">
              {title}
              {badge}
            </span>
            {description ? (
              <span className="mt-1 block text-sm text-muted-foreground">
                {description}
              </span>
            ) : null}
          </span>
        </button>
        {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
      </div>
      {open ? <div className="px-5 pb-5">{children}</div> : null}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Dải lọc theo trạng thái
// ---------------------------------------------------------------------------

/**
 * Dải nút trạng thái kèm số lượng, đặt ngay trên bảng.
 *
 * Con số là tổng trên toàn bộ dữ liệu khớp bộ lọc hiện hành **trừ chính bộ lọc
 * trạng thái**, nên chúng không nhảy khi người dùng bấm qua lại giữa các trạng
 * thái — đó mới là thứ giúp họ biết còn bao nhiêu việc phải làm.
 */
export function StatusFilterBar<T extends string>({
  options,
  value,
  onChange,
  counts,
  total,
  isLoading,
  className,
}: {
  options: { value: T | ''; label: string }[];
  value: string;
  onChange: (value: T | '') => void;
  counts?: Partial<Record<T, number>>;
  total?: number;
  isLoading?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('mb-4 flex flex-wrap gap-2', className)}>
      {options.map((option) => {
        const n = option.value ? (counts?.[option.value] ?? 0) : (total ?? 0);
        const active = value === option.value;
        return (
          <button
            key={option.value || 'ALL'}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              'flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors',
              active
                ? 'border-primary bg-accent font-medium'
                : 'border-border text-muted-foreground hover:bg-accent/40',
            )}
          >
            {option.label}
            <span
              className={cn(
                'rounded-full px-1.5 text-xs tabular-nums',
                active ? 'bg-primary text-primary-foreground' : 'bg-muted',
              )}
            >
              {isLoading ? '·' : n}
            </span>
          </button>
        );
      })}
    </div>
  );
}
