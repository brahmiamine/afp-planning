import { createServer } from 'node:http';
import next from 'next';
import { attachChatSocketServer } from './app/lib/chat/socket-server';

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || '0.0.0.0';
const port = Number.parseInt(process.env.PORT || '3000', 10);
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

await app.prepare();

const httpServer = createServer((request, response) => handle(request, response));
const { io, stopSessionRevocationListener } = attachChatSocketServer(httpServer);

httpServer.listen(port, hostname, () => {
  console.log(`AFP Planning listening on http://${hostname}:${port}`);
});

function shutdown() {
  stopSessionRevocationListener();
  io.close(() => httpServer.close(() => process.exit(0)));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
