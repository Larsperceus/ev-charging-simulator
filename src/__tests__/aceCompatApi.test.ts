import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

let app: any;
let setTestState: any;
let setTestClients: any;

const previousNodeEnv = process.env.NODE_ENV;
const previousAceCompat = process.env.ACE_COMPAT;

function createCompatMockClient() {
  return {
    isConnected: () => true,
    getState: () => 'Available',
    getHeartbeatPeriodMs: () => 30000,
    getLastMessageAt: () => Date.now(),
    applyChangeConfiguration: () => ({ status: 'Accepted' }),
  };
}

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.ACE_COMPAT = 'true';

  const mod = await import('../index.js');
  app = mod.app;
  setTestState = mod.setTestState;
  setTestClients = mod.setTestClients;

  const bootOpts = {
    chargeBoxSerialNumber: 'ACE-TEST-1',
    chargePointModel: 'Alfen Eve Single Pro-line',
    chargePointSerialNumber: 'ACE-TEST-1',
    chargePointVendor: 'Alfen',
    firmwareVersion: '1.0.0'
  };

  setTestState({
    containerId: 'ACE-TEST-1',
    bootOpts,
    csmsUrl: 'ws://localhost:9000/ocpp1.6',
    connectors: 1,
    defaultEvseId: 'ACE-TEST-1',
    apiLoginPasswordProtected: false,
  });

  setTestClients([
    {
      evseId: 'ACE-TEST-1',
      client: createCompatMockClient(),
      bootOpts,
      csmsUrl: 'ws://localhost:9000/ocpp1.6',
      connectors: 1,
    }
  ]);
});

afterAll(() => {
  if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previousNodeEnv;

  if (previousAceCompat === undefined) delete process.env.ACE_COMPAT;
  else process.env.ACE_COMPAT = previousAceCompat;
});

