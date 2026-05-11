---
id: cli-manage-lifecycle
name: Manage Session Lifecycle
type: capability
domain: cli
status: active
confidence: source_supported
source_files:
  - bin/claude-pilot.js
last_reviewed: 2026-05-11
tags:
  - type/capability
  - domain/cli
  - status/active
---

# Manage Session Lifecycle

Orchestrates start, stop, and removal of sessions from the CLI. Handles graceful exit when all sessions are closed or when the user quits the interactive menu.

## What it does

- Starts the [[web-serve-dashboard|web dashboard]] optionally on launch
- Delegates session creation to [[session-create|SessionManager.createSession]]
- Calls [[session-remove-offline|SessionManager.removeOffline]] on user request
- Shows an "exit hint" once auto-watch is running to tell the user how to re-enter the menu
- On quit, calls `webServer.stop()` then asks whether to kill sessions before calling `process.exit(0)`

## Exit handling (v0.12.14)

`handleExit()` is called by the `exit`/`quit` REPL command and `process.once('SIGTERM')`. It:

1. Calls `watchStop()` if watch mode is active — stops the draw timer and keypress listener before prompting.
2. Calls `manager._webServer?.stop()` to close the HTTP server and SSE connections.
3. Asks "Kill all N sessions?" — empty or `N` answer keeps sessions running in tmux.

**Ctrl+C (SIGINT) is intentionally NOT an exit trigger.** `replRl.on('SIGINT')` only prints `(Type exit to quit)` and re-prompts. This prevents accidental Ctrl+C from killing the web server. The previous v0.12.13 handler that called `handleExit()` on SIGINT was a regression.

The `replRl.on('close')` handler (Ctrl+D / stdin EOF) calls `manager._webServer?.stop()` before `process.exit(0)`.

A module-level `watchStop` variable holds a reference to the current `exitWatch` closure. It is set when `startWatch()` runs and cleared when `exitWatch()` runs.

## Watch mode (v0.12.14)

Sessions are sorted by status group matching the web UI: `needs-response` / `running` → `idle` → `limit` / `offline` / `ended`, then alphabetically within each group. The constant `STATUS_GROUP` drives this.

Navigation supports any number of sessions:
- `j` / `↓` — move selection down (wraps at bottom)
- `k` / `↑` — move selection up (wraps at top)
- `1`–`9` — quick-select first 9 sessions
- `Esc` — deselect

## Entry point

`bin/claude-pilot.js` — main program loop

## Related

- [[cli|CLI domain]]
- [[session-create|Create Session]]
- [[session-remove-offline|Remove Offline Sessions]]
- [[web-serve-dashboard|Serve Dashboard]]
