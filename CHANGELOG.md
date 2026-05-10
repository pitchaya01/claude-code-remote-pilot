# Changelog

## 0.12.11 — 2026-05-10

### Fixed
- **Limit restart countdown and Telegram repeats**: the Web UI now renders future `resumeAt` values as a restart countdown instead of `0s ago`, and the watcher verifies post-reset limit state using only the recent visible pane window instead of stale tmux scrollback.
- **Reset timezone handling**: reset timestamps now honor Claude's explicit IANA timezone, such as `resets 6am (Asia/Bangkok)`, when calculating the auto-resume time.

---

## 0.12.10 — 2026-05-10

### Fixed
- **Telegram resume every 5 min**: when a resume command was sent but the limit message re-appeared (Claude not ready), the `_limitHandlingUntil` flag was being cleared immediately, allowing `_handleLimit()` to be called again on the next check cycle. Now the flag stays set for 5 minutes after a resume attempt, giving Claude time to process the command before we retry.

---

## 0.12.9 — 2026-05-10

### Fixed
- **Limit handling retry spam**: when a usage limit persists after the calculated reset time, the code was allowing `_handleLimit()` to be called repeatedly (every 5 seconds via the check loop), causing duplicate notifications. Added `_limitHandlingUntil` flag to block retry attempts for 2 minutes when limit is still showing, ensuring we wait for the actual reset time instead of falling back to 5-minute retry intervals.

---

## 0.12.8 — 2026-05-10

### Fixed
- **Reset time parsing with timezone**: limit reset messages now parse both legacy format (`resets at 2:00 AM`) and new Claude format (`resets 6am (Asia/Bangkok)`). Timezone is extracted and included in notifications and dashboard display.

---

## 0.12.7 — 2026-05-10

### Fixed
- **Auto-resume stuck in limit loop**: when the usage limit is still active after the calculated reset time, the resume command was sent repeatedly, causing `"You've hit your limit"` to appear over and over. Now checks pane output after the reset timer — if limit message is still visible, defers resume by 60s instead of sending the resume command.

---

## 0.12.6 — 2026-05-09

### Removed
- **Quota bars** (`Ses %` / `Wk %`): removed `/api/quota` endpoint, `_fetchQuota()`, and UI bars. The tmux approach couldn't reliably read `claude /usage` in all server environments.

---

## 0.12.5 — 2026-05-09

### Fixed
- **Quota fetch blocked by workspace trust dialog**: when the pilot server runs from `$HOME`, claude shows a trust dialog on startup and never reaches the main prompt. Fixed by passing `--dangerously-skip-permissions` to the claude invocation inside `_fetchQuota()`.

---

## 0.12.3 — 2026-05-09

### Fixed
- **Quota fetch reliable**: replaced fixed sleep waits with `pollFor()` — polls tmux pane every 500 ms until the expected string appears (claude prompt within 8 s, usage output within 6 s). Eliminates false-null caused by timing races. Session name now uses timestamp instead of PID to prevent name conflicts if a previous fetch crashed without cleanup.

---

## 0.12.2 — 2026-05-09

### Fixed
- **Quota bars now appear**: `Resets` prefix not stripped (leading spaces in captured output). Retry logic changed from 5-min fixed interval to 10s poll-until-data, then 5-min refresh — bars appear ~10s after dashboard loads instead of never.

---

## 0.12.1 — 2026-05-09

### Added
- **Session & week quota bars**: sysinfo bar now shows `Ses XX%` and `Wk XX%` progress bars sourced from `claude /usage`. The server spawns a hidden tmux session, runs claude, sends `/usage`, captures the TUI output, and parses the percentages and reset times. Cached 5 minutes. `CLAUDE_PATH` env var overrides the binary location.

---

## 0.12.0 — 2026-05-09

