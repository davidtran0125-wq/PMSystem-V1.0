import { Injectable } from '@nestjs/common';
import {
  CertificateStatus,
  ContractStatus,
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
        awardedQuotationId: true,
        quotations: {
          where: { deletedAt: null, status: { not: QuotationStatus.DRAFT } },
          select: { id: true, totalAmount: true },
        },
      },
    });

    const byMonth = new Map<string, { baseline: number; awarded: number }>();

    for (const rfq of rfqs) {
      if (rfq.quotations.length < 2 || !rfq.awardedAt) continue;

      const awarded = rfq.quotations.find(
        (q) => q.id === rfq.awardedQuotationId,
      );
      if (!awarded) continue;

      const amounts = rfq.quotations.map((q) => Number(q.totalAmount));
      const baseline = Math.max(...amounts);
      const key = rfq.awardedAt.toISOString().slice(0, 7);

      const entry = byMonth.get(key) ?? { baseline: 0, awarded: 0 };
      byMonth.set(key, {
        baseline: entry.baseline + baseline,
        awarded: entry.awarded + Number(awarded.totalAmount),
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
  async slaMetrics() {
    const decided = await this.prisma.purchaseRequest.findMany({
      where: {
        deletedAt: null,
        submittedAt: { not: null },
        status: {
          in: [PurchaseRequestStatus.APPROVED, PurchaseRequestStatus.REJECTED],
        },
      },
      select: { submittedAt: true, approvedAt: true, rejectedAt: true },
    });

    const hours = decided
      .map((r) => {
        const end = r.approvedAt ?? r.rejectedAt;
        if (!r.submittedAt || !end) return null;
        return (end.getTime() - r.submittedAt.getTime()) / 3_600_000;
      })
      .filter((h): h is number => h !== null)
      .sort((a, b) => a - b);

    if (!hours.length) {
      return { decided: 0, averageHours: 0, medianHours: 0 };
    }

    const mid = Math.floor(hours.length / 2);
    return {
      decided: hours.length,
      averageHours: Number(
        (hours.reduce((s, h) => s + h, 0) / hours.length).toFixed(2),
      ),
      medianHours: Number(
        (hours.length % 2
          ? hours[mid]
          : (hours[mid - 1] + hours[mid]) / 2
        ).toFixed(2),
      ),
    };
  }
}
