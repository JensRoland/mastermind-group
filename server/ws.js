import { WebSocketServer } from 'ws';
import { authenticateWs } from './auth.js';

const clients = new Map(); // threadId -> Set<WebSocket>
const globalClients = new Set(); // clients listening for thread list updates

let wss = null;

export function setupWebSocket(server) {
  wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    if (req.url !== '/ws') {
      socket.destroy();
      return;
    }

    if (!authenticateWs(req)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (socket) => {
    let subscribedThread = null;
    globalClients.add(socket);

    socket.on('message', (data) => {
      try {
        const msg = JSON.parse(data);

        if (msg.type === 'subscribe' && msg.threadId) {
          // Unsubscribe from previous thread
          if (subscribedThread !== null) {
            clients.get(subscribedThread)?.delete(socket);
          }

          subscribedThread = msg.threadId;
          if (!clients.has(subscribedThread)) {
            clients.set(subscribedThread, new Set());
          }
          clients.get(subscribedThread).add(socket);
        }

        if (msg.type === 'unsubscribe') {
          if (subscribedThread !== null) {
            clients.get(subscribedThread)?.delete(socket);
            subscribedThread = null;
          }
        }
      } catch (e) {
        // Ignore malformed messages
      }
    });

    socket.on('close', () => {
      globalClients.delete(socket);
      if (subscribedThread !== null) {
        clients.get(subscribedThread)?.delete(socket);
      }
    });
  });
}

export function broadcast(threadId, payload) {
  const sockets = clients.get(threadId);
  if (!sockets) return;

  const data = JSON.stringify(payload);
  for (const socket of sockets) {
    if (socket.readyState === 1) {
      socket.send(data);
    }
  }
}

export function broadcastGlobal(payload) {
  const data = JSON.stringify(payload);
  for (const socket of globalClients) {
    if (socket.readyState === 1) {
      socket.send(data);
    }
  }
}
