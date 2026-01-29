import express from 'express';
import path from 'node:path';
import { Buffer } from 'node:buffer';
import { ExportJob, HealthPayload, RunState } from './types';
import { maskIfToken } from './healthHelpers';
import { logger } from './logger';

export function buildApp(
  jobs: ExportJob[],
  state: RunState,
  cronSchedule: string,
  outputDirs: string[],
  configPath?: string
) {
  const app = express();

  // Per-file basic auth based on config (runs before static)
  app.use((req, res, next) => {
    const requested = path.basename(req.path.split('?')[0]);
    const job = jobs.find((j) => path.basename(j.outputPath) === requested);
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

  // Logging
  if (configPath) logger.info(`Config path: ${configPath}`);
  logger.info('Outputs:');
  for (const job of jobs) {
    logger.info(`- ${path.basename(job.outputPath)}`);
  }

  return app;
}
