import { Module } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CategoriesController } from './categories.controller';
import { DatabaseModule } from '../../database/database.module'; // Import DatabaseModule
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [DatabaseModule, AuditLogsModule], 
  controllers: [CategoriesController],
  providers: [CategoriesService],
})
export class CategoriesModule {}