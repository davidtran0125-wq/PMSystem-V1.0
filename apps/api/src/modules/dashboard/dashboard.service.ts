import { Injectable } from '@nestjs/common';
import {
  CertificateStatus,
  ContractStatus,
  PurchaseOrderStatus,
  PurchaseRequestStatus,
  QuotationStatus,
  RfqStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async buyerOverview() {
    const now = new Date();
    const in30Days = new Date(now);
    in30Days.setDate(in30Days.getDate() + 30);

    const [
      newRequests,
      inReview,
      needClarification,
      approved,
      openRfqs,
      awaitingQuotes,
      expiringContracts,
      expiringCertificates,
      overdue,
    ] = await this.prisma.$transaction([
      this.prisma.purchaseRequest.count({
        where: { status: PurchaseRequestStatus.SUBMITTED, deletedAt: null },
      }),
      this.prisma.purchaseRequest.count({
        where: { status: PurchaseRequestStatus.BUYER_REVIEW, deletedAt: null },
      }),
      this.prisma.purchaseRequest.count({
        where: {
          status: PurchaseRequestStatus.NEED_CLARIFICATION,
          deletedAt: null,
        },
      }),
      this.prisma.purchaseRequest.count({
        where: { status: PurchaseRequestStatus.APPROVED, deletedAt: null },
      }),
      this.prisma.rfq.count({
        where: { status: RfqStatus.SENT, deletedAt: null },
      }),
      this.prisma.rfqSupplier.count({
        where: {
          status: { in: ['INVITED', 'VIEWED'] },
          rfq: { status: RfqStatus.SENT, deletedAt: null },
        },
      }),
      this.prisma.contract.count({
        where: {
          deletedAt: null,
          status: { in: [ContractStatus.ACTIVE, ContractStatus.EXPIRING] },
          endDate: { gte: now, lte: in30Days },
        },
      }),
      this.prisma.certificate.count({
        where: {
          deletedAt: null,
          status: { in: [CertificateStatus.VALID, CertificateStatus.EXPIRING] },
          expiryDate: { gte: now, lte: in30Days },
        },
      }),
      this.prisma.purchaseRequest.count({
        where: {
          deletedAt: null,
          status: {
            in: [
              PurchaseRequestStatus.SUBMITTED,
              PurchaseRequestStatus.BUYER_REVIEW,
            ],
          },
          neededByDate: { lt: now },
        },
      }),
    ]);

    return {
      purchaseRequests: {
        new: newRequests,
        inReview,
        needClarification,
        approved,
        overdue,
      },
      rfqs: { open: openRfqs, awaitingQuotes },
      expiring: {
        contracts: expiringContracts,
        certificates: expiringCertificates,
      },
    };
  }

  /** Spend is measured from awarded quotations, which is the committed value. */
  async spendByCategory(months = 12) {
    const since = new Date();
    since.setMonth(since.getMonth() - months);

    const awarded = await this.prisma.supplierQuotation.findMany({
      where: {
        status: QuotationStatus.AWARDED,
        deletedAt: null,
        submittedAt: { gte: since },
      },
      select: {
        totalAmount: true,
        currency: true,
        rfq: {
          select: {
            purchaseRequest: {
              select: {
                category: { select: { id: true, name: true, nameEn: true } },
                department: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    });

    const byCategory = new Map<
      string,
      { name: string; total: number; count: number }
    >();
    const byDepartment = new Map<
      string,
      { name: string; total: number; count: number }
    >();

    for (const row of awarded) {
      const amount = Number(row.totalAmount);
      const category = row.rfq.purchaseRequest.category;
      const department = row.rfq.purchaseRequest.department;

      const cat = byCategory.get(category.id) ?? {
        name: category.nameEn ?? category.name,
        total: 0,
        count: 0,
      };
      byCategory.set(category.id, {
        ...cat,
        total: cat.total + amount,
        count: cat.count + 1,
      });

      const dept = byDepartment.get(department.id) ?? {
        name: department.name,
        total: 0,
        count: 0,
      };
      byDepartment.set(department.id, {
        ...dept,
        total: dept.total + amount,
        count: dept.count + 1,
      });
    }

    const toSorted = (
      map: Map<string, { name: string; total: number; count: number }>,
    ) =>
      [...map.entries()]
        .map(([id, value]) => ({ id, ...value }))
        .sort((a, b) => b.total - a.total);

    return {
      byCategory: toSorted(byCategory),
      byDepartment: toSorted(byDepartment),
      totalSpend: awarded.reduce((sum, r) => sum + Number(r.totalAmount), 0),
      awardedCount: awarded.length,
    };
  }

  /**
   * Saving is the gap between the lowest quote received and the awarded quote's
   * peers: we credit the difference between the highest and the awarded price.
   */
  /**
   * Chênh lệch giữa giá trị dự kiến ghi trên yêu cầu mua và giá trị thật đã
   * chốt trên đơn hàng. Một yêu cầu có thể sinh nhiều đơn (chia thầu), nên phải
   * cộng dồn các đơn về từng yêu cầu rồi mới so, không so từng đơn một.
   */
  async requestToOrderSavings(months = 12) {
    const since = new Date();
    since.setMonth(since.getMonth() - months);

    const orders = await this.prisma.purchaseOrder.findMany({
      where: {
        deletedAt: null,
        status: { not: PurchaseOrderStatus.CANCELLED },
        createdAt: { gte: since },
      },
      select: {
        purchaseRequestId: true,
        subtotal: true,
        createdAt: true,
        issuedAt: true,
        purchaseRequest: {
          select: { id: true, code: true, title: true, estimatedTotal: true },
        },
      },
    });

    const byRequest = new Map<
      string,
      {
        code: string;
        title: string;
        estimated: number;
        actual: number;
        at: Date;
      }
    >();

    for (const order of orders) {
      const pr = order.purchaseRequest;
      if (!pr?.estimatedTotal) continue;
      const at = order.issuedAt ?? order.createdAt;
      const entry = byRequest.get(pr.id);
      if (entry) {
        entry.actual += Number(order.subtotal);
        if (at > entry.at) entry.at = at;
      } else {
        byRequest.set(pr.id, {
          code: pr.code,
          title: pr.title,
          estimated: Number(pr.estimatedTotal),
          actual: Number(order.subtotal),
          at,
        });
      }
    }

    const rows = [...byRequest.entries()].map(([id, r]) => ({
      purchaseRequestId: id,
      code: r.code,
      title: r.title,
      estimated: r.estimated,
      actual: Number(r.actual.toFixed(2)),
      saved: Number((r.estimated - r.actual).toFixed(2)),
      savedPercent:
        r.estimated > 0
          ? Number((((r.estimated - r.actual) / r.estimated) * 100).toFixed(2))
          : 0,
      at: r.at,
    }));

    const estimated = rows.reduce((sum, r) => sum + r.estimated, 0);
    const actual = rows.reduce((sum, r) => sum + r.actual, 0);

    const byMonth = new Map<string, { estimated: number; actual: number }>();
    for (const r of rows) {
      const key = r.at.toISOString().slice(0, 7);
      const bucket = byMonth.get(key) ?? { estimated: 0, actual: 0 };
      bucket.estimated += r.estimated;
      bucket.actual += r.actual;
      byMonth.set(key, bucket);
    }

    return {
      summary: {
        requests: rows.length,
        estimated: Number(estimated.toFixed(2)),
        actual: Number(actual.toFixed(2)),
        saved: Number((estimated - actual).toFixed(2)),
        savedPercent:
          estimated > 0
            ? Number((((estimated - actual) / estimated) * 100).toFixed(2))
            : 0,
      },
      byMonth: [...byMonth.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, v]) => ({
          month,
          estimated: Number(v.estimated.toFixed(2)),
          actual: Number(v.actual.toFixed(2)),
          saved: Number((v.estimated - v.actual).toFixed(2)),
        })),
      // Chênh lệch lớn nhất trước, cả tiết kiệm lẫn vượt dự toán.
      topSaved: [...rows].sort((a, b) => b.saved - a.saved).slice(0, 5),
      topOverrun: [...rows]
        .filter((r) => r.saved < 0)
        .sort((a, b) => a.saved - b.saved)
        .slice(0, 5),
    };
  }

  async savings(months = 12) {
    const since = new Date();
    since.setMonth(since.getMonth() - months);

    const rfqs = await this.prisma.rfq.findMany({
      where: {
        status: RfqStatus.AWARDED,
        deletedAt: null,
        awardedAt: { gte: since },
      },
      select: {
        id: true,
        code: true,
        awardedAt: true,

        quotations: {
          where: { deletedAt: null, status: { not: QuotationStatus.DRAFT } },
          select: { id: true, totalAmount: true, status: true },
        },
      },
    });

    const byMonth = new Map<string, { baseline: number; awarded: number }>();

    for (const rfq of rfqs) {
      if (rfq.quotations.length < 2 || !rfq.awardedAt) continue;

      // Nhiều nhà cung cấp có thể cùng trúng thầu, cộng dồn giá trị đã chốt.
      const awarded = rfq.quotations.filter(
        (q) => q.status === QuotationStatus.AWARDED,
      );
      if (!awarded.length) continue;
      const awardedTotal = awarded.reduce(
        (sum, q) => sum + Number(q.totalAmount),
        0,
      );

      const amounts = rfq.quotations.map((q) => Number(q.totalAmount));
      const baseline = Math.max(...amounts);
      const key = rfq.awardedAt.toISOString().slice(0, 7);

      const entry = byMonth.get(key) ?? { baseline: 0, awarded: 0 };
      byMonth.set(key, {
        baseline: entry.baseline + baseline,
        awarded: entry.awarded + awardedTotal,
      });
    }

    const series = [...byMonth.entries()]
      .map(([month, value]) => ({
        month,
        baseline: value.baseline,
        awarded: value.awarded,
        saving: value.baseline - value.awarded,
        savingPercent:
          value.baseline > 0
            ? Number(
                (
                  ((value.baseline - value.awarded) / value.baseline) *
                  100
                ).toFixed(2),
              )
            : 0,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));

    return {
      series,
      totalSaving: series.reduce((sum, s) => sum + s.saving, 0),
    };
  }

  async topSuppliers(limit = 10) {
    const suppliers = await this.prisma.supplier.findMany({
      where: { deletedAt: null, status: 'APPROVED' },
      take: limit,
      orderBy: [{ ratingAvg: { sort: 'desc', nulls: 'last' } }],
      select: {
        id: true,
        code: true,
        companyName: true,
        ratingAvg: true,
        _count: { select: { quotations: true, contracts: true } },
      },
    });

    const awardCounts = await this.prisma.supplierQuotation.groupBy({
      by: ['supplierId'],
      where: { status: QuotationStatus.AWARDED, deletedAt: null },
      _count: { _all: true },
      _sum: { totalAmount: true },
    });

    const awardsBySupplier = new Map(
      awardCounts.map((a) => [
        a.supplierId,
        { awards: a._count._all, value: Number(a._sum.totalAmount ?? 0) },
      ]),
    );

    return suppliers
      .map((s) => ({
        ...s,
        awards: awardsBySupplier.get(s.id)?.awards ?? 0,
        awardedValue: awardsBySupplier.get(s.id)?.value ?? 0,
      }))
      .sort((a, b) => b.awards - a.awards);
  }

  /** Median and average hours from submission to a buyer decision. */
  /**
   * Thời gian từ lúc gửi tới lúc có quyết định.
   *
   * Tính hẳn trong SQL. Bản trước kéo mọi yêu cầu đã quyết định về Node rồi
   * sắp xếp bằng JavaScript để lấy trung vị — với một triệu yêu cầu là hơn ba
   * trăm nghìn dòng đi qua mạng cho ra đúng ba con số, mất khoảng 1,6 giây.
   */
  async slaMetrics() {
    const [row] = await this.prisma.$queryRaw<
      {
        decided: bigint;
        average_hours: number | null;
        median_hours: number | null;
      }[]
    >`
      SELECT
        count(*)                                                        AS decided,
        avg(hours)                                                      AS average_hours,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY hours)              AS median_hours
      FROM (
        SELECT EXTRACT(EPOCH FROM (COALESCE("approvedAt", "rejectedAt") - "submittedAt")) / 3600 AS hours
        FROM purchase_requests
        WHERE "deletedAt" IS NULL
          AND "submittedAt" IS NOT NULL
          AND COALESCE("approvedAt", "rejectedAt") IS NOT NULL
          AND status IN ('APPROVED', 'REJECTED')
      ) t
    `;

    const decided = Number(row?.decided ?? 0);
    if (!decided) return { decided: 0, averageHours: 0, medianHours: 0 };

    const round = (v: number | null) => Number(Number(v ?? 0).toFixed(2));
    return {
      decided,
      averageHours: round(row.average_hours),
      medianHours: round(row.median_hours),
    };
  }
}
