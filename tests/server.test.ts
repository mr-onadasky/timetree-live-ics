import path from 'node:path';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import { describe, it, expect, afterEach } from 'vitest';
import { buildApp } from '@/server/app';
import { RunState, ExportJob } from '@/lib/types';
import httpMocks from 'node-mocks-http';

function tempDir() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'tt-server-'));
  return dir;
}

describe('server endpoints', () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('serves ICS without auth when not configured', async () => {
    dir = tempDir();
    const icsPath = path.join(dir, 'public.ics');
    mkdirSync(dir, { recursive: true });
    writeFileSync(icsPath, 'BEGIN:VCALENDAR');

    const jobs: ExportJob[] = [
      {
        id: '1',
        email: 'a@example.com',
        password: 'pw',
        outputPath: icsPath,
      },
    ];
    const state: RunState = { running: false, jobs: { '1': { running: false } } };
    const app = buildApp(jobs, state, '* * * * *', [dir]);
    const { res } = await perform(app, 'GET', '/public.ics');
    expect(res.statusCode).toBe(200);
  });

  it('enforces basic auth per job', async () => {
    dir = tempDir();
    const icsPath = path.join(dir, 'secure.ics');
    writeFileSync(icsPath, 'SECRET');

    const jobs: ExportJob[] = [
      {
        id: '1',
        email: 'a@example.com',
        password: 'pw',
        outputPath: icsPath,
        auth: { type: 'basic', username: 'user', password: 'pass' },
      },
    ];
    const state: RunState = { running: false, jobs: { '1': { running: false } } };
    const app = buildApp(jobs, state, '* * * * *', [dir]);

    const noAuth = await perform(app, 'GET', '/secure.ics');
    expect(noAuth.res.statusCode).toBe(401);

    const wrong = await perform(app, 'GET', '/secure.ics', {
      headers: { authorization: 'Basic dXNlcjp3cm9uZw==' },
    });
    expect(wrong.res.statusCode).toBe(401);

    const ok = await perform(app, 'GET', '/secure.ics', {
      headers: { authorization: 'Basic dXNlcjpwYXNz' },
    });
    expect(ok.res.statusCode).toBe(200);
  });

  it('health masks tokenized outputs', async () => {
    dir = tempDir();
    const icsPath = path.join(dir, 'ABC123.ics');
    writeFileSync(icsPath, 'SECRET');

    const jobs: ExportJob[] = [
      {
        id: '1',
        email: 'a@example.com',
        password: 'pw',
        outputPath: icsPath,
        token: 'ABC123',
      },
    ];
    const state: RunState = { running: false, jobs: { '1': { running: false } } };
    const app = buildApp(jobs, state, '* * * * *', [dir]);
    const { res } = await perform(app, 'GET', '/health');
    expect(res.statusCode).toBe(200);
    const body = res._getJSONData();
    expect(body).not.toHaveProperty('outputs');
    expect(body).not.toHaveProperty('jobs');
    expect(body).not.toHaveProperty('outputPath');
    expect(body.version).toBeDefined();
  });

  it('returns build info from /version', async () => {
    dir = tempDir();
    const icsPath = path.join(dir, 'public.ics');
    writeFileSync(icsPath, 'BEGIN:VCALENDAR');

    const jobs: ExportJob[] = [
      {
        id: '1',
        email: 'a@example.com',
        password: 'pw',
        outputPath: icsPath,
      },
    ];
    const state: RunState = { running: false, jobs: { '1': { running: false } } };
    const app = buildApp(jobs, state, '* * * * *', [dir]);
    const { res } = await perform(app, 'GET', '/version');
    expect(res.statusCode).toBe(200);
    const body = res._getJSONData();
    expect(body.version).toBeDefined();
    expect(typeof body.version).toBe('string');
  });
});

async function perform(app: any, method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH', url: string, opts: { headers?: Record<string, string> } = {}) {
  const req = httpMocks.createRequest({
    method,
    url,
    headers: opts.headers ?? {},
  });
  const res = httpMocks.createResponse({
    eventEmitter: require('events').EventEmitter,
  });
  await new Promise<void>((resolve) => {
    res.on('finish', () => resolve());
    res.on('end', () => resolve());
    app.handle(req, res);
  });
  return { req, res };
}
