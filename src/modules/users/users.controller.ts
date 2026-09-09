import { Controller,Post, Patch, Param, Body, UseGuards, BadRequestException, UploadedFile, UseInterceptors} from '@nestjs/common';
import { UsersService } from './users.service';
import { UploadService } from '../upload/upload.service';
import { UpdateProfileDto } from './dto/user-update.dto';
import { UpdateRoleDto } from './dto/role-update.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiBody, ApiConsumes, } from '@nestjs/swagger';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Users (Người dùng)')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService, private readonly uploadService: UploadService,) {}

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

  @Post('avatar')
  @UseGuards(JwtAuthGuard) 
  @ApiBearerAuth()         
  @ApiOperation({ summary: 'Cập nhật ảnh đại diện' })
  @ApiConsumes('multipart/form-data') 
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { 
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: 5 * 1024 * 1024 }, 
    fileFilter: (req, file, cb) => {
      if (!file.mimetype.match(/\/(jpg|jpeg|png|webp)$/)) {
        return cb(new BadRequestException('Chỉ chấp nhận định dạng ảnh (jpg, png, webp)!'), false);
      }
      cb(null, true);
    }
  }))
  async updateAvatar(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
  ) {
    try {
      if (!file) throw new BadRequestException('Vui lòng chọn file ảnh');

      const cloudinaryResult = await this.uploadService.uploadImage(file, 'avatars');
      const updatedProfile = await this.usersService.updateAvatar(user.id, cloudinaryResult.secure_url);

      return {
        message: 'Cập nhật ảnh đại diện thành công',
        data: updatedProfile,
      };
    } catch (error) {
      // IN LỖI THẬT RA ĐÂY ĐỂ XEM
      console.log('LỖI THẬT LÀ:', error);
      throw error;
    }
  }
}