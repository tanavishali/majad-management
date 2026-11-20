import 'dotenv/config';
import { z } from 'zod';

const bool = z.enum(['true', 'false', '1', '0']).transform(v => v === 'true' || v === '1');
const DEV_SECRET = 'dev-only-insecure-secret-change-me-0123456789';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  MONGO_URI: z.string().default('mongodb://localhost:27017/orderdesk?replicaSet=rs0'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 chars').default(DEV_SECRET),
  ACCESS_TOKEN_MINUTES: z.coerce.number().default(15),
  REFRESH_TOKEN_DAYS: z.coerce.number().default(7),
  WEB_ORIGIN: z.string().default('http://localhost:5173'),
  ADMIN_USERNAME: z.string().optional(),
  ADMIN_PASSWORD: z.string().min(8).optional(),
  LOG_LEVEL: z.string().default('info'),
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  UPLOAD_DIR: z.string().default('./uploads'),
  LOCKOUT_SECONDS: z.coerce.number().default(30),
  LOCKOUT_ATTEMPTS: z.coerce.number().default(5),
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  TRUST_PROXY: z.coerce.number().default(0),
  AUTO_INDEX: bool.optional(),
  REPORT_CACHE_SECONDS: z.coerce.number().default(30),
}).superRefine((v, ctx) => {
  if (v.NODE_ENV === 'production' && v.JWT_SECRET === DEV_SECRET) {
    ctx.addIssue({ code: 'custom', path: ['JWT_SECRET'], message: 'JWT_SECRET must be set in production' });
  }
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment:', JSON.stringify(parsed.error.flatten().fieldErrors));
  process.exit(1);
}
export const env = {
  ...parsed.data,
  isProd: parsed.data.NODE_ENV === 'production',
  isTest: parsed.data.NODE_ENV === 'test',
  autoIndex: parsed.data.AUTO_INDEX ?? parsed.data.NODE_ENV !== 'production',
};
export type Env = typeof env;
