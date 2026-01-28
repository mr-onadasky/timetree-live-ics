export type BasicAuth = {
  type: 'basic';
  username: string;
  password: string;
};

export type ExportJob = {
  id: string;
  email: string;
  password: string;
  calendarCode?: string;
  outputPath: string;
  token?: string;
  auth?: BasicAuth;
};

export type JobState = {
  lastRun?: Date;
  lastSuccess?: Date;
  lastError?: string;
  running: boolean;
};

export type RunState = {
  lastRun?: Date;
  lastSuccess?: Date;
  lastError?: string;
  running: boolean;
  jobs: Record<string, JobState>;
};

export type HealthPayload = {
  status: 'ok' | 'degraded';
  lastRun: string | null;
  lastSuccess: string | null;
  lastError: string | null;
  running: boolean;
  schedule: string;
  outputPath: string | null;
  outputs: string[];
  jobs: Array<{
    id: string;
    email: string;
    calendarCode: string | null;
    outputPath: string;
    lastRun: string | null;
    lastSuccess: string | null;
    lastError: string | null;
    running: boolean;
  }>;
};
