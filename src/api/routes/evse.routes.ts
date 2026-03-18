import type express from 'express';

type RequireClientEntry<TEntry> = (req: express.Request, res: express.Response) => TEntry | null;

type ParseOptionalInteger = (
  value: unknown,
  fieldName: string,
  res: express.Response,
  opts?: { min?: number; max?: number },
) => number | undefined | null;

type ParseOptionalFiniteNumber = (
  value: unknown,
  fieldName: string,
  res: express.Response,
  opts?: { min?: number; max?: number },
) => number | undefined | null;

type SendError = (res: express.Response, status: number, code: string, message?: string) => void;
type SendUnexpectedError = (res: express.Response, route: string, error: unknown) => void;

export function registerEvseRoutes<TEntry extends {
  evseId: string;
  bootOpts: object;
  connectors: number;
  csmsUrl: string;
  client: {
    getStateAll(): Array<{ id: number; state: string; transactionId: number | null }>;
    getPower(): { watts: number; volts: number; amps: number };
    getTransactionId(id: number): number | null;
    isConnected(): boolean;
    getLastMessageAt(): number | null;
    getHeartbeatPeriodMs(): number;
    getState(): string;
    setPower(amps?: number, volts?: number): void;
    setConnectorStatus(id: number, state: string): Promise<void>;
  };
}>(params: {
  app: express.Express;
  requireClientEntry: RequireClientEntry<TEntry>;
  parseOptionalFiniteNumber: ParseOptionalFiniteNumber;
  sendError: SendError;
  sendUnexpectedError: SendUnexpectedError;
  getContainerId: () => string;
}) {
  const {
    app,
    requireClientEntry,
    parseOptionalFiniteNumber,
    sendError,
    sendUnexpectedError,
    getContainerId,
  } = params;

  app.get('/connectors/:id', (_req, res) => {
    const entry = requireClientEntry(_req, res);
    if (!entry) return;
    const id = Number(_req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      sendError(res, 400, 'bad_request', 'Connector id must be an integer >= 1');
      return;
    }
    const connectors = entry.client.getStateAll();
    const connector = connectors.find(c => c.id === id);
    if (!connector) return sendError(res, 404, 'connector_not_found');

    res.json({
      ...connector,
      chargerId: entry.evseId,
      power: entry.client.getPower(),
      evseId: entry.evseId,
      containerId: getContainerId(),
      timestamp: new Date().toISOString()
    });
  });

  app.get('/connectors', (_req, res) => {
    const entry = requireClientEntry(_req, res);
    if (!entry) return;
    const power = entry.client.getPower();
    const connectors = entry.client.getStateAll().map(c => ({
      ...c,
      chargerId: entry.evseId,
      power,
      evseId: entry.evseId,
      containerId: getContainerId(),
      timestamp: new Date().toISOString()
    }));

    res.json({
      connectors,
      totalConnectors: connectors.length,
      chargerId: entry.evseId,
      evseId: entry.evseId,
      containerId: getContainerId()
    });
  });

  app.get('/transactions', (_req, res) => {
    const entry = requireClientEntry(_req, res);
    if (!entry) return;
    const connectors = entry.client.getStateAll();
    const activeTransactions = connectors
      .filter(c => c.transactionId !== null)
      .map(c => ({
        transactionId: c.transactionId,
        connectorId: c.id,
        state: c.state,
        chargerId: entry.evseId,
        evseId: entry.evseId,
        containerId: getContainerId(),
        power: entry.client.getPower(),
        timestamp: new Date().toISOString()
      }));

    res.json({
      transactions: activeTransactions,
      count: activeTransactions.length,
      chargerId: entry.evseId,
      evseId: entry.evseId,
      containerId: getContainerId()
    });
  });

  app.get('/connectors/:id/transaction', (_req, res) => {
    const entry = requireClientEntry(_req, res);
    if (!entry) return;
    const id = Number(_req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      sendError(res, 400, 'bad_request', 'Connector id must be an integer >= 1');
      return;
    }
    const transactionId = entry.client.getTransactionId(id);

    if (!transactionId) {
      return sendError(res, 404, 'no_active_transaction');
    }

    const connector = entry.client.getStateAll().find(c => c.id === id);
    res.json({
      transactionId,
      connectorId: id,
      state: connector?.state,
      chargerId: entry.evseId,
      evseId: entry.evseId,
      containerId: getContainerId(),
      power: entry.client.getPower(),
      timestamp: new Date().toISOString()
    });
  });

  app.get('/configuration', (_req, res) => {
    const entry = requireClientEntry(_req, res);
    if (!entry) return;
    res.json({
      containerId: getContainerId(),
      chargerId: entry.evseId,
      evseId: entry.evseId,
      ...entry.bootOpts,
      capabilities: {
        connectors: entry.connectors,
        maxPower: entry.client.getPower(),
        supportedFeatures: [
          'RemoteStart',
          'RemoteStop',
          'StatusNotification',
          'MeterValues',
          'Reset',
          'PowerControl'
        ],
        csmsUrl: entry.csmsUrl,
        heartbeatInterval: entry.client.getHeartbeatPeriodMs()
      },
      timestamp: new Date().toISOString()
    });
  });

  app.post('/configuration', (req, res) => {
    const { amps, volts } = req.body ?? {};
    const parsedAmps = parseOptionalFiniteNumber(amps, 'amps', res, { min: 0 });
    if (parsedAmps === null) return;
    const parsedVolts = parseOptionalFiniteNumber(volts, 'volts', res, { min: 0 });
    if (parsedVolts === null) return;
    const entry = requireClientEntry(req, res);
    if (!entry) return;

    if (parsedAmps != null || parsedVolts != null) {
      entry.client.setPower(
        parsedAmps,
        parsedVolts,
      );
    }

    res.status(200).json({
      ok: true,
      power: entry.client.getPower(),
      chargerId: entry.evseId,
      evseId: entry.evseId,
      containerId: getContainerId(),
      updated: new Date().toISOString()
    });
  });

  app.get('/meters', (_req, res) => {
    const entry = requireClientEntry(_req, res);
    if (!entry) return;
    const connectors = entry.client.getStateAll();
    const power = entry.client.getPower();

    const meterData = connectors.map(c => ({
      connectorId: c.id,
      state: c.state,
      transactionId: c.transactionId,
      currentPower: c.state === 'Charging' ? power.watts : 0,
      voltage: power.volts,
      current: c.state === 'Charging' ? power.amps : 0,
      timestamp: new Date().toISOString()
    }));

    res.json({ meters: meterData, chargerId: entry.evseId, evseId: entry.evseId, containerId: getContainerId() });
  });

  app.get('/diagnostics', (_req, res) => {
    const entry = requireClientEntry(_req, res);
    if (!entry) return;
    res.json({
      containerId: getContainerId(),
      chargerId: entry.evseId,
      evseId: entry.evseId,
      connected: entry.client.isConnected(),
      uptime: process.uptime(),
      lastMessageAt: entry.client.getLastMessageAt(),
      heartbeatPeriod: entry.client.getHeartbeatPeriodMs(),
      stationState: entry.client.getState(),
      connectors: entry.client.getStateAll(),
      power: entry.client.getPower(),
      memory: process.memoryUsage(),
      csmsUrl: entry.csmsUrl,
      timestamp: new Date().toISOString()
    });
  });

  app.post('/connectors/:id/availability', async (req, res) => {
    const id = Number(req.params.id);
    const { available = true } = req.body ?? {};
    if (!Number.isInteger(id) || id < 1) {
      sendError(res, 400, 'bad_request', 'Connector id must be an integer >= 1');
      return;
    }
    if (typeof available !== 'boolean') {
      sendError(res, 400, 'bad_request', 'available must be a boolean');
      return;
    }
    const entry = requireClientEntry(req, res);
    if (!entry) return;

    try {
      const newState = available ? 'Available' : 'Unavailable';
      await entry.client.setConnectorStatus(id, newState);

      res.status(200).json({
        ok: true,
        connectorId: id,
        state: newState,
        chargerId: entry.evseId,
        evseId: entry.evseId,
        containerId: getContainerId(),
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      sendUnexpectedError(res, 'POST /connectors/:id/availability', error);
    }
  });
}
