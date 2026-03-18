import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFile, writeFile, unlink } from 'fs/promises';
import { resolve } from 'path';
import { loadEvseConfig } from '../evseConfig.js';
import { loadChargersFromConfig, createChargers, type Charger } from '../charger.js';
import { ConnectorState } from '../ocppClient.js';

const configPath = resolve(process.cwd(), 'evse-config.json');
let originalConfig: string | null = null;

beforeAll(async () => {
  try {
    originalConfig = await readFile(configPath, 'utf8');
  } catch {
    originalConfig = null;
  }
});

afterAll(async () => {
  if (originalConfig !== null) {
    await writeFile(configPath, originalConfig, 'utf8');
    return;
  }
  try {
    await unlink(configPath);
  } catch {
    // ignore
  }
});

describe('evse-config.json', () => {
  it('loads detailed evse entries', async () => {
    const config = {
      envs: {
        prod: {
          name: 'Production',
          companies: {
            acme: {
              name: 'Acme Corp',
              locations: {
                'LOC-1': {
                  name: 'HQ',
                  evses: [
                    {
                      evseId: 'EVSE-A',
                      connectors: 2,
                      csmsUrl: 'ws://example.com/ocpp',
                      brand: 'alfen',
                      power: { amps: 20, volts: 200 },
                      boot: {
                        chargePointModel: 'MODEL-A',
                        chargePointVendor: 'VendorA',
                        firmwareVersion: '9.9.9'
                      }
                    },
                    {
                      evseId: 'EVSE-B',
                      connectors: 1,
                      brand: 'peblar',
                      power: { amps: 10, volts: 230 }
                    }
                  ]
                }
              }
            }
          }
        }
      }
    };

    await writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
    const result = await loadEvseConfig();

    expect(result.source).toBe('hierarchical');
    expect(result.entries.length).toBe(2);
    expect(result.entries[0].evseId).toBe('EVSE-A');
    expect(result.entries[0].connectors).toBe(2);
    expect(result.entries[0].csmsUrl).toBe('ws://example.com/ocpp');
    expect(result.entries[0].brand).toBe('alfen');
    expect(result.entries[0].environment?.id).toBe('prod');
    expect(result.entries[0].environment?.name).toBe('Production');
    expect(result.entries[0].company?.id).toBe('acme');
    expect(result.entries[0].company?.name).toBe('Acme Corp');
    expect(result.entries[0].location?.id).toBe('LOC-1');
    expect(result.entries[0].location?.name).toBe('HQ');
    expect(result.entries[0].power?.amps).toBe(20);
    expect(result.entries[0].boot?.chargePointModel).toBe('MODEL-A');
    expect(result.entries[1].evseId).toBe('EVSE-B');
    expect(result.entries[1].brand).toBe('peblar');
  });

  it('loads simple evseIds list', async () => {
    const config = { evseIds: ['EVSE-1', 'EVSE-2'] };
    await writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
    const result = await loadEvseConfig();

    expect(result.source).toBe('simple');
    expect(result.entries.length).toBe(2);
    expect(result.entries[0].evseId).toBe('EVSE-1');
    expect(result.entries[1].evseId).toBe('EVSE-2');
  });

  it('loads includes and merges env/company/location maps', async () => {
    const includePath = resolve(process.cwd(), 'evse-config', 'test-merge-include.json');
    const base = {
      envs: {
        shared: {
          name: 'Shared Base',
          companies: {
            compA: {
              name: 'Company A',
              locations: {
                L1: {
                  name: 'Base Location',
                  evses: [{ evseId: 'EVSE-BASE' }]
                }
              }
            }
          }
        }
      },
      includes: ['evse-config/test-merge-include.json']
    };

    const include = {
      envs: {
        shared: {
          name: 'Shared Include',
          companies: {
            compA: {
              locations: {
                L1: {
                  name: 'Include Location',
                  evses: [{ evseId: 'EVSE-INCLUDE' }]
                }
              }
            }
          }
        }
      }
    };

    await writeFile(includePath, JSON.stringify(include, null, 2), 'utf8');
    await writeFile(configPath, JSON.stringify(base, null, 2), 'utf8');

    const result = await loadEvseConfig();

    expect(result.source).toBe('hierarchical');
    expect(result.entries.map(e => e.evseId)).toEqual(['EVSE-BASE', 'EVSE-INCLUDE']);
    expect(result.entries[0].location?.name).toBe('Include Location');
    expect(result.entries[0].environment?.name).toBe('Shared Include');

    await unlink(includePath);
  });

  it('returns none for malformed json', async () => {
    await writeFile(configPath, '{"evses": [', 'utf8');
    const result = await loadEvseConfig();

    expect(result.source).toBe('none');
    expect(result.entries).toEqual([]);
  });

  it('returns none when required arrays are missing', async () => {
    await writeFile(configPath, JSON.stringify({ foo: 'bar' }, null, 2), 'utf8');
    const result = await loadEvseConfig();

    expect(result.source).toBe('none');
    expect(result.entries).toEqual([]);
  });

  it('returns none when config file is missing', async () => {
    try {
      await unlink(configPath);
    } catch {
      // ignore
    }

    const result = await loadEvseConfig();
    expect(result.source).toBe('none');
    expect(result.entries).toEqual([]);
  });

  it('loads detailed evses array with location map fallback', async () => {
    const config = {
      locations: {
        LOCX: { name: 'Mapped Location' }
      },
      evses: [
        {
          evseId: 'EVSE-D1',
          connectors: 2,
          csmsUrl: 'ws://detailed/ocpp',
          brand: 'alfen',
          locationId: 'LOCX'
        },
        {
          evseId: '   ',
          connectors: 1
        },
        {
          evseId: 'EVSE-D2',
          environment: { id: 'test', name: 'Test' },
          company: { id: 'comp', name: 'Comp' },
          location: { id: 'L2', name: 'Inline Location' }
        }
      ]
    };

    await writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
    const result = await loadEvseConfig();

    expect(result.source).toBe('detailed');
    expect(result.entries.length).toBe(2);
    expect(result.entries[0].evseId).toBe('EVSE-D1');
    expect(result.entries[0].location?.name).toBe('Mapped Location');
    expect(result.entries[1].evseId).toBe('EVSE-D2');
    expect(result.entries[1].location?.name).toBe('Inline Location');
  });

  it('loadChargersFromConfig accepts array input', async () => {
    const chargers = await loadChargersFromConfig([
      { evseId: 'A' },
      { evseId: 'B', connectors: 2, boot: { chargePointModel: 'M', chargePointVendor: 'V', firmwareVersion: '1.0.0' } }
    ]);

    expect(chargers.length).toBe(2);
    expect(chargers[0].snapshot().evseId).toBe('A');
    expect(chargers[1].snapshot().connectors).toBe(2);
  });

  it('loadChargersFromConfig accepts object input and createChargers works', async () => {
    const chargers = await loadChargersFromConfig({ evses: [{ evseId: 'C' }] });

    expect(chargers.length).toBe(1);
    expect(chargers[0].snapshot().evseId).toBe('C');

    const arrayCreated = createChargers([{ evseId: 'D' }]);
    expect(arrayCreated.length).toBe(1);
    expect(arrayCreated[0].snapshot().evseId).toBe('D');
  });

  it('Charger supports setStatus for OCPP state changes', async () => {
    const chargers = await loadChargersFromConfig([{ evseId: 'E' }]);
    expect(chargers[0].getState()).toBe('Unavailable');

    await chargers[0].setStatus(ConnectorState.Available);
    expect(chargers[0].getState()).toBe(ConnectorState.Available);

    await chargers[0].setStatus(ConnectorState.Faulted);
    expect(chargers[0].getState()).toBe('Faulted');
  });
});
