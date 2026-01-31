import path from 'node:path';
import { ExportJob } from '@/lib/types';

export function maskIfToken(job: Pick<ExportJob, 'outputPath' | 'token'>) {
  if (!job.token) return job.outputPath;
  const dir = path.dirname(job.outputPath);
  const ext = path.extname(job.outputPath);
  return path.join(dir, `<redacted>${ext ? ext : ''}`);
}

// Exposed for tests
export const maskIfTokenForTest = maskIfToken;
