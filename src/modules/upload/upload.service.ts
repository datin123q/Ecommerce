import { Injectable, Inject } from '@nestjs/common';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import * as streamifier from 'streamifier';

@Injectable()
export class UploadService {
constructor(@Inject('CLOUDINARY') private cloudinaryProvider: any) {}
  uploadImage(file: Express.Multer.File, folderName: string = 'avatars'): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { folder: folderName }, 
        (error, result) => {
          if (error) return reject(error);
          if (!result) return reject(new Error('Lỗi không xác định: Không nhận được kết quả từ Cloudinary'));
          resolve(result); 
        },
      );
      streamifier.createReadStream(file.buffer).pipe(uploadStream);
    });
  }
}