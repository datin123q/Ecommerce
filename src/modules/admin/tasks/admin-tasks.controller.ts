import { Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { TasksService } from '../../tasks/tasks.service';

@ApiTags('Admin Tasks')
@ApiBearerAuth()
@Controller('admin/tasks')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminTasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post('auto-cancel-orders')
  @ApiOperation({ summary: 'Chạy thủ công job tự hủy đơn quá hạn.' })
  triggerCancelOrders() {
    return this.tasksService.handleCancelOrders();
  }

  @Post('auto-send-mail-marketing')
  @ApiOperation({ summary: 'Chạy thủ công job gửi email marketing.' })
  triggerSendMailMarketing() {
    return this.tasksService.handleSendMailMarketing();
  }
}
