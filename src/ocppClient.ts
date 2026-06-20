import WebSocket from 'ws';
import { logger } from './utils/logger.js';
import { defaultConfiguration } from './ocppConfig.js';
import { validateCsCall } from './ocppSchemas.js';
import {
  BrandProfile,
  filterConfigurationKeys,
  isActionAllowed,
  isConfigKeyAllowed
} from './brandProfiles.js';
import { FirmwareManager, FirmwareJob, FirmwareStatus } from './firmwareManager.js';
import { parsePasswordChangeValue } from './utils/passwordParser.js';
import { trafficBus, type TrafficEvent } from './trafficBus.js';

export type LocalStartResult =
  | { ok: true; transactionId: number | null }
  | { ok: false; reason: 'not_connected' | 'connector_not_found' | 'already_charging' | 'reservation_conflict' | 'authorize_rejected' };

export type LocalStopResult =
  | { ok: true }
  | { ok: false; reason: 'connector_not_found' | 'no_active_transaction' };

export type StopTransactionReason =
  | 'DeAuthorized' | 'EmergencyStop' | 'EVDisconnected' | 'HardReset'
  | 'Local' | 'Other' | 'PowerLoss' | 'Reboot' | 'Remote' | 'SoftReset';

export interface BootOptions {
  chargeBoxSerialNumber: string;
  chargePointModel: string;
  chargePointSerialNumber: string;
  chargePointVendor: string;
  firmwareVersion: string;
}

export enum ConnectorState {
  Unavailable = 'Unavailable',
  Available = 'Available',
  Preparing = 'Preparing',
  Charging = 'Charging',
  Finishing = 'Finishing',
  Faulted = 'Faulted',
}

export enum ChargePointErrorCode {
  ConnectorLockFailure = 'ConnectorLockFailure',
  EVCommunicationError = 'EVCommunicationError',
  GroundFailure = 'GroundFailure',
  HighTemperature = 'HighTemperature',
  InternalError = 'InternalError',
  LocalListConflict = 'LocalListConflict',
  NoError = 'NoError',
  OtherError = 'OtherError',
  OverCurrentFailure = 'OverCurrentFailure',
  OverVoltage = 'OverVoltage',
  PowerMeterFailure = 'PowerMeterFailure',
  PowerSwitchFailure = 'PowerSwitchFailure',
  ReaderFailure = 'ReaderFailure',
  ResetFailure = 'ResetFailure',
  UnderVoltage = 'UnderVoltage',
  WeakSignal = 'WeakSignal',
}

interface Connector {
  id: number;
  state: ConnectorState;
  errorCode: ChargePointErrorCode;
  transactionId: number | null;
  meterValueWh: number;
  meterTimer: NodeJS.Timeout | null;
  idTag?: string;
  reservationId?: number | null;
  reservedIdTag?: string | null;
  reservationExpiryAt?: number | null;
  reservationTimer?: NodeJS.Timeout | null;
}

interface PowerModel {
  amps: number;  // default 16
  volts: number; // default 230
}

type OcppPayload = Record<string, unknown>;
type CallFrame = [2, string, string, OcppPayload];
type CallResultFrame = [3, string, OcppPayload];
type CallErrorFrame = [4, string, string, string, OcppPayload];
type OcppFrame = CallFrame | CallResultFrame | CallErrorFrame;

type PendingRequest = {
  resolve: (payload: OcppPayload) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
  action: string;
};

export class OcppClient {
  private readonly log: ReturnType<typeof logger.child>;
  private readonly logTraffic = (process.env.LOG_OCPP_TRAFFIC ?? '').toLowerCase() === 'true';
  private ws: WebSocket | null = null;
  private readonly pending = new Map<string, PendingRequest>();

  private hbTimer: NodeJS.Timeout | null = null;
  private heartbeatPeriod = 30_000;
  private meterPeriod = 5_000;
  public reconnectInterval = 2_000;
  private readonly reconnectMaxInterval = 30_000;
  private readonly reconnectJitterRatio = 0.2;
  private reconnectAttempts = 0;
  private isReconnecting = false;
  private msgCounter = 1;
  private shouldReconnect = true;
  private isShuttingDown = false;

  private readonly connectors = new Map<number, Connector>();

  private connected = false;
  private stationState: ConnectorState = ConnectorState.Unavailable;
  private lastMessageAt: number | null = null;
  private rebootDelayMs = 2_000;
  private power: PowerModel = { amps: 16, volts: 230 };
  private readonly configuration = new Map<string, { readonly: boolean; value: string }>();
  private chargerPassword = (process.env.ACE_LOGIN_PASSWORD ?? '').trim();
  private readonly firmwareManager: FirmwareManager;

  constructor(
    private readonly chargerId: string,
    private bootOpts: BootOptions,
    private readonly csmsBaseUrl: string,
    connectorCount = 1,
    private readonly brandProfile: BrandProfile | null = null
  ) {
    this.log = logger.child({ ocppid: chargerId });
    for (const item of defaultConfiguration) {
      this.configuration.set(item.key, { readonly: item.readonly, value: item.value });
    }
    if (this.brandProfile?.supportedProfiles?.length) {
      this.configuration.set('SupportedProfiles', {
        readonly: true,
        value: this.brandProfile.supportedProfiles.join(',')
      });
    }

    this.firmwareManager = new FirmwareManager({
      schedule: { downloadMs: 500, installMs: 500 },
      onStatus: async status => {
        await this.firmwareStatusNotification(status as Exclude<FirmwareStatus, 'Idle'>);
      },
      onInstalled: version => {
        this.bootOpts = { ...this.bootOpts, firmwareVersion: version };
      },
      onVersionResolve: location => this.resolveFirmwareVersion(location)
    });
    for (let i = 1; i <= connectorCount; i++) {
      this.connectors.set(i, {
        id: i,
        state: ConnectorState.Available,
        errorCode: ChargePointErrorCode.NoError,
        transactionId: null,
        meterValueWh: Math.floor(Math.random() * 500) + 1000,
        meterTimer: null,
        reservationId: null,
        reservedIdTag: null,
        reservationExpiryAt: null,
        reservationTimer: null
      });
    }
  }

  private clearReservation(connector: Connector) {
    if (connector.reservationTimer) {
      clearTimeout(connector.reservationTimer);
      connector.reservationTimer = null;
    }
    connector.reservationId = null;
    connector.reservedIdTag = null;
    connector.reservationExpiryAt = null;
  }

  private canStartWithIdTag(connector: Connector, idTag: string): boolean {
    if (connector.reservationId == null) return true;

    const expiresAt = connector.reservationExpiryAt ?? null;
    if (expiresAt != null && expiresAt <= Date.now()) {
      this.clearReservation(connector);
      if (connector.state === ConnectorState.Unavailable && connector.transactionId == null) {
        connector.state = ConnectorState.Available;
        this.stationState = ConnectorState.Available;
        this.safeCall('StatusNotification', this.statusPayload(connector.id, ConnectorState.Available));
      }
      return true;
    }

    if (connector.reservedIdTag && connector.reservedIdTag !== idTag) {
      return false;
    }

    this.clearReservation(connector);
    return true;
  }

  /* ===========================
   * Public getters & controls
   * =========================== */
  private connectPromise: Promise<void> | null = null;
  private resolveConnectPromise: (() => void) | null = null;
  private rejectConnectPromise: ((error: Error) => void) | null = null;

