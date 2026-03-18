import express from 'express';
import http from 'node:http';
import https from 'node:https';
import { networkInterfaces } from 'node:os';
import { logger } from './utils/logger.js';
import selfsigned from 'selfsigned';
import { BootOptions } from './ocppClient.js';
import { buildClientsFromConfig } from './bootstrap/clientFactory.js';
import { initializeRuntime } from './bootstrap/initializeRuntime.js';
import { sendError, sendUnexpectedError } from './api/http/errorResponses.js';
import { parseOptionalFiniteNumber, parseOptionalInteger, parseRequiredString } from './api/http/requestParsers.js';
import { registerDocsRoutes } from './api/routes/docs.routes.js';
import { registerControlRoutes } from './api/routes/control.routes.js';
import { registerEvseRoutes } from './api/routes/evse.routes.js';
import { registerHealthInfoStatusRoutes } from './api/routes/health.routes.js';
import { registerOcppCpRoutes } from './api/routes/ocppCp.routes.js';
import { registerOcppCsRoutes } from './api/routes/ocppCs.routes.js';
import { startAlfenMdns } from './discovery/alfenMdns.js';
import { startAlfenSsdp } from './discovery/alfenSsdp.js';
import { makeDeviceUuid } from './discovery/deviceIdentity.js';
import {
  type DynamicKey,
  getPropertiesByCategory,
  getPropertiesByIds,
  applyDynamicValues,
  getWhitelist,
  addWhitelistEntry,
  deleteWhitelistEntry,
  clearWhitelist,
  resetWhitelist,
  getLog,
  getTransactions,
  getChargingProfiles,
} from './api/acePropertyRegistry.js';
import { parsePasswordChangeValue } from './utils/passwordParser.js';

const app = express();

// JSON body parser – skip POST /api/firmware so the raw multipart/binary
// firmware upload stream stays unconsumed for the route handler to drain.
const jsonBodyParser = express.json({ limit: '64kb' });
app.use((req, res, next) => {
  if (req.method === 'POST' && req.path === '/api/firmware') {
    return next();
  }
  jsonBodyParser(req, res, next);
});

const isPackagedExecutable = typeof (process as NodeJS.Process & { pkg?: unknown }).pkg !== 'undefined';
const aceCompatEnabled =
  isPackagedExecutable
  || (process.env.ACE_COMPAT ?? '').toLowerCase() === 'true';

const sensitiveLogKeys = new Set([
  'password',
  'newpassword',
  'oldpassword',
  'token',
  'accesstoken',
  'authorization',
]);

function sanitizeForLog(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeForLog);
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const sanitized: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(record)) {
      if (sensitiveLogKeys.has(key.toLowerCase())) {
        sanitized[key] = '***';
      } else {
        sanitized[key] = sanitizeForLog(nested);
      }
    }
    return sanitized;
  }

  return value;
}

function formatPayloadForLog(value: unknown): string {
  if (value === undefined) return '{}';
  try {
    const text = JSON.stringify(sanitizeForLog(value));
    if (text.length > 4000) {
      return `${text.slice(0, 4000)}...[truncated]`;
    }
    return text;
  } catch {
    return '[unserializable]';
  }
}

/** Return the first truthy string value found under any of the given keys. */
function extractStringField(
  obj: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === 'string') return v;
  }
  return undefined;
}

if (aceCompatEnabled) {
  // Reboot gate: drop connections while simulating a reboot, just like
  // a real Alfen charger would be unreachable during restart.
  app.use((req, res, next) => {
    if (rebootUntil > 0 && Date.now() < rebootUntil) {
      const remainingMs = rebootUntil - Date.now();
      logger.info(`ACE REBOOT simulation active (${Math.ceil(remainingMs / 1000)}s remaining) – dropping ${req.method} ${req.originalUrl}`);
      // Destroy the socket to simulate connection refused / unreachable
      req.socket.destroy();
      return;
    }
    // Reboot period over – clear the flag
    if (rebootUntil > 0) {
      logger.info('ACE REBOOT simulation ended – charger back online');
      rebootUntil = 0;
    }
    next();
  });

  app.use((req, res, next) => {
    const started = Date.now();
    const userAgent = req.get('user-agent') ?? '-';
    logger.info(
      `ACE REQ ${req.method} ${req.originalUrl} ip=${req.ip} params=${formatPayloadForLog(req.params)} query=${formatPayloadForLog(req.query)} body=${formatPayloadForLog(req.body)} ua=${userAgent}`,
    );

    // Capture response body for debugging
    const originalJson = res.json.bind(res);
    res.json = function captureJson(body: unknown) {
      const bodyStr = formatPayloadForLog(body);
      const durationMs = Date.now() - started;
      logger.info(`ACE RES ${req.method} ${req.originalUrl} -> ${res.statusCode} (${durationMs}ms) body=${bodyStr} ua=${userAgent}`);
      return originalJson(body);
    };

    const originalSend = res.send.bind(res);
    res.send = function captureSend(body: unknown) {
      // Only log non-JSON sends (XML, HTML, etc.) – JSON sends already
      // logged via the json() override above.
      if (!res.headersSent) {
        const ct = res.getHeader('content-type');
        const isJson = typeof ct === 'string' && ct.includes('json');
        if (!isJson) {
          const durationMs = Date.now() - started;
          const preview = typeof body === 'string' ? body.slice(0, 200) : '[binary]';
          logger.info(`ACE RES ${req.method} ${req.originalUrl} -> ${res.statusCode} (${durationMs}ms) body=${preview} ua=${userAgent}`);
        }
      }
      return originalSend(body);
    } as typeof res.send;

    res.on('finish', () => {
      const durationMs = Date.now() - started;
      logger.info(`ACE HTTP ${req.method} ${req.originalUrl} -> ${res.statusCode} (${durationMs}ms) ua=${userAgent}`);
    });
    next();
  });
}

