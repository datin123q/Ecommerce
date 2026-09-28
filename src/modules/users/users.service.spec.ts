import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../../database/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import * as argon2 from 'argon2';

jest.mock('argon2');

describe('UsersService', () => {
  let service: UsersService;
  let prisma: PrismaService;
  let eventEmitter: EventEmitter2;

  const mockPrismaService = {
    db: {
      user: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    },
  };

  const mockEventEmitter = { emit: jest.fn() };

  const userId = 'user-1';
  const mockUser = { id: userId, email: 'test@mail.com', fullName: 'Nguyễn Văn A', role: Role.USER };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    prisma = module.get<PrismaService>(PrismaService);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);

    jest.clearAllMocks();
    
    (argon2.hash as jest.Mock).mockResolvedValue('hashed-password');
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('Service phải được khởi tạo thành công', () => {
    expect(service).toBeDefined();
  });

  // TEST SUITE: Queries (find...)
  describe('Queries (Tìm kiếm)', () => {
    it('findByEmail - Nên tìm user theo email', async () => {
      mockPrismaService.db.user.findUnique.mockResolvedValue(mockUser);
      const result = await service.findByEmail(mockUser.email);
      expect(result).toEqual(mockUser);
      expect(prisma.db.user.findUnique).toHaveBeenCalledWith({ where: { email: mockUser.email } });
    });

    it('findByValidVerifyToken - Nên tìm user theo token hợp lệ', async () => {
      mockPrismaService.db.user.findFirst.mockResolvedValue(mockUser);
      await service.findByValidVerifyToken('hashed-token');
      expect(prisma.db.user.findFirst).toHaveBeenCalledWith({
        where: {
          verifyToken: 'hashed-token',
          verifyExpires: { gt: expect.any(Date) }, // Kiểm tra lớn hơn thời gian hiện tại
        }
      });
    });
  });

  // TEST SUITE: Mutations (Thay đổi dữ liệu)
  describe('updateAvatar', () => {
    it('Nên cập nhật avatar và chỉ trả về các trường được select', async () => {
      mockPrismaService.db.user.findUnique.mockResolvedValue(mockUser); // Bypass check exists
      const expectedResponse = { id: userId, email: mockUser.email, fullName: mockUser.fullName, avatar: 'new-url.png' };
      mockPrismaService.db.user.update.mockResolvedValue(expectedResponse);

      const result = await service.updateAvatar(userId, 'new-url.png');

      expect(result).toEqual(expectedResponse);
      expect(prisma.db.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { avatar: 'new-url.png' },
        select: { id: true, email: true, fullName: true, avatar: true },
      });
    });
  });

  describe('updateProfile', () => {
    const dto = { fullName: 'Nguyễn Văn B', password: 'new-password' };

    it('Nên cập nhật thông tin, băm mật khẩu và bắn sự kiện SAU KHI update DB thành công', async () => {
      mockPrismaService.db.user.findUnique.mockResolvedValue(mockUser);
      const updatedUser = { ...mockUser, fullName: dto.fullName };
      mockPrismaService.db.user.update.mockResolvedValue(updatedUser);

      const result = await service.updateProfile(userId, dto);

      expect(result).toEqual(updatedUser);
      expect(argon2.hash).toHaveBeenCalledWith(dto.password);
      expect(prisma.db.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { fullName: 'Nguyễn Văn B', password: 'hashed-password' },
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith('profile.update', {
        userId,
        content: `Đổi thông tin thành công.`,
      });
    });

    it('Không nên gọi argon2 nếu dto không gửi kèm password', async () => {
      mockPrismaService.db.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.db.user.update.mockResolvedValue(mockUser);

      await service.updateProfile(userId, { fullName: 'Chỉ cập nhật tên' });

      expect(argon2.hash).not.toHaveBeenCalled();
      expect(prisma.db.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { fullName: 'Chỉ cập nhật tên' },
      });
    });
  });

  describe('updateRole', () => {
    it('Nên cập nhật quyền và bắn thông báo', async () => {
      mockPrismaService.db.user.findUnique.mockResolvedValue(mockUser);
      const updatedUser = { ...mockUser, role: Role.ADMIN };
      mockPrismaService.db.user.update.mockResolvedValue(updatedUser);

      const result = await service.updateRole(userId, Role.ADMIN);

      expect(result).toEqual(updatedUser);
      expect(prisma.db.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { role: Role.ADMIN },
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith('role.update', {
        userId,
        content: `Bạn vừa được đổi quyền thành ${Role.ADMIN}`,
      });
    });
  });
});