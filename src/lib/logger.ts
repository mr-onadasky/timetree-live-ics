import pino from 'pino';

const level = process.env.LOG_LEVEL ?? 'info';
const pretty =
  process.env.NODE_ENV !== 'production' && process.env.PINO_PRETTY !== 'false';

export const logger = pino({
  level,
  transport: pretty
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
});
