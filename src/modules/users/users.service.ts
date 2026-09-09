import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '@prisma/client';
import { UpdateProfileDto } from './dto/user-update.dto';
import { UpdateRoleDto } from './dto/role-update.dto';
import * as argon2 from 'argon2';
import { Role } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService, private readonly eventEmitter: EventEmitter2) {}

  async findByEmail(email: string) {
    return this.prisma.db.user.findUnique({
      where: { email },
    });
  }

  async findById(id: string) {
    return this.prisma.db.user.findUnique({
      where: { id },
    });
  }

  async create(data: Prisma.UserCreateInput) {
    return this.prisma.db.user.create({
      data,
    });
  }

  async updateUser(userId: string, data: Prisma.UserUpdateInput) {
      const userExists = await this.prisma.db.user.findUnique({
        where: { id: userId },
      });

      if (!userExists) {
        throw new NotFoundException(`Không tìm thấy tài khoản với ID: ${userId}`);
      }

      return this.prisma.db.user.update({
        where: { id: userId },
        data, 
      });
    }

  async updateAvatar(userId: string, avatarUrl: string) {
    const updatedUser = await this.prisma.db.user.update({
      where: { id: userId },
      data: { avatar: avatarUrl },
      select: {
        id: true,
        email: true,
        fullName: true,
        avatar: true, 
      },
    });

    if (!updatedUser) throw new NotFoundException('Không tìm thấy người dùng');
    return updatedUser;
  }
    
  async updateRefreshToken(userId: string, refreshToken: string | null) {
    return this.prisma.db.user.update({
      where: { id: userId },
      data: { refreshToken },
    });
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const userExists = await this.prisma.db.user.findUnique({ where: { id: userId } });
    if (!userExists) throw new NotFoundException('Không tìm thấy tài khoản');

    const dataToUpdate: any = {};

    if (dto.fullName) {
      dataToUpdate.fullName = dto.fullName;
    }

    if (dto.password) {
      const hashedPassword = await argon2.hash(dto.password);
      dataToUpdate.password = hashedPassword;
    }
    this.eventEmitter.emit('profile.update', {
      userId: userId,
      content: `Đổi thông tin thành công.`
    });
    return this.prisma.db.user.update({
      where: { id: userId },
      data: dataToUpdate,
    });
  }
  async updateRole(userId: string, role: Role) {
    const userExists = await this.prisma.db.user.findUnique({ where: { id: userId } });
    if (!userExists) throw new NotFoundException('Không tìm thấy tài khoản');
    this.eventEmitter.emit('role.update', {
      userId: userId,
      content: `Bạn vừa được đổi quyền thành ${role}`
    });
    return this.prisma.db.user.update({
      where: { id: userId },
      data: { role },
    });
  }
}
