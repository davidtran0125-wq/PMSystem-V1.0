import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { AiModule } from './modules/ai/ai.module';
import { AttachmentsModule } from './modules/attachments/attachments.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { CommentsModule } from './modules/comments/comments.module';
import { ContractsModule } from './modules/contracts/contracts.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { MasterDataModule } from './modules/master-data/master-data.module';
import { MaterialsModule } from './modules/materials/materials.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PurchaseOrdersModule } from './modules/purchase-orders/purchase-orders.module';
import { PurchaseRequestsModule } from './modules/purchase-requests/purchase-requests.module';
import { PerformanceModule } from './modules/performance/performance.module';
import { ReportsModule } from './modules/reports/reports.module';
import { RfqModule } from './modules/rfq/rfq.module';
import { SettingsModule } from './modules/settings/settings.module';
import { ApprovalsModule } from './modules/approvals/approvals.module';
import { HealthModule } from './modules/health/health.module';
import { SuppliersModule } from './modules/suppliers/suppliers.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        ttl: Number(process.env.THROTTLE_TTL ?? 60) * 1000,
        limit: Number(process.env.THROTTLE_LIMIT ?? 120),
      },
    ]),
    PrismaModule,
    AuditModule,
    NotificationsModule,
    AuthModule,
    MasterDataModule,
    UsersModule,
    CategoriesModule,
    MaterialsModule,
    PurchaseRequestsModule,
    CommentsModule,
    SuppliersModule,
    RfqModule,
    PurchaseOrdersModule,
    ContractsModule,
    AiModule,
    AttachmentsModule,
    PerformanceModule,
    ReportsModule,
    SettingsModule,
    ApprovalsModule,
    HealthModule,
    DashboardModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
