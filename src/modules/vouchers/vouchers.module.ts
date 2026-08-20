import { Module } from '@nestjs/common';
import { VouchersService } from './vouchers.service';
import { VouchersController } from './vouchers.controller';
import { DatabaseModule } from '../../database/database.module'; 
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [DatabaseModule, AuditLogsModule], 
  controllers: [VouchersController],
  providers: [VouchersService],
})
export class VouchersModule {}