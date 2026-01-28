import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ExportJob, RunState } from './types';

const execFileAsync = promisify(execFile);

export async function runExport(jobs: ExportJob[], state: RunState) {
  if (state.running) {
    console.warn('Export already running; skipping this tick.');
    return;
  }
  state.running = true;
  state.lastRun = new Date();
  const errors: string[] = [];

  for (const job of jobs) {
    const jobState = state.jobs[job.id];
    jobState.running = true;
    jobState.lastRun = new Date();

    const args = ['-o', job.outputPath, '-e', job.email];
    if (job.calendarCode) args.push('-c', job.calendarCode);

    try {
      const { stdout, stderr } = await execFileAsync('timetree-exporter', args, {
        env: { ...process.env, TIMETREE_PASSWORD: job.password },
        timeout: 5 * 60 * 1000,
      });
      if (stdout) process.stdout.write(stdout);
      if (stderr) process.stderr.write(stderr);
      jobState.lastSuccess = new Date();
      jobState.lastError = undefined;
      console.log(
        `[${jobState.lastSuccess.toISOString()}] Export (${job.email}${
          job.calendarCode ? `:${job.calendarCode}` : ''
        }) -> ${job.outputPath}`
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : typeof err === 'string' ? err : 'unknown error';
      jobState.lastError = message;
      errors.push(`${job.id}: ${message}`);
      console.error(
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
