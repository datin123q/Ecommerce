import { InputType, Field } from '@nestjs/graphql';
import { MinLength, IsOptional, IsString } from 'class-validator';

@InputType()
export class UpdateProfileInput {
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  fullName?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @MinLength(6)
  password?: string;
}