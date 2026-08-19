import { Module } from '@nestjs/common';
import { VouchersService } from './vouchers.service';
import { VouchersController } from './vouchers.controller';
import { DatabaseModule } from '../../database/database.module'; // Import DatabaseModule

@Module({
  imports: [DatabaseModule], 
  controllers: [VouchersController],
  providers: [VouchersService],
})
export class VouchersModule {}