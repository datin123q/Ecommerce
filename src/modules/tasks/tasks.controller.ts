import { Controller, Post, UseGuards } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';


@ApiTags('Tasks')
@Controller('tasks')
@UseGuards(JwtAuthGuard) 
@ApiBearerAuth()
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post('auto-cancel-orders')
  @ApiOperation({ summary: 'Xóa Order chưa thanh toán(Phải đăng nhập)' })
  async triggerCancelOrders() {
    return this.tasksService.handleCancelOrders(); 
  }
}