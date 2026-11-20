// DB-free unit tests: AppError, errorHandler status/code mapping, notFound, requestId, validate/validateId.
import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import request from 'supertest';
import { z } from 'zod';

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

const { AppError } = await import('../src/utils/AppError');
const { errorHandler, notFoundHandler } = await import('../src/middlewares/errorHandler');
const { requestId } = await import('../src/middlewares/requestId');
const { validate, validateId } = await import('../src/middlewares/validate');
const { makeMeta } = await import('../src/utils/response');

function appWith(thrower: (req: express.Request, res: express.Response, next: express.NextFunction) => unknown) {
  const a = express();
  a.use(requestId);
  a.use(express.json({ limit: '1kb' }));
  a.post('/t', (req, res, next) => { try { thrower(req, res, next); } catch (e) { next(e); } });
  a.get('/t', (req, res, next) => { try { thrower(req, res, next); } catch (e) { next(e); } });
  a.use(notFoundHandler);
  a.use(errorHandler);
  return a;
}
const hit = (thrower: Parameters<typeof appWith>[0]) => request(appWith(thrower)).get('/t');

describe('AppError', () => {
  it('carries status, code, message, details and is an Error', () => {
    const e = new AppError(418, 'FORBIDDEN', 'teapot', { a: 1 });
    expect(e).toBeInstanceOf(Error); expect(e).toBeInstanceOf(AppError);
    expect(e).toMatchObject({ status: 418, code: 'FORBIDDEN', message: 'teapot', details: { a: 1 }, name: 'AppError' });
  });
  it('factories', () => {
    expect(AppError.badId()).toMatchObject({ status: 400, code: 'BAD_ID' });
    expect(AppError.badRequest('x', { f: 1 })).toMatchObject({ status: 400, code: 'VALIDATION_ERROR', details: { f: 1 } });
    expect(AppError.unauthorized()).toMatchObject({ status: 401, code: 'UNAUTHORIZED', message: 'Authentication required' });
    expect(AppError.unauthorized('nope').message).toBe('nope');
    expect(AppError.notFound('Order')).toMatchObject({ status: 404, code: 'NOT_FOUND', message: 'Order not found' });
    expect(AppError.notFound().message).toBe('Resource not found');
    expect(AppError.conflict('SLOT_CONFLICT', 'm', { x: 1 })).toMatchObject({ status: 409, code: 'SLOT_CONFLICT', details: { x: 1 } });
  });
});

describe('errorHandler mapping', () => {
  it('AppError -> its status/code/details, standard envelope with requestId', async () => {
    const r = await hit(() => { throw AppError.conflict('SLOT_CONFLICT', 'busy', { orderNo: 3 }); });
    expect(r.status).toBe(409);
    expect(r.body).toEqual({ error: { code: 'SLOT_CONFLICT', message: 'busy', details: { orderNo: 3 }, requestId: r.headers['x-request-id'] } });
  });
  it('ZodError -> 422 VALIDATION_ERROR, first message per dotted path, "_" for root', async () => {
    const schema = z.object({ customer: z.object({ name: z.string().min(1) }), price: z.number().int() }).strict();
    const r = await hit(() => schema.parse({ customer: { name: '' }, price: 1.5, extra: 1 }));
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe('VALIDATION_ERROR');
    expect(Object.keys(r.body.error.details).sort()).toEqual(['_', 'customer.name', 'price']);
    for (const v of Object.values(r.body.error.details)) expect(typeof v).toBe('string');
  });
  it('mongoose CastError -> 400 BAD_ID', async () => {
    const r = await hit(() => { throw new mongoose.Error.CastError('ObjectId', 'abc', '_id'); });
    expect(r.status).toBe(400); expect(r.body.error.code).toBe('BAD_ID');
  });
  it('Mongo duplicate key (11000) -> 409 DUPLICATE with keyValue as details', async () => {
    const r = await hit(() => { throw Object.assign(new Error('E11000'), { code: 11000, keyValue: { orderNo: 5 } }); });
    expect(r.status).toBe(409); expect(r.body.error).toMatchObject({ code: 'DUPLICATE', details: { orderNo: 5 } });
  });
  it('multer: LIMIT_FILE_SIZE -> 413, other limits -> 422, both VALIDATION_ERROR', async () => {
    const big = await hit(() => { throw new multer.MulterError('LIMIT_FILE_SIZE'); });
    expect(big.status).toBe(413); expect(big.body.error.code).toBe('VALIDATION_ERROR');
    for (const code of ['LIMIT_FILE_COUNT', 'LIMIT_UNEXPECTED_FILE'] as const) {
      const r = await hit(() => { throw new multer.MulterError(code); });
      expect(r.status, code).toBe(422);
    }
  });
  it('body-parser: too large -> 413, malformed JSON -> 400', async () => {
    const a = appWith(() => undefined);
    const large = await request(a).post('/t').set('content-type', 'application/json').send(JSON.stringify({ x: 'y'.repeat(5000) }));
    expect(large.status).toBe(413); expect(large.body.error.code).toBe('VALIDATION_ERROR');
    const bad = await request(a).post('/t').set('content-type', 'application/json').send('{nope');
    expect(bad.status).toBe(400); expect(bad.body.error.message).toMatch(/Malformed JSON/);
  });
  it('unknown error -> 500 INTERNAL (message + stack in non-production)', async () => {
    const r = await hit(() => { throw new Error('boom'); });
    expect(r.status).toBe(500); expect(r.body.error.code).toBe('INTERNAL');
    expect(r.body.error.message).toBe('boom');
    expect(r.body.error.details.stack).toContain('boom');
  });
  it('a mongoose ValidationError is currently NOT mapped (documents the 500; see BUG report)', async () => {
    const r = await hit(() => { throw new mongoose.Error.ValidationError(); });
    expect(r.status).toBe(500);
  });
  it('unknown routes -> 404 NOT_FOUND naming method and path', async () => {
    const r = await request(appWith(() => undefined)).delete('/nowhere');
    expect(r.status).toBe(404); expect(r.body.error).toMatchObject({ code: 'NOT_FOUND', message: 'Route not found: DELETE /nowhere' });
  });
  it('after headers are sent the response is just ended (no double send)', async () => {
    const r = await hit((_req, res, next) => { res.write('partial'); next(new Error('late')); });
    expect(r.status).toBe(200); expect(r.text).toBe('partial');
  });
  it('error bodies always carry a requestId (header and body agree)', async () => {
    const r = await request(appWith(() => { throw AppError.badId(); })).get('/t').set('X-Request-Id', 'abcdef-12345');
    expect(r.body.error.requestId).toBe('abcdef-12345'); expect(r.headers['x-request-id']).toBe('abcdef-12345');
  });
});

