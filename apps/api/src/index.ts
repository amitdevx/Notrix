import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { WebSocketServer, WebSocket } from 'ws';

const app = new Hono();

app.get('/', (c) => {
  return c.text('Notrix Sync Relay Server is running!');
});

const port = 4000;
console.log(`Sync Relay Server is running on port ${port}`);

const server = serve({
  fetch: app.fetch,
  port
}) as any;

const wss = new WebSocketServer({ server });

const rooms = new Map<string, Set<WebSocket>>();

wss.on('connection', (ws: WebSocket, req) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const roomId = url.searchParams.get('room');
  
  if (!roomId) {
    ws.close(1008, 'Room ID is required');
    return;
  }

  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Set());
  }
  const room = rooms.get(roomId)!;
  room.add(ws);

  ws.on('message', (message, isBinary) => {
    // Broadcast to all other clients in the room
    room.forEach(client => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(message, { binary: isBinary });
      }
    });
  });

  ws.on('close', () => {
    room.delete(ws);
    if (room.size === 0) {
      rooms.delete(roomId);
    }
  });
});
