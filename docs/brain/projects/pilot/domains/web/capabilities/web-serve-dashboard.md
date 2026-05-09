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
version: 0.11.1
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
2. **Sysinfo minibar** — compact bar showing live CPU load %, RAM used/total, and disk used/total with colour-coded progress bars; polls `GET /api/sysinfo` every 5 s. Colours: green → yellow (>60 %) → red (>85 %). When any session is in `limit` status, a **`⚠ LIMIT · resets HH:MM`** warning item appears in warning yellow before the disk bar. Right side shows `7d Xout · Ymsg` — output tokens and weekly message count from `/api/usage` (polling every 60 s); full breakdown available as tooltip.
3. **Sessions header** — controls for sound, Telegram toggle, snippet lines, sort order, and New session button.
4. **Session cards** — one card per session with status pill, snippet preview, quick-reply, and CTA buttons. When a session has `status === 'limit'` and `resumeAt` is set, the card body shows a **Resets** field (in warning yellow, showing `session.resetTime` or relative time) instead of the normal Tokens field.
5. **Recent Activity** — timestamped log of status transitions (shown only when non-empty).

## Sysinfo endpoint

`GET /api/sysinfo` — returns `{ cpuPct, totalMem, usedMem, diskTotal, diskUsed }`. CPU % is derived from `os.loadavg()[0] / os.cpus().length`. Disk stats are parsed from `df -k /`; `diskTotal` is computed as `used + available` (not the raw total-blocks column) so the percentage matches `df`'s own Capacity % on macOS APFS and Linux ext4. Added in v0.9.0.

## Usage endpoint

`GET /api/usage` — returns:
- **Token totals** (from JSONL): `weekInput`, `weekOutput`, `weekCacheRead`, `weekCacheCreate`, `weekFiles` — 7-day sums from `~/.claude/projects/**/*.jsonl` assistant messages.
- **Activity counts** (from `~/.claude/stats-cache.json`): `weekMessages`, `weekSessions`, `weekTools`, `daily[]` — subscription-friendly proxy metrics not tied to raw token billing.
- **Limit reset info**: `limitResetAt` (ms timestamp) and `limitResetTime` (human string like "2:00 AM") — soonest reset across all sessions currently in `limit` status. Both are `null` when no session is limited.

Result is cached in `_usageCache` for 60 s to avoid repeated filesystem scans. Added in v0.11.0; extended with activity counts and limit reset fields in v0.11.1.

## Entry point

`lib/WebServer.js` — started by `bin/claude-pilot.js` when `--web` flag is set or user picks the option

## Related

- [[web|Web domain]]
- [[web-token-auth|Token Auth]]
- [[web-session-api|Session API]]
- [[core-load-config|Load Config]]
