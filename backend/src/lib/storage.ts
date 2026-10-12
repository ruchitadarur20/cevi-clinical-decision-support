import { promises as fs } from 'node:fs';
import path from 'node:path';

/** Storage abstraction: swap LocalDiskStorage for S3/GCS without touching route code. */
export interface StorageProvider {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
}

const SAFE_KEY = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,120}$/;

export class LocalDiskStorage implements StorageProvider {
  private readonly root: string;
  constructor(root: string) {
    this.root = path.resolve(root);
  }
  private resolve(key: string): string {
    if (!SAFE_KEY.test(key) || key.includes('..')) throw new Error('Invalid storage key');
    return path.join(this.root, key);
  }
  async put(key: string, data: Buffer) {
    await fs.mkdir(this.root, { recursive: true });
    await fs.writeFile(this.resolve(key), data, { mode: 0o600 });
  }
  async get(key: string) {
    return fs.readFile(this.resolve(key));
  }
  async exists(key: string) {
    try {
      await fs.access(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }
}

/** In-memory provider used by tests. */
export class MemoryStorage implements StorageProvider {
  private files = new Map<string, Buffer>();
  async put(key: string, data: Buffer) {
    this.files.set(key, data);
  }
  async get(key: string) {
    const f = this.files.get(key);
    if (!f) throw new Error('not found');
    return f;
  }
  async exists(key: string) {
    return this.files.has(key);
  }
}
