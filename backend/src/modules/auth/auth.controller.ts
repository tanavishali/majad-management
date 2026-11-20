import type { CookieOptions, Request, RequestHandler, Response } from 'express';
import { env } from '../../config/env';
import { sendOne } from '../../utils/response';
import { authService } from './auth.service';

export const REFRESH_COOKIE = 'refresh_token';
const cookieOpts = (): CookieOptions => ({
  httpOnly: true, secure: env.isProd || env.COOKIE_SAMESITE === 'none', sameSite: env.COOKIE_SAMESITE,
  path: '/api/v1/auth', maxAge: env.REFRESH_TOKEN_DAYS * 86_400_000,
});
const wrap = (fn: (req: Request, res: Response) => Promise<void>): RequestHandler => (req, res, next) => { fn(req, res).catch(next); };
const ua = (req: Request) => req.header('user-agent');

export const authController = {
  login: wrap(async (req, res) => {
    const r = await authService.login(req.body.username, req.body.password, ua(req));
    res.cookie(REFRESH_COOKIE, r.refreshToken, cookieOpts());
    sendOne(res, { accessToken: r.accessToken, user: r.user });
  }),
  refresh: wrap(async (req, res) => {
    try {
      const r = await authService.refresh(req.cookies?.[REFRESH_COOKIE], ua(req));
      res.cookie(REFRESH_COOKIE, r.refreshToken, cookieOpts());
      sendOne(res, { accessToken: r.accessToken, user: r.user });
    } catch (e) {
      res.clearCookie(REFRESH_COOKIE, { ...cookieOpts(), maxAge: undefined });
      throw e;
    }
  }),
  logout: wrap(async (req, res) => {
    await authService.logout(req.cookies?.[REFRESH_COOKIE]);
    res.clearCookie(REFRESH_COOKIE, { ...cookieOpts(), maxAge: undefined });
    res.status(204).end();
  }),
  me: wrap(async (req, res) => sendOne(res, await authService.me(req.user!.id))),
  changePassword: wrap(async (req, res) => {
    await authService.changePassword(req.user!.id, req.body.currentPassword, req.body.newPassword);
    res.clearCookie(REFRESH_COOKIE, { ...cookieOpts(), maxAge: undefined });
    res.status(204).end();
  }),
};
