import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { readFileSync } from 'fs';
import { IncomingMessage } from 'http';
import { TLSSocket, connect as tlsConnect } from 'tls';
import { AppModule } from './app.module';
import { VmsService } from './vms/vms.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  if (process.env.NODE_ENV !== 'production') {
    app.enableCors({ origin: true, credentials: true });
  }

  // ─── OpenAPI / Swagger ───────────────────────────────────────────────────────
  if (process.env.NODE_ENV !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('VCP API')
      .setDescription('Virtualization Control Panel – REST API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  await app.listen(parseInt(process.env.PORT ?? '3000', 10), '0.0.0.0');

  // ─── WebSocket console proxy ─────────────────────────────────────────────────
  // Intercepts WS upgrades for /api/v1/vms/:id/console/ws?token=<tok>
  // and bridges them to the agent's mTLS VNC WebSocket endpoint.
  const httpServer = app.getHttpServer();
  const vmsService = app.get(VmsService);

  let clientCert: Buffer, clientKey: Buffer, caCert: Buffer;
  try {
    clientCert = readFileSync(process.env.VCP_CLIENT_CERT ?? '/certs/panel-client.crt');
    clientKey  = readFileSync(process.env.VCP_CLIENT_KEY  ?? '/certs/panel-client.key');
    caCert     = readFileSync(process.env.VCP_CA_CERT     ?? '/certs/ca.crt');
  } catch {
    // Certs not available (dev mode) — console proxy disabled.
    return;
  }

  httpServer.on('upgrade', async (req: IncomingMessage, socket: TLSSocket, head: Buffer) => {
    const url = new URL(req.url ?? '', 'http://localhost');
    if (!/^\/api\/v1\/vms\/[^/]+\/console\/ws$/.test(url.pathname)) {
      socket.destroy();
      return;
    }

    const token = url.searchParams.get('token');
    if (!token) { socket.destroy(); return; }

    const meta = await vmsService.resolveConsoleToken(token).catch(() => null);
    if (!meta) {
      socket.write('HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n');
      socket.destroy();
      return;
    }

    const [agentHost, agentPortStr] = meta.agentAddress.split(':');
    const agentPort = parseInt(agentPortStr ?? '8443', 10);

    const agentSock = tlsConnect({
      host: agentHost,
      port: agentPort,
      cert: clientCert,
      key: clientKey,
      ca: caCert,
    }, () => {
      const wsKey  = req.headers['sec-websocket-key'] ?? '';
      const proto  = req.headers['sec-websocket-protocol'] ?? 'binary';
      agentSock.write(
        `GET /v1/console/ws?token=${encodeURIComponent(token)} HTTP/1.1\r\n` +
        `Host: ${agentHost}\r\n` +
        `Upgrade: websocket\r\nConnection: Upgrade\r\n` +
        `Sec-WebSocket-Key: ${wsKey}\r\n` +
        `Sec-WebSocket-Version: 13\r\n` +
        `Sec-WebSocket-Protocol: ${proto}\r\n\r\n`,
      );
    });

    agentSock.on('error', () => socket.destroy());
    socket.on('error', () => agentSock.destroy());

    // Wait for the 101 response from the agent, relay it to the browser,
    // then splice the two raw TCP streams together.
    let upgraded = false;
    agentSock.on('data', (chunk: Buffer) => {
      if (upgraded) return; // pipe() handles subsequent data
      const headerEnd = chunk.indexOf('\r\n\r\n');
      if (headerEnd === -1) { socket.write(chunk); return; }
      upgraded = true;
      socket.write(chunk.slice(0, headerEnd + 4));
      const rest = chunk.slice(headerEnd + 4);
      if (rest.length > 0) socket.write(rest);
      if (head.length > 0) agentSock.write(head);
      socket.pipe(agentSock);
      agentSock.pipe(socket);
    });
  });
}
bootstrap();
