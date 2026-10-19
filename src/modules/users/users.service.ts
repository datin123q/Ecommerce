import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Prisma, Role } from '@prisma/client-core';
import { UpdateProfileDto } from './dto/user-update.dto';
import * as argon2 from 'argon2';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2
  ) {}

  getDashboardNewCustomerCount(from: Date, to: Date) {
    return this.prisma.db.user.count({
      where: { createdAt: { gte: from, lt: to } },
    });
  }

  async getAdminUsers(query: {
    page: number;
    limit: number;
    email?: string;
  }) {
    const { page, limit } = query;
    const where: Prisma.UserWhereInput = {
      ...(query.email?.trim()
        ? {
            email: {
              contains: query.email.trim(),
              mode: 'insensitive',
            },
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.masterClient.user.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          avatar: true,
          isVerified: true,
          createdAt: true,
          _count: { select: { orders: true } },
        },
      }),
      this.prisma.masterClient.user.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);
    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  async getAdminUserById(userId: string) {
    const user = await this.prisma.masterClient.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        avatar: true,
        isVerified: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
        orders: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            status: true,
            totalAmount: true,
            createdAt: true,
            payment: { select: { status: true, method: true } },
            _count: { select: { orderItems: true } },
          },
        },
      },
    });
    if (!user) {
      throw new NotFoundException(`Không tìm thấy tài khoản với ID: ${userId}`);
    }
    return user;
  }

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
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        avatar: true,
        createdAt: true,
        updatedAt: true,
      },
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

    this.emitRoleUpdate(userId, role);
    return updatedUser;
  }

  async updateAdminRole(userId: string, role: Role) {
    await this.ensureUserExists(userId);

    const updatedUser = await this.prisma.db.user.update({
      where: { id: userId },
      data: { role },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        avatar: true,
        updatedAt: true,
      },
    });

    this.emitRoleUpdate(userId, role);

    return updatedUser;
  }

  private emitRoleUpdate(userId: string, role: Role) {
    this.eventEmitter.emit('role.update', {
      userId,
      content: `Bạn vừa được đổi quyền thành ${role}`,
    });
  }

  private async ensureUserExists(userId: string): Promise<void> {
    const userExists = await this.findById(userId);
    if (!userExists) {
      throw new NotFoundException(`Không tìm thấy tài khoản với ID: ${userId}`);
    }
  }
}
