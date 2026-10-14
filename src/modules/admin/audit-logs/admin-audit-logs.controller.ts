import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { AuditLogsService } from '../../audit-logs/audit-logs.service';

@ApiTags('Admin Audit Logs')
@ApiBearerAuth()
@Controller('admin/audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminAuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  @Get()
  @ApiOperation({ summary: 'Xem nhật ký hệ thống.' })
  getAllLogs() {
    return this.auditLogsService.getLogs();
  }

  @Get('server')
  @ApiOperation({ summary: 'Xem hostname server.' })
  getServer() {
    return { hostname: process.env.HOSTNAME };
  }
}
