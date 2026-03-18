import express from 'express';
import { logger } from '../../utils/logger.js';

export function sendError(
  res: express.Response,
  status: number,
  error: string,
  details?: string,
) {
  res.status(status).json({
    error,
    ...(details ? { details } : {}),
  });
}

export function sendUnexpectedError(
  res: express.Response,
  route: string,
  error: unknown,
) {
  logger.error(
    {
      route,
      error: error instanceof Error ? error.message : String(error),
    },
    'Unexpected route error',
  );

  sendError(res, 500, 'internal_error', 'Unexpected internal server error');
}
