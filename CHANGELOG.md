# Changelog

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
