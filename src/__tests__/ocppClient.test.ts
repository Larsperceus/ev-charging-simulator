import { describe, expect, it, vi } from 'vitest';
import { OcppClient } from '../ocppClient.js';
import { BrandProfile } from '../brandProfiles.js';

function createClient() {
  const client = new OcppClient(
    'EVSE-TEST',
    {
      chargeBoxSerialNumber: 'EVSE-TEST',
      chargePointModel: 'MODEL',
      chargePointSerialNumber: 'EVSE-TEST',
      chargePointVendor: 'VENDOR',
      firmwareVersion: '1.0.0'
    },
    'ws://localhost:0/ocpp1.6',
    1
  ) as any;

  client.safeCall = async () => undefined;
  client.sendCall = async (action: string, payload: any) => {
    if (action === 'Authorize') return { idTagInfo: { status: 'Accepted' } };
    if (action === 'StartTransaction') return { transactionId: 42 };
    if (action === 'StopTransaction') return { status: 'Accepted' };
    if (action === 'MeterValues') return { status: 'Accepted' };
    if (action === 'StatusNotification') return { status: 'Accepted' };
    return { status: 'Accepted' };
  };

  return client as OcppClient;
}

function createClientWithFirmware(firmwareVersion: string) {
  const client = new OcppClient(
    `EVSE-${firmwareVersion}`,
    {
      chargeBoxSerialNumber: `EVSE-${firmwareVersion}`,
      chargePointModel: 'MODEL',
      chargePointSerialNumber: `EVSE-${firmwareVersion}`,
      chargePointVendor: 'VENDOR',
      firmwareVersion
    },
    'ws://localhost:0/ocpp1.6',
    1
  ) as any;

  client.safeCall = async () => undefined;
  client.sendCall = async () => ({ status: 'Accepted' });

  return client as OcppClient;
}

