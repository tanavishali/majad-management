import type { RequestHandler } from 'express';
import mongoose from 'mongoose';
import type { ZodTypeAny } from 'zod';
import { AppError } from '../utils/AppError';

interface Schemas { body?: ZodTypeAny; query?: ZodTypeAny }

/** Parsed body replaces req.body; parsed query is placed on res.locals.query (req.query stays raw). */
export const validate = (s: Schemas): RequestHandler => (req, res, next) => {
  try {
    if (s.body) req.body = s.body.parse(req.body ?? {});
    if (s.query) res.locals.query = s.query.parse(req.query);
    next();
  } catch (e) { next(e); }
};

/** Rejects malformed :id params with 400 BAD_ID */
export const validateId = (param = 'id'): RequestHandler => (req, _res, next) => {
  const v = req.params[param];
  if (!v || !mongoose.isValidObjectId(v) || String(v).length !== 24) return next(AppError.badId());
  next();
};
