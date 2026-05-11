# Tasks

## Current version: 0.13.0 (published)

## Completed (v0.13.0)
- [x] lib/Watcher.js: detectAgentType() function — strips path/exe suffix, returns 'claude'/'opencode'/'codex'/'generic'
- [x] lib/Watcher.js: _checkGeneric() — hash-change running/idle detection (stagnant >4 s → idle) for non-Claude agents
- [x] lib/Watcher.js: _check() branches on _agentType — claude gets full pattern matching, others get _checkGeneric
- [x] lib/ui.html: codex added to agent dropdown; stale "claude-only" hint replaced with accurate hash-polling hint
- [x] bin/claude-pilot.js: spawn accepts --opencode/--codex flags; startup mount prompt asks agent choice
- [x] CHANGELOG, KB, npm published, pushed

## Completed (v0.12.16)
- [x] lib/WebServer.js: cap SSE connections at 4 (MAX_SSE) — returns 503 when at limit
- [x] Prevents HTTP/1.1 6-connection-per-origin pool exhaustion when multiple tabs are open
- [x] Rejected tabs fall back to existing 5s /api/sessions polling
- [x] KB updated, published, pushed

## Completed (v0.12.15)
- [x] lib/WebServer.js: wrap `_broadcast()` body in try/catch — uncaught exceptions (spawnSync, JSON.stringify) were crashing Node.js process silently, causing ERR_CONNECTION_REFUSED in browser
- [x] Errors now logged as `[ERR] broadcast threw: <message>` in debug log instead of crashing
- [x] KB updated: web-serve-dashboard, web-request-flow, nodes.json, file-hashes.json
- [x] Published to npm and pushed

## Completed (v0.12.14)
- [x] bin/claude-pilot.js: fix SIGINT handler regression — Ctrl+C now prints hint only, no longer stops web server
- [x] Watch mode sort by active status (needs-response/running → idle → limit/offline/ended) matching web UI
- [x] Watch mode supports >9 sessions: j/k + arrow key navigation, 1–9 quick-select still works
- [x] Published to npm

## Completed (v0.12.13)
- [x] bin/claude-pilot.js: fix exit hang — watchStop guard stops draw timer before readline.question()
- [x] handleExit() calls webServer.stop() before exit prompt
- [x] SIGTERM handler added; telegram ReferenceError (positional → args[0]) fixed
- [x] lib/WebServer.js: debug log at ~/.claude/pilot-web-debug.log with per-request timing, SSE events, slow broadcast detection
- [x] Published to npm

## Completed (v0.12.11)
- [x] Bump patch version for countdown / Telegram limit fix
- [x] Run tests and package verification
- [x] Publish release to npm

## Completed (unreleased)
- [x] Investigate Web UI debug countdown-to-restart behavior and Telegram repeat messages before reset time
- [x] Update architecture documentation before code changes
- [x] Add watcher tests around reset countdown / notification retry behavior
- [x] Apply scoped code fix and update CHANGELOG

---

## Completed (v0.12.8)
- [x] lib/Watcher.js: support reset time format with timezone: "resets 6am (Asia/Bangkok)"
- [x] RESET_AT_RE regex captures optional timezone in parentheses
- [x] _parseResetTime() includes timezone in notifications
- [x] _parseResetAtMs() handles times with/without colons
- [x] CHANGELOG and version bumped to 0.12.8
- [x] Published to npm

## Completed (v0.12.9)
- [x] lib/Watcher.js: add _limitHandlingUntil flag to prevent retry spam
- [x] Block repeated _handleLimit() calls when limit persists after reset time
- [x] Defer retries for 2 minutes when limit still showing
- [x] Clear flag when session returns to running state
- [x] KB updated with retry prevention logic
- [x] CHANGELOG and version bumped to 0.12.9
- [x] Published to npm

