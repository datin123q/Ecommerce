import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { UsersService } from '../users.service';
import { User } from './users.model';
import { UpdateProfileInput } from './user-inputs';
import { Role } from '@prisma/client';
import { NotFoundException } from '@nestjs/common';

@Resolver(() => User)
export class UsersResolver {
  constructor(private readonly usersService: UsersService) {}

  @Query(() => User, { name: 'getUserById', nullable: true })
  async getUserById(@Args('id', { type: () => ID }) id: string) {
    const user = await this.usersService.findById(id);
    if (!user) throw new NotFoundException('Không tìm thấy user');
    return user;
  }

  @Query(() => User, { name: 'getUserByEmail', nullable: true })
  async getUserByEmail(@Args('email') email: string) {
    return this.usersService.findByEmail(email);
  }

  // 2. MUTATION (Tương đương POST/PUT/PATCH)
  @Mutation(() => User)
  async updateProfile(
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdateProfileInput,
  ) {
    return this.usersService.updateProfile(id, input);
  }

  @Mutation(() => User)
  async updateAvatar(
    @Args('id', { type: () => ID }) id: string,
    @Args('avatarUrl') avatarUrl: string,
  ) {
    return this.usersService.updateAvatar(id, avatarUrl);
  }

  @Mutation(() => User)
  async updateRole(
    @Args('id', { type: () => ID }) id: string,
    @Args('role', { type: () => Role }) role: Role,
  ) {
    return this.usersService.updateRole(id, role);
  }
}