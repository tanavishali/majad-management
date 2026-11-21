import { Router } from 'express';
import { checkSlotSchema, orderInputSchema, orderQuerySchema, orderUpdateSchema, statusChangeSchema, upcomingQuerySchema } from '@order-desk/shared';
import { requireAuth } from '../../middlewares/auth';
import { writeLimiter } from '../../middlewares/rateLimit';
import { validate, validateId } from '../../middlewares/validate';
import { orderController as c } from './order.controller';

export const orderRoutes = Router();
orderRoutes.use(requireAuth);
orderRoutes.get('/', validate({ query: orderQuerySchema }), c.list);
orderRoutes.get('/next-upcoming', c.nextUpcoming);
orderRoutes.get('/upcoming', validate({ query: upcomingQuerySchema }), c.upcoming);
orderRoutes.post('/check-slot', validate({ body: checkSlotSchema }), c.checkSlot);
orderRoutes.post('/', writeLimiter, validate({ body: orderInputSchema }), c.create);
orderRoutes.get('/:id', validateId(), c.get);
orderRoutes.patch('/:id/status', writeLimiter, validateId(), validate({ body: statusChangeSchema }), c.setStatus);
orderRoutes.patch('/:id', writeLimiter, validateId(), validate({ body: orderUpdateSchema }), c.update);
orderRoutes.delete('/:id', writeLimiter, validateId(), c.remove);