// Initialize variables that will be set from DB or env
let containerId: string;
let bootOpts: BootOptions;
let csmsUrl: string;
let connectors: number;
let defaultEvseId: string;
let brandName: string | undefined;
let apiLoginPasswordProtected = false;
let apiLoginPassword: string | undefined;

// Firmware upload state: status 0=idle, 2=uploaded/ready, 3=activating
let firmwareUploadStatus = 0;
let firmwareUploadProgress = 0;

// Reboot simulation: when set, all incoming requests are refused until this time
let rebootUntil = 0;
let rebootTimer: NodeJS.Timeout | null = null;
const REBOOT_DURATION_MS = 15_000; // 15 seconds of simulated downtime

type ClientEntry = ReturnType<typeof buildClientsFromConfig>[number];

const clients = new Map<string, ClientEntry>();

type TestState = {
  containerId: string;
  bootOpts: BootOptions;
  csmsUrl: string;
  connectors: number;
  defaultEvseId: string;
  apiLoginPasswordProtected?: boolean;
  apiLoginPassword?: string;
};

function setTestState(state: TestState) {
  containerId = state.containerId;
  bootOpts = state.bootOpts;
  csmsUrl = state.csmsUrl;
  connectors = state.connectors;
  defaultEvseId = state.defaultEvseId;
  apiLoginPasswordProtected = state.apiLoginPasswordProtected ?? false;
  apiLoginPassword = state.apiLoginPassword;

  // Reset reboot + firmware progress in test harness to avoid cross-test side effects
  rebootUntil = 0;
  if (rebootTimer) {
    clearTimeout(rebootTimer);
    rebootTimer = null;
  }
  firmwareUploadStatus = 0;
  firmwareUploadProgress = 0;
}

function setTestClients(entries: ClientEntry[]) {
  clients.clear();
  for (const entry of entries) {
    clients.set(entry.evseId, entry);
  }
}

function matchesFilters(entry: ClientEntry, filters: {
  envId?: string;
  envName?: string;
  companyId?: string;
  companyName?: string;
  locationId?: string;
  locationName?: string;
}) {
  if (filters.envId && entry.environment?.id !== filters.envId) return false;
  if (filters.envName && entry.environment?.name !== filters.envName) return false;
  if (filters.companyId && entry.company?.id !== filters.companyId) return false;
  if (filters.companyName && entry.company?.name !== filters.companyName) return false;
  if (filters.locationId && entry.location?.id !== filters.locationId) return false;
  if (filters.locationName && entry.location?.name !== filters.locationName) return false;
  return true;
}

function getEvseIdFromRequest(req: express.Request): string | undefined {
  const param = typeof req.params?.evseId === 'string' ? req.params.evseId : undefined;
  const query = typeof req.query?.evseId === 'string' ? req.query.evseId : undefined;
  const body = typeof (req.body?.evseId) === 'string' ? req.body.evseId : undefined;
  return param ?? query ?? body ?? defaultEvseId;
}

function requireClientEntry(req: express.Request, res: express.Response): ClientEntry | null {
  const evseId = getEvseIdFromRequest(req);
  if (!evseId) {
    sendError(res, 400, 'evse_id_required');
    return null;
  }
  const entry = clients.get(evseId);
  if (!entry) {
    sendError(res, 404, 'evse_not_found', `Unknown evseId: ${evseId}`);
    return null;
  }
  return entry;
}

registerDocsRoutes(app);
registerHealthInfoStatusRoutes({
  app,
  clients,
  matchesFilters,
  getContainerId: () => containerId,
});

registerOcppCpRoutes({
  app,
  requireClientEntry,
  parseOptionalInteger,
  parseRequiredString,
  sendUnexpectedError,
});

registerOcppCsRoutes({
  app,
  requireClientEntry,
  parseOptionalInteger,
  parseRequiredString,
  sendError,
  sendUnexpectedError,
  onChangeConfigurationApplied: ({ key, value, result }) => {
    if ((result?.status ?? '').toLowerCase() !== 'accepted') return;
    if (key.trim().toLowerCase() !== 'pw-setchargerpassword') return;

    const parsed = parsePasswordChangeValue(value);
    if (!parsed) return;

    apiLoginPasswordProtected = true;
    apiLoginPassword = parsed.newPassword;
  },
});

