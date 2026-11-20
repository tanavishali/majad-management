import type { ErrorRequestHandler, RequestHandler } from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import { ZodError } from 'zod';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { AppError } from '../utils/AppError';
import type { ErrorCode } from '@order-desk/shared';

export const notFoundHandler: RequestHandler = (req, _res, next) =>
  next(new AppError(404, 'NOT_FOUND', `Route not found: ${req.method} ${req.path}`));

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  let status = 500; let code: ErrorCode = 'INTERNAL'; let message = 'Internal server error'; let details: unknown;

  if (err instanceof AppError) { status = err.status; code = err.code; message = err.message; details = err.details; }
  else if (err instanceof ZodError) {
    status = 422; code = 'VALIDATION_ERROR'; message = 'Validation failed';
    const fields: Record<string, string> = {};
    for (const i of err.issues) { const k = i.path.join('.') || '_'; if (!fields[k]) fields[k] = i.message; }
    details = fields;
  } else if (err instanceof mongoose.Error.CastError) { status = 400; code = 'BAD_ID'; message = 'Invalid id'; }
  else if (err?.code === 11000) { status = 409; code = 'DUPLICATE'; message = 'Duplicate value'; details = err.keyValue; }
  else if (err instanceof multer.MulterError) {
    status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 422; code = 'VALIDATION_ERROR'; message = `Upload rejected: ${err.message}`;
  } else if (err?.type === 'entity.too.large') { status = 413; code = 'VALIDATION_ERROR'; message = 'Request body too large'; }
  else if (err?.type === 'entity.parse.failed') { status = 400; code = 'VALIDATION_ERROR'; message = 'Malformed JSON body'; }

  if (status >= 500) logger.error({ err, requestId: req.id }, 'unhandled error');
  if (res.headersSent) return res.end();
  if (status === 500 && env.isProd) { message = 'Internal server error'; details = undefined; }
  else if (status === 500) { message = err?.message ?? message; details = { stack: err?.stack }; }
  res.status(status).json({ error: { code, message, details, requestId: req.id } });
};
