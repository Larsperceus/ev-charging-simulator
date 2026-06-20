import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

let app: any;
let setTestState: any;
let setTestClients: any;

function createMockClient() {
  return {
    isConnected: () => true,
    getPower: () => ({ amps: 16, volts: 230, watts: 3680 }),
    getHeartbeatPeriodMs: () => 30000,
    getLastMessageAt: () => Date.now(),
    getStateAll: () => ([{ id: 1, state: 'Available', errorCode: 'NoError', transactionId: 123 }]),
    getTransactionId: () => 123,
    getState: () => 'Available',
    setPower: () => undefined,
    localStart: async () => ({ ok: true, transactionId: 42 }),
    stopConnector: async () => ({ ok: true }),
    setConnectorStatus: async () => undefined,
    disconnectWs: async () => undefined,
    reconnectWs: async () => undefined,
    localReset: async () => undefined,
    authorize: async () => 'Accepted',
    startTransaction: async () => 123,
    stopTransaction: async () => true,
    sendBootNotification: async () => ({ status: 'Accepted' }),
    sendHeartbeat: async () => ({ currentTime: new Date().toISOString() }),
    sendStatusNotification: async () => ({ status: 'Accepted' }),
    sendMeterValues: async () => ({ status: 'Accepted' }),
    dataTransfer: async (_vendorId: string, _messageId?: string, data?: string) => ({ status: 'Accepted', data }),
    firmwareStatusNotification: async () => ({ status: 'Accepted' }),
    diagnosticsStatusNotification: async () => ({ status: 'Accepted' }),
    applyGetConfiguration: () => ({ configurationKey: [], unknownKey: [] }),
    applyChangeConfiguration: () => ({ status: 'Accepted' }),
    applyChangeAvailability: () => ({ status: 'Accepted' }),
    applyClearCache: () => ({ status: 'Accepted' }),
    applyTriggerMessage: async () => ({ status: 'Accepted' }),
    applyRemoteStart: async () => ({ status: 'Accepted' }),
    applyRemoteStop: async () => ({ status: 'Accepted' }),
    applyReset: async () => ({ status: 'Accepted' }),
    applyUnlockConnector: () => ({ status: 'Unlocked' }),
    applyUpdateFirmware: () => ({ status: 'Accepted' }),
    applyGetDiagnostics: () => ({ status: 'Accepted', fileName: 'diagnostics.log' }),
    applyReserveNow: () => ({ status: 'Accepted' }),
    applyCancelReservation: () => ({ status: 'Accepted' })
  };
}

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  const mod = await import('../index.js');
  app = mod.app;
  setTestState = mod.setTestState;
  setTestClients = mod.setTestClients;

  const bootOpts = {
    chargeBoxSerialNumber: 'EVSE-1',
    chargePointModel: 'MODEL',
    chargePointSerialNumber: 'EVSE-1',
    chargePointVendor: 'VENDOR',
    firmwareVersion: '1.0.0'
  };

  setTestState({
    containerId: 'CP-TEST',
    bootOpts,
    csmsUrl: 'ws://localhost:9000/ocpp1.6',
    connectors: 1,
    defaultEvseId: 'EVSE-1'
  });

  setTestClients([
    {
      evseId: 'EVSE-1',
      client: createMockClient(),
      bootOpts,
      csmsUrl: 'ws://localhost:9000/ocpp1.6',
      connectors: 1,
      environment: { id: 'prod', name: 'Production' },
      company: { id: 'acme', name: 'Acme Corp' },
      location: { id: 'LOC-1', name: 'HQ' }
    }
  ]);
});