### Added
- **Quota / limit monitoring**: when any session hits the Claude rate limit the sysinfo bar now shows a prominent `⚠ LIMIT · resets HH:MM` indicator in warning yellow. Limit reset time is sourced directly from the session's `resumeAt` / `resetTime` fields — no polling needed.
- **Session card reset time**: session cards with `status: limit` now show a **Resets** field (warning yellow) in place of the Tokens field, so the reset time is visible at a glance on the dashboard without opening the detail pane.
- **Weekly message count in sysinfo bar**: the 7-day usage display now shows `Xout · Ymsg` (output tokens + message count from `~/.claude/stats-cache.json`), giving a subscription-friendly proxy for quota usage. Hover for full breakdown.
- **`/api/usage` extended**: response now includes `weekMessages`, `weekSessions`, `weekTools`, `daily[]` (activity counts from stats-cache), plus `limitResetAt` and `limitResetTime` (soonest rate-limit reset across all active sessions, or `null` when none).

---

## 0.11.0 — 2026-05-09

### Added
- **Weekly usage in sysinfo bar**: the dashboard minibar now shows 7-day token totals (`↑input ↓output · cache N`) sourced directly from Claude Code's JSONL conversation files (`~/.claude/projects/**/*.jsonl`). No session disruption — reads files in the background, cached 60 s. Hover for full breakdown (input / output / cache read / cache write).

---

## 0.10.3 — 2026-05-09

### Fixed
- **Back button invisible on mobile**: the Back button had been moved inside `.detail-header` which is `display:none` on mobile, making it impossible to navigate back. Restored to its correct position above the header.

---

## 0.10.2 — 2026-05-09

### Fixed
- **Disk usage percentage wrong on macOS APFS**: `df -k` total-blocks column does not reflect real usable space on APFS volumes. Percentage is now computed as `used / (used + available)`, which matches the Capacity % that `df` itself reports.

### Changed
- **Stat cards leaner**: padding reduced (`14px → 10px/12px`), value font smaller (`22px → 18px`), label/sub text tighter — cards take noticeably less vertical space on both mobile and desktop.

---

## 0.10.1 — 2026-05-09

### Changed
- **Active sort — idle sessions by last active time**: idle sessions are now ordered most-recently-active first instead of alphabetically. Running/needs-response sessions still sort by name. `lastActiveAt` timestamp is stamped on the session when it transitions from running → idle.
- **Mobile terminal header hidden**: the dot bar (colored circles + session name + A±/font-size controls) is no longer shown on mobile — the terminal body fills the full allocated height.
- **Removed Ctrl+B D hint**: the "Ctrl+B D · detach" label in the terminal header has been removed — it's a tmux keybinding that doesn't apply in the web UI.
- **Mobile terminal height**: adjusted to `calc(100dvh - 160px)` to better fit within the viewport after hiding the terminal header.

---

## 0.10.0 — 2026-05-09

### Added
- **/publish skill**: automated npm release workflow — CHANGELOG → README → KB update → version bump → `npm publish` → git commit → git push, invokable as `/publish patch|minor|major`.

---

## 0.9.1 — 2026-05-09

### Added
- **Emoji avatar on session cards**: each session card shows a 40 px circular avatar on the left — the chosen emoji, or the first letter of the session name as a fallback. The color accent (if set) tints the avatar background.
- **Emoji preset picker**: the Label section in session detail (desktop sidebar + mobile Info tab) now shows a 12-preset emoji grid instead of a plain text input. Clicking a preset selects it (click again to deselect); a free-text fallback input below accepts any custom emoji.
- **Active sort mode** (new default): sessions are grouped as active (running + needs-response) → idle → inactive, then sorted by name within each group. Prevents cards from bouncing position when a session flips between `running` and `needs-response`.

### Fixed
- **Sysinfo bar NaN**: CPU/RAM/disk values showed `NaN MB` due to a missing `.then(r => r.json())` in the fetch chain. Resolved.
- **Terminal and git panel overflow**: terminal body height on desktop was slightly taller than the viewport. Corrected height expressions for both desktop and mobile.
- **Telegram needs-response delay**: Telegram notification for `needs-response` is now sent only after 30 seconds of no user interaction. If the user responds within that window the notification is suppressed entirely, reducing noise from brief prompts.

