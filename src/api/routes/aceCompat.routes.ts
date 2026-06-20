import type express from 'express';
import { logger } from '../../utils/logger.js';
import type { BootOptions } from '../../ocppClient.js';
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
} from '../acePropertyRegistry.js';
import { makeDeviceUuid } from '../../discovery/deviceIdentity.js';

const AceFirmwareUploadStatus = { Idle: 0, Ready: 2, Activating: 3 } as const;
const REBOOT_DURATION_MS = 15_000;

export type AceCompatState = {
  apiLoginPasswordProtected: boolean;
  apiLoginPassword: string | undefined;
  firmwareUploadStatus: number;
  firmwareUploadProgress: number;
  rebootUntil: number;
  rebootTimer: NodeJS.Timeout | null;
};

export type AceCompatDeps = {
  getContainerId: () => string;
  getBootOpts: () => BootOptions;
  getCsmsUrl: () => string;
  getClients: () => Map<string, { evseId: string; bootOpts: BootOptions; client: { getState(): string } }>;
  getLanIps: () => string[];
  getScheme: () => string;
  getPort: () => number;
};

export function createAceCompatState(): AceCompatState {
  return {
    apiLoginPasswordProtected: false,
    apiLoginPassword: undefined,
    firmwareUploadStatus: AceFirmwareUploadStatus.Idle,
    firmwareUploadProgress: 0,
    rebootUntil: 0,
    rebootTimer: null,
  };
}

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

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function registerAceCompatMiddleware(app: express.Express, state: AceCompatState): void {
  // Reboot gate: drop connections while simulating a reboot, just like
  // a real Alfen charger would be unreachable during restart.
  app.use((req, res, next) => {
    if (state.rebootUntil > 0 && Date.now() < state.rebootUntil) {
      const remainingMs = state.rebootUntil - Date.now();
      logger.info(`ACE REBOOT simulation active (${Math.ceil(remainingMs / 1000)}s remaining) – dropping ${req.method} ${req.originalUrl}`);
      req.socket.destroy();
      return;
    }
    if (state.rebootUntil > 0) {
      logger.info('ACE REBOOT simulation ended – charger back online');
      state.rebootUntil = 0;
    }
    next();
  });

  app.use((req, res, next) => {
    const started = Date.now();
    const userAgent = req.get('user-agent') ?? '-';
    logger.info(
      `ACE REQ ${req.method} ${req.originalUrl} ip=${req.ip} params=${formatPayloadForLog(req.params)} query=${formatPayloadForLog(req.query)} body=${formatPayloadForLog(req.body)} ua=${userAgent}`,
    );

    const originalJson = res.json.bind(res);
    res.json = function captureJson(body: unknown) {
      const bodyStr = formatPayloadForLog(body);
      const durationMs = Date.now() - started;
      logger.info(`ACE RES ${req.method} ${req.originalUrl} -> ${res.statusCode} (${durationMs}ms) body=${bodyStr} ua=${userAgent}`);
      return originalJson(body);
    };

    const originalSend = res.send.bind(res);
    res.send = function captureSend(body: unknown) {
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

export function registerDeviceXmlRoute(app: express.Express, deps: AceCompatDeps): void {
  app.get('/device.xml', (_req, res) => {
    const requestedEvseId = typeof _req.query?.evseId === 'string' ? _req.query.evseId : undefined;
    const requestedEntry = requestedEvseId ? deps.getClients().get(requestedEvseId) : undefined;
    const hostIp = deps.getLanIps()[0] ?? '127.0.0.1';
    const containerId = deps.getContainerId();
    const bootOpts = deps.getBootOpts();
    const serverScheme = deps.getScheme();
    const port = deps.getPort();
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
}

export function registerAceCompatRoutes(app: express.Express, state: AceCompatState, deps: AceCompatDeps): void {
  app.get('/', (_req, res) => {
    res.status(200).type('html').send('<html><head><title>Alfen Virtual EVSE</title></head><body><h1>Alfen Virtual EVSE</h1><p>Device online</p></body></html>');
  });

  app.post('/api/login', (req, res) => {
    const body = req.body ?? {};
    const providedPassword = extractStringField(body, 'password', 'pass');
    const newPassword = extractStringField(body, 'newpassword', 'newPassword', 'newpass');
    const username = extractStringField(body, 'username', 'user') ?? 'installer';

    if (state.apiLoginPasswordProtected) {
      if (!providedPassword || !state.apiLoginPassword || providedPassword !== state.apiLoginPassword) {
        res.status(401).json({
          ok: false,
          success: false,
          error: 'invalid_credentials',
          message: 'Invalid username or password',
        });
        return;
      }
    }

    let passwordChanged = false;
    if (newPassword !== undefined && newPassword.length > 0) {
      state.apiLoginPasswordProtected = true;
      state.apiLoginPassword = newPassword;
      passwordChanged = true;
      logger.info('ACE password changed via /api/login');
    }

    const containerId = deps.getContainerId();
    const bootOpts = deps.getBootOpts();
    const tokenPayload = `${containerId || 'alfen'}:${Date.now()}:${Math.random()}`;
    const token = Buffer.from(tokenPayload).toString('base64url');

    res.status(200).json({
      ok: true,
      token,
      accessToken: token,
      tokenType: 'Bearer',
      expiresIn: 3600,
      user: { username, role: 'installer' },
      device: {
        id: containerId,
        model: bootOpts?.chargePointModel,
        vendor: bootOpts?.chargePointVendor,
      },
      passwordProtected: state.apiLoginPasswordProtected,
      passwordChanged,
    });
  });

  app.post('/api/logout', (_req, res) => {
    res.status(200).json({ ok: true, success: true, message: 'Logged out' });
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

    const bootOpts = deps.getBootOpts();
    let result: Record<string, unknown> = { accepted: true };
    let message = 'Command accepted by virtual ACE compatibility layer';

    if (isPasswordCommand) {
      result = { changed: true, previousPasswordPresent: true, requiresReboot: false };
      message = 'Password updated successfully';
    } else if (isFactoryReset) {
      state.apiLoginPasswordProtected = false;
      state.apiLoginPassword = undefined;
      state.firmwareUploadStatus = AceFirmwareUploadStatus.Idle;
      state.firmwareUploadProgress = 0;
      resetWhitelist();
      result = { accepted: true, reset: true };
      message = 'Factory reset accepted';
    } else if (isRebootCommand) {
      result = { accepted: true, current: bootOpts?.firmwareVersion ?? '1.0.0', requiresReboot: true };
      message = 'Reboot initiated';
      state.firmwareUploadStatus = AceFirmwareUploadStatus.Idle;
      state.firmwareUploadProgress = 0;
      if (state.rebootTimer) {
        clearTimeout(state.rebootTimer);
      }
      state.rebootTimer = setTimeout(() => {
        state.rebootUntil = Date.now() + REBOOT_DURATION_MS;
        state.rebootTimer = null;
        logger.info(`ACE REBOOT simulation started – refusing connections for ${REBOOT_DURATION_MS / 1000}s`);
      }, 100);
    } else if (isFirmwareCommand) {
      result = { accepted: true, current: bootOpts?.firmwareVersion ?? '1.0.0', requiresReboot: false };
      message = normalizedCommand === 'forcefirmwarepermanent'
        ? 'Firmware marked as permanent'
        : `Firmware command '${command}' accepted`;
      if (normalizedCommand === 'forcefirmwarepermanent') {
        state.firmwareUploadStatus = AceFirmwareUploadStatus.Idle;
        state.firmwareUploadProgress = 0;
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

  function buildDynamicOverrides(): Partial<Record<DynamicKey, string | number>> {
    const firstEntry = deps.getClients().values().next().value as { client: { getState(): string } } | undefined;
    const lanIp = deps.getLanIps()[0] ?? '127.0.0.1';
    const containerId = deps.getContainerId();
    const bootOpts = deps.getBootOpts();
    const csmsUrl = deps.getCsmsUrl();
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

    if (idsRaw.length > 0) {
      const ids = idsRaw.split(',').map(s => s.trim()).filter(Boolean);
      const result = getPropertiesByIds(ids);
      applyDynamicValues(result.properties, overrides);
      res.status(200).json(result);
      return;
    }

    if (cat.length > 0) {
      const result = getPropertiesByCategory(cat, offset);
      applyDynamicValues(result.properties, overrides);
      res.status(200).json(result);
      return;
    }

    const result = getPropertiesByCategory('generic', offset);
    applyDynamicValues(result.properties, overrides);
    res.status(200).json(result);
  });

  app.post('/api/prop', (req, res) => {
    const body = req.body ?? {};
    let properties: Array<{ id: string; value: unknown }> = [];

    if (Array.isArray(body.properties)) {
      properties = body.properties.filter(
        (p: unknown): p is { id: string; value: unknown } =>
          p != null && typeof p === 'object' && typeof (p as Record<string, unknown>).id === 'string',
      );
    } else if (typeof body === 'object' && !Array.isArray(body)) {
      for (const [key, entry] of Object.entries(body)) {
        if (
          entry != null
          && typeof entry === 'object'
          && typeof (entry as Record<string, unknown>).id === 'string'
        ) {
          properties.push(entry as { id: string; value: unknown });
        } else if (key !== 'version' && key !== 'properties') {
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

  app.get('/api/whitelist', (req, res) => {
    const indexRaw = typeof req.query.index === 'string' ? Number.parseInt(req.query.index, 10) : 0;
    const index = Number.isFinite(indexRaw) && indexRaw >= 0 ? indexRaw : 0;
    res.status(200).json(getWhitelist(index));
  });

  app.post('/api/whitelist', (req, res) => {
    const body = req.body;
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
      clearWhitelist();
      logger.info('Whitelist DELETE: cleared all entries');
    }
    res.status(200).json({ version: 2 });
  });

  app.get('/api/transactions', (req, res) => {
    const offsetRaw = typeof req.query.offset === 'string' ? Number.parseInt(req.query.offset, 10) : 0;
    const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;
    res.status(200).json(getTransactions(offset));
  });

  app.get('/api/log', (req, res) => {
    const offsetRaw = typeof req.query.offset === 'string' ? Number.parseInt(req.query.offset, 10) : 0;
    const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;
    res.status(200).json(getLog(offset));
  });

  app.get('/api/chargingprofiles', (_req, res) => {
    res.status(200).json(getChargingProfiles());
  });

  app.get('/api/firmware', (_req, res) => {
    const bootOpts = deps.getBootOpts();
    const containerId = deps.getContainerId();
    res.status(200).json({
      version: 2,
      name: bootOpts?.chargePointModel ?? 'NG910-60023',
      identity: containerId ?? 'alfen-virtual',
      current: bootOpts?.firmwareVersion ?? '1.0.0',
      available: state.firmwareUploadStatus >= AceFirmwareUploadStatus.Ready ? (bootOpts?.firmwareVersion ?? '1.0.0') : null,
      progress: state.firmwareUploadProgress,
      active_image: 'A',
      inactive_image: state.firmwareUploadStatus >= AceFirmwareUploadStatus.Ready ? 'B' : null,
      status: state.firmwareUploadStatus,
    });
  });

  app.post('/api/firmware', (req, res) => {
    let totalBytes = 0;
    const headerChunks: Buffer[] = [];
    let headerBytesCaptured = 0;
    const HEADER_CAPTURE_LIMIT = 2048;

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
      const headerBuf = Buffer.concat(headerChunks).subarray(0, HEADER_CAPTURE_LIMIT);
      const headerPreview = headerBuf.toString('utf-8')
        .replace(/[\x00-\x08\x0e-\x1f\x7f-\xff]/g, '.')
        .slice(0, 1500);
      logger.info(`ACE FIRMWARE upload header preview (${totalBytes} bytes total):\n${headerPreview}`);
      logger.info(`ACE FIRMWARE upload completed: ${totalBytes} bytes`);
      state.firmwareUploadStatus = AceFirmwareUploadStatus.Ready;
      state.firmwareUploadProgress = 100;
      res.status(200).json({ version: 2, status: 0, message: 'Firmware upload accepted' });
    });
    req.on('error', (err) => {
      logger.warn(`ACE FIRMWARE upload error: ${err.message}`);
      state.firmwareUploadStatus = AceFirmwareUploadStatus.Idle;
      state.firmwareUploadProgress = 0;
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
    const bootOpts = deps.getBootOpts();
    const containerId = deps.getContainerId();
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

  app.post('/api/password', (req, res) => {
    const body = req.body ?? {};
    const newPw = extractStringField(body, 'password', 'newpassword', 'newPassword', 'new_password', 'pass');
    const oldPw = extractStringField(body, 'oldpassword', 'oldPassword', 'old_password', 'current', 'currentpassword');
    logger.info(`ACE PASSWORD change request: oldPw=${oldPw ? '***' : '(none)'} newPw=${newPw ? '***' : '(none)'} body-keys=${Object.keys(body).join(',')}`);
    if (newPw) {
      state.apiLoginPasswordProtected = true;
      state.apiLoginPassword = newPw;
      logger.info('ACE password changed via /api/password');
    }
    res.status(200).json({ version: 2 });
  });

  app.put('/api/password', (req, res) => {
    const body = req.body ?? {};
    const newPw = extractStringField(body, 'password', 'newpassword', 'newPassword', 'new_password', 'pass');
    logger.info(`ACE PASSWORD PUT request: newPw=${newPw ? '***' : '(none)'} body-keys=${Object.keys(body).join(',')}`);
    if (newPw) {
      state.apiLoginPasswordProtected = true;
      state.apiLoginPassword = newPw;
    }
    res.status(200).json({ version: 2 });
  });

  // Catch-all: log ANY unmatched route so we can spot what ACE
  // is trying to reach that we haven't implemented yet.
  app.all('*', (req, res) => {
    logger.warn(`ACE UNHANDLED ${req.method} ${req.originalUrl} body=${formatPayloadForLog(req.body)}`);
    res.status(404).json({ error: 'not_found', path: req.originalUrl });
  });
}
