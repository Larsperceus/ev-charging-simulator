import type express from 'express';
import type { ConnectorState } from '../../ocppClient.js';

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

type ParseRequiredString = (value: unknown, fieldName: string, res: express.Response) => string | null;

type SendUnexpectedError = (res: express.Response, route: string, error: unknown) => void;

export function registerControlRoutes<TEntry extends {
  evseId: string;
  client: {
    localStart(connectorId: number, idTag: string): Promise<void>;
    stopConnector(connectorId: number): Promise<boolean>;
    setConnectorStatus(connectorId: number, state: ConnectorState): Promise<void>;
    setPower(amps?: number, volts?: number): void;
    getPower(): unknown;
    disconnectWs(): Promise<void>;
    reconnectWs(): Promise<void>;
    localReset(type: 'Soft' | 'Hard'): Promise<void>;
    getStateAll(): Array<{ id: number; transactionId: number | null }>;
  };
}>(params: {
  app: express.Express;
  requireClientEntry: RequireClientEntry<TEntry>;
  parseOptionalInteger: ParseOptionalInteger;
  parseOptionalFiniteNumber: ParseOptionalFiniteNumber;
  parseRequiredString: ParseRequiredString;
  sendUnexpectedError: SendUnexpectedError;
  getContainerId: () => string;
}) {
  const {
    app,
    requireClientEntry,
    parseOptionalInteger,
    parseOptionalFiniteNumber,
    parseRequiredString,
    sendUnexpectedError,
    getContainerId,
  } = params;

  app.post('/control/start', async (req, res) => {
    const { connectorId, idTag } = req.body ?? {};
    const parsedConnectorId = parseOptionalInteger(connectorId, 'connectorId', res, { min: 1 });
    if (parsedConnectorId === null) return;
    const parsedIdTag =
      idTag == null
        ? 'LOCALTAG'
        : parseRequiredString(idTag, 'idTag', res);
    if (parsedIdTag === null) return;
    const entry = requireClientEntry(req, res);
    if (!entry) return;
    try {
      await entry.client.localStart(parsedConnectorId ?? 1, parsedIdTag);
      res.status(200).json({ ok: true });
    } catch (error) {
      sendUnexpectedError(res, 'POST /control/start', error);
    }
  });

  app.post('/control/stop', async (req, res) => {
    const { connectorId } = req.body ?? {};
    const parsedConnectorId = parseOptionalInteger(connectorId, 'connectorId', res, { min: 1 });
    if (parsedConnectorId === null) return;
    const entry = requireClientEntry(req, res);
    if (!entry) return;
    try {
      const stopped = await entry.client.stopConnector(parsedConnectorId ?? 1);
      res.status(stopped ? 200 : 204).json({ ok: stopped });
    } catch (error) {
      sendUnexpectedError(res, 'POST /control/stop', error);
    }
  });

  app.post('/control/status', async (req, res) => {
    const { connectorId, state } = req.body ?? {};
    const parsedConnectorId = parseOptionalInteger(connectorId, 'connectorId', res, { min: 1 });
    if (parsedConnectorId === null) return;
    const parsedState = parseRequiredString(state, 'state', res);
    if (parsedState === null) return;
    const entry = requireClientEntry(req, res);
    if (!entry) return;
    try {
      await entry.client.setConnectorStatus(parsedConnectorId ?? 1, parsedState as ConnectorState);
      res.status(200).json({ ok: true });
    } catch (error) {
      sendUnexpectedError(res, 'POST /control/status', error);
    }
  });

  app.post('/control/power', (req, res) => {
    const { amps, volts } = req.body ?? {};
    const parsedAmps = parseOptionalFiniteNumber(amps, 'amps', res, { min: 0 });
    if (parsedAmps === null) return;
    const parsedVolts = parseOptionalFiniteNumber(volts, 'volts', res, { min: 0 });
    if (parsedVolts === null) return;
    const entry = requireClientEntry(req, res);
    if (!entry) return;
    entry.client.setPower(
      parsedAmps,
      parsedVolts,
    );
    res.status(200).json({ ok: true, power: entry.client.getPower() });
  });

  app.post('/control/disconnect', async (_req, res) => {
    const entry = requireClientEntry(_req, res);
    if (!entry) return;
    await entry.client.disconnectWs();
    res.status(200).json({ ok: true, evseId: entry.evseId });
  });

  app.post('/control/reconnect', async (_req, res) => {
    const entry = requireClientEntry(_req, res);
    if (!entry) return;
    await entry.client.reconnectWs();
    res.status(200).json({ ok: true, evseId: entry.evseId });
  });

  app.post('/control/reset', async (req, res) => {
    const { type = 'Soft' } = req.body ?? {};
    const resetType = type === 'Hard' ? 'Hard' : 'Soft';
    const entry = requireClientEntry(req, res);
    if (!entry) return;

    try {
      await entry.client.localReset(resetType);
      res.status(200).json({
        ok: true,
        resetType,
        evseId: entry.evseId,
        containerId: getContainerId(),
        message: `${resetType} reset initiated`
      });
    } catch (error) {
      sendUnexpectedError(res, 'POST /control/reset', error);
    }
  });

  app.post('/control/emergency-stop', async (_req, res) => {
    const entry = requireClientEntry(_req, res);
    if (!entry) return;
    try {
      const connectors = entry.client.getStateAll();
      const stopped = [];

      for (const connector of connectors) {
        if (connector.transactionId) {
          const success = await entry.client.stopConnector(connector.id);
          stopped.push({ connectorId: connector.id, stopped: success });
        }
      }

      res.status(200).json({
        ok: true,
        message: 'Emergency stop executed',
        chargerId: entry.evseId,
        evseId: entry.evseId,
        containerId: getContainerId(),
        stopped
      });
    } catch (error) {
      sendUnexpectedError(res, 'POST /control/emergency-stop', error);
    }
  });
}
