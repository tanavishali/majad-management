// DB-free smoke tests: HTTP plumbing, validation, uploads pipeline.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.UPLOAD_DIR = mkdtempSync(path.join(tmpdir(), 'od-up-'));

let app: import('express').Express;
beforeAll(async () => { app = (await import('../src/app')).createApp(); });

describe('http plumbing (no database)', () => {
  it('healthz ok, readyz 503 without DB', async () => {
    expect((await request(app).get('/healthz')).body).toEqual({ status: 'ok' });
    expect((await request(app).get('/readyz')).status).toBe(503);
  });
  it('protected routes need a token, with the standard error shape', async () => {
    for (const p of ['/orders', '/stats/overview', '/stats/sales', '/settings']) {
      const r = await request(app).get(`/api/v1${p}`);
      expect(r.status, p).toBe(401);
      expect(r.body.error).toMatchObject({ code: 'UNAUTHORIZED' });
      expect(r.body.error.requestId).toBeTruthy();
    }
  });
  it('login validates strictly (422 per-field details) and malformed JSON is 400', async () => {
    const r = await request(app).post('/api/v1/auth/login').send({ username: '', extra: 1 });
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe('VALIDATION_ERROR');
    const bad = await request(app).post('/api/v1/auth/login').set('content-type', 'application/json').send('{oops');
    expect(bad.status).toBe(400);
  });
  it('unknown route -> 404 NOT_FOUND; bad file key -> 404', async () => {
    expect((await request(app).get('/api/v1/nope')).body.error.code).toBe('NOT_FOUND');
    expect((await request(app).get('/api/v1/files/..%2F..%2Fetc%2Fpasswd')).status).toBe(404);
  });
});

describe('validation (no database)', () => {
  it('order body: cake and lbs are required, unknown keys rejected, money must be whole rupees', async () => {
    const { orderInputSchema } = await import('@order-desk/shared');
    const ok = { cake: 'Red velvet cake', lbs: 2, scheduledAt: '2026-01-01T10:00:00Z' };
    const parsed = orderInputSchema.parse(ok);
    expect(parsed).toMatchObject({ addons: [], location: '', price: null, advance: 0, profit: null, details: '', images: [], customer: { name: '', phone: '' } });
    expect(orderInputSchema.safeParse({ ...ok, cake: '  ' }).success).toBe(false);
    expect(orderInputSchema.safeParse({ ...ok, lbs: 0 }).success).toBe(false);
    expect(orderInputSchema.safeParse({ ...ok, source: 'tiktok' }).success).toBe(false);
    expect(orderInputSchema.safeParse({ ...ok, source: 'whatsapp' }).success).toBe(true);
    expect(orderInputSchema.safeParse({ ...ok, source: 'facebook' }).success).toBe(true);
    expect(orderInputSchema.safeParse({ ...ok, price: 10.5 }).success).toBe(false);
    expect(orderInputSchema.safeParse({ ...ok, customer: { phone: '123' } }).success).toBe(false);
    expect(orderInputSchema.safeParse({ ...ok, images: Array(7).fill('k') }).success).toBe(false);
  });
  it('lists: trimmed, case-insensitively de-duplicated', async () => {
    const { listsSchema } = await import('@order-desk/shared');
    const r = listsSchema.parse({ flavours: [' Vanilla ', 'vanilla', 'Mango'], locations: [], addons: ['Candles'] });
    expect(r.flavours).toEqual(['Vanilla', 'Mango']);
    expect(listsSchema.safeParse({ flavours: [''], locations: [], addons: [] }).success).toBe(false);
  });
});

describe('uploads pipeline', () => {
  it('stores webp + thumb + sidecar and resolves keys', async () => {
    const sharp = (await import('sharp')).default;
    const png = await sharp({ create: { width: 900, height: 600, channels: 3, background: '#d4476f' } }).png().toBuffer();
    const { processAndStore, resolveKeys } = await import('../src/modules/uploads/upload.service');
    const ref = await processAndStore(png);
    expect(ref).toMatchObject({ w: 900, h: 600 });
    expect(ref.key).toMatch(/\.webp$/);
    const [res] = await resolveKeys([ref.key]);
    expect(res!.thumbKey).toBe(ref.thumbKey);
    const img = await request(app).get(`/api/v1/files/${ref.thumbKey}`);
    expect(img.status).toBe(200);
    expect(img.headers['content-type']).toContain('image/webp');
    await expect(resolveKeys(['0'.repeat(32) + '.webp'])).rejects.toMatchObject({ status: 422 });
    await expect(processAndStore(Buffer.from('not an image'))).rejects.toMatchObject({ status: 422 });
  });
});
