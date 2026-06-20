import express from 'express';
import type { ConnectorState, ChargePointErrorCode, StopTransactionReason } from '../../ocppClient.js';

type ParserInteger = (
  value: unknown,
  fieldName: string,
  res: express.Response,
  options?: { min?: number }
) => number | undefined | null;

type ParserString = (
  value: unknown,
  fieldName: string,
  res: express.Response,
) => string | null;

export function registerOcppCpRoutes<TEntry extends {
  evseId: string;
  client: {
    sendBootNotification(): Promise<unknown>;
    sendHeartbeat(): Promise<unknown>;
    authorize(idTag: string): Promise<string>;
    startTransaction(connectorId: number, idTag: string): Promise<number | null>;
    stopTransaction(connectorId: number, reason: StopTransactionReason): Promise<boolean>;
    sendMeterValues(connectorId: number, transactionId?: number): Promise<unknown>;
    sendStatusNotification(connectorId: number, status: ConnectorState, errorCode?: ChargePointErrorCode): Promise<unknown>;
    dataTransfer(vendorId: string, messageId?: string, data?: string): Promise<unknown>;
    firmwareStatusNotification(status: string): Promise<unknown>;
    diagnosticsStatusNotification(status: string): Promise<unknown>;
  };
}>(params: {
  app: express.Express;
  requireClientEntry: (req: express.Request, res: express.Response) => TEntry | null;
  parseOptionalInteger: ParserInteger;
  parseRequiredString: ParserString;
  sendUnexpectedError: (res: express.Response, route: string, error: unknown) => void;
}) {
  const {
    app,
    requireClientEntry,
    parseOptionalInteger,
    parseRequiredString,
    sendUnexpectedError,
  } = params;

  app.post('/ocpp/cp/boot', async (req, res) => {
    const entry = requireClientEntry(req, res);
    if (!entry) return;
    try {
      const result = await entry.client.sendBootNotification();
      res.json({ ok: true, result });
    } catch (error) {
      sendUnexpectedError(res, 'POST /ocpp/cp/boot', error);
    }
  });

  app.post('/ocpp/cp/heartbeat', async (req, res) => {
    const entry = requireClientEntry(req, res);
    if (!entry) return;
    try {
      const result = await entry.client.sendHeartbeat();
      res.json({ ok: true, result });
    } catch (error) {
      sendUnexpectedError(res, 'POST /ocpp/cp/heartbeat', error);
    }
  });

  app.post('/ocpp/cp/authorize', async (req, res) => {
    const entry = requireClientEntry(req, res);
    if (!entry) return;
    const { idTag } = req.body ?? {};
    const parsedIdTag = parseRequiredString(idTag, 'idTag', res);
    if (parsedIdTag === null) return;
    try {
      const status = await entry.client.authorize(parsedIdTag);
      res.json({ ok: true, status });
    } catch (error) {
      sendUnexpectedError(res, 'POST /ocpp/cp/authorize', error);
    }
  });

  app.post('/ocpp/cp/start-transaction', async (req, res) => {
    const entry = requireClientEntry(req, res);
    if (!entry) return;
    const { connectorId, idTag } = req.body ?? {};
    const parsedConnectorId = parseOptionalInteger(connectorId, 'connectorId', res, { min: 1 });
    if (parsedConnectorId === null) return;
    const parsedIdTag =
      idTag == null
        ? 'LOCALTAG'
        : parseRequiredString(idTag, 'idTag', res);
    if (parsedIdTag === null) return;
    try {
      const transactionId = await entry.client.startTransaction(parsedConnectorId ?? 1, parsedIdTag);
      res.json({ ok: true, transactionId });
    } catch (error) {
      sendUnexpectedError(res, 'POST /ocpp/cp/start-transaction', error);
    }
  });

  app.post('/ocpp/cp/stop-transaction', async (req, res) => {
    const entry = requireClientEntry(req, res);
    if (!entry) return;
    const { connectorId, reason } = req.body ?? {};
    const parsedConnectorId = parseOptionalInteger(connectorId, 'connectorId', res, { min: 1 });
    if (parsedConnectorId === null) return;
    const parsedReason =
      reason == null
        ? 'Remote'
        : parseRequiredString(reason, 'reason', res);
    if (parsedReason === null) return;
    try {
      const stopped = await entry.client.stopTransaction(parsedConnectorId ?? 1, parsedReason as StopTransactionReason);
      res.json({ ok: stopped });
    } catch (error) {
      sendUnexpectedError(res, 'POST /ocpp/cp/stop-transaction', error);
    }
  });

  app.post('/ocpp/cp/meter-values', async (req, res) => {
    const entry = requireClientEntry(req, res);
    if (!entry) return;
    const { connectorId, transactionId } = req.body ?? {};
    const parsedConnectorId = parseOptionalInteger(connectorId, 'connectorId', res, { min: 1 });
    if (parsedConnectorId === null) return;
    const parsedTransactionId = parseOptionalInteger(transactionId, 'transactionId', res, { min: 1 });
    if (parsedTransactionId === null) return;
    try {
      const result = await entry.client.sendMeterValues(parsedConnectorId ?? 1, parsedTransactionId);
      res.json({ ok: true, result });
    } catch (error) {
      sendUnexpectedError(res, 'POST /ocpp/cp/meter-values', error);
    }
  });

  app.post('/ocpp/cp/status-notification', async (req, res) => {
    const entry = requireClientEntry(req, res);
    if (!entry) return;
    const { connectorId, status, errorCode } = req.body ?? {};
    const parsedConnectorId = parseOptionalInteger(connectorId, 'connectorId', res, { min: 1 });
    if (parsedConnectorId === null) return;
    const parsedStatus = parseRequiredString(status, 'status', res);
    if (parsedStatus === null) return;
    const parsedErrorCode =
      errorCode == null
        ? undefined
        : parseRequiredString(errorCode, 'errorCode', res);
    if (parsedErrorCode === null) return;
    try {
      const result = await entry.client.sendStatusNotification(parsedConnectorId ?? 1, parsedStatus as ConnectorState, parsedErrorCode as ChargePointErrorCode | undefined);
      res.json({ ok: true, result });
    } catch (error) {
      sendUnexpectedError(res, 'POST /ocpp/cp/status-notification', error);
    }
  });

  app.post('/ocpp/cp/data-transfer', async (req, res) => {
    const entry = requireClientEntry(req, res);
    if (!entry) return;
    const { vendorId, messageId, data } = req.body ?? {};
    const parsedVendorId = parseRequiredString(vendorId, 'vendorId', res);
    if (parsedVendorId === null) return;
    const parsedMessageId =
      messageId == null
        ? undefined
        : parseRequiredString(messageId, 'messageId', res);
    if (parsedMessageId === null) return;
    const parsedData =
      data == null
        ? undefined
        : parseRequiredString(data, 'data', res);
    if (parsedData === null) return;
    try {
      const result = await entry.client.dataTransfer(parsedVendorId, parsedMessageId, parsedData);
      res.json({ ok: true, result });
    } catch (error) {
      sendUnexpectedError(res, 'POST /ocpp/cp/data-transfer', error);
    }
  });

  app.post('/ocpp/cp/firmware-status', async (req, res) => {
    const entry = requireClientEntry(req, res);
    if (!entry) return;
    const { status } = req.body ?? {};
    const parsedStatus = parseRequiredString(status, 'status', res);
    if (parsedStatus === null) return;
    try {
      const result = await entry.client.firmwareStatusNotification(parsedStatus as 'Downloading' | 'Downloaded' | 'Installing' | 'Installed' | 'DownloadFailed' | 'InstallationFailed');
      res.json({ ok: true, result });
    } catch (error) {
      sendUnexpectedError(res, 'POST /ocpp/cp/firmware-status', error);
    }
  });

  app.post('/ocpp/cp/diagnostics-status', async (req, res) => {
    const entry = requireClientEntry(req, res);
    if (!entry) return;
    const { status } = req.body ?? {};
    const parsedStatus = parseRequiredString(status, 'status', res);
    if (parsedStatus === null) return;
    try {
      const result = await entry.client.diagnosticsStatusNotification(parsedStatus as 'Idle' | 'Uploading' | 'Uploaded' | 'UploadFailed');
      res.json({ ok: true, result });
    } catch (error) {
      sendUnexpectedError(res, 'POST /ocpp/cp/diagnostics-status', error);
    }
  });
}
