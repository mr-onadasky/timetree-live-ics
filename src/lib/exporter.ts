import { writeFile } from 'node:fs/promises';
import { ExportJob, RunState } from '@/lib/types';
import { logger } from '@/lib/logger';
import { login, resolveCalendar, fetchEvents } from '@/lib/timetree';
import { buildICS } from '@/lib/ics';
import { buildInfo } from '@/lib/version';
import { maskIfToken } from '@/lib/health';

const LOG_OUTPUT_PATHS = process.env.LOG_OUTPUT_PATHS === 'true';

export async function runExport(jobs: ExportJob[], state: RunState) {
  if (state.running) {
    logger.warn('Export already running; skipping this tick.');
    return;
  }
  state.running = true;
  state.lastRun = new Date();
  const errors: string[] = [];

  for (const job of jobs) {
    const jobState = state.jobs[job.id];
    jobState.running = true;
    jobState.lastRun = new Date();

    try {
      const sessionId = await login(job.email, job.password);
      const { calendarId, calendarName, aliasCode } = await resolveCalendar(
        sessionId,
        job.calendarCode
      );
      const events = await fetchEvents(sessionId, calendarId, calendarName);
      logger.info(
        `Fetched ${events.length} events for ${job.email}${
          aliasCode ? `:${aliasCode}` : ''
        } (${calendarName})`
      );

      const ics = buildICS(events, buildInfo.version);
      await writeFile(job.outputPath, ics, 'utf8');

      jobState.lastSuccess = new Date();
      jobState.lastError = undefined;
      logger.info(
        `[${jobState.lastSuccess.toISOString()}] Export (${job.email}${
          job.calendarCode ? `:${job.calendarCode}` : ''
        }) -> ${LOG_OUTPUT_PATHS ? job.outputPath : maskIfToken(job)}`
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : typeof err === 'string' ? err : 'unknown error';
      jobState.lastError = message;
      errors.push(`${job.id}: ${message}`);
      logger.error(
        `[${new Date().toISOString()}] Export failed for ${job.email}${
          job.calendarCode ? `:${job.calendarCode}` : ''
        }: ${message}`
      );
    } finally {
      jobState.running = false;
    }
  }

  if (errors.length === 0) {
    state.lastSuccess = new Date();
    state.lastError = undefined;
  } else {
    state.lastError = errors.join('; ');
  }
  state.running = false;
}
