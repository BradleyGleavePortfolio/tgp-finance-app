import { Module } from '@nestjs/common';
import { SystemController } from './system.controller';
// Sprint A audit fix coach #13 — boot-time federation token self-check.
import { FederationTokenSelfCheck } from './federation-token-self-check';

@Module({
  controllers: [SystemController],
  providers: [FederationTokenSelfCheck],
})
export class SystemModule {}
