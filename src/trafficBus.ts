import { EventEmitter } from 'node:events';

export type TrafficEvent = {
  ts: string;
  evseId: string;
  dir: 'send' | 'recv';
  msgType: 2 | 3 | 4;
  action?: string;
  msgId: string;
  payload: Record<string, unknown>;
};

export const trafficBus = new EventEmitter();
trafficBus.setMaxListeners(100);
