import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';
import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';

jest.mock('argon2');

jest.mock('crypto', () => ({
  ...jest.requireActual('crypto'), // Giữ nguyên các hàm nội bộ mà Jest cần
  randomBytes: jest.fn(),
  createHash: jest.fn(),
}));

describe('AuthService', () => {
  let service: AuthService;
  let usersService: UsersService;
  let jwtService: JwtService;
  let configService: ConfigService;
  let mailQueue: any;

  // 1. Khởi tạo Mocks cho các Dependencies
  const mockUsersService = {
    findByEmail: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    updateUser: jest.fn(),
    findByValidVerifyToken: jest.fn(),
    findByValidResetToken: jest.fn(),
    updateRefreshToken: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn(),
    verifyAsync: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn(),
    getOrThrow: jest.fn(),
  };

  const mockMailQueue = {
    add: jest.fn(),
  };

  // Dữ liệu mẫu dùng chung
  const mockUser = {
    id: 'user-1',
    email: 'test@example.com',
    password: 'hashed-password',
    fullName: 'Test User',
    role: 'USER',
    avatar: 'avatar.png',
    refreshToken: 'hashed-refresh-token',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        // Cách mock BullMQ Queue trong NestJS
        { provide: getQueueToken('mail-queue'), useValue: mockMailQueue },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    usersService = module.get<UsersService>(UsersService);
    jwtService = module.get<JwtService>(JwtService);
    configService = module.get<ConfigService>(ConfigService);
    mailQueue = module.get(getQueueToken('mail-queue'));

    // Reset lại toàn bộ mock sau mỗi test
    jest.clearAllMocks();

    // Tối ưu Tốc độ: Mock argon2 để không tốn thời gian hash/verify thật khi chạy test
    (argon2.hash as jest.Mock).mockResolvedValue('mocked-hash-string');
    (argon2.verify as jest.Mock).mockResolvedValue(true);

    // Mock ConfigService
    mockConfigService.get.mockReturnValue('http://localhost:3000');
    mockConfigService.getOrThrow.mockReturnValue('secret-key');
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('Service phải được khởi tạo thành công', () => {
    expect(service).toBeDefined();
  });

  // ===================================================================
  // TEST SUITE: register
  // ===================================================================
  describe('register', () => {
    const dto = { email: 'test@example.com', password: '123', fullName: 'Test User' };

    it('Nên ném BadRequestException nếu email đã tồn tại', async () => {
      mockUsersService.findByEmail.mockResolvedValue(mockUser);

      await expect(service.register(dto)).rejects.toThrow(BadRequestException);
    });

    it('Nên tạo user thành công, băm mật khẩu và trả về dữ liệu đã sanitize', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);
      mockUsersService.create.mockResolvedValue(mockUser);

      const result = await service.register(dto);

      expect(argon2.hash).toHaveBeenCalledWith(dto.password);
      expect(usersService.create).toHaveBeenCalled();
      expect(result).not.toHaveProperty('password'); // Đảm bảo đã sanitize
      expect(result.email).toEqual(dto.email);
    });
  });

  // ===================================================================
  // TEST SUITE: login
  // ===================================================================
  describe('login', () => {
    const dto = { email: 'test@example.com', password: '123' };

    it('Nên ném BadRequestException nếu không tìm thấy email', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);
      await expect(service.login(dto)).rejects.toThrow(BadRequestException);
    });

    it('Nên ném BadRequestException nếu sai mật khẩu', async () => {
      mockUsersService.findByEmail.mockResolvedValue(mockUser);
      (argon2.verify as jest.Mock).mockResolvedValueOnce(false);

      await expect(service.login(dto)).rejects.toThrow(BadRequestException);
    });

    it('Nên đăng nhập thành công và trả về cặp token', async () => {
      mockUsersService.findByEmail.mockResolvedValue(mockUser);
      mockJwtService.sign.mockReturnValue('mocked-jwt-token');

      const result = await service.login(dto);

      expect(result).toHaveProperty('accessToken', 'mocked-jwt-token');
      expect(result).toHaveProperty('refreshToken', 'mocked-jwt-token');
      expect(usersService.updateRefreshToken).toHaveBeenCalledWith(mockUser.id, 'mocked-hash-string');
    });
  });

  // ===================================================================
  // TEST SUITE: requestVerification
  // ===================================================================
  describe('requestVerification', () => {
    it('Nên ném NotFoundException nếu user không tồn tại', async () => {
      mockUsersService.findById.mockResolvedValue(null);
      await expect(service.requestVerification('1')).rejects.toThrow(NotFoundException);
    });

    it('Nên tạo token, cập nhật DB và đẩy job vào BullMQ', async () => {
      mockUsersService.findById.mockResolvedValue(mockUser);
      
      // Mock thư viện Crypto để kiểm soát chuỗi token sinh ra
      (crypto.randomBytes as jest.Mock).mockReturnValue({toString:() =>'raw-token'});      
      const mockHash = {
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue('hashed-token'),
      };
      (crypto.createHash as jest.Mock).mockReturnValue(mockHash);
      await service.requestVerification(mockUser.id);

      // 1. Kiểm tra cập nhật DB (lưu token băm)
      expect(usersService.updateUser).toHaveBeenCalledWith(mockUser.id, {
        verifyToken: 'hashed-token',
        verifyExpires: expect.any(Date),
      });

      // 2. Kiểm tra đẩy Mail vào Queue (gửi token gốc)
      expect(mailQueue.add).toHaveBeenCalledWith(
        'verify-account',
        expect.objectContaining({
          email: mockUser.email,
          verifyUrl: 'http://localhost:3000/verify?token=raw-token',
        }),
        expect.any(Object),
      );
    });
  });

  // ===================================================================
  // TEST SUITE: refreshToken
  // ===================================================================
  describe('refreshToken', () => {
    const incomingToken = 'old-refresh-token';

    it('Nên ném UnauthorizedException nếu token bị sai hoặc hết hạn (Lỗi Jwt verify)', async () => {
      mockJwtService.verifyAsync.mockRejectedValue(new Error('JWT Expired'));

      await expect(service.refreshToken(incomingToken)).rejects.toThrow(UnauthorizedException);
    });

    it('Nên ném UnauthorizedException nếu User bị xóa hoặc đã đăng xuất (Không có refreshToken ở DB)', async () => {
      mockJwtService.verifyAsync.mockResolvedValue({ sub: mockUser.id });
      mockUsersService.findById.mockResolvedValue({ ...mockUser, refreshToken: null });

      await expect(service.refreshToken(incomingToken)).rejects.toThrow(UnauthorizedException);
    });

    it('Nên ném UnauthorizedException nếu Token gửi lên không khớp với Token băm trong DB', async () => {
      mockJwtService.verifyAsync.mockResolvedValue({ sub: mockUser.id });
      mockUsersService.findById.mockResolvedValue(mockUser);
      (argon2.verify as jest.Mock).mockResolvedValueOnce(false);

      await expect(service.refreshToken(incomingToken)).rejects.toThrow(UnauthorizedException);
    });

    it('Nên refresh thành công và trả về cặp Token mới', async () => {
      mockJwtService.verifyAsync.mockResolvedValue({ sub: mockUser.id });
      mockUsersService.findById.mockResolvedValue(mockUser);
      mockJwtService.sign.mockReturnValue('new-token');

      const result = await service.refreshToken(incomingToken);

      expect(result.accessToken).toEqual('new-token');
      expect(usersService.updateRefreshToken).toHaveBeenCalled();
    });
  });

  // ===================================================================
  // TEST SUITE: logout
  // ===================================================================
  describe('logout', () => {
    it('Nên xóa refresh token khỏi DB', async () => {
      await service.logout(mockUser.id);
      expect(usersService.updateRefreshToken).toHaveBeenCalledWith(mockUser.id, null);
    });
  });
});