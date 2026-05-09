---
id: session-watch-process
name: Watch Process
type: capability
domain: session
status: active
confidence: source_supported
source_files:
  - lib/Watcher.js
last_reviewed: 2026-05-09
version: 0.9.1
tags:
  - type/capability
  - domain/session
  - status/active
---

# Watch Process

Polls the tmux pane every 5 s, detects Claude status transitions (running / needs-response / limit / idle / ended), and fires Telegram notifications with deliberate delays to avoid noise.

## What it does

- Captures pane content via `tmux capture-pane -S -500` and hashes the last 2 000 chars to detect staleness.
- Matches ANSI-stripped output against four regexes: `RUNNING_RE` (`esc to interrupt`), `LIMIT_RE` (usage/rate limit phrases), `RESPONSE_RE` (confirmation prompts), and `TOKEN_RE` (footer token counts).
- Updates `session.status` to one of: `running`, `needs-response`, `limit`, `idle`.
- Calls `onEnded(session)` and stops the interval when the tmux session disappears.
- Extracts token counts from the Claude Code footer whenever visible and stores them in `session.tokens`.

## Telegram notification rules

| Transition | Delay | Condition |
|---|---|---|
| Session ended | immediate | always |
| `needs-response` | 30 s | suppressed if session leaves `needs-response` within the window; de-duped at 60 s minimum between sends |
| `limit` hit | immediate | sends reset-time; waits for limit to expire; then sends "resumed" |

The 30-second delay for `needs-response` uses `_needsResponseTimer` (a `setTimeout` handle stored on the Watcher instance). The timer is cleared on any transition away from `needs-response` — so if the user responds immediately, no notification is sent. `_lastNeedsResponseNotify` timestamp prevents repeated pings within a 60-second window when a prompt lingers.

## Limit handling

`_handleLimit()` is called when `LIMIT_RE` matches the last 15 non-empty lines. It:
1. Hashes the text and skips if duplicate (same limit message seen already).
2. Respects a `cooldown` (default 180 s) between resume attempts.
3. Parses the reset time from "resets at HH:MM AM/PM" or "try again in N minutes".
4. Waits until `resetAtMs` (or `Date.now() + fallbackWait * 1000`).
5. Sends the `resumeCommand` string to the tmux pane via `spawnSync('tmux', ['send-keys', ...])`.
6. Notifies Telegram before waiting and after resuming.

## Entry point

`lib/Watcher.js` — instantiated by `lib/SessionManager.js` per session

## Related

- [[session|Session domain]]
- [[session-resume|Auto-Resume]]
- [[core-send-notification|Send Notification]]
- [[session-tmux-concept|Tmux Session Concept]]
- [[session-auto-resume-concept|Auto-Resume Concept]]
