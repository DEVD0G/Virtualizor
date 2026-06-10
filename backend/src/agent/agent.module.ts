import { Global, Module } from '@nestjs/common';
import { AgentClientService } from './agent-client.service';

@Global()
@Module({
  providers: [AgentClientService],
  exports: [AgentClientService],
})
export class AgentModule {}
