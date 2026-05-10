# Development

Architecture overview and API reference for contributors.

For the full knowledge map (domains, flows, concepts, risks) open `docs/brain/` as an Obsidian vault or browse `docs/brain/projects/pilot/`.

---

## Architecture

```
bin/claude-pilot.js     — CLI entry point (npm binary)
lib/SessionManager.js   — session lifecycle (spawn, kill, history)
lib/Watcher.js          — tmux process watch loop and auto-resume
lib/WebServer.js        — HTTP server, SSE, all API routes
lib/config.js           — config persistence (~/.claude-pilot/config.json)
lib/notifier.js         — Telegram notifications
lib/ui.html             — React SPA (Babel/CDN, no build step)
```

- Pure Node.js, no framework. External integration via `child_process` (tmux, curl, git, open).
- Each Claude session is a tmux window inside a named tmux session.
- Config is a single JSON file at `~/.claude-pilot/config.json`.
- The UI is a single self-contained HTML file served by `WebServer.js`.
- Limit auto-resume behavior is mapped in `docs/LIMIT_AUTO_RESUME.md`, including session field shapes and countdown display rules.

---

## Web API

All routes are handled in `WebServer.js → _handleApi()`. Token auth applies to all `/api/*` routes.

### Sessions

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/sessions` | List all active and history sessions |
| `POST` | `/api/sessions` | Spawn a new session `{ name, path, prompt? }` |
| `DELETE` | `/api/sessions/:name` | Kill a session |
| `POST` | `/api/sessions/:name/send` | Send a message `{ message }` |
| `POST` | `/api/sessions/:name/key` | Send a raw key `{ key }` |
| `POST` | `/api/sessions/:name/resize` | Resize tmux pane `{ cols, rows }` |
| `POST` | `/api/sessions/:name/respawn` | Re-spawn an offline session |
| `POST` | `/api/sessions/:name/remove` | Remove session from history |
| `GET` | `/api/sessions/:name/output` | Get terminal output `{ output }` |
| `GET` | `/api/sessions/:name/queue` | Get message queue |
| `POST` | `/api/sessions/:name/queue` | Enqueue a message `{ message }` |
| `DELETE` | `/api/sessions/:name/queue/:index` | Remove queued message |
| `POST` | `/api/sessions/:name/queue/play` | Send next queued message now |
| `PUT` | `/api/sessions/:name/label` | Set label `{ emoji?, color? }` |

### Git (session workspace)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/sessions/:name/git/status` | `git status --porcelain` → `{ files: [{ status, file }] }` or `{ notGit: true }` |
| `GET` | `/api/sessions/:name/git/diff?file=` | Diff for one file (HEAD → cached → `--no-index` for untracked) → `{ diff }` |
| `POST` | `/api/sessions/:name/git/commit` | Stage and commit `{ message, files? }` → `{ ok, output }` |

### Misc

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/sessions/:name/open-finder` | `open <session path>` (macOS) |
| `POST` | `/api/broadcast` | Send message to all active sessions `{ message }` |
| `GET` | `/api/config` | Subset of config visible to dashboard |
| `PUT` | `/api/config` | Update config fields (telegram toggle, sort, snippet lines, etc.) |
| `GET` | `/api/parse-options` | Ollama menu option parse `?output=` |

### SSE

`GET /events` — server-sent events stream. Events: `sessions`, `output:<name>`, `activity`.

### Auth

`POST /api/auth` — exchange a password for a session token `{ token }`. The token is sent as `Authorization: Bearer <token>` on subsequent requests or as `?token=` query param for the SSE stream.

---

## Tests

```bash
npm test
```

`test/config.test.js` — config load/save  
`test/webserver.test.js` — server start/stop, token auth, API routes
