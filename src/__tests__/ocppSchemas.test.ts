import { describe, expect, it } from 'vitest';
import { validateCsCall } from '../ocppSchemas.js';

describe('validateCsCall', () => {
  it('accepts valid RemoteStartTransaction', () => {
    const result = validateCsCall('RemoteStartTransaction', { connectorId: 1, idTag: 'ABC123' });
    expect(result.valid).toBe(true);
  });

  it('rejects invalid RemoteStartTransaction', () => {
    const result = validateCsCall('RemoteStartTransaction', { connectorId: 1 });
    expect(result.valid).toBe(false);
  });

  it('accepts ChangeAvailability for all connectors', () => {
    const result = validateCsCall('ChangeAvailability', { connectorId: 0, type: 'Inoperative' });
    expect(result.valid).toBe(true);
  });

  it('rejects UnlockConnector without connectorId', () => {
    const result = validateCsCall('UnlockConnector', {});
    expect(result.valid).toBe(false);
  });

  it('accepts ChangeConfiguration', () => {
    const result = validateCsCall('ChangeConfiguration', { key: 'HeartbeatInterval', value: '60' });
    expect(result.valid).toBe(true);
  });

  it('rejects RemoteStopTransaction without transactionId or connectorId', () => {
    const result = validateCsCall('RemoteStopTransaction', {});
    expect(result.valid).toBe(false);
  });

  it('accepts Reset payload', () => {
    const result = validateCsCall('Reset', { type: 'Soft' });
    expect(result.valid).toBe(true);
  });

  it('accepts UpdateFirmware payload', () => {
    const result = validateCsCall('UpdateFirmware', { location: 'https://example.com/fw.fwi', retrieveDate: new Date().toISOString() });
    expect(result.valid).toBe(true);
  });

  it('rejects UpdateFirmware without location', () => {
    const result = validateCsCall('UpdateFirmware', { retrieveDate: new Date().toISOString() });
    expect(result.valid).toBe(false);
  });
});