### Changed
- **Mobile button size**: key shortcut buttons in the terminal footer are ~10 % smaller on mobile to improve tap density.
- **Mobile detail header hidden**: the session title / path bar is hidden on mobile to reclaim vertical space for the terminal.

---

## 0.9.0 — 2026-05-09

### Added
- **Mobile terminal — full screen**: terminal fills the viewport on mobile (`100dvh`); the input footer is fixed to the bottom of the screen so it stays visible while scrolling output.
- **Mobile tabs**: session detail view gains two extra tabs on mobile — **Info** (actions + session info + label) and **Queue** — so the terminal is always full width. Desktop layout unchanged.
- **Font size controls**: `A-` / `A+` buttons in the terminal header adjust display font size (10–18 px). Setting is saved to `localStorage` and restored on next visit.
- **Dashboard sysinfo minibar**: a compact bar below the stat cards shows live CPU load, RAM usage, and disk usage with colour-coded mini progress bars, refreshed every 5 s.

---

## 0.8.9 — 2026-05-09

### Fixed
- **Git tab — files inside directories**: `git status` now uses `-uall` so untracked directories are expanded to individual files. Previously an untracked directory appeared as a single entry with no diff or commit support; now every file inside is listed, selectable, and diffable.

---

## 0.8.8 — 2026-05-09

### Fixed
- **SSH/headless Linux support**: `xdg-open` is no longer called in SSH sessions or displayless Linux environments, which caused a crash/error. The dashboard URL is now always printed to the terminal; the browser only opens automatically on desktop environments.

---

## 0.8.7 — 2026-05-09

### Changed
- **Terminal Enter behaviour**: Enter sends the message; Ctrl+Enter inserts a newline (swapped from 0.8.4).
- **Mobile input zoom fix**: terminal textarea uses `font-size: 16px` on mobile, preventing iOS Safari from zooming the viewport on focus.

---

## 0.8.6 — 2026-05-09

### Changed
- **Broadcast as 4th stat card**: the broadcast-all input is now embedded directly in the stat row as the 4th card, replacing the removed Uptime card. Input and Send button sit inside the card; disabled with a "No active sessions" placeholder when nothing is running.

---

## 0.8.5 — 2026-05-09

### Changed
- **Dashboard layout**: removed Uptime stat card; broadcast-all input moved to top of dashboard (below the stat row) so it's immediately accessible instead of buried at the bottom of the page.

---

## 0.8.4 — 2026-05-09

### Changed
- **Multi-line terminal input**: the input field is now a textarea. Enter inserts a newline; Ctrl+Enter (or the new **↵ Send** button) sends the message. Shift+Enter still sends a bare Enter keystroke to tmux.
- **Mobile footer layout**: input row now stacks above the key buttons so the textarea is always visible on small screens.
- **Key button order**: Esc moved to the far left, ↵ (bare Enter) moved to the far right — maximum separation to avoid accidental taps.

---

## 0.8.3 — 2026-05-08

### Changed
- README rewritten for end users — no internal API routes or implementation details
- Technical API reference and architecture overview moved to new `DEVELOPMENT.md`

---

## 0.8.2 — 2026-05-08

### Changed
- **Git panel → tab-switching interface**: replaced the small sidebar git widget with a full-screen tab layout. The session detail view now has a **Terminal** tab (original terminal + queue sidebar) and a **Git** tab (full-width two-column layout). The Git tab shows a file list with checkboxes on the left and a scrollable colour-coded diff viewer on the right, with a commit bar at the top. Tabs reset to Terminal whenever the selected session changes.

---

## 0.8.1 — 2026-05-08

