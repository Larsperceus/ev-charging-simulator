import { describe, expect, it } from 'vitest';
import { OcppClient } from '../ocppClient.js';

function createClient(id: string, connectors = 1) {
  return new OcppClient(
    id,
    {
      chargeBoxSerialNumber: id,
      chargePointModel: 'MODEL',
      chargePointSerialNumber: id,
      chargePointVendor: 'VENDOR',
      firmwareVersion: '1.0.0'
    },
    'ws://localhost:0/ocpp1.6',
    connectors
  );
}

describe('stress', () => {
  it('creates 300+ chargers with single connector', () => {
    const clients: OcppClient[] = [];
    for (let i = 1; i <= 320; i += 1) {
      clients.push(createClient(`EVSE-${i}`));
    }

    expect(clients.length).toBe(320);
    for (const client of clients) {
      const states = client.getStateAll();
      expect(states.length).toBe(1);
      expect(states[0].state).toBe('Available');
    }
  });

  it('creates chargers with double charging points', () => {
    const client = createClient('EVSE-DOUBLE', 2);
    const states = client.getStateAll();
    expect(states.length).toBe(2);
    expect(states[0].id).toBe(1);
    expect(states[1].id).toBe(2);
  });

  it('runs simulated transactions across many chargers', async () => {
    const clients: any[] = [];
    for (let i = 1; i <= 150; i += 1) {
      const client = createClient(`EVSE-TX-${i}`, 2) as any;

      client.connected = true;
      client.startMeterLoop = () => undefined;
      client.stopMeterLoop = () => undefined;
      client.safeCall = async () => undefined;
      client.sendCall = async (action: string) => {
        if (action === 'Authorize') return { idTagInfo: { status: 'Accepted' } };
        if (action === 'StartTransaction') return { transactionId: i };
        if (action === 'StopTransaction') return { status: 'Accepted' };
        if (action === 'StatusNotification') return { status: 'Accepted' };
        if (action === 'MeterValues') return { status: 'Accepted' };
        return { status: 'Accepted' };
      };

      clients.push(client);
    }

    for (const client of clients) {
      await client.localStart(1, 'TAG1');
      await client.localStart(2, 'TAG2');
    }

    for (const client of clients) {
      const states = client.getStateAll();
      expect(states[0].transactionId).not.toBeNull();
      expect(states[1].transactionId).not.toBeNull();
    }

    for (const client of clients) {
      const stop1 = await client.stopConnector(1);
      const stop2 = await client.stopConnector(2);
      expect(stop1.ok).toBe(true);
      expect(stop2.ok).toBe(true);
    }

    for (const client of clients) {
      const states = client.getStateAll();
      expect(states[0].transactionId).toBeNull();
      expect(states[1].transactionId).toBeNull();
    }
  });
});
