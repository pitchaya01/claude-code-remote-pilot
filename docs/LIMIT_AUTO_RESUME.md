# Limit Auto-Resume Map

## What Exists

- `lib/Watcher.js`
  - Detects active Claude sessions by reading tmux pane output.
  - Classifies recent output into `running`, `needs-response`, `limit`, or `idle`.
  - Parses limit reset text from Claude messages:
    - `resets at 2:00 AM`
    - `resets 6am (Asia/Bangkok)`
    - `try again in N minutes`
  - Stores limit state on the session object:
    - `status: "limit"`
    - `resumeAt: number` as an epoch-millisecond timestamp, nullable when not limited.
    - `resetTime: string | null` as a user-facing clock label.
  - Sends Telegram notifications on first limit detection and after sending the resume command.

- `lib/WebServer.js`
  - Returns session objects from `GET /api/sessions`.
  - Returns weekly usage plus the soonest active limit reset from `GET /api/usage`.
  - The `limitResetAt` field is a nullable epoch-millisecond timestamp.
  - The `limitResetTime` field is a nullable display string.

- `lib/ui.html`
  - Session cards show `resetTime` for limited sessions.
  - Session detail shows `resumeAt` through `relativeTime()`.
  - `relativeTime()` currently describes past timestamps only.

## What Needs To Change

- Countdown display
  - Future timestamps must render as time remaining, not `0s ago`.
  - The Web UI should use a dedicated formatter for limit resume countdowns so normal past timestamps remain unchanged.
  - Dashboard cards should show the reset clock and, when available, a restart countdown for debugging.

- Limit verification
  - Post-reset verification must check the same active visible limit window used by normal detection.
  - It must not scan the full tmux scrollback because old limit text can remain in scrollback after Claude has recovered.
  - Return value shape remains session-local:
    - Active limit: `session.status === "limit"`, `session.resumeAt` is a future timestamp, `session.resetTime` may be a string.
    - Cleared limit: `session.status === "running"`, `session.resumeAt === null`, `session.resetTime === null`.

- Retry and notification behavior
  - A limit notification should be sent for the active limit period.
  - Retry deferrals should not turn into repeated Telegram notifications before the real reset time.
  - If a reset timezone is present, the resume timestamp must be calculated for that IANA timezone where possible.

## Architecture Fit

- Watcher remains the source of truth for terminal-derived session state.
- WebServer remains a pass-through/API aggregator and should not infer limit state from terminal output.
- UI remains display-only and should not change watcher retry timing.
- The change extends existing parsing and formatting paths before introducing new abstractions.

## Drill-Down

- Limit text
  - Source: tmux pane capture.
  - Parser: `Watcher._parseResetTime()` and `Watcher._parseResetAtMs()`.
  - Windowing: last 15 non-empty stripped lines.

- Resume timing
  - Source field: `session.resumeAt`.
  - Format for API: number in milliseconds since epoch, nullable.
  - Sort order for global reset: soonest active limited session first in `WebServer._scanUsage()`.

- Web display
  - Past timestamps: `relativeTime()`.
  - Future timestamps: countdown formatter.
  - Limit card: reset clock plus restart countdown.
