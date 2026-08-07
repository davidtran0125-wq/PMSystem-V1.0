import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { paginate } from '../../common/dto/pagination.dto';
import { countByStatus } from '../../common/status-counts';
import type { AuthUser } from '../../common/decorators';
import {
  ChangePasswordDto,
  CreateUserDto,
  QueryUsersDto,
  ResetPasswordDto,
  UpdateProfileDto,
  UpdateUserDto,
  UpdateUserRolesDto,
} from './dto/user.dto';

const USER_SELECT = {
  id: true,
  email: true,
  fullName: true,
  phone: true,
  jobTitle: true,
  locale: true,
  status: true,
  lastLoginAt: true,
  createdAt: true,
  department: { select: { id: true, name: true, code: true } },
  supplier: { select: { id: true, companyName: true } },
  roles: {
    select: { role: { select: { id: true, code: true, name: true } } },
  },
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
  ) {}

  /** Điều kiện lọc dùng chung cho danh sách và cho phần đếm theo trạng thái. */
  private listWhere(
    dto: QueryUsersDto,
    opts: { ignoreStatus?: boolean } = {},
  ): Prisma.UserWhereInput {
    return {
      deletedAt: null,
      ...(dto.departmentId ? { departmentId: dto.departmentId } : {}),
      ...(dto.status && !opts.ignoreStatus ? { status: dto.status } : {}),
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
  }

  /** Số tài khoản theo từng trạng thái. */
  async statusCounts(dto: QueryUsersDto) {
    return countByStatus(
      this.prisma.user,
      this.listWhere(dto, { ignoreStatus: true }),
      UserStatus,
    );
  }

  async findAll(dto: QueryUsersDto) {
    const where = this.listWhere(dto);

    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip: dto.skip,
        take: dto.pageSize,
        orderBy: { fullName: 'asc' },
        select: USER_SELECT,
      }),
      this.prisma.user.count({ where }),
    ]);

    return paginate(data, total, dto);
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: USER_SELECT,
    });
    if (!user) throw new NotFoundException('Không tìm thấy người dùng');
    return user;
  }

  async create(dto: CreateUserDto, actor: AuthUser) {
    const email = dto.email.toLowerCase().trim();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new BadRequestException('Email này đã có tài khoản');
    }
    await this.assertRolesExist(dto.roleIds);
    if (dto.departmentId) await this.assertDepartmentExists(dto.departmentId);

    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(dto.password, 12),
        fullName: dto.fullName,
        phone: dto.phone,
        jobTitle: dto.jobTitle,
        departmentId: dto.departmentId,
        status: UserStatus.ACTIVE,
        roles: { create: dto.roleIds.map((roleId) => ({ roleId })) },
      },
      select: USER_SELECT,
    });

    await this.audit.record({
      userId: actor.id,
      action: 'CREATE',
      module: 'user',
      entityId: user.id,
      newValue: {
        email: user.email,
        fullName: user.fullName,
        roleIds: dto.roleIds,
      },
    });

    return user;
  }

  async update(id: string, dto: UpdateUserDto, actor: AuthUser) {
    const current = await this.findOne(id);
    if (dto.departmentId) await this.assertDepartmentExists(dto.departmentId);

    // Khoá chính mình sẽ tự đẩy mình ra khỏi hệ thống ngay lần gọi API kế tiếp.
    if (id === actor.id && dto.status && dto.status !== UserStatus.ACTIVE) {
      throw new BadRequestException(
        'Không thể tự khóa tài khoản của chính mình',
      );
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        fullName: dto.fullName,
        phone: dto.phone,
        jobTitle: dto.jobTitle,
        departmentId: dto.departmentId,
        status: dto.status,
      },
      select: USER_SELECT,
    });

    // Khóa tài khoản thì thu hồi phiên đăng nhập, nếu không người đó vẫn dùng
    // được access token cho tới khi hết hạn.
    if (dto.status && dto.status !== UserStatus.ACTIVE) {
      await this.prisma.refreshToken.deleteMany({ where: { userId: id } });
    }

    await this.audit.record({
      userId: actor.id,
      action: 'UPDATE',
      module: 'user',
      entityId: id,
      oldValue: { fullName: current.fullName, status: current.status },
      newValue: { fullName: user.fullName, status: user.status },
    });

    return user;
  }

  async updateRoles(id: string, dto: UpdateUserRolesDto, actor: AuthUser) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: { roles: true },
    });
    if (!user) throw new NotFoundException('Không tìm thấy người dùng');
    await this.assertRolesExist(dto.roleIds);

    // Tự bỏ hết vai trò của mình là tự khóa cửa, chặn ngay tại đây.
    if (id === actor.id && !dto.roleIds.length) {
      throw new BadRequestException('Không thể bỏ hết vai trò của chính mình');
    }

    await this.prisma.$transaction([
      this.prisma.userRole.deleteMany({ where: { userId: id } }),
      this.prisma.userRole.createMany({
        data: dto.roleIds.map((roleId) => ({ userId: id, roleId })),
      }),
    ]);

    await this.audit.record({
      userId: actor.id,
      action: 'UPDATE',
      module: 'user_roles',
      entityId: id,
      oldValue: { roleIds: user.roles.map((r) => r.roleId) },
      newValue: { roleIds: dto.roleIds },
    });

    return this.findOne(id);
  }

  /** Admin đặt lại mật khẩu hộ, dùng khi người dùng quên mật khẩu. */
  async resetPassword(id: string, dto: ResetPasswordDto, actor: AuthUser) {
    await this.findOne(id);
    await this.prisma.user.update({
      where: { id },
      data: { passwordHash: await bcrypt.hash(dto.newPassword, 12) },
    });
    await this.prisma.refreshToken.deleteMany({ where: { userId: id } });

    await this.audit.record({
      userId: actor.id,
      action: 'RESET_PASSWORD',
      module: 'user',
      entityId: id,
    });

    return { success: true };
  }

  async remove(id: string, actor: AuthUser) {
    if (id === actor.id) {
      throw new BadRequestException('Không thể xóa tài khoản của chính mình');
    }
    const user = await this.findOne(id);

    // Xóa mềm: người này còn đứng tên trên yêu cầu, đơn hàng và nhật ký cũ.
    await this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), status: UserStatus.SUSPENDED },
    });
    await this.prisma.refreshToken.deleteMany({ where: { userId: id } });

    await this.audit.record({
      userId: actor.id,
      action: 'DELETE',
      module: 'user',
      entityId: id,
      oldValue: { email: user.email, fullName: user.fullName },
    });

    return { success: true };
  }

  // -------------------------------------------------------------------------
  // Hồ sơ cá nhân
  // -------------------------------------------------------------------------

  async updateProfile(dto: UpdateProfileDto, actor: AuthUser) {
    const user = await this.prisma.user.update({
      where: { id: actor.id },
      data: {
        fullName: dto.fullName,
        phone: dto.phone,
        jobTitle: dto.jobTitle,
        locale: dto.locale,
      },
      select: USER_SELECT,
    });

    await this.audit.record({
      userId: actor.id,
      action: 'UPDATE',
      module: 'user_profile',
      entityId: actor.id,
      newValue: { fullName: user.fullName, phone: user.phone },
    });

    return user;
  }

  async changePassword(
    dto: ChangePasswordDto,
    actor: AuthUser,
    meta: { ipAddress?: string; userAgent?: string } = {},
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: actor.id },
      select: { passwordHash: true },
    });
    if (!user) throw new NotFoundException('Không tìm thấy người dùng');

    const matches = await bcrypt.compare(
      dto.currentPassword,
      user.passwordHash,
    );
    if (!matches) throw new ForbiddenException('Mật khẩu hiện tại không đúng');
    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('Mật khẩu mới phải khác mật khẩu cũ');
    }

    await this.prisma.user.update({
      where: { id: actor.id },
      data: { passwordHash: await bcrypt.hash(dto.newPassword, 12) },
    });

    // Đổi mật khẩu thường là vì nghi bị lộ, nên thu hồi hết phiên cũ rồi cấp
    // lại một cặp token cho chính thiết bị đang thao tác — người vừa đổi mật
    // khẩu không có lý do gì phải đăng nhập lại.
    await this.prisma.refreshToken.deleteMany({ where: { userId: actor.id } });
    const tokens = await this.auth.issueTokens(actor.id, actor.email, meta);

    await this.audit.record({
      userId: actor.id,
      action: 'CHANGE_PASSWORD',
      module: 'user',
      entityId: actor.id,
    });

    return {
      success: true,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  // -------------------------------------------------------------------------

  private async assertRolesExist(roleIds: string[]) {
    if (!roleIds.length) return;
    const found = await this.prisma.role.count({
      where: { id: { in: roleIds }, deletedAt: null },
    });
    if (found !== roleIds.length) {
      throw new NotFoundException('Có vai trò không tồn tại');
    }
  }

  private async assertDepartmentExists(departmentId: string) {
    const department = await this.prisma.department.findFirst({
      where: { id: departmentId, deletedAt: null },
    });
    if (!department) throw new BadRequestException('Phòng ban không tồn tại');
  }
}
