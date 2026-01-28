import cron from 'node-cron';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import { loadJobs } from './config';
import { ensureDir } from './utils';
import { RunState } from './types';
import { runExport } from './exporter';
import { buildApp } from './app';

const CRON_SCHEDULE = process.env.CRON_SCHEDULE ?? '*/30 * * * *';
const PORT = Number(process.env.PORT ?? '8080');

if (!cron.validate(CRON_SCHEDULE)) {
  console.error(`Invalid CRON_SCHEDULE: ${CRON_SCHEDULE}`);
  process.exit(1);
}

const { jobs, configPath } = loadJobs();
const outputDirs = Array.from(new Set(jobs.map((job) => path.dirname(job.outputPath))));
for (const dir of outputDirs) ensureDir({ existsSync, mkdirSync }, dir);

const state: RunState = { running: false, jobs: {} };
for (const job of jobs) {
  state.jobs[job.id] = { running: false };
}

// Kick off first export
void runExport(jobs, state);

// Schedule exports
cron.schedule(CRON_SCHEDULE, () => void runExport(jobs, state), { timezone: 'UTC' });

// HTTP server
const app = buildApp(jobs, state, CRON_SCHEDULE, outputDirs, configPath);

app.listen(PORT, () => {
  console.log(`Serving ${outputDirs.join(', ')} on port ${PORT}`);
  console.log(`Cron schedule: ${CRON_SCHEDULE}`);
  if (configPath) console.log(`Config path: ${configPath}`);
  console.log('Outputs:');
  for (const job of jobs) {
    console.log(`- http://localhost:${PORT}/${path.basename(job.outputPath)}`);
  }
});