  public isConnected() { return this.connected; }
  public getState() { return this.stationState; }
  public getStateAll() {
    return [...this.connectors.values()].map(c => ({
      id: c.id,
      state: c.state,
      errorCode: c.errorCode,
      transactionId: c.transactionId
    }));
  }
  public getTransactionId(connectorId?: number) {
    if (connectorId) return this.connectors.get(connectorId)?.transactionId ?? null;
    for (const c of this.connectors.values()) if (c.transactionId) return c.transactionId;
    return null;
  }
  public getPower() {
    const watts = this.power.amps * this.power.volts;
    return { ...this.power, watts };
  }
  public setPower(amps?: number, volts?: number) {
    if (typeof amps === 'number' && amps > 0) this.power.amps = amps;
    if (typeof volts === 'number' && volts > 0) this.power.volts = volts;
  }
  public getHeartbeatPeriodMs() { return this.heartbeatPeriod; }
  public getLastMessageAt() { return this.lastMessageAt; }
  public getFirmwareVersion() { return this.bootOpts.firmwareVersion; }
  public isActionAllowed(action: string) { return isActionAllowed(this.brandProfile, action); }
  public isConfigKeyAllowed(key: string) { return isConfigKeyAllowed(this.brandProfile, key); }
  public setChargerPassword(password: string | undefined) {
    this.chargerPassword = typeof password === 'string' ? password : '';
  }

  /* ===========================
   * Lifecycle
   * =========================== */
  public async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = new Promise<void>((resolve, reject) => {
      this.resolveConnectPromise = resolve;
      this.rejectConnectPromise = reject;
    });

    // avoid unhandled rejection when consumers do not await .connect()
    this.connectPromise.catch(err => this.log.warn(`Connect rejected (unhandled): ${err.message}`));

