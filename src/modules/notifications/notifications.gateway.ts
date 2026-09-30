import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { Logger } from '@nestjs/common';
import { UsersService } from '../users/users.service';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/ws/notifications',
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationsGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
  ) {}

  async handleConnection(client: Socket) {
    const token = client.handshake.auth?.token;
    if (typeof token !== 'string' || !token) {
      client.disconnect(true);
      return;
    }

    try {
      const payload = await this.jwtService.verifyAsync<{ sub: string }>(token);
      if (!payload.sub) {
        client.disconnect(true);
        return;
      }

      const user = await this.usersService.findById(payload.sub);
      if (!user) {
        client.disconnect(true);
        return;
      }

      client.data.userId = user.id;
      await client.join(user.id);
      this.logger.log(`User ${user.id} connected to notifications`);
    } catch {
      this.logger.warn('Rejected invalid notification socket token');
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Notification socket disconnected: ${client.id}`);
  }

  sendToUser(userId: string, eventName: string, payload: unknown) {
    this.server.to(userId).emit(eventName, payload);
  }
}
