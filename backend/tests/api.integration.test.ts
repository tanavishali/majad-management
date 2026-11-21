/**
 * Full HTTP + MongoDB integration suite (supertest). Needs a real mongod:
 *   - MONGO_TEST_URI=mongodb://localhost:27017        (e.g. `docker run --rm -p 27017:27017 mongo:7`)
 *   - or MONGOMS_SYSTEM_BINARY=/usr/bin/mongod        (mongodb-memory-server uses it, no download)
 *   - or let mongodb-memory-server download a binary (needs internet on first run)
 * When none is obtainable the whole suite is SKIPPED with a message (see helpers/mongo.ts).
 * A throwaway database `orderdesk_it_<random>` is created and dropped; nothing else is touched.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { obtainMongo } from './helpers/mongo';

process.env.NODE_ENV = 'test';
process.env.UPLOAD_DIR = mkdtempSync(path.join(tmpdir(), 'od-it-up-'));
process.env.LOCKOUT_ATTEMPTS = '5';
process.env.LOG_LEVEL = 'silent';

const mongo = await obtainMongo();
if (!mongo.uri) console.warn(`\n[api.integration] SKIPPED: ${mongo.reason}\n`);
const suite = describe.skipIf(!mongo.uri);

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
let app: Any;
let M: Any; // models + helpers loaded after env is set
let envCfg: Any;
let token = '';
const PASS = 'correct-horse-9';
const bearer = (t = token) => ({ Authorization: `Bearer ${t}` });
const api = (p: string) => `/api/v1${p}`;
const get = (p: string, t = token) => request(app).get(api(p)).set(bearer(t));
const post = (p: string, t = token) => request(app).post(api(p)).set(bearer(t));
const patch = (p: string, t = token) => request(app).patch(api(p)).set(bearer(t));
const del = (p: string, t = token) => request(app).delete(api(p)).set(bearer(t));

const refreshCookie = (res: Any): string => {
  const c = ([] as string[]).concat(res.headers['set-cookie'] ?? []).find(x => x.startsWith('refresh_token='));
  return c ? c.split(';')[0]! : '';
};

async function login(username = 'admin', password = PASS) {
  const r = await request(app).post(api('/auth/login')).send({ username, password });
  return { r, token: r.body?.data?.accessToken as string, cookie: refreshCookie(r) };
}

const MIN = 60_000, HOUR = 3_600_000, DAY = 86_400_000;
const BASE = Math.ceil((Date.now() + 200 * DAY) / HOUR) * HOUR; // far future, no collision with seeded data
let slotN = 0;
const nextSlot = () => new Date(BASE + (slotN++) * 3 * HOUR);
let phoneN = 0;
function orderBody(over: Record<string, unknown> = {}): Any {
  return {
    cake: 'Red velvet cake', addons: ['Candles'],
    customer: { name: `Customer ${phoneN}`, phone: `0300${String(1000000 + phoneN++)}` },
    location: 'DHA', scheduledAt: nextSlot().toISOString(), lbs: 2, price: 3000, advance: 1000, profit: 800, details: '', ...over,
  };
}
const create = (over: Record<string, unknown> = {}, headers: Record<string, string> = {}) =>
  post('/orders').set(headers).send(orderBody(over));

async function resetOrders() {
  await Promise.all([M.OrderModel.deleteMany({}), M.CounterModel.deleteMany({}), M.IdempotencyModel.deleteMany({})]);
}

function findDeep(o: Any, pred: (x: Any) => boolean): Any {
  if (!o || typeof o !== 'object') return undefined;
  if (pred(o)) return o;
  for (const v of Object.values(o)) { const r = findDeep(v, pred); if (r) return r; }
  return undefined;
}
const winningPlan = (e: Any) => findDeep(e, o => 'winningPlan' in o)?.winningPlan;
const execStats = (e: Any) => findDeep(e, o => 'totalDocsExamined' in o);
const stageNames = (plan: Any): string[] => [...JSON.stringify(plan).matchAll(/"stage":\s*"([A-Z_]+)"/g)].map(m => m[1]!);

suite('Order Desk API integration', () => {
  beforeAll(async () => {
    const { connectDb } = await import('../src/config/db');
    await connectDb(mongo.uri!);
    app = (await import('../src/app')).createApp();
    envCfg = (await import('../src/config/env')).env;
    const auth = await import('../src/modules/auth/auth.model');
    const ord = await import('../src/modules/orders/order.model');
    const svc = await import('../src/modules/auth/auth.service');
    const filter = await import('../src/modules/orders/filter');
    const time = await import('../src/utils/time');
    const mongoose = (await import('mongoose')).default;
    M = { mongoose, ...auth, ...ord, ...svc, ...filter, ...time };
    await Promise.all([M.OrderModel, M.CounterModel, M.IdempotencyModel, M.UserModel, M.SessionModel].map((m: Any) => m.init()));
    await M.authService.ensureAdmin('admin', PASS);
    token = (await login()).token;
  }, 120_000);

  afterAll(async () => {
    const mongoose = (await import('mongoose')).default;
    try { await mongoose.connection.dropDatabase(); } catch { /* ignore */ }
    await mongoose.disconnect();
    await mongo.stop();
  });

  /* ------------------------------------------------------------------ infra */
  describe('infra', () => {
    it('healthz and readyz (DB connected)', async () => {
      expect((await request(app).get('/healthz')).body).toEqual({ status: 'ok' });
      const r = await request(app).get('/readyz');
      expect(r.status).toBe(200);
      expect(r.body.status).toBe('ready');
    });
    it('echoes a valid X-Request-Id, replaces an invalid one, and puts it in error bodies', async () => {
      const ok = await request(app).get(api('/orders')).set('X-Request-Id', 'my-request-id-123');
      expect(ok.headers['x-request-id']).toBe('my-request-id-123');
      expect(ok.body.error.requestId).toBe('my-request-id-123');
      const bad = await request(app).get('/healthz').set('X-Request-Id', 'short');
      expect(bad.headers['x-request-id']).not.toBe('short');
    });
    it('index definitions: partial {isDeleted:false} on orders, TTL on sessions and idempotency keys', async () => {
      const idx: Any[] = await M.OrderModel.listIndexes();
      const by = Object.fromEntries(idx.map(i => [i.name, i]));
      for (const n of ['orderNo_unique', 'status_scheduledAt', 'location_scheduledAt', 'scheduledAt', 'customer_phone']) {
        expect(by[n], n).toBeTruthy();
        expect(by[n].partialFilterExpression).toEqual({ isDeleted: false });
      }
      expect(by.orderNo_unique.unique).toBe(true);
      expect(by.location_scheduledAt.key).toEqual({ location: 1, scheduledAt: -1 });
      const sess: Any[] = await M.SessionModel.listIndexes();
      expect(sess.find(i => i.name === 'sessions_ttl')?.expireAfterSeconds).toBe(0);
      const idem: Any[] = await M.IdempotencyModel.listIndexes();
      expect(idem.some(i => i.expireAfterSeconds === 86400)).toBe(true);
    });
  });

  /* ------------------------------------------------------------------- auth */
  describe('auth', () => {
    it('login: 200 with accessToken + httpOnly refresh cookie scoped to /api/v1/auth', async () => {
      const { r } = await login();
      expect(r.status).toBe(200);
      expect(r.body.data.user.username).toBe('admin');
      expect(r.body.data.accessToken).toBeTruthy();
      const raw = ([] as string[]).concat(r.headers['set-cookie']).find(c => c.startsWith('refresh_token='))!;
      expect(raw).toMatch(/HttpOnly/i);
      expect(raw).toMatch(/Path=\/api\/v1\/auth/);
      expect(raw).toMatch(/SameSite=Lax/i);
      expect(JSON.stringify(r.body)).not.toMatch(/passwordHash|refresh_token/);
    });
    it('login is case-insensitive on username; wrong password and unknown user give the same 401', async () => {
      expect((await login('ADMIN')).r.status).toBe(200);
      const a = await login('admin', 'nope-nope-nope');
      const b = await login('ghost', 'nope-nope-nope');
      expect(a.r.status).toBe(401); expect(b.r.status).toBe(401);
      expect(a.r.body.error.message).toBe(b.r.body.error.message);
      expect(a.r.body.error.code).toBe('UNAUTHORIZED');
    });
    it('GET /auth/me with token; 401 without, malformed, expired, wrong-secret, alg=none, unknown subject', async () => {
      const me = await get('/auth/me');
      expect(me.status).toBe(200); expect(me.body.data.username).toBe('admin');
      expect((await request(app).get(api('/auth/me'))).status).toBe(401);
      expect((await get('/auth/me', 'garbage')).status).toBe(401);
      const sub = me.body.data.id;
      const expired = jwt.sign({ username: 'admin' }, envCfg.JWT_SECRET, { subject: sub, expiresIn: -10 });
      const r = await get('/auth/me', expired);
      expect(r.status).toBe(401); expect(r.body.error.message).toMatch(/expired|invalid/i);
      expect((await get('/auth/me', jwt.sign({ username: 'admin' }, 'x'.repeat(40), { subject: sub }))).status).toBe(401);
      const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub, username: 'admin' })).toString('base64url')}.`;
      expect((await get('/auth/me', none)).status).toBe(401);
      const ghost = jwt.sign({ username: 'ghost' }, envCfg.JWT_SECRET, { subject: '64b64b64b64b64b64b64b64b' });
      expect((await get('/auth/me', ghost)).status).toBe(401);
    });
    it('refresh rotates the cookie, returns a working access token, and old token reuse revokes the whole family', async () => {
      const { cookie: c1 } = await login();
      const r2 = await request(app).post(api('/auth/refresh')).set('Cookie', c1);
      expect(r2.status).toBe(200);
      const c2 = refreshCookie(r2);
      expect(c2).not.toBe(c1);
      expect((await get('/auth/me', r2.body.data.accessToken)).status).toBe(200);
      const replay = await request(app).post(api('/auth/refresh')).set('Cookie', c1);
      expect(replay.status).toBe(401);
      const afterReuse = await request(app).post(api('/auth/refresh')).set('Cookie', c2);
      expect(afterReuse.status).toBe(401);
    });
    it('refresh without or with garbage cookie -> 401 and clears the cookie', async () => {
      const a = await request(app).post(api('/auth/refresh'));
      expect(a.status).toBe(401);
      const b = await request(app).post(api('/auth/refresh')).set('Cookie', 'refresh_token=not-a-real-token');
      expect(b.status).toBe(401);
      expect(([] as string[]).concat(b.headers['set-cookie'] ?? []).join(';')).toMatch(/refresh_token=;/);
    });
    it('parallel refresh with the same token: exactly one succeeds', async () => {
      const { cookie } = await login();
      const rs = await Promise.all([1, 2, 3].map(() => request(app).post(api('/auth/refresh')).set('Cookie', cookie)));
      expect(rs.filter(r => r.status === 200)).toHaveLength(1);
      expect(rs.filter(r => r.status === 401)).toHaveLength(2);
    });
    it('refresh token is stored hashed (raw value is not in the sessions collection)', async () => {
      const { cookie } = await login();
      const raw = cookie.replace('refresh_token=', '');
      expect(await M.SessionModel.countDocuments({ tokenHash: raw })).toBe(0);
      const s = await M.SessionModel.findOne({}).sort({ _id: -1 }).lean();
      expect(s.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    });
    it('expired refresh session is rejected', async () => {
      const { cookie } = await login();
      await M.SessionModel.updateMany({}, { expiresAt: new Date(Date.now() - 1000) });
      expect((await request(app).post(api('/auth/refresh')).set('Cookie', cookie)).status).toBe(401);
    });
    it('logout: 204, clears cookie, revokes the session; works without access token; idempotent', async () => {
      const { cookie } = await login();
      const out = await request(app).post(api('/auth/logout')).set('Cookie', cookie);
      expect(out.status).toBe(204);
      expect(([] as string[]).concat(out.headers['set-cookie'] ?? []).join(';')).toMatch(/refresh_token=;/);
      expect((await request(app).post(api('/auth/refresh')).set('Cookie', cookie)).status).toBe(401);
      expect((await request(app).post(api('/auth/logout'))).status).toBe(204);
    });
    it('lockout after 5 wrong tries (423 ACCOUNT_LOCKED + retryAfterSeconds), blocks the correct password, expires', async () => {
      await M.UserModel.create({ username: 'locky', passwordHash: await M.hashPassword('right-password-1') });
      for (let i = 1; i <= 4; i++) expect((await login('locky', 'wrong-wrong')).r.status).toBe(401);
      const fifth = await login('locky', 'wrong-wrong');
      expect(fifth.r.status).toBe(423);
      expect(fifth.r.body.error.code).toBe('ACCOUNT_LOCKED');
      expect(fifth.r.body.error.details.retryAfterSeconds).toBe(envCfg.LOCKOUT_SECONDS);
      const blocked = await login('locky', 'right-password-1');
      expect(blocked.r.status).toBe(423);
      await M.UserModel.updateOne({ username: 'locky' }, { lockedUntil: new Date(Date.now() - 1000) });
      const ok = await login('locky', 'right-password-1');
      expect(ok.r.status).toBe(200);
      const u = await M.UserModel.findOne({ username: 'locky' }).lean();
      expect(u.failedAttempts).toBe(0); expect(u.lockedUntil).toBeUndefined();
    });
    it('a successful login resets the failed-attempt counter', async () => {
      await M.UserModel.create({ username: 'resetty', passwordHash: await M.hashPassword('right-password-1') });
      for (let i = 0; i < 3; i++) await login('resetty', 'bad-bad-bad');
      expect((await login('resetty', 'right-password-1')).r.status).toBe(200);
      for (let i = 0; i < 4; i++) expect((await login('resetty', 'bad-bad-bad')).r.status).toBe(401); // would be locked if counter were not reset
    });
    it('login body is validated strictly (422 with per-field details)', async () => {
      const r = await request(app).post(api('/auth/login')).send({ username: '', password: 'x', extra: 1 });
      expect(r.status).toBe(422);
      expect(r.body.error.code).toBe('VALIDATION_ERROR');
      expect(r.body.error.details).toBeTypeOf('object');
    });
    it('change-password: wrong current 422, weak new 422, success signs out everywhere and new password works', async () => {
      await M.UserModel.create({ username: 'pwchg', passwordHash: await M.hashPassword('old-password-1') });
      const { token: t, cookie } = await login('pwchg', 'old-password-1');
      const wrong = await post('/auth/change-password', t).send({ currentPassword: 'nope-nope', newPassword: 'new-password-1' });
      expect(wrong.status).toBe(422); expect(wrong.body.error.details.currentPassword).toBeTruthy();
      expect((await post('/auth/change-password', t).send({ currentPassword: 'old-password-1', newPassword: 'short' })).status).toBe(422);
      const ok = await post('/auth/change-password', t).send({ currentPassword: 'old-password-1', newPassword: 'new-password-1' });
      expect(ok.status).toBe(204);
      expect((await request(app).post(api('/auth/refresh')).set('Cookie', cookie)).status).toBe(401);
      expect((await login('pwchg', 'old-password-1')).r.status).toBe(401);
      expect((await login('pwchg', 'new-password-1')).r.status).toBe(200);
    });
  });

  /* ----------------------------------------------------------------- orders */
  describe('orders CRUD', () => {
    beforeEach(resetOrders);

    it('creates an order: code, DTO shape, balance, defaults', async () => {
      const r = await create({ cake: 'Red velvet birthday cake', addons: ['Candles', 'Toppers'], price: 5000, advance: 1500, profit: 1200, details: 'Happy birthday Sara' });
      expect(r.status).toBe(201);
      const o = r.body.data;
      expect(o).toMatchObject({
        orderNo: 1, code: '#OD-1001', cake: 'Red velvet birthday cake', addons: ['Candles', 'Toppers'], location: 'DHA',
        lbs: 2, price: 5000, advance: 1500, profit: 1200, balance: 3500, status: 'pending', version: 1, imageCount: 0, details: 'Happy birthday Sara',
      });
      expect(o.images).toEqual([]);
      expect(o.source).toBe(''); expect(o).not.toHaveProperty('cost');
    });
    it('optional fields: only cake, lbs and a time are needed', async () => {
      const r = await post('/orders').send({ cake: 'Vanilla cake', lbs: 1.5, scheduledAt: nextSlot().toISOString() });
      expect(r.status).toBe(201);
      expect(r.body.data).toMatchObject({ price: null, profit: null, advance: 0, balance: 0, addons: [], location: '', customer: { name: '', phone: '' } });
    });
    it('validates: missing cake / lbs, old-schema keys, fractional rupees, short phone', async () => {
      for (const bad of [{ cake: '' }, { lbs: 0 }, { source: 'tiktok' }, { cost: 10 }, { price: 99.5 }, { customer: { name: 'A', phone: '12' } }]) {
        const r = await create(bad);
        expect(r.status, JSON.stringify(bad)).toBe(422);
        expect(r.body.error.code).toBe('VALIDATION_ERROR');
      }
    });
    it('normalises the phone number', async () => {
      const r = await create({ customer: { name: 'Ali', phone: '0300 123-4567' } });
      expect(r.body.data.customer.phone).toBe('03001234567');
    });
    it('GET by id: detail has images, unknown id 404, malformed id 400', async () => {
      const c = (await create()).body.data;
      const g = await get(`/orders/${c.id}`);
      expect(g.status).toBe(200); expect(g.body.data.images).toEqual([]);
      expect((await get('/orders/aaaaaaaaaaaaaaaaaaaaaaaa')).status).toBe(404);
      expect((await get('/orders/nope')).body.error.code).toBe('BAD_ID');
    });
    it('PATCH updates fields; price can be cleared with null; stale If-Match is 412', async () => {
      const c = (await create({ price: 4000, advance: 1000 })).body.data;
      const u = await patch(`/orders/${c.id}`).set('If-Match', '1').send({ cake: 'Biscoff cake', advance: 4000, addons: [], location: 'Gulberg' });
      expect(u.status).toBe(200);
      expect(u.body.data).toMatchObject({ cake: 'Biscoff cake', advance: 4000, balance: 0, location: 'Gulberg', addons: [], version: 2 });
      const cleared = await patch(`/orders/${c.id}`).send({ price: null });
      expect(cleared.body.data).toMatchObject({ price: null, balance: 0 });
      const stale = await patch(`/orders/${c.id}`).set('If-Match', '1').send({ cake: 'x' });
      expect(stale.status).toBe(412); expect(stale.body.error.code).toBe('VERSION_CONFLICT');
    });
    it('status flow pending -> ready -> delivered sets deliveredAt and zeroes the balance; going back clears it', async () => {
      const c = (await create({ price: 3000, advance: 500 })).body.data;
      const ready = await patch(`/orders/${c.id}/status`).send({ status: 'ready' });
      expect(ready.body.data).toMatchObject({ status: 'ready', balance: 2500 });
      const done = await patch(`/orders/${c.id}/status`).send({ status: 'delivered' });
      expect(done.body.data).toMatchObject({ status: 'delivered', balance: 0 });
      expect(done.body.data.deliveredAt).toBeTruthy();
      const back = await patch(`/orders/${c.id}/status`).send({ status: 'pending' });
      expect(back.body.data.deliveredAt).toBeUndefined(); expect(back.body.data.balance).toBe(2500);
      expect((await patch(`/orders/${c.id}/status`).send({ status: 'lost' })).status).toBe(422);
    });
    it('DELETE is a soft delete: 204, then 404 and gone from the list', async () => {
      const c = (await create()).body.data;
      expect((await del(`/orders/${c.id}`)).status).toBe(204);
      expect((await get(`/orders/${c.id}`)).status).toBe(404);
      expect((await get('/orders')).body.data).toHaveLength(0);
      expect(await M.OrderModel.countDocuments({ _id: c.id, isDeleted: true })).toBe(1);
    });
    it('Idempotency-Key replays the same order instead of creating a second one', async () => {
      const body = orderBody();
      const a = await post('/orders').set('Idempotency-Key', 'k-1').send(body);
      const b = await post('/orders').set('Idempotency-Key', 'k-1').send(body);
      expect(a.status).toBe(201); expect(b.status).toBe(201);
      expect(b.headers['idempotent-replayed']).toBe('true');
      expect(b.body.data.id).toBe(a.body.data.id);
      expect(await M.OrderModel.countDocuments({})).toBe(1);
    });
  });

  /* ------------------------------------------------------------------- slot */
  describe('30 minute slot rule', () => {
    beforeEach(resetOrders);
    const T = () => Math.ceil((Date.now() + 90 * DAY) / HOUR) * HOUR; // on the hour, far from the other suites
    const at = (t: number, plus = 0) => new Date(t + plus * MIN).toISOString();

    it('a cake 20 minutes after another is a clash: 409 with the clashing order and the next free slot', async () => {
      const t = T();
      const a = (await create({ scheduledAt: at(t), cake: 'First cake' })).body.data;
      const r = await create({ scheduledAt: at(t, 20) });
      expect(r.status).toBe(409);
      expect(r.body.error.code).toBe('SLOT_CONFLICT');
      expect(r.body.error.details.conflicts).toHaveLength(1);
      expect(r.body.error.details.conflicts[0]).toMatchObject({ code: a.code, cake: 'First cake' });
      expect(r.body.error.details.nextFree).toBe(at(t, 30));
      expect(await M.OrderModel.countDocuments({})).toBe(1);
    });
    it('exactly 30 minutes apart is allowed; force saves anyway', async () => {
      const t = T();
      await create({ scheduledAt: at(t) });
      expect((await create({ scheduledAt: at(t, 30) })).status).toBe(201);
      expect((await create({ scheduledAt: at(t, 10), force: true })).status).toBe(201);
    });
    it('several clashes are all listed, and next free slot skips past the whole block', async () => {
      const t = T();
      await create({ scheduledAt: at(t) });
      await create({ scheduledAt: at(t, 30) });
      const r = await create({ scheduledAt: at(t, 15) });
      expect(r.status).toBe(409);
      expect(r.body.error.details.conflicts).toHaveLength(2);
      expect(r.body.error.details.nextFree).toBe(at(t, 60));
    });
    it('check-slot: free time -> no conflicts; clash -> conflicts + nextFree; excludeId ignores the order itself', async () => {
      const t = T();
      const a = (await create({ scheduledAt: at(t) })).body.data;
      const free = await post('/orders/check-slot').send({ scheduledAt: at(t, 120) });
      expect(free.body.data).toEqual({ conflicts: [], nextFree: null });
      const clash = await post('/orders/check-slot').send({ scheduledAt: at(t, 5) });
      expect(clash.body.data.conflicts).toHaveLength(1); expect(clash.body.data.nextFree).toBe(at(t, 30));
      const self = await post('/orders/check-slot').send({ scheduledAt: at(t, 5), excludeId: a.id });
      expect(self.body.data.conflicts).toEqual([]);
    });
    it('moving an order into a clash is refused; cancelled orders do not block', async () => {
      const t = T();
      await create({ scheduledAt: at(t) });
      const b = (await create({ scheduledAt: at(t, 120) })).body.data;
      expect((await patch(`/orders/${b.id}`).send({ scheduledAt: at(t, 10) })).status).toBe(409);
      const c = (await create({ scheduledAt: at(t, 240) })).body.data;
      await patch(`/orders/${c.id}/status`).send({ status: 'cancelled' });
      expect((await create({ scheduledAt: at(t, 240) })).status).toBe(201);
    });
  });

  /* ---------------------------------------------------------- list + filters */
  describe('list: filters, chips, search, pagination', () => {
    beforeAll(async () => {
      await resetOrders();
      const t = BASE + 400 * DAY;
      const mk = (i: number, over: Record<string, unknown>) =>
        create({ scheduledAt: new Date(t + i * 2 * HOUR).toISOString(), ...over });
      await mk(0, { cake: 'Chocolate cake', location: 'DHA', customer: { name: 'Ayesha', phone: '03001110000' } });
      await mk(1, { cake: 'Red velvet cake', location: 'Johar Town', addons: ['Balloon bouquet'], details: 'Gold topper please' });
      await mk(2, { cake: 'Vanilla cake', location: '' });
      const r = await mk(3, { cake: 'Biscoff cake', location: 'dha' });
      await patch(`/orders/${r.body.data.id}/status`).send({ status: 'ready' });
    });
    const ids = (r: Any) => r.body.data.map((o: Any) => o.cake);

    it('default order is soonest first; counts cover every status', async () => {
      const r = await get('/orders');
      expect(ids(r)).toEqual(['Chocolate cake', 'Red velvet cake', 'Vanilla cake', 'Biscoff cake']);
      expect(r.body.counts).toEqual({ all: 4, pending: 3, ready: 1, delivered: 0, cancelled: 0 });
      expect(r.body.meta).toMatchObject({ page: 1, total: 4, pages: 1 });
      expect(r.body.data[0]).not.toHaveProperty('images');
    });
    it('status filter keeps the counts of the other chips', async () => {
      const r = await get('/orders?status=ready');
      expect(ids(r)).toEqual(['Biscoff cake']);
      expect(r.body.counts.all).toBe(4);
    });
    it('location: case-insensitive exact match, and "no location"', async () => {
      expect(ids(await get('/orders?location=DHA'))).toEqual(['Chocolate cake', 'Biscoff cake']);
      expect(ids(await get('/orders?location=__none__'))).toEqual(['Vanilla cake']);
      expect(ids(await get('/orders?location=Johar'))).toEqual([]);
    });
    it('search: cake, add-on, details, customer, location (contains, any case) and phone prefix', async () => {
      expect(ids(await get('/orders?q=VELVET'))).toEqual(['Red velvet cake']);
      expect(ids(await get('/orders?q=balloon'))).toEqual(['Red velvet cake']);
      expect(ids(await get('/orders?q=gold'))).toEqual(['Red velvet cake']);
      expect(ids(await get('/orders?q=ayesh'))).toEqual(['Chocolate cake']);
      expect(ids(await get('/orders?q=johar'))).toEqual(['Red velvet cake']);
      expect(ids(await get('/orders?q=0300111'))).toEqual(['Chocolate cake']);
      expect(ids(await get('/orders?q=.*'))).toEqual([]); // metacharacters are escaped, not interpreted
    });
    it('combined filters and pagination', async () => {
      expect(ids(await get('/orders?location=dha&status=pending'))).toEqual(['Chocolate cake']);
      const p = await get('/orders?limit=3&page=2');
      expect(ids(p)).toEqual(['Biscoff cake']); expect(p.body.meta).toMatchObject({ page: 2, pages: 2, total: 4 });
      expect(ids(await get('/orders?sort=-scheduledAt&limit=1'))).toEqual(['Biscoff cake']);
    });
    it('rejects unknown query keys and old statuses', async () => {
      expect((await get('/orders?source=whatsapp')).status).toBe(422);
      expect((await get('/orders?status=overdue')).status).toBe(422);
    });
  });

  /* ---------------------------------------------------------------- upcoming */
  describe('upcoming reminders', () => {
    beforeEach(resetOrders);
    const inMin = (m: number) => new Date(Date.now() + m * MIN).toISOString();
    it('returns the next five open orders even when they are outside the reminder window', async () => {
      for (let i = 7; i >= 1; i--) await create({ scheduledAt: inMin(60 + i * 10), cake: `Cake ${i}`, force: true });
      const r = await get('/orders/next-upcoming');
      expect(r.body.data.map((o: Any) => o.cake)).toEqual(['Cake 1', 'Cake 2', 'Cake 3', 'Cake 4', 'Cake 5']);
      expect(r.body.meta.total).toBe(5);
    });
    it('lists open orders due within the window, soonest first; delivered and later ones are left out', async () => {
      await create({ scheduledAt: inMin(40), cake: 'B', force: true });
      await create({ scheduledAt: inMin(10), cake: 'A', force: true });
      await create({ scheduledAt: inMin(90), cake: 'late', force: true });
      const done = (await create({ scheduledAt: inMin(20), cake: 'done', force: true })).body.data;
      await patch(`/orders/${done.id}/status`).send({ status: 'delivered' });
      const ready = (await create({ scheduledAt: inMin(25), cake: 'R', force: true })).body.data;
      await patch(`/orders/${ready.id}/status`).send({ status: 'ready' });
      const r = await get('/orders/upcoming');
      expect(r.body.data.map((o: Any) => o.cake)).toEqual(['A', 'R', 'B']);
      expect(r.body.meta.minutes).toBe(45);
      expect((await get('/orders/upcoming?minutes=120')).body.data).toHaveLength(4);
      expect((await get('/orders/upcoming?minutes=0')).status).toBe(422);
    });
  });

  /* ------------------------------------------------------------------- stats */
  describe('stats', () => {
    beforeEach(resetOrders);
    it('overview: totals ignore cancelled orders, balance ignores delivered and unpriced ones', async () => {
      const a = await create({ cake: 'A', price: 3000, advance: 1000, profit: 900 });
      await create({ cake: 'B', price: 5000, advance: 5000, profit: 1500 });
      await create({ cake: 'C', price: null, profit: null });
      const d = (await create({ cake: 'D', price: 2000, advance: 0, profit: 400 })).body.data;
      await patch(`/orders/${d.id}/status`).send({ status: 'delivered' });
      const x = (await create({ cake: 'X', price: 9000, advance: 0, profit: 9000 })).body.data;
      await patch(`/orders/${x.id}/status`).send({ status: 'cancelled' });
      expect(a.status).toBe(201);
      const o = (await get('/stats/overview')).body.data;
      expect(o.totalSales).toBe(10000);
      expect(o.totalProfit).toBe(2800);
      expect(o.balance).toBe(2000);
      expect(o.upcoming).toBe(3); // A, B, C are open; D delivered, X cancelled
      expect(o.todayCount).toBe(0);
      expect(o.upNext.map((n: Any) => n.cake)).toEqual(['A', 'B', 'C']);
    });
    it('sales: totals, averages, best sellers and the 7-day bars', async () => {
      const now = () => new Date().toISOString();
      await create({ cake: 'Red velvet cake', lbs: 2, price: 4000, advance: 1000, profit: 1000, scheduledAt: now(), force: true });
      await create({ cake: 'red velvet CAKE', lbs: 3, price: 6000, advance: 6000, profit: 2000, scheduledAt: now(), force: true });
      await create({ cake: 'Vanilla cake', lbs: 1, price: 2000, advance: 0, profit: 500, scheduledAt: now(), force: true });
      await create({ cake: 'Far future', lbs: 1, price: 777, scheduledAt: new Date(Date.now() + 40 * DAY).toISOString() });
      const day = (await get('/stats/sales?period=1')).body.data;
      expect(day).toMatchObject({ period: '1', orders: 3, sales: 12000, profit: 3500, lbs: 6, avgPerOrder: 4000, avgPerLb: 2000, advance: 7000, balance: 5000 });
      expect(day.best).toEqual([{ name: 'Red velvet cake', count: 2 }, { name: 'Vanilla cake', count: 1 }]);
      expect(day.last7).toHaveLength(7);
      expect(day.last7.at(-1).total).toBe(12000);
      expect((await get('/stats/sales')).body.data.period).toBe('1'); // default period
      const month = (await get('/stats/sales?period=m')).body.data;
      expect(month).toMatchObject({ period: 'm', orders: 3, sales: 12000, profit: 3500 });
      expect(month.month).toMatch(/^\d{4}-\d{2}$/);
      expect(month.daily).toEqual([{ date: expect.any(String), orders: 3, sales: 12000, profit: 3500 }]);
      const old = (await get('/stats/sales?period=m&month=2000-01')).body.data;
      expect(old).toMatchObject({ month: '2000-01', orders: 0, sales: 0, daily: [] });
      const today = new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10); // Karachi day
      const week = (await get('/stats/sales?period=w')).body.data;
      expect(week).toMatchObject({ period: 'w', orders: 3, sales: 12000 });
      expect(new Date(`${week.to}T00:00:00Z`).getTime() - new Date(`${week.from}T00:00:00Z`).getTime()).toBe(6 * DAY); // Mon..Sun
      expect(new Date(`${week.from}T00:00:00Z`).getUTCDay()).toBe(1);
      const custom = (await get(`/stats/sales?period=c&from=${today}&to=${today}`)).body.data;
      expect(custom).toMatchObject({ period: 'c', from: expect.any(String), to: custom.from, orders: 3, sales: 12000 });
      const none = (await get('/stats/sales?period=c&from=2000-01-01&to=2000-01-31')).body.data;
      expect(none).toMatchObject({ from: '2000-01-01', to: '2000-01-31', orders: 0, daily: [] });
      for (const bad of ['period=c', 'period=c&from=2026-02-01', 'period=c&from=2026-02-10&to=2026-02-01', 'period=c&from=2020-01-01&to=2026-01-01', 'period=c&from=2026-02-31&to=2026-03-01', 'period=week', 'period=7', 'period=all', 'period=m&month=2026-13', 'period=m&month=nope']) expect((await get(`/stats/sales?${bad}`)).status).toBe(422);
    });
    it('sales on an empty shop is all zeros', async () => {
      const s = (await get('/stats/sales?period=m')).body.data;
      expect(s).toMatchObject({ orders: 0, sales: 0, avgPerOrder: 0, avgPerLb: 0, best: [] });
    });
  });

  /* ---------------------------------------------------------------- settings */
  describe('settings lists', () => {
    beforeAll(async () => { await M.mongoose.connection.collection('lists').deleteMany({}); });
    it('GET returns the shop defaults until something is saved', async () => {
      const r = await get('/settings');
      expect(r.status).toBe(200);
      expect(r.body.data.flavours).toContain('Red velvet');
      expect(r.body.data.locations).toContain('Johar Town');
      expect(r.body.data.addons).toContain('Balloon bouquet');
    });
    it('PUT replaces the lists (trimmed, de-duplicated) and GET reads them back', async () => {
      const put = await request(app).put(api('/settings')).set(bearer()).send({ flavours: [' Mango ', 'mango', 'Lotus'], locations: ['DHA'], addons: [] });
      expect(put.status).toBe(200);
      expect(put.body.data).toEqual({ flavours: ['Mango', 'Lotus'], locations: ['DHA'], addons: [] });
      expect((await get('/settings')).body.data).toEqual(put.body.data);
    });
    it('rejects empty items and unknown keys; needs a token', async () => {
      const bad = await request(app).put(api('/settings')).set(bearer()).send({ flavours: [''], locations: [], addons: [] });
      expect(bad.status).toBe(422);
      expect((await request(app).put(api('/settings')).set(bearer()).send({ flavours: [], locations: [], addons: [], x: 1 })).status).toBe(422);
      expect((await request(app).put(api('/settings')).send({ flavours: [], locations: [], addons: [] })).status).toBe(401);
    });
  });

  /* ---------------------------------------------------------------- uploads */
  describe('uploads', () => {
    let sharp: Any; let png: Buffer;
    beforeAll(async () => {
      await resetOrders();
      sharp = (await import('sharp')).default;
      png = await sharp({ create: { width: 2400, height: 1200, channels: 3, background: '#0B7A68' } }).png().toBuffer();
    });
    const up = (files: Array<{ buf: Buffer; name: string; type: string }>, t = token) => {
      const r = request(app).post(api('/uploads')).set(bearer(t));
      for (const f of files) r.attach('files', f.buf, { filename: f.name, contentType: f.type });
      return r;
    };
    const img = (n = 'a.png') => ({ buf: png, name: n, type: 'image/png' });
    const bin = (url: string) => request(app).get(url).buffer(true).parse((res, cb) => { const c: Buffer[] = []; res.on('data', (d: Buffer) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c) as Any)); });

    it('requires auth', async () => {
      expect((await request(app).post(api('/uploads')).attach('files', png, { filename: 'a.png', contentType: 'image/png' })).status).toBe(401);
    });
    it('stores resized webp + 400px thumb, returns refs with urls, files are served publicly with cache headers', async () => {
      const r = await up([img(), img('b.png')]);
      expect(r.status).toBe(201);
      expect(r.body.data).toHaveLength(2);
      const ref = r.body.data[0];
      expect(ref.key).toMatch(/^[a-f0-9]{32}\.webp$/); expect(ref.thumbKey).toMatch(/^[a-f0-9]{32}\.t\.webp$/);
      expect(ref.w).toBe(1600); expect(ref.h).toBe(800);
      expect(ref.url).toBe(`/api/v1/files/${ref.key}`);
      const main = await bin(ref.url);
      expect(main.status).toBe(200); expect(main.headers['content-type']).toContain('image/webp');
      expect(main.headers['cache-control']).toMatch(/immutable/); expect(main.headers['x-content-type-options']).toBe('nosniff');
      const meta = await sharp(main.body).metadata(); expect(meta.format).toBe('webp'); expect(meta.width).toBe(1600);
      const th = await bin(ref.thumbUrl);
      expect((await sharp(th.body).metadata()).width).toBe(400);
    });
    it('rejects: no files, wrong mime, fake image bytes, >6 files, >5MB', async () => {
      expect((await request(app).post(api('/uploads')).set(bearer())).status).toBe(422);
      const txt = await up([{ buf: Buffer.from('hello'), name: 'a.txt', type: 'text/plain' }]);
      expect(txt.status).toBe(422); expect(txt.body.error.message).toMatch(/Unsupported file type/);
      expect((await up([{ buf: Buffer.from('MZ'), name: 'a.png', type: 'application/x-msdownload' }])).status).toBe(422);
      const fake = await up([{ buf: Buffer.from('this is not a png'), name: 'a.png', type: 'image/png' }]);
      expect(fake.status).toBe(422); expect(fake.body.error.message).toMatch(/not a valid image/);
      expect((await up(Array.from({ length: 7 }, (_, i) => img(`${i}.png`)))).status).toBe(422);
      const six = await up(Array.from({ length: 6 }, (_, i) => img(`${i}.png`)));
      expect(six.status).toBe(201); expect(six.body.data).toHaveLength(6);
      const big = await up([{ buf: Buffer.alloc(5 * 1024 * 1024 + 1024, 1), name: 'big.png', type: 'image/png' }]);
      expect(big.status).toBe(413);
    }, 30_000);
    it('file route rejects traversal and unknown or non-public keys (json sidecars)', async () => {
      expect((await request(app).get(api('/files/..%2F..%2Fetc%2Fpasswd'))).status).toBe(404);
      expect((await request(app).get(api(`/files/${'0'.repeat(32)}.webp`))).status).toBe(404);
      const r = await up([img()]);
      const id = r.body.data[0].key.replace('.webp', '');
      expect((await request(app).get(api(`/files/${id}.json`))).status).toBe(404);
    });
    it('orders accept uploaded keys: cover thumb in list rows, full images only in detail; unknown keys 422', async () => {
      const refs = (await up([img(), img('2.png')])).body.data;
      const c = await create({ images: [refs[0].key, refs[1].key] });
      expect(c.status).toBe(201);
      expect(c.body.data.imageCount).toBe(2);
      expect(c.body.data.coverThumb).toBe(refs[0].thumbUrl);
      expect(c.body.data.images.map((i: Any) => i.key)).toEqual([refs[0].key, refs[1].key]);
      const list = (await get('/orders')).body.data[0];
      expect(list.images).toBeUndefined(); expect(list.imageCount).toBe(2); expect(list.coverThumb).toBe(refs[0].thumbUrl);
      const raw = await M.OrderModel.findById(c.body.data.id).lean();
      expect(raw.coverThumb).toBe(refs[0].thumbKey); // key only, never a URL
      expect(JSON.stringify(raw.images)).not.toContain('/api/');
      const bad = await create({ images: ['f'.repeat(32) + '.webp'] });
      expect(bad.status).toBe(422); expect(bad.body.error.details.images).toMatch(/unknown keys/);
      expect((await create({ images: ['../../etc/passwd'] })).status).toBe(422);
    });
    it('PATCH images: reorder keeps refs, remove updates count/cover, empty array clears', async () => {
      const refs = (await up([img(), img('2.png')])).body.data;
      const c = (await create({ images: [refs[0].key, refs[1].key] })).body.data;
      const re = await patch(`/orders/${c.id}`).send({ images: [refs[1].key, refs[0].key] });
      expect(re.body.data.coverThumb).toBe(refs[1].thumbUrl);
      const one = await patch(`/orders/${c.id}`).send({ images: [refs[1].key] });
      expect(one.body.data.imageCount).toBe(1);
      const none = await patch(`/orders/${c.id}`).send({ images: [] });
      expect(none.body.data.imageCount).toBe(0); expect(none.body.data.coverThumb).toBeUndefined(); expect(none.body.data.images).toEqual([]);
    });
  });
});