describe('ACE compatibility API', () => {
  it('responds to login endpoint', async () => {
    const response = await request(app)
      .post('/api/login')
      .send({ username: 'installer' })
      .expect(200);

    expect(response.body.ok).toBe(true);
    expect(typeof response.body.token).toBe('string');
  });

  it('enforces password when protection is enabled', async () => {
    setTestState({
      containerId: 'ACE-TEST-1',
      bootOpts: {
        chargeBoxSerialNumber: 'ACE-TEST-1',
        chargePointModel: 'Alfen Eve Single Pro-line',
        chargePointSerialNumber: 'ACE-TEST-1',
        chargePointVendor: 'Alfen',
        firmwareVersion: '1.0.0'
      },
      csmsUrl: 'ws://localhost:9000/ocpp1.6',
      connectors: 1,
      defaultEvseId: 'ACE-TEST-1',
      apiLoginPasswordProtected: true,
      apiLoginPassword: 'Secret1234',
    });

    await request(app)
      .post('/api/login')
      .send({ username: 'admin' })
      .expect(401);

    await request(app)
      .post('/api/login')
      .send({ username: 'admin', password: 'wrong' })
      .expect(401);

    await request(app)
      .post('/api/login')
      .send({ username: 'admin', password: 'Secret1234' })
      .expect(200);

    setTestState({
      containerId: 'ACE-TEST-1',
      bootOpts: {
        chargeBoxSerialNumber: 'ACE-TEST-1',
        chargePointModel: 'Alfen Eve Single Pro-line',
        chargePointSerialNumber: 'ACE-TEST-1',
        chargePointVendor: 'Alfen',
        firmwareVersion: '1.0.0'
      },
      csmsUrl: 'ws://localhost:9000/ocpp1.6',
      connectors: 1,
      defaultEvseId: 'ACE-TEST-1',
      apiLoginPasswordProtected: false,
    });
  });

  it('responds to prop categories used by ACE', async () => {
    // Default (no cat/ids) returns generic page 0 in real ACE format
    const general = await request(app).get('/api/prop').expect(200);
    expect(general.body.version).toBe(2);
    expect(general.body.properties).toBeInstanceOf(Array);
    expect(general.body.properties.length).toBeGreaterThan(0);
    expect(general.body.total).toBeGreaterThan(0);

    // Category-based queries
    const generic = await request(app).get('/api/prop').query({ cat: 'generic' }).expect(200);
    expect(generic.body.version).toBe(2);
    expect(generic.body.properties.length).toBeGreaterThan(0);
    expect(generic.body.properties[0].cat).toBe('generic');

    const comm = await request(app).get('/api/prop').query({ cat: 'comm' }).expect(200);
    expect(comm.body.version).toBe(2);
    expect(comm.body.properties.length).toBeGreaterThan(0);

    await request(app).get('/api/prop').query({ cat: 'states' }).expect(200);
    await request(app).get('/api/prop').query({ cat: 'MbusTCP' }).expect(200);

    const ocpp = await request(app).get('/api/prop').query({ cat: 'ocpp' }).expect(200);
    expect(ocpp.body.version).toBe(2);
    expect(ocpp.body.properties.length).toBeGreaterThan(0);

    // ID-based query
    const byIds = await request(app).get('/api/prop').query({ ids: '2050_0,2051_0' }).expect(200);
    expect(byIds.body.version).toBe(2);
    expect(byIds.body.properties.length).toBe(2);
    expect(byIds.body.properties[0].id).toBe('2050_0');

    // Pagination
    const page2 = await request(app).get('/api/prop').query({ cat: 'generic', offset: 32 }).expect(200);
    expect(page2.body.offset).toBe(32);
    expect(page2.body.total).toBe(generic.body.total);
  });

  it('responds to firmware endpoints in real ACE format', async () => {
    const getRes = await request(app).get('/api/firmware').expect(200);
    expect(getRes.body.version).toBe(2);
    expect(getRes.body.current).toBe('1.0.0');
    expect(getRes.body.status).toBe(0);
    expect(getRes.body).toHaveProperty('active_image');

    const postRes = await request(app).post('/api/firmware').send({}).expect(200);
    expect(postRes.body.version).toBe(2);
    expect(postRes.body.status).toBe(0);
  });

  it('responds to logout endpoint', async () => {
    await request(app).post('/api/logout').send({}).expect(200);
  });

  it('accepts compatibility command endpoint', async () => {
    const response = await request(app)
      .post('/api/cmd')
      .send({ cmd: 'ChangePassword', args: { oldPassword: 'old', newPassword: 'new' } })
      .expect(200);

    expect(response.body.ok).toBe(true);
    expect(response.body.success).toBe(true);
    expect(response.body.status).toBe('OK');
    expect(response.body.code).toBe(0);
    expect(response.body.accepted).toBe(true);
    expect(response.body.error).toBeNull();
    expect(response.body.result?.changed).toBe(true);
  });

  it('accepts command variants and returns stable success schema', async () => {
    const response = await request(app)
      .post('/api/cmd')
      .send({ command: 'reboot' })
      .expect(200);

    expect(response.body.ok).toBe(true);
    expect(response.body.success).toBe(true);
    expect(response.body.status).toBe('OK');
    expect(response.body.code).toBe(0);
    expect(response.body.error).toBeNull();
    expect(response.body.result?.requiresReboot).toBe(true);
  });

  it('handles forcefirmwarepermanent command', async () => {
    const response = await request(app)
      .post('/api/cmd')
      .send({ command: 'forcefirmwarepermanent' })
      .expect(200);

    expect(response.body.ok).toBe(true);
    expect(response.body.command).toBe('forcefirmwarepermanent');
    expect(response.body.message).toBe('Firmware marked as permanent');
    expect(response.body.result?.accepted).toBe(true);
    expect(response.body.result?.current).toBe('1.0.0');
  });

  it('accepts prop writes in flat-object format (real ACE installer)', async () => {
    // Real ACE sends: { "2187_0": { "id": "2187_0", "value": 1772748150847 } }
    const response = await request(app)
      .post('/api/prop')
      .send({ '2187_0': { id: '2187_0', value: 1772748150847 } })
      .expect(200);

    expect(response.body.version).toBe(2);
  });

  it('accepts prop writes in array format', async () => {
    const response = await request(app)
      .post('/api/prop')
      .send({ properties: [{ id: '2187_0', value: 42 }, { id: '2050_0', value: 'test' }] })
      .expect(200);

    expect(response.body.version).toBe(2);
  });

  it('accepts prop writes with multiple flat-object entries', async () => {
    const response = await request(app)
      .post('/api/prop')
      .send({
        '2187_0': { id: '2187_0', value: 100 },
        '2050_0': { id: '2050_0', value: 'hello' },
        '2051_0': { id: '2051_0', value: 999 },
      })
      .expect(200);

    expect(response.body.version).toBe(2);
  });

  it('accepts empty prop write body gracefully', async () => {
    const response = await request(app)
      .post('/api/prop')
      .send({})
      .expect(200);

    expect(response.body.version).toBe(2);
  });

  it('keeps ACE login password in sync with PW-SetChargerPassword', async () => {
    setTestState({
      containerId: 'ACE-TEST-1',
      bootOpts: {
        chargeBoxSerialNumber: 'ACE-TEST-1',
        chargePointModel: 'Alfen Eve Single Pro-line',
        chargePointSerialNumber: 'ACE-TEST-1',
        chargePointVendor: 'Alfen',
        firmwareVersion: '1.0.0'
      },
      csmsUrl: 'ws://localhost:9000/ocpp1.6',
      connectors: 1,
      defaultEvseId: 'ACE-TEST-1',
      apiLoginPasswordProtected: true,
      apiLoginPassword: 'OldPass123',
    });

    await request(app)
      .post('/ocpp/cs/change-configuration')
      .send({ evseId: 'ACE-TEST-1', key: 'PW-SetChargerPassword', value: 'OldPass123:NewPass456' })
      .expect(200);

    await request(app)
      .post('/api/login')
      .send({ username: 'admin', password: 'OldPass123' })
      .expect(401);

    await request(app)
      .post('/api/login')
      .send({ username: 'admin', password: 'NewPass456' })
      .expect(200);

    await request(app)
      .post('/ocpp/cs/change-configuration')
      .send({ evseId: 'ACE-TEST-1', key: 'PW-SetChargerPassword', value: 'NewPass456,NewestPass789' })
      .expect(200);

    await request(app)
      .post('/api/login')
      .send({ username: 'admin', password: 'NewPass456' })
      .expect(401);

    await request(app)
      .post('/api/login')
      .send({ username: 'admin', password: 'NewestPass789' })
      .expect(200);
  });
});
