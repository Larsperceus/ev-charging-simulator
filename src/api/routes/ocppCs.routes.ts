import express from 'express';

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

export function registerOcppCsRoutes<TEntry extends {
  evseId: string;
  client: {
    applyGetConfiguration(payload: { key?: string[] }): { configurationKey: Array<{ key: string; readonly: boolean; value: string }>; unknownKey: string[] };
    applyChangeConfiguration(payload: { key: string; value: string }): { status: string };
    applyChangeAvailability(payload: { connectorId: number; type: 'Operative' | 'Inoperative' }): { status: string };
    applyClearCache(): { status: string };
    applyTriggerMessage(payload: { requestedMessage: string; connectorId?: number }): Promise<{ status: string }>;
    applyRemoteStart(payload: { connectorId?: number; idTag: string }): Promise<{ status: string }>;
    applyRemoteStop(payload: { transactionId?: number; connectorId?: number }): Promise<{ status: string }>;
    applyReset(payload: { type?: 'Soft' | 'Hard' }): Promise<{ status: string }>;
    applyUnlockConnector(payload: { connectorId: number }): { status: string };
    applyUpdateFirmware(payload: { location: string; retrieveDate: string; retries?: number; retryInterval?: number; checksum?: string; version?: string }): { status: string; error?: string; message?: string };
    applyGetDiagnostics(payload: { location: string; retries?: number; retryInterval?: number; startTime?: string; stopTime?: string }): { status: string; fileName?: string; error?: string; message?: string };
    applyReserveNow(payload: { connectorId: number; expiryDate: string; idTag: string; reservationId: number }): { status: string; error?: string; message?: string };
    applyCancelReservation(payload: { reservationId: number }): { status: string; error?: string; message?: string };
  };
}>(params: {
  app: express.Express;
  requireClientEntry: (req: express.Request, res: express.Response) => TEntry | null;
  parseOptionalInteger: ParserInteger;
  parseRequiredString: ParserString;
  sendError: (res: express.Response, status: number, error: string, details?: string) => void;
  sendUnexpectedError: (res: express.Response, route: string, error: unknown) => void;
  onChangeConfigurationApplied?: (args: {
    entry: TEntry;
    key: string;
    value: string;
    result: { status?: string };
  }) => void;
}) {
  const {
    app,
    requireClientEntry,
    parseOptionalInteger,
    parseRequiredString,
    sendError,
    sendUnexpectedError,
    onChangeConfigurationApplied,
  } = params;

  app.post('/ocpp/cs/get-configuration', (req, res) => {
    const entry = requireClientEntry(req, res);
    if (!entry) return;
    const result = entry.client.applyGetConfiguration(req.body ?? {});
    res.json({ ok: true, result });
  });

  app.post('/ocpp/cs/change-configuration', (req, res) => {
    const entry = requireClientEntry(req, res);
    if (!entry) return;
    const { key, value } = req.body ?? {};
    const parsedKey = parseRequiredString(key, 'key', res);
    if (parsedKey === null) return;
    const parsedValue =
      value == null
        ? ''
        : parseRequiredString(value, 'value', res);
    if (parsedValue === null) return;
    const result = entry.client.applyChangeConfiguration({ key: parsedKey, value: parsedValue });
    onChangeConfigurationApplied?.({ entry, key: parsedKey, value: parsedValue, result });
    res.json({ ok: true, result });
  });

  app.post('/ocpp/cs/change-availability', (req, res) => {
    const entry = requireClientEntry(req, res);
    if (!entry) return;
    const { connectorId, type } = req.body ?? {};
    const parsedConnectorId = parseOptionalInteger(connectorId, 'connectorId', res, { min: 0 });
    if (parsedConnectorId === null) return;
    const parsedType = parseRequiredString(type, 'type', res);
    if (parsedType === null) return;
    if (parsedType !== 'Operative' && parsedType !== 'Inoperative') {
      sendError(res, 400, 'bad_request', 'type must be Operative or Inoperative');
      return;
    }
    const result = entry.client.applyChangeAvailability({ connectorId: parsedConnectorId ?? 0, type: parsedType });
    res.json({ ok: true, result });
  });

  app.post('/ocpp/cs/clear-cache', (_req, res) => {
    const entry = requireClientEntry(_req, res);
    if (!entry) return;
    const result = entry.client.applyClearCache();
    res.json({ ok: true, result });
  });

  app.post('/ocpp/cs/trigger-message', async (req, res) => {
    const entry = requireClientEntry(req, res);
    if (!entry) return;
    const { requestedMessage, connectorId } = req.body ?? {};
    const parsedRequestedMessage = parseRequiredString(requestedMessage, 'requestedMessage', res);
    if (parsedRequestedMessage === null) return;
    const parsedConnectorId = parseOptionalInteger(connectorId, 'connectorId', res, { min: 1 });
    if (parsedConnectorId === null) return;
    try {
      const result = await entry.client.applyTriggerMessage({
        requestedMessage: parsedRequestedMessage,
        connectorId: parsedConnectorId
      });
      res.json({ ok: true, result });
    } catch (error) {
      sendUnexpectedError(res, 'POST /ocpp/cs/trigger-message', error);
    }
  });

  app.post('/ocpp/cs/remote-start', async (req, res) => {
    const entry = requireClientEntry(req, res);
    if (!entry) return;
    const { connectorId, idTag } = req.body ?? {};
    const parsedConnectorId = parseOptionalInteger(connectorId, 'connectorId', res, { min: 1 });
    if (parsedConnectorId === null) return;
    const parsedIdTag = parseRequiredString(idTag, 'idTag', res);
    if (parsedIdTag === null) return;
    try {
      const result = await entry.client.applyRemoteStart({ connectorId: parsedConnectorId, idTag: parsedIdTag });
      res.json({ ok: true, result });
    } catch (error) {
      sendUnexpectedError(res, 'POST /ocpp/cs/remote-start', error);
    }
  });

  app.post('/ocpp/cs/remote-stop', async (req, res) => {
    const entry = requireClientEntry(req, res);
    if (!entry) return;
    const { transactionId, connectorId } = req.body ?? {};
    const parsedTransactionId = parseOptionalInteger(transactionId, 'transactionId', res, { min: 1 });
    if (parsedTransactionId === null) return;
    const parsedConnectorId = parseOptionalInteger(connectorId, 'connectorId', res, { min: 1 });
    if (parsedConnectorId === null) return;
    try {
      const result = await entry.client.applyRemoteStop({
        transactionId: parsedTransactionId,
        connectorId: parsedConnectorId
      });
      res.json({ ok: true, result });
    } catch (error) {
      sendUnexpectedError(res, 'POST /ocpp/cs/remote-stop', error);
    }
  });

  app.post('/ocpp/cs/reset', async (req, res) => {
    const entry = requireClientEntry(req, res);
    if (!entry) return;
    const { type } = req.body ?? {};
    try {
      const result = await entry.client.applyReset({ type });
      res.json({ ok: true, result });
    } catch (error) {
      sendUnexpectedError(res, 'POST /ocpp/cs/reset', error);
    }
  });

  app.post('/ocpp/cs/unlock-connector', (req, res) => {
    const entry = requireClientEntry(req, res);
    if (!entry) return;
    const { connectorId } = req.body ?? {};
    const parsedConnectorId = parseOptionalInteger(connectorId, 'connectorId', res, { min: 1 });
    if (parsedConnectorId == null) return;
    const result = entry.client.applyUnlockConnector({ connectorId: parsedConnectorId });
    res.json({ ok: true, result });
  });

  app.post('/ocpp/cs/update-firmware', (req, res) => {
    const entry = requireClientEntry(req, res);
    if (!entry) return;
    const result = entry.client.applyUpdateFirmware(req.body ?? {});
    if (result.error) {
      sendError(res, 400, String(result.error), result.message ? String(result.message) : undefined);
      return;
    }
    res.json({ ok: true, result: { status: result.status } });
  });

  app.post('/ocpp/cs/get-diagnostics', (req, res) => {
    const entry = requireClientEntry(req, res);
    if (!entry) return;
    const { location, retries, retryInterval, startTime, stopTime } = req.body ?? {};
    const parsedLocation = parseRequiredString(location, 'location', res);
    if (parsedLocation === null) return;

    const parsedRetries = parseOptionalInteger(retries, 'retries', res, { min: 0 });
    if (parsedRetries === null) return;
    const parsedRetryInterval = parseOptionalInteger(retryInterval, 'retryInterval', res, { min: 0 });
    if (parsedRetryInterval === null) return;
    const parsedStartTime =
      startTime == null
        ? undefined
        : parseRequiredString(startTime, 'startTime', res);
    if (parsedStartTime === null) return;
    const parsedStopTime =
      stopTime == null
        ? undefined
        : parseRequiredString(stopTime, 'stopTime', res);
    if (parsedStopTime === null) return;

    const result = entry.client.applyGetDiagnostics({
      location: parsedLocation,
      retries: parsedRetries,
      retryInterval: parsedRetryInterval,
      startTime: parsedStartTime,
      stopTime: parsedStopTime
    });
    if (result.error) {
      sendError(res, 400, String(result.error), result.message ? String(result.message) : undefined);
      return;
    }

    res.json({ ok: true, result });
  });

  app.post('/ocpp/cs/reserve-now', (req, res) => {
    const entry = requireClientEntry(req, res);
    if (!entry) return;
    const { connectorId, expiryDate, idTag, reservationId } = req.body ?? {};

    const parsedConnectorId = parseOptionalInteger(connectorId, 'connectorId', res, { min: 1 });
    if (parsedConnectorId === null) return;
    if (parsedConnectorId == null) {
      sendError(res, 400, 'bad_request', 'connectorId is required');
      return;
    }

    const parsedExpiryDate = parseRequiredString(expiryDate, 'expiryDate', res);
    if (parsedExpiryDate === null) return;

    const parsedIdTag = parseRequiredString(idTag, 'idTag', res);
    if (parsedIdTag === null) return;

    const parsedReservationId = parseOptionalInteger(reservationId, 'reservationId', res, { min: 1 });
    if (parsedReservationId === null) return;
    if (parsedReservationId == null) {
      sendError(res, 400, 'bad_request', 'reservationId is required');
      return;
    }

    const result = entry.client.applyReserveNow({
      connectorId: parsedConnectorId,
      expiryDate: parsedExpiryDate,
      idTag: parsedIdTag,
      reservationId: parsedReservationId,
    });
    if (result.error) {
      sendError(res, 400, String(result.error), result.message ? String(result.message) : undefined);
      return;
    }

    res.json({ ok: true, result });
  });

  app.post('/ocpp/cs/cancel-reservation', (req, res) => {
    const entry = requireClientEntry(req, res);
    if (!entry) return;
    const { reservationId } = req.body ?? {};

    const parsedReservationId = parseOptionalInteger(reservationId, 'reservationId', res, { min: 1 });
    if (parsedReservationId === null) return;
    if (parsedReservationId == null) {
      sendError(res, 400, 'bad_request', 'reservationId is required');
      return;
    }

    const result = entry.client.applyCancelReservation({ reservationId: parsedReservationId });
    if (result.error) {
      sendError(res, 400, String(result.error), result.message ? String(result.message) : undefined);
      return;
    }

    res.json({ ok: true, result });
  });
}
