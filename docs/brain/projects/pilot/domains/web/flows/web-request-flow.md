---
id: web-request-flow
name: Web Request Flow
type: flow
domain: web
status: active
confidence: source_supported
source_files:
  - lib/WebServer.js
  - lib/config.js
last_reviewed: 2026-05-11
tags:
  - type/flow
  - domain/web
  - status/active
---

# Web Request Flow

How an HTTP request to the dashboard is handled — from token check to response.

## Steps

1. Browser/client hits `http://host:port/?token=<secret>`
2. `WebServer` logs `[REQ] #N METHOD /path` to the debug log and starts a timer
3. `WebServer` checks token against config value — returns 401 if mismatch
4. For `GET /`: serves embedded HTML dashboard with injected session data and version
5. For `GET /events`: upgrades to SSE stream; logs connect/disconnect; skipped from per-request timing
6. For `GET /api/sessions`: reads config, maps sessions to JSON with live tmux status check
7. For `POST /api/sessions/:name/action`: validates action, calls tmux command or SessionManager
8. All other paths → 404
9. On `res.finish`, logs `[RES] #N METHOD /path STATUS Nms`; flags `*** SLOW ***` if >500 ms

## Broadcast stall risk

`_broadcast()` (every 3 s when SSE clients are connected) calls `_buildAllSessions()` → `_getSnippetAndMenu()` → `spawnSync('tmux', ...)` for every session. This is synchronous and blocks the event loop. All queued API requests wait until it completes. The debug log emits `[SLOW]` when a broadcast takes >200 ms.

Since v0.12.15 the entire `_broadcast()` body is wrapped in a top-level try/catch. Exceptions (e.g. a tmux call throwing or JSON serialisation failing) no longer crash the Node.js process; they are logged as `[ERR] broadcast threw: <message>` and the interval continues running.

## SSE connection pool exhaustion (v0.12.16 fix)

Chrome limits HTTP/1.1 to 6 concurrent connections per origin. With 6 browser tabs open, each holding one persistent SSE connection, all 6 slots were consumed. Any subsequent API request (sysinfo poll, session poll, user action) queued indefinitely — the dashboard appeared to update (SSE already open) but every other endpoint was unreachable.

Fixed in v0.12.16: the `/events` handler rejects the 5th+ SSE connection with HTTP 503 (`Retry-After: 10`). At most 4 SSE connections are open simultaneously, leaving 2 connection slots free for API requests. Rejected tabs fall back to the existing 5-second `/api/sessions` polling already built into the frontend.

## Related

- [[web|Web domain]]
- [[web-serve-dashboard|Serve Dashboard]]
- [[web-session-api|Session API]]
- [[web-token-auth|Token Auth]]
- [[core-load-config|Load Config]]
