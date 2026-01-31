import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, afterEach } from 'vitest';
import { loadJobs } from '@/lib/config';

function withTempDir(fn: (dir: string) => void) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'tt-'));
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('config loader', () => {
  const envBackup = { ...process.env };

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it('generates random token when output omitted', () => {
    withTempDir((dir) => {
      const cfg = `
exports:
  - email: a@example.com
    password: pw
    calendars: [abc]
`;
      const cfgPath = path.join(dir, 'config.yaml');
      writeFileSync(cfgPath, cfg);
      process.env.TIMETREE_CONFIG = cfgPath;
      process.env.OUTPUT_BASE = dir;
      const { jobs } = loadJobs();
      const token = jobs[0].token;
      expect(token).toBeDefined();
      expect(token).toMatch(/^[A-Z0-9]{6,10}$/);
      const { jobs: jobs2 } = loadJobs();
      expect(jobs2[0].token).toBe(token); // stable across runs
    });
  });

  it('respects randomToken false to avoid tokenized filenames', () => {
    withTempDir((dir) => {
      const cfg = `
exports:
  - email: a@example.com
    password: pw
    calendars: [abc]
    randomToken: false
`;
      const cfgPath = path.join(dir, 'config.yaml');
      writeFileSync(cfgPath, cfg);
      process.env.TIMETREE_CONFIG = cfgPath;
      process.env.OUTPUT_BASE = dir;
      const { jobs } = loadJobs();
      expect(jobs[0].token).toBeUndefined();
      expect(path.basename(jobs[0].outputPath)).toBe('a-example-com-abc.ics');
    });
  });

  it('parses basic auth per job', () => {
    withTempDir((dir) => {
      const cfg = `
exports:
  - email: a@example.com
    password: pw
    calendars: [abc]
    auth:
      type: basic
      username: user
      password: pass
`;
      const cfgPath = path.join(dir, 'config.yaml');
      writeFileSync(cfgPath, cfg);
      process.env.TIMETREE_CONFIG = cfgPath;
      process.env.OUTPUT_BASE = dir;
      const { jobs } = loadJobs();
      expect(jobs[0].auth).toEqual({ type: 'basic', username: 'user', password: 'pass' });
    });
  });
});