registerControlRoutes({
  app,
  requireClientEntry,
  parseOptionalInteger,
  parseOptionalFiniteNumber,
  parseRequiredString,
  sendUnexpectedError,
  getContainerId: () => containerId,
});

registerEvseRoutes({
  app,
  requireClientEntry,
  parseOptionalFiniteNumber,
  sendError,
  sendUnexpectedError,
  getContainerId: () => containerId,
});

async function initializeCharger() {
  const initialized = await initializeRuntime();
  containerId = initialized.containerId;
  bootOpts = initialized.bootOpts;
  csmsUrl = initialized.csmsUrl;
  connectors = initialized.connectors;
  defaultEvseId = initialized.defaultEvseId;
  brandName = initialized.brandName;
  apiLoginPasswordProtected = initialized.apiLoginPasswordProtected;
  apiLoginPassword = initialized.apiLoginPassword;

  clients.clear();

  const startupPreviewLimit = 20;
  logger.info(
    `Startup configuration: brand=${brandName ?? 'default'} firmware=${bootOpts?.firmwareVersion ?? 'n/a'} connectors(default)=${connectors} evses=${initialized.entries.length}`,
  );

  initialized.entries.forEach((entry, index) => {
    if (apiLoginPasswordProtected && apiLoginPassword) {
      entry.client.setChargerPassword(apiLoginPassword);
    }
    clients.set(entry.evseId, entry);
    if (index < startupPreviewLimit) {
      logger.info(
        `EVSE[${index + 1}] id=${entry.evseId} connectors=${entry.connectors} csms=${entry.csmsUrl} model=${entry.bootOpts.chargePointModel} firmware=${entry.bootOpts.firmwareVersion}`,
      );
    }
  });

  if (initialized.entries.length > startupPreviewLimit) {
    logger.info(`EVSE preview truncated: showing first ${startupPreviewLimit} of ${initialized.entries.length}`);
  }
  
  // Connect all EVSE clients to CSMS
  let connectIndex = 0;
  for (const entry of clients.values()) {
    connectIndex += 1;
    if (connectIndex <= startupPreviewLimit) {
      logger.info(`Connecting EVSE ${entry.evseId} to ${entry.csmsUrl}`);
    }
    entry.client.connect();
  }

  if (clients.size > startupPreviewLimit) {
    logger.info(`Connection logs truncated: showing first ${startupPreviewLimit} of ${clients.size}`);
  }
  
  logger.info(`Container ${containerId} initialized with ${clients.size} EVSE(s) connecting to ${csmsUrl}`);
}

/* ==========
 * Boot HTTP
 * ========== */
const defaultPort = isPackagedExecutable ? 443 : 3000;
const parsedPort = Number(process.env.PORT);
const port = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : defaultPort;
const httpsEnabled =
  isPackagedExecutable
  && port === 443
  && (process.env.ENABLE_HTTPS ?? 'true').toLowerCase() !== 'false';
const serverScheme: 'http' | 'https' = httpsEnabled ? 'https' : 'http';
let mdnsStop: (() => void) | null = null;
let ssdpStop: (() => void) | null = null;

