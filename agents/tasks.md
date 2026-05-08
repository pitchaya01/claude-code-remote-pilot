# Tasks

## Completed (v0.3.0)
- [x] lib/config.js: addToHistory, removeFromHistory, getHistory
- [x] lib/SessionManager.js: call addToHistory in spawn() and adopt()
- [x] bin/claude-pilot.js: interactive watch with offline sessions, auto-enter on start
- [x] CHANGELOG.md created
- [x] README.md updated with new watch UI
- [x] version bumped to 0.3.0 and published to npm

## Completed (v0.3.1)
- [x] Watcher.js: reduce checkInterval from 30s → 5s
- [x] Watch screen refresh from 2s → 1s

## Completed (v0.4.0)
- [x] lib/WebServer.js: HTTP server with SSE, REST API, 127.0.0.1 binding, spawnSync array args
- [x] lib/ui.html: React SPA dashboard (SSE live data, terminal polling, send message, spawn, kill)
- [x] bin/claude-pilot.js: `web [port]` REPL command, auto-opens browser
- [x] Watcher.js: fix shell injection in tmux send-keys (spawnSync array args)
- [x] CHANGELOG.md, README.md updated, version bumped to 0.4.0

## Completed (v0.6.0)
- [x] config.js: store command in session history
- [x] SessionManager.js: command param in spawn(), respawn() method
- [x] WebServer.js: command in POST /api/sessions, POST /api/sessions/:name/respawn
- [x] ui.html: Respawn button for offline sessions, command dropdown in Create form, Agent field in session info

## Completed (v0.5.7 → v0.6.0 patch)
- [x] WebServer.js: startTunnel(), stopTunnel(), stop() calls stopTunnel()
- [x] bin/claude-pilot.js: cloudflaredInstallCmd(), startup tunnel prompts with password recommendation
- [x] bin/claude-pilot.js: `web --tunnel` flag in REPL command
- [x] bin/claude-pilot.js: Telegram notification when tunnel URL is ready

## Completed (v0.5.14)
- [x] config.js: CCP_CONFIG_PATH env override for test isolation
- [x] test/config.test.js: 14 unit tests for all config functions
- [x] test/webserver.test.js: 20 HTTP integration tests (auth, queue CRUD, auto-feed, meta)
- [x] package.json: added "test" script (node --test)

## Completed (terminal UX + auto-yes)
- [x] ui.html: command history — ↑/↓ recalls sent messages when input has text
- [x] ui.html: ↑/↓ forward to tmux when input is empty (navigate Claude menus)
- [x] ui.html: Tab key forwarded to tmux (tab-completion / cycle options)
- [x] ui.html: Ctrl+C / Ctrl+D send to tmux when input is empty
- [x] ui.html: Ctrl+U clears the input line; Ctrl+L sends clear-screen to tmux
- [x] ui.html: clicking the terminal body focuses the input
- [x] ui.html: Auto-yes toggle — presses Enter automatically when Claude shows a permission prompt
- [x] ui.html: ↑ ↓ ⇥ buttons added to terminal footer
