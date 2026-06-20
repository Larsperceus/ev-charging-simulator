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
import { startMdns } from './discovery/alfenMdns.js';
import type { BrandProfile } from './brandProfiles.js';
import { startAlfenSsdp } from './discovery/alfenSsdp.js';
import { parsePasswordChangeValue } from './utils/passwordParser.js';
import { attachTrafficWss } from './api/routes/traffic.routes.js';
import {
  createAceCompatState,
  registerAceCompatMiddleware,
  registerDeviceXmlRoute,
  registerAceCompatRoutes,
  type AceCompatState,
} from './api/routes/aceCompat.routes.js';

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

/* ==========
 * Boot HTTP (declared early so aceCompatDeps can reference them via closure)
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

// Optional API_SECRET bearer auth — protects write endpoints when env var is set
const apiSecret = process.env.API_SECRET;
if (apiSecret) {
  app.use((req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
      return next();
    }
    if (req.path.startsWith('/docs') || req.path.startsWith('/openapi')) {
      return next();
    }
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ') || auth.slice(7) !== apiSecret) {
      res.status(401).json({ error: 'unauthorized', message: 'Bearer token required' });
      return;
    }
    next();
  });
}

const aceCompatState: AceCompatState = createAceCompatState();

if (aceCompatEnabled) {
  registerAceCompatMiddleware(app, aceCompatState);
}

// Initialize variables that will be set from DB or env
let containerId: string;
let bootOpts: BootOptions;
let csmsUrl: string;
let connectors: number;
let defaultEvseId: string;
let brandName: string | undefined;
let brandProfile: BrandProfile | null = null;

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

  aceCompatState.apiLoginPasswordProtected = state.apiLoginPasswordProtected ?? false;
  aceCompatState.apiLoginPassword = state.apiLoginPassword;
  aceCompatState.rebootUntil = 0;
  if (aceCompatState.rebootTimer) {
    clearTimeout(aceCompatState.rebootTimer);
    aceCompatState.rebootTimer = null;
  }
  aceCompatState.firmwareUploadStatus = 0;
  aceCompatState.firmwareUploadProgress = 0;
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

    aceCompatState.apiLoginPasswordProtected = true;
    aceCompatState.apiLoginPassword = parsed.newPassword;
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

const aceCompatDeps = {
  getContainerId: () => containerId,
  getBootOpts: () => bootOpts,
  getCsmsUrl: () => csmsUrl,
  getClients: () => clients as Map<string, { evseId: string; bootOpts: BootOptions; client: { getState(): string } }>,
  getLanIps: getLanIpv4Addresses,
  getScheme: () => serverScheme,
  getPort: () => port,
};

registerDeviceXmlRoute(app, aceCompatDeps);

if (aceCompatEnabled) {
  registerAceCompatRoutes(app, aceCompatState, aceCompatDeps);
}

async function initializeCharger() {
  const initialized = await initializeRuntime();
  containerId = initialized.containerId;
  bootOpts = initialized.bootOpts;
  csmsUrl = initialized.csmsUrl;
  connectors = initialized.connectors;
  defaultEvseId = initialized.defaultEvseId;
  brandName = initialized.brandName;
  brandProfile = initialized.brandProfile;
  aceCompatState.apiLoginPasswordProtected = initialized.apiLoginPasswordProtected;
  aceCompatState.apiLoginPassword = initialized.apiLoginPassword;

  clients.clear();

  const startupPreviewLimit = 20;
  logger.info(
    `Startup configuration: brand=${brandName ?? 'default'} firmware=${bootOpts?.firmwareVersion ?? 'n/a'} connectors(default)=${connectors} evses=${initialized.entries.length}`,
  );

  initialized.entries.forEach((entry, index) => {
    if (aceCompatState.apiLoginPasswordProtected && aceCompatState.apiLoginPassword) {
      entry.client.setChargerPassword(aceCompatState.apiLoginPassword);
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
      extensions: [{ name: 'subjectAltName', altNames }],
    },
  );

  return https.createServer({ key: cert.private, cert: cert.cert }, app);
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

async function startServer() {
  try {
    await initializeCharger();

    const server = createHttpServer();
    attachTrafficWss(server);

    server.listen(port, () => {
      const entries = [...clients.values()];
      const connectedCount = entries.filter(e => e.client.isConnected()).length;
      logger.info(`🚀 Container ${containerId} ${serverScheme.toUpperCase()} server listening on port ${port}`);
      logger.info(`📡 OCPP connection status: ${connectedCount}/${entries.length} connected`);
      logger.info(`🔍 OCPP traffic WebSocket: ws://localhost:${port}/ws/traffic  (filter: ?evseId=<id>)`);

      const lanIps = getLanIpv4Addresses();
      if (lanIps.length > 0) {
        for (const ip of lanIps) {
          logger.info(`🌐 LAN endpoint: ${serverScheme}://${ip}:${port}`);
        }
      } else {
        logger.info('🌐 LAN endpoint: no external IPv4 interface detected');
      }

      try {
        const mdnsProfile = brandProfile?.discovery?.mdns;
        const mdns = startMdns({
          chargerId: containerId,
          chargerIds: [...clients.keys()],
          port,
          firmwareVersion: bootOpts?.firmwareVersion,
          model: bootOpts?.chargePointModel,
          getLanIps: getLanIpv4Addresses,
          serviceType: mdnsProfile?.serviceType,
          instancePrefix: mdnsProfile?.instancePrefix,
          vendor: mdnsProfile?.vendor,
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

if (process.env.NODE_ENV !== 'test') {
  startServer();
}

export { app, initializeCharger, startServer, setTestState, setTestClients, buildClientsFromConfig };