function createHttpServer(): http.Server | https.Server {
  if (!httpsEnabled) {
    return http.createServer(app);
  }

  const lanIps = getLanIpv4Addresses();
  const altNames = [
    { type: 2, value: 'localhost' },
    { type: 2, value: 'alfen-virtual.local' },
    ...lanIps.map(ip => ({ type: 7, ip })),
  ];

  const cert = selfsigned.generate(
    [{ name: 'commonName', value: 'alfen-virtual.local' }],
    {
      days: 3650,
      keySize: 2048,
      algorithm: 'sha256',
      extensions: [
        {
          name: 'subjectAltName',
          altNames,
        },
      ],
    },
  );

  return https.createServer(
    {
      key: cert.private,
      cert: cert.cert,
    },
    app,
  );
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

app.get('/device.xml', (_req, res) => {
  const requestedEvseId = typeof _req.query?.evseId === 'string' ? _req.query.evseId : undefined;
  const requestedEntry = requestedEvseId ? clients.get(requestedEvseId) : undefined;
  const hostIp = getLanIpv4Addresses()[0] ?? '127.0.0.1';
  const identityId = requestedEntry?.evseId ?? requestedEvseId ?? containerId ?? 'alfen-virtual';
  const chargerLabel = escapeXml(identityId);
  const uuid = makeDeviceUuid(identityId);
  const modelName = escapeXml(requestedEntry?.bootOpts?.chargePointModel || bootOpts?.chargePointModel || 'NG910-60023');
  const serial = escapeXml(requestedEntry?.bootOpts?.chargeBoxSerialNumber || bootOpts?.chargeBoxSerialNumber || chargerLabel);
  const firmwareVer = escapeXml(requestedEntry?.bootOpts?.firmwareVersion || bootOpts?.firmwareVersion || '7.0.0-4318');

  const xml = `<?xml version="1.0"?>
<root xmlns="urn:schemas-upnp-org:device-1-0">
  <specVersion>
    <major>1</major>
    <minor>0</minor>
  </specVersion>
  <URLBase>${serverScheme}://${hostIp}:${port}/</URLBase>
  <device>
    <deviceType>urn:alfen:device:chargepoint:1</deviceType>
    <friendlyName>${chargerLabel}</friendlyName>
    <manufacturer>Alfen</manufacturer>
    <manufacturerURL>https://www.alfen.com</manufacturerURL>
    <modelDescription>Alfen Eve Charging Station</modelDescription>
    <modelName>${modelName}</modelName>
    <modelNumber>${firmwareVer}</modelNumber>
    <serialNumber>${serial}</serialNumber>
    <UDN>uuid:${uuid}</UDN>
    <presentationURL>${serverScheme}://${hostIp}:${port}/docs</presentationURL>
    <serviceList>
      <service>
        <serviceType>urn:schemas-upnp-org:service:DeviceInfo:1</serviceType>
        <serviceId>urn:alfen-com:serviceId:DeviceInfo1</serviceId>
        <SCPDURL>/upnp/deviceinfo/scpd.xml</SCPDURL>
        <controlURL>/upnp/deviceinfo/control</controlURL>
        <eventSubURL>/upnp/deviceinfo/event</eventSubURL>
      </service>
    </serviceList>
  </device>
</root>`;

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.status(200).send(xml);
});

if (aceCompatEnabled) {
  app.get('/', (_req, res) => {
    res.status(200).type('html').send('<html><head><title>Alfen Virtual EVSE</title></head><body><h1>Alfen Virtual EVSE</h1><p>Device online</p></body></html>');
  });

  app.post('/api/login', (req, res) => {
    const body = req.body ?? {};
    const providedPassword = extractStringField(body, 'password', 'pass');
    const newPassword = extractStringField(body, 'newpassword', 'newPassword', 'newpass');
    const username = extractStringField(body, 'username', 'user') ?? 'installer';

    if (apiLoginPasswordProtected) {
      if (!providedPassword || !apiLoginPassword || providedPassword !== apiLoginPassword) {
        res.status(401).json({
          ok: false,
          success: false,
          error: 'invalid_credentials',
          message: 'Invalid username or password',
        });
        return;
      }
    }

    // Handle password change – ACE sends newpassword in the login body
    let passwordChanged = false;
    if (newPassword !== undefined && newPassword.length > 0) {
      apiLoginPasswordProtected = true;
      apiLoginPassword = newPassword;
      passwordChanged = true;
      logger.info('ACE password changed via /api/login');
    }

    const tokenPayload = `${containerId || 'alfen'}:${Date.now()}:${Math.random()}`;
    const token = Buffer.from(tokenPayload).toString('base64url');

    res.status(200).json({
      ok: true,
      token,
      accessToken: token,
      tokenType: 'Bearer',
      expiresIn: 3600,
      user: {
        username,
        role: 'installer',
      },
      device: {
        id: containerId,
        model: bootOpts?.chargePointModel,
        vendor: bootOpts?.chargePointVendor,
      },
      passwordProtected: apiLoginPasswordProtected,
      passwordChanged,
    });
  });

  app.post('/api/logout', (_req, res) => {
    res.status(200).json({
      ok: true,
      success: true,
      message: 'Logged out',
    });
  });

  app.post('/api/cmd', (req, res) => {
    const command =
      typeof req.body?.cmd === 'string'
        ? req.body.cmd
        : typeof req.body?.command === 'string'
          ? req.body.command
          : typeof req.body?.action === 'string'
            ? req.body.action
            : typeof req.body?.name === 'string'
              ? req.body.name
              : 'unknown';

    const normalizedCommand = command.toLowerCase();
    const isPasswordCommand =
      normalizedCommand.includes('password')
      || normalizedCommand === 'setpass'
      || normalizedCommand === 'changepass';
    const isFirmwareCommand =
      normalizedCommand.includes('firmware')
      || normalizedCommand === 'reboot';

    const argumentsPayload =
      req.body && typeof req.body === 'object' && 'args' in req.body
        ? req.body.args
        : req.body;

    const isFactoryReset = normalizedCommand.includes('erase') || normalizedCommand.includes('factory');
    const isRebootCommand = normalizedCommand === 'reboot';

    let result: Record<string, unknown> = { accepted: true };
    let message = 'Command accepted by virtual ACE compatibility layer';

    if (isPasswordCommand) {
      result = {
        changed: true,
        previousPasswordPresent: true,
        requiresReboot: false,
      };
      message = 'Password updated successfully';
    } else if (isFactoryReset) {
      // Factory reset: clear password, reset firmware state, reset whitelist
      apiLoginPasswordProtected = false;
      apiLoginPassword = undefined;
      firmwareUploadStatus = 0;
      firmwareUploadProgress = 0;
      resetWhitelist();
      result = { accepted: true, reset: true };
      message = 'Factory reset accepted';
    } else if (isRebootCommand) {
      result = {
        accepted: true,
        current: bootOpts?.firmwareVersion ?? '1.0.0',
        requiresReboot: true,
      };
      message = 'Reboot initiated';
      firmwareUploadStatus = 0;
      firmwareUploadProgress = 0;
      if (rebootTimer) {
        clearTimeout(rebootTimer);
      }
      // Schedule simulated downtime AFTER sending the response
      rebootTimer = setTimeout(() => {
        rebootUntil = Date.now() + REBOOT_DURATION_MS;
        rebootTimer = null;
        logger.info(`ACE REBOOT simulation started – refusing connections for ${REBOOT_DURATION_MS / 1000}s`);
      }, 100);
    } else if (isFirmwareCommand) {
      result = {
        accepted: true,
        current: bootOpts?.firmwareVersion ?? '1.0.0',
        requiresReboot: false,
      };
      message = normalizedCommand === 'forcefirmwarepermanent'
        ? 'Firmware marked as permanent'
        : `Firmware command '${command}' accepted`;

      // After marking firmware permanent, reset upload state
      if (normalizedCommand === 'forcefirmwarepermanent') {
        firmwareUploadStatus = 0;
        firmwareUploadProgress = 0;
      }
    }

    logger.info(`ACE CMD ${command} -> ${message}`);

    res.status(200).json({
      ok: true,
      success: true,
      status: 'OK',
      code: 0,
      accepted: true,
      command,
      args: argumentsPayload,
      result,
      error: null,
      message,
    });
  });

  // ─── helper: build dynamic overrides from runtime state ───────────────

  function buildDynamicOverrides(): Partial<Record<DynamicKey, string | number>> {
    const firstEntry = clients.values().next().value as ClientEntry | undefined;
    const lanIp = getLanIpv4Addresses()[0] ?? '127.0.0.1';
    return {
      stationId:       containerId || 'alfen-virtual',
      stationName:     containerId || 'STAGING_PRIVATE',
      firmwareVersion: bootOpts?.firmwareVersion ?? '7.0.0-4318',
      stationModel:    bootOpts?.chargePointModel ?? 'NG910-60023',
      modelFamily:     (bootOpts?.chargePointModel ?? 'NG910').split('-')[0],
      stationVendor:   bootOpts?.chargePointVendor ?? 'Alfen BV',
      temperature:     36.125,
      csmsUrl:         csmsUrl ?? '',
      lanIp,
      voltage:         227.42,
      frequency:       50.1,
      connectorState:  firstEntry?.client.getState() === 'Charging' ? 3 : 2,
      uptime:          Date.now(),
      latitude:        52.402271270751953,
      longitude:       5.2437448501586914,
    };
  }

  app.get('/api/prop', (req, res) => {
    const cat = typeof req.query.cat === 'string'
      ? req.query.cat.trim()
      : typeof req.query.category === 'string'
        ? req.query.category.trim()
        : '';
    const idsRaw = typeof req.query.ids === 'string' ? req.query.ids.trim() : '';
    const offsetRaw = typeof req.query.offset === 'string' ? Number.parseInt(req.query.offset, 10) : 0;
    const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;

    const overrides = buildDynamicOverrides();

    // ── ID-based query ────────────────────────────────────────────────
    if (idsRaw.length > 0) {
      const ids = idsRaw.split(',').map(s => s.trim()).filter(Boolean);
      const result = getPropertiesByIds(ids);
      applyDynamicValues(result.properties, overrides);
      res.status(200).json(result);
      return;
    }

    // ── category-based query (paginated) ──────────────────────────────
    if (cat.length > 0) {
      const result = getPropertiesByCategory(cat, offset);
      applyDynamicValues(result.properties, overrides);
      res.status(200).json(result);
      return;
    }

    // ── no filter: return first page of generic as default ────────────
    const result = getPropertiesByCategory('generic', offset);
    applyDynamicValues(result.properties, overrides);
    res.status(200).json(result);
  });

  // ─── POST /api/prop – write properties ────────────────────────────────

  app.post('/api/prop', (req, res) => {
    // The real ACE installer sends property writes as a flat object keyed by
    // property ID, e.g.  { "2187_0": { "id": "2187_0", "value": 12345 } }.
    // Older / alternative clients may send { properties: [{ id, value }] }.
    // We accept both formats.
    const body = req.body ?? {};
    let properties: Array<{ id: string; value: unknown }> = [];

    if (Array.isArray(body.properties)) {
      // Array format: { properties: [{ id, value }, …] }
      properties = body.properties.filter(
        (p: unknown): p is { id: string; value: unknown } =>
          p != null && typeof p === 'object' && typeof (p as Record<string, unknown>).id === 'string',
      );
    } else if (typeof body === 'object' && !Array.isArray(body)) {
      // Flat-object format: { "2187_0": { "id": "2187_0", "value": … }, … }
      for (const [key, entry] of Object.entries(body)) {
        if (
          entry != null
          && typeof entry === 'object'
          && typeof (entry as Record<string, unknown>).id === 'string'
        ) {
          properties.push(entry as { id: string; value: unknown });
        } else if (key !== 'version' && key !== 'properties') {
          // Bare value write: { "2187_0": 12345 }
          properties.push({ id: key, value: entry });
        }
      }
    }

    logger.info(`ACE PROP WRITE: ${properties.length} propert${properties.length === 1 ? 'y' : 'ies'} received`);
    for (const prop of properties) {
      logger.info(`  SET ${prop.id} = ${JSON.stringify(prop.value)}`);
    }
    res.status(200).json({ version: 2 });
  });

  // ─── /api/whitelist – RFID tag whitelist ──────────────────────────────

  app.get('/api/whitelist', (req, res) => {
    const indexRaw = typeof req.query.index === 'string' ? Number.parseInt(req.query.index, 10) : 0;
    const index = Number.isFinite(indexRaw) && indexRaw >= 0 ? indexRaw : 0;
    res.status(200).json(getWhitelist(index));
  });

  app.post('/api/whitelist', (req, res) => {
    const body = req.body;
    // ACE sends { whitelist: [ { tag, parent, status, expiryDate }, ... ] }
    if (body && Array.isArray(body.whitelist)) {
      let added = 0;
      for (const entry of body.whitelist) {
        if (entry && typeof entry.tag === 'string' && entry.tag.trim().length > 0) {
          addWhitelistEntry({
            tag: entry.tag.trim(),
            parent: typeof entry.parent === 'string' ? entry.parent : '(null)',
            status: typeof entry.status === 'number' ? entry.status : 1,
            expiryDate: typeof entry.expiryDate === 'number' ? entry.expiryDate : Math.floor(Date.now() / 1000) + 365 * 86400,
          });
          added++;
        }
      }
      logger.info(`Whitelist POST: added/updated ${added} entries`);
    } else if (body && typeof body.tag === 'string' && body.tag.trim().length > 0) {
      // Single entry format
      addWhitelistEntry({
        tag: body.tag.trim(),
        parent: typeof body.parent === 'string' ? body.parent : '(null)',
        status: typeof body.status === 'number' ? body.status : 1,
        expiryDate: typeof body.expiryDate === 'number' ? body.expiryDate : Math.floor(Date.now() / 1000) + 365 * 86400,
      });
      logger.info(`Whitelist POST: added/updated tag ${body.tag.trim()}`);
    } else if (body && body.clear === true) {
      clearWhitelist();
      logger.info('Whitelist POST: cleared all entries');
    }
    res.status(200).json({ version: 2 });
  });

  app.delete('/api/whitelist', (req, res) => {
    const tag = typeof req.query.tag === 'string' ? req.query.tag.trim() : '';
    if (tag.length > 0) {
      const deleted = deleteWhitelistEntry(tag);
      logger.info(`Whitelist DELETE: tag=${tag} ${deleted ? 'removed' : 'not found'}`);
    } else {
      // No tag specified — clear all
      clearWhitelist();
      logger.info('Whitelist DELETE: cleared all entries');
    }
    res.status(200).json({ version: 2 });
  });

  // ─── /api/transactions ────────────────────────────────────────────────

  app.get('/api/transactions', (req, res) => {
    const offsetRaw = typeof req.query.offset === 'string' ? Number.parseInt(req.query.offset, 10) : 0;
    const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;
    res.status(200).json(getTransactions(offset));
  });

  // ─── /api/log – firmware log ──────────────────────────────────────────

  app.get('/api/log', (req, res) => {
    const offsetRaw = typeof req.query.offset === 'string' ? Number.parseInt(req.query.offset, 10) : 0;
    const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;
    res.status(200).json(getLog(offset));
  });

  // ─── /api/chargingprofiles ────────────────────────────────────────────

  app.get('/api/chargingprofiles', (_req, res) => {
    res.status(200).json(getChargingProfiles());
  });

  app.get('/api/firmware', (_req, res) => {
    res.status(200).json({
      version: 2,
      name: bootOpts?.chargePointModel ?? 'NG910-60023',
      identity: containerId ?? 'alfen-virtual',
      current: bootOpts?.firmwareVersion ?? '1.0.0',
      available: firmwareUploadStatus >= 2 ? (bootOpts?.firmwareVersion ?? '1.0.0') : null,
      progress: firmwareUploadProgress,
      active_image: 'A',
      inactive_image: firmwareUploadStatus >= 2 ? 'B' : null,
      status: firmwareUploadStatus,
    });
  });

  app.post('/api/firmware', (req, res) => {
    // Firmware uploads arrive as multipart/form-data or raw binary – the
    // global JSON body-parser is deliberately skipped for this route so the
    // raw stream is available.  We drain all incoming data (we don't need
    // the binary) before responding, otherwise the client sees a broken
    // pipe / connection-reset error.
    let totalBytes = 0;
    const headerChunks: Buffer[] = [];
    let headerBytesCaptured = 0;
    const HEADER_CAPTURE_LIMIT = 2048; // capture first 2KB to inspect multipart fields

    const contentType = req.headers['content-type'] ?? 'unknown';
    logger.info(`ACE FIRMWARE upload content-type=${contentType}`);

    req.on('data', (chunk: Buffer) => {
      totalBytes += chunk.length;
      if (headerBytesCaptured < HEADER_CAPTURE_LIMIT) {
        headerChunks.push(chunk);
        headerBytesCaptured += chunk.length;
      }
    });
    req.on('end', () => {
      // Log the first 2KB so we can see multipart field names, boundaries, etc.
      const headerBuf = Buffer.concat(headerChunks).subarray(0, HEADER_CAPTURE_LIMIT);
      const headerPreview = headerBuf.toString('utf-8')
        .replace(/[\x00-\x08\x0e-\x1f\x7f-\xff]/g, '.')  // replace binary with dots
        .slice(0, 1500);
      logger.info(`ACE FIRMWARE upload header preview (${totalBytes} bytes total):\n${headerPreview}`);

      logger.info(`ACE FIRMWARE upload completed: ${totalBytes} bytes`);
      firmwareUploadStatus = 2;   // "uploaded / ready to activate"
      firmwareUploadProgress = 100;
      res.status(200).json({
        version: 2,
        status: 0,
        message: 'Firmware upload accepted',
      });
    });
    req.on('error', (err) => {
      logger.warn(`ACE FIRMWARE upload error: ${err.message}`);
      firmwareUploadStatus = 0;
      firmwareUploadProgress = 0;
      res.status(500).json({ version: 2, status: -1, message: 'Upload failed' });
    });
  });

  app.get('/upnp/deviceinfo/scpd.xml', (_req, res) => {
    const xml = `<?xml version="1.0"?>
<scpd xmlns="urn:schemas-upnp-org:service-1-0">
  <specVersion>
    <major>1</major>
    <minor>0</minor>
  </specVersion>
  <actionList>
    <action>
      <name>GetDeviceInfo</name>
      <argumentList>
        <argument>
          <name>ModelName</name>
          <direction>out</direction>
          <relatedStateVariable>ModelName</relatedStateVariable>
        </argument>
        <argument>
          <name>SerialNumber</name>
          <direction>out</direction>
          <relatedStateVariable>SerialNumber</relatedStateVariable>
        </argument>
      </argumentList>
    </action>
  </actionList>
  <serviceStateTable>
    <stateVariable sendEvents="no">
      <name>ModelName</name>
      <dataType>string</dataType>
    </stateVariable>
    <stateVariable sendEvents="no">
      <name>SerialNumber</name>
      <dataType>string</dataType>
    </stateVariable>
  </serviceStateTable>
</scpd>`;

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.status(200).send(xml);
  });

  app.post('/upnp/deviceinfo/control', (_req, res) => {
    const modelName = escapeXml(bootOpts?.chargePointModel || 'NG910-60023');
    const serial = escapeXml(bootOpts?.chargeBoxSerialNumber || containerId || 'alfen-virtual');
    const body = `<?xml version="1.0"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:GetDeviceInfoResponse xmlns:u="urn:schemas-upnp-org:service:DeviceInfo:1">
      <ModelName>${modelName}</ModelName>
      <SerialNumber>${serial}</SerialNumber>
    </u:GetDeviceInfoResponse>
  </s:Body>
</s:Envelope>`;

    res.setHeader('Content-Type', 'text/xml; charset=utf-8');
    res.status(200).send(body);
  });

  app.all('/upnp/deviceinfo/event', (_req, res) => {
    res.status(200).send('OK');
  });

  // ─── /api/password – dedicated password change endpoint ───────────────
  // Some ACE versions POST here to set/change the charger password.
  app.post('/api/password', (req, res) => {
    const body = req.body ?? {};
    const newPw = extractStringField(body, 'password', 'newpassword', 'newPassword', 'new_password', 'pass');
    const oldPw = extractStringField(body, 'oldpassword', 'oldPassword', 'old_password', 'current', 'currentpassword');
    logger.info(`ACE PASSWORD change request: oldPw=${oldPw ? '***' : '(none)'} newPw=${newPw ? '***' : '(none)'} body-keys=${Object.keys(body).join(',')}`);

    if (newPw) {
      apiLoginPasswordProtected = true;
      apiLoginPassword = newPw;
      logger.info('ACE password changed via /api/password');
    }

    res.status(200).json({
      version: 2,
    });
  });

  // Also accept PUT on /api/password and /api/login
  app.put('/api/password', (req, res) => {
    const body = req.body ?? {};
    const newPw = extractStringField(body, 'password', 'newpassword', 'newPassword', 'new_password', 'pass');
    logger.info(`ACE PASSWORD PUT request: newPw=${newPw ? '***' : '(none)'} body-keys=${Object.keys(body).join(',')}`);

    if (newPw) {
      apiLoginPasswordProtected = true;
      apiLoginPassword = newPw;
    }

    res.status(200).json({
      version: 2,
    });
  });

  // Catch-all: log ANY unmatched route so we can spot what ACE
  // is trying to reach that we haven't implemented yet.
  app.all('*', (req, res) => {
    logger.warn(`ACE UNHANDLED ${req.method} ${req.originalUrl} body=${formatPayloadForLog(req.body)}`);
    res.status(404).json({ error: 'not_found', path: req.originalUrl });
  });
}

function getLanIpv4Addresses(): string[] {
  const nets = networkInterfaces();
  const addresses = new Set<string>();

  for (const entries of Object.values(nets)) {
    if (!entries) continue;
    for (const entry of entries) {
      if (entry.family !== 'IPv4') continue;
      if (entry.internal) continue;
      addresses.add(entry.address);
    }
  }

  return [...addresses].sort();
}

// Initialize charger and start server
async function startServer() {
  try {
    await initializeCharger();

    const server = createHttpServer();

    server.listen(port, () => {
      const entries = [...clients.values()];
      const connectedCount = entries.filter(e => e.client.isConnected()).length;
      logger.info(`🚀 Container ${containerId} ${serverScheme.toUpperCase()} server listening on port ${port}`);
      logger.info(`📡 OCPP connection status: ${connectedCount}/${entries.length} connected`);

      const lanIps = getLanIpv4Addresses();
      if (lanIps.length > 0) {
        for (const ip of lanIps) {
          logger.info(`🌐 LAN endpoint: ${serverScheme}://${ip}:${port}`);
        }
      } else {
        logger.info('🌐 LAN endpoint: no external IPv4 interface detected');
      }

      try {
        const mdns = startAlfenMdns({
          chargerId: containerId,
          chargerIds: [...clients.keys()],
          port,
          firmwareVersion: bootOpts?.firmwareVersion,
          model: bootOpts?.chargePointModel,
          getLanIps: getLanIpv4Addresses,
        });
        mdnsStop = mdns.stop;
      } catch (error) {
        logger.warn(`mDNS discovery failed to start: ${error instanceof Error ? error.message : String(error)}`);
      }

      try {
        const ssdp = startAlfenSsdp({
          chargerId: containerId,
          chargerIds: [...clients.keys()],
          port,
          scheme: serverScheme,
          getLanIps: getLanIpv4Addresses,
        });
        ssdpStop = ssdp.stop;
      } catch (error) {
        logger.warn(`SSDP discovery failed to start: ${error instanceof Error ? error.message : String(error)}`);
      }

      if (httpsEnabled) {
        logger.info('🔒 HTTPS mode enabled for ACE compatibility (self-signed certificate)');
      }
      if (aceCompatEnabled) {
        logger.info('🧩 ACE compatibility API enabled');
      }
    });

    if (httpsEnabled) {
      const tlsServer = server as https.Server;
      tlsServer.on('tlsClientError', (_error, socket) => {
        // Silently ignore – most TLS client errors are plain-HTTP probes
        // handled by the redirect server on port 80 below.
        socket.destroy();
      });

      // Start a plain-HTTP server on port 80 that redirects to HTTPS.
      // The real Alfen charger does the same: ACE connects to HTTP first,
      // gets redirected to HTTPS, and then does all further communication
      // over TLS.
      const httpRedirectPort = 80;
      const httpRedirect = http.createServer((req, res) => {
        const host = req.headers.host?.replace(/:.*$/, '') ?? 'localhost';
        const target = `https://${host}:${port}${req.url ?? '/'}`;
        res.writeHead(301, { Location: target });
        res.end();
      });
      httpRedirect.listen(httpRedirectPort, () => {
        logger.info(`HTTP redirect server listening on port ${httpRedirectPort} -> https://...:${port}`);
      }).on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EACCES') {
          logger.warn(`Cannot bind HTTP redirect port ${httpRedirectPort} (EACCES). Run as Administrator or clients must connect via HTTPS directly.`);
        } else if (err.code === 'EADDRINUSE') {
          logger.warn(`HTTP redirect port ${httpRedirectPort} already in use. Skipping redirect server.`);
        } else {
          logger.warn(`HTTP redirect server failed: ${err.message}`);
        }
      });
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'EACCES' && port < 1024) {
      logger.error(`Failed to bind port ${port}. On Windows, run as Administrator or set PORT to a non-privileged port.`);
    }
    logger.error(`Failed to start charger service: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

// Graceful shutdown
let shutdownInProgress = false;

async function handleShutdown(signal: 'SIGTERM' | 'SIGINT') {
  if (shutdownInProgress) return;
  shutdownInProgress = true;
  logger.info(`${signal} received, shutting down gracefully...`);

  try {
    if (mdnsStop) {
      mdnsStop();
      mdnsStop = null;
    }
    if (ssdpStop) {
      ssdpStop();
      ssdpStop = null;
    }

    const shutdownTimeoutMs = 8000;
    await Promise.race([
      Promise.allSettled(
        [...clients.values()].map((entry) => entry.client.shutdown()),
      ),
      new Promise((resolve) => setTimeout(resolve, shutdownTimeoutMs)),
    ]);
  } catch (error) {
    logger.error(`Error during shutdown: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    process.exit(0);
  }
}

process.on('SIGTERM', async () => {
  await handleShutdown('SIGTERM');
});

process.on('SIGINT', async () => {
  await handleShutdown('SIGINT');
});

// Start the server unless running tests
if (process.env.NODE_ENV !== 'test') {
  startServer();
}

export { app, initializeCharger, startServer, setTestState, setTestClients, buildClientsFromConfig };
