import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ProofAIService } from './proof-ai.service';
import { ProofController } from './proof.controller';
import { ProofService } from './proof.service';

@Module({
  imports: [PrismaModule],
  controllers: [ProofController],
  providers: [ProofService, ProofAIService],
  exports: [ProofService, ProofAIService],
})
export class ProofModule {}
