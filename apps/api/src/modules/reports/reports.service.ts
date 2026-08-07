import { BadRequestException, Injectable } from '@nestjs/common';
import { QuotationStatus } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../../prisma/prisma.service';
import { DashboardService } from '../dashboard/dashboard.service';
import { daysUntil } from '../contracts/expiry.service';

export type ReportKey =
  | 'spend'
  | 'saving'
  | 'supplier-performance'
  | 'category'
  | 'department'
  | 'buyer-kpi'
  | 'contract'
  | 'certificate'
  | 'rfq-summary';

export interface ReportTable {
  title: string;
  columns: { key: string; header: string; width?: number }[];
  rows: Record<string, unknown>[];
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dashboard: DashboardService,
  ) {}

  async build(key: ReportKey, months = 12): Promise<ReportTable> {
    switch (key) {
      case 'spend':
        return this.spend(months);
      case 'saving':
        return this.saving(months);
      case 'supplier-performance':
        return this.supplierPerformance();
      case 'category':
        return this.byCategory(months);
      case 'department':
        return this.byDepartment(months);
      case 'buyer-kpi':
        return this.buyerKpi();
      case 'contract':
        return this.contracts();
      case 'certificate':
        return this.certificates();
      case 'rfq-summary':
        return this.rfqSummary();
      default:
        throw new BadRequestException(`Báo cáo không hợp lệ: ${String(key)}`);
    }
  }

  toCsv(table: ReportTable): string {
    const escape = (value: unknown) => {
      const text =
        value === null || value === undefined
          ? ''
          : typeof value === 'object'
            ? (value as { toString(): string }).toString()
            : // eslint-disable-next-line @typescript-eslint/no-base-to-string
              String(value);
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const header = table.columns.map((c) => escape(c.header)).join(',');
    const body = table.rows
      .map((row) => table.columns.map((c) => escape(row[c.key])).join(','))
      .join('\n');
    // BOM so Excel opens Vietnamese text in UTF-8 rather than mangling it.
    return `\uFEFF${header}\n${body}`;
  }

  async toExcel(table: ReportTable): Promise<Uint8Array> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'PMS';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet(table.title.slice(0, 30));
    sheet.columns = table.columns.map((c) => ({
      key: c.key,
      header: c.header,
      width: c.width ?? 20,
    }));
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE2E8F0' },
    };
    table.rows.forEach((row) => sheet.addRow(row));
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: table.columns.length },
    };

    return new Uint8Array(await workbook.xlsx.writeBuffer());
  }

  // ------------------------------------------------------------------ reports

  private async spend(months: number): Promise<ReportTable> {
    const data = await this.dashboard.spendByCategory(months);
    return {
      title: 'Chi tieu',
      columns: [
        { key: 'name', header: 'Lĩnh vực', width: 28 },
        { key: 'count', header: 'Số lần trúng thầu', width: 18 },
        { key: 'total', header: 'Giá trị (VND)', width: 22 },
      ],
      rows: data.byCategory.map((c) => ({
        name: c.name,
        count: c.count,
        total: c.total,
      })),
    };
  }

  private async saving(months: number): Promise<ReportTable> {
    const data = await this.dashboard.savings(months);
    return {
      title: 'Tiet kiem',
      columns: [
        { key: 'month', header: 'Tháng', width: 14 },
        { key: 'baseline', header: 'Giá cao nhất (VND)', width: 22 },
        { key: 'awarded', header: 'Giá đã chọn (VND)', width: 22 },
        { key: 'saving', header: 'Tiết kiệm (VND)', width: 22 },
        { key: 'savingPercent', header: 'Tỷ lệ (%)', width: 14 },
      ],
      rows: data.series,
    };
  }

  private async supplierPerformance(): Promise<ReportTable> {
    const rows = await this.prisma.supplierPerformance.findMany({
      orderBy: { periodEnd: 'desc' },
      include: {
        supplier: { select: { code: true, companyName: true } },
        evaluator: { select: { fullName: true } },
        scores: { include: { criteria: { select: { name: true } } } },
      },
    });

    // Tiêu chí do người dùng tự định nghĩa nên số cột phụ thuộc dữ liệu.
    const criteriaNames = [
      ...new Set(rows.flatMap((r) => r.scores.map((s) => s.criteria.name))),
    ];

    return {
      title: 'Danh gia NCC',
      columns: [
        { key: 'code', header: 'Mã NCC', width: 16 },
        { key: 'supplier', header: 'Nhà cung cấp', width: 32 },
        { key: 'period', header: 'Kỳ đánh giá', width: 24 },
        ...criteriaNames.map((name) => ({
          key: `c_${name}`,
          header: name,
          width: 14,
        })),
        { key: 'complaint', header: 'Khiếu nại (%)', width: 14 },
        { key: 'total', header: 'Tổng điểm', width: 12 },
        { key: 'note', header: 'Nhận xét', width: 40 },
        { key: 'evaluator', header: 'Người đánh giá', width: 22 },
      ],
      rows: rows.map((r) => ({
        code: r.supplier.code,
        supplier: r.supplier.companyName,
        period: `${r.periodStart.toLocaleDateString('vi-VN')} – ${r.periodEnd.toLocaleDateString('vi-VN')}`,
        ...Object.fromEntries(
          r.scores.map((s) => [
            `c_${s.criteria.name}`,
            s.comment ? `${s.score} — ${s.comment}` : s.score,
          ]),
        ),
        complaint: Number(r.complaintRate),
        total: Number(r.totalScore),
        note: r.note ?? '',
        evaluator: r.evaluator.fullName,
      })),
    };
  }

  private async byCategory(months: number): Promise<ReportTable> {
    const since = new Date();
    since.setMonth(since.getMonth() - months);

    const requests = await this.prisma.purchaseRequest.groupBy({
      by: ['categoryId', 'status'],
      where: { deletedAt: null, createdAt: { gte: since } },
      _count: { _all: true },
    });
    const categories = await this.prisma.category.findMany({
      select: { id: true, name: true, nameEn: true },
    });
    const byId = new Map(categories.map((c) => [c.id, c]));

    const totals = new Map<
      string,
      { total: number; approved: number; rejected: number }
    >();
    for (const row of requests) {
      const entry = totals.get(row.categoryId) ?? {
        total: 0,
        approved: 0,
        rejected: 0,
      };
      entry.total += row._count._all;
      if (row.status === 'APPROVED') entry.approved += row._count._all;
      if (row.status === 'REJECTED') entry.rejected += row._count._all;
      totals.set(row.categoryId, entry);
    }

    return {
      title: 'Theo linh vuc',
      columns: [
        { key: 'name', header: 'Lĩnh vực', width: 28 },
        { key: 'total', header: 'Tổng yêu cầu', width: 16 },
        { key: 'approved', header: 'Đã duyệt', width: 14 },
        { key: 'rejected', header: 'Từ chối', width: 14 },
      ],
      rows: [...totals.entries()]
        .map(([id, v]) => ({
          name: byId.get(id)?.nameEn ?? byId.get(id)?.name ?? id,
          ...v,
        }))
        .sort((a, b) => b.total - a.total),
    };
  }

  private async byDepartment(months: number): Promise<ReportTable> {
    const data = await this.dashboard.spendByCategory(months);
    return {
      title: 'Theo bo phan',
      columns: [
        { key: 'name', header: 'Bộ phận', width: 28 },
        { key: 'count', header: 'Số lần trúng thầu', width: 18 },
        { key: 'total', header: 'Giá trị (VND)', width: 22 },
      ],
      rows: data.byDepartment,
    };
  }

  private async buyerKpi(): Promise<ReportTable> {
    const requests = await this.prisma.purchaseRequest.findMany({
      where: { deletedAt: null, buyerId: { not: null } },
      select: {
        buyerId: true,
        status: true,
        submittedAt: true,
        approvedAt: true,
        rejectedAt: true,
        buyer: { select: { fullName: true } },
      },
    });

    const stats = new Map<
      string,
      {
        name: string;
        handled: number;
        approved: number;
        rejected: number;
        hours: number[];
      }
    >();

    for (const r of requests) {
      if (!r.buyerId) continue;
      const entry = stats.get(r.buyerId) ?? {
        name: r.buyer?.fullName ?? r.buyerId,
        handled: 0,
        approved: 0,
        rejected: 0,
        hours: [],
      };
      entry.handled += 1;
      if (r.status === 'APPROVED') entry.approved += 1;
      if (r.status === 'REJECTED') entry.rejected += 1;

      const end = r.approvedAt ?? r.rejectedAt;
      if (r.submittedAt && end) {
        entry.hours.push((end.getTime() - r.submittedAt.getTime()) / 3_600_000);
      }
      stats.set(r.buyerId, entry);
    }

    return {
      title: 'KPI buyer',
      columns: [
        { key: 'name', header: 'Buyer', width: 26 },
        { key: 'handled', header: 'Đã xử lý', width: 14 },
        { key: 'approved', header: 'Đã duyệt', width: 14 },
        { key: 'rejected', header: 'Từ chối', width: 14 },
        { key: 'avgHours', header: 'TB xử lý (giờ)', width: 18 },
      ],
      rows: [...stats.values()]
        .map((s) => ({
          name: s.name,
          handled: s.handled,
          approved: s.approved,
          rejected: s.rejected,
          avgHours: s.hours.length
            ? Number(
                (s.hours.reduce((a, b) => a + b, 0) / s.hours.length).toFixed(
                  2,
                ),
              )
            : 0,
        }))
        .sort((a, b) => b.handled - a.handled),
    };
  }

  private async contracts(): Promise<ReportTable> {
    const rows = await this.prisma.contract.findMany({
      where: { deletedAt: null },
      orderBy: { endDate: 'asc' },
      include: { supplier: { select: { companyName: true } } },
    });

    return {
      title: 'Hop dong',
      columns: [
        { key: 'number', header: 'Số hợp đồng', width: 20 },
        { key: 'title', header: 'Tên hợp đồng', width: 34 },
        { key: 'supplier', header: 'Nhà cung cấp', width: 30 },
        { key: 'start', header: 'Ngày bắt đầu', width: 16 },
        { key: 'end', header: 'Ngày kết thúc', width: 16 },
        { key: 'daysLeft', header: 'Còn lại (ngày)', width: 16 },
        { key: 'value', header: 'Giá trị', width: 20 },
        { key: 'status', header: 'Trạng thái', width: 16 },
      ],
      rows: rows.map((c) => ({
        number: c.contractNumber,
        title: c.title,
        supplier: c.supplier.companyName,
        start: c.startDate.toLocaleDateString('vi-VN'),
        end: c.endDate.toLocaleDateString('vi-VN'),
        daysLeft: daysUntil(c.endDate),
        value: Number(c.contractValue),
        status: c.status,
      })),
    };
  }

  private async certificates(): Promise<ReportTable> {
    const rows = await this.prisma.certificate.findMany({
      where: { deletedAt: null },
      orderBy: { expiryDate: 'asc' },
      include: { supplier: { select: { companyName: true } } },
    });

    return {
      title: 'Chung chi',
      columns: [
        { key: 'name', header: 'Chứng chỉ', width: 26 },
        { key: 'supplier', header: 'Nhà cung cấp', width: 30 },
        { key: 'issuedBy', header: 'Nơi cấp', width: 22 },
        { key: 'issue', header: 'Ngày cấp', width: 16 },
        { key: 'expiry', header: 'Ngày hết hạn', width: 16 },
        { key: 'daysLeft', header: 'Còn lại (ngày)', width: 16 },
        { key: 'status', header: 'Trạng thái', width: 16 },
      ],
      rows: rows.map((c) => ({
        name: c.name,
        supplier: c.supplier.companyName,
        issuedBy: c.issuedBy ?? '',
        issue: c.issueDate.toLocaleDateString('vi-VN'),
        expiry: c.expiryDate.toLocaleDateString('vi-VN'),
        daysLeft: daysUntil(c.expiryDate),
        status: c.status,
      })),
    };
  }

  private async rfqSummary(): Promise<ReportTable> {
    const rows = await this.prisma.rfq.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: {
        purchaseRequest: { select: { code: true } },
        buyer: { select: { fullName: true } },
        quotations: {
          where: { deletedAt: null, status: QuotationStatus.AWARDED },
          include: { supplier: { select: { companyName: true } } },
        },
        _count: { select: { suppliers: true, quotations: true } },
      },
    });

    return {
      title: 'Tong hop RFQ',
      columns: [
        { key: 'code', header: 'Mã RFQ', width: 18 },
        { key: 'title', header: 'Tiêu đề', width: 34 },
        { key: 'pr', header: 'Yêu cầu gốc', width: 18 },
        { key: 'buyer', header: 'Buyer', width: 22 },
        { key: 'invited', header: 'NCC mời', width: 12 },
        { key: 'quoted', header: 'Đã báo giá', width: 14 },
        { key: 'winner', header: 'NCC trúng thầu', width: 36 },
        { key: 'value', header: 'Giá trúng thầu', width: 20 },
        { key: 'status', header: 'Trạng thái', width: 16 },
      ],
      rows: rows.map((r) => ({
        code: r.code,
        title: r.title,
        pr: r.purchaseRequest.code,
        buyer: r.buyer.fullName,
        invited: r._count.suppliers,
        quoted: r._count.quotations,
        winner: r.quotations.map((q) => q.supplier.companyName).join(', '),
        value: r.quotations.length
          ? r.quotations.reduce((sum, q) => sum + Number(q.totalAmount), 0)
          : '',
        status: r.status,
      })),
    };
  }
}
