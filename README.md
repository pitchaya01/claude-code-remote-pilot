# Claude Code Remote Pilot

Spawn and supervise multiple Claude Code sessions from a single interactive terminal.

Run it once. Spawn Claude into as many project directories as you want. Walk away — it handles usage limits, waits for resets, sends `continue` automatically, and notifies you on Telegram. Come back to finished work.

Each Claude session lives in its own named tmux session. You can `tmux attach -t <name>` from any terminal at any time, independently of the pilot.

---

## How it works

```
npx claude-code-remote-pilot
  │
  ├── asks: mount current directory as a session?
  ├── asks: set up Telegram? (optional)
  └── opens watch dashboard automatically
```

Watch opens immediately. Press `q` to drop to the command prompt, then `watch` to return.

```
  Claude Code Remote Pilot
  ───────────────────────────────────────────────────────────────────
  #  SESSION             STATUS          UP       USAGE / RESET
  ───────────────────────────────────────────────────────────────────
   1 api-refactor        running         12m      ↑1.2k ↓890
   2 mobile-app          limit 3m        1h 4m    resets 2:00 AM
   3 old-project         offline         —
  ───────────────────────────────────────────────────────────────────
  [1-3]: select session   q: exit watch
```

Press a number to select a session:
- **Active**: `[t]` open terminal · `[k]` kill · `Esc` back
- **Offline**: `[s]` re-spawn · `[r]` remove from history · `Esc` back

From any terminal, attach directly:

```bash
tmux attach -t api-refactor
# Ctrl+B then D to detach
```

---

## Install

```bash
npx claude-code-remote-pilot
```

Or install globally:

```bash
npm install -g claude-code-remote-pilot
claude-remote-pilot
```

---

## Requirements

- Node.js >= 18
- tmux
- Claude Code CLI (`npm install -g @anthropic-ai/claude-code`)

The pilot will prompt you to install missing dependencies on first run.

### Installing tmux manually

**macOS:**
```bash
brew install tmux
```

**Ubuntu / Debian:**
```bash
sudo apt update && sudo apt install tmux
```

**Fedora / RHEL:**
```bash
sudo dnf install tmux
```

**Arch:**
```bash
sudo pacman -S tmux
```

**Windows (WSL):**
```bash
sudo apt update && sudo apt install tmux
```

---

## Commands

| Command | Description |
|---|---|
| `spawn <path> [name]` | Start Claude at a path. Name defaults to the directory name. |
| `list` | One-shot status of all sessions. |
| `watch` | Live dashboard with offline session history. Press a number to select, `q` to exit. |
| `web [port] [host]` | Start the web dashboard. Defaults to `127.0.0.1:3742`. Use `0.0.0.0` to expose on the network. |
| `attach <name>` | Open a tmux session in the current terminal. |
| `kill <name>` | Stop a session. |
| `help` | Show command reference. |
| `exit` | Quit the pilot. Sessions keep running in tmux. |

---

## Web dashboard

Type `web` in the REPL to open a browser dashboard:

```
claude-pilot> web
  ✓ Web dashboard started at http://127.0.0.1:3742
```

The dashboard shows all sessions (live and offline), lets you:

- View terminal output for each session (auto-refreshes every 2 seconds)
- Send a message to Claude directly from the browser
- Spawn new sessions with a name, path, and optional initial prompt
- Kill sessions
- See a live activity log of status transitions

By default the server binds to `127.0.0.1` — local only. To access from other devices on your network:

```
claude-pilot> web 3742 0.0.0.0
  ✓ Web dashboard started at http://0.0.0.0:3742
```

You can also bind to a specific interface IP: `web 3742 192.168.1.10`.

---

## Telegram setup

Create a bot via `@BotFather` and get your token.

Get your chat ID:

```bash
curl "https://api.telegram.org/bot<TOKEN>/getUpdates"
```

Run the pilot — it will ask for these values interactively, or set them as environment variables:

```bash
export TELEGRAM_BOT_TOKEN="your-token"
export TELEGRAM_CHAT_ID="your-chat-id"
npx claude-code-remote-pilot
```

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | — | Telegram bot token |
| `TELEGRAM_CHAT_ID` | — | Telegram chat ID |
| `CLAUDE_COMMAND` | `claude` | Command used to start Claude |

---

## Recommended Claude workflow

For long-running tasks, ask Claude to keep external state:

```
Maintain TASK_STATE.md.
After every meaningful step update: what's done, current status, next exact action.
If interrupted, read TASK_STATE.md and resume from where you left off.
```

Context can drift over long sessions. External state is the real resume brain.

---

## Safety

Start Claude without `--dangerously-skip-permissions` unless you know what you're doing. The pilot is designed for human-supervised workflows:

- watches output
- sends notifications
- sends `continue` after limit resets
- does **not** auto-approve permissions or execute arbitrary commands

---

## Roadmap

- [x] tmux session management
- [x] usage limit detection and auto-resume
- [x] Telegram notifications
- [x] interactive REPL — spawn, watch, attach, kill
- [x] multi-session support
- [x] web dashboard — `web [port]` command, React SPA, SSE live updates
- [x] persistent session history with offline session display
- [ ] pluggable notification providers
- [ ] safety / policy engine

---

## Philosophy

A human-supervised local runtime for Claude Code. Not a fully autonomous agent loop.

Small tools first. Dashboard later.
