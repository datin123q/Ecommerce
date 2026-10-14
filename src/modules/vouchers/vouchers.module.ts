import { Module } from '@nestjs/common';
import { VouchersService } from './vouchers.service';
import { DatabaseModule } from '../../database/database.module'; 

@Module({
  imports: [DatabaseModule], 
  providers: [VouchersService],
  exports: [VouchersService]
})
export class VouchersModule {}
