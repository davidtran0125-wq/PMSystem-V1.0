import { Controller, Get, Param, ParseIntPipe, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  ReportsService,
  type ReportKey,
  type ReportTable,
} from './reports.service';
import { RequirePermissions } from '../../common/decorators';
import { PERMISSIONS } from '../../common/permissions';

const REPORTS: { key: ReportKey; label: string }[] = [
  { key: 'spend', label: 'Chi tiêu theo lĩnh vực' },
  { key: 'saving', label: 'Tiết kiệm theo tháng' },
  { key: 'supplier-performance', label: 'Đánh giá nhà cung cấp' },
  { key: 'category', label: 'Yêu cầu theo lĩnh vực' },
  { key: 'department', label: 'Chi tiêu theo bộ phận' },
  { key: 'buyer-kpi', label: 'KPI buyer' },
  { key: 'contract', label: 'Hợp đồng' },
  { key: 'certificate', label: 'Chứng chỉ' },
  { key: 'rfq-summary', label: 'Tổng hợp RFQ' },
];

@ApiTags('Reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.REPORT_READ)
  @ApiOperation({ summary: 'Danh sách báo cáo có sẵn' })
  list() {
    return REPORTS;
  }

  @Get(':key')
  @RequirePermissions(PERMISSIONS.REPORT_READ)
  @ApiOperation({ summary: 'Xem báo cáo dạng JSON để hiển thị trên web' })
  preview(
    @Param('key') key: ReportKey,
    @Query('months', new ParseIntPipe({ optional: true })) months?: number,
  ): Promise<ReportTable> {
    return this.service.build(key, months ?? 12);
  }

  @Get(':key/export')
  @RequirePermissions(PERMISSIONS.REPORT_READ)
  @ApiOperation({ summary: 'Tải báo cáo dạng xlsx hoặc csv' })
  async export(
    @Param('key') key: ReportKey,
    @Res() res: Response,
    @Query('format') format: 'xlsx' | 'csv' = 'xlsx',
    @Query('months', new ParseIntPipe({ optional: true })) months?: number,
  ) {
    const table = await this.service.build(key, months ?? 12);
    const stamp = new Date().toISOString().slice(0, 10);

    if (format === 'csv') {
      const csv = await this.service.toCsv(table);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${key}-${stamp}.csv"`,
      );
      return res.send(csv);
    }

    const buffer = await this.service.toExcel(table);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${key}-${stamp}.xlsx"`,
    );
    return res.send(Buffer.from(buffer));
  }
}
