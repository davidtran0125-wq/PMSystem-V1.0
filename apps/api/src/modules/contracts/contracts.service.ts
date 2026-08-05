import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CertificateStatus, ContractStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { paginate } from '../../common/dto/pagination.dto';
import {
  certificateStatusFor,
  contractStatusFor,
  daysUntil,
  ExpiryService,
} from './expiry.service';
import {
  CreateCertificateDto,
  CreateContractDto,
  QueryCertificateDto,
  QueryContractDto,
  UpdateCertificateDto,
  UpdateContractDto,
} from './dto/contract.dto';

@Injectable()
export class ContractsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly expiry: ExpiryService,
  ) {}

  // ---------------------------------------------------------------- contracts

  async findAll(dto: QueryContractDto) {
    const in90 = new Date();
    in90.setDate(in90.getDate() + 90);

    const where: Prisma.ContractWhereInput = {
      deletedAt: null,
      ...(dto.status ? { status: dto.status } : {}),
      ...(dto.supplierId ? { supplierId: dto.supplierId } : {}),
      ...(dto.expiringOnly
        ? { endDate: { gte: new Date(), lte: in90 } }
        : {}),
      ...(dto.search
        ? {
            OR: [
              { contractNumber: { contains: dto.search, mode: 'insensitive' } },
              { title: { contains: dto.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.contract.findMany({
        where,
        skip: dto.skip,
        take: dto.pageSize,
        orderBy: { endDate: 'asc' },
        include: {
          supplier: { select: { id: true, code: true, companyName: true } },
          category: { select: { id: true, name: true, nameEn: true } },
          department: { select: { id: true, name: true } },
          buyer: { select: { id: true, fullName: true } },
        },
      }),
      this.prisma.contract.count({ where }),
    ]);

    const data = rows.map((c) => ({ ...c, daysRemaining: daysUntil(c.endDate) }));
    return paginate(data, total, dto);
  }

  async findOne(id: string) {
    const contract = await this.prisma.contract.findFirst({
      where: { id, deletedAt: null },
      include: {
        supplier: true,
        category: true,
        department: true,
        buyer: { select: { id: true, fullName: true, email: true } },
        attachments: { where: { deletedAt: null } },
        reminders: { orderBy: { remindAt: 'asc' } },
      },
    });
    if (!contract) throw new NotFoundException('Không tìm thấy hợp đồng');
    return { ...contract, daysRemaining: daysUntil(contract.endDate) };
  }

  async create(dto: CreateContractDto, userId: string) {
    const existing = await this.prisma.contract.findUnique({
      where: { contractNumber: dto.contractNumber },
    });
    if (existing) throw new ConflictException('Số hợp đồng đã tồn tại');

    const { startDate, endDate } = this.parseRange(dto.startDate, dto.endDate);

    const contract = await this.prisma.contract.create({
      data: {
        ...dto,
        startDate,
        endDate,
        status: dto.status ?? contractStatusFor(endDate),
      },
    });

    await this.expiry.scheduleContract(contract.id, endDate);
    await this.audit.record({
      userId,
      action: 'CREATE',
      module: 'contract',
      entityId: contract.id,
      newValue: { contractNumber: contract.contractNumber },
    });
    return this.findOne(contract.id);
  }

  async update(id: string, dto: UpdateContractDto, userId: string) {
    const current = await this.prisma.contract.findFirst({
      where: { id, deletedAt: null },
    });
    if (!current) throw new NotFoundException('Không tìm thấy hợp đồng');

    const startDate = dto.startDate ? new Date(dto.startDate) : current.startDate;
    const endDate = dto.endDate ? new Date(dto.endDate) : current.endDate;
    if (endDate <= startDate) {
      throw new BadRequestException('Ngày kết thúc phải sau ngày bắt đầu');
    }

    const contract = await this.prisma.contract.update({
      where: { id },
      data: {
        ...dto,
        startDate,
        endDate,
        status: dto.status ?? contractStatusFor(endDate, current.status),
      },
    });

    if (dto.endDate) await this.expiry.scheduleContract(id, endDate);
    await this.audit.record({
      userId,
      action: 'UPDATE',
      module: 'contract',
      entityId: id,
      oldValue: { endDate: current.endDate, status: current.status },
      newValue: { endDate: contract.endDate, status: contract.status },
    });
    return this.findOne(id);
  }

  async remove(id: string, userId: string) {
    const current = await this.prisma.contract.findFirst({
      where: { id, deletedAt: null },
    });
    if (!current) throw new NotFoundException('Không tìm thấy hợp đồng');

    await this.prisma.$transaction([
      this.prisma.contract.update({
        where: { id },
        data: { deletedAt: new Date() },
      }),
      this.prisma.reminderQueue.updateMany({
        where: { contractId: id, status: 'PENDING' },
        data: { status: 'CANCELLED' },
      }),
    ]);

    await this.audit.record({
      userId,
      action: 'DELETE',
      module: 'contract',
      entityId: id,
      oldValue: { contractNumber: current.contractNumber },
    });
    return { success: true };
  }

  // ------------------------------------------------------------- certificates

  async findCertificates(dto: QueryCertificateDto) {
    const in90 = new Date();
    in90.setDate(in90.getDate() + 90);

    const where: Prisma.CertificateWhereInput = {
      deletedAt: null,
      ...(dto.status ? { status: dto.status } : {}),
      ...(dto.supplierId ? { supplierId: dto.supplierId } : {}),
      ...(dto.expiringOnly
        ? { expiryDate: { gte: new Date(), lte: in90 } }
        : {}),
      ...(dto.search
        ? {
            OR: [
              { name: { contains: dto.search, mode: 'insensitive' } },
              { type: { contains: dto.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.certificate.findMany({
        where,
        skip: dto.skip,
        take: dto.pageSize,
        orderBy: { expiryDate: 'asc' },
        include: {
          supplier: { select: { id: true, code: true, companyName: true } },
        },
      }),
      this.prisma.certificate.count({ where }),
    ]);

    const data = rows.map((c) => ({
      ...c,
      daysRemaining: daysUntil(c.expiryDate),
    }));
    return paginate(data, total, dto);
  }

  async createCertificate(dto: CreateCertificateDto, userId: string) {
    const { startDate: issueDate, endDate: expiryDate } = this.parseRange(
      dto.issueDate,
      dto.expiryDate,
      'Ngày hết hạn phải sau ngày cấp',
    );

    const supplier = await this.prisma.supplier.findFirst({
      where: { id: dto.supplierId, deletedAt: null },
    });
    if (!supplier) throw new BadRequestException('Nhà cung cấp không tồn tại');

    const certificate = await this.prisma.certificate.create({
      data: {
        ...dto,
        issueDate,
        expiryDate,
        status: certificateStatusFor(expiryDate),
      },
      include: { supplier: { select: { id: true, companyName: true } } },
    });

    await this.expiry.scheduleCertificate(certificate.id, expiryDate);
    await this.audit.record({
      userId,
      action: 'CREATE',
      module: 'certificate',
      entityId: certificate.id,
      newValue: { name: certificate.name, supplierId: certificate.supplierId },
    });
    return { ...certificate, daysRemaining: daysUntil(expiryDate) };
  }

  async updateCertificate(
    id: string,
    dto: UpdateCertificateDto,
    userId: string,
  ) {
    const current = await this.prisma.certificate.findFirst({
      where: { id, deletedAt: null },
    });
    if (!current) throw new NotFoundException('Không tìm thấy chứng chỉ');

    const issueDate = dto.issueDate ? new Date(dto.issueDate) : current.issueDate;
    const expiryDate = dto.expiryDate
      ? new Date(dto.expiryDate)
      : current.expiryDate;
    if (expiryDate <= issueDate) {
      throw new BadRequestException('Ngày hết hạn phải sau ngày cấp');
    }

    const certificate = await this.prisma.certificate.update({
      where: { id },
      data: {
        ...dto,
        issueDate,
        expiryDate,
        status: certificateStatusFor(expiryDate, current.status),
      },
      include: { supplier: { select: { id: true, companyName: true } } },
    });

    if (dto.expiryDate) await this.expiry.scheduleCertificate(id, expiryDate);
    await this.audit.record({
      userId,
      action: 'UPDATE',
      module: 'certificate',
      entityId: id,
      oldValue: { expiryDate: current.expiryDate },
      newValue: { expiryDate: certificate.expiryDate },
    });
    return { ...certificate, daysRemaining: daysUntil(expiryDate) };
  }

  async removeCertificate(id: string, userId: string) {
    const current = await this.prisma.certificate.findFirst({
      where: { id, deletedAt: null },
    });
    if (!current) throw new NotFoundException('Không tìm thấy chứng chỉ');

    await this.prisma.$transaction([
      this.prisma.certificate.update({
        where: { id },
        data: { deletedAt: new Date(), status: CertificateStatus.REVOKED },
      }),
      this.prisma.reminderQueue.updateMany({
        where: { certificateId: id, status: 'PENDING' },
        data: { status: 'CANCELLED' },
      }),
    ]);

    await this.audit.record({
      userId,
      action: 'DELETE',
      module: 'certificate',
      entityId: id,
      oldValue: { name: current.name },
    });
    return { success: true };
  }

  private parseRange(
    from: string,
    to: string,
    message = 'Ngày kết thúc phải sau ngày bắt đầu',
  ) {
    const startDate = new Date(from);
    const endDate = new Date(to);
    if (endDate <= startDate) throw new BadRequestException(message);
    return { startDate, endDate };
  }
}
