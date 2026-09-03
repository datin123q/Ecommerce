import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { EventEmitter2 } from '@nestjs/event-emitter';

// Mock thư viện argon2
jest.mock('argon2', () => ({
  hash: jest.fn(),
  verify: jest.fn(),
}));

describe('AuthService', () => {
  let authService: AuthService;
  let usersService: UsersService;
  let jwtService: JwtService;
  let configService: ConfigService;

  // --- DỮ LIỆU GIẢ ĐỊNH (MOCK DATA) ---
  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    password: 'hashed_password',
    fullName: 'Test User',
    role: 'USER',
    refreshToken: 'hashed_refresh_token',
  };

  const mockRegisterDto = {
    email: 'test@example.com',
    password: 'password123',
    fullName: 'Test User',
  };

  const mockLoginDto = {
    email: 'test@example.com',
    password: 'password123',
  };

  const mockPayload = { sub: mockUser.id, email: mockUser.email, role: mockUser.role };

  // --- MOCK CÁC SERVICES ---
  const mockUsersService = {
    findByEmail: jest.fn(),
    create: jest.fn(),
    findById: jest.fn(),
    updateRefreshToken: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn(),
    verifyAsync: jest.fn(),
  };

  const mockConfigService = {
    getOrThrow: jest.fn((key: string) => {
      if (key === 'JWT_REFRESH_SECRET') return 'refresh_secret_key';
      if (key === 'JWT_REFRESH_EXPIRES_IN') return '7d';
      return null;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
    usersService = module.get<UsersService>(UsersService);
    jwtService = module.get<JwtService>(JwtService);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(authService).toBeDefined();
  });

  // ==========================================================
  // REGISTER
  // ==========================================================
  describe('register', () => {
    it('should register a new user successfully', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);
      (argon2.hash as jest.Mock).mockResolvedValue('hashed_password');
      mockUsersService.create.mockResolvedValue(mockUser);

      const result = await authService.register(mockRegisterDto);

      expect(usersService.findByEmail).toHaveBeenCalledWith(mockRegisterDto.email);
      expect(argon2.hash).toHaveBeenCalledWith(mockRegisterDto.password);
      expect(usersService.create).toHaveBeenCalledWith({
        email: mockRegisterDto.email,
        password: 'hashed_password',
        fullName: mockRegisterDto.fullName,
      });
      expect(result).toEqual({
        id: mockUser.id,
        email: mockUser.email,
        fullName: mockUser.fullName,
        role: mockUser.role,
      });
    });

    it('should throw BadRequestException if email is already in use', async () => {
      mockUsersService.findByEmail.mockResolvedValue(mockUser); // Báo email đã tồn tại

      await expect(authService.register(mockRegisterDto)).rejects.toThrow(
        BadRequestException,
      );
      expect(usersService.create).not.toHaveBeenCalled();
    });
  });

  // ==========================================================
  // LOGIN
  // ==========================================================
  describe('login', () => {
    it('should login successfully and return tokens', async () => {
      mockUsersService.findByEmail.mockResolvedValue(mockUser);
      (argon2.verify as jest.Mock).mockResolvedValue(true); // Password đúng
      
      mockJwtService.sign
        .mockReturnValueOnce('access_token')
        .mockReturnValueOnce('refresh_token');
        
      (argon2.hash as jest.Mock).mockResolvedValue('hashed_new_rt');

      const result = await authService.login(mockLoginDto);

      expect(usersService.findByEmail).toHaveBeenCalledWith(mockLoginDto.email);
      expect(argon2.verify).toHaveBeenCalledWith(mockUser.password, mockLoginDto.password);
      expect(jwtService.sign).toHaveBeenCalledTimes(2);
      expect(usersService.updateRefreshToken).toHaveBeenCalledWith(mockUser.id, 'hashed_new_rt');
      expect(result).toEqual({
        accessToken: 'access_token',
        refreshToken: 'refresh_token',
        user: {
          id: mockUser.id,
          email: mockUser.email,
          fullName: mockUser.fullName,
          role: mockUser.role,
        },
      });
    });

    it('should throw UnauthorizedException if user not found', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);

      await expect(authService.login(mockLoginDto)).rejects.toThrow(UnauthorizedException);
      expect(argon2.verify).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException if password is incorrect', async () => {
      mockUsersService.findByEmail.mockResolvedValue(mockUser);
      (argon2.verify as jest.Mock).mockResolvedValue(false); // Password sai

      await expect(authService.login(mockLoginDto)).rejects.toThrow(UnauthorizedException);
    });
  });

  // ==========================================================
  // REFRESH TOKEN
  // ==========================================================
  describe('refreshToken', () => {
    const providedRefreshToken = 'valid_refresh_token';

    it('should generate new tokens when refresh token is valid', async () => {
      mockJwtService.verifyAsync.mockResolvedValue(mockPayload);
      mockUsersService.findById.mockResolvedValue(mockUser);
      (argon2.verify as jest.Mock).mockResolvedValue(true); // Token khớp
      
      mockJwtService.sign
        .mockReturnValueOnce('new_access_token')
        .mockReturnValueOnce('new_refresh_token');
        
      (argon2.hash as jest.Mock).mockResolvedValue('hashed_new_rt');

      const result = await authService.refreshToken(providedRefreshToken);

      expect(jwtService.verifyAsync).toHaveBeenCalledWith(providedRefreshToken, {
        secret: 'refresh_secret_key',
      });
      expect(usersService.findById).toHaveBeenCalledWith(mockPayload.sub);
      expect(argon2.verify).toHaveBeenCalledWith(mockUser.refreshToken, providedRefreshToken);
      expect(usersService.updateRefreshToken).toHaveBeenCalledWith(mockUser.id, 'hashed_new_rt');
      
      expect(result).toEqual({
        accessToken: 'new_access_token',
        refreshToken: 'new_refresh_token',
      });
    });

    it('should throw UnauthorizedException when JWT verification fails', async () => {
      mockJwtService.verifyAsync.mockRejectedValue(new Error('Invalid JWT'));

      await expect(authService.refreshToken(providedRefreshToken)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when user not found or no refreshToken in DB', async () => {
      mockJwtService.verifyAsync.mockResolvedValue(mockPayload);
      mockUsersService.findById.mockResolvedValue({ ...mockUser, refreshToken: null }); // Thiếu RT trong DB

      await expect(authService.refreshToken(providedRefreshToken)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when refresh token verification fails (argon2)', async () => {
      mockJwtService.verifyAsync.mockResolvedValue(mockPayload);
      mockUsersService.findById.mockResolvedValue(mockUser);
      (argon2.verify as jest.Mock).mockResolvedValue(false); // Token không khớp (bị thay đổi)

      await expect(authService.refreshToken(providedRefreshToken)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ==========================================================
  // LOGOUT
  // ==========================================================
  describe('logout', () => {
    it('should update refresh token to null and return success message', async () => {
      const result = await authService.logout(mockUser.id);

      expect(usersService.updateRefreshToken).toHaveBeenCalledWith(mockUser.id, null);
      expect(result).toEqual({ message: 'Đăng xuất thành công' });
    });
  });
});