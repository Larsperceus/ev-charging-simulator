# EV Charging Simulator

A production-ready **OCPP 1.6** charging station simulator library and server for testing and development of EV charging infrastructure.

**Works both as a reusable npm library and as a standalone virtual charger server.**

---

## Status & Badges

[![Tests](https://github.com/larsperceus/ev-charging-simulator/actions/workflows/test.yml/badge.svg)](https://github.com/larsperceus/ev-charging-simulator/actions/workflows/test.yml)
[![npm version](https://img.shields.io/npm/v/ev-charging-simulator.svg)](https://www.npmjs.com/package/ev-charging-simulator)
[![Node.js Version](https://img.shields.io/node/v/ev-charging-simulator.svg)](https://nodejs.org/)
[![License](https://img.shields.io/npm/l/ev-charging-simulator.svg)](LICENSE)
[![codecov](https://codecov.io/gh/larsperceus/ev-charging-simulator/branch/main/graph/badge.svg)](https://codecov.io/gh/larsperceus/ev-charging-simulator)
[![Security Status](https://github.com/larsperceus/ev-charging-simulator/actions/workflows/security.yml/badge.svg)](https://github.com/larsperceus/ev-charging-simulator/actions/workflows/security.yml)

---

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Core Concepts](#core-concepts)
- [API Reference](#api-reference)
- [Usage Examples](#usage-examples)
- [Configuration](#configuration)
- [Error Handling](#error-handling)
- [Troubleshooting](#troubleshooting)
- [Testing](#testing)

---

## Features

✅ **Full OCPP 1.6 Support** — Complete chargepoint-to-CSMS message protocol implementation

✅ **Async/Promise-Based** — Clean async/await API with proper connection lifecycle management

✅ **Production-Ready** — Comprehensive error handling, reconnection logic, and timeout management

✅ **Fleet Management** — Simulate hundreds of chargers from simple config files

✅ **Flexible Configuration** — JSON files, objects, or programmatic setup

✅ **ACE API Compatible** — Optional HTTP compatibility layer for existing integrations

✅ **TypeScript** — Full type safety with exported interfaces and enums

✅ **Tested** — 97+ unit and integration tests with 100% passing coverage

---

## Installation

```bash
npm install ev-charging-simulator
```

Or with yarn:

```bash
yarn add ev-charging-simulator
```

---

## Quick Start

### Minimal Example

```typescript
import { Charger } from 'ev-charging-simulator';

const charger = new Charger({
  evseId: 'EVSE-ANON-1',
  connectors: 1,
  csmsUrl: 'ws://your-csms-server:9000/ocpp1.6',
});

// Connect and authenticate with CSMS
await charger.connect();

console.log(charger.isConnected()); // true

// Gracefully disconnect
await charger.disconnect();
```

### With Full Configuration

```typescript
import { Charger, ConnectorState } from 'ev-charging-simulator';

const charger = new Charger(
  {
    evseId: 'EVSE-DEMO-1',
    connectors: 2,
    csmsUrl: 'ws://localhost:9000/ocpp1.6',
    power: { amps: 32, volts: 230 }, // 7.36 kW
  },
  {
    bootOverrides: {
      chargePointVendor: 'GenericVendor',
      chargePointModel: 'GenericModel',
      firmwareVersion: '1.0.0',
    },
  }
);

// Connect with timeout handling
const connectPromise = charger.connect();
await Promise.race([
  connectPromise,
  new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Connection timeout')), 5000)
  ),
]);

// Simulate connector status changes
await charger.setStatus(ConnectorState.Available, 1);
console.log(charger.getState()); // ConnectorState.Available
```

---

## Core Concepts

### Charger Lifecycle

```typescript
const charger = new Charger({ evseId: 'EVSE-1', connectors: 1 });

// 1. Initialize (constructor only, non-blocking)
// 2. Connect to CSMS
await charger.connect(); // Async: waits for boot notification

// 3. Manage connector states
await charger.setStatus(ConnectorState.Available);
await charger.localStart(1, 'RFID_TAG');
await charger.stopConnector(1);

// 4. Disconnect gracefully
await charger.disconnect();

// 5. Complete shutdown
await charger.shutdown();
```

### Connection States

- **Disconnected** — Not connected to CSMS
- **Connecting** — WebSocket open, boot notification pending
- **Connected** — Boot notification received, ready for transactions
- **Reconnecting** — Auto-reconnect with exponential backoff

### Connector States

```typescript
import { ConnectorState } from 'ev-charging-simulator';

type ConnectorState =
  | 'Available'   // Ready to charge
  | 'Preparing'   // Preparing for transaction
  | 'Charging'    // Active transaction
  | 'Finishing'   // Transaction ending
  | 'Unavailable' // Offline/maintenance
  | 'Faulted';    // Error condition
```

---

## API Reference

### Charger Constructor

```typescript
interface ChargerOptions {
  csmsUrl?: string;                    // CSMS WebSocket URL (env: CSMS_URL)
  connectors?: number;                 // Number of connectors (default: 1)
  bootOverrides?: Partial<BootOptions>; // Override boot notification
  brandProfile?: BrandProfile | null;  // Brand-specific behavior
  chargerPassword?: string;            // ACE API password
}

new Charger(properties: ChargerProperties, options?: ChargerOptions)
```

### Core Methods

#### `async connect(): Promise<void>`

Establishes WebSocket connection and waits for boot notification acceptance.

```typescript
try {
  await charger.connect();
} catch (err) {
  console.error('Failed to connect:', err.message);
}
```

**Behavior:**
- Throws if CSMS is unreachable
- Waits for BootNotification response
- Automatically negotiates heartbeat interval
- Sets up message/ping handlers

#### `async disconnect(): Promise<void>`

Gracefully closes WebSocket connection without state cleanup.

```typescript
await charger.disconnect();
```

#### `async shutdown(): Promise<void>`

Performs full cleanup: stops timers, rejects pending requests, closes connection.

```typescript
await charger.shutdown();
```

#### `async setStatus(status: ConnectorState, connectorId: number = 1): Promise<void>`

Updates connector state and sends StatusNotification to CSMS.

```typescript
await charger.setStatus(ConnectorState.Charging, 1);
```

#### `async localStart(connectorId: number = 1, idTag: string = 'LOCALTAG'): Promise<void>`

Initiates a local/simulated charge transaction.

```typescript
await charger.localStart(1, 'RFID_TAG_123');
```

#### `async stopConnector(connectorId: number = 1): Promise<boolean>`

Stops active transaction on connector.

```typescript
const stopped = await charger.stopConnector(1);
```

#### `isConnected(): boolean`

Check connection status (non-blocking).

```typescript
if (charger.isConnected()) {
  console.log('Connected to CSMS');
}
```

#### `getState(): ConnectorState`

Get current state of default connector (1).

```typescript
const state = charger.getState();
```

#### `snapshot(): ChargerSnapshot`

Get full snapshot of charger state.

```typescript
const {
  evseId,
  connected,
  state,
  power,
  firmwareVersion,
} = charger.snapshot();
```

---

## Usage Examples

### Example 1: Simulate Multiple Chargers from Config

```typescript
import { loadChargersFromConfig } from 'ev-charging-simulator';

// Load from JSON file
const chargers = await loadChargersFromConfig('./chargers.json', {
  csmsUrl: 'ws://localhost:9000/ocpp1.6',
  connectors: 2,
  bootTemplate: {
    chargePointVendor: 'MyVendor',
    chargePointModel: 'MyModel',
  },
});

// Connect all
await Promise.all(chargers.map(c => c.connect()));

console.log(
  `Connected ${chargers.filter(c => c.isConnected()).length}/${chargers.length}`
);

// Example: trigger charging on first charger
await chargers[0].setStatus('Charging', 1);
```

**chargers.json:**

```json
{
  "evses": [
    {
      "evseId": "CHARGER_001",
      "connectors": 2,
      "power": { "amps": 32, "volts": 230 }
    },
    {
      "evseId": "CHARGER_002",
      "connectors": 2,
      "power": { "amps": 16, "volts": 230 }
    }
  ]
}
```

### Example 2: Simulated Charging Flow

```typescript
import { Charger, ConnectorState } from 'ev-charging-simulator';

async function simulateChargingSession(charger: Charger) {
  // Step 1: Available
  await charger.setStatus(ConnectorState.Available, 1);

  // Step 2: RFID card presented → Start transaction
  await charger.localStart(1, 'USER_RFID_123');

  // Step 3: Charging
  await charger.setStatus(ConnectorState.Charging, 1);
  console.log('Charging... [simulating for 5 seconds]');
  await new Promise(r => setTimeout(r, 5000));

  // Step 4: Stop charging
  await charger.stopConnector(1);

  // Step 5: Back to Available
  await charger.setStatus(ConnectorState.Available, 1);
  console.log('Session complete');
}

const charger = new Charger({ evseId: 'DEMO-1', connectors: 1 });
await charger.connect();
await simulateChargingSession(charger);
await charger.shutdown();
```

### Example 3: Error Handling and Reconnection

```typescript
import { Charger } from 'ev-charging-simulator';

const charger = new Charger({
  evseId: 'RESILIENT-1',
  csmsUrl: 'ws://csms.example.com:9000/ocpp1.6',
});

// Connect with timeout
try {
  const timeoutPromise = new Promise<void>((_, reject) =>
    setTimeout(() => reject(new Error('Connection timeout')), 10000)
  );
  await Promise.race([charger.connect(), timeoutPromise]);
  console.log('Connected!');
} catch (err) {
  console.error('Connection failed:', err.message);
  process.exit(1);
}

// Monitor connectivity
const checkConnection = setInterval(() => {
  const status = charger.isConnected() ? 'OK' : 'DISCONNECTED';
  console.log(`[${new Date().toISOString()}] Status: ${status}`);
}, 30000);

// Graceful shutdown
process.on('SIGINT', async () => {
  clearInterval(checkConnection);
  await charger.shutdown();
  process.exit(0);
});
```

---

## Configuration

### Via Environment Variables

```bash
export CSMS_URL=ws://csms.example.com:9000/ocpp1.6
export ACE_LOGIN_PASSWORD=super_secret_123
```

### Via Configuration File

**evse-config.json:**

```json
{
  "evses": [
    {
      "evseId": "CHARGER-A",
      "connectors": 2,
      "csmsUrl": "ws://localhost:9000/ocpp1.6",
      "power": { "amps": 32, "volts": 230 },
      "boot": {
        "chargePointVendor": "GenericVendor",
        "chargePointModel": "GenericModel",
        "firmwareVersion": "1.0.0"
      },
      "location": {
        "id": "LOC_001",
        "name": "Downtown Station"
      }
    }
  ]
}
```

### Programmatically

```typescript
const chargers = [
  {
    evseId: 'CHARGER-1',
    connectors: 1,
    csmsUrl: 'ws://localhost:9000/ocpp1.6',
    power: { amps: 16, volts: 230 },
  },
];

const instances = createChargers(chargers);
```

---

## Error Handling

### Connection Errors

```typescript
try {
  await charger.connect();
} catch (err) {
  if (err.message.includes('timeout')) {
    console.error('CSMS took too long to respond');
  } else if (err.message.includes('refused')) {
    console.error('CSMS is not accepting connections');
  } else {
    console.error('Unexpected error:', err.message);
  }
}
```

### Transaction Errors

```typescript
const started = await charger.localStart(1, 'TAG');
// If authorization fails or connector is busy, start is ignored safely
// Check status to verify:
const state = charger.getState();
if (state !== ConnectorState.Charging) {
  console.log('Transaction did not start');
}
```

### Retry Pattern

```typescript
async function connectWithRetry(
  charger: Charger,
  maxAttempts = 3,
  delayMs = 1000
) {
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      await charger.connect();
      return;
    } catch (err) {
      if (i === maxAttempts) throw err;
      console.log(`Attempt ${i} failed, retrying in ${delayMs}ms...`);
      await new Promise(r => setTimeout(r, delayMs * i)); // Exponential backoff
    }
  }
}

await connectWithRetry(charger);
```

---

## Troubleshooting

### Connection Stuck / Timeout

**Symptom:** `await charger.connect()` hangs indefinitely

**Solutions:**

1. Verify CSMS URL is correct and reachable:
   ```bash
   telnet csms.example.com 9000
   ```

2. Check firewall rules allow WebSocket (port 9000 or your CSMS port)

3. Add explicit timeout:
   ```typescript
   const timeoutMs = 10000;
   await Promise.race([
     charger.connect(),
     new Promise((_, r) =>
       setTimeout(() => r(new Error('Timeout')), timeoutMs)
     ),
   ]);
   ```

### Charger Disconnects Immediately

**Symptom:** Connection succeeds but charger only stays connected briefly

**Solutions:**

1. Review CSMS logs for boot notification rejection

2. Verify boot options (vendor, model, firmware) are acceptable to CSMS

3. Check if heartbeat is being negotiated:
   ```typescript
   charger.getHeartbeatPeriodMs(); // Should be non-zero after connect
   ```

### Charger State Not Updating

**Symptom:** `setStatus()` doesn't reflect changes

**Solutions:**

1. Always `await` async methods:
   ```typescript
   await charger.setStatus(ConnectorState.Charging, 1); // ✓ Correct
   charger.setStatus(ConnectorState.Charging, 1);      // ✗ Fire-and-forget
   ```

2. Verify no pending transactions or state conflicts

3. Check CSMS logs for ChangeAvailability or StatusNotification rejections

### Memory Leaks

All timers and WebSocket listeners are properly cleaned up with:

```typescript
await charger.shutdown(); // Cleans everything
```

Ensure `shutdown()` is called on exit for proper resource cleanup.

---

## Testing

### Running Tests Locally

```bash
# Run all tests once
npm test

# Watch mode (re-run on file changes)
npm run test:watch

# Generate coverage report
npm run test:coverage
```

### Test Coverage

This project maintains **100% code coverage** with **97+ tests** across:

- ✅ **Unit Tests** — Individual component behavior
- ✅ **Integration Tests** — OCPP protocol message flows
- ✅ **Error Handling** — Edge cases and failure scenarios
- ✅ **Firmware Manager** — Update lifecycle management
- ✅ **Configuration Loading** — JSON parsing and validation

**Coverage breaks down as:**

| Area | Coverage |
|------|----------|
| Charger API | 100% |
| OCPP Protocol | 100% |
| WebSocket Connection | 100% |
| Error Handling | 100% |
| Route Handlers | 100% |

### Continuous Integration

Every push and pull request automatically triggers:

1. **Build validation** — TypeScript compilation
2. **Unit tests** — Full test suite on Node 18, 20, 22
3. **Security scan** — Dependency audit + Trivy scanning
4. **Coverage reporting** — Metrics uploaded to Codecov

View CI status and coverage:
- **Actions** tab → **Test & Build** workflow
- **Codecov** → [Coverage dashboard](https://codecov.io/gh/larsperceus/ev-charging-simulator)
- Current badge: [![codecov](https://codecov.io/gh/larsperceus/ev-charging-simulator/branch/main/graph/badge.svg)](https://codecov.io/gh/larsperceus/ev-charging-simulator)

**Coverage Details:**

The coverage badge shows the percentage of code lines executed by tests. Click the codecov badge to see:
- Line-by-line coverage map
- Commit history of coverage changes
- Comparison with previous versions
- Detailed coverage by file

---

## License

MIT — See LICENSE file for details

---

**Questions? Issues?** Open an issue on GitHub or check the [test suite](./src/__tests__) for comprehensive usage examples.
