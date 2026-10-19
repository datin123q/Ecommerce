import { Controller, Get, Patch, Param, UseGuards, Res, Query } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@prisma/client-core';
import { GetNotificationsDto } from './dto/get-notifications.dto';
import { Response } from 'express';
interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
}
@ApiTags('Notifications (Thông báo)')
@Controller('notifications')
@UseGuards(JwtAuthGuard) 
@ApiBearerAuth()
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách thông báo của tôi' })
  async getMyNotifications(@CurrentUser() user: AuthenticatedUser, @Query() query: GetNotificationsDto, @Res() res: Response) {
    const dataString = await this.notificationsService.getUserNotifications(user.id, query);
    res.setHeader('Content-Type', 'application/json');
    return res.send(dataString);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Đếm số lượng thông báo chưa đọc' })
  getUnreadCount(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.getUnreadCount(user.id);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Đánh dấu tất cả là đã đọc' })
  markAllAsRead(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.markAllAsRead(user.id);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Đánh dấu 1 thông báo cụ thể là đã đọc' })
  markAsRead(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.notificationsService.markAsRead(user.id, id);
  }
}