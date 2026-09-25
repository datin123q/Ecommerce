import { Controller,Post, Get ,Patch, Param, Body, UseGuards, BadRequestException, UploadedFile, UseInterceptors} from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/user-update.dto';
import { UpdateRoleDto } from './dto/role-update.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiBody, ApiConsumes, } from '@nestjs/swagger';
import { v2 as cloudinary } from 'cloudinary';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ConfigService } from '@nestjs/config';

@ApiTags('Users (Người dùng)')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService ,private readonly configService: ConfigService) {}

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cập nhật Tên và Mật khẩu (Mọi User)' })
  updateProfile(
    @CurrentUser() user: any,
    @Body() updateProfileDto: UpdateProfileDto
  ) {
    return this.usersService.updateProfile(user.id, updateProfileDto);
  }

  @Patch(':id/role')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN) 
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Thay đổi quyền User (Chỉ ADMIN)' })
  updateRole(
    @Param('id') userId: string,
    @Body() updateRoleDto: UpdateRoleDto
  ) {
    return this.usersService.updateRole(userId, updateRoleDto.role);
  }

  @Get('cloudinary-signature')
  @UseGuards(JwtAuthGuard) 
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lấy chữ ký Cloudinary để upload trực tiếp từ Frontend' })
  getCloudinarySignature() {
    const timestamp = Math.round(new Date().getTime() / 1000);
    const folder = 'avatars'; 
    
    const paramsToSign = {
      timestamp: timestamp,
      folder: folder,
    };

    const signature = cloudinary.utils.api_sign_request(
      paramsToSign,
      this.configService.getOrThrow<string>('CLOUDINARY_API_SECRET')
    );

    return {
      message: 'Lấy chữ ký thành công',
      data: {
        timestamp,
        signature,
        folder,
        apiKey: this.configService.get<string>('CLOUDINARY_API_KEY'),
        cloudName: this.configService.get<string>('CLOUDINARY_CLOUD_NAME'),
      }
    };
  }

  @Post('avatar')
  @UseGuards(JwtAuthGuard) 
  @ApiBearerAuth()        
  @ApiOperation({ summary: 'Lưu URL ảnh đại diện mới vào Database' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        avatarUrl: { 
          type: 'string', 
          example: 'https://res.cloudinary.com/demo/image/upload/v1234567890/avatars/sample.jpg' 
        },
      },
    },
  })
  async updateAvatar(
    @Body('avatarUrl') avatarUrl: string,
    @CurrentUser() user: any,
  ) {
    if (!avatarUrl) {
      throw new BadRequestException('Vui lòng cung cấp URL ảnh (avatarUrl)');
    }

    const updatedProfile = await this.usersService.updateAvatar(user.id, avatarUrl);

    return {
      message: 'Cập nhật ảnh đại diện thành công',
      data: updatedProfile,
    };
  }
}