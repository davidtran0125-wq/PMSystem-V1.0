'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
} from '@/components/ui';
import { api, apiErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { AiSeverity, AiStatus } from '@/lib/types';

export function useAiStatus() {
  return useQuery({
    queryKey: ['ai-status'],
    queryFn: async () => (await api.get<AiStatus>('/ai/status')).data,
    staleTime: 5 * 60_000,
  });
}

const SEVERITY_TONE: Record<AiSeverity, 'info' | 'warning' | 'danger'> = {
  info: 'info',
  warning: 'warning',
  critical: 'danger',
};

const SEVERITY_LABEL: Record<AiSeverity, string> = {
  info: 'Ghi nhận',
  warning: 'Nên xử lý',
  critical: 'Phải xử lý',
};

export function SeverityBadge({ severity }: { severity: AiSeverity }) {
  return <Badge tone={SEVERITY_TONE[severity]}>{SEVERITY_LABEL[severity]}</Badge>;
}

/** Colours a 0–100 score so a weak result is visible without reading the number. */
export function ScoreBadge({ score, suffix = '' }: { score: number; suffix?: string }) {
  const tone =
    score >= 80 ? 'success' : score >= 60 ? 'info' : score >= 40 ? 'warning' : 'danger';
  return (
    <Badge tone={tone}>
      {score}
      {suffix}
    </Badge>
  );
}

/**
 * Wraps an AI action: hides itself when the assistant is not configured, runs
 * the call on demand, and renders the result through `children`.
 */
export function AiPanel<T>({
  title,
  description,
  buttonLabel,
  endpoint,
  children,
}: {
  title: string;
  description: string;
  buttonLabel: string;
  endpoint: string;
  children: (result: T) => React.ReactNode;
}) {
  const status = useAiStatus();
  const [result, setResult] = useState<T | null>(null);

  const run = useMutation({
    mutationFn: async () => (await api.post<T>(endpoint)).data,
    onSuccess: (data) => setResult(data),
    onError: (error) => toast.error(apiErrorMessage(error, 'Trợ lý AI gặp lỗi')),
  });

  // Nothing to offer until an API key is configured.
  if (status.isLoading || !status.data?.enabled) return null;

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          {title}
          <Badge tone="info">AI</Badge>
        </CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent>
        {run.isPending ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Đang phân tích, việc này có thể mất 15–60 giây…
            </p>
            <Skeleton className="h-24 w-full" />
          </div>
        ) : result ? (
          <div className="space-y-4">
            {children(result)}
            <Button
              variant="outline"
              size="sm"
              onClick={() => run.mutate()}
              disabled={run.isPending}
            >
              Phân tích lại
            </Button>
          </div>
        ) : (
          <Button onClick={() => run.mutate()} disabled={run.isPending}>
            <Sparkles className="h-4 w-4" />
            {buttonLabel}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export function AiList({
  label,
  items,
  className,
}: {
  label: string;
  items: string[];
  className?: string;
}) {
  if (!items.length) return null;
  return (
    <div className={className}>
      <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p>
      <ul className="list-inside list-disc space-y-1 text-sm">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export function AiFinding({
  title,
  body,
  severity,
  extra,
}: {
  title: string;
  body: string;
  severity?: AiSeverity;
  extra?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-md border p-3 text-sm',
        severity === 'critical'
          ? 'border-red-300 dark:border-red-900'
          : severity === 'warning'
            ? 'border-amber-300 dark:border-amber-800'
            : 'border-border',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{title}</span>
        {severity ? <SeverityBadge severity={severity} /> : null}
      </div>
      <p className="mt-1 text-muted-foreground">{body}</p>
      {extra ? <p className="mt-1 text-primary">{extra}</p> : null}
    </div>
  );
}
