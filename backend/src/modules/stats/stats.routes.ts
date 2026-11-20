import { Router } from 'express';
import { salesQuerySchema, type SalesQuery } from '@order-desk/shared';
import { requireAuth } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { sendOne } from '../../utils/response';
import { statsService } from './stats.service';

export const statsRoutes = Router();
statsRoutes.use(requireAuth);
statsRoutes.get('/overview', (_req, res, next) => { statsService.overview().then(d => sendOne(res, d)).catch(next); });
statsRoutes.get('/sales', validate({ query: salesQuerySchema }), (_req, res, next) => {
  statsService.sales(res.locals.query as SalesQuery).then(d => sendOne(res, d)).catch(next);
});
