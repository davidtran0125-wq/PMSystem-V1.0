import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  CertificateStatus,
  ContractStatus,
  EntityType,
  NotificationEvent,
  ReminderStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ROLES } from '../../common/permissions';

/** Lead times required by the spec, in days before expiry. */
export const REMINDER_DAYS = [90, 60, 30, 15, 7, 1];

const DAY_MS = 86_400_000;

export function daysUntil(date: Date, from = new Date()): number {
  const a = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const b = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  return Math.round((a - b) / DAY_MS);
}

export function contractStatusFor(endDate: Date, current?: ContractStatus) {
  // Manually terminated or draft contracts are left alone.
  if (
    current === ContractStatus.TERMINATED ||
    current === ContractStatus.DRAFT
  ) {
    return current;
  }
  const left = daysUntil(endDate);
  if (left < 0) return ContractStatus.EXPIRED;
  if (left <= 90) return ContractStatus.EXPIRING;
  return ContractStatus.ACTIVE;
}

export function certificateStatusFor(
  expiryDate: Date,
  current?: CertificateStatus,
) {
  if (current === CertificateStatus.REVOKED) return current;
  const left = daysUntil(expiryDate);
  if (left < 0) return CertificateStatus.EXPIRED;
  if (left <= 90) return CertificateStatus.EXPIRING;
  return CertificateStatus.VALID;
}

/**
 * Keeps the reminder queue in step with contract and certificate expiry dates,
 * and turns due reminders into notifications. Rescheduling deletes only the
 * still-pending rows so an already-sent reminder is never sent twice.
 */
@Injectable()
export class ExpiryService {
  private readonly logger = new Logger(ExpiryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async scheduleContract(contractId: string, endDate: Date) {
    await this.prisma.reminderQueue.deleteMany({
      where: { contractId, status: ReminderStatus.PENDING },
    });
    await this.prisma.reminderQueue.createMany({
      data: this.rows(endDate).map((r) => ({
        entityType: EntityType.CONTRACT,
        contractId,
        daysBefore: r.daysBefore,
        remindAt: r.remindAt,
      })),
    });
  }

  async scheduleCertificate(certificateId: string, expiryDate: Date) {
    await this.prisma.reminderQueue.deleteMany({
      where: { certificateId, status: ReminderStatus.PENDING },
    });
    await this.prisma.reminderQueue.createMany({
      data: this.rows(expiryDate).map((r) => ({
        entityType: EntityType.CERTIFICATE,
        certificateId,
        daysBefore: r.daysBefore,
        remindAt: r.remindAt,
      })),
    });
  }

  /** Runs hourly; also callable directly so it can be tested and triggered. */
  @Cron(CronExpression.EVERY_HOUR)
  async processDueReminders() {
    await this.refreshStatuses();

    const due = await this.prisma.reminderQueue.findMany({
      where: { status: ReminderStatus.PENDING, remindAt: { lte: new Date() } },
      include: {
        contract: { include: { supplier: true, buyer: true } },
        certificate: { include: { supplier: true } },
      },
      take: 200,
    });
    if (!due.length) return { processed: 0 };

    const recipients = await this.procurementUserIds();

    for (const reminder of due) {
      try {
        if (reminder.contract) {
          const c = reminder.contract;
          await this.notifications.notify({
            userIds: [
              ...new Set(
                [...recipients, c.buyerId].filter(Boolean) as string[],
              ),
            ],
            event: NotificationEvent.CONTRACT_EXPIRY,
            title: `Hợp đồng ${c.contractNumber} còn ${reminder.daysBefore} ngày là hết hạn`,
            body: `"${c.title}" với ${c.supplier.companyName} hết hạn ngày ${c.endDate.toLocaleDateString('vi-VN')}.`,
            link: `/contracts/${c.id}`,
            entityType: EntityType.CONTRACT,
            entityId: c.id,
          });
        } else if (reminder.certificate) {
          const c = reminder.certificate;
          await this.notifications.notify({
            userIds: recipients,
            event: NotificationEvent.CERTIFICATE_EXPIRY,
            title: `Chứng chỉ ${c.name} còn ${reminder.daysBefore} ngày là hết hạn`,
            body: `Chứng chỉ của ${c.supplier.companyName} hết hạn ngày ${c.expiryDate.toLocaleDateString('vi-VN')}.`,
            link: `/certificates`,
            entityType: EntityType.CERTIFICATE,
            entityId: c.id,
          });
        }

        await this.prisma.reminderQueue.update({
          where: { id: reminder.id },
          data: { status: ReminderStatus.SENT, sentAt: new Date() },
        });
      } catch (error) {
        this.logger.error(`Reminder ${reminder.id} failed`, error as Error);
        await this.prisma.reminderQueue.update({
          where: { id: reminder.id },
          data: {
            status: ReminderStatus.FAILED,
            error: error instanceof Error ? error.message : String(error),
          },
        });
      }
    }

    return { processed: due.length };
  }

  /** Moves ACTIVE→EXPIRING→EXPIRED as dates pass, without touching manual states. */
  async refreshStatuses() {
    const contracts = await this.prisma.contract.findMany({
      where: {
        deletedAt: null,
        status: { in: [ContractStatus.ACTIVE, ContractStatus.EXPIRING] },
      },
      select: { id: true, endDate: true, status: true },
    });
    for (const c of contracts) {
      const next = contractStatusFor(c.endDate, c.status);
      if (next !== c.status) {
        await this.prisma.contract.update({
          where: { id: c.id },
          data: { status: next },
        });
      }
    }

    const certificates = await this.prisma.certificate.findMany({
      where: {
        deletedAt: null,
        status: { in: [CertificateStatus.VALID, CertificateStatus.EXPIRING] },
      },
      select: { id: true, expiryDate: true, status: true },
    });
    for (const c of certificates) {
      const next = certificateStatusFor(c.expiryDate, c.status);
      if (next !== c.status) {
        await this.prisma.certificate.update({
          where: { id: c.id },
          data: { status: next },
        });
      }
    }
  }

  private rows(expiry: Date) {
    const now = Date.now();
    return REMINDER_DAYS.map((daysBefore) => ({
      daysBefore,
      remindAt: new Date(expiry.getTime() - daysBefore * DAY_MS),
    })).filter((r) => r.remindAt.getTime() > now - DAY_MS);
  }

  private async procurementUserIds(): Promise<string[]> {
    const users = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        roles: {
          some: {
            role: { code: { in: [ROLES.BUYER, ROLES.PROCUREMENT_MANAGER] } },
          },
        },
      },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }
}
