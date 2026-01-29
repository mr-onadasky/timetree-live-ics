import { randomBytes } from 'node:crypto';

export function slugify(input: string) {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'item'
  );
}

export function ensureDir(fs: { existsSync(path: string): boolean; mkdirSync(path: string, opts: any): void }, dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export function randomToken(length = 12) {
  const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const bytes = randomBytes(length);
  let out = '';
  for (const byte of bytes) {
    out += alphabet[byte % alphabet.length];
  }
  return out;
}