describe('errorHandler in production', () => {
  const saved = { ...process.env };
  afterEach(() => { process.env = { ...saved }; vi.resetModules(); });
  it('500 hides message and stack', async () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'p'.repeat(40);
    vi.resetModules();
    const { errorHandler: eh } = await import('../src/middlewares/errorHandler');
    const a = express();
    a.get('/t', (_req, _res, next) => next(new Error('secret db password in message')));
    a.use(eh);
    const r = await request(a).get('/t');
    expect(r.status).toBe(500);
    expect(r.body.error.message).toBe('Internal server error');
    expect(r.body.error.details).toBeUndefined();
    expect(JSON.stringify(r.body)).not.toMatch(/secret|stack/);
  });
  it('non-500 errors keep their message in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'p'.repeat(40);
    vi.resetModules();
    const { errorHandler: eh } = await import('../src/middlewares/errorHandler');
    const { AppError: AE } = await import('../src/utils/AppError');
    const a = express();
    a.get('/t', (_req, _res, next) => next(AE.notFound('Order')));
    a.use(eh);
    const r = await request(a).get('/t');
    expect(r.status).toBe(404); expect(r.body.error.message).toBe('Order not found');
  });
  it('production refuses the dev JWT secret (env validation)', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_SECRET;
    vi.resetModules();
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => { throw new Error('exit'); }) as never);
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(import('../src/config/env')).rejects.toThrow('exit');
    expect(err.mock.calls.join(' ')).toMatch(/JWT_SECRET/);
    exit.mockRestore(); err.mockRestore();
  });
});

describe('validate / validateId middleware', () => {
  const a = express();
  a.use(express.json());
  a.post('/b', validate({ body: z.object({ n: z.coerce.number().int().default(7) }).strict() }), (req, res) => res.json(req.body));
  a.get('/q', validate({ query: z.object({ page: z.coerce.number().int().min(1).default(1) }).strict() }), (_req, res) => res.json(res.locals.query));
  a.get('/i/:id', validateId(), (req, res) => res.json({ id: req.params.id }));
  a.use(errorHandler);
  it('body: parsed value replaces req.body (defaults applied); unknown key -> 422', async () => {
    expect((await request(a).post('/b').send({})).body).toEqual({ n: 7 });
    expect((await request(a).post('/b').send({ n: '3' })).body).toEqual({ n: 3 });
    expect((await request(a).post('/b').send({ z: 1 })).status).toBe(422);
  });
  it('query: parsed onto res.locals.query; invalid -> 422', async () => {
    expect((await request(a).get('/q')).body).toEqual({ page: 1 });
    expect((await request(a).get('/q?page=4')).body).toEqual({ page: 4 });
    expect((await request(a).get('/q?page=0')).status).toBe(422);
  });
  it('validateId: 24-hex ok; short, long, non-hex -> 400 BAD_ID', async () => {
    expect((await request(a).get('/i/64b64b64b64b64b64b64b64b')).status).toBe(200);
    for (const bad of ['123', 'zzzzzzzzzzzzzzzzzzzzzzzz', '64b64b64b64b64b64b64b64b0', 'x']) {
      const r = await request(a).get(`/i/${bad}`);
      expect(r.status, bad).toBe(400); expect(r.body.error.code).toBe('BAD_ID');
    }
  });
});

describe('response helpers', () => {
  it('makeMeta: pages is at least 1 and rounds up', () => {
    expect(makeMeta(1, 8, 0)).toEqual({ page: 1, limit: 8, total: 0, pages: 1 });
    expect(makeMeta(2, 8, 8)).toEqual({ page: 2, limit: 8, total: 8, pages: 1 });
    expect(makeMeta(1, 8, 9).pages).toBe(2);
    expect(makeMeta(1, 50, 101).pages).toBe(3);
  });
});
