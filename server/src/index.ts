import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { DEFAULT_PORT, ROOM_NAME, initPhysics } from '@sp/shared';
import { GameRoom } from './GameRoom';
import { roomStats } from './stats';

await initPhysics();

const port = Number(process.env.PORT ?? DEFAULT_PORT);
const startedAt = Date.now();

const server = new Server({
  transport: new WebSocketTransport(),
  greet: false,
  express: (app) => {
    app.use((_req, res, next) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      next();
    });
    app.get('/health', (_req, res) => {
      res.json({ ok: true, uptime: Math.round((Date.now() - startedAt) / 1000) });
    });
    app.get('/metrics', (_req, res) => {
      const mem = process.memoryUsage();
      res.json({
        uptime: Math.round((Date.now() - startedAt) / 1000),
        rssMB: Math.round(mem.rss / 1048576),
        heapMB: Math.round(mem.heapUsed / 1048576),
        rooms: [...roomStats.values()].map((f) => f()),
      });
    });
  },
});

server.define(ROOM_NAME, GameRoom);

await server.listen(port);
console.log(`[server] listening on :${port}`);
