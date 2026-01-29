import cron from 'node-cron';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import { loadJobs } from './config';
import { ensureDir } from './utils';
import { RunState } from './types';
import { runExport } from './exporter';
import { buildApp } from './app';
import { logger } from './logger';

const CRON_SCHEDULE = process.env.CRON_SCHEDULE ?? '*/30 * * * *';
const STARTUP_DELAY_SECONDS = parseDurationSeconds(process.env.STARTUP_DELAY ?? '0s');
const PORT = Number(process.env.PORT ?? '8080');

if (!cron.validate(CRON_SCHEDULE)) {
  logger.error(`Invalid CRON_SCHEDULE: ${CRON_SCHEDULE}`);
  process.exit(1);
}

function parseDurationSeconds(raw: string): number {
  const trimmed = raw.trim();
  if (!trimmed) return 0;
  const match = /^(\d+)(s|m|h)?$/i.exec(trimmed);
  if (!match) {
    console.error(`Invalid STARTUP_DELAY: ${raw}. Use formats like "30s", "2m", "1h".`);
    process.exit(1);
  }
  const value = Number(match[1]);
  const unit = (match[2] ?? 's').toLowerCase();
  switch (unit) {
    case 's':
      return value;
    case 'm':
      return value * 60;
    case 'h':
      return value * 3600;
    default:
      return value;
  }
}

const { jobs, configPath } = loadJobs();
const outputDirs = Array.from(new Set(jobs.map((job) => path.dirname(job.outputPath))));
for (const dir of outputDirs) ensureDir({ existsSync, mkdirSync }, dir);

const state: RunState = { running: false, jobs: {} };
for (const job of jobs) {
  state.jobs[job.id] = { running: false };
}

// Kick off first export (optionally delayed)
if (STARTUP_DELAY_SECONDS > 0) {
  logger.info(`Delaying first export by ${STARTUP_DELAY_SECONDS} seconds...`);
  setTimeout(() => void runExport(jobs, state), STARTUP_DELAY_SECONDS * 1000);
} else {
  void runExport(jobs, state);
}

// Schedule exports
cron.schedule(CRON_SCHEDULE, () => void runExport(jobs, state), { timezone: 'UTC' });

// HTTP server
const app = buildApp(jobs, state, CRON_SCHEDULE, outputDirs, configPath);

app.listen(PORT, () => {
  logger.info(`Serving ${outputDirs.join(', ')} on port ${PORT}`);
  logger.info(`Cron schedule: ${CRON_SCHEDULE}`);
  if (configPath) logger.info(`Config path: ${configPath}`);
  logger.info('Outputs:');
  for (const job of jobs) {
    logger.info(`- http://localhost:${PORT}/${path.basename(job.outputPath)}`);
  }
});
