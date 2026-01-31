import pkg from '@/../package.json';

export type BuildInfo = {
  version: string;
  commit?: string;
  buildTime?: string;
};

const version =
  (process.env.APP_VERSION && process.env.APP_VERSION.trim()) ||
  pkg.version ||
  '0.0.0';

const commit = process.env.GIT_SHA || process.env.GITHUB_SHA || process.env.COMMIT_SHA;
const buildTime = process.env.BUILD_TIME;

export const buildInfo: BuildInfo = {
  version,
  ...(commit ? { commit } : {}),
  ...(buildTime ? { buildTime } : {}),
};
