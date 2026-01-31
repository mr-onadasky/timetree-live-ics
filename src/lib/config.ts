import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { parse as parseYaml } from 'yaml';
import { ensureDir, slugify } from '@/lib/utils';
import { BasicAuth, ExportJob } from '@/lib/types';
import { logger } from '@/lib/logger';

function parseBasicAuth(entry: any): BasicAuth | undefined {
  const auth = entry?.auth ?? entry?.basicAuth ?? entry?.basic_auth;
  if (!auth) return undefined;
  if (auth?.type && auth.type !== 'basic') return undefined;
  const username = auth?.username ?? auth?.user;
  const password = auth?.password ?? auth?.pass;
  if (!username || !password) {
    throw new Error('basic auth requires username and password');
  }
  return { type: 'basic', username, password };
}

function buildJobsFromConfig(entries: any[], outputBase: string): ExportJob[] {
  const jobs: ExportJob[] = [];
  const tokenSeed = process.env.TOKEN_SEED ?? '';

  const makeStableToken = (email: string, calendar?: string) => {
    const hash = createHash('sha1')
      .update(email)
      .update('|')
      .update(calendar ?? 'default')
      .update('|')
      .update(tokenSeed)
      .digest('hex');
    // Base36-ish: take hex and convert to big int then to base36, or simpler: slice hex
    const base = BigInt('0x' + hash).toString(36).toUpperCase();
    return base.slice(0, 10);
  };

  for (const [index, entry] of entries.entries()) {
    const email = entry?.email as string | undefined;
    const password = entry?.password as string | undefined;
    const calendarCodes: (string | undefined)[] =
      entry?.calendars ??
      entry?.calendarCodes ??
      entry?.calendar_codes ??
      [entry?.calendarCode ?? entry?.calendar_code];
    const outputTemplate = entry?.output ?? entry?.outputPath ?? entry?.output_path;
    const fixedToken = typeof entry?.token === 'string' ? entry.token : undefined;
    const addToken =
      entry?.randomToken === true ||
      entry?.random_token === true ||
      entry?.token === true ||
      (!outputTemplate && fixedToken === undefined); // default for YAML (now stable)
    const skipToken =
      entry?.randomToken === false || entry?.random_token === false || entry?.token === false;
    const auth = parseBasicAuth(entry);

    if (!email || !password) {
      throw new Error(`Entry #${index + 1} is missing "email" or "password"`);
    }

    const codes = Array.isArray(calendarCodes) ? calendarCodes : [calendarCodes];
    for (const code of codes) {
      const token = fixedToken ?? (addToken && !skipToken ? makeStableToken(email, code) : undefined);

      const replacements = {
        email: slugify(email),
        calendar: code ? slugify(code) : 'default',
        token: token ?? 'notoken',
      };

      const applyTemplate = (template: string) =>
        template
          .replaceAll('{email}', replacements.email)
          .replaceAll('{calendar}', replacements.calendar)
          .replaceAll('{token}', replacements.token);

      const outputPath =
        typeof outputTemplate === 'string'
          ? applyTemplate(outputTemplate)
          : addToken && !skipToken
            ? path.join(outputBase, `${token ?? makeStableToken(email, code)}.ics`)
            : path.join(
                outputBase,
                `${slugify(email)}-${code ? slugify(code) : 'default'}.ics`
              );

      ensureDir({ existsSync, mkdirSync }, path.dirname(outputPath));
      jobs.push({
        id: `${email}-${code ?? 'default'}`,
        email,
        password,
        calendarCode: typeof code === 'string' && code.length > 0 ? code : undefined,
        outputPath,
        token,
        auth,
      });
    }
  }

  if (jobs.length === 0) throw new Error('No jobs defined in config.');
  return jobs;
}

function loadFromYaml(configPath: string, outputBase: string): ExportJob[] {
  if (!existsSync(configPath)) {
    logger.error(`TIMETREE_CONFIG file not found: ${configPath}`);
    process.exit(1);
  }
  try {
    const raw = readFileSync(configPath, 'utf8');
    const parsed = parseYaml(raw);
    const entries: unknown = parsed?.exports ?? parsed?.jobs ?? parsed;
    if (!Array.isArray(entries)) {
      throw new Error('Config should define an array under "exports"');
    }
    return buildJobsFromConfig(entries, outputBase);
  } catch (err) {
    logger.error({ err }, `Failed to parse TIMETREE_CONFIG (${configPath})`);
    process.exit(1);
  }
}

function resolveOutputBase(): string {
  const explicit = process.env.OUTPUT_BASE;
  const defaultBase = '/data';
  const tryBase = explicit ?? defaultBase;
  try {
    ensureDir({ existsSync, mkdirSync }, tryBase);
    return tryBase;
  } catch (err) {
    if (!explicit && tryBase === defaultBase) {
      const fallback = path.join(process.cwd(), 'data');
      ensureDir({ existsSync, mkdirSync }, fallback);
      logger.warn(
        `Cannot write to ${defaultBase}; falling back to local directory ${fallback}. Set OUTPUT_BASE to override.`
      );
      return fallback;
    }
    throw err;
  }
}

export function loadJobs(): { jobs: ExportJob[]; configPath?: string } {
  const OUTPUT_BASE = resolveOutputBase();
  const DEFAULT_OUTPUT_PATH = process.env.OUTPUT_PATH ?? path.join(OUTPUT_BASE, 'timetree.ics');
  const LOCAL_CONFIG_CANDIDATE = path.resolve(process.cwd(), 'config.yaml');
  const DEFAULT_CONFIG_PATH = existsSync(LOCAL_CONFIG_CANDIDATE)
    ? LOCAL_CONFIG_CANDIDATE
    : '/config/config.yaml';
  const envConfigPath = process.env.TIMETREE_CONFIG;
  const CONFIG_PATH = envConfigPath ?? DEFAULT_CONFIG_PATH;
  const CONFIG_REQUESTED = envConfigPath !== undefined;

  const configExists = CONFIG_PATH ? existsSync(CONFIG_PATH) : false;
  const useConfig = CONFIG_PATH && (CONFIG_REQUESTED || configExists);

  if (useConfig) {
    const jobs = loadFromYaml(CONFIG_PATH, OUTPUT_BASE);
    return { jobs, configPath: CONFIG_PATH };
  }

  // Fallback to env vars (original behavior)
  const TIMETREE_EMAIL = process.env.TIMETREE_EMAIL;
  const TIMETREE_PASSWORD = process.env.TIMETREE_PASSWORD;
  const TIMETREE_CALENDAR_CODE = process.env.TIMETREE_CALENDAR_CODE;

  if (!TIMETREE_EMAIL || !TIMETREE_PASSWORD) {
    logger.error(
      'Set TIMETREE_EMAIL, TIMETREE_PASSWORD, or provide TIMETREE_CONFIG (defaults to /config/config.yaml).'
    );
    process.exit(1);
  }

  const outputDir = path.dirname(DEFAULT_OUTPUT_PATH);
  ensureDir({ existsSync, mkdirSync }, outputDir);

  return {
    jobs: [
      {
        id: `${TIMETREE_EMAIL}-${TIMETREE_CALENDAR_CODE ?? 'default'}`,
        email: TIMETREE_EMAIL,
        password: TIMETREE_PASSWORD,
        calendarCode: TIMETREE_CALENDAR_CODE,
        outputPath: DEFAULT_OUTPUT_PATH,
      },
    ],
    configPath: undefined,
  };
}
