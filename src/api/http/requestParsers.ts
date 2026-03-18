import express from 'express';
import { sendError } from './errorResponses.js';

export function parseOptionalFiniteNumber(
  value: unknown,
  fieldName: string,
  res: express.Response,
  options?: { min?: number },
) {
  if (value == null) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    sendError(res, 400, 'bad_request', `${fieldName} must be a finite number`);
    return null;
  }
  if (options?.min != null && value < options.min) {
    sendError(res, 400, 'bad_request', `${fieldName} must be >= ${options.min}`);
    return null;
  }

  return value;
}

export function parseOptionalInteger(
  value: unknown,
  fieldName: string,
  res: express.Response,
  options?: { min?: number },
) {
  if (value == null) return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    sendError(res, 400, 'bad_request', `${fieldName} must be an integer`);
    return null;
  }
  if (options?.min != null && value < options.min) {
    sendError(res, 400, 'bad_request', `${fieldName} must be >= ${options.min}`);
    return null;
  }

  return value;
}

export function parseRequiredString(
  value: unknown,
  fieldName: string,
  res: express.Response,
) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    sendError(res, 400, 'bad_request', `${fieldName} is required`);
    return null;
  }

  return value;
}
