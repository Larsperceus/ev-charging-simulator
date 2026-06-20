import { WebSocketServer } from 'ws';
import type { Server as HttpServer } from 'node:http';
import type { Server as HttpsServer } from 'node:https';
import { trafficBus, type TrafficEvent } from '../../trafficBus.js';
import { logger } from '../../utils/logger.js';

export function attachTrafficWss(server: HttpServer | HttpsServer): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/ws/traffic' });

  wss.on('connection', (ws, req) => {
    let evseFilter: string | null = null;
    try {
      evseFilter = new URL(req.url ?? '/', 'http://localhost').searchParams.get('evseId');
    } catch {
      // ignore malformed URL
    }

    const handler = (event: TrafficEvent) => {
      if (evseFilter && event.evseId !== evseFilter) return;
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify(event));
      }
    };

    trafficBus.on('message', handler);
    ws.on('close', () => trafficBus.off('message', handler));
    ws.on('error', () => { trafficBus.off('message', handler); });

    logger.info(`Traffic WS client connected${evseFilter ? ` (filter: ${evseFilter})` : ''}`);
  });

  return wss;
}
