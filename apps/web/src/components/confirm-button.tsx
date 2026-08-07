'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui';
import { cn } from '@/lib/utils';

/** Bấm nhầm lần hai trong vòng vài giây là chuyện hiếm, nên tự hủy sau 6 giây. */
const ARM_TIMEOUT = 6000;

export interface ConfirmButtonProps extends Omit<ButtonProps, 'onClick'> {
  onConfirm: () => void;
  /** Câu hỏi hiện ở bước hai. Ngắn gọn, ví dụ "Phát hành đơn hàng?" */
  confirmLabel?: string;
  /** Nhãn nút xác nhận ở bước hai. */
  confirmActionLabel?: string;
}

/**
 * Nút hai bước: bấm lần đầu chỉ chuyển sang trạng thái hỏi lại, phải bấm tiếp
 * "Xác nhận" mới chạy. Dùng cho mọi thao tác thay đổi trạng thái hoặc xóa, để
 * một cú bấm nhầm không gây hậu quả.
 */
export function ConfirmButton({
  onConfirm,
  confirmLabel = 'Chắc chắn?',
  confirmActionLabel = 'Xác nhận',
  children,
  className,
  disabled,
  variant,
  size,
  ...props
}: ConfirmButtonProps) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const disarm = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setArmed(false);
  };

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  if (!armed) {
    return (
      <Button
        {...props}
        variant={variant}
        size={size}
        className={className}
        disabled={disabled}
        onClick={() => {
          setArmed(true);
          timer.current = setTimeout(() => setArmed(false), ARM_TIMEOUT);
        }}
      >
        {children}
      </Button>
    );
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border border-amber-400 bg-amber-50 px-2 py-1 dark:border-amber-700 dark:bg-amber-950',
      )}
      role="group"
      aria-label={confirmLabel}
      data-confirm-step="2"
    >
      <span className="px-1 text-xs font-medium text-amber-900 dark:text-amber-200">
        {confirmLabel}
      </span>
      <Button
        size="sm"
        variant={variant === 'destructive' ? 'destructive' : 'default'}
        disabled={disabled}
        autoFocus
        onClick={() => {
          disarm();
          onConfirm();
        }}
      >
        <Check className="h-3.5 w-3.5" />
        {confirmActionLabel}
      </Button>
      <Button size="sm" variant="ghost" aria-label="Hủy" onClick={disarm}>
        <X className="h-3.5 w-3.5" />
      </Button>
    </span>
  );
}

/**
 * Biến thể chỉ có biểu tượng, dùng trong các ô thao tác chật của bảng. Bước hai
 * thu lại thành cặp nút tick / x nên không làm vỡ bố cục dòng.
 */
export function ConfirmIconButton({
  onConfirm,
  title,
  children,
  disabled,
  className,
}: {
  onConfirm: () => void;
  title: string;
  children: React.ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const disarm = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setArmed(false);
  };

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  if (!armed) {
    return (
      <Button
        variant="ghost"
        size="sm"
        title={title}
        disabled={disabled}
        className={className}
        onClick={() => {
          setArmed(true);
          timer.current = setTimeout(() => setArmed(false), ARM_TIMEOUT);
        }}
      >
        {children}
      </Button>
    );
  }

  return (
    <span
      role="group"
      aria-label={`${title} — xác nhận`}
      data-confirm-step="2"
      className="inline-flex items-center rounded-md border border-amber-400 bg-amber-50 dark:border-amber-700 dark:bg-amber-950"
    >
      <Button
        variant="ghost"
        size="sm"
        title={`${title} — xác nhận`}
        disabled={disabled}
        autoFocus
        onClick={() => {
          disarm();
          onConfirm();
        }}
      >
        <Check className="h-4 w-4 text-emerald-600" />
      </Button>
      <Button variant="ghost" size="sm" title="Hủy" onClick={disarm}>
        <X className="h-4 w-4" />
      </Button>
    </span>
  );
}
