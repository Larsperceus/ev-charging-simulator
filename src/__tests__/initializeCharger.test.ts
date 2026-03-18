import { describe, expect, it, vi } from 'vitest';
import { buildClientsFromConfig, initializeCharger, app } from '../index.js';
import { loadBrandProfiles } from '../brandProfiles.js';
import { OcppClient } from '../ocppClient.js';
import request from 'supertest';

async function waitFor<T>(
  fn: () => T | undefined,
  timeoutMs = 1500,
  intervalMs = 10,
): Promise<T> {
  const startedAt = Date.now();

  return new Promise<T>((resolve, reject) => {
    const timer = setInterval(() => {
      try {
        const value = fn();
        if (value !== undefined) {
          clearInterval(timer);
          resolve(value);
          return;
        }

        if (Date.now() - startedAt >= timeoutMs) {
          clearInterval(timer);
          reject(new Error('timeout waiting for condition'));
        }
      } catch (error) {
        clearInterval(timer);
        reject(error);
      }
    }, intervalMs);
  });
}

const baseBootOpts = {
  chargeBoxSerialNumber: 'BASE',
  chargePointModel: 'BASE_MODEL',
  chargePointSerialNumber: 'BASE_SERIAL',
  chargePointVendor: 'BASE_VENDOR',
  firmwareVersion: '0.0.1'
};

describe('initializeCharger config application', () => {
  it('applies per-EVSE overrides from config', async () => {
    const profilesConfig = await loadBrandProfiles();
    const entries = buildClientsFromConfig({
      entries: [
        {
          evseId: 'EVSE-100',
          connectors: 2,
          csmsUrl: 'ws://example.com/ocpp',
          brand: 'alfen',
          power: { amps: 20, volts: 200 },
          boot: { chargePointModel: 'MODEL-A', chargePointVendor: 'VendorA', firmwareVersion: '9.9.9' }
        },
        {
          evseId: 'EVSE-200',
          connectors: 1,
          brand: 'peblar',
          power: { amps: 32, volts: 230 }
        }
      ],
      bootOpts: baseBootOpts,
      csmsUrl: 'ws://default/ocpp',
      connectors: 1,
      profilesConfig,
      baseBrandName: 'generic'
    });

    expect(entries.length).toBe(2);

    const first = entries[0];
    expect(first.evseId).toBe('EVSE-100');
    expect(first.connectors).toBe(2);
    expect(first.csmsUrl).toBe('ws://example.com/ocpp');
    expect(first.bootOpts.chargePointModel).toBe('MODEL-A');
    expect(first.bootOpts.chargePointVendor).toBe('VendorA');
    expect(first.bootOpts.firmwareVersion).toBe('9.9.9');
    expect(first.client.getPower().amps).toBe(20);
    expect(first.client.getPower().volts).toBe(200);
    expect(first.client.isActionAllowed('ChangeConfiguration')).toBe(true);

    const second = entries[1];
    expect(second.evseId).toBe('EVSE-200');
    expect(second.connectors).toBe(1);
    expect(second.csmsUrl).toBe('ws://default/ocpp');
    expect(second.bootOpts.chargePointModel).toBe('BASE_MODEL');
    expect(second.client.getPower().amps).toBe(32);
    expect(second.client.getPower().volts).toBe(230);
    expect(second.client.isActionAllowed('ChangeConfiguration')).toBe(false);
  });

  it('updates firmware version after UpdateFirmware flow', async () => {
    const profilesConfig = await loadBrandProfiles();
    const entries = buildClientsFromConfig({
      entries: [
        {
          evseId: 'EVSE-FW-1',
          boot: { firmwareVersion: '6.6.2' }
        }
      ],
      bootOpts: baseBootOpts,
      csmsUrl: 'ws://default/ocpp',
      connectors: 1,
      profilesConfig,
      baseBrandName: 'generic'
    });

    const client: any = entries[0].client;
    client.sendCall = async () => ({ status: 'Accepted' });
    client.setFirmwareTimings({ downloadMs: 10, installMs: 10 });

    const retrieveDate = new Date().toISOString();
    const update = client.applyUpdateFirmware({
      location: 'https://example.com/fw-7.3.0.fwi',
      retrieveDate,
      checksum: 'sha256:abcd1234efgh5678',
      version: '7.3.0'
    });
    expect(update.status).toBe('Accepted');

    await waitFor(() => (client.getFirmwareVersion() === '7.3.0' ? '7.3.0' : undefined));
    expect(client.getFirmwareVersion()).toBe('7.3.0');
  });

  it('initializes clients from config without opening real websocket connections', async () => {
    const connectSpy = vi
      .spyOn(OcppClient.prototype, 'connect')
      .mockImplementation(async () => undefined);

    const originalArgv = process.argv;
    process.argv = [...originalArgv, '--evse-ids=IGNORED-EVSE', '--brand=alfen'];

    await initializeCharger();

    const health = await request(app).get('/health').expect(200);
    expect(typeof health.body.total).toBe('number');
    expect(connectSpy).toHaveBeenCalled();

    process.argv = originalArgv;
    connectSpy.mockRestore();
  });
});
