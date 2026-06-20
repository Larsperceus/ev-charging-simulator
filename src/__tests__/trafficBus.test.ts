import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createServer } from 'node:http';
import WebSocket, { WebSocketServer } from 'ws';
import { trafficBus, type TrafficEvent } from '../trafficBus.js';
import { attachTrafficWss } from '../api/routes/traffic.routes.js';

function makeEvent(overrides: Partial<TrafficEvent> = {}): TrafficEvent {
  return {
    ts: new Date().toISOString(),
    evseId: 'TEST-01',
    dir: 'send',
    msgType: 2,
    action: 'BootNotification',
    msgId: 'msg-1',
    payload: { reason: 'PowerUp' },
    ...overrides,
  };
}

describe('trafficBus EventEmitter', () => {
  beforeEach(() => {
    trafficBus.removeAllListeners('message');
  });

  it('delivers events to subscribed listeners', () => {
    const received: TrafficEvent[] = [];
    trafficBus.on('message', (e) => received.push(e));

    const event = makeEvent();
    trafficBus.emit('message', event);

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual(event);
  });

  it('delivers to multiple listeners independently', () => {
    const a: TrafficEvent[] = [];
    const b: TrafficEvent[] = [];
    trafficBus.on('message', (e) => a.push(e));
    trafficBus.on('message', (e) => b.push(e));

    trafficBus.emit('message', makeEvent());
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
  });

  it('stops delivering after off()', () => {
    const received: TrafficEvent[] = [];
    const handler = (e: TrafficEvent) => received.push(e);
    trafficBus.on('message', handler);
    trafficBus.emit('message', makeEvent());
    trafficBus.off('message', handler);
    trafficBus.emit('message', makeEvent());
    expect(received).toHaveLength(1);
  });
});

describe('/ws/traffic WebSocket endpoint', () => {
  let server: ReturnType<typeof createServer>;
  let port: number;

  beforeEach(async () => {
    trafficBus.removeAllListeners('message');
    server = createServer();
    attachTrafficWss(server);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    port = (server.address() as { port: number }).port;
  });

  afterEach(async () => {
    trafficBus.removeAllListeners('message');
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('delivers trafficBus events over WebSocket', async () => {
    const received: TrafficEvent[] = [];

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${port}/ws/traffic`);
      ws.on('error', reject);
      ws.on('open', () => {
        trafficBus.emit('message', makeEvent());
      });
      ws.on('message', (data) => {
        received.push(JSON.parse(data.toString()) as TrafficEvent);
        ws.close();
      });
      ws.on('close', resolve);
    });

    expect(received).toHaveLength(1);
    expect(received[0].evseId).toBe('TEST-01');
    expect(received[0].action).toBe('BootNotification');
  });

  it('filters events by evseId query param', async () => {
    const received: TrafficEvent[] = [];

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${port}/ws/traffic?evseId=EVSE-MATCH`);
      ws.on('error', reject);
      ws.on('open', () => {
        // Emit one that should be filtered out, one that should pass
        trafficBus.emit('message', makeEvent({ evseId: 'OTHER-99' }));
        trafficBus.emit('message', makeEvent({ evseId: 'EVSE-MATCH' }));
      });
      ws.on('message', (data) => {
        received.push(JSON.parse(data.toString()) as TrafficEvent);
        ws.close();
      });
      ws.on('close', resolve);
    });

    expect(received).toHaveLength(1);
    expect(received[0].evseId).toBe('EVSE-MATCH');
  });

  it('cleans up listener on disconnect', async () => {
    const listenerCountBefore = trafficBus.listenerCount('message');

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${port}/ws/traffic`);
      ws.on('error', reject);
      ws.on('open', () => ws.close());
      ws.on('close', resolve);
    });

    // Give the close handler a tick to run
    await new Promise((r) => setTimeout(r, 10));
    expect(trafficBus.listenerCount('message')).toBe(listenerCountBefore);
  });
});
