import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { AuthUser } from '@order-desk/shared';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { signAccessToken } from '../../middlewares/auth';
import { AppError } from '../../utils/AppError';
import { SessionModel, UserModel } from './auth.model';

const BCRYPT_COST = env.isTest ? 4 : 12;
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const DUMMY_HASH = bcrypt.hashSync('dummy-password', BCRYPT_COST);

export const hashPassword = (pw: string) => bcrypt.hash(pw, BCRYPT_COST);
const toUser = (u: { _id: unknown; username: string }): AuthUser => ({ id: String(u._id), username: u.username });

async function issueSession(userId: unknown, family: string, userAgent?: string) {
  const token = randomBytes(48).toString('base64url');
  await SessionModel.create({
    userId, family, tokenHash: sha256(token), userAgent: userAgent?.slice(0, 200),
    expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_DAYS * 86_400_000),
  });
  return token;
}

export const authService = {
  async login(username: string, password: string, userAgent?: string) {
    const user = await UserModel.findOne({ username: username.toLowerCase() });
    if (!user) { await bcrypt.compare(password, DUMMY_HASH); throw AppError.unauthorized('Username or password is incorrect'); }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const secs = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 1000);
      throw new AppError(423, 'ACCOUNT_LOCKED', `Too many wrong tries. Wait ${secs} seconds and try again.`, { retryAfterSeconds: secs });
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      const attempts = user.failedAttempts + 1;
      if (attempts >= env.LOCKOUT_ATTEMPTS) {
        await UserModel.updateOne({ _id: user._id }, { failedAttempts: 0, lockedUntil: new Date(Date.now() + env.LOCKOUT_SECONDS * 1000) });
        throw new AppError(423, 'ACCOUNT_LOCKED', `Too many wrong tries. Wait ${env.LOCKOUT_SECONDS} seconds and try again.`, { retryAfterSeconds: env.LOCKOUT_SECONDS });
      }
      await UserModel.updateOne({ _id: user._id }, { failedAttempts: attempts });
      throw AppError.unauthorized('Username or password is incorrect');
    }
    await UserModel.updateOne({ _id: user._id }, { failedAttempts: 0, $unset: { lockedUntil: '' } });
    const refreshToken = await issueSession(user._id, randomBytes(8).toString('hex'), userAgent);
    return { accessToken: signAccessToken(toUser(user)), user: toUser(user), refreshToken };
  },

  /** Rotation with reuse detection: presenting an already-rotated token revokes the whole family. */
  async refresh(token: string | undefined, userAgent?: string) {
    if (!token) throw AppError.unauthorized('No refresh token');
    const s = await SessionModel.findOne({ tokenHash: sha256(token) });
    if (!s || s.expiresAt < new Date()) throw AppError.unauthorized('Invalid refresh token');
    if (s.revokedAt) {
      await SessionModel.updateMany({ family: s.family }, { revokedAt: new Date() });
      logger.warn({ userId: String(s.userId) }, 'refresh token reuse detected; family revoked');
      throw AppError.unauthorized('Invalid refresh token');
    }
    // atomic claim so two parallel refreshes cannot both succeed
    const claimed = await SessionModel.findOneAndUpdate({ _id: s._id, revokedAt: { $exists: false } }, { revokedAt: new Date() });
    if (!claimed) throw AppError.unauthorized('Invalid refresh token');
    const user = await UserModel.findById(s.userId);
    if (!user) throw AppError.unauthorized('Invalid refresh token');
    const refreshToken = await issueSession(user._id, s.family, userAgent);
    return { accessToken: signAccessToken(toUser(user)), user: toUser(user), refreshToken };
  },

  async logout(token: string | undefined) {
    if (!token) return;
    const s = await SessionModel.findOne({ tokenHash: sha256(token) });
    if (s) await SessionModel.updateMany({ family: s.family }, { revokedAt: new Date() });
  },

  async me(userId: string): Promise<AuthUser> {
    const u = await UserModel.findById(userId);
    if (!u) throw AppError.unauthorized();
    return toUser(u);
  },

  async changePassword(userId: string, current: string, next: string) {
    const u = await UserModel.findById(userId);
    if (!u) throw AppError.unauthorized();
    if (!(await bcrypt.compare(current, u.passwordHash))) throw new AppError(422, 'VALIDATION_ERROR', 'Validation failed', { currentPassword: 'Current password is incorrect' });
    u.passwordHash = await hashPassword(next);
    await u.save();
    await SessionModel.updateMany({ userId: u._id }, { revokedAt: new Date() }); // sign out everywhere
  },

  /** Create the first admin if no user exists. Returns true when created. */
  async ensureAdmin(username?: string, password?: string): Promise<boolean> {
    if (!username || !password) return false;
    if (await UserModel.exists({})) return false;
    await UserModel.create({ username, passwordHash: await hashPassword(password) });
    logger.info({ username }, 'admin user created');
    return true;
  },
};
