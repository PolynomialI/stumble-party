import { Room, type Client } from '@colyseus/core';
import { MAX_PLAYERS } from '@sp/shared';

export class GameRoom extends Room {
  maxClients = MAX_PLAYERS;

  onCreate() {}

  onJoin(client: Client) {
    console.log(`[room ${this.roomId}] join ${client.sessionId}`);
  }
}
