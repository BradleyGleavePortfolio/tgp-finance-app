import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminFederationController } from './federation/admin-federation.controller';
import { AdminFederationService } from './federation/admin-federation.service';
import { ServiceTokenGuard } from './federation/service-token.guard';
import { AdminAIController } from './ai/admin-ai.controller';
import { AIModule } from '../ai/ai.module';

@Module({
  // AIModule is imported (not just providers re-listed) so the breaker
  // singleton is shared between the runtime callers in AIService and the
  // observability/control endpoints in AdminAIController. Two instances
  // would mean the admin endpoints reported the wrong state and overrides
  // didn't reach the actual chat path.
  imports: [AIModule],
  controllers: [AdminController, AdminFederationController, AdminAIController],
  providers: [AdminService, AdminFederationService, ServiceTokenGuard],
  exports: [AdminService],
})
export class AdminModule {}
