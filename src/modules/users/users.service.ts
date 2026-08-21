import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '@prisma/client';
import { UpdateProfileDto } from './dto/user-update.dto';
import { UpdateRoleDto } from './dto/role-update.dto';
import { NotificationsService } from '../notifications/notifications.service';
import * as argon2 from 'argon2';
import { Role } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService, private readonly notificationsService: NotificationsService) {}

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async create(data: Prisma.UserCreateInput) {
    return this.prisma.user.create({
      data,
    });
  }

  async updateUser(userId: string, data: Prisma.UserUpdateInput) {
      const userExists = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!userExists) {
        throw new NotFoundException(`Không tìm thấy tài khoản với ID: ${userId}`);
      }

      return this.prisma.user.update({
        where: { id: userId },
        data, 
      });
    }

  async updateRefreshToken(userId: string, refreshToken: string | null) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken },
    });
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const userExists = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!userExists) throw new NotFoundException('Không tìm thấy tài khoản');

    const dataToUpdate: any = {};

    if (dto.fullName) {
      dataToUpdate.fullName = dto.fullName;
    }

    if (dto.password) {
      const hashedPassword = await argon2.hash(dto.password);
      dataToUpdate.password = hashedPassword;
    }
    await this.notificationsService.pushNotificationToQueue(
      userId, 
      `Đổi thông tin thành công`
    );
    return this.prisma.user.update({
      where: { id: userId },
      data: dataToUpdate,
    });
  }
  async updateRole(userId: string, role: Role) {
    const userExists = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!userExists) throw new NotFoundException('Không tìm thấy tài khoản');
    await this.notificationsService.pushNotificationToQueue(
      userId, 
      `Bạn vừa được đổi quyền thành ${role}`
    );
    return this.prisma.user.update({
      where: { id: userId },
      data: { role },
    });
  }
}
