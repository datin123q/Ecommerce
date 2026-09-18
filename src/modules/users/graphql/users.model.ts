import { ObjectType, Field, ID, registerEnumType } from '@nestjs/graphql';
import { Role } from '@prisma/client';

// Đăng ký Enum của Prisma cho GraphQL hiểu
registerEnumType(Role, {
  name: 'Role', 
});

@ObjectType()
export class User {
  @Field(() => ID)
  id: string;

  @Field(() => String)
  email: string;

  @Field(() => String, { nullable: true })
  fullName?: string;

  @Field(() => String, { nullable: true })
  avatar?: string;

  @Field(() => Role)
  role: Role;
}