import { Schema, model } from 'mongoose';

const userSchema = new Schema({
  username: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  failedAttempts: { type: Number, default: 0 },
  lockedUntil: { type: Date },
}, { timestamps: true, versionKey: false });
export const UserModel = model('User', userSchema);

const sessionSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  family: { type: String, required: true, index: true },
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date },
  userAgent: String,
}, { timestamps: true, versionKey: false });
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'sessions_ttl' });
export const SessionModel = model('Session', sessionSchema);
