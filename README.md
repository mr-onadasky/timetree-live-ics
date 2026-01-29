# timetree-live-ics

Containerized TimeTree → ICS sync with a live URL. Now implemented in TypeScript (Node) with an internal cron and static server. It still uses the upstream [`timetree-exporter`](https://github.com/eoleedi/TimeTree-Exporter) Python CLI under the hood.

[![CI & Publish](https://github.com/TrippyTechLlama/timetree-live-ics/actions/workflows/ci-release.yml/badge.svg)](https://github.com/TrippyTechLlama/timetree-live-ics/actions/workflows/ci-release.yml)

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
```

## Multiple calendars via YAML
Instead of environment variables you can point the container to a YAML config. Default path is `/config/config.yaml` (override with `TIMETREE_CONFIG`). Example:

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
    # 3) random short ID (default when output omitted)
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

Place the file in the mounted `/config` volume (or point `TIMETREE_CONFIG` elsewhere). Each calendar gets its own ICS file using the output template (tokens: `{email}`, `{calendar}`, `{token}`).

## Environment variables
- `TIMETREE_EMAIL` *(required unless using `TIMETREE_CONFIG`)* – TimeTree account email.
- `TIMETREE_PASSWORD` *(required unless using `TIMETREE_CONFIG`)* – TimeTree password.
- `TIMETREE_CALENDAR_CODE` *(optional)* – Specific calendar code; omit to select default.
- `CRON_SCHEDULE` *(default `*/30 * * * *`)* – Cron expression for sync frequency.
- `OUTPUT_PATH` *(default `/data/timetree.ics`)* – Location of the exported ICS in the container (used only when `TIMETREE_CONFIG` is not set).
- `PORT` *(default `8080`)* – HTTP port to serve `/data`.
- `TIMETREE_CONFIG` *(optional)* – Path to a YAML config that defines multiple exports (see above). Overrides individual env vars. Defaults to `/config/config.yaml` if present.
- `randomToken` / `token` *(YAML per-entry)* – Set `randomToken: true` (default when `output` missing) to generate a short base36 token for filenames, or provide a fixed `token` string yourself.
- `auth` *(YAML per-entry)* – `{ type: basic, username, password }` to protect the ICS file with HTTP Basic Auth.
- `STARTUP_DELAY` *(default `0s`)* – Delay the first export after process start. Accepts `Xs`, `Xm`, or `Xh` (e.g., `30s`, `2m`, `1h`).

Security note: ICS files are otherwise public. Options: deterministic names (easy to share), custom/ random `{token}` for obscurity, or per-file Basic Auth. For stronger guarantees, front the service with a reverse proxy that enforces auth or IP allowlisting. The `/health` endpoint only returns minimal status (no paths or tokens); detailed info is logged server-side with tokens masked.

## Credits & license
- Built on top of the Python [`timetree-exporter`](https://github.com/eoleedi/TimeTree-Exporter) (MIT).
- This project is MIT licensed (see `LICENSE`).

## How it works
- `src/index.ts` (compiled to `dist/index.js`) runs an initial export, serves `/data` via Express, and schedules subsequent exports with `node-cron`.
- The actual export is performed by the Python `timetree-exporter` CLI invoked from Node.
- `/data` is a volume; mount it to persist or inspect the ICS.

## Adjusting the schedule
Set `CRON_SCHEDULE` to any valid cron expression, e.g. every 5 minutes: `-e CRON_SCHEDULE="*/5 * * * *"`.

## Logs
- Container stdout/stderr carries both export and HTTP logs.
