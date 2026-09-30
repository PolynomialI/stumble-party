import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { DEFAULT_PORT, ROOM_NAME } from '@sp/shared';
import { GameRoom } from './GameRoom';

const port = Number(process.env.PORT ?? DEFAULT_PORT);

const server = new Server({
  transport: new WebSocketTransport(),
  greet: false,
  express: (app) => {
    app.use((_req, res, next) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      next();
    });
    app.get('/health', (_req, res) => {
      res.json({ ok: true });
    });
  },
});

server.define(ROOM_NAME, GameRoom);

await server.listen(port);
console.log(`[server] listening on :${port}`);