    this.shouldReconnect = true;
    this.isShuttingDown = false;
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
    }
    const url = `${this.csmsBaseUrl.replace(/\/$/, '')}/${this.bootOpts.chargeBoxSerialNumber}`;
    this.log.info(`🔗 Connecting to ${url} (${this.chargerId})`);

    this.ws = new WebSocket(url, ['ocpp1.6'], {
      headers: {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Protocol': 'ocpp1.6'
      }
    });

    this.ws
      .on('open', async () => {
        this.lastMessageAt = Date.now();
        this.log.info('✅ WS open');
        this.connected = true;
        this.isReconnecting = false;
        this.reconnectAttempts = 0;
        this.stationState = ConnectorState.Available;
        this.startHeartbeat();

        try {
          const bootResult = await this.sendCall('BootNotification', { ...this.bootOpts });
          const negotiatedInterval = typeof bootResult.interval === 'number' ? bootResult.interval : null;
          if (negotiatedInterval) {
            this.heartbeatPeriod = negotiatedInterval * 1000;
            this.startHeartbeat();
            this.log.info(`💓 Heartbeat negotiated → ${negotiatedInterval}s`);
          }
          await this.safeCall('StatusNotification', this.statusPayload(1, ConnectorState.Available));
          if (this.resolveConnectPromise) {
            this.resolveConnectPromise();
          }
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          this.log.error(`❌ Boot failed: ${msg}`);
          if (this.rejectConnectPromise) {
            this.rejectConnectPromise(new Error(`Boot failed: ${msg}`));
          }
        } finally {
          this.resolveConnectPromise = null;
          this.rejectConnectPromise = null;
          this.connectPromise = null;
        }
      })
      .on('message', raw => {
        this.lastMessageAt = Date.now();
        this.handleIncoming(raw.toString()).catch(err => {
          this.log.error(`Message handler failed: ${err instanceof Error ? err.message : String(err)}`);
        });
      })
      .on('ping', () => this.ws?.pong())
      .on('close', code => {
        this.lastMessageAt = Date.now();
        this.log.warn(`⚠️ WS closed (${code})`);
        if (!this.connected && this.rejectConnectPromise) {
          this.rejectConnectPromise(new Error(`WebSocket closed (${code})`));
        }
        this.connected = false;
        this.stationState = ConnectorState.Unavailable;
        this.rejectAllPendingRequests(`WebSocket closed (${code})`);

        this.connectPromise = null;
        this.resolveConnectPromise = null;
        this.rejectConnectPromise = null;

        if (this.shouldReconnect && !this.isShuttingDown) {
          this.reconnect();
        }
      })
      .on('error', err => {
        this.lastMessageAt = Date.now();
        this.log.error(`❌ WS error: ${err.message}`);
        if (!this.connected && this.rejectConnectPromise) {
          this.rejectConnectPromise(new Error(`WebSocket error (${err.message})`));
        }
        this.connected = false;
        this.stationState = ConnectorState.Unavailable;
        this.rejectAllPendingRequests(`WebSocket error (${err.message})`);

        this.connectPromise = null;
        this.resolveConnectPromise = null;
        this.rejectConnectPromise = null;

        if (this.shouldReconnect && !this.isShuttingDown) {
          this.reconnect();
        }
      });
  }

  public async disconnectWs() {
    this.shouldReconnect = false;
    this.stopTimers();
    this.rejectAllPendingRequests('Disconnected by control command');
    if (this.rejectConnectPromise) {
      this.rejectConnectPromise(new Error('Disconnected by control command'));
    }

    this.resolveConnectPromise = null;
    this.rejectConnectPromise = null;
    this.connectPromise = null;

    if (this.ws && this.ws.readyState === this.ws.OPEN) this.ws.close(1000);
    if (this.ws && this.ws.readyState === this.ws.CONNECTING) this.ws.terminate();
  }
  public async reconnectWs() {
    this.shouldReconnect = true;
    return this.connect();
  }

  public async shutdown() {
    this.isShuttingDown = true;
    this.shouldReconnect = false;
    this.stopTimers();
    this.rejectAllPendingRequests('Client shutting down');

    if (!this.ws) return;

    if (this.rejectConnectPromise) {
      this.rejectConnectPromise(new Error('Client shutting down'));
    }
    this.resolveConnectPromise = null;
    this.rejectConnectPromise = null;
    this.connectPromise = null;

    await new Promise<void>((resolve) => {
      const socket = this.ws;
      if (!socket) {
        resolve();
        return;
      }

      const finish = () => {
        socket.removeAllListeners('close');
        resolve();
      };

      if (socket.readyState === WebSocket.CLOSED) {
        finish();
        return;
      }

      socket.once('close', finish);

      if (socket.readyState === WebSocket.CONNECTING) {
        socket.terminate();
        return;
      }

      if (socket.readyState === WebSocket.OPEN) {
        socket.close(1000);
        setTimeout(() => {
          if (socket.readyState !== WebSocket.CLOSED) socket.terminate();
        }, 2000);
      }
    });
  }

  /* ===========================
   * Helpers
   * =========================== */
  private reconnect(): void {
    if (this.isReconnecting) return;
    this.isReconnecting = true;
    this.stopTimers();
    const nextAttempt = this.reconnectAttempts + 1;
    const reconnectBaseInterval = Math.max(100, this.reconnectInterval);
    const exponentialDelay = Math.min(
      this.reconnectMaxInterval,
      reconnectBaseInterval * 2 ** Math.max(0, nextAttempt - 1),
    );
    const jitterSpan = exponentialDelay * this.reconnectJitterRatio;
    const delay = Math.max(
      100,
      Math.round(exponentialDelay - jitterSpan + Math.random() * jitterSpan * 2),
    );

    this.reconnectAttempts = nextAttempt;
    this.log.warn(`↻ Reconnect attempt #${nextAttempt} in ${delay}ms`);

    setTimeout(() => {
      this.isReconnecting = false;
      if (!this.shouldReconnect || this.isShuttingDown) return;
      this.connect();
    }, delay);
  }

  private rejectAllPendingRequests(reason: string) {
    if (this.pending.size === 0) return;

    for (const [requestId, pendingRequest] of this.pending.entries()) {
      clearTimeout(pendingRequest.timeout);
      pendingRequest.reject(new Error(`${pendingRequest.action} aborted: ${reason}`));
      this.pending.delete(requestId);
    }
  }
  private async performReboot(type: 'Hard' | 'Soft' = 'Hard') {
    // Stop loops, end transactions gracefully on Soft
    for (const c of this.connectors.values()) {
      if (type === 'Soft' && c.transactionId != null) {
        await this.doStopConnector(c, 'Local'); // gracefully end
      }
    }

    // Notify Unavailable (common practice before restart)
    await this.safeCall('StatusNotification', this.statusPayload(0, ConnectorState.Unavailable));
    for (const c of this.connectors.values()) {
      if (c.state !== ConnectorState.Unavailable) {
        c.state = ConnectorState.Unavailable;
        await this.safeCall('StatusNotification', this.statusPayload(c.id, ConnectorState.Unavailable));
      }
    }

    // Disconnect WS to simulate actual reboot while keeping reconnect intent
    this.stopTimers();
    this.rejectAllPendingRequests('Charger rebooting');
    if (this.ws && this.ws.readyState === this.ws.OPEN) this.ws.close(1000);
    if (this.ws && this.ws.readyState === this.ws.CONNECTING) this.ws.terminate();

    // Wait to simulate power cycle / restart
    await new Promise(res => setTimeout(res, this.rebootDelayMs));

    // Reconnect (your connect() already sends BootNotification & sets Available)
    this.reconnectWs();
  }
  public async localReset(type: 'Hard' | 'Soft' = 'Hard') {
    await this.performReboot(type);
  }
  private newId(): string { return (this.msgCounter++).toString(); }
  private rawSend(frame: OcppFrame, label: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) throw new Error(`WS not open – cannot send ${label}`);
    this.ws.send(JSON.stringify(frame));
    this.log.debug({ frame }, `📤 ${label}`);
    if (this.logTraffic) {
      this.log.info({ frame }, 'OCPP ->');
    }
    const isCall = frame[0] === 2;
    trafficBus.emit('message', {
      ts: new Date().toISOString(),
      evseId: this.chargerId,
      dir: 'send',
      msgType: frame[0],
      action: isCall ? String(frame[2]) : undefined,
      msgId: frame[1],
      payload: isCall ? (frame as CallFrame)[3] : frame[0] === 4 ? (frame as CallErrorFrame)[4] : (frame as CallResultFrame)[2],
    } satisfies TrafficEvent);
  }
  private sendCall(action: string, payload: OcppPayload, timeoutMs = 15000): Promise<OcppPayload> {
    return new Promise((resolve, reject) => {
      const uniqueId = this.newId();
      const frame: CallFrame = [2, uniqueId, action, payload];
      const t = setTimeout(() => {
        if (this.pending.has(uniqueId)) {
          this.pending.delete(uniqueId);
          reject(new Error(`${action} timed out after ${timeoutMs}ms`));
        }
      }, timeoutMs);

      this.pending.set(uniqueId, {
        action,
        timeout: t,
        resolve: (result: OcppPayload) => {
          clearTimeout(t);
          resolve(result);
        },
        reject: (error: Error) => {
          clearTimeout(t);
          reject(error);
        }
      });

      try {
        this.rawSend(frame, action);
      } catch (err: unknown) {
        // If rawSend fails synchronously (WS not open), reject the pending request and the promise
        clearTimeout(t);
        this.pending.delete(uniqueId);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }
  private sendCallResult(uniqueId: string, payload: OcppPayload, label: string) {
    try {
      const frame: CallResultFrame = [3, uniqueId, payload];
      this.rawSend(frame, label);
    } catch (err: unknown) {
      this.log.warn(`Failed to send CALLRESULT: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  private sendCallError(uniqueId: string, errorCode: string, errorDescription: string, errorDetails: OcppPayload = {}) {
    try {
      const frame: CallErrorFrame = [4, uniqueId, errorCode, errorDescription, errorDetails];
      this.rawSend(frame, `${errorCode}.CALLERROR`);
    } catch (err: unknown) {
      this.log.warn(`Failed to send CALLERROR: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  private isValidFrame(raw: unknown): raw is OcppFrame {
    return Array.isArray(raw) && raw.length >= 3 && typeof raw[0] === 'number';
  }
  private validateCallPayload(action: string, payload: unknown): string | null {
    const result = validateCsCall(action, payload);
    if (result.valid) return null;
    return result.message ?? 'Invalid payload';
  }
  private statusPayload(connectorId: number, status: ConnectorState, errorCode?: ChargePointErrorCode) {
    const connectorError = this.connectors.get(connectorId)?.errorCode ?? 'NoError';
    return { connectorId, errorCode: errorCode ?? connectorError, status };
  }
  private watts() { return this.power.amps * this.power.volts; }

  /* ===========================
   * Incoming (CSMS → CP)
   * =========================== */
  private async handleIncoming(raw: string): Promise<void> {
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { this.log.error('❌ Bad JSON'); return; }
    if (this.logTraffic) {
      this.log.info({ frame: parsed }, 'OCPP <-');
    }
    if (!this.isValidFrame(parsed)) {
      this.log.warn('⚠️ Invalid OCPP frame received');
      return;
    }
    const msg = parsed;
    const isCall = msg[0] === 2;
    trafficBus.emit('message', {
      ts: new Date().toISOString(),
      evseId: this.chargerId,
      dir: 'recv',
      msgType: msg[0],
      action: isCall ? String(msg[2]) : undefined,
      msgId: msg[1],
      payload: isCall ? (msg as CallFrame)[3] : msg[0] === 4 ? (msg as CallErrorFrame)[4] : (msg as CallResultFrame)[2],
    } satisfies TrafficEvent);
    const type = msg[0];

    // CALLRESULT
    if (type === 3) {
      const uniqueId: string = msg[1];
      const payload: OcppPayload = msg[2];
      const pending = this.pending.get(uniqueId);
      if (pending) {
        pending.resolve(payload);
        this.pending.delete(uniqueId);
      } else {
        this.log.warn(`⚠️ Unsolicited CALLRESULT id=${uniqueId}`);
      }
      return;
    }

    // CALLERROR
    if (type === 4) {
      const uniqueId: string = msg[1];
      const errorCode: string = msg[2];
      const errorDescription: string = msg[3];
      const pending = this.pending.get(uniqueId);
      if (pending) {
        pending.reject(new Error(`${pending.action} failed: ${errorCode} ${errorDescription}`));
        this.pending.delete(uniqueId);
      } else {
        this.log.warn(`⚠️ Unsolicited CALLERROR id=${uniqueId}: ${errorCode}`);
      }
      return;
    }

    // Only handle CALL
    if (type !== 2) return;
    const uniqueId = msg[1];
    const action = msg[2];
    const payload: OcppPayload = (msg as CallFrame)[3];

    if (typeof uniqueId !== 'string' || typeof action !== 'string') {
      if (typeof uniqueId === 'string') {
        this.sendCallError(uniqueId, 'FormationViolation', 'Invalid CALL frame');
      }
      return;
    }

    if (!isActionAllowed(this.brandProfile, action)) {
      this.sendCallError(uniqueId, 'NotSupported', `Action not supported: ${action}`);
      return;
    }

    const validationError = this.validateCallPayload(action, payload);
    if (validationError) {
      this.sendCallError(uniqueId, 'FormationViolation', validationError);
      return;
    }

    switch (action) {
      case 'GetConfiguration':
        this.handleGetConfiguration(uniqueId, payload);
        break;

      case 'ChangeConfiguration':
        this.handleChangeConfiguration(uniqueId, payload as { key: string; value: string });
        break;

      case 'ChangeAvailability':
        this.handleChangeAvailability(uniqueId, payload as { connectorId: number; type: 'Operative' | 'Inoperative' });
        break;

      case 'ClearCache':
        this.sendCallResult(uniqueId, { status: 'Accepted' }, 'ClearCache.CALLRESULT');
        break;

      case 'RemoteStartTransaction':
        this.handleRemoteStart(uniqueId, payload as { connectorId?: number; idTag: string });
        break;

      case 'Reset': {
        const kind = (payload?.type === 'Soft' ? 'Soft' : 'Hard') as 'Hard' | 'Soft';
        // Immediately accept (or add policy to reject if busy)
        this.sendCallResult(uniqueId, { status: 'Accepted' }, 'Reset.CALLRESULT');

        // Kick off the reboot cycle (don’t block the message loop)
        this.performReboot(kind).catch(e => this.log.error(`Reboot failed: ${e.message}`));
        break;
      }


      case 'RemoteStopTransaction':
        this.handleRemoteStop(uniqueId, payload as { transactionId?: number; connectorId?: number });
        break;

      case 'UnlockConnector':
        this.handleUnlockConnector(uniqueId, payload as { connectorId: number });
        break;

      case 'UpdateFirmware':
        this.handleUpdateFirmware(uniqueId, payload as { location: string; retrieveDate: string; retries?: number; retryInterval?: number });
        break;

      case 'GetDiagnostics':
        this.handleGetDiagnostics(uniqueId, payload as { location: string });
        break;

      case 'TriggerMessage':
        this.handleTriggerMessage(uniqueId, payload as { requestedMessage: string; connectorId?: number });
        break;

      case 'ReserveNow':
        this.handleReserveNow(uniqueId, payload as { connectorId: number; expiryDate: string; idTag: string; reservationId: number });
        break;

      case 'CancelReservation':
        this.handleCancelReservation(uniqueId, payload as { reservationId: number });
        break;

      default:
        this.sendCallError(uniqueId, 'NotSupported', `Unsupported action: ${action}`);
    }
  }

  private async handleRemoteStart(uniqueId: string, payload: { connectorId?: number; idTag: string }) {
    const connectorId = payload.connectorId ?? 1;
    const c = this.connectors.get(connectorId);
    if (!c) {
      this.sendCallResult(uniqueId, { status: 'Rejected' }, 'RemoteStartTransaction.CALLRESULT');
      return;
    }

    if (!this.canStartWithIdTag(c, payload.idTag)) {
      this.sendCallResult(uniqueId, { status: 'Rejected' }, 'RemoteStartTransaction.CALLRESULT');
      return;
    }

    const authorizeStatus = await this.authorize(payload.idTag);
    if (authorizeStatus !== 'Accepted') {
      this.sendCallResult(uniqueId, { status: 'Rejected' }, 'RemoteStartTransaction.CALLRESULT');
      return;
    }

    this.sendCallResult(uniqueId, { status: 'Accepted' }, 'RemoteStartTransaction.CALLRESULT');

    c.idTag = payload.idTag;
    c.state = ConnectorState.Preparing;
    this.stationState = ConnectorState.Preparing;
    await this.safeCall('StatusNotification', this.statusPayload(connectorId, ConnectorState.Preparing));

    const startRes = await this.sendCall('StartTransaction', {
      timestamp: new Date().toISOString(),
      connectorId,
      meterStart: c.meterValueWh,
      idTag: payload.idTag
    });

    c.transactionId = typeof startRes.transactionId === 'number' ? startRes.transactionId : null;
    c.state = ConnectorState.Charging;
    this.stationState = ConnectorState.Charging;
    await this.safeCall('StatusNotification', this.statusPayload(connectorId, ConnectorState.Charging));

    if (c.transactionId != null) {
      this.startMeterLoop(c);
    }
  }

  private async handleRemoteStop(uniqueId: string, payload: { transactionId?: number; connectorId?: number }) {
    let c: Connector | undefined;
    if (payload.connectorId) {
      c = this.connectors.get(payload.connectorId);
    } else if (payload.transactionId) {
      c = [...this.connectors.values()].find(conn => conn.transactionId === payload.transactionId);
    }

    if (!c || c.transactionId == null) {
      this.sendCallResult(uniqueId, { status: 'Rejected' }, 'RemoteStopTransaction.CALLRESULT');
      return;
    }

    this.sendCallResult(uniqueId, { status: 'Accepted' }, 'RemoteStopTransaction.CALLRESULT');
    await this.doStopConnector(c, 'Remote');
  }

  private handleGetConfiguration(uniqueId: string, payload: { key?: string[] }) {
    const result = this.applyGetConfiguration(payload);
    this.sendCallResult(uniqueId, result, 'GetConfiguration.CALLRESULT');
  }

  private handleChangeConfiguration(uniqueId: string, payload: { key: string; value: string }) {
    const result = this.applyChangeConfiguration(payload);
    this.sendCallResult(uniqueId, result, 'ChangeConfiguration.CALLRESULT');
  }

  private applyConfiguration(key: string, value: string) {
    if (key === 'HeartbeatInterval') {
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds > 0) {
        this.heartbeatPeriod = seconds * 1000;
        this.startHeartbeat();
      }
    }

    if (key === 'MeterValueSampleInterval') {
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds > 0) {
        this.meterPeriod = seconds * 1000;
      }
    }
  }

  private handleChangeAvailability(uniqueId: string, payload: { connectorId: number; type: 'Operative' | 'Inoperative' }) {
    const result = this.applyChangeAvailability(payload);
    this.sendCallResult(uniqueId, result, 'ChangeAvailability.CALLRESULT');
  }

  private handleUnlockConnector(uniqueId: string, payload: { connectorId: number }) {
    const result = this.applyUnlockConnector(payload);
    this.sendCallResult(uniqueId, result, 'UnlockConnector.CALLRESULT');
  }

  private handleUpdateFirmware(
    uniqueId: string,
    payload: { location: string; retrieveDate: string; retries?: number; retryInterval?: number }
  ) {
    const result = this.applyUpdateFirmware(payload);
    if (result.error) {
      this.sendCallError(uniqueId, result.error, result.message);
      return;
    }
    this.sendCallResult(uniqueId, { status: result.status }, 'UpdateFirmware.CALLRESULT');
  }

  private handleGetDiagnostics(uniqueId: string, payload: { location: string }) {
    const result = this.applyGetDiagnostics(payload);
    if (result.error) {
      this.sendCallError(uniqueId, result.error, result.message);
      return;
    }
    this.sendCallResult(uniqueId, { fileName: result.fileName }, 'GetDiagnostics.CALLRESULT');
  }

  private handleTriggerMessage(uniqueId: string, payload: { requestedMessage: string; connectorId?: number }) {
    const requested = payload?.requestedMessage;
    if (!requested) {
      this.sendCallError(uniqueId, 'FormationViolation', 'Missing requestedMessage');
      return;
    }

    const connectorId = payload?.connectorId ?? 1;

    switch (requested) {
      case 'Heartbeat':
        this.sendCallResult(uniqueId, { status: 'Accepted' }, 'TriggerMessage.CALLRESULT');
        this.safeCall('Heartbeat', {});
        return;

      case 'BootNotification':
        this.sendCallResult(uniqueId, { status: 'Accepted' }, 'TriggerMessage.CALLRESULT');
        this.sendCall('BootNotification', { ...this.bootOpts }).catch(() => undefined);
        return;

      case 'StatusNotification':
        this.sendCallResult(uniqueId, { status: 'Accepted' }, 'TriggerMessage.CALLRESULT');
        this.safeCall('StatusNotification', this.statusPayload(connectorId, this.connectors.get(connectorId)?.state ?? ConnectorState.Available));
        return;

      case 'MeterValues':
        this.sendCallResult(uniqueId, { status: 'Accepted' }, 'TriggerMessage.CALLRESULT');
        this.sendMeterValues(connectorId).catch(() => undefined);
        return;

      case 'DiagnosticsStatusNotification':
        this.sendCallResult(uniqueId, { status: 'Accepted' }, 'TriggerMessage.CALLRESULT');
        this.diagnosticsStatusNotification('Uploaded').catch(() => undefined);
        return;

      case 'FirmwareStatusNotification':
        this.sendCallResult(uniqueId, { status: 'Accepted' }, 'TriggerMessage.CALLRESULT');
        this.firmwareStatusNotification('Installed').catch(() => undefined);
        return;

      default:
        this.sendCallResult(uniqueId, { status: 'Rejected' }, 'TriggerMessage.CALLRESULT');
        return;
    }
  }

  private handleReserveNow(uniqueId: string, payload: { connectorId: number; expiryDate: string; idTag: string; reservationId: number }) {
    const result = this.applyReserveNow(payload);
    if (result.error) {
      this.sendCallError(uniqueId, result.error, result.message);
      return;
    }
    this.sendCallResult(uniqueId, { status: result.status }, 'ReserveNow.CALLRESULT');
  }

  private handleCancelReservation(uniqueId: string, payload: { reservationId: number }) {
    const result = this.applyCancelReservation(payload);
    if (result.error) {
      this.sendCallError(uniqueId, result.error, result.message);
      return;
    }
    this.sendCallResult(uniqueId, { status: result.status }, 'CancelReservation.CALLRESULT');
  }

  /* ===========================
   * Loops & timers
   * =========================== */
  private startMeterLoop(c: Connector) {
    this.stopMeterLoop(c);
    c.meterTimer = setInterval(async () => {
      const incrementWh = this.watts() * (this.meterPeriod / 3600000);
      const variedWh = incrementWh * (0.9 + Math.random() * 0.2);
      c.meterValueWh += Math.round(variedWh);

      if (c.transactionId == null) return;
      await this.safeCall('MeterValues', {
        connectorId: c.id,
        transactionId: c.transactionId,
        meterValue: [{
          timestamp: new Date().toISOString(),
          sampledValue: [{
            value: (c.meterValueWh / 1000).toFixed(3),
            context: 'Sample.Periodic',
            measurand: 'Energy.Active.Import.Register',
            location: 'Outlet',
            unit: 'kWh'
          }]
        }]
      });
    }, this.meterPeriod);
  }

  private stopMeterLoop(c: Connector) {
    if (c.meterTimer) {
      clearInterval(c.meterTimer);
      c.meterTimer = null;
    }
  }

  private startHeartbeat() {
    if (this.hbTimer) clearInterval(this.hbTimer);
    this.hbTimer = setInterval(() => {
      this.safeCall('Heartbeat', {});
    }, this.heartbeatPeriod);
  }

  private stopTimers() {
    if (this.hbTimer) { clearInterval(this.hbTimer); this.hbTimer = null; }
    for (const c of this.connectors.values()) this.stopMeterLoop(c);
  }

  private async safeCall(action: string, payload: OcppPayload, timeoutMs = 8000) {
    try { await this.sendCall(action, payload, timeoutMs); }
    catch (e: unknown) { this.log.warn(`${action} soft-failed: ${e instanceof Error ? e.message : String(e)}`); }
  }

  /* ===========================
   * Public control helpers
   * =========================== */
  public async localStart(connectorId = 1, idTag = 'LOCALTAG'): Promise<LocalStartResult> {
    if (!this.connected) return { ok: false, reason: 'not_connected' };
    const c = this.connectors.get(connectorId);
    if (!c) return { ok: false, reason: 'connector_not_found' };
    if (c.transactionId != null) return { ok: false, reason: 'already_charging' };
    if (!this.canStartWithIdTag(c, idTag)) return { ok: false, reason: 'reservation_conflict' };

    const authorizeStatus = await this.authorize(idTag);
    if (authorizeStatus !== 'Accepted') return { ok: false, reason: 'authorize_rejected' };

    c.idTag = idTag;
    c.state = ConnectorState.Preparing;
    this.stationState = ConnectorState.Preparing;
    await this.safeCall('StatusNotification', this.statusPayload(connectorId, ConnectorState.Preparing));

    const startRes = await this.sendCall('StartTransaction', {
      timestamp: new Date().toISOString(),
      connectorId,
      meterStart: c.meterValueWh,
      idTag
    });

    c.transactionId = typeof startRes.transactionId === 'number' ? startRes.transactionId : null;
    c.state = ConnectorState.Charging;
    this.stationState = ConnectorState.Charging;
    await this.safeCall('StatusNotification', this.statusPayload(connectorId, ConnectorState.Charging));
    if (c.transactionId != null) this.startMeterLoop(c);
    return { ok: true, transactionId: c.transactionId };
  }

  public async stopConnector(connectorId = 1): Promise<LocalStopResult> {
    const c = this.connectors.get(connectorId);
    if (!c) return { ok: false, reason: 'connector_not_found' };
    if (c.transactionId == null) return { ok: false, reason: 'no_active_transaction' };
    await this.doStopConnector(c, 'Local');
    return { ok: true };
  }

  public async setConnectorStatus(connectorId = 1, state: ConnectorState) {
    const c = this.connectors.get(connectorId);
    if (!c) return;

    if (state !== ConnectorState.Charging && c.transactionId != null) {
      await this.doStopConnector(c, 'Remote');
    }
    c.state = state;
    this.stationState = state;
    await this.safeCall('StatusNotification', this.statusPayload(connectorId, state, c.errorCode));
  }

  public async setConnectorError(connectorId: number, errorCode: ChargePointErrorCode): Promise<boolean> {
    const c = this.connectors.get(connectorId);
    if (!c) return false;

    c.errorCode = errorCode;

    if (errorCode !== ChargePointErrorCode.NoError) {
      if (c.transactionId != null) {
        await this.doStopConnector(c, 'Error');
      }
      c.state = ConnectorState.Faulted;
      this.stationState = ConnectorState.Faulted;
      await this.safeCall('StatusNotification', this.statusPayload(connectorId, ConnectorState.Faulted, errorCode));
      return true;
    }

    c.state = ConnectorState.Available;
    this.stationState = ConnectorState.Available;
    await this.safeCall('StatusNotification', this.statusPayload(connectorId, ConnectorState.Available, ChargePointErrorCode.NoError));
    return true;
  }

  /* ===========================
   * Internal: doStopConnector
   * =========================== */
  private async doStopConnector(c: Connector, reason: StopTransactionReason | 'Error') {
    this.stopMeterLoop(c);

    c.state = ConnectorState.Finishing;
    this.stationState = ConnectorState.Finishing;
    await this.safeCall('StatusNotification', this.statusPayload(c.id, ConnectorState.Finishing, c.errorCode));

    if (c.transactionId != null) {
      const wh = c.meterValueWh;

      await this.safeCall('MeterValues', {
        connectorId: c.id,
        transactionId: c.transactionId,
        meterValue: [{
          timestamp: new Date().toISOString(),
          sampledValue: [{ value: (wh / 1000).toFixed(3), context: 'Transaction.End', unit: 'kWh' }]
        }]
      });

      await this.safeCall('StopTransaction', {
        timestamp: new Date().toISOString(),
        transactionId: c.transactionId,
        meterStop: wh,
        reason,
        idTag: c.idTag || '000000'
      });
    }

    c.transactionId = null;
    if (c.errorCode === ChargePointErrorCode.NoError) {
      c.state = ConnectorState.Available;
      this.stationState = ConnectorState.Available;
      await this.safeCall('StatusNotification', this.statusPayload(c.id, ConnectorState.Available, ChargePointErrorCode.NoError));
    }
  }

  public async authorize(idTag: string): Promise<'Accepted' | 'Rejected' | 'Invalid' | 'Blocked' | 'Expired' | 'ConcurrentTx'> {
    try {
      const res = await this.sendCall('Authorize', { idTag });
      const tagInfo = res.idTagInfo as OcppPayload | undefined;
      const status = String(tagInfo?.status ?? 'Rejected');
      return status as 'Accepted' | 'Rejected' | 'Invalid' | 'Blocked' | 'Expired' | 'ConcurrentTx';
    } catch (e: unknown) {
      this.log.warn(`Authorize failed: ${e instanceof Error ? e.message : String(e)}`);
      return 'Rejected';
    }
  }

  public async dataTransfer(vendorId: string, messageId?: string, data?: string) {
    const payload: OcppPayload = { vendorId };
    if (messageId) payload.messageId = messageId;
    if (data) payload.data = data;
    return this.sendCall('DataTransfer', payload);
  }

  public setFirmwareTimings(schedule: { downloadMs?: number; installMs?: number }) {
    this.firmwareManager.setSchedule(schedule);
  }

  public async sendBootNotification() {
    return this.sendCall('BootNotification', { ...this.bootOpts });
  }

  public async sendHeartbeat() {
    return this.sendCall('Heartbeat', {});
  }

  public async sendStatusNotification(connectorId: number, status: ConnectorState, errorCode?: ChargePointErrorCode) {
    return this.sendCall('StatusNotification', this.statusPayload(connectorId, status, errorCode));
  }

  public async sendMeterValues(connectorId: number, transactionId?: number) {
    const c = this.connectors.get(connectorId);
    if (!c) throw new Error('connector_not_found');
    const txId = transactionId ?? c.transactionId;
    if (!txId) throw new Error('transaction_not_found');

    return this.sendCall('MeterValues', {
      connectorId,
      transactionId: txId,
      meterValue: [{
        timestamp: new Date().toISOString(),
        sampledValue: [{
          value: (c.meterValueWh / 1000).toFixed(3),
          context: 'Sample.Periodic',
          measurand: 'Energy.Active.Import.Register',
          location: 'Outlet',
          unit: 'kWh'
        }]
      }]
    });
  }

  public async startTransaction(connectorId = 1, idTag = 'LOCALTAG') {
    await this.localStart(connectorId, idTag);
    return this.connectors.get(connectorId)?.transactionId ?? null;
  }

  public async stopTransaction(connectorId = 1, reason: StopTransactionReason = 'Remote') {
    const c = this.connectors.get(connectorId);
    if (!c || c.transactionId == null) return false;
    await this.doStopConnector(c, reason);
    return true;
  }

  public async diagnosticsStatusNotification(status: 'Idle' | 'Uploaded' | 'UploadFailed') {
    return this.sendCall('DiagnosticsStatusNotification', { status });
  }

  public async firmwareStatusNotification(
    status: 'Downloading' | 'Downloaded' | 'Installing' | 'Installed' | 'DownloadFailed' | 'InstallationFailed'
  ) {
    const result = await this.sendCall('FirmwareStatusNotification', { status });
    if (status === 'Installed' && this.brandProfile?.firmware?.rebootAfterInstall) {
      this.performReboot('Soft').catch(e => this.log.warn(`Reboot after firmware failed: ${e.message}`));
    }
    return result;
  }

  private resolveFirmwareVersion(location: string): string {
    const match = location.match(/\d+(?:\.\d+)+/g) ?? location.match(/\d+/g);
    const version = match ? match[match.length - 1] : '';
    if (version) return version.replace(/\.+$/, '');
    return `${this.bootOpts.firmwareVersion}-updated`;
  }

  private parseVersionNumbers(version: string): number[] {
    const matches = version.match(/\d+/g) ?? [];
    return matches.map(v => Number(v)).filter(v => Number.isFinite(v));
  }

  private isVersionGreater(nextVersion: string, currentVersion: string): boolean {
    const next = this.parseVersionNumbers(nextVersion);
    const current = this.parseVersionNumbers(currentVersion);
    const length = Math.max(next.length, current.length);
    for (let index = 0; index < length; index += 1) {
      const nextPart = next[index] ?? 0;
      const currentPart = current[index] ?? 0;
      if (nextPart > currentPart) return true;
      if (nextPart < currentPart) return false;
    }
    return false;
  }

  private compareVersions(leftVersion: string, rightVersion: string): number {
    const left = this.parseVersionNumbers(leftVersion);
    const right = this.parseVersionNumbers(rightVersion);
    const length = Math.max(left.length, right.length);
    for (let index = 0; index < length; index += 1) {
      const leftPart = left[index] ?? 0;
      const rightPart = right[index] ?? 0;
      if (leftPart > rightPart) return 1;
      if (leftPart < rightPart) return -1;
    }
    return 0;
  }

  private isVersionFamily(version: string, family: string): boolean {
    const values = this.parseVersionNumbers(version);
    const familyValues = this.parseVersionNumbers(family);
    if (values.length < familyValues.length) return false;
    for (let index = 0; index < familyValues.length; index += 1) {
      if ((values[index] ?? 0) !== familyValues[index]) return false;
    }
    return true;
  }

  private validateNg9xxFirmwarePath(targetVersion: string, location: string): string | null {
    const currentVersion = this.bootOpts.firmwareVersion;
    const locationValue = location.toLowerCase();
    const currentVs662 = this.compareVersions(currentVersion, '6.6.2');
    if (currentVs662 >= 0) return null;

    const currentVs412 = this.compareVersions(currentVersion, '4.12.0');
    const currentVs414 = this.compareVersions(currentVersion, '4.14.0');
    const currentVs561 = this.compareVersions(currentVersion, '5.6.1');

    if (currentVs412 > 0 && currentVs414 < 0) {
      return 'Firmware 4.13.x path is undefined; manual upgrade guidance required';
    }

    if (currentVs412 <= 0) {
      if (!this.isVersionFamily(targetVersion, '5.6.1') || !locationValue.includes('4381-a')) {
        return "Current firmware 4.12 or lower must first install intermediate 'NG9xx 5.6.1-4381-A'";
      }
      return null;
    }

    if (currentVs414 >= 0 && currentVs561 < 0) {
      if (!this.isVersionFamily(targetVersion, '5.6.1') || !locationValue.includes('4381-b')) {
        return "Firmware between 4.14.0 and 5.6.1 must first install intermediate 'NG9xx 5.6.1-4381-B'";
      }
      return null;
    }

    if (currentVs561 >= 0 && currentVs662 < 0) {
      const hasAccepted662UpgradeLabel =
        locationValue.includes('4351-bl-upgrade-b')
        || locationValue.includes('4351-bl_upgrade')
        || locationValue.includes('4351-bl-upgrade');
      if (!this.isVersionFamily(targetVersion, '6.6.2') || !hasAccepted662UpgradeLabel) {
        return "Firmware between 5.6.1 and 6.x must first install intermediate 'NG9xx 6.6.2-4351-BL-upgrade-B'";
      }
      return null;
    }

    return null;
  }

  public applyGetConfiguration(payload: { key?: string[] }) {
    const keys = Array.isArray(payload?.key) ? payload.key : undefined;
    const configurationKey = [] as Array<{ key: string; readonly: boolean; value: string }>;
    const unknownKey: string[] = [];

    if (keys && keys.length > 0) {
      const filtered = filterConfigurationKeys(this.brandProfile, keys);
      for (const key of filtered) {
        const cfg = this.configuration.get(key);
        if (cfg) configurationKey.push({ key, readonly: cfg.readonly, value: cfg.value });
        else unknownKey.push(key);
      }
      for (const key of keys) {
        if (!filtered.includes(key)) unknownKey.push(key);
      }
    } else {
      const allKeys = [...this.configuration.keys()];
      const filtered = filterConfigurationKeys(this.brandProfile, allKeys);
      for (const key of filtered) {
        const cfg = this.configuration.get(key);
        if (!cfg) continue;
        configurationKey.push({ key, readonly: cfg.readonly, value: cfg.value });
      }
    }

    return { configurationKey, unknownKey };
  }

  public applyChangeConfiguration(payload: { key: string; value: string }) {
    const key = String(payload?.key ?? '').trim();
    const value = String(payload?.value ?? '');

    if (key.toLowerCase() === 'pw-setchargerpassword') {
      const parsed = parsePasswordChangeValue(value);
      if (!parsed) {
        return { status: 'Rejected' as const };
      }

      if (this.chargerPassword.length > 0 && parsed.oldPassword !== this.chargerPassword) {
        return { status: 'Rejected' as const };
      }

      this.chargerPassword = parsed.newPassword;
      this.configuration.set('PW-SetChargerPassword', { readonly: false, value: '***' });
      return { status: 'Accepted' as const };
    }

    if (!isConfigKeyAllowed(this.brandProfile, key)) {
      return { status: 'Rejected' as const };
    }
    const cfg = this.configuration.get(key);
    if (!cfg) {
      return { status: 'Rejected' as const };
    }

    if (cfg.readonly) {
      return { status: 'Rejected' as const };
    }

    cfg.value = value;
    this.applyConfiguration(key, cfg.value);
    return { status: 'Accepted' as const };
  }

  public applyChangeAvailability(payload: { connectorId: number; type: 'Operative' | 'Inoperative' }) {
    const targetState: ConnectorState = payload.type === 'Operative' ? ConnectorState.Available : ConnectorState.Unavailable;

    if (payload.connectorId === 0) {
      for (const c of this.connectors.values()) {
        if (c.transactionId != null) {
          this.doStopConnector(c, 'Remote').catch(() => undefined);
        }
        c.state = targetState;
        this.safeCall('StatusNotification', this.statusPayload(c.id, targetState));
      }
      this.stationState = targetState;
      return { status: 'Accepted' as const };
    }

    const c = this.connectors.get(payload.connectorId);
    if (!c) {
      return { status: 'Rejected' as const };
    }

    if (c.transactionId != null) {
      this.doStopConnector(c, 'Remote').catch(() => undefined);
    }
    c.state = targetState;
    this.stationState = targetState;
    this.safeCall('StatusNotification', this.statusPayload(c.id, targetState));
    return { status: 'Accepted' as const };
  }

  public applyClearCache() {
    return { status: 'Accepted' as const };
  }

  public async applyTriggerMessage(payload: { requestedMessage: string; connectorId?: number }) {
    const requested = payload?.requestedMessage;
    if (!requested) {
      return { status: 'Rejected' as const, error: 'requestedMessage is required' };
    }

    const connectorId = payload?.connectorId ?? 1;
    switch (requested) {
      case 'Heartbeat':
        await this.sendHeartbeat().catch(() => undefined);
        return { status: 'Accepted' as const };

      case 'BootNotification':
        await this.sendBootNotification().catch(() => undefined);
        return { status: 'Accepted' as const };

      case 'StatusNotification':
        await this.sendStatusNotification(
          connectorId,
          this.connectors.get(connectorId)?.state ?? ConnectorState.Available
        ).catch(() => undefined);
        return { status: 'Accepted' as const };

      case 'MeterValues':
        await this.sendMeterValues(connectorId).catch(() => undefined);
        return { status: 'Accepted' as const };

      case 'DiagnosticsStatusNotification':
        await this.diagnosticsStatusNotification('Uploaded').catch(() => undefined);
        return { status: 'Accepted' as const };

      case 'FirmwareStatusNotification':
        await this.firmwareStatusNotification('Installed').catch(() => undefined);
        return { status: 'Accepted' as const };

      default:
        return { status: 'Rejected' as const, error: 'unsupported_requested_message' };
    }
  }

  public async applyRemoteStart(payload: { connectorId?: number; idTag: string }) {
    const connectorId = payload.connectorId ?? 1;
    const c = this.connectors.get(connectorId);
    if (!c) {
      return { status: 'Rejected' as const };
    }
    if (!this.canStartWithIdTag(c, payload.idTag)) {
      return { status: 'Rejected' as const };
    }

    const authorizeStatus = await this.authorize(payload.idTag);
    if (authorizeStatus !== 'Accepted') {
      return { status: 'Rejected' as const };
    }

    c.idTag = payload.idTag;
    c.state = ConnectorState.Preparing;
    this.stationState = ConnectorState.Preparing;
    await this.safeCall('StatusNotification', this.statusPayload(connectorId, ConnectorState.Preparing));

    const startRes = await this.sendCall('StartTransaction', {
      timestamp: new Date().toISOString(),
      connectorId,
      meterStart: c.meterValueWh,
      idTag: payload.idTag
    });

    c.transactionId = typeof startRes.transactionId === 'number' ? startRes.transactionId : null;
    c.state = ConnectorState.Charging;
    this.stationState = ConnectorState.Charging;
    await this.safeCall('StatusNotification', this.statusPayload(connectorId, ConnectorState.Charging));

    if (c.transactionId != null) {
      this.startMeterLoop(c);
    }

    return { status: 'Accepted' as const };
  }

  public async applyRemoteStop(payload: { transactionId?: number; connectorId?: number }) {
    let c: Connector | undefined;
    if (payload.connectorId) {
      c = this.connectors.get(payload.connectorId);
    } else if (payload.transactionId) {
      c = [...this.connectors.values()].find(conn => conn.transactionId === payload.transactionId);
    }

    if (!c || c.transactionId == null) {
      return { status: 'Rejected' as const };
    }

    await this.doStopConnector(c, 'Remote');
    return { status: 'Accepted' as const };
  }

  public async applyReset(payload: { type?: 'Soft' | 'Hard' }) {
    const kind = (payload?.type === 'Soft' ? 'Soft' : 'Hard') as 'Hard' | 'Soft';
    this.performReboot(kind).catch(e => this.log.error(`Reboot failed: ${e.message}`));
    return { status: 'Accepted' as const };
  }

  public applyUnlockConnector(payload: { connectorId: number }) {
    const c = this.connectors.get(payload.connectorId);
    if (!c) {
      return { status: 'UnlockFailed' as const };
    }

    if (c.transactionId != null) {
      this.doStopConnector(c, 'Remote').catch(() => undefined);
    }

    c.state = ConnectorState.Available;
    this.stationState = ConnectorState.Available;
    this.safeCall('StatusNotification', this.statusPayload(c.id, ConnectorState.Available));
    return { status: 'Unlocked' as const };
  }

  public applyUpdateFirmware(payload: {
    location: string;
    retrieveDate: string;
    retries?: number;
    retryInterval?: number;
    checksum?: string;
    version?: string;
  }) {
    if (!payload?.location || !payload?.retrieveDate) {
      return { status: 'Rejected' as const, error: 'FormationViolation', message: 'Missing location or retrieveDate' };
    }

    let firmwareUrl: URL;
    try {
      firmwareUrl = new URL(payload.location);
    } catch {
      return { status: 'Rejected' as const, error: 'FormationViolation', message: 'Invalid location URL' };
    }

    if (firmwareUrl.protocol !== 'https:') {
      return { status: 'Rejected' as const, error: 'SecurityError', message: 'Firmware URL must use HTTPS' };
    }

    const allowedHosts = (process.env.FIRMWARE_ALLOWED_HOSTS ?? '')
      .split(',')
      .map(v => v.trim().toLowerCase())
      .filter(Boolean);
    if (allowedHosts.length > 0 && !allowedHosts.includes(firmwareUrl.hostname.toLowerCase())) {
      return { status: 'Rejected' as const, error: 'SecurityError', message: 'Firmware host not allowed' };
    }

    const requireChecksum = (process.env.FIRMWARE_REQUIRE_CHECKSUM ?? 'true').toLowerCase() !== 'false';
    const checksum = typeof payload.checksum === 'string' ? payload.checksum.trim() : '';
    if (requireChecksum && checksum.length < 8) {
      return { status: 'Rejected' as const, error: 'SecurityError', message: 'Firmware checksum is required' };
    }

    const retrieveDate = new Date(payload.retrieveDate);
    if (Number.isNaN(retrieveDate.getTime())) {
      return { status: 'Rejected' as const, error: 'FormationViolation', message: 'Invalid retrieveDate' };
    }

    const targetVersion =
      (typeof payload.version === 'string' && payload.version.trim().length > 0)
        ? payload.version.trim()
        : this.resolveFirmwareVersion(payload.location);

    const pathValidationError = this.validateNg9xxFirmwarePath(targetVersion, payload.location);
    if (pathValidationError) {
      return { status: 'Rejected' as const, error: 'SecurityError', message: pathValidationError };
    }

    if (!this.isVersionGreater(targetVersion, this.bootOpts.firmwareVersion)) {
      return { status: 'Rejected' as const, error: 'SecurityError', message: 'Firmware version rollback not allowed' };
    }

    const job: FirmwareJob = {
      location: payload.location,
      retrieveDate,
      version: targetVersion,
      retries: Number.isInteger(payload.retries) && (payload.retries as number) > 0 ? payload.retries : 0,
      retryIntervalMs: Number.isInteger(payload.retryInterval) && (payload.retryInterval as number) > 0
        ? (payload.retryInterval as number) * 1000
        : 0
    };

    const started = this.firmwareManager.start(job);
    return { status: started ? 'Accepted' as const : 'Rejected' as const };
  }

  public applyGetDiagnostics(payload: { location?: string; retries?: number; retryInterval?: number; startTime?: string; stopTime?: string }) {
    if (!payload?.location) {
      return { status: 'Rejected' as const, error: 'FormationViolation', message: 'Missing location' };
    }

    try {
      new URL(payload.location);
    } catch {
      return { status: 'Rejected' as const, error: 'FormationViolation', message: 'Invalid location URL' };
    }

    const fileName = `diagnostics-${this.chargerId}-${Date.now()}.log`;

    const retries = Number.isInteger(payload.retries) && (payload.retries as number) > 0 ? (payload.retries as number) : 0;
    const retryIntervalMs = Number.isInteger(payload.retryInterval) && (payload.retryInterval as number) > 0
      ? (payload.retryInterval as number) * 1000
      : 250;

    if (retries > 0) {
      this.diagnosticsStatusNotification('UploadFailed').catch(e => {
        this.log.warn(`DiagnosticsStatusNotification failed: ${e.message}`);
      });
      setTimeout(() => {
        this.diagnosticsStatusNotification('Uploaded').catch(e => {
          this.log.warn(`DiagnosticsStatusNotification failed: ${e.message}`);
        });
      }, retryIntervalMs);
    } else {
      setTimeout(() => {
        this.diagnosticsStatusNotification('Uploaded').catch(e => {
          this.log.warn(`DiagnosticsStatusNotification failed: ${e.message}`);
        });
      }, 250);
    }

    return { status: 'Accepted' as const, fileName };
  }

  public applyReserveNow(payload: { connectorId?: number; expiryDate?: string; idTag?: string; reservationId?: number }) {
    if (!payload?.connectorId || !payload?.idTag || !payload?.expiryDate || !payload?.reservationId) {
      return { status: 'Rejected' as const, error: 'FormationViolation', message: 'Missing required fields' };
    }

    const connector = this.connectors.get(payload.connectorId);
    if (!connector) {
      return { status: 'Rejected' as const };
    }

    if (connector.reservationId != null) {
      const expiresAt = connector.reservationExpiryAt ?? null;
      if (expiresAt != null && expiresAt <= Date.now()) {
        this.clearReservation(connector);
      } else {
        return { status: 'Occupied' as const };
      }
    }

    if (connector.transactionId != null || connector.state === ConnectorState.Charging || connector.state === ConnectorState.Preparing) {
      return { status: 'Occupied' as const };
    }

    const expiry = new Date(payload.expiryDate);
    if (Number.isNaN(expiry.getTime())) {
      return { status: 'Rejected' as const, error: 'FormationViolation', message: 'Invalid expiryDate' };
    }
    if (expiry.getTime() <= Date.now()) {
      return { status: 'Rejected' as const, error: 'FormationViolation', message: 'expiryDate must be in the future' };
    }

    this.clearReservation(connector);
    connector.reservationId = payload.reservationId;
    connector.reservedIdTag = payload.idTag;
    connector.reservationExpiryAt = expiry.getTime();
    connector.state = ConnectorState.Unavailable;
    this.stationState = ConnectorState.Unavailable;
    this.safeCall('StatusNotification', this.statusPayload(connector.id, ConnectorState.Unavailable));

    const delayMs = Math.max(1, expiry.getTime() - Date.now());
    connector.reservationTimer = setTimeout(() => {
      const current = this.connectors.get(connector.id);
      if (!current || current.reservationId !== payload.reservationId) return;
      this.clearReservation(current);
      if (current.transactionId == null && current.state === ConnectorState.Unavailable) {
        current.state = ConnectorState.Available;
        this.stationState = ConnectorState.Available;
        this.safeCall('StatusNotification', this.statusPayload(current.id, ConnectorState.Available));
      }
    }, delayMs);

    return { status: 'Accepted' as const };
  }

  public applyCancelReservation(payload: { reservationId?: number }) {
    if (!payload?.reservationId) {
      return { status: 'Rejected' as const, error: 'FormationViolation', message: 'Missing reservationId' };
    }

    let found = false;
    for (const connector of this.connectors.values()) {
      if (connector.reservationId !== payload.reservationId) continue;

      this.clearReservation(connector);
      if (connector.transactionId == null && connector.state === ConnectorState.Unavailable) {
        connector.state = ConnectorState.Available;
        this.stationState = ConnectorState.Available;
        this.safeCall('StatusNotification', this.statusPayload(connector.id, ConnectorState.Available));
      }
      found = true;
    }

    return { status: found ? 'Accepted' as const : 'Rejected' as const };
  }
}
