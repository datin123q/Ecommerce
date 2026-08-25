import { Body, Controller, Get, Post, UseGuards, Req , BadRequestException} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LoginDto } from './dto/login.dto';
//import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'; // Import Guard
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Đăng ký tài khoản mới' })
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('login')
  @ApiOperation({ summary: 'Đăng nhập hệ thống' })
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard) 
  @ApiBearerAuth() 
  @ApiOperation({ summary: 'Lấy thông tin tài khoản đang đăng nhập' })
  getProfile(@CurrentUser() user: any) {
    return {
      message: 'Lấy thông tin thành công',
      user: user,
    };
  }
  
  @Post('refresh')
  @ApiOperation({ summary: 'Cấp lại Access Token mới (Dùng Refresh Token)' })
  async refresh(@Body() body: RefreshTokenDto) {
    // Không cần if(!body.refreshToken) nữa vì class-validator đã tự kiểm tra!
    return this.authService.refreshToken(body.refreshToken);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard) 
  @ApiBearerAuth() 
  @ApiOperation({ summary: 'Đăng xuất tài khoản' })
  async logout(@Req() request: any) {
    const userId = request.user.id; 
    return this.authService.logout(userId);
  }
}