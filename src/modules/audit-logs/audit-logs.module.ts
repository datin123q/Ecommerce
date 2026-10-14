import { Module } from '@nestjs/common';
import { AuditLogsService } from './audit-logs.service';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [DatabaseModule],
  providers: [AuditLogsService],
  exports: [AuditLogsService], 
})
export class AuditLogsModule {}
