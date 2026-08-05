import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface ResolvedStep {
  id: string;
  stepOrder: number;
  name: string;
  roleId: string | null;
  slaHours: number | null;
}

export interface ResolvedWorkflow {
  workflowId: string;
  name: string;
  steps: ResolvedStep[];
}

/**
 * Picks the approval chain a request must travel and answers "who may act now".
 *
 * Matching is by value band, then optionally narrowed by category and
 * department. When several workflows match, the one with the highest `priority`
 * wins; ties fall back to the narrowest value band so a specific rule beats a
 * catch-all.
 */
@Injectable()
export class ApprovalRoutingService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(input: {
    amount: Prisma.Decimal | number | null;
    categoryId?: string | null;
    departmentId?: string | null;
  }): Promise<ResolvedWorkflow | null> {
    const amount = new Prisma.Decimal(input.amount ?? 0);

    const candidates = await this.prisma.approvalWorkflow.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        AND: [
          { OR: [{ minAmount: null }, { minAmount: { lte: amount } }] },
          { OR: [{ maxAmount: null }, { maxAmount: { gt: amount } }] },
          {
            OR: [
              { categoryId: null },
              ...(input.categoryId ? [{ categoryId: input.categoryId }] : []),
            ],
          },
          {
            OR: [
              { departmentId: null },
              ...(input.departmentId
                ? [{ departmentId: input.departmentId }]
                : []),
            ],
          },
        ],
      },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    });

    const usable = candidates.filter((w) => w.steps.length > 0);
    if (!usable.length) return null;

    const best = usable.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      const specificity = (w: (typeof usable)[number]) =>
        (w.categoryId ? 1 : 0) + (w.departmentId ? 1 : 0);
      return specificity(b) - specificity(a);
    })[0];

    return {
      workflowId: best.id,
      name: best.name,
      steps: best.steps.map((s) => ({
        id: s.id,
        stepOrder: s.stepOrder,
        name: s.name,
        roleId: s.roleId,
        slaHours: s.slaHours,
      })),
    };
  }

  /** The step immediately after the given one, or null when the chain ends. */
  async nextStep(
    workflowId: string,
    currentOrder: number,
  ): Promise<ResolvedStep | null> {
    const step = await this.prisma.approvalStep.findFirst({
      where: { workflowId, stepOrder: { gt: currentOrder } },
      orderBy: { stepOrder: 'asc' },
    });
    if (!step) return null;
    return {
      id: step.id,
      stepOrder: step.stepOrder,
      name: step.name,
      roleId: step.roleId,
      slaHours: step.slaHours,
    };
  }

  /**
   * A user may act on a step when they hold the step's role. Steps without a
   * role are open to anyone allowed to review, which keeps ad-hoc chains usable.
   */
  async canActOnStep(stepId: string, userId: string): Promise<boolean> {
    const step = await this.prisma.approvalStep.findUnique({
      where: { id: stepId },
    });
    if (!step) return false;
    if (!step.roleId) return true;

    const held = await this.prisma.userRole.findFirst({
      where: { userId, roleId: step.roleId },
    });
    return Boolean(held);
  }

  /** Everyone who could approve the given step, used for notifications. */
  async approverIds(stepId: string): Promise<string[]> {
    const step = await this.prisma.approvalStep.findUnique({
      where: { id: stepId },
    });
    if (!step?.roleId) return [];

    const users = await this.prisma.user.findMany({
      where: { deletedAt: null, roles: { some: { roleId: step.roleId } } },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }
}
