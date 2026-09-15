import { Injectable } from '@nestjs/common';
import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import { PrismaService } from '../database/prisma.service';
import { registerDecorator, ValidationOptions } from 'class-validator';

@ValidatorConstraint({ name: 'IsEmailUnique', async: true })
@Injectable() 
export class IsEmailUniqueConstraint implements ValidatorConstraintInterface {
  constructor(private readonly prisma: PrismaService) {}

  async validate(email: string, args: ValidationArguments) {
    if (!email) return false;    
    const user = await this.prisma.db.user.findUnique({
      where: { email },
    });
    return !user; 
  }
  defaultMessage(args: ValidationArguments) {
    return `Email ${args.value} đã được sử dụng. Vui lòng chọn email khác!`;
  }
}

export function IsEmailUnique(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsEmailUniqueConstraint, 
    });
  };
}