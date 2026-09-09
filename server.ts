import { createServer } from 'node:http';
import next from 'next';
import { attachChatSocketServer } from './app/lib/chat/socket-server';
import { assertEncryptionConfiguredForProduction } from './app/lib/crypto/secret-box';

// Refuse un démarrage en production sans APP_ENCRYPTION_KEY plutôt que de dégrader
// silencieusement le chiffrement des messages de chat et des mots de passe SMTP (issue #212).
try {
  assertEncryptionConfiguredForProduction();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || '0.0.0.0';
const port = Number.parseInt(process.env.PORT || '3000', 10);
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

await app.prepare();

const httpServer = createServer((request, response) => handle(request, response));
const { io, stopSessionRevocationListener } = attachChatSocketServer(httpServer);

httpServer.listen(port, hostname, () => {
  console.log(`PlanningClub listening on http://${hostname}:${port}`);
});

function shutdown() {
  stopSessionRevocationListener();
  io.close(() => httpServer.close(() => process.exit(0)));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
