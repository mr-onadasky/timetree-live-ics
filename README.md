# timetree-live-ics

Containerized TimeTree → ICS sync with a live URL. Fully implemented in TypeScript (Node) with an internal cron and static server.

[![CI](https://github.com/mr-onadasky/timetree-live-ics/actions/workflows/ci.yml/badge.svg)](https://github.com/mr-onadasky/timetree-live-ics/actions/workflows/ci.yml)
[![Publish Images](https://github.com/mr-onadasky/timetree-live-ics/actions/workflows/publish.yml/badge.svg)](https://github.com/mr-onadasky/timetree-live-ics/actions/workflows/publish.yml)
[![Release Please](https://github.com/TrippyTechLlama/timetree-live-ics/actions/workflows/release-please.yml/badge.svg)](https://github.com/TrippyTechLlama/timetree-live-ics/actions/workflows/release-please.yml)


## Quick start

```bash
docker build -t timetree-live-ics .

docker run -d --name timetree-live-ics \
  -p 8080:8080 \
  -e TIMETREE_EMAIL="you@example.com" \
  -e TIMETREE_PASSWORD="app-password" \
  -e TIMETREE_CALENDAR_CODE="abcdef123456" \
  timetree-live-ics

# Live ICS URL: http://localhost:8080/timetree.ics
# Health JSON:  http://localhost:8080/health
# Version JSON: http://localhost:8080/version
```

### Local dev with `.env`
Copy `.env.example` to `.env`, adjust values, and run `npm run dev` or `npm start` (after `npm run build`). By default the app will look for `config.yaml` in the project root; override with `TIMETREE_CONFIG`.

## Multiple calendars via YAML
Instead of environment variables you can point the container to a YAML config. Default path is `/config/config.yaml` in the container; when developing locally we default to `./config.yaml` if it exists (override in both cases with `TIMETREE_CONFIG`). Example:

```yaml
exports:
  - email: alice@example.com
    password: alice-password
    calendars:
      - abcdef123456
      - zyxwvu987654
    # Filename options:
    # 1) deterministic: disable random token
    output: /data/{email}-{calendar}.ics
    randomToken: false
    # 2) custom short ID
    # output: /data/{token}.ics
    # token: MYSHORTID
    # 3) deterministic-but-obscure short ID (default when output omitted)
    # randomToken: true

    # Basic auth for this file (download protection)
    auth:
      type: basic
      username: alice
      password: secret123
  - email: bob@example.com
    password: bob-password
    calendars:
      - project1
    # output is optional; defaults to /data/{token}.ics (token = random base36)
```

Place the file in the mounted `/config` volume (or point `TIMETREE_CONFIG` elsewhere). Each calendar gets its own ICS file using the output template (tokens: `{email}`, `{calendar}`, `{token}`). When `randomToken` is true and no explicit `token` is provided, the token is **stable** per email+calendar (salted by `TOKEN_SEED`) so the URL doesn’t change across restarts; pick a unique `TOKEN_SEED` to make it unguessable.

## Environment variables
- `TIMETREE_EMAIL` *(required unless using `TIMETREE_CONFIG`)* – TimeTree account email.
- `TIMETREE_PASSWORD` *(required unless using `TIMETREE_CONFIG`)* – TimeTree password.
- `TIMETREE_CALENDAR_CODE` *(optional)* – Specific calendar code; omit to select default.
- `CRON_SCHEDULE` *(default `*/30 * * * *`)* – Cron expression for sync frequency.
- `OUTPUT_PATH` *(default `/data/timetree.ics`)* – Location of the exported ICS in the container (used only when `TIMETREE_CONFIG` is not set).
- `PORT` *(default `8080`)* – HTTP port to serve `/data`.
- `TIMETREE_CONFIG` *(optional)* – Path to a YAML config that defines multiple exports (see above). Overrides individual env vars. Defaults to `/config/config.yaml` if present.
- `APP_VERSION` *(optional)* – Override the reported version (otherwise uses `package.json`).
- `GIT_SHA` / `GITHUB_SHA` / `COMMIT_SHA` *(optional)* – Attach commit hash to `/version`.
- `BUILD_TIME` *(optional)* – Attach build timestamp to `/version`.
- `TOKEN_SEED` *(optional)* – Salt for deterministic tokens when `randomToken` is used in YAML. Set to a unique, secret value to make tokenized filenames hard to guess while staying stable across restarts.
- `randomToken` / `token` *(YAML per-entry)* – Set `randomToken: true` (default when `output` missing) to generate a short base36 token for filenames, or provide a fixed `token` string yourself.
- `LOG_OUTPUT_PATHS` *(optional, default `false`)* – When `true`, startup and export logs print full output paths (including tokens). Leave `false` in shared/CI environments to avoid leaking URLs.
- `auth` *(YAML per-entry)* – `{ type: basic, username, password }` to protect the ICS file with HTTP Basic Auth.
- `STARTUP_DELAY` *(default `0s`)* – Delay the first export after process start. Accepts `Xs`, `Xm`, or `Xh` (e.g., `30s`, `2m`, `1h`).
- `LOG_LEVEL` *(default `info`)* – Logger verbosity (`fatal`, `error`, `warn`, `info`, `debug`, `trace`).

Security note: ICS files are otherwise public. Options: deterministic names (easy to share), custom/ random `{token}` for obscurity, or per-file Basic Auth. For stronger guarantees, front the service with a reverse proxy that enforces auth or IP allowlisting. The `/health` endpoint only returns minimal status (no paths or tokens); detailed info is logged server-side with tokens masked.

## Credits & license
- This project is MIT licensed (see `LICENSE`).

## Releases & versioning
- Conventional Commits drive automated releases via Release Please (see `.github/workflows/release-please.yml`).
- While `<1.0`, breaking changes bump the **minor** version (configured with `bump-minor-pre-major: true`); features also bump minor; fixes bump patch.
- Tags and changelog/`package.json` are generated in the release PR; merge it to cut the release and publish tags/images.
- Container images are labeled with version/commit/build time (OCI labels) and receive build args to expose the same info via `/version`.
- Release tags are plain `vX.Y.Z` (no component prefix); the CI workflow builds/pushes matching image tags plus `latest`, `main`, and `sha-*`.

## How it works
- `src/index.ts` (compiled to `dist/index.js`) runs an initial export, serves `/data` via Express, and schedules subsequent exports with `node-cron`.
- `src/lib/timetree.ts` calls the TimeTree web API directly, then `src/lib/ics.ts` emits an RFC5545 calendar.
- `/data` is a volume; mount it to persist or inspect the ICS.

## Adjusting the schedule
Set `CRON_SCHEDULE` to any valid cron expression, e.g. every 5 minutes: `-e CRON_SCHEDULE="*/5 * * * *"`.

## Logs
- Container stdout/stderr carries both export and HTTP logs.