describe('Control API endpoints', () => {
  it('covers all endpoints', async () => {
    await request(app).get('/openapi.json').expect(200);
    await request(app).get('/docs').expect(200);

    await request(app).get('/health').expect(200);
    await request(app).get('/health').query({ envId: 'prod' }).expect(200);
    await request(app).get('/health').query({ envName: 'Production' }).expect(200);
    await request(app).get('/health').query({ companyId: 'acme' }).expect(200);
    await request(app).get('/health').query({ companyName: 'Acme Corp' }).expect(200);
    await request(app).get('/health').query({ locationId: 'LOC-1' }).expect(200);
    await request(app).get('/health').query({ locationName: 'HQ' }).expect(200);
    await request(app).get('/info').expect(200);
    await request(app).get('/info').query({ envId: 'prod' }).expect(200);
    await request(app).get('/info').query({ envName: 'Production' }).expect(200);
    await request(app).get('/info').query({ companyId: 'acme' }).expect(200);
    await request(app).get('/info').query({ companyName: 'Acme Corp' }).expect(200);
    await request(app).get('/info').query({ locationId: 'LOC-1' }).expect(200);
    await request(app).get('/info').query({ locationName: 'HQ' }).expect(200);
    await request(app).get('/status').expect(200);
    await request(app).get('/status').query({ envId: 'prod' }).expect(200);
    await request(app).get('/status').query({ envName: 'Production' }).expect(200);
    await request(app).get('/status').query({ companyId: 'acme' }).expect(200);
    await request(app).get('/status').query({ companyName: 'Acme Corp' }).expect(200);
    await request(app).get('/status').query({ locationId: 'LOC-1' }).expect(200);
    await request(app).get('/status').query({ locationName: 'HQ' }).expect(200);

    await request(app).post('/control/start').send({ evseId: 'EVSE-1', connectorId: 1, idTag: 'TAG' }).expect(200);
    await request(app).post('/control/stop').send({ evseId: 'EVSE-1', connectorId: 1 }).expect(200);
    await request(app).post('/control/status').send({ evseId: 'EVSE-1', connectorId: 1, state: 'Available' }).expect(200);
    await request(app).post('/control/power').send({ evseId: 'EVSE-1', amps: 10, volts: 220 }).expect(200);
    await request(app).post('/control/disconnect').send({ evseId: 'EVSE-1' }).expect(200);
    await request(app).post('/control/reconnect').send({ evseId: 'EVSE-1' }).expect(200);

    await request(app).get('/connectors/1').query({ evseId: 'EVSE-1' }).expect(200);
    await request(app).get('/connectors').query({ evseId: 'EVSE-1' }).expect(200);
    await request(app).get('/transactions').query({ evseId: 'EVSE-1' }).expect(200);
    await request(app).get('/connectors/1/transaction').query({ evseId: 'EVSE-1' }).expect(200);

    await request(app).post('/control/reset').send({ evseId: 'EVSE-1', type: 'Soft' }).expect(200);
    await request(app).get('/configuration').query({ evseId: 'EVSE-1' }).expect(200);
    await request(app).post('/configuration').send({ evseId: 'EVSE-1', amps: 8 }).expect(200);
    await request(app).get('/meters').query({ evseId: 'EVSE-1' }).expect(200);
    await request(app).get('/diagnostics').query({ evseId: 'EVSE-1' }).expect(200);
    await request(app).post('/control/emergency-stop').send({ evseId: 'EVSE-1' }).expect(200);
    await request(app).post('/connectors/1/availability').send({ evseId: 'EVSE-1', available: true }).expect(200);

    await request(app).post('/ocpp/cp/boot').send({ evseId: 'EVSE-1' }).expect(200);
    await request(app).post('/ocpp/cp/heartbeat').send({ evseId: 'EVSE-1' }).expect(200);
    await request(app).post('/ocpp/cp/authorize').send({ evseId: 'EVSE-1', idTag: 'TAG' }).expect(200);
    await request(app).post('/ocpp/cp/start-transaction').send({ evseId: 'EVSE-1', connectorId: 1, idTag: 'TAG' }).expect(200);
    await request(app).post('/ocpp/cp/stop-transaction').send({ evseId: 'EVSE-1', connectorId: 1, reason: 'Remote' }).expect(200);
    await request(app).post('/ocpp/cp/meter-values').send({ evseId: 'EVSE-1', connectorId: 1 }).expect(200);
    await request(app).post('/ocpp/cp/status-notification').send({ evseId: 'EVSE-1', connectorId: 1, status: 'Available' }).expect(200);
    await request(app).post('/ocpp/cp/data-transfer').send({ evseId: 'EVSE-1', vendorId: 'VendorX', messageId: 'M1', data: 'hello' }).expect(200);
    await request(app).post('/ocpp/cp/firmware-status').send({ evseId: 'EVSE-1', status: 'Downloaded' }).expect(200);
    await request(app).post('/ocpp/cp/diagnostics-status').send({ evseId: 'EVSE-1', status: 'Idle' }).expect(200);

    await request(app).post('/ocpp/cs/get-configuration').send({ evseId: 'EVSE-1' }).expect(200);
    await request(app).post('/ocpp/cs/change-configuration').send({ evseId: 'EVSE-1', key: 'HeartbeatInterval', value: '10' }).expect(200);
    await request(app).post('/ocpp/cs/change-availability').send({ evseId: 'EVSE-1', connectorId: 0, type: 'Operative' }).expect(200);
    await request(app).post('/ocpp/cs/clear-cache').send({ evseId: 'EVSE-1' }).expect(200);
    await request(app).post('/ocpp/cs/trigger-message').send({ evseId: 'EVSE-1', requestedMessage: 'Heartbeat', connectorId: 1 }).expect(200);
    await request(app).post('/ocpp/cs/remote-start').send({ evseId: 'EVSE-1', connectorId: 1, idTag: 'TAG' }).expect(200);
    await request(app).post('/ocpp/cs/remote-stop').send({ evseId: 'EVSE-1', connectorId: 1 }).expect(200);
    await request(app).post('/ocpp/cs/reset').send({ evseId: 'EVSE-1', type: 'Soft' }).expect(200);
    await request(app).post('/ocpp/cs/unlock-connector').send({ evseId: 'EVSE-1', connectorId: 1 }).expect(200);
    await request(app).post('/ocpp/cs/update-firmware').send({ evseId: 'EVSE-1', location: 'https://example.com/fw-2.0.0.fwi', retrieveDate: new Date().toISOString(), checksum: 'sha256:abcd1234efgh5678' }).expect(200);
    await request(app).post('/ocpp/cs/get-diagnostics').send({ evseId: 'EVSE-1', location: 'https://example.com/upload' }).expect(200);
    await request(app).post('/ocpp/cs/reserve-now').send({ evseId: 'EVSE-1', connectorId: 1, expiryDate: new Date(Date.now() + 60000).toISOString(), idTag: 'TAG', reservationId: 1 }).expect(200);
    await request(app).post('/ocpp/cs/cancel-reservation').send({ evseId: 'EVSE-1', reservationId: 1 }).expect(200);

    expect(true).toBe(true);
  });

  it('returns robust 4xx responses for invalid requests', async () => {
    const invalidPower = await request(app)
      .post('/control/power')
      .send({ evseId: 'EVSE-1', amps: -1 })
      .expect(400);

    expect(invalidPower.body.error).toBe('bad_request');

    const invalidConnector = await request(app)
      .post('/control/start')
      .send({ evseId: 'EVSE-1', connectorId: 0, idTag: 'TAG' })
      .expect(400);

    expect(invalidConnector.body.error).toBe('bad_request');

    const missingState = await request(app)
      .post('/control/status')
      .send({ evseId: 'EVSE-1', connectorId: 1 })
      .expect(400);

    expect(missingState.body.error).toBe('bad_request');

    const unknownEvse = await request(app)
      .post('/control/reconnect')
      .send({ evseId: 'EVSE-NOT-FOUND' })
      .expect(404);

    expect(unknownEvse.body.error).toBe('evse_not_found');

    const invalidAvailability = await request(app)
      .post('/connectors/1/availability')
      .send({ evseId: 'EVSE-1', available: 'yes' })
      .expect(400);

    expect(invalidAvailability.body.error).toBe('bad_request');

    const invalidConnectorPath = await request(app)
      .post('/connectors/0/availability')
      .send({ evseId: 'EVSE-1', available: true })
      .expect(400);

    expect(invalidConnectorPath.body.error).toBe('bad_request');

    const firmwareValidationClient = {
      ...createMockClient(),
      applyUpdateFirmware: () => ({ status: 'Rejected', error: 'bad_request', message: 'Invalid retrieveDate' })
    };

    setTestClients([
      {
        evseId: 'EVSE-1',
        client: firmwareValidationClient,
        bootOpts: {
          chargeBoxSerialNumber: 'EVSE-1',
          chargePointModel: 'MODEL',
          chargePointSerialNumber: 'EVSE-1',
          chargePointVendor: 'VENDOR',
          firmwareVersion: '1.0.0'
        },
        csmsUrl: 'ws://localhost:9000/ocpp1.6',
        connectors: 1,
        environment: { id: 'prod', name: 'Production' },
        company: { id: 'acme', name: 'Acme Corp' },
        location: { id: 'LOC-1', name: 'HQ' }
      }
    ]);

    const invalidFirmware = await request(app)
      .post('/ocpp/cs/update-firmware')
      .send({ evseId: 'EVSE-1', location: 'https://example.com/fw.fwi', retrieveDate: 'bad-date' })
      .expect(400);

    expect(invalidFirmware.body.error).toBe('bad_request');
  });

  it('returns 500 internal_error on unexpected route failures', async () => {
    const throwingClient = {
      ...createMockClient(),
      localStart: async () => { throw new Error('boom'); },
      stopConnector: async () => { throw new Error('boom'); },
      setConnectorStatus: async () => { throw new Error('boom'); },
      sendBootNotification: async () => { throw new Error('boom'); },
      sendHeartbeat: async () => { throw new Error('boom'); },
      authorize: async () => { throw new Error('boom'); },
      startTransaction: async () => { throw new Error('boom'); },
      stopTransaction: async () => { throw new Error('boom'); },
      sendMeterValues: async () => { throw new Error('boom'); },
      sendStatusNotification: async () => { throw new Error('boom'); },
      dataTransfer: async () => { throw new Error('boom'); },
      firmwareStatusNotification: async () => { throw new Error('boom'); },
      diagnosticsStatusNotification: async () => { throw new Error('boom'); },
      localReset: async () => { throw new Error('boom'); },
      getStateAll: () => ([{ id: 1, state: 'Charging', errorCode: 'NoError', transactionId: 1 }]),
    };

    const bootOpts = {
      chargeBoxSerialNumber: 'EVSE-1',
      chargePointModel: 'MODEL',
      chargePointSerialNumber: 'EVSE-1',
      chargePointVendor: 'VENDOR',
      firmwareVersion: '1.0.0'
    };

    setTestClients([
      {
        evseId: 'EVSE-1',
        client: throwingClient,
        bootOpts,
        csmsUrl: 'ws://localhost:9000/ocpp1.6',
        connectors: 1,
        environment: { id: 'prod', name: 'Production' },
        company: { id: 'acme', name: 'Acme Corp' },
        location: { id: 'LOC-1', name: 'HQ' }
      }
    ]);

    const cases: Array<{ method: 'post'; path: string; body?: Record<string, unknown> }> = [
      { method: 'post', path: '/control/start', body: { evseId: 'EVSE-1', connectorId: 1, idTag: 'TAG' } },
      { method: 'post', path: '/control/stop', body: { evseId: 'EVSE-1', connectorId: 1 } },
      { method: 'post', path: '/control/status', body: { evseId: 'EVSE-1', connectorId: 1, state: 'Available' } },
      { method: 'post', path: '/ocpp/cp/boot', body: { evseId: 'EVSE-1' } },
      { method: 'post', path: '/ocpp/cp/heartbeat', body: { evseId: 'EVSE-1' } },
      { method: 'post', path: '/ocpp/cp/authorize', body: { evseId: 'EVSE-1', idTag: 'TAG' } },
      { method: 'post', path: '/ocpp/cp/start-transaction', body: { evseId: 'EVSE-1', connectorId: 1, idTag: 'TAG' } },
      { method: 'post', path: '/ocpp/cp/stop-transaction', body: { evseId: 'EVSE-1', connectorId: 1, reason: 'Remote' } },
      { method: 'post', path: '/ocpp/cp/meter-values', body: { evseId: 'EVSE-1', connectorId: 1 } },
      { method: 'post', path: '/ocpp/cp/status-notification', body: { evseId: 'EVSE-1', connectorId: 1, status: 'Available' } },
      { method: 'post', path: '/ocpp/cp/data-transfer', body: { evseId: 'EVSE-1', vendorId: 'VendorX' } },
      { method: 'post', path: '/ocpp/cp/firmware-status', body: { evseId: 'EVSE-1', status: 'Downloaded' } },
      { method: 'post', path: '/ocpp/cp/diagnostics-status', body: { evseId: 'EVSE-1', status: 'Idle' } },
      { method: 'post', path: '/control/reset', body: { evseId: 'EVSE-1', type: 'Soft' } },
      { method: 'post', path: '/control/emergency-stop', body: { evseId: 'EVSE-1' } },
      { method: 'post', path: '/connectors/1/availability', body: { evseId: 'EVSE-1', available: true } },
    ];

    for (const testCase of cases) {
      const res = await request(app)
        [testCase.method](testCase.path)
        .send(testCase.body ?? {});

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('internal_error');
    }
  });

  it('validates additional request payload edge cases', async () => {
    const invalidType = await request(app)
      .post('/ocpp/cs/change-availability')
      .send({ evseId: 'EVSE-1', connectorId: 1, type: 'InvalidType' })
      .expect(400);
    expect(invalidType.body.error).toBe('bad_request');

    const invalidDataTransfer = await request(app)
      .post('/ocpp/cp/data-transfer')
      .send({ evseId: 'EVSE-1', vendorId: '' })
      .expect(400);
    expect(invalidDataTransfer.body.error).toBe('bad_request');

    const invalidAuthorize = await request(app)
      .post('/ocpp/cp/authorize')
      .send({ evseId: 'EVSE-1', idTag: '' })
      .expect(400);
    expect(invalidAuthorize.body.error).toBe('bad_request');

    const invalidTriggerMessage = await request(app)
      .post('/ocpp/cs/trigger-message')
      .send({ evseId: 'EVSE-1', requestedMessage: '', connectorId: 1 })
      .expect(400);
    expect(invalidTriggerMessage.body.error).toBe('bad_request');

    const invalidTriggerConnector = await request(app)
      .post('/ocpp/cs/trigger-message')
      .send({ evseId: 'EVSE-1', requestedMessage: 'Heartbeat', connectorId: 0 })
      .expect(400);
    expect(invalidTriggerConnector.body.error).toBe('bad_request');

    const invalidRemoteStopTransaction = await request(app)
      .post('/ocpp/cs/remote-stop')
      .send({ evseId: 'EVSE-1', transactionId: 0 })
      .expect(400);
    expect(invalidRemoteStopTransaction.body.error).toBe('bad_request');

    const invalidUnlockConnector = await request(app)
      .post('/ocpp/cs/unlock-connector')
      .send({ evseId: 'EVSE-1', connectorId: 0 })
      .expect(400);
    expect(invalidUnlockConnector.body.error).toBe('bad_request');

    const invalidDiagnostics = await request(app)
      .post('/ocpp/cs/get-diagnostics')
      .send({ evseId: 'EVSE-1', location: '' })
      .expect(400);
    expect(invalidDiagnostics.body.error).toBe('bad_request');

    const missingReserveConnector = await request(app)
      .post('/ocpp/cs/reserve-now')
      .send({ evseId: 'EVSE-1', expiryDate: new Date(Date.now() + 60000).toISOString(), idTag: 'TAG', reservationId: 1 })
      .expect(400);
    expect(missingReserveConnector.body.error).toBe('bad_request');

    const missingReservationId = await request(app)
      .post('/ocpp/cs/cancel-reservation')
      .send({ evseId: 'EVSE-1' })
      .expect(400);
    expect(missingReservationId.body.error).toBe('bad_request');

    const invalidConnectorPath = await request(app)
      .get('/connectors/0')
      .query({ evseId: 'EVSE-1' })
      .expect(400);
    expect(invalidConnectorPath.body.error).toBe('bad_request');

    const noTransactionClient = {
      ...createMockClient(),
      getTransactionId: () => null,
      getStateAll: () => ([{ id: 1, state: 'Available', errorCode: 'NoError', transactionId: null }]),
    };

    const bootOpts = {
      chargeBoxSerialNumber: 'EVSE-1',
      chargePointModel: 'MODEL',
      chargePointSerialNumber: 'EVSE-1',
      chargePointVendor: 'VENDOR',
      firmwareVersion: '1.0.0'
    };

    setTestClients([
      {
        evseId: 'EVSE-1',
        client: noTransactionClient,
        bootOpts,
        csmsUrl: 'ws://localhost:9000/ocpp1.6',
        connectors: 1,
        environment: { id: 'prod', name: 'Production' },
        company: { id: 'acme', name: 'Acme Corp' },
        location: { id: 'LOC-1', name: 'HQ' }
      }
    ]);

    const noActiveTransaction = await request(app)
      .get('/connectors/1/transaction')
      .query({ evseId: 'EVSE-1' })
      .expect(404);
    expect(noActiveTransaction.body.error).toBe('no_active_transaction');
  });

  it('returns multi-EVSE info/status payload shape', async () => {
    const bootOpts = {
      chargeBoxSerialNumber: 'EVSE-1',
      chargePointModel: 'MODEL',
      chargePointSerialNumber: 'EVSE-1',
      chargePointVendor: 'VENDOR',
      firmwareVersion: '1.0.0'
    };

    setTestClients([
      {
        evseId: 'EVSE-1',
        client: createMockClient(),
        bootOpts,
        csmsUrl: 'ws://localhost:9000/ocpp1.6',
        connectors: 1,
        environment: { id: 'prod', name: 'Production' },
        company: { id: 'acme', name: 'Acme Corp' },
        location: { id: 'LOC-1', name: 'HQ' }
      },
      {
        evseId: 'EVSE-2',
        client: createMockClient(),
        bootOpts: {
          ...bootOpts,
          chargeBoxSerialNumber: 'EVSE-2',
          chargePointSerialNumber: 'EVSE-2'
        },
        csmsUrl: 'ws://localhost:9000/ocpp1.6',
        connectors: 1,
        environment: { id: 'prod', name: 'Production' },
        company: { id: 'acme', name: 'Acme Corp' },
        location: { id: 'LOC-2', name: 'Remote' }
      }
    ]);

    const info = await request(app).get('/info').expect(200);
    expect(info.body.evseCount).toBe(2);
    expect(Array.isArray(info.body.evses)).toBe(true);

    const status = await request(app).get('/status').expect(200);
    expect(status.body.evseCount).toBe(2);
    expect(Array.isArray(status.body.evses)).toBe(true);
  });
});
