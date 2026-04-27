import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminFederationController } from './federation/admin-federation.controller';
import { AdminFederationService } from './federation/admin-federation.service';
import { ServiceTokenGuard } from './federation/service-token.guard';

@Module({
  controllers: [AdminController, AdminFederationController],
  providers: [AdminService, AdminFederationService, ServiceTokenGuard],
  exports: [AdminService],
})
export class AdminModule {}
