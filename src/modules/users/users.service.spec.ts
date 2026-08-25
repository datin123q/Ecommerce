import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../../database/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import * as argon2 from 'argon2';

jest.mock('argon2', () => ({
  hash: jest.fn(),
}));

describe('UsersService', () => {
  let service: UsersService;
  let prisma: PrismaService;
  let eventEmitter: EventEmitter2;

  // --- MOCK DATA ---
  const mockUserId = 'user-123';
  const mockEmail = 'test@example.com';

  const mockUser = {
    id: mockUserId,
    email: mockEmail,
    fullName: 'Test User',
    password: 'hashed_password',
    role: Role.USER,
  };

  // --- MOCK SERVICES ---
  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockEventEmitter = {
    emit: jest.fn(),
  };

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
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ==========================================================
  // FIND BY EMAIL & ID
  // ==========================================================
  describe('findByEmail', () => {
    it('should return user if found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      const result = await service.findByEmail(mockEmail);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: mockEmail } });
      expect(result).toEqual(mockUser);
    });
  });

  describe('findById', () => {
    it('should return user if found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      const result = await service.findById(mockUserId);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: mockUserId } });
      expect(result).toEqual(mockUser);
    });
  });

  // CREATE
  describe('create', () => {
    it('should create a new user', async () => {
      const createData = { email: mockEmail, password: 'password', fullName: 'User' };
      mockPrismaService.user.create.mockResolvedValue(mockUser);
      
      const result = await service.create(createData as any);
      
      expect(prisma.user.create).toHaveBeenCalledWith({ data: createData });
      expect(result).toEqual(mockUser);
    });
  });

  // UPDATE USER 
  describe('updateUser', () => {
    const updateData = { fullName: 'New Name' };

    it('should throw NotFoundException if user not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.updateUser(mockUserId, updateData)).rejects.toThrow(
        new NotFoundException(`Không tìm thấy tài khoản với ID: ${mockUserId}`)
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('should update user if found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.user.update.mockResolvedValue({ ...mockUser, ...updateData });

      const result = await service.updateUser(mockUserId, updateData);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: mockUserId },
        data: updateData,
      });
      expect(result.fullName).toEqual('New Name');
    });
  });

  // UPDATE REFRESH TOKEN
  describe('updateRefreshToken', () => {
    it('should update refresh token', async () => {
      const mockToken = 'new_refresh_token';
      mockPrismaService.user.update.mockResolvedValue({ ...mockUser, refreshToken: mockToken });

      await service.updateRefreshToken(mockUserId, mockToken);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: mockUserId },
        data: { refreshToken: mockToken },
      });
    });
  });

  // UPDATE PROFILE
  describe('updateProfile', () => {
    it('should throw NotFoundException if user not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.updateProfile(mockUserId, {})).rejects.toThrow(NotFoundException);
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('should update fullName, emit event, and not hash password if password is not provided', async () => {
      const dto = { fullName: 'New Full Name' };
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.user.update.mockResolvedValue({ ...mockUser, fullName: dto.fullName });

      const result = await service.updateProfile(mockUserId, dto);

      expect(argon2.hash).not.toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith('profile.update', {
        userId: mockUserId,
        content: 'Đổi thông tin thành công.',
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: mockUserId },
        data: { fullName: dto.fullName },
      });
      expect(result.fullName).toEqual(dto.fullName);
    });

    it('should hash password and update both fullName and password if provided', async () => {
      const dto = { fullName: 'New Name', password: 'new_password123' };
      const hashedPw = 'new_hashed_password';
      
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      (argon2.hash as jest.Mock).mockResolvedValue(hashedPw);
      mockPrismaService.user.update.mockResolvedValue({ ...mockUser, fullName: dto.fullName, password: hashedPw });

      await service.updateProfile(mockUserId, dto);

      expect(argon2.hash).toHaveBeenCalledWith(dto.password);
      expect(eventEmitter.emit).toHaveBeenCalledWith('profile.update', {
        userId: mockUserId,
        content: 'Đổi thông tin thành công.',
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: mockUserId },
        data: { fullName: dto.fullName, password: hashedPw },
      });
    });
  });

  // ==========================================================
  // UPDATE ROLE
  // ==========================================================
  describe('updateRole', () => {
    it('should throw NotFoundException if user not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.updateRole(mockUserId, Role.ADMIN)).rejects.toThrow(NotFoundException);
    });

    it('should update role, emit event and return updated user', async () => {
      const newRole = Role.ADMIN;
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.user.update.mockResolvedValue({ ...mockUser, role: newRole });

      const result = await service.updateRole(mockUserId, newRole);

      expect(eventEmitter.emit).toHaveBeenCalledWith('role.update', {
        userId: mockUserId,
        content: `Bạn vừa được đổi quyền thành ${newRole}`,
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: mockUserId },
        data: { role: newRole },
      });
      expect(result.role).toEqual(newRole);
    });
  });
});