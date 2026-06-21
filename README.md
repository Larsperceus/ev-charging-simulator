# ev-charging-simulator

OCPP 1.6 charging station simulator. Use it as a library in tests, or run it as a standalone server.

[![Tests](https://github.com/larsperceus/ev-charging-simulator/actions/workflows/test.yml/badge.svg)](https://github.com/larsperceus/ev-charging-simulator/actions/workflows/test.yml)
[![npm version](https://img.shields.io/npm/v/ev-charging-simulator.svg)](https://www.npmjs.com/package/ev-charging-simulator)
[![License](https://img.shields.io/npm/l/ev-charging-simulator.svg)](LICENSE)

---

## Installation

```bash
npm install ev-charging-simulator
```

Requires Node.js 20 or later.

---

## Quick start

```typescript
import { Charger } from 'ev-charging-simulator';

const charger = new Charger({
  evseId: 'EVSE-001',
  csmsUrl: 'ws://localhost:9000/ocpp1.6',
});

await charger.connect();
console.log(charger.isConnected()); // true

await charger.shutdown();
```

---

## API

### `new Charger(properties, options?)`

```typescript
type ChargerProperties = {
  evseId: string;           // required, unique identifier sent in BootNotification
  csmsUrl?: string;         // OCPP WebSocket endpoint (falls back to options.csmsUrl, then CSMS_URL env, then ws://localhost:9000/ocpp1.6)
  connectors?: number;      // number of connectors (default: 1)
  power?: { amps: number; volts: number };
  boot?: Partial<BootOptions>;
  brand?: string;           // brand profile name for vendor-specific behaviour
};

type ChargerOptions = {
  csmsUrl?: string;
  connectors?: number;
  bootOverrides?: Partial<BootOptions>;
  brandProfile?: BrandProfile | null;
  chargerPassword?: string;
};

type BootOptions = {
  chargeBoxSerialNumber: string;
  chargePointModel: string;
  chargePointSerialNumber: string;
  chargePointVendor: string;
  firmwareVersion: string;
};
```

Properties on the constructor take precedence over options for fields that appear in both.

---

### Instance methods

#### `connect(): Promise<void>`

Opens the WebSocket, sends `BootNotification`, and waits for the CSMS to accept it. Resolves once the charger is ready. Rejects if the WebSocket cannot connect or if the boot is rejected.

```typescript
await charger.connect();
```

The charger will automatically reconnect on disconnect (exponential backoff, 2 s to 30 s). Call `shutdown()` to stop reconnection.

#### `disconnect(): Promise<void>`

Closes the WebSocket without preventing reconnection. The charger will reconnect on the next attempt. Use `shutdown()` if you want to stop it permanently.

#### `reconnect(): Promise<void>`

Forces a reconnection attempt immediately.

#### `shutdown(): Promise<void>`

Stops all timers, cancels all pending OCPP requests, and closes the WebSocket. Does not reconnect. Call this in `afterEach` / `afterAll` to avoid open handles in tests.

#### `isConnected(): boolean`

Returns `true` if the WebSocket is open and the `BootNotification` was accepted.

#### `getState(): ConnectorState`

Returns the current station-level connector state.

```typescript
enum ConnectorState {
  Unavailable = 'Unavailable',
  Available   = 'Available',
  Preparing   = 'Preparing',
  Charging    = 'Charging',
  Finishing   = 'Finishing',
  Faulted     = 'Faulted',
}
```

#### `setStatus(status: ConnectorState, connectorId?: number): Promise<void>`

Sends a `StatusNotification` to the CSMS and updates the internal state. `connectorId` defaults to `1`. If the connector has an active transaction and the new state is not `Charging`, the transaction is stopped first.

```typescript
await charger.setStatus(ConnectorState.Available);
await charger.setStatus(ConnectorState.Faulted, 2);
```

#### `localStart(connectorId?: number, idTag?: string): Promise<LocalStartResult>`

Simulates a local (RFID/button) start: sends `Authorize`, then `StartTransaction`.

- `connectorId` defaults to `1`
- `idTag` defaults to `'LOCALTAG'`

```typescript
type LocalStartResult =
  | { ok: true; transactionId: number | null }
  | { ok: false; reason: 'not_connected' | 'connector_not_found' | 'already_charging' | 'reservation_conflict' | 'authorize_rejected' };
```

```typescript
const result = await charger.localStart(1, 'RFID-ABC');
if (!result.ok) {
  console.error(result.reason);
}
```

#### `stopConnector(connectorId?: number): Promise<LocalStopResult>`

Sends `StopTransaction` and transitions the connector back to `Available`.

- `connectorId` defaults to `1`

```typescript
type LocalStopResult =
  | { ok: true }
  | { ok: false; reason: 'connector_not_found' | 'no_active_transaction' };
```

#### `getPower(): { amps: number; volts: number; watts: number }`

Returns the current power model. Watts is derived (`amps * volts`).

#### `setPower(amps?: number, volts?: number): void`

Updates the power model used for meter value calculations. Pass only the fields you want to change.

#### `snapshot(): ChargerSnapshot`

Returns a point-in-time copy of the charger state.

```typescript
type ChargerSnapshot = {
  evseId: string;
  csmsUrl: string;
  connectors: number;
  connected: boolean;
  state: ConnectorState;
  firmwareVersion: string;
  power: { amps: number; volts: number; watts: number };
};
```

#### `getClient(): OcppClient`

Returns the underlying `OcppClient`. Useful for lower-level control in tests (e.g. `authorize()`, `dataTransfer()`, `sendMeterValues()`).

---

### `createChargers(propertiesList, options?): Charger[]`

Creates multiple chargers from an array of properties objects. All chargers share the same `options`.

```typescript
import { createChargers } from 'ev-charging-simulator';

const chargers = createChargers([
  { evseId: 'EVSE-001', power: { amps: 32, volts: 230 } },
  { evseId: 'EVSE-002', power: { amps: 16, volts: 230 } },
], { csmsUrl: 'ws://localhost:9000/ocpp1.6' });

await Promise.all(chargers.map(c => c.connect()));
```

---

### `loadChargersFromConfig(source?, options?): Promise<Charger[]>`

Loads charger definitions from a JSON file path, an object, or an array, and returns connected-ready `Charger` instances.

```typescript
import { loadChargersFromConfig } from 'ev-charging-simulator';

const chargers = await loadChargersFromConfig('./evse-config.json', {
  csmsUrl: 'ws://localhost:9000/ocpp1.6',
});
```

Config file format:

```json
{
  "evses": [
    {
      "evseId": "EVSE-001",
      "connectors": 2,
      "power": { "amps": 32, "volts": 230 },
      "boot": {
        "chargePointVendor": "Acme",
        "chargePointModel": "FastCharger",
        "firmwareVersion": "2.1.0"
      }
    }
  ]
}
```

`loadChargersFromConfig` accepts the same `ChargerFleetLoadOptions` as the charger constructor options, plus `bootTemplate` (applied before per-charger `boot`) and `bootOverrides` (applied after).

---

### Traffic observer

Every OCPP frame sent and received is emitted on `trafficBus`. This lets you inspect raw traffic without a proxy.

```typescript
import { trafficBus } from 'ev-charging-simulator';
import type { TrafficEvent } from 'ev-charging-simulator';

trafficBus.on('message', (event: TrafficEvent) => {
  console.log(event.dir, event.action, event.evseId);
});
```

```typescript
type TrafficEvent = {
  ts: string;          // ISO timestamp
  evseId: string;
  dir: 'send' | 'recv';
  msgType: 2 | 3 | 4; // CALL / CALLRESULT / CALLERROR
  action?: string;     // present on CALL frames
  msgId: string;
  payload: Record<string, unknown>;
};
```

---

## Framework integration

### Playwright

Use a [fixture](https://playwright.dev/docs/test-fixtures) so each test gets a fresh charger that is automatically shut down.

```typescript
// fixtures.ts
import { test as base } from '@playwright/test';
import { Charger } from 'ev-charging-simulator';

type Fixtures = {
  charger: Charger;
};

export const test = base.extend<Fixtures>({
  charger: async ({}, use) => {
    const charger = new Charger({
      evseId: `TEST-${Date.now()}`,
      csmsUrl: process.env.CSMS_URL ?? 'ws://localhost:9000/ocpp1.6',
    });
    await charger.connect();
    await use(charger);
    await charger.shutdown();
  },
});

export { expect } from '@playwright/test';
```

```typescript
// charging.spec.ts
import { test, expect } from './fixtures';
import { ConnectorState } from 'ev-charging-simulator';

test('CSMS shows charger as available after boot', async ({ page, charger }) => {
  await page.goto('/dashboard');
  await expect(page.getByTestId(`charger-${charger.evseId}`)).toHaveText('Available');
});

test('CSMS shows active transaction', async ({ page, charger }) => {
  const result = await charger.localStart(1, 'RFID-001');
  expect(result.ok).toBe(true);

  await page.goto('/dashboard');
  await expect(page.getByTestId(`charger-${charger.evseId}`)).toHaveText('Charging');
});
```

If you need multiple chargers per test, parametrize the fixture or create a fleet fixture:

```typescript
// fixtures.ts (fleet variant)
import { test as base } from '@playwright/test';
import { createChargers, type Charger } from 'ev-charging-simulator';

type Fixtures = {
  chargerFleet: Charger[];
};

export const test = base.extend<Fixtures>({
  chargerFleet: async ({}, use) => {
    const chargers = createChargers(
      [{ evseId: 'FLEET-001' }, { evseId: 'FLEET-002' }, { evseId: 'FLEET-003' }],
      { csmsUrl: process.env.CSMS_URL ?? 'ws://localhost:9000/ocpp1.6' },
    );
    await Promise.all(chargers.map(c => c.connect()));
    await use(chargers);
    await Promise.all(chargers.map(c => c.shutdown()));
  },
});
```

---

### Vitest

```typescript
// charger.test.ts
import { beforeEach, afterEach, describe, it, expect } from 'vitest';
import { Charger, ConnectorState } from 'ev-charging-simulator';

describe('charging flow', () => {
  let charger: Charger;

  beforeEach(async () => {
    charger = new Charger({
      evseId: 'TEST-001',
      csmsUrl: 'ws://localhost:9000/ocpp1.6',
    });
    await charger.connect();
  });

  afterEach(async () => {
    await charger.shutdown();
  });

  it('starts in Available state', () => {
    expect(charger.getState()).toBe(ConnectorState.Available);
  });

  it('transitions to Charging after localStart', async () => {
    const result = await charger.localStart(1, 'RFID-001');
    expect(result.ok).toBe(true);
    expect(charger.getState()).toBe(ConnectorState.Charging);
  });

  it('returns to Available after stopConnector', async () => {
    await charger.localStart(1, 'RFID-001');
    const result = await charger.stopConnector(1);
    expect(result.ok).toBe(true);
    expect(charger.getState()).toBe(ConnectorState.Available);
  });
});
```

For shared setup across a suite, use `beforeAll` / `afterAll` — but note that state from one test will carry over to the next.

```typescript
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { Charger } from 'ev-charging-simulator';

describe('long-running suite', () => {
  let charger: Charger;

  beforeAll(async () => {
    charger = new Charger({ evseId: 'SHARED-001' });
    await charger.connect();
  });

  afterAll(async () => {
    await charger.shutdown();
  });

  it('...', () => { /* ... */ });
});
```

---

### Jest

```typescript
// charger.test.ts
import { Charger, ConnectorState } from 'ev-charging-simulator';

let charger: Charger;

beforeEach(async () => {
  charger = new Charger({
    evseId: 'TEST-001',
    csmsUrl: 'ws://localhost:9000/ocpp1.6',
  });
  await charger.connect();
});

afterEach(async () => {
  await charger.shutdown();
});

test('transitions to Charging after localStart', async () => {
  const result = await charger.localStart(1, 'RFID-001');
  expect(result.ok).toBe(true);
  expect(charger.getState()).toBe(ConnectorState.Charging);
});
```

If you use Jest with ESM, add the following to `jest.config.js`:

```js
export default {
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { useESM: true }],
  },
};
```

---

### Node.js built-in test runner

```typescript
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Charger, ConnectorState } from 'ev-charging-simulator';

describe('charger', () => {
  let charger: Charger;

  before(async () => {
    charger = new Charger({ evseId: 'TEST-001' });
    await charger.connect();
  });

  after(async () => {
    await charger.shutdown();
  });

  it('starts in Available state', () => {
    assert.equal(charger.getState(), ConnectorState.Available);
  });
});
```

---

## Inspecting OCPP traffic in tests

Subscribe to `trafficBus` before calling connect, then assert on the frames you care about.

```typescript
import { Charger, trafficBus, type TrafficEvent } from 'ev-charging-simulator';

const frames: TrafficEvent[] = [];
trafficBus.on('message', e => frames.push(e));

const charger = new Charger({ evseId: 'TRAFFIC-001' });
await charger.connect();
await charger.localStart();

const startTx = frames.find(f => f.action === 'StartTransaction' && f.dir === 'send');
console.log(startTx?.payload);
// { connectorId: 1, idTag: 'LOCALTAG', meterStart: ..., timestamp: '...' }
```

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `CSMS_URL` | `ws://localhost:9000/ocpp1.6` | Default CSMS endpoint when not set in constructor |
| `ACE_LOGIN_PASSWORD` | _(empty)_ | Password for the ACE compatibility HTTP API |
| `LOG_OCPP_TRAFFIC` | `false` | Set to `true` to log every OCPP frame to stdout |
| `FIRMWARE_ALLOWED_HOSTS` | _(any)_ | Comma-separated list of allowed firmware update hostnames |
| `FIRMWARE_REQUIRE_CHECKSUM` | `true` | Set to `false` to skip firmware update checksum validation |

---

## License

MIT
