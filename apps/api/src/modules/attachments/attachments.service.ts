import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { StorageService } from './storage.service';
import { AuthUser } from '../../common/decorators';
import { PERMISSIONS, type PermissionCode } from '../../common/permissions';

export interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/**
 * Entities that accept attachments, where each one hangs off, and which
 * permission governs it. The target arrives as a query parameter, so a static
 * `@RequirePermissions` on the controller cannot express this — a document is
 * only as protected as the record it belongs to, and a single blanket
 * permission would let anyone who can read a purchase request also read and
 * delete contract files.
 */
const TARGETS = {
  CONTRACT: {
    field: 'contractId',
    folder: 'contracts',
    read: PERMISSIONS.CONTRACT_READ,
    write: PERMISSIONS.CONTRACT_WRITE,
  },
  CERTIFICATE: {
    field: 'certificateId',
    folder: 'certificates',
    read: PERMISSIONS.CERTIFICATE_READ,
    write: PERMISSIONS.CERTIFICATE_WRITE,
  },
  PURCHASE_REQUEST: {
    field: 'purchaseRequestId',
    folder: 'purchase-requests',
    read: PERMISSIONS.PR_READ,
    write: PERMISSIONS.PR_WRITE,
  },
  PURCHASE_ORDER: {
    field: 'purchaseOrderId',
    folder: 'purchase-orders',
    read: PERMISSIONS.PO_READ,
    write: PERMISSIONS.PO_WRITE,
  },
  SUPPLIER: {
    field: 'supplierId',
    folder: 'suppliers',
    read: PERMISSIONS.SUPPLIER_READ,
    write: PERMISSIONS.SUPPLIER_WRITE,
  },
  RFQ: {
    field: 'rfqId',
    folder: 'rfqs',
    read: PERMISSIONS.RFQ_READ,
    write: PERMISSIONS.RFQ_WRITE,
  },
  QUOTATION: {
    field: 'quotationId',
    folder: 'quotations',
    read: PERMISSIONS.QUOTATION_READ,
    write: PERMISSIONS.QUOTATION_WRITE,
  },
} as const;

export type AttachmentTarget = keyof typeof TARGETS;

const MAX_SIZE = 25 * 1024 * 1024;

const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
  'application/x-zip-compressed',
  'image/png',
  'image/jpeg',
  'image/webp',
  'text/plain',
  'text/csv',
]);

