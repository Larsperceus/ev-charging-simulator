import { describe, expect, it } from 'vitest';
import { WebSocketServer } from 'ws';
import { OcppClient } from '../ocppClient.js';
import { loadBrandProfiles, selectBrandProfile } from '../brandProfiles.js';

function waitFor<T>(fn: () => T | undefined, timeoutMs = 5000, intervalMs = 50, label?: string, snapshot?: () => string): Promise<T> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const timer = setInterval(() => {
      const result = fn();
      if (result !== undefined) {
        clearInterval(timer);
        resolve(result);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        clearInterval(timer);
        const context = snapshot ? `\n${snapshot()}` : '';
        reject(new Error(`timeout${label ? `: ${label}` : ''}${context}`));
      }
    }, intervalMs);
  });
}

describe('OCPP integration', () => {
  it('handles core CS -> CP actions and transaction flow', async () => {
    const server = new WebSocketServer({ port: 0 });
    const address = server.address();
    if (typeof address !== 'object' || address === null) throw new Error('server address missing');
    const port = address.port;

    const received: any[] = [];

    server.on('connection', ws => {
      ws.on('message', raw => {
        const msg = JSON.parse(raw.toString());
        received.push(msg);
        const [type, uniqueId, action, payload] = msg;

        if (type === 2 && action === 'BootNotification') {
          ws.send(JSON.stringify([3, uniqueId, { status: 'Accepted', interval: 5 } ]));
        }

        if (type === 2 && action === 'Heartbeat') {
          ws.send(JSON.stringify([3, uniqueId, { currentTime: new Date().toISOString() } ]));
        }

        if (type === 2 && action === 'StatusNotification') {
          ws.send(JSON.stringify([3, uniqueId, {} ]));
        }

        if (type === 2 && action === 'Authorize') {
          ws.send(JSON.stringify([3, uniqueId, { idTagInfo: { status: 'Accepted' } } ]));
        }

        if (type === 2 && action === 'StartTransaction') {
          ws.send(JSON.stringify([3, uniqueId, { transactionId: 777 } ]));
        }

        if (type === 2 && action === 'StopTransaction') {
          ws.send(JSON.stringify([3, uniqueId, { status: 'Accepted' } ]));
        }

        if (type === 2 && action === 'MeterValues') {
          ws.send(JSON.stringify([3, uniqueId, {} ]));
        }

        if (type === 2 && action === 'DataTransfer') {
          ws.send(JSON.stringify([3, uniqueId, { status: 'Accepted', data: payload?.data } ]));
        }

        if (type === 2 && action === 'CancelReservation') {
          ws.send(JSON.stringify([3, uniqueId, { status: 'Accepted' } ]));
        }
      });
    });

    const client = new OcppClient(
      'EVSE-INT',
      {
        chargeBoxSerialNumber: 'EVSE-INT',
        chargePointModel: 'MODEL',
        chargePointSerialNumber: 'EVSE-INT',
        chargePointVendor: 'VENDOR',
        firmwareVersion: '1.0.0'
      },
      `ws://localhost:${port}/ocpp1.6`,
      1
    ) as any;

    client.rebootDelayMs = 50;
    client.connect();

    const snapshot = () => `received=${JSON.stringify(received.map(msg => msg[2] ?? msg[0]))}`;

    await waitFor(() => received.find(msg => msg[2] === 'BootNotification'), 10000, 50, 'BootNotification', snapshot);

    const wsClient = [...server.clients][0];

    wsClient.send(JSON.stringify([2, 'gc-1', 'GetConfiguration', {}]));
    const getCfg = await waitFor(() => received.find(msg => msg[0] === 3 && msg[1] === 'gc-1'), 10000, 50, 'GetConfiguration', snapshot);
    expect(Array.isArray(getCfg[2].configurationKey)).toBe(true);

    wsClient.send(JSON.stringify([2, 'cc-1', 'ChangeConfiguration', { key: 'HeartbeatInterval', value: '10' }]));
    const changeCfg = await waitFor(() => received.find(msg => msg[0] === 3 && msg[1] === 'cc-1'), 10000, 50, 'ChangeConfiguration', snapshot);
    expect(changeCfg[2].status).toBe('Accepted');

    wsClient.send(JSON.stringify([2, 'ca-1', 'ChangeAvailability', { connectorId: 1, type: 'Inoperative' }]));
    const changeAvail = await waitFor(() => received.find(msg => msg[0] === 3 && msg[1] === 'ca-1'), 10000, 50, 'ChangeAvailability', snapshot);
    expect(changeAvail[2].status).toBe('Accepted');

    wsClient.send(JSON.stringify([2, 'uc-1', 'UnlockConnector', { connectorId: 1 }]));
    const unlockResult = await waitFor(() => received.find(msg => msg[0] === 3 && msg[1] === 'uc-1'), 10000, 50, 'UnlockConnector', snapshot);
    expect(unlockResult[2].status).toBe('Unlocked');

    wsClient.send(JSON.stringify([2, 'cache-1', 'ClearCache', {}]));
    const clearCache = await waitFor(() => received.find(msg => msg[0] === 3 && msg[1] === 'cache-1'), 10000, 50, 'ClearCache', snapshot);
    expect(clearCache[2].status).toBe('Accepted');
    wsClient.send(JSON.stringify([2, 'rs-1', 'RemoteStartTransaction', { connectorId: 1, idTag: 'TAG1' }]));

    await waitFor(() => received.find(msg => msg[0] === 2 && msg[2] === 'StartTransaction'), 10000, 50, 'StartTransaction', snapshot);
    const remoteStartResult = await waitFor(() => received.find(msg => msg[0] === 3 && msg[1] === 'rs-1'), 10000, 50, 'RemoteStartTransaction', snapshot);
    expect(remoteStartResult[2].status).toBe('Accepted');

    wsClient.send(JSON.stringify([2, 'rst-1', 'RemoteStopTransaction', { transactionId: 777 }]));
    await waitFor(() => received.find(msg => msg[0] === 2 && msg[2] === 'StopTransaction'), 10000, 50, 'StopTransaction', snapshot);
    const remoteStopResult = await waitFor(() => received.find(msg => msg[0] === 3 && msg[1] === 'rst-1'), 10000, 50, 'RemoteStopTransaction', snapshot);
    expect(remoteStopResult[2].status).toBe('Accepted');

    wsClient.send(JSON.stringify([2, 'bad-1', 'RemoteStartTransaction', { connectorId: 1 }]));
    const badResult = await waitFor(() => received.find(msg => msg[0] === 4 && msg[1] === 'bad-1'), 10000, 50, 'BadRemoteStart', snapshot);
    expect(badResult[2]).toBe('FormationViolation');

    const dataTransferRes = await client.dataTransfer('VendorX', 'MSG1', 'hello');
    expect(dataTransferRes.status).toBe('Accepted');
    expect(dataTransferRes.data).toBe('hello');

    wsClient.send(JSON.stringify([2, 'reset-1', 'Reset', { type: 'Soft' }]));
    const resetResult = await waitFor(() => received.find(msg => msg[0] === 3 && msg[1] === 'reset-1'), 10000, 50, 'Reset', snapshot);
    expect(resetResult[2].status).toBe('Accepted');

    client.disconnectWs();
    server.close();
  });

  it('handles fault mid-transaction', async () => {
    const server = new WebSocketServer({ port: 0 });
    const address = server.address();
    if (typeof address !== 'object' || address === null) throw new Error('server address missing');
    const port = address.port;

    const received: any[] = [];

    server.on('connection', ws => {
      ws.on('message', raw => {
        const msg = JSON.parse(raw.toString());
        received.push(msg);
        const [type, uniqueId, action] = msg;

        if (type === 2 && action === 'BootNotification') {
          ws.send(JSON.stringify([3, uniqueId, { status: 'Accepted', interval: 5 } ]));
        }

        if (type === 2 && action === 'Authorize') {
          ws.send(JSON.stringify([3, uniqueId, { idTagInfo: { status: 'Accepted' } } ]));
        }

        if (type === 2 && action === 'StartTransaction') {
          ws.send(JSON.stringify([3, uniqueId, { transactionId: 555 } ]));
        }

        if (type === 2 && action === 'StopTransaction') {
          ws.send(JSON.stringify([3, uniqueId, { status: 'Accepted' } ]));
        }

        if (type === 2 && action === 'StatusNotification') {
          ws.send(JSON.stringify([3, uniqueId, {} ]));
        }
      });
    });

    const client = new OcppClient(
      'EVSE-FAULT',
      {
        chargeBoxSerialNumber: 'EVSE-FAULT',
        chargePointModel: 'MODEL',
        chargePointSerialNumber: 'EVSE-FAULT',
        chargePointVendor: 'VENDOR',
        firmwareVersion: '1.0.0'
      },
      `ws://localhost:${port}/ocpp1.6`,
      1
    ) as any;

    client.connect();
    await waitFor(() => received.find(msg => msg[2] === 'BootNotification'));

    const wsClient = [...server.clients][0];
    wsClient.send(JSON.stringify([2, 'rs-f', 'RemoteStartTransaction', { connectorId: 1, idTag: 'TAG1' }]));

    await waitFor(() => received.find(msg => msg[0] === 2 && msg[2] === 'StartTransaction'));

    await client.setConnectorError(1, 'OverCurrentFailure');
    const stopTx = await waitFor(() => received.find(msg => msg[0] === 2 && msg[2] === 'StopTransaction'));
    expect(stopTx[3].reason).toBe('Error');

    await client.setConnectorError(1, 'NoError');
    const statusAvailable = await waitFor(() => received.find(msg => msg[0] === 2 && msg[2] === 'StatusNotification' && msg[3]?.status === 'Available'));
    expect(statusAvailable[3].errorCode).toBe('NoError');

    client.disconnectWs();
    server.close();
  });

  it('recovers from network loss and reboots session', async () => {
    let bootCount = 0;

    const server = new WebSocketServer({ port: 0 });
    const address = server.address();
    if (typeof address !== 'object' || address === null) throw new Error('server address missing');
    const port = address.port;

    const wireServer = (wsServer: WebSocketServer) => {
      wsServer.on('connection', ws => {
        ws.on('message', raw => {
          const msg = JSON.parse(raw.toString());
          const [type, uniqueId, action] = msg;

          if (type === 2 && action === 'BootNotification') {
            bootCount += 1;
            ws.send(JSON.stringify([3, uniqueId, { status: 'Accepted', interval: 5 } ]));
          }

          if (type === 2 && action === 'Heartbeat') {
            ws.send(JSON.stringify([3, uniqueId, { currentTime: new Date().toISOString() } ]));
          }

          if (type === 2 && action === 'StatusNotification') {
            ws.send(JSON.stringify([3, uniqueId, {} ]));
          }
        });
      });
    };

    wireServer(server);

    const client = new OcppClient(
      'EVSE-NET',
      {
        chargeBoxSerialNumber: 'EVSE-NET',
        chargePointModel: 'MODEL',
        chargePointSerialNumber: 'EVSE-NET',
        chargePointVendor: 'VENDOR',
        firmwareVersion: '1.0.0'
      },
      `ws://localhost:${port}/ocpp1.6`,
      1
    ) as any;

    client.reconnectInterval = 100;
    client.connect();

    await waitFor(() => (bootCount === 1 ? bootCount : undefined));

    for (const ws of server.clients) ws.close();
    server.close();

    const server2 = new WebSocketServer({ port });
    wireServer(server2);

    await waitFor(() => (bootCount === 2 ? bootCount : undefined), 8000);

    client.disconnectWs();
    server2.close();
  });

  it('applies brand rules to the same command', async () => {
    const profiles = await loadBrandProfiles();
    const alfen = selectBrandProfile(profiles, 'alfen');
    const peblar = selectBrandProfile(profiles, 'peblar');

    const server = new WebSocketServer({ port: 0 });
    const address = server.address();
    if (typeof address !== 'object' || address === null) throw new Error('server address missing');
    const port = address.port;

    const responses: any[] = [];
    const connections = new Map<string, any>();

    server.on('connection', ws => {
      ws.on('message', raw => {
        const msg = JSON.parse(raw.toString());
        responses.push(msg);
        const [type, uniqueId, action, payload] = msg;

        if (type === 2 && action === 'BootNotification') {
          if (payload?.chargeBoxSerialNumber) {
            connections.set(payload.chargeBoxSerialNumber, ws);
          }
          ws.send(JSON.stringify([3, uniqueId, { status: 'Accepted', interval: 5 } ]));
        }

        if (type === 2 && action === 'StatusNotification') {
          ws.send(JSON.stringify([3, uniqueId, {} ]));
        }
      });
    });

    const clientA = new OcppClient(
      'EVSE-ALFEN',
      {
        chargeBoxSerialNumber: 'EVSE-ALFEN',
        chargePointModel: 'MODEL',
        chargePointSerialNumber: 'EVSE-ALFEN',
        chargePointVendor: 'VENDOR',
        firmwareVersion: '1.0.0'
      },
      `ws://localhost:${port}/ocpp1.6`,
      1,
      alfen
    );

    const clientP = new OcppClient(
      'EVSE-PEBLAR',
      {
        chargeBoxSerialNumber: 'EVSE-PEBLAR',
        chargePointModel: 'MODEL',
        chargePointSerialNumber: 'EVSE-PEBLAR',
        chargePointVendor: 'VENDOR',
        firmwareVersion: '1.0.0'
      },
      `ws://localhost:${port}/ocpp1.6`,
      1,
      peblar
    );

    (clientA as any).startMeterLoop = () => undefined;
    (clientA as any).stopMeterLoop = () => undefined;
    (clientP as any).startMeterLoop = () => undefined;
    (clientP as any).stopMeterLoop = () => undefined;
    clientA.connect();
    clientP.connect();

    await waitFor(() => responses.find(msg => msg[2] === 'BootNotification' && msg[3]?.chargeBoxSerialNumber === 'EVSE-ALFEN'));
    await waitFor(() => responses.find(msg => msg[2] === 'BootNotification' && msg[3]?.chargeBoxSerialNumber === 'EVSE-PEBLAR'));

    const wsAlfen = connections.get('EVSE-ALFEN');
    const wsPeblar = connections.get('EVSE-PEBLAR');
    if (!wsAlfen || !wsPeblar) throw new Error('brand connections missing');

    wsAlfen.send(JSON.stringify([2, 'cc-a', 'ChangeConfiguration', { key: 'HeartbeatInterval', value: '10' }]));
    wsPeblar.send(JSON.stringify([2, 'cc-p', 'ChangeConfiguration', { key: 'HeartbeatInterval', value: '10' }]));

    const alfenResult = await waitFor(() => responses.find(msg => msg[1] === 'cc-a'));
    const peblarResult = await waitFor(() => responses.find(msg => msg[1] === 'cc-p'));

    expect(alfenResult[0]).toBe(3);
    expect(peblarResult[0]).toBe(4);
    expect(peblarResult[2]).toBe('NotSupported');

    clientA.disconnectWs();
    clientP.disconnectWs();
    server.close();
  });

  it('accepts firmware update and sends status notifications in order', async () => {
    const server = new WebSocketServer({ port: 0 });
    const address = server.address();
    if (typeof address !== 'object' || address === null) throw new Error('server address missing');
    const port = address.port;

    const statuses: string[] = [];
    const responses: any[] = [];

    server.on('connection', ws => {
      ws.on('message', raw => {
        const msg = JSON.parse(raw.toString());
        responses.push(msg);
        const [type, uniqueId, action, payload] = msg;

        if (type === 2 && action === 'BootNotification') {
          ws.send(JSON.stringify([3, uniqueId, { status: 'Accepted', interval: 5 } ]));
        }

        if (type === 2 && action === 'StatusNotification') {
          ws.send(JSON.stringify([3, uniqueId, {} ]));
        }

        if (type === 2 && action === 'FirmwareStatusNotification') {
          statuses.push(payload.status);
          ws.send(JSON.stringify([3, uniqueId, {} ]));
        }
      });
    });

    const client = new OcppClient(
      'EVSE-FW-INT',
      {
        chargeBoxSerialNumber: 'EVSE-FW-INT',
        chargePointModel: 'MODEL',
        chargePointSerialNumber: 'EVSE-FW-INT',
        chargePointVendor: 'VENDOR',
        firmwareVersion: '6.6.2'
      },
      `ws://localhost:${port}/ocpp1.6`,
      1
    ) as any;

    client.setFirmwareTimings({ downloadMs: 20, installMs: 20 });
    client.connect();

    await waitFor(() => responses.find(msg => msg[2] === 'BootNotification'));
    const wsClient = [...server.clients][0];

    const retrieveDate = new Date().toISOString();
    wsClient.send(JSON.stringify([2, 'fw-1', 'UpdateFirmware', {
      location: 'https://example.com/fw-7.3.0.fwi',
      retrieveDate,
      checksum: 'sha256:1111222233334444',
      version: '7.3.0'
    } ]));

    const fwResult = await waitFor(() => responses.find(msg => msg[0] === 3 && msg[1] === 'fw-1'));
    expect(fwResult[2].status).toBe('Accepted');

    await waitFor(() => (statuses.length === 4 ? statuses : undefined));
    expect(statuses).toEqual(['Downloading', 'Downloaded', 'Installing', 'Installed']);
    expect(client.getFirmwareVersion()).toBe('7.3.0');

    client.disconnectWs();
    server.close();
  });

  it('retries diagnostics upload and reports failure then success', async () => {
    const server = new WebSocketServer({ port: 0 });
    const address = server.address();
    if (typeof address !== 'object' || address === null) throw new Error('server address missing');
    const port = address.port;

    const diagnosticsStatuses: string[] = [];
    const responses: any[] = [];

    server.on('connection', ws => {
      ws.on('message', raw => {
        const msg = JSON.parse(raw.toString());
        responses.push(msg);
        const [type, uniqueId, action, payload] = msg;

        if (type === 2 && action === 'BootNotification') {
          ws.send(JSON.stringify([3, uniqueId, { status: 'Accepted', interval: 5 } ]));
        }

        if (type === 2 && action === 'StatusNotification') {
          ws.send(JSON.stringify([3, uniqueId, {} ]));
        }

        if (type === 2 && action === 'DiagnosticsStatusNotification') {
          diagnosticsStatuses.push(payload.status);
          ws.send(JSON.stringify([3, uniqueId, {} ]));
        }

        if (type === 2 && action === 'GetDiagnostics') {
          ws.send(JSON.stringify([3, uniqueId, { fileName: 'diag.log' } ]));
        }
      });
    });

    const client = new OcppClient(
      'EVSE-DIAG-INT',
      {
        chargeBoxSerialNumber: 'EVSE-DIAG-INT',
        chargePointModel: 'MODEL',
        chargePointSerialNumber: 'EVSE-DIAG-INT',
        chargePointVendor: 'VENDOR',
        firmwareVersion: '1.0.0'
      },
      `ws://localhost:${port}/ocpp1.6`,
      1
    ) as any;

    client.connect();
    await waitFor(() => responses.find(msg => msg[2] === 'BootNotification'));

    const wsClient = [...server.clients][0];
    wsClient.send(JSON.stringify([2, 'diag-1', 'GetDiagnostics', {
      location: 'https://example.com/upload',
      retries: 1,
      retryInterval: 1
    }]));

    const result = await waitFor(() => responses.find(msg => msg[0] === 3 && msg[1] === 'diag-1'));
    expect(result[2].fileName).toContain('diagnostics-EVSE-DIAG-INT-');

    await waitFor(() => (diagnosticsStatuses.length >= 2 ? diagnosticsStatuses : undefined), 7000);
    expect(diagnosticsStatuses).toContain('UploadFailed');
    expect(diagnosticsStatuses).toContain('Uploaded');

    client.disconnectWs();
    server.close();
  });

  it('reboots after firmware install for Alfen but not Peblar', async () => {
    const profiles = await loadBrandProfiles();
    const alfen = selectBrandProfile(profiles, 'alfen');
    const peblar = selectBrandProfile(profiles, 'peblar');

    const server = new WebSocketServer({ port: 0 });
    const address = server.address();
    if (typeof address !== 'object' || address === null) throw new Error('server address missing');
    const port = address.port;

    const bootById = new Map<string, number>();
    const connections = new Map<string, any>();

    server.on('connection', ws => {
      ws.on('message', raw => {
        const msg = JSON.parse(raw.toString());
        const [type, uniqueId, action, payload] = msg;

        if (type === 2 && action === 'BootNotification') {
          const id = payload?.chargeBoxSerialNumber ?? 'unknown';
          if (payload?.chargeBoxSerialNumber) connections.set(payload.chargeBoxSerialNumber, ws);
          bootById.set(id, (bootById.get(id) ?? 0) + 1);
          ws.send(JSON.stringify([3, uniqueId, { status: 'Accepted', interval: 5 } ]));
        }

        if (type === 2 && action === 'StatusNotification') {
          ws.send(JSON.stringify([3, uniqueId, {} ]));
        }

        if (type === 2 && action === 'FirmwareStatusNotification') {
          ws.send(JSON.stringify([3, uniqueId, {} ]));
        }
      });
    });

    const clientA = new OcppClient(
      'EVSE-ALFEN-FW',
      {
        chargeBoxSerialNumber: 'EVSE-ALFEN-FW',
        chargePointModel: 'MODEL',
        chargePointSerialNumber: 'EVSE-ALFEN-FW',
        chargePointVendor: 'VENDOR',
        firmwareVersion: '6.6.2'
      },
      `ws://localhost:${port}/ocpp1.6`,
      1,
      alfen
    ) as any;

    const clientP = new OcppClient(
      'EVSE-PEBLAR-FW',
      {
        chargeBoxSerialNumber: 'EVSE-PEBLAR-FW',
        chargePointModel: 'MODEL',
        chargePointSerialNumber: 'EVSE-PEBLAR-FW',
        chargePointVendor: 'VENDOR',
        firmwareVersion: '6.6.2'
      },
      `ws://localhost:${port}/ocpp1.6`,
      1,
      peblar
    ) as any;

    clientA.setFirmwareTimings({ downloadMs: 20, installMs: 20 });
    clientP.setFirmwareTimings({ downloadMs: 20, installMs: 20 });
    clientA.reconnectInterval = 50;
    clientP.reconnectInterval = 50;
    clientA.connect();
    clientP.connect();

    await waitFor(() => bootById.get('EVSE-ALFEN-FW') === 1 ? 1 : undefined);
    await waitFor(() => bootById.get('EVSE-PEBLAR-FW') === 1 ? 1 : undefined);

    const wsAlfen = connections.get('EVSE-ALFEN-FW');
    const wsPeblar = connections.get('EVSE-PEBLAR-FW');
    if (!wsAlfen || !wsPeblar) throw new Error('firmware brand connections missing');
    const retrieveDate = new Date().toISOString();
    wsAlfen.send(JSON.stringify([2, 'fw-a', 'UpdateFirmware', {
      location: 'https://example.com/fw-7.3.0.fwi',
      retrieveDate,
      checksum: 'sha256:aaaa0000bbbb1111',
      version: '7.3.0'
    } ]));
    wsPeblar.send(JSON.stringify([2, 'fw-p', 'UpdateFirmware', {
      location: 'https://example.com/fw-7.3.0.fwi',
      retrieveDate,
      checksum: 'sha256:cccc2222dddd3333',
      version: '7.3.0'
    } ]));

    await waitFor(() => (bootById.get('EVSE-ALFEN-FW') === 2 ? 2 : undefined), 8000);
    expect(bootById.get('EVSE-PEBLAR-FW')).toBe(1);

    clientA.disconnectWs();
    clientP.disconnectWs();
    server.close();
  });
});
