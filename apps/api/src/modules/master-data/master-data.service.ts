import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PaginationDto, paginate } from '../../common/dto/pagination.dto';
import {
  CreateDepartmentDto,
  CreateProjectDto,
  QueryUsersDto,
  UpdateUserRolesDto,
} from './dto/master-data.dto';

@Injectable()
export class MasterDataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async departments(dto: PaginationDto) {
    const where: Prisma.DepartmentWhereInput = {
      deletedAt: null,
      ...(dto.search
        ? { name: { contains: dto.search, mode: 'insensitive' } }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.department.findMany({
        where,
        skip: dto.skip,
        take: dto.pageSize,
        orderBy: { name: 'asc' },
        include: { manager: { select: { id: true, fullName: true } } },
      }),
      this.prisma.department.count({ where }),
    ]);

    return paginate(data, total, dto);
  }

  async createDepartment(dto: CreateDepartmentDto, userId: string) {
    const existing = await this.prisma.department.findUnique({
      where: { code: dto.code },
    });
    if (existing) throw new ConflictException('Department code already exists');

    const department = await this.prisma.department.create({ data: dto });
    await this.audit.record({
      userId,
      action: 'CREATE',
      module: 'department',
      entityId: department.id,
      newValue: department,
    });
    return department;
  }

  async projects(dto: PaginationDto) {
    const where: Prisma.ProjectWhereInput = {
      deletedAt: null,
      ...(dto.search
        ? {
            OR: [
              { name: { contains: dto.search, mode: 'insensitive' } },
              { code: { contains: dto.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.project.findMany({
        where,
        skip: dto.skip,
        take: dto.pageSize,
        orderBy: { name: 'asc' },
      }),
      this.prisma.project.count({ where }),
    ]);

    return paginate(data, total, dto);
  }

  async createProject(dto: CreateProjectDto, userId: string) {
    const existing = await this.prisma.project.findUnique({
      where: { code: dto.code },
    });
    if (existing) throw new ConflictException('Project code already exists');

    const project = await this.prisma.project.create({
      data: {
        name: dto.name,
        code: dto.code,
        budget: dto.budget,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
      },
    });
    await this.audit.record({
      userId,
      action: 'CREATE',
      module: 'project',
      entityId: project.id,
      newValue: project,
    });
    return project;
  }

  roles() {
    return this.prisma.role.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
      include: { _count: { select: { users: true } } },
    });
  }

  async users(dto: QueryUsersDto) {
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(dto.departmentId ? { departmentId: dto.departmentId } : {}),
      ...(dto.role ? { roles: { some: { role: { code: dto.role } } } } : {}),
      ...(dto.search
        ? {
            OR: [
              { fullName: { contains: dto.search, mode: 'insensitive' } },
              { email: { contains: dto.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip: dto.skip,
        take: dto.pageSize,
        orderBy: { fullName: 'asc' },
        select: {
          id: true,
          email: true,
          fullName: true,
          phone: true,
          jobTitle: true,
          status: true,
          lastLoginAt: true,
          department: { select: { id: true, name: true, code: true } },
          roles: {
            select: { role: { select: { id: true, code: true, name: true } } },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return paginate(data, total, dto);
  }

  async updateUserRoles(id: string, dto: UpdateUserRolesDto, actorId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: { roles: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const found = await this.prisma.role.count({
      where: { id: { in: dto.roleIds }, deletedAt: null },
    });
    if (found !== dto.roleIds.length) {
      throw new NotFoundException('One or more roles do not exist');
    }

    await this.prisma.$transaction([
      this.prisma.userRole.deleteMany({ where: { userId: id } }),
      this.prisma.userRole.createMany({
        data: dto.roleIds.map((roleId) => ({ userId: id, roleId })),
      }),
    ]);

    await this.audit.record({
      userId: actorId,
      action: 'UPDATE',
      module: 'user_roles',
      entityId: id,
      oldValue: { roleIds: user.roles.map((r) => r.roleId) },
      newValue: { roleIds: dto.roleIds },
    });

    return this.prisma.user.findUniqueOrThrow({
      where: { id },
      select: {
        id: true,
        email: true,
        fullName: true,
        roles: {
          select: { role: { select: { id: true, code: true, name: true } } },
        },
      },
    });
  }
}
