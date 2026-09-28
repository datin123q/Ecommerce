import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Prisma, Role } from '@prisma/client';
import { UpdateProfileDto } from './dto/user-update.dto';
import * as argon2 from 'argon2';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2
  ) {}

  async findByEmail(email: string) {
    return this.prisma.db.user.findUnique({ where: { email } });
  }

  async findById(id: string) {
    return this.prisma.db.user.findUnique({ where: { id } });
  }

  async findByValidVerifyToken(hashedToken: string) {
    return this.prisma.db.user.findFirst({
      where: {
        verifyToken: hashedToken,
        verifyExpires: { gt: new Date() },
      },
    });
  }

  async findByValidResetToken(hashedToken: string) {
    return this.prisma.db.user.findFirst({
      where: {
        resetPasswordToken: hashedToken,
        resetPasswordExpires: { gt: new Date() },
      },
    });
  }

  async create(data: Prisma.UserCreateInput) {
    return this.prisma.db.user.create({ data });
  }

  async updateUser(userId: string, data: Prisma.UserUpdateInput) {
    await this.ensureUserExists(userId);
    return this.prisma.db.user.update({ where: { id: userId }, data });
  }

  async updateAvatar(userId: string, avatarUrl: string) {
    await this.ensureUserExists(userId);
    return this.prisma.db.user.update({
      where: { id: userId },
      data: { avatar: avatarUrl },
      select: { id: true, email: true, fullName: true, avatar: true },
    });
  }

  async updateRefreshToken(userId: string, refreshToken: string | null) {
    return this.prisma.db.user.update({
      where: { id: userId },
      data: { refreshToken },
    });
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    await this.ensureUserExists(userId);

    const dataToUpdate: Prisma.UserUpdateInput = {
      ...(dto.fullName && { fullName: dto.fullName }),
      ...(dto.password && { password: await argon2.hash(dto.password) }),
    };

    const updatedUser = await this.prisma.db.user.update({
      where: { id: userId },
      data: dataToUpdate,
    });

    this.eventEmitter.emit('profile.update', {
      userId,
      content: `Đổi thông tin thành công.`,
    });

    return updatedUser;
  }

  async updateRole(userId: string, role: Role) {
    await this.ensureUserExists(userId);

    const updatedUser = await this.prisma.db.user.update({
      where: { id: userId },
      data: { role },
    });

    this.eventEmitter.emit('role.update', {
      userId,
      content: `Bạn vừa được đổi quyền thành ${role}`,
    });

    return updatedUser;
  }

  private async ensureUserExists(userId: string): Promise<void> {
    const userExists = await this.findById(userId);
    if (!userExists) {
      throw new NotFoundException(`Không tìm thấy tài khoản với ID: ${userId}`);
    }
  }
}