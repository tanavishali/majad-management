import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth';
import { uploadLimiter } from '../../middlewares/rateLimit';
import { multipart, upload } from './upload.controller';

export const uploadRoutes = Router();
uploadRoutes.post('/', requireAuth, uploadLimiter, multipart, upload);
