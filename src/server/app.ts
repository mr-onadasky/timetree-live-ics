import express from 'express';
import path from 'node:path';
import { Buffer } from 'node:buffer';
import { ExportJob, HealthPayload, RunState } from '@/lib/types';
import { maskIfToken } from '@/lib/health';
import { logger } from '@/lib/logger';
import { buildInfo } from '@/lib/version';

export function buildApp(
  jobs: ExportJob[],
  state: RunState,
  cronSchedule: string,
  outputDirs: string[],
  configPath?: string
) {
  const app = express();
  const resolvedOutputDirs = outputDirs.map((dir) => path.resolve(dir));
  const logOutputPaths = process.env.LOG_OUTPUT_PATHS === 'true';

  // Per-file basic auth based on config (runs before static)
  app.use((req, res, next) => {
    const requestedPath = req.path.split('?')[0];
    const stripped = requestedPath.replace(/^\/+/, '');

    let job: ExportJob | undefined;
    for (const dir of resolvedOutputDirs) {
      const candidate = path.resolve(dir, stripped);
      const dirPrefix = dir.endsWith(path.sep) ? dir : `${dir}${path.sep}`;
      if (!candidate.startsWith(dirPrefix)) continue; // prevent path traversal

      const match = jobs.find((j) => path.resolve(j.outputPath) === candidate);
      if (match) {
        job = match;
        break; // respect static directory order
      }
    }

    if (!job || !job.auth) return next();

    if (job.auth.type === 'basic') {
      const header = req.headers.authorization;
      if (!header || !header.toLowerCase().startsWith('basic ')) {
        res.setHeader('WWW-Authenticate', 'Basic realm="ICS"');
        return res.status(401).send('Authentication required');
      }
      const [, encoded] = header.split(' ');
      const decoded = Buffer.from(encoded, 'base64').toString('utf8');
      const [user, pass] = decoded.split(':');
      if (user === job.auth.username && pass === job.auth.password) {
        return next();
      }
      res.setHeader('WWW-Authenticate', 'Basic realm="ICS"');
      return res.status(401).send('Invalid credentials');
    }

    return next();
  });

  for (const dir of outputDirs) {
    app.use(express.static(dir));
  }

  app.get('/health', (_req, res) => {
    const payload: HealthPayload = {
      status: state.lastError ? 'degraded' : 'ok',
      lastRun: state.lastRun?.toISOString() ?? null,
      lastSuccess: state.lastSuccess?.toISOString() ?? null,
      lastError: state.lastError ?? null,
      running: state.running,
      schedule: cronSchedule,
      version: buildInfo.version,
    };

    // Log detailed info (masked tokens) without returning it
    const details = {
      outputs: jobs.map(maskIfToken),
      jobs: jobs.map((job) => ({
        id: job.id,
        email: job.email,
        calendarCode: job.calendarCode ?? null,
        outputPath: maskIfToken(job),
        lastRun: state.jobs[job.id].lastRun?.toISOString() ?? null,
        lastSuccess: state.jobs[job.id].lastSuccess?.toISOString() ?? null,
        lastError: state.jobs[job.id].lastError ?? null,
        running: state.jobs[job.id].running,
      })),
    };
    logger.debug({ details }, 'Health detail');

    res.json(payload);
  });

  app.get('/version', (_req, res) => {
    res.json(buildInfo);
  });

  // Logging
  if (configPath) logger.info(`Config path: ${configPath}`);
  logger.info('Outputs:');
  for (const job of jobs) {
    logger.info(`- ${logOutputPaths ? job.outputPath : maskIfToken(job)}`);
  }

  return app;
}
