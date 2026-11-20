import { promises as fs } from 'node:fs';
import path from 'node:path';
import { env } from '../../config/env';

/** Storage adapter. Only keys are persisted in Mongo; urls are derived. */
export interface StorageAdapter {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  exists(key: string): Promise<boolean>;
  remove(key: string): Promise<void>;
  /** absolute path for streaming (local only) */
  localPath?(key: string): string;
}

/** Keys are generated server-side: 32 hex chars, optional ".t" for thumbs, .webp or .json (metadata sidecar). */
export const KEY_RE = /^[a-f0-9]{32}(\.t)?\.(webp|json)$/;
export const PUBLIC_KEY_RE = /^[a-f0-9]{32}(\.t)?\.webp$/;

export class LocalStorage implements StorageAdapter {
  private dir: string;
  constructor(dir: string) { this.dir = path.resolve(dir); }
  localPath(key: string) {
    if (!KEY_RE.test(key)) throw new Error('invalid key');
    return path.join(this.dir, key);
  }
  async put(key: string, data: Buffer) {
    await fs.mkdir(this.dir, { recursive: true });
    await fs.writeFile(this.localPath(key), data);
  }
  async get(key: string) {
    try { return await fs.readFile(this.localPath(key)); } catch { return null; }
  }
  async exists(key: string) {
    try { await fs.access(this.localPath(key)); return true; } catch { return false; }
  }
  async remove(key: string) { await fs.rm(this.localPath(key), { force: true }); }
}

/** Stub: wire @aws-sdk/client-s3 here. Present so the adapter seam is real. */
export class S3Storage implements StorageAdapter {
  private nope(): never { throw new Error('S3 storage adapter is not implemented yet (STORAGE_DRIVER=local)'); }
  put(): Promise<void> { return this.nope(); }
  get(): Promise<Buffer | null> { return this.nope(); }
  exists(): Promise<boolean> { return this.nope(); }
  remove(): Promise<void> { return this.nope(); }
}

let instance: StorageAdapter | undefined;
export function getStorage(): StorageAdapter {
  return (instance ??= env.STORAGE_DRIVER === 's3' ? new S3Storage() : new LocalStorage(env.UPLOAD_DIR));
}
export function setStorage(s: StorageAdapter) { instance = s; }