### Added
- **Git diff & commit panel**: new sidebar panel (below Queue) that appears automatically when the session's working directory has uncommitted changes. Lists modified/untracked/deleted files with status icons; click a file to see a colour-coded unified diff (green additions, red removals, blue hunks). Checkboxes let you select specific files — unchecked commits everything (`git add .`). Commit message field + Commit button; panel hides when there are no changes or the directory is not a git repo.
  - `GET /api/sessions/:name/git/status` — `git status --porcelain`
  - `GET /api/sessions/:name/git/diff?file=` — staged, unstaged, and untracked diffs
  - `POST /api/sessions/:name/git/commit` — `git add` + `git commit`
- **Open Finder button**: new button in the session detail header (online and offline) that opens the session's working directory in macOS Finder.
  - `POST /api/sessions/:name/open-finder` — `open <path>`

---

## 0.8.0 — 2026-05-08

### Fixed
- **Terminal text selection**: clicking on the terminal body no longer clears an active text selection — the input only steals focus when no text is highlighted, so copy-paste now works.

### Added
- **Enter key improvements**: pressing Enter on an empty input now forwards a bare Enter keystroke to the tmux pane (confirm prompts without typing anything). Shift+Enter always sends a bare Enter regardless of input content — useful as a quick "confirm/done" without clearing a draft message.
- **Queue in sidebar**: the message queue panel is now embedded in the right-hand sidebar alongside Session Info, keeping the terminal view uncluttered. Sidebar is scrollable when the queue grows long.

---

## 0.7.9 — 2026-05-08

### Added
- **Remove offline session**: offline sessions can now be removed from history via a trash button on the session card (dashboard) and a "Remove" button in the session detail view. Removal is confirmed with a dialog before proceeding.
  - `SessionManager.removeFromHistory(name)` — refuses if the session is still active
  - `DELETE /api/sessions/:name/history` — new endpoint
  - Offline cards on the dashboard now show Respawn + trash buttons directly (no need to open detail)

---

## 0.7.8 — 2026-05-08

### Changed
- **Buy Me a Coffee button**: moved to the top header (next to dark mode toggle on desktop; ☕ icon-only on mobile). Removed from sidebar footer.
- **Version badge**: sidebar `v__CCP_VERSION__` placeholder is now replaced with the real version from `package.json` at serve time — no more stale `v0.5.0`.

---

## 0.7.7 — 2026-05-08

### Fixed
- **Buy Me a Coffee button**: replaced off-screen floating script widget with a visible yellow button in the sidebar footer.

---

## 0.7.6 — 2026-05-08

### Fixed
- **Exit hint timing**: `Type help for commands · exit to quit.` was printed before watch mode started, so watch immediately cleared the screen and swallowed it. Now printed when exiting watch (on `q`) and on startup when there are no sessions to watch.

---

## 0.7.5 — 2026-05-08

### Added
- **Remember last setup choices**: web dashboard, LAN binding, and tunnel preferences are saved to `~/.claude-remote-pilot.json` and used as defaults on the next run — the `(Y/n)` / `(y/N)` prompt reflects what you chose last time; pressing Enter selects it.
- **Exit hint in REPL**: startup message now shows `Type help for commands · exit to quit.`
- **Buy Me a Coffee button**: added to the web dashboard and README.

---

## 0.7.4 — 2026-05-08

### Fixed
- **Status pill disappearing from session cards**: long session names pushed the pill off the card. Added `flex:1;min-width:0` to the name/path container so it shrinks instead of overflowing, and `flex-shrink:0` to `.status-pill` so it's always visible. Session name now also truncates with ellipsis.

---

## 0.7.3 — 2026-05-08

### Fixed
- **Telegram notification URL**: reverted overbroad LAN IP detection from v0.7.1. URL is now `127.0.0.1` when bound to localhost only (sending an unreachable LAN IP would be confusing), and the LAN IP only when explicitly bound to `0.0.0.0`. Tunnel URL still upgrades it once cloudflared is ready.

---

## 0.7.2 — 2026-05-08

### Added
- **Blinking status pill**: the `needs input` pill now pulses with a 1s CSS animation so it catches your eye at a glance.
- **Sound alert**: a short 880 Hz beep plays via Web Audio when any session transitions to `needs-response`. Toggle with the **Sound: On / Off** control in the dashboard header — preference saved to localStorage (on by default).

---

## 0.7.1 — 2026-05-08

### Fixed
- **Telegram notification URL was 127.0.0.1**: LAN IP is now always detected regardless of whether "Expose on LAN" was chosen. Telegram notifications are remote by nature so 127.0.0.1 is never useful there. The LAN IP is used as the notification URL; tunnel URL still overrides it once cloudflared is ready.

---

## 0.7.0 — 2026-05-08

### Fixed
- **Session cards overflowing on mobile**: added `min-width:0` to `.session-card` (grid items default to `min-width:auto` and refused to shrink below content width) and `overflow-x:hidden` to `.content` so wide children can't expand the scroll area. Session path text now uses `min-width:0` instead of a hardcoded `maxWidth:220px`.

---

## 0.6.9 — 2026-05-08

### Fixed
- **Web terminal scroll bounce**: the terminal no longer jumps to the bottom when new output arrives while you're scrolled up. Auto-scroll only fires when you're within 60 px of the bottom; scroll up even slightly and updates land silently. Scrolling back to the bottom re-enables auto-scroll. Resets on session change.

---

## 0.6.8 — 2026-05-08

### Added
- **Telegram dashboard URL**: needs-response and limit-hit notifications now include a tap-to-open URL. On LAN-bound (`0.0.0.0`) setups the LAN IP is used; once a cloudflared tunnel is ready that URL takes over. URL is set on the shared `telegram` object so all Watcher instances pick it up automatically.

### Changed
- **Mobile layout**: section-header controls stack vertically on narrow screens. CTA menu buttons get a 44 px min-height touch target. Terminal footer key buttons (↑ ↓ ⇥ etc.) get a 36 px min-height and the footer scrolls horizontally when it overflows.

---

## 0.6.7 — 2026-05-08

### Changed
- **Menu CTA hit feedback**: clicking a choice button now disables all buttons immediately and highlights the chosen one in green with a `✓` marker. After 2.5 s they reset to normal so you can retry if the action didn't land. Applies to both the terminal detail strip and the dashboard card buttons.

---

## 0.6.6 — 2026-05-08

### Added
- **Terminal resize sync**: the web terminal now tells tmux the correct pane dimensions. On entering the session detail view, the pane is resized to match the browser viewport; a `ResizeObserver` keeps it in sync as you resize the window. This prevents Claude's menus and borders from being drawn at the wrong width.

---

## 0.6.5 — 2026-05-08

### Added
- **Telegram on/off toggle**: mute all Telegram notifications without removing your credentials. Toggle from the dashboard header (shows only when a bot token is configured) or via CLI: `telegram on` / `telegram off`.
- **Telegram needs-response debounce**: notifications for "needs your response" are rate-limited to at most once per minute per session, preventing spam when a session rapidly re-enters that state.
- **Snippet lines Off/2/4/6/8**: dashboard snippet control now uses even steps matching the new 8-line server cap. Stored values outside the valid set fall back to 4.

### Changed
- Snippet capture window increased from 4 to 8 lines max (server sends up to 8, client controls how many to display).

---

## 0.6.4 — 2026-05-08

### Added
- **Snippet line count control**: the dashboard header now has a "Snippet: Off 1 2 3 4" toggle. Pick how many terminal lines to show per session card, or turn them off entirely. Choice is saved across reloads.

---

## 0.6.3 — 2026-05-08

### Fixed
- **Web terminal missing last lines**: `capture-pane` pads output to the full pane height, so large terminals produced hundreds of trailing empty lines that pushed real content above the visible scroll area. Trailing blank lines are now stripped before sending to the browser.

---

## 0.6.2 — 2026-05-08

### Added
- **LAN binding**: startup now asks "Expose on LAN (all interfaces)? (y/N)". Answering yes binds the web server to `0.0.0.0` and prints the LAN IP for easy mobile access.
- **Localhost auth bypass**: when a password is set, direct requests from `127.0.0.1` / `::1` skip the token check — you're never prompted to log in from your own machine. Requests through a cloudflared tunnel still require a token (cloudflared adds `X-Forwarded-For`, which the bypass detects).

---

## 0.6.1 — 2026-05-08

### Changed
- **Dashboard snippet**: shows up to 4 meaningful lines of terminal output (was 1). Separator lines (`─`, `━`, `═`, `-`, box-drawing chars) and blank lines are filtered out.
- **Menu CTA layout**: each choice is now a full-width row instead of wrapping inline chips. Long labels are truncated with `…`; hover reveals the full text via tooltip.

---

## 0.6.0 — 2026-05-08

### Added
- **Terminal keyboard UX**: arrow keys navigate Claude's numbered menus when the input is empty; when input has text, ↑/↓ walk through command history (last 100 sent messages). Tab is forwarded to tmux for completion/cycling. Ctrl+C and Ctrl+D send to tmux when the input is empty. Ctrl+U clears the input line; Ctrl+L sends clear-screen. Clicking anywhere in the terminal output area focuses the input.
- **Auto-yes mode**: toggle button in the session header that automatically presses Enter when Claude's status becomes `needs-response` (confirms option 1 in permission menus after an 800 ms grace period). Can be toggled per session.
- **Menu CTA detection**: when Claude shows a numbered choice menu (1 / 2 / 3 …), the terminal view and dashboard cards detect the options and render them as clickable buttons. Clicking navigates to the correct option via arrow keys then Enter — no typing required. Client-side regex handles the common case instantly; a "Parse options…" button triggers a server-side fallback that calls **ollama** (`OLLAMA_URL` + `OLLAMA_MODEL` env vars, defaults to `phi3:mini`) for non-standard terminal output that regex can't reliably parse.
- **Dashboard snippet**: each active session card now shows the last non-empty line of terminal output as a dark terminal-style preview strip — updated every 3 s via the existing broadcast, no extra polling.
- **Dashboard quick-reply**: every active session card has an inline send input. Type and press Enter (or `→`) to send a message directly from the dashboard without opening the detail view. Click events are contained so the card doesn't navigate.
- **Dashboard CTA buttons**: when a session is in `needs-response` and menu options are detected, the buttons appear directly on the card so you can respond to multiple agents from the dashboard at once.
- **CLI watch sort by name**: sessions in the watch table are now sorted alphabetically by name.
- ↑ ↓ ⇥ buttons added to the web terminal footer for click-driven menu navigation.

---

## 0.5.7 — 2026-05-06

### Fixed
- **Running status now takes precedence over stale limit text**: watcher checks recent running markers before limit window matching, preventing false re-entry into `limit` when old limit lines remain in scrollback.

---

## 0.5.5 — 2026-05-06

### Fixed
- **Respawn loading no longer appears stuck**: web respawn now has a request timeout and surfaces a clear timeout error when the API call hangs, so the button always returns to clickable state.
- **Terminal output now feels realtime**: session detail terminal polling runs at a faster cadence and triggers immediate output refresh after sending input/keys, improving perceived connect speed and responsiveness.
- **"Connecting…" no longer gets stuck**: terminal detail view now clears connecting state on poll failures, shows a retrying error hint, and fixes session state initialization order for stable render behavior.
- **Respawn/End web actions stabilized**: removed false-positive client respawn timeout and added explicit inline error handling for End action responses, so both controls fail visibly instead of appearing stuck.

## 0.5.4 — 2026-05-06

### Fixed
- **Web UI respawn completed**: offline session respawn now has loading/error feedback and immediately updates session detail state after success.
- **Web respawn now matches CLI spawn behavior**: respawn starts a fresh session from stored path and default command semantics (same as watch-mode spawn), avoiding failures caused by stale stored command values.

---

## 0.5.2 — 2026-05-06

### Fixed
- **Auto-resume now waits for reset time**: when Claude shows an explicit `resets at HH:MM` clock time, `Watcher` now resumes at that exact reset timestamp (including next-day rollover) instead of relying only on relative wait parsing.

---

## 0.5.1 — 2026-05-06

### Fixed
- **Terminal always "Connecting…"**: two root causes patched:
  1. `Cache-Control: no-store` added to all API responses — browsers were heuristic-caching the first (sometimes empty) output response and serving stale data on every subsequent poll.
  2. `ansiToHtml` is now pre-computed before the JSX return with a try-catch — any parsing edge case falls back to ANSI-stripped plain text instead of silently breaking the render.
- **Poll errors are now logged** to the browser console (`[ccp] output poll error:`) instead of silently swallowed, so future issues are diagnosable.
- Added `cache: 'no-store'` to the `fetch` call in the output poll (belt-and-suspenders alongside the server header).

---

## 0.5.0 — 2026-05-06

### Added
- **ANSI color rendering**: terminal output in the web dashboard now renders full 24-bit color, bold, dim, italic, and underline — same colors you see in the real tmux terminal. Server-side: `capture-pane` now uses `-e` flag and sends raw ANSI codes. Client-side: inline `ansiToHtml()` parser handles `38;2;R;G;B` / `48;2;R;G;B` (24-bit), `38;5;N` / `48;5;N` (256-color), and all standard SGR attributes.
- **Browser notifications**: the dashboard requests notification permission on first load. When any session transitions to `needs-response` or `limit`, a desktop notification fires (uses `tag` deduplication so the same session doesn't spam).
- **Broadcast message**: a "Broadcast" bar appears on the Dashboard when there are active sessions. Type a message and press Enter (or click Send) to send the same text to every active session at once. The server sends it via `POST /api/broadcast`.

---

## 0.4.9 — 2026-05-06

### Added
- **Repo metadata in package.json**: added `repository`, `homepage`, and `bugs` fields pointing to `github.com/mekku/claude-code-remote-pilot`.
- **Auto-discover untracked tmux sessions**: on startup, pilot lists any tmux sessions not already being watched and offers to adopt them (fetches the pane's current working directory automatically).
- **Immediate status check on watcher start**: `Watcher.start()` now calls `_check()` immediately instead of waiting for the first 5-second tick — sessions show the correct status from the first second after adopt/spawn.

---

## 0.4.8 — 2026-05-06

### Added
- **Startup prompt**: asks "Open web dashboard? (Y/n)" during setup — default yes. Starts the server on `127.0.0.1:3742` and opens the browser automatically.
- **Terminal header hint**: shows `Ctrl+B D · detach` in the terminal header bar as a reminder to detach from tmux without killing the session.
- **"⊞ New Terminal" button**: copies `tmux attach -t <name>` to clipboard. Button briefly shows "✓ Copied" as confirmation.

---

## 0.4.7 — 2026-05-06

### Fixed
- False `limit` status when a session has recovered from a prior limit hit. Root cause: `LIMIT_RE` was tested against the full 500-line tmux scrollback, so old limit text in scroll history kept re-triggering limit detection even after the session resumed. Now `LIMIT_RE` is checked against only the last 15 non-empty lines (`limitWindow`), matching the same windowed approach used for `RESPONSE_RE` and `RUNNING_RE`.

---

## 0.4.5 — 2026-05-06

### Added
- **Terminal redesign**: input is now embedded inside the terminal box (dark background, monospace font, `❯` prompt) — feels like a real terminal. After sending, focus returns to the input automatically.
- **Full-height terminal**: terminal fills the viewport height (`calc(100vh - 210px)`) with the output scrolling above the pinned input row.
- **Password auth**: `web [port] [host] [password]` — if a password is given, the browser shows a login screen. Token is stored in localStorage and sent as `Authorization: Bearer` on all requests (query param for SSE). `POST /api/login` is the only unauthenticated endpoint.

---

## 0.4.4 — 2026-05-06

### Added
- Press `w` in watch mode to open (or reuse) the web dashboard in the browser. Starts the server on `127.0.0.1:3742` if not already running. Shown in the watch footer: `w: web ui`.

---

## 0.4.3 — 2026-05-06

### Added
- `web [port] [host]` — web dashboard now accepts an optional bind host.
  - `web` → `127.0.0.1:3742` (local only, default)
  - `web 3742 0.0.0.0` → bind to all interfaces (accessible from other devices on the network)
  - `web 8080 192.168.1.10` → bind to a specific interface

---

## 0.4.2 — 2026-05-06

### Fixed
- False limit detection when running `/usage` inside a Claude session. The `/usage` output contains "Resets 6:30pm" which was matching the `resets` keyword. Tightened `LIMIT_RE` to require more specific phrases (`hit your limit`, `usage limit`, `rate limit`, `limit reached`, `try again after`) that only appear in actual limit-hit messages.

---

## 0.4.1 — 2026-05-06

### Added
- Web dashboard: **Esc**, **Ctrl+C**, and **Ctrl+D** buttons in the terminal send area — sends the raw key to the tmux session without appending Enter.
- `POST /api/sessions/:name/send` now accepts `{ key: "Escape" }` (or any tmux key name) in addition to `{ message: "..." }`.

---

## 0.4.0 — 2026-05-06

### Added
- **Web dashboard**: `web [port]` REPL command starts a browser UI at `http://127.0.0.1:3742` (auto-opens in default browser).
  - Live session list via SSE (Server-Sent Events) — no polling, no WebSocket dependency
  - Terminal output viewer with 2-second auto-refresh
  - Send message to Claude from the browser
  - Create new sessions from the browser (name, path, optional initial prompt)
  - Kill sessions from the session detail view
  - Dark/light mode, responsive layout (mobile + desktop)
  - Status activity log: tracks transitions between running / idle / needs-response / limit / offline
  - All tmux calls use `spawnSync` array args — shell-injection safe; server binds to `127.0.0.1` only

### Fixed
- Shell injection vulnerability in `Watcher.js`: `tmux send-keys` on auto-resume now uses `spawnSync` with array args instead of shell interpolation.

---

## 0.3.1 — 2026-05-06

### Changed
- Status check interval reduced from 30s → 5s (faster running/idle/limit detection)
- Watch screen refresh rate reduced from 2s → 1s

---

## 0.3.0 — 2026-05-06

### Added
- **Session history**: every spawned or adopted session is persisted to `~/.claude-remote-pilot.json`. Sessions you've worked in before are remembered even after they end.
- **Offline sessions in watch**: the watch screen now shows offline sessions (from history but no longer running in tmux) alongside live sessions, in dim text.
- **Interactive watch**: press a number key (1–9) to select a session, then:
  - Active session: `[t]` open terminal (tmux attach), `[k]` kill, `Esc` deselect
  - Offline session: `[s]` re-spawn Claude at the saved path, `[r]` remove from history, `Esc` deselect
- **Auto-watch on start**: watch mode opens automatically after startup if there are any sessions (active or historical), so you land in the dashboard instead of a blank prompt.

### Changed
- Watch exits cleanly with `q` back to the command prompt (no session list required first).
- Watch command also triggers when there are only offline sessions in history.

---

## 0.2.13 — previous

- Usage limit detection with auto-resume
- Token usage display in watch (`↑sent ↓received`)
- Configurable resume message
- Telegram notification persistence
- Session recovery after pilot restart
- Status detection: running / idle / needs-response / limit
