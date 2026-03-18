import AjvModule from 'ajv';
import type { JSONSchemaType } from 'ajv';

const AjvCtor = AjvModule as unknown as new (options?: any) => any;
const ajv = new AjvCtor({ allErrors: true, allowUnionTypes: true });

type ChangeAvailability = { connectorId: number; type: 'Operative' | 'Inoperative' };
const changeAvailabilitySchema: JSONSchemaType<ChangeAvailability> = {
  type: 'object',
  properties: {
    connectorId: { type: 'integer', minimum: 0 },
    type: { type: 'string', enum: ['Operative', 'Inoperative'] }
  },
  required: ['connectorId', 'type'],
  additionalProperties: true
};

type ChangeConfiguration = { key: string; value: string };
const changeConfigurationSchema: JSONSchemaType<ChangeConfiguration> = {
  type: 'object',
  properties: {
    key: { type: 'string', minLength: 1 },
    value: { type: 'string' }
  },
  required: ['key', 'value'],
  additionalProperties: true
};

type GetConfiguration = { key?: string[] };
const getConfigurationSchema: JSONSchemaType<GetConfiguration> = {
  type: 'object',
  properties: {
    key: { type: 'array', items: { type: 'string' }, nullable: true }
  },
  required: [],
  additionalProperties: true
};

const clearCacheSchema = {
  type: 'object',
  additionalProperties: true
} as const;

type RemoteStartTransaction = { connectorId?: number; idTag: string };
const remoteStartSchema: JSONSchemaType<RemoteStartTransaction> = {
  type: 'object',
  properties: {
    connectorId: { type: 'integer', minimum: 0, nullable: true },
    idTag: { type: 'string', minLength: 1 }
  },
  required: ['idTag'],
  additionalProperties: true
};

type RemoteStopTransaction = { transactionId?: number; connectorId?: number };
const remoteStopSchema: JSONSchemaType<RemoteStopTransaction> = {
  type: 'object',
  properties: {
    transactionId: { type: 'integer', nullable: true },
    connectorId: { type: 'integer', nullable: true }
  },
  required: [],
  anyOf: [
    { required: ['transactionId'] },
    { required: ['connectorId'] }
  ],
  additionalProperties: true
};

type Reset = { type?: 'Soft' | 'Hard' };
const resetSchema: JSONSchemaType<Reset> = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: ['Soft', 'Hard'], nullable: true }
  },
  required: [],
  additionalProperties: true
};

type UnlockConnector = { connectorId: number };
const unlockConnectorSchema: JSONSchemaType<UnlockConnector> = {
  type: 'object',
  properties: {
    connectorId: { type: 'integer', minimum: 1 }
  },
  required: ['connectorId'],
  additionalProperties: true
};

type UpdateFirmware = {
  location: string;
  retrieveDate: string;
  retries?: number;
  retryInterval?: number;
  checksum?: string;
  version?: string;
};
const updateFirmwareSchema: JSONSchemaType<UpdateFirmware> = {
  type: 'object',
  properties: {
    location: { type: 'string', minLength: 1 },
    retrieveDate: { type: 'string', minLength: 1 },
    retries: { type: 'integer', nullable: true },
    retryInterval: { type: 'integer', nullable: true },
    checksum: { type: 'string', nullable: true },
    version: { type: 'string', nullable: true }
  },
  required: ['location', 'retrieveDate'],
  additionalProperties: true
};

type GetDiagnostics = { location: string; retries?: number; retryInterval?: number; startTime?: string; stopTime?: string };
const getDiagnosticsSchema: JSONSchemaType<GetDiagnostics> = {
  type: 'object',
  properties: {
    location: { type: 'string', minLength: 1 },
    retries: { type: 'integer', nullable: true },
    retryInterval: { type: 'integer', nullable: true },
    startTime: { type: 'string', nullable: true },
    stopTime: { type: 'string', nullable: true }
  },
  required: ['location'],
  additionalProperties: true
};

type TriggerMessage = { requestedMessage: string; connectorId?: number };
const triggerMessageSchema: JSONSchemaType<TriggerMessage> = {
  type: 'object',
  properties: {
    requestedMessage: { type: 'string', minLength: 1 },
    connectorId: { type: 'integer', nullable: true }
  },
  required: ['requestedMessage'],
  additionalProperties: true
};

type ReserveNow = { connectorId: number; expiryDate: string; idTag: string; reservationId: number };
const reserveNowSchema: JSONSchemaType<ReserveNow> = {
  type: 'object',
  properties: {
    connectorId: { type: 'integer', minimum: 1 },
    expiryDate: { type: 'string', minLength: 1 },
    idTag: { type: 'string', minLength: 1 },
    reservationId: { type: 'integer' }
  },
  required: ['connectorId', 'expiryDate', 'idTag', 'reservationId'],
  additionalProperties: true
};

type CancelReservation = { reservationId: number };
const cancelReservationSchema: JSONSchemaType<CancelReservation> = {
  type: 'object',
  properties: {
    reservationId: { type: 'integer' }
  },
  required: ['reservationId'],
  additionalProperties: true
};

const validators = {
  ChangeAvailability: ajv.compile(changeAvailabilitySchema),
  ChangeConfiguration: ajv.compile(changeConfigurationSchema),
  GetConfiguration: ajv.compile(getConfigurationSchema),
  ClearCache: ajv.compile(clearCacheSchema),
  RemoteStartTransaction: ajv.compile(remoteStartSchema),
  RemoteStopTransaction: ajv.compile(remoteStopSchema),
  Reset: ajv.compile(resetSchema),
  UnlockConnector: ajv.compile(unlockConnectorSchema),
  UpdateFirmware: ajv.compile(updateFirmwareSchema),
  GetDiagnostics: ajv.compile(getDiagnosticsSchema),
  TriggerMessage: ajv.compile(triggerMessageSchema),
  ReserveNow: ajv.compile(reserveNowSchema),
  CancelReservation: ajv.compile(cancelReservationSchema)
} as const;

type ValidationResult = { valid: true } | { valid: false; message: string };

export function validateCsCall(action: string, payload: unknown): ValidationResult {
  const validator = (validators as Record<string, (data: unknown) => boolean>)[action];
  if (!validator) {
    return { valid: true };
  }

  const ok = validator(payload);
  if (ok) return { valid: true };

  const errors = (validator as any).errors as Array<{ instancePath?: string; message?: string }> | null;
  const message = errors?.[0]?.message ? `${action} ${errors[0].message}` : `${action} payload invalid`;
  return { valid: false, message };
}
