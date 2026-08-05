import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { SupplierStatus, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { CodeGeneratorService } from '../../common/code-generator.service';
import { ROLES } from '../../common/permissions';
import { LoginDto, RegisterDto, SupplierRegisterDto } from './dto/auth.dto';

interface RequestMeta {
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly codes: CodeGeneratorService,
  ) {}

  async register(dto: RegisterDto, meta: RequestMeta) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) throw new ConflictException('Email is already registered');

    const role = await this.prisma.role.findUniqueOrThrow({
      where: { code: ROLES.END_USER },
    });

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash: await bcrypt.hash(dto.password, 12),
        fullName: dto.fullName,
        phone: dto.phone,
        departmentId: dto.departmentId,
        status: UserStatus.ACTIVE,
        roles: { create: { roleId: role.id } },
      },
    });

    return this.issueTokens(user.id, user.email, meta);
  }

  async registerSupplier(dto: SupplierRegisterDto, meta: RequestMeta) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) throw new ConflictException('Email is already registered');

    const role = await this.prisma.role.findUniqueOrThrow({
      where: { code: ROLES.SUPPLIER },
    });
    const code = await this.codes.next('SUP');

    const user = await this.prisma.$transaction(async (tx) => {
      const supplier = await tx.supplier.create({
        data: {
          code,
          companyName: dto.companyName,
          taxCode: dto.taxCode,
          email: dto.email,
          phone: dto.phone,
          contactPerson: dto.contactPerson,
          status: SupplierStatus.PENDING,
        },
      });

      return tx.user.create({
        data: {
          email: dto.email,
          passwordHash: await bcrypt.hash(dto.password, 12),
          fullName: dto.contactPerson,
          phone: dto.phone,
          supplierId: supplier.id,
          status: UserStatus.ACTIVE,
          roles: { create: { roleId: role.id } },
        },
      });
    });

    return this.issueTokens(user.id, user.email, meta);
  }

  async login(dto: LoginDto, meta: RequestMeta) {
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email, deletedAt: null },
    });

    // Compare against a dummy hash when the user is missing so that response
    // timing does not reveal whether an email exists.
    const hash =
      user?.passwordHash ??
      '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidi';
    const valid = await bcrypt.compare(dto.password, hash);

    if (!user || !valid) throw new UnauthorizedException('Invalid credentials');
    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Account is not active');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return this.issueTokens(user.id, user.email, meta);
  }

  async refresh(refreshToken: string, meta: RequestMeta) {
    const tokenHash = this.hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token is invalid or expired');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return this.issueTokens(stored.user.id, stored.user.email, meta);
  }

  async logout(refreshToken: string) {
    const tokenHash = this.hashToken(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { success: true };
  }

  async profile(userId: string) {
    const user = await this.prisma.user.findFirstOrThrow({
      where: { id: userId, deletedAt: null },
      include: {
        department: true,
        supplier: true,
        roles: {
          include: {
            role: {
              include: { permissions: { include: { permission: true } } },
            },
          },
        },
      },
    });

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
      jobTitle: user.jobTitle,
      locale: user.locale,
      status: user.status,
      department: user.department,
      supplier: user.supplier,
      roles: user.roles.map((r) => r.role.code),
      permissions: [
        ...new Set(
          user.roles.flatMap((r) =>
            r.role.permissions.map((p) => p.permission.code),
          ),
        ),
      ],
    };
  }

  private async issueTokens(userId: string, email: string, meta: RequestMeta) {
    const signOptions: JwtSignOptions = {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRES_IN', '15m'),
    } as JwtSignOptions;

    const accessToken = await this.jwt.signAsync(
      { sub: userId, email },
      signOptions,
    );

    const refreshToken = randomBytes(48).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.refreshDays());

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hashToken(refreshToken),
        expiresAt,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      },
    });

    return {
      accessToken,
      refreshToken,
      user: await this.profile(userId),
    };
  }

  private refreshDays(): number {
    const raw = this.config.get<string>('JWT_REFRESH_EXPIRES_IN', '7d');
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 7;
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
