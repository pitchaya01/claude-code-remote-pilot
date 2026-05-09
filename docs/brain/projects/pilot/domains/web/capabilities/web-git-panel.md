---
id: web-git-panel
name: Git Diff & Commit Panel
type: capability
domain: web
status: active
confidence: source_supported
source_files:
  - lib/WebServer.js
  - lib/ui.html
last_reviewed: 2026-05-09
version: 0.8.9
tags:
  - type/capability
  - domain/web
  - status/active
---

# Git Diff & Commit Panel

Exposes the session workspace's git state to the dashboard, letting users review changes and commit without leaving the browser.

## Backend endpoints

- `GET /api/sessions/:name/git/status` — runs `git status --porcelain -uall` in the session's `path`; returns `{ files: [{ status, file }] }`. The `-uall` flag expands untracked directories to individual files so every file is selectable and diffable. Returns `{ notGit: true }` if the directory is not a repo.
- `GET /api/sessions/:name/git/diff?file=<path>` — tries `git diff HEAD`, then `git diff --cached`, then `git diff --no-index /dev/null <file>` (for untracked files). Returns `{ diff: "<unified diff text>" }`.
- `POST /api/sessions/:name/git/commit` — body `{ message, files? }`. Runs `git add <files|.>` then `git commit -m <message>`. Returns `{ ok, output }` or `{ error }`.

## Frontend (GitPanel component)

`GitPanel` has two render modes controlled by the `fullWidth` prop.

### Full-width mode (`fullWidth=true`) — active since v0.8.2

Activated from the **Git tab** in `SessionDetailScreen`. Renders:
- **Commit bar** at top — message input + "↑ Commit all" / "↑ Commit (N files)" button + error message.
- **Two-column body** via CSS grid `260px 1fr`, height `calc(100vh - 240px)`:
  - **Left column** — file list with checkboxes and `~` / `+` / `−` status icons. "Select all / Deselect all" header. Clicking a row selects it and loads diff.
  - **Right column** — diff viewer (dark background `oklch(13% 0.012 50)`, `overflow: auto`, coloured diff lines at `fontSize: 12`, `whiteSpace: pre`, `minWidth: max-content`).
- Empty states: "← select a file to view diff", "Working tree clean.", "Not a git repository."

### Compact mode (`fullWidth=false`)

Legacy sidebar widget — auto-polls every 5 s, hides when no changes; inline diff expands below filename (max 280 px). Used as fallback if ever embedded in a sidebar again.

## Related

- [[web|Web domain]]
- [[web-serve-dashboard|Serve Dashboard]]
- [[web-terminal-ui-concept|Terminal UI Concept]]
