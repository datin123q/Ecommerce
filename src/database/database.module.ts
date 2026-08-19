import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service'; // Chỉnh lại đường dẫn nếu bạn đổi tên file

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService], // Export để các module khác gọi được
})
export class DatabaseModule {}