## Completed (v0.12.10)
- [x] lib/Watcher.js: keep _limitHandlingUntil set for 5min after resume (don't clear immediately)
- [x] Prevents immediate retry if limit re-appears after resume attempt
- [x] Gives Claude time to actually process the resume command
- [x] Fixes "telegram resume every 5 min" issue
- [x] CHANGELOG and version bumped to 0.12.10
- [x] Published to npm

---

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

## Completed (v0.5.14)
- [x] config.js: CCP_CONFIG_PATH env override for test isolation
- [x] test/config.test.js: 14 unit tests for all config functions
- [x] test/webserver.test.js: 20 HTTP integration tests (auth, queue CRUD, auto-feed, meta)
- [x] package.json: added "test" script (node --test)

## Completed (v0.6.0 — terminal UX + menu detection)
- [x] ui.html: command history — ↑/↓ recalls sent messages when input has text
- [x] ui.html: ↑/↓ forward to tmux when input is empty (navigate Claude menus)
- [x] ui.html: Tab key forwarded to tmux; Ctrl+C/D/U/L
- [x] ui.html: Auto-yes toggle — presses Enter automatically when needs-response
- [x] ui.html: ↑ ↓ ⇥ buttons in terminal footer
- [x] ui.html: detectMenuOptions() — numbered menus become CTA buttons
- [x] ui.html: ollama fallback via GET /api/sessions/:name/menu
- [x] ui.html: SessionCard — snippet, CTA buttons, quick-reply input
- [x] WebServer.js: _getSnippetAndMenu(), _detectMenuOptionsFromText(), _detectMenuWithOllama()
- [x] WebServer.js: GET /api/sessions/:name/menu endpoint
- [x] bin/claude-pilot.js: watch sorted alphabetically by name

## Completed (v0.6.1)
- [x] ui.html: snippet shows up to 4 lines, strip separator/blank lines
- [x] ui.html: menu CTA — one option per full-width row, truncated with hover tooltip

## Completed (v0.6.2)
- [x] bin/claude-pilot.js: LAN binding question on startup; shows LAN IP in output
- [x] WebServer.js: localhost auth bypass (skipped when no X-Forwarded-For / CF-Connecting-IP)

## Completed (v0.6.3)
- [x] WebServer.js: strip trailing blank lines from capture-pane output (fixes large terminals pushing content off screen)

## Completed (v0.6.4)
- [x] ui.html: SnippetControl — Off/1/2/3/4 toggle in dashboard header, saved to localStorage

## Completed (v0.6.5)
- [x] ui.html: SnippetControl changed to Off/2/4/6/8; invalid stored values fall back to 4
- [x] WebServer.js: snippet capture window increased to 8 lines max
- [x] ui.html: TelegramControl — On/Off toggle in dashboard header (hidden when unconfigured)
- [x] WebServer.js: GET/POST /api/settings for telegramEnabled state
- [x] bin/claude-pilot.js: `telegram on|off` REPL command
- [x] Watcher.js: check telegram.enabled before every notifier.send
- [x] Watcher.js: needs-response notifications debounced to once/min per session

## Completed (v0.6.6)
- [x] WebServer.js: POST /api/sessions/:name/resize → tmux resize-pane
- [x] ui.html: ResizeObserver on terminal-body; measures char cell size, sends cols/rows on mount and window resize (80ms debounce)

## Completed (v0.6.7)
- [x] ui.html: CTA button hit feedback — clicked button turns green + ✓, all disabled 2.5s then reset for retry
- [x] Applied to both SessionDetailScreen CTA strip and SessionCard dashboard buttons
- [x] ctaHit state cleared when session leaves needs-response status

## Completed (v0.6.8)
- [x] Watcher.js: append telegram.dashboardUrl to needs-response and limit-hit notifications
- [x] bin/claude-pilot.js: set telegram.dashboardUrl to LAN IP on start; upgrade to tunnel URL when ready
- [x] ui.html: mobile — section-header controls stack vertically on narrow screens
- [x] ui.html: mobile — CTA buttons 44px min-height, terminal footer keys 36px + horizontal scroll

## Completed (v0.6.9)
- [x] ui.html: scroll lock — auto-scroll pauses when user scrolls up (>60px from bottom), resumes on scroll-to-bottom
- [x] userScrolledRef resets on session change

## Completed (v0.7.0–v0.7.4)
- [x] ui.html: mobile card width fix — min-width:0 on .session-card + overflow-x:hidden on .content
- [x] ui.html: scroll bounce fix — auto-scroll only within 60px of bottom (userScrolledRef)
- [x] ui.html: CTA hit feedback — green ✓, all disabled 2.5s, then retry
- [x] ui.html: blink animation on needs-response status pill + Web Audio beep alert (sound toggle)
- [x] ui.html: status pill always visible — flex-shrink:0 + flex:1;min-width:0 on name container
- [x] Watcher.js: Telegram URL fix — LAN IP only when bindLan, tunnel URL overrides when ready
- [x] bin/claude-pilot.js: LAN binding + Telegram tap-to-open URL

## Completed (v0.7.5)
- [x] config.js: saveSetupPrefs / getSetupPrefs
- [x] bin/claude-pilot.js: yesNo() helper — Y/n vs y/N based on last choice; prefs saved after setup
- [x] bin/claude-pilot.js: REPL hint updated to include "exit to quit"
- [x] ui.html: Buy Me a Coffee button script
- [x] README.md: Buy Me a Coffee badge

## Backlog
- [ ] smarter retry logic
- [ ] usage statistics and session timeline
- [ ] pluggable notification providers
