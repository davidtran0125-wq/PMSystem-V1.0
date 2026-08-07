'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  PageHeader,
  Select,
  Skeleton,
} from '@/components/ui';
import { api, apiErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { ReportTable } from '@/lib/types';

interface ReportMeta {
  key: string;
  label: string;
}

/** Columns whose values are money or counts read better right-aligned. */
const NUMERIC_HINT = /giá|value|tổng|tiền|số|điểm|tỷ|còn lại|%/i;

export default function ReportsPage() {
  const [selected, setSelected] = useState('spend');
  const [months, setMonths] = useState('12');
  const [downloading, setDownloading] = useState<string | null>(null);

  const reports = useQuery({
    queryKey: ['reports'],
    queryFn: async () => (await api.get<ReportMeta[]>('/reports')).data,
  });

  const table = useQuery({
    queryKey: ['report', selected, months],
    queryFn: async () =>
      (
        await api.get<ReportTable>(`/reports/${selected}`, {
          params: { months: Number(months) },
        })
      ).data,
  });

  // The API streams a file, so fetch as a blob and hand it to the browser.
  const download = async (format: 'xlsx' | 'csv') => {
    setDownloading(format);
    try {
      const res = await api.get(`/reports/${selected}/export`, {
        params: { format, months: Number(months) },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data as Blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${selected}-${new Date().toISOString().slice(0, 10)}.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success(`Đã tải ${format.toUpperCase()}`);
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Không tải được báo cáo'));
    } finally {
      setDownloading(null);
    }
  };

  const usesMonths = ['spend', 'saving', 'category', 'department'].includes(
    selected,
  );

  return (
    <div>
      <PageHeader
        title="Báo cáo"
        description="Xem trực tiếp hoặc tải về dạng Excel / CSV."
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={downloading !== null}
              onClick={() => download('csv')}
            >
              <Download className="h-4 w-4" />
              CSV
            </Button>
            <Button
              disabled={downloading !== null}
              onClick={() => download('xlsx')}
            >
              <FileSpreadsheet className="h-4 w-4" />
              Excel
            </Button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap gap-3">
        <Select
          className="w-72"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          {reports.data?.map((r) => (
            <option key={r.key} value={r.key}>
              {r.label}
            </option>
          ))}
        </Select>
        {usesMonths ? (
          <Select
            className="w-44"
            value={months}
            onChange={(e) => setMonths(e.target.value)}
          >
            <option value="3">3 tháng gần nhất</option>
            <option value="6">6 tháng gần nhất</option>
            <option value="12">12 tháng gần nhất</option>
            <option value="24">24 tháng gần nhất</option>
          </Select>
        ) : null}
      </div>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>
            {reports.data?.find((r) => r.key === selected)?.label ?? 'Báo cáo'}
            {table.data ? (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {table.data.rows.length} dòng
              </span>
            ) : null}
          </CardTitle>
        </CardHeader>

        {table.isLoading ? (
          <CardContent>
            <Skeleton className="h-64 w-full" />
          </CardContent>
        ) : !table.data?.rows.length ? (
          <CardContent>
            <p className="py-10 text-center text-sm text-muted-foreground">
              Chưa có dữ liệu cho báo cáo này.
            </p>
          </CardContent>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-y border-border bg-muted/40 text-left">
                <tr>
                  {table.data.columns.map((c) => (
                    <th
                      key={c.key}
                      className={cn(
                        'whitespace-nowrap px-4 py-3 font-medium',
                        NUMERIC_HINT.test(c.header) && 'text-right',
                      )}
                    >
                      {c.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.data.rows.map((row, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    {table.data!.columns.map((c) => {
                      const value = row[c.key];
                      const numeric =
                        typeof value === 'number' && NUMERIC_HINT.test(c.header);
                      return (
                        <td
                          key={c.key}
                          className={cn(
                            'px-4 py-2',
                            numeric && 'text-right tabular-nums',
                          )}
                        >
                          {value === null || value === undefined || value === ''
                            ? '—'
                            : numeric
                              ? Number(value).toLocaleString('vi-VN')
                              : String(value)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