describe('OcppClient state transitions', () => {
  it('starts and stops a local transaction', async () => {
    const client = createClient();

    await client.localStart(1, 'IDTAG');
    const stateAfterStart = client.getStateAll()[0];
    expect(stateAfterStart.state).toBe('Charging');
    expect(stateAfterStart.transactionId).toBe(42);

    const stopped = await client.stopConnector(1);
    expect(stopped).toBe(true);
    const stateAfterStop = client.getStateAll()[0];
    expect(stateAfterStop.state).toBe('Available');
    expect(stateAfterStop.transactionId).toBe(null);
  });

  it('rejects local start when authorize fails', async () => {
    const client = createClient() as any;
    client.sendCall = async (action: string) => {
      if (action === 'Authorize') return { idTagInfo: { status: 'Rejected' } };
      if (action === 'StartTransaction') return { transactionId: 99 };
      return { status: 'Accepted' };
    };

    await client.localStart(1, 'BADTAG');
    const stateAfterStart = client.getStateAll()[0];
    expect(stateAfterStart.transactionId).toBe(null);
  });

  it('authorizes and returns status', async () => {
    const client = createClient();
    const status = await client.authorize('TAG-1');
    expect(status).toBe('Accepted');
  });

  it('sends data transfer payload', async () => {
    const client = createClient() as any;
    client.sendCall = async (action: string, payload: any) => {
      if (action === 'DataTransfer') return { status: 'Accepted', data: payload.data };
      return { status: 'Accepted' };
    };

    const res = await client.dataTransfer('VendorX', 'MSG1', 'hello');
    expect(res.status).toBe('Accepted');
    expect(res.data).toBe('hello');
  });

  it('faults connector and stops transaction with Error reason', async () => {
    const client = createClient() as any;
    let stopReason: string | undefined;

    client.safeCall = async (action: string, payload: any) => {
      if (action === 'StopTransaction') stopReason = payload.reason;
      return undefined;
    };

    await client.localStart(1, 'IDTAG');
    const ok = await client.setConnectorError(1, 'OverCurrentFailure');
    expect(ok).toBe(true);

    const state = client.getStateAll()[0];
    expect(state.state).toBe('Faulted');
    expect(state.errorCode).toBe('OverCurrentFailure');
    expect(stopReason).toBe('Error');
  });

  it('clears fault back to Available', async () => {
    const client = createClient() as any;
    await client.setConnectorError(1, 'OtherError');
    await client.setConnectorError(1, 'NoError');

    const state = client.getStateAll()[0];
    expect(state.state).toBe('Available');
    expect(state.errorCode).toBe('NoError');
  });

  it('reboots after firmware install when profile requires it', async () => {
    const profile: BrandProfile = {
      name: 'alfen',
      allowedActions: [],
      config: { mode: 'strict', allowedKeys: [] },
      firmware: { rebootAfterInstall: true },
      supportedProfiles: ['Core']
    };

    const client = new OcppClient(
      'EVSE-FW',
      {
        chargeBoxSerialNumber: 'EVSE-FW',
        chargePointModel: 'MODEL',
        chargePointSerialNumber: 'EVSE-FW',
        chargePointVendor: 'VENDOR',
        firmwareVersion: '1.0.0'
      },
      'ws://localhost:0/ocpp1.6',
      1,
      profile
    ) as any;

    let rebooted = false;
    client.performReboot = async () => { rebooted = true; };
    client.sendCall = async () => ({ status: 'Accepted' });

    await client.firmwareStatusNotification('Installed');
    expect(rebooted).toBe(true);
  });

  it('does not reboot after firmware install when profile forbids it', async () => {
    const profile: BrandProfile = {
      name: 'peblar',
      allowedActions: [],
      config: { mode: 'strict', allowedKeys: [] },
      firmware: { rebootAfterInstall: false },
      supportedProfiles: ['Core']
    };

    const client = new OcppClient(
      'EVSE-FW2',
      {
        chargeBoxSerialNumber: 'EVSE-FW2',
        chargePointModel: 'MODEL',
        chargePointSerialNumber: 'EVSE-FW2',
        chargePointVendor: 'VENDOR',
        firmwareVersion: '1.0.0'
      },
      'ws://localhost:0/ocpp1.6',
      1,
      profile
    ) as any;

    let rebooted = false;
    client.performReboot = async () => { rebooted = true; };
    client.sendCall = async () => ({ status: 'Accepted' });

    await client.firmwareStatusNotification('Installed');
    expect(rebooted).toBe(false);
  });

  it('rejects pending requests when disconnecting', async () => {
    const client = createClient() as any;
    const timeout = setTimeout(() => undefined, 10_000);
    const rejectSpy = vi.fn();

    client.pending.set('req-1', {
      action: 'Heartbeat',
      timeout,
      resolve: vi.fn(),
      reject: rejectSpy,
    });

    await client.disconnectWs();

    expect(rejectSpy).toHaveBeenCalledTimes(1);
    expect(client.pending.size).toBe(0);
    clearTimeout(timeout);
  });

  it('schedules reconnect with bounded backoff delay', () => {
    const client = createClient() as any;
    const timeoutSpy = vi
      .spyOn(global, 'setTimeout')
      .mockImplementation((handler: any) => {
        return 1 as any;
      });

    client.reconnect();

    expect(client.reconnectAttempts).toBe(1);
    expect(timeoutSpy).toHaveBeenCalled();
    const reconnectDelay = timeoutSpy.mock.calls[0]?.[1] as number;

    expect(reconnectDelay).toBeGreaterThanOrEqual(1600);
    expect(reconnectDelay).toBeLessThanOrEqual(2400);

    timeoutSpy.mockRestore();
  });

  it('validates firmware update payloads', () => {
    const client = createClient() as any;

    const missing = client.applyUpdateFirmware({ location: '', retrieveDate: '' });
    expect(missing.status).toBe('Rejected');

    const invalidDate = client.applyUpdateFirmware({
      location: 'https://example.com/fw-1.0.0.fwi',
      retrieveDate: 'not-a-date',
      checksum: 'sha256:abcd1234efgh5678',
    });
    expect(invalidDate.status).toBe('Rejected');
  });

  it('enforces NG9xx staged update path for 4.12 and lower', () => {
    const client = createClientWithFirmware('4.12.0') as any;

    const skipped = client.applyUpdateFirmware({
      location: 'https://example.com/NG9xx-7.3.0.fwi',
      retrieveDate: new Date().toISOString(),
      checksum: 'sha256:abcd1234efgh5678',
      version: '7.3.0'
    });
    expect(skipped.status).toBe('Rejected');

    const step1 = client.applyUpdateFirmware({
      location: 'https://example.com/NG9xx-5.6.1-4381-A.fwi',
      retrieveDate: new Date().toISOString(),
      checksum: 'sha256:abcd1234efgh5678',
      version: '5.6.1'
    });
    expect(step1.status).toBe('Accepted');
  });

  it('enforces NG9xx staged update path for 5.6.1 to 6.x', () => {
    const client = createClientWithFirmware('5.6.1') as any;

    const wrong = client.applyUpdateFirmware({
      location: 'https://example.com/NG9xx-7.3.0.fwi',
      retrieveDate: new Date().toISOString(),
      checksum: 'sha256:abcd1234efgh5678',
      version: '7.3.0'
    });
    expect(wrong.status).toBe('Rejected');

    const step = client.applyUpdateFirmware({
      location: 'https://example.com/NG9xx-6.6.2-4351-BL-upgrade-B.fwi',
      retrieveDate: new Date().toISOString(),
      checksum: 'sha256:abcd1234efgh5678',
      version: '6.6.2'
    });
    expect(step.status).toBe('Accepted');

    const altNameClient = createClientWithFirmware('5.6.1') as any;
    const stepAltName = altNameClient.applyUpdateFirmware({
      location: 'https://example.com/NG9xx-6.6.2-4351-BL_upgrade.zip',
      retrieveDate: new Date().toISOString(),
      checksum: 'sha256:abcd1234efgh5678',
      version: '6.6.2'
    });
    expect(stepAltName.status).toBe('Accepted');
  });

  it('handles trigger message validation and unsupported message', async () => {
    const client = createClient() as any;

    const missing = await client.applyTriggerMessage({ requestedMessage: '' });
    expect(missing.status).toBe('Rejected');

    const unsupported = await client.applyTriggerMessage({ requestedMessage: 'UnknownMessage' });
    expect(unsupported.status).toBe('Rejected');
  });

  it('applies strict configuration rules and readonly rejection', () => {
    const profile: BrandProfile = {
      name: 'alfen',
      allowedActions: [],
      config: { mode: 'strict', allowedKeys: ['SupportedProfiles', 'HeartbeatInterval'] },
      firmware: { rebootAfterInstall: true },
      supportedProfiles: ['Core', 'Diagnostics']
    };

    const client = new OcppClient(
      'EVSE-CONF',
      {
        chargeBoxSerialNumber: 'EVSE-CONF',
        chargePointModel: 'MODEL',
        chargePointSerialNumber: 'EVSE-CONF',
        chargePointVendor: 'VENDOR',
        firmwareVersion: '1.0.0'
      },
      'ws://localhost:0/ocpp1.6',
      1,
      profile
    ) as any;

    const cfg = client.applyGetConfiguration({ key: ['SupportedProfiles', 'UnknownKey'] });
    expect(cfg.configurationKey.some((entry: any) => entry.key === 'SupportedProfiles')).toBe(true);
    expect(cfg.unknownKey).toContain('UnknownKey');

    const readonlyReject = client.applyChangeConfiguration({ key: 'SupportedProfiles', value: 'Core' });
    expect(readonlyReject.status).toBe('Rejected');

    const accepted = client.applyChangeConfiguration({ key: 'HeartbeatInterval', value: '15' });
    expect(accepted.status).toBe('Accepted');
  });

  it('supports PW-SetChargerPassword with old:new value format', () => {
    const client = createClient() as any;

    const firstSet = client.applyChangeConfiguration({ key: 'PW-SetChargerPassword', value: ':Secret1234' });
    expect(firstSet.status).toBe('Accepted');

    const wrongOld = client.applyChangeConfiguration({ key: 'PW-SetChargerPassword', value: 'WrongOld:Secret5678' });
    expect(wrongOld.status).toBe('Rejected');

    const changed = client.applyChangeConfiguration({ key: 'PW-SetChargerPassword', value: 'Secret1234:Secret5678' });
    expect(changed.status).toBe('Accepted');

    const changedWithComma = client.applyChangeConfiguration({ key: 'PW-SetChargerPassword', value: 'Secret5678,Secret9999' });
    expect(changedWithComma.status).toBe('Accepted');
  });

  it('rejects invalid PW-SetChargerPassword payload format', () => {
    const client = createClient() as any;

    const missingSeparator = client.applyChangeConfiguration({ key: 'PW-SetChargerPassword', value: 'invalid-format' });
    expect(missingSeparator.status).toBe('Rejected');

    const emptyNewPassword = client.applyChangeConfiguration({ key: 'PW-SetChargerPassword', value: 'old:' });
    expect(emptyNewPassword.status).toBe('Rejected');
  });

  it('requires setup-seeded password as old password for PW-SetChargerPassword', () => {
    const client = createClient() as any;
    client.setChargerPassword('SetupPass123');

    const wrongOld = client.applyChangeConfiguration({ key: 'PW-SetChargerPassword', value: 'Wrong:NewPass123' });
    expect(wrongOld.status).toBe('Rejected');

    const correctOld = client.applyChangeConfiguration({ key: 'PW-SetChargerPassword', value: 'SetupPass123:NewPass123' });
    expect(correctOld.status).toBe('Accepted');
  });

  it('rejects remote start/stop for invalid connector and transaction', async () => {
    const client = createClient() as any;

    const remoteStart = await client.applyRemoteStart({ connectorId: 99, idTag: 'TAG' });
    expect(remoteStart.status).toBe('Rejected');

    const remoteStop = await client.applyRemoteStop({ connectorId: 1 });
    expect(remoteStop.status).toBe('Rejected');
  });

  it('applies connector availability changes and rejects unknown connector', () => {
    const client = createClient() as any;

    const single = client.applyChangeAvailability({ connectorId: 1, type: 'Inoperative' });
    expect(single.status).toBe('Accepted');

    const all = client.applyChangeAvailability({ connectorId: 0, type: 'Operative' });
    expect(all.status).toBe('Accepted');

    const reject = client.applyChangeAvailability({ connectorId: 99, type: 'Operative' });
    expect(reject.status).toBe('Rejected');
  });

  it('handles meter value error branches', async () => {
    const client = createClient();
    await expect(client.sendMeterValues(99)).rejects.toThrow('connector_not_found');
    await expect(client.sendMeterValues(1)).rejects.toThrow('transaction_not_found');
  });

  it('applies unlock connector branches and reset acceptance', async () => {
    const client = createClient() as any;

    const fail = client.applyUnlockConnector({ connectorId: 99 });
    expect(fail.status).toBe('UnlockFailed');

    await client.localStart(1, 'IDTAG');
    const success = client.applyUnlockConnector({ connectorId: 1 });
    expect(success.status).toBe('Unlocked');

    const reset = await client.applyReset({ type: 'Hard' });
    expect(reset.status).toBe('Accepted');
  });

  it('supports trigger message accepted variants through public API', async () => {
    const client = createClient() as any;
    client.sendHeartbeat = vi.fn(async () => ({ status: 'Accepted' }));
    client.sendBootNotification = vi.fn(async () => ({ status: 'Accepted' }));
    client.sendStatusNotification = vi.fn(async () => ({ status: 'Accepted' }));
    client.sendMeterValues = vi.fn(async () => ({ status: 'Accepted' }));
    client.diagnosticsStatusNotification = vi.fn(async () => ({ status: 'Accepted' }));
    client.firmwareStatusNotification = vi.fn(async () => ({ status: 'Accepted' }));

    expect((await client.applyTriggerMessage({ requestedMessage: 'Heartbeat' })).status).toBe('Accepted');
    expect((await client.applyTriggerMessage({ requestedMessage: 'BootNotification' })).status).toBe('Accepted');
    expect((await client.applyTriggerMessage({ requestedMessage: 'StatusNotification', connectorId: 1 })).status).toBe('Accepted');
    expect((await client.applyTriggerMessage({ requestedMessage: 'MeterValues', connectorId: 1 })).status).toBe('Accepted');
    expect((await client.applyTriggerMessage({ requestedMessage: 'DiagnosticsStatusNotification' })).status).toBe('Accepted');
    expect((await client.applyTriggerMessage({ requestedMessage: 'FirmwareStatusNotification' })).status).toBe('Accepted');

    expect(client.sendHeartbeat).toHaveBeenCalled();
    expect(client.sendBootNotification).toHaveBeenCalled();
    expect(client.sendStatusNotification).toHaveBeenCalled();
    expect(client.sendMeterValues).toHaveBeenCalled();
    expect(client.diagnosticsStatusNotification).toHaveBeenCalled();
    expect(client.firmwareStatusNotification).toHaveBeenCalled();
  });

  it('covers reserve/cancel reservation branches via incoming frames', async () => {
    const client = createClient() as any;
    const sentFrames: any[] = [];

    client.rawSend = (frame: any[]) => {
      sentFrames.push(frame);
    };
    client.safeCall = async () => undefined;

    await client.handleIncoming(JSON.stringify([2, 'r1', 'ReserveNow', {}]));
    await client.handleIncoming(JSON.stringify([2, 'r2', 'ReserveNow', { connectorId: 999, expiryDate: new Date(Date.now() + 60000).toISOString(), idTag: 'IDTAG', reservationId: 7 }]));
    await client.handleIncoming(JSON.stringify([2, 'r3', 'ReserveNow', { connectorId: 1, expiryDate: 'bad-date', idTag: 'IDTAG', reservationId: 8 }]));
    await client.handleIncoming(JSON.stringify([2, 'r4', 'ReserveNow', { connectorId: 1, expiryDate: new Date(Date.now() + 60000).toISOString(), idTag: 'IDTAG', reservationId: 9 }]));
    await client.handleIncoming(JSON.stringify([2, 'r5', 'CancelReservation', {}]));
    await client.handleIncoming(JSON.stringify([2, 'r6', 'CancelReservation', { reservationId: 9999 }]));
    await client.handleIncoming(JSON.stringify([2, 'r7', 'CancelReservation', { reservationId: 9 }]));

    expect(sentFrames.length).toBeGreaterThanOrEqual(7);
  });

  it('handles remote stop by transaction id and utility helper branches', async () => {
    const client = createClient() as any;

    const noTx = await client.applyRemoteStop({ transactionId: 12345 });
    expect(noTx.status).toBe('Rejected');

    await client.localStart(1, 'IDTAG');
    const txId = client.getTransactionId();
    expect(typeof txId).toBe('number');

    const acceptedStop = await client.applyRemoteStop({ transactionId: txId });
    expect(acceptedStop.status).toBe('Accepted');

    const defaultPower = client.getPower();
    client.setPower(0, -1);
    expect(client.getPower()).toEqual(defaultPower);
  });

  it('returns Rejected when authorize sendCall throws', async () => {
    const client = createClient() as any;
    client.sendCall = async (action: string) => {
      if (action === 'Authorize') {
        throw new Error('authorize failure');
      }
      return { status: 'Accepted' };
    };

    const status = await client.authorize('TAG-FAIL');
    expect(status).toBe('Rejected');
  });

  it('applies diagnostics command and validates payload', async () => {
    vi.useFakeTimers();
    const client = createClient() as any;
    const diagnosticsSpy = vi.fn(async (_status: string) => ({ status: 'Accepted' }));
    client.diagnosticsStatusNotification = diagnosticsSpy;

    const missing = client.applyGetDiagnostics({});
    expect(missing.status).toBe('Rejected');

    const accepted = client.applyGetDiagnostics({ location: 'https://example.com/upload' });
    expect(accepted.status).toBe('Accepted');
    expect(typeof accepted.fileName).toBe('string');

    const invalidUrl = client.applyGetDiagnostics({ location: 'not-a-url' });
    expect(invalidUrl.status).toBe('Rejected');

    const retried = client.applyGetDiagnostics({
      location: 'https://example.com/upload',
      retries: 1,
      retryInterval: 1,
    });
    expect(retried.status).toBe('Accepted');

    await vi.advanceTimersByTimeAsync(1300);
    const statuses = diagnosticsSpy.mock.calls.map(call => call[0]);
    expect(statuses).toContain('Uploaded');
    expect(statuses).toContain('UploadFailed');
    vi.useRealTimers();
  });

  it('enforces reservation idTag on start and supports cancel/expiry checks', async () => {
    const client = createClient() as any;
    client.safeCall = async () => undefined;

    const reserve = client.applyReserveNow({
      connectorId: 1,
      expiryDate: new Date(Date.now() + 60000).toISOString(),
      idTag: 'RESERVED_TAG',
      reservationId: 55,
    });
    expect(reserve.status).toBe('Accepted');

    const blocked = await client.applyRemoteStart({ connectorId: 1, idTag: 'OTHER_TAG' });
    expect(blocked.status).toBe('Rejected');

    const occupied = client.applyReserveNow({
      connectorId: 1,
      expiryDate: new Date(Date.now() + 60000).toISOString(),
      idTag: 'ANOTHER_TAG',
      reservationId: 99,
    });
    expect(occupied.status).toBe('Occupied');

    const accepted = await client.applyRemoteStart({ connectorId: 1, idTag: 'RESERVED_TAG' });
    expect(accepted.status).toBe('Accepted');

    const stopped = await client.applyRemoteStop({ connectorId: 1 });
    expect(stopped.status).toBe('Accepted');

    const cancelMissing = client.applyCancelReservation({});
    expect(cancelMissing.status).toBe('Rejected');

    const cancelUnknown = client.applyCancelReservation({ reservationId: 999 });
    expect(cancelUnknown.status).toBe('Rejected');

    const expired = client.applyReserveNow({
      connectorId: 1,
      expiryDate: new Date(Date.now() - 1000).toISOString(),
      idTag: 'TAG',
      reservationId: 56,
    });
    expect(expired.status).toBe('Rejected');
  });

  it('handles incoming frame edge cases and CS command dispatch paths', async () => {
    const profile: BrandProfile = {
      name: 'limited',
      allowedActions: [
        'GetConfiguration',
        'ChangeConfiguration',
        'ChangeAvailability',
        'ClearCache',
        'RemoteStartTransaction',
        'RemoteStopTransaction',
        'Reset',
        'UnlockConnector',
        'UpdateFirmware',
        'GetDiagnostics',
        'TriggerMessage',
        'ReserveNow',
        'CancelReservation'
      ],
      config: { mode: 'strict', allowedKeys: ['HeartbeatInterval'] },
      firmware: { rebootAfterInstall: false },
      supportedProfiles: ['Core']
    };

    const client = new OcppClient(
      'EVSE-HANDLE',
      {
        chargeBoxSerialNumber: 'EVSE-HANDLE',
        chargePointModel: 'MODEL',
        chargePointSerialNumber: 'EVSE-HANDLE',
        chargePointVendor: 'VENDOR',
        firmwareVersion: '1.0.0'
      },
      'ws://localhost:0/ocpp1.6',
      1,
      profile
    ) as any;

    const sentFrames: any[] = [];
    client.rawSend = (frame: any[]) => { sentFrames.push(frame); };
    client.safeCall = async () => undefined;
    client.sendCall = async (action: string) => {
      if (action === 'Authorize') return { idTagInfo: { status: 'Accepted' } };
      if (action === 'StartTransaction') return { transactionId: 77 };
      return { status: 'Accepted' };
    };

    await client.handleIncoming('{invalid json');
    await client.handleIncoming(JSON.stringify({ foo: 'bar' }));

    const pendingResolve = vi.fn();
    const pendingReject = vi.fn();
    const timeout = setTimeout(() => undefined, 1000);
    client.pending.set('pending-1', {
      action: 'Heartbeat',
      timeout,
      resolve: pendingResolve,
      reject: pendingReject,
    });

    await client.handleIncoming(JSON.stringify([3, 'pending-1', { ok: true }]));
    expect(pendingResolve).toHaveBeenCalled();
    clearTimeout(timeout);

    const timeout2 = setTimeout(() => undefined, 1000);
    client.pending.set('pending-2', {
      action: 'Heartbeat',
      timeout: timeout2,
      resolve: vi.fn(),
      reject: pendingReject,
    });
    await client.handleIncoming(JSON.stringify([4, 'pending-2', 'InternalError', 'boom', {}]));
    expect(pendingReject).toHaveBeenCalled();
    clearTimeout(timeout2);

    await client.handleIncoming(JSON.stringify([2, 'u1', 123, {}]));
    await client.handleIncoming(JSON.stringify([2, 'u2', 'RemoteStartTransaction', {}]));
    await client.handleIncoming(JSON.stringify([2, 'u3', 'ClearCache', {}]));
    await client.handleIncoming(JSON.stringify([2, 'u4', 'GetConfiguration', { key: ['HeartbeatInterval'] }]));
    await client.handleIncoming(JSON.stringify([2, 'u5', 'ChangeConfiguration', { key: 'HeartbeatInterval', value: '20' }]));
    await client.handleIncoming(JSON.stringify([2, 'u6', 'ChangeAvailability', { connectorId: 0, type: 'Operative' }]));
    await client.handleIncoming(JSON.stringify([2, 'u7', 'RemoteStartTransaction', { connectorId: 1, idTag: 'TAG' }]));
    await client.handleIncoming(JSON.stringify([2, 'u8', 'RemoteStopTransaction', { connectorId: 1 }]));
    await client.handleIncoming(JSON.stringify([2, 'u9', 'UnlockConnector', { connectorId: 1 }]));
    await client.handleIncoming(JSON.stringify([2, 'u10', 'UpdateFirmware', {
      location: 'https://example.com/fw-9.9.9.fwi',
      retrieveDate: new Date().toISOString(),
      checksum: 'sha256:ffffeeee11112222',
      version: '9.9.9'
    }]));
    await client.handleIncoming(JSON.stringify([2, 'u11', 'GetDiagnostics', { location: 'https://example.com' }]));
    await client.handleIncoming(JSON.stringify([2, 'u12', 'TriggerMessage', { requestedMessage: 'Heartbeat' }]));
    await client.handleIncoming(JSON.stringify([2, 'u13', 'ReserveNow', { connectorId: 1, expiryDate: new Date(Date.now() + 60000).toISOString(), idTag: 'IDTAG', reservationId: 1 }]));
    await client.handleIncoming(JSON.stringify([2, 'u14', 'CancelReservation', { reservationId: 1 }]));
    await client.handleIncoming(JSON.stringify([2, 'u15', 'UnknownAction', {}]));

    expect(sentFrames.length).toBeGreaterThan(8);
  });
});