@Injectable()
export class AttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  async list(target: AttachmentTarget, entityId: string, user: AuthUser) {
    const { field } = this.targetOf(target);
    await this.assertAccess(target, entityId, user, 'read');
    return this.prisma.attachment.findMany({
      where: {
        [field]: entityId,
        deletedAt: null,
      },
      orderBy: [{ createdAt: 'desc' }],
      include: {
        uploadedBy: { select: { id: true, fullName: true } },
      },
    });
  }

  async upload(
    target: AttachmentTarget,
    entityId: string,
    file: UploadedFile,
    documentType: string | undefined,
    user: AuthUser,
  ) {
    const { field, folder } = this.targetOf(target);

    if (!file?.buffer?.length) {
      throw new BadRequestException('File rỗng hoặc chưa được chọn');
    }
    if (file.size > MAX_SIZE) {
      throw new BadRequestException('File vượt quá 25MB');
    }
    if (!ALLOWED_MIME.has(file.mimetype)) {
      throw new BadRequestException(
        `Không hỗ trợ định dạng ${file.mimetype}. Cho phép PDF, Word, Excel, PowerPoint, ZIP, ảnh và text.`,
      );
    }

    await this.assertAccess(target, entityId, user, 'write');

    // Same name on the same entity means a new version, not a duplicate row.
    const previous = await this.prisma.attachment.findFirst({
      where: {
        [field]: entityId,
        originalName: file.originalname,
        deletedAt: null,
      },
      orderBy: { version: 'desc' },
    });

    const storageKey = await this.storage.save(
      folder,
      file.originalname,
      file.buffer,
    );

    const attachment = await this.prisma.attachment.create({
      data: {
        fileName: storageKey.split('/').pop() ?? file.originalname,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        storageKey,
        entityType: target,
        documentType,
        uploadedById: user.id,
        version: (previous?.version ?? 0) + 1,
        parentId: previous?.id ?? null,
        [field]: entityId,
      },
      include: { uploadedBy: { select: { id: true, fullName: true } } },
    });

    await this.audit.record({
      userId: user.id,
      action: 'UPLOAD',
      module: 'attachment',
      entityId: attachment.id,
      newValue: {
        target,
        entityId,
        originalName: file.originalname,
        size: file.size,
        version: attachment.version,
      },
    });

    return attachment;
  }

  async download(id: string, user: AuthUser) {
    const attachment = await this.prisma.attachment.findFirst({
      where: { id, deletedAt: null },
    });
    if (!attachment) throw new NotFoundException('Không tìm thấy tài liệu');
    await this.assertAttachmentAccess(attachment, user, 'read');

    return {
      attachment,
      stream: this.storage.stream(attachment.storageKey),
    };
  }

  async remove(id: string, user: AuthUser) {
    const attachment = await this.prisma.attachment.findFirst({
      where: { id, deletedAt: null },
    });
    if (!attachment) throw new NotFoundException('Không tìm thấy tài liệu');
    await this.assertAttachmentAccess(attachment, user, 'write');

    // Soft delete keeps the audit trail; the blob goes so storage does not grow.
    await this.prisma.attachment.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.storage.remove(attachment.storageKey);

    await this.audit.record({
      userId: user.id,
      action: 'DELETE',
      module: 'attachment',
      entityId: id,
      oldValue: { originalName: attachment.originalName },
    });

    return { success: true };
  }

  private targetOf(target: AttachmentTarget) {
    const config = TARGETS[target];
    if (!config) {
      throw new BadRequestException(`Không hỗ trợ đính kèm cho ${target}`);
    }
    return config;
  }

  /**
   * A document inherits the access rules of the record it hangs off: the
   * permission for that record type, plus — for supplier accounts — proof that
   * the record is theirs. Reading a contract file must need `contract:read`,
   * not whatever permission the controller happened to declare.
   */
  private async assertAccess(
    target: AttachmentTarget,
    entityId: string,
    user: AuthUser,
    mode: 'read' | 'write',
  ) {
    const config = this.targetOf(target);
    const required: PermissionCode = config[mode];
    if (!user.permissions.includes(required)) {
      throw new ForbiddenException(
        `Bạn cần quyền ${required} để thao tác với tài liệu này`,
      );
    }

    const entity = await this.lookup(target, entityId);
    if (!entity) {
      throw new NotFoundException('Không tìm thấy đối tượng để đính kèm');
    }

    if (
      user.supplierId &&
      !this.belongsToSupplier(target, entity, user.supplierId)
    ) {
      throw new ForbiddenException('Bạn không truy cập được tài liệu này');
    }
  }

  private async assertAttachmentAccess(
    attachment: { entityType: EntityType | null } & Record<string, unknown>,
    user: AuthUser,
    mode: 'read' | 'write',
  ) {
    const target = attachment.entityType as AttachmentTarget | null;
    if (!target || !(target in TARGETS)) {
      throw new NotFoundException('Không tìm thấy tài liệu');
    }
    const entityId = attachment[this.targetOf(target).field] as string | null;
    if (!entityId) throw new NotFoundException('Không tìm thấy tài liệu');

    await this.assertAccess(target, entityId, user, mode);
  }

  /** Nhà cung cấp chỉ chạm được hồ sơ gắn với chính mình. */
  private belongsToSupplier(
    target: AttachmentTarget,
    entity: Record<string, unknown>,
    supplierId: string,
  ): boolean {
    switch (target) {
      case 'SUPPLIER':
        return entity.id === supplierId;
      case 'CERTIFICATE':
      case 'QUOTATION':
      case 'PURCHASE_ORDER':
      case 'CONTRACT':
        return entity.supplierId === supplierId;
      // RFQ và yêu cầu mua hàng là tài liệu nội bộ bên mua.
      case 'RFQ':
      case 'PURCHASE_REQUEST':
        return false;
    }
  }

  private lookup(
    target: AttachmentTarget,
    id: string,
  ): Promise<Record<string, unknown> | null> {
    const where = { id, deletedAt: null };
    const owned = { id: true, supplierId: true };
    switch (target) {
      case 'CONTRACT':
        return this.prisma.contract.findFirst({ where, select: owned });
      case 'CERTIFICATE':
        return this.prisma.certificate.findFirst({ where, select: owned });
      case 'PURCHASE_REQUEST':
        return this.prisma.purchaseRequest.findFirst({
          where,
          select: { id: true },
        });
      case 'PURCHASE_ORDER':
        return this.prisma.purchaseOrder.findFirst({ where, select: owned });
      case 'SUPPLIER':
        return this.prisma.supplier.findFirst({ where, select: { id: true } });
      case 'RFQ':
        return this.prisma.rfq.findFirst({ where, select: { id: true } });
      case 'QUOTATION':
        return this.prisma.supplierQuotation.findFirst({
          where,
          select: owned,
        });
    }
  }
}
