import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApprovalTarget, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ApprovalRoutingService } from './approval-routing.service';
import {
  PreviewRoutingDto,
  QueryApprovalWorkflowDto,
  UpsertApprovalWorkflowDto,
} from './dto/approval-workflow.dto';

const WITH_STEPS = {
  steps: {
    orderBy: { stepOrder: 'asc' },
    include: { role: { select: { id: true, code: true, name: true } } },
  },
} satisfies Prisma.ApprovalWorkflowInclude;

/**
 * Quản trị luồng duyệt: admin tự đặt các cấp duyệt và ngưỡng giá trị mà không
 * cần sửa mã nguồn. Việc chọn luồng nào cho một yêu cầu cụ thể vẫn nằm ở
 * {@link ApprovalRoutingService}; ở đây chỉ dựng và sửa dữ liệu cấu hình.
 */
@Injectable()
export class ApprovalWorkflowsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly routing: ApprovalRoutingService,
  ) {}

  async findAll(dto: QueryApprovalWorkflowDto) {
    const data = await this.prisma.approvalWorkflow.findMany({
      where: {
        deletedAt: null,
        ...(dto.appliesTo ? { appliesTo: dto.appliesTo } : {}),
      },
      orderBy: [
        { appliesTo: 'asc' },
        { priority: 'desc' },
        { minAmount: 'asc' },
      ],
      include: WITH_STEPS,
    });
    return { data };
  }

  async findOne(id: string) {
    const workflow = await this.prisma.approvalWorkflow.findFirst({
      where: { id, deletedAt: null },
      include: WITH_STEPS,
    });
    if (!workflow) throw new NotFoundException('Approval workflow not found');
    return workflow;
  }

  async create(dto: UpsertApprovalWorkflowDto, userId: string) {
    this.assertBand(dto);
    const workflow = await this.prisma.approvalWorkflow.create({
      data: {
        name: dto.name,
        description: dto.description,
        appliesTo: dto.appliesTo ?? ApprovalTarget.PURCHASE_REQUEST,
        categoryId: dto.categoryId ?? null,
        departmentId: dto.departmentId ?? null,
        minAmount: dto.minAmount ?? null,
        maxAmount: dto.maxAmount ?? null,
        priority: dto.priority ?? 0,
        isActive: dto.isActive ?? true,
        steps: {
          create: dto.steps.map((s, index) => ({
            stepOrder: index + 1,
            name: s.name,
            roleId: s.roleId ?? null,
            slaHours: s.slaHours ?? null,
            isMandatory: s.isMandatory ?? true,
          })),
        },
      },
      include: WITH_STEPS,
    });

    await this.audit.record({
      userId,
      action: 'CREATE',
      module: 'approval_workflow',
      entityId: workflow.id,
      newValue: { name: workflow.name, steps: dto.steps.length },
    });
    return workflow;
  }

  /**
   * Cập nhật tại chỗ theo thứ tự cấp: cấp cũ được sửa nội dung, cấp thừa mới bị
   * xóa. Nhờ vậy các yêu cầu đang chạy dở vẫn trỏ đúng vào cấp của mình. Nếu
   * cấp bị bỏ đi đã có người duyệt hoặc đang là cấp hiện hành thì từ chối,
   * tránh làm hỏng lịch sử.
   */
  async update(id: string, dto: UpsertApprovalWorkflowDto, userId: string) {
    const current = await this.findOne(id);
    this.assertBand(dto);

    const surplus = current.steps.slice(dto.steps.length);
    if (surplus.length) {
      const ids = surplus.map((s) => s.id);
      const [used, activeRequests, activeOrders] = await Promise.all([
        this.prisma.approvalHistory.count({ where: { stepId: { in: ids } } }),
        this.prisma.purchaseRequest.count({
          where: { currentStepId: { in: ids } },
        }),
        this.prisma.purchaseOrder.count({
          where: { currentStepId: { in: ids } },
        }),
      ]);
      if (used + activeRequests + activeOrders > 0) {
        throw new ConflictException(
          'Không xóa được cấp duyệt đã phát sinh hồ sơ. Hãy tạo luồng mới thay vì sửa luồng đang dùng.',
        );
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.approvalWorkflow.update({
        where: { id },
        data: {
          name: dto.name,
          description: dto.description,
          appliesTo: dto.appliesTo ?? current.appliesTo,
          categoryId: dto.categoryId ?? null,
          departmentId: dto.departmentId ?? null,
          minAmount: dto.minAmount ?? null,
          maxAmount: dto.maxAmount ?? null,
          priority: dto.priority ?? 0,
          isActive: dto.isActive ?? true,
        },
      });

      if (surplus.length) {
        await tx.approvalStep.deleteMany({
          where: { id: { in: surplus.map((s) => s.id) } },
        });
      }

      for (const [index, step] of dto.steps.entries()) {
        const existing = current.steps[index];
        const data = {
          name: step.name,
          roleId: step.roleId ?? null,
          slaHours: step.slaHours ?? null,
          isMandatory: step.isMandatory ?? true,
        };
        if (existing) {
          await tx.approvalStep.update({ where: { id: existing.id }, data });
        } else {
          await tx.approvalStep.create({
            data: { ...data, workflowId: id, stepOrder: index + 1 },
          });
        }
      }

      return tx.approvalWorkflow.findUniqueOrThrow({
        where: { id },
        include: WITH_STEPS,
      });
    });

    await this.audit.record({
      userId,
      action: 'UPDATE',
      module: 'approval_workflow',
      entityId: id,
      oldValue: {
        name: current.name,
        minAmount: current.minAmount,
        maxAmount: current.maxAmount,
        steps: current.steps.map((s) => s.name),
      },
      newValue: {
        name: dto.name,
        minAmount: dto.minAmount ?? null,
        maxAmount: dto.maxAmount ?? null,
        steps: dto.steps.map((s) => s.name),
      },
    });
    return updated;
  }

  /** Xóa mềm — hồ sơ cũ vẫn tra được luồng mình đã đi qua. */
  async remove(id: string, userId: string) {
    const current = await this.findOne(id);
    const inFlight = await this.prisma.$transaction([
      this.prisma.purchaseRequest.count({
        where: { approvalWorkflowId: id, currentStepId: { not: null } },
      }),
      this.prisma.purchaseOrder.count({
        where: { approvalWorkflowId: id, currentStepId: { not: null } },
      }),
    ]);
    if (inFlight[0] + inFlight[1] > 0) {
      throw new ConflictException(
        'Còn hồ sơ đang chạy trên luồng này. Tắt hoạt động thay vì xóa.',
      );
    }

    await this.prisma.approvalWorkflow.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
    await this.audit.record({
      userId,
      action: 'DELETE',
      module: 'approval_workflow',
      entityId: id,
      oldValue: { name: current.name },
    });
    return { success: true };
  }

  /** Cho admin thử một số tiền và xem hồ sơ sẽ đi qua những cấp nào. */
  async preview(dto: PreviewRoutingDto) {
    const resolved = await this.routing.resolve({
      amount: dto.amount,
      categoryId: dto.categoryId,
      departmentId: dto.departmentId,
      appliesTo: dto.appliesTo,
    });
    if (!resolved) return { matched: false as const };

    const roleIds = resolved.steps
      .map((s) => s.roleId)
      .filter((r): r is string => Boolean(r));
    const roles = await this.prisma.role.findMany({
      where: { id: { in: roleIds } },
      select: { id: true, name: true },
    });
    const roleName = new Map(roles.map((r) => [r.id, r.name]));

    return {
      matched: true as const,
      workflowId: resolved.workflowId,
      name: resolved.name,
      steps: resolved.steps.map((s) => ({
        ...s,
        roleName: s.roleId ? (roleName.get(s.roleId) ?? null) : null,
      })),
    };
  }

  private assertBand(dto: UpsertApprovalWorkflowDto) {
    if (
      dto.minAmount != null &&
      dto.maxAmount != null &&
      dto.maxAmount <= dto.minAmount
    ) {
      throw new ConflictException('Giá trị đến phải lớn hơn giá trị từ');
    }
  }
}
