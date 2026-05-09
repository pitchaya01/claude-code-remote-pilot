---
id: web-serve-dashboard
name: Serve Dashboard
type: capability
domain: web
status: active
confidence: source_supported
source_files:
  - lib/WebServer.js
last_reviewed: 2026-05-09
version: 0.10.2
tags:
  - type/capability
  - domain/web
  - status/active
---

# Serve Dashboard

Serves the HTML web dashboard for monitoring Claude sessions remotely. The dashboard shows session status, allows basic actions, and displays version info.

## What it does

- Creates a Node.js `http.createServer` on a configurable port (default 3000)
- Serves an embedded HTML page (inline in WebServer.js) with session status
- Reads session data from [[core-load-config|config]] to populate the dashboard
- Injects the current version from `package.json` into the HTML
- Restricts access via [[web-token-auth|token authentication]]

## Dashboard layout (DashboardScreen)

Top of the page:
1. **Stat row** — 4 cards in a grid: Running (count / of total), Active (tmux sessions), Supervisor (online + port), **Broadcast** (inline input + Send button; disabled with placeholder when no active sessions).
2. **Sysinfo minibar** — compact bar showing live CPU load %, RAM used/total, and disk used/total with colour-coded progress bars; polls `GET /api/sysinfo` every 5 s. Colours: green → yellow (>60 %) → red (>85 %).
3. **Sessions header** — controls for sound, Telegram toggle, snippet lines, sort order, and New session button.
4. **Session cards** — one card per session with status pill, snippet preview, quick-reply, and CTA buttons.
5. **Recent Activity** — timestamped log of status transitions (shown only when non-empty).

## Sysinfo endpoint

`GET /api/sysinfo` — returns `{ cpuPct, totalMem, usedMem, diskTotal, diskUsed }`. CPU % is derived from `os.loadavg()[0] / os.cpus().length`. Disk stats are parsed from `df -k /`; `diskTotal` is computed as `used + available` (not the raw total-blocks column) so the percentage matches `df`'s own Capacity % on macOS APFS and Linux ext4. Added in v0.9.0.

## Usage endpoint

`GET /api/usage` — returns `{ weekInput, weekOutput, weekCacheRead, weekCacheCreate, weekFiles }`. Scans all `~/.claude/projects/**/*.jsonl` files modified in the last 7 days, summing `input_tokens`, `output_tokens`, `cache_read_input_tokens`, and `cache_creation_input_tokens` from every `assistant` message. Result is cached in `_usageCache` for 60 s to avoid repeated filesystem scans. Reads files synchronously on first call; subsequent calls within the TTL return the cached value instantly. Added in v0.11.0.

## Entry point

`lib/WebServer.js` — started by `bin/claude-pilot.js` when `--web` flag is set or user picks the option

## Related

- [[web|Web domain]]
- [[web-token-auth|Token Auth]]
- [[web-session-api|Session API]]
- [[core-load-config|Load Config]]
