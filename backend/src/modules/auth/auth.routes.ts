import { Router } from 'express';
import { changePasswordSchema, loginSchema } from '@order-desk/shared';
import { requireAuth } from '../../middlewares/auth';
import { loginLimiter } from '../../middlewares/rateLimit';
import { validate } from '../../middlewares/validate';
import { authController as c } from './auth.controller';

export const authRoutes = Router();
authRoutes.post('/login', loginLimiter, validate({ body: loginSchema }), c.login);
authRoutes.post('/refresh', loginLimiter, c.refresh);
authRoutes.post('/logout', c.logout); // cookie-based; works even when the access token has expired
authRoutes.get('/me', requireAuth, c.me);
authRoutes.post('/change-password', requireAuth, validate({ body: changePasswordSchema }), c.changePassword);
