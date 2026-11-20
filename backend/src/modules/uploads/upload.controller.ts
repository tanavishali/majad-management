import type { Request, RequestHandler } from 'express';
import multer from 'multer';
import { MAX_IMAGES, MAX_IMAGE_BYTES } from '@order-desk/shared';
import { AppError } from '../../utils/AppError';
import { sendOne } from '../../utils/response';
import { ALLOWED_MIME, processAndStore } from './upload.service';
import { PUBLIC_KEY_RE, getStorage, LocalStorage } from './storage';

export const multipart = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: MAX_IMAGES },
  fileFilter: (_req, file, cb) => (ALLOWED_MIME.includes(file.mimetype) ? cb(null, true) : cb(new AppError(422, 'VALIDATION_ERROR', `Unsupported file type: ${file.mimetype}`))),
}).array('files', MAX_IMAGES);

export const upload: RequestHandler = async (req: Request, res, next) => {
  try {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (!files.length) throw new AppError(422, 'VALIDATION_ERROR', 'No files uploaded (multipart field "files")');
    const refs = [];
    for (const f of files) refs.push(await processAndStore(f.buffer));
    sendOne(res, refs, 201);
  } catch (e) { next(e); }
};

/** Keys are unguessable 128-bit ids, so this route is public (img tags cannot send Bearer headers). */
export const serveFile: RequestHandler = async (req, res, next) => {
  try {
    const key = String(req.params.key);
    if (!PUBLIC_KEY_RE.test(key)) throw AppError.notFound('File');
    const storage = getStorage();
    if (!(await storage.exists(key))) throw AppError.notFound('File');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.type('image/webp');
    if (storage instanceof LocalStorage) return void res.sendFile(storage.localPath(key));
    res.send(await storage.get(key));
  } catch (e) { next(e); }
};
