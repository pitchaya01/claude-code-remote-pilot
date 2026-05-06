# Claude Code Remote Pilot

Keep Claude Code running while you're away from your desk.

A small self-hosted helper tool for people who run long Claude Code sessions and are tired of manually resuming after token limits.

Originally built just for personal use… then it slowly grew 😅

![Dashboard screenshot](docs/screenshot-dashboard.png)

---

## Why?

I kept hitting the same problem:

- Claude Code stopped after hitting token limits
- long-running tasks needed babysitting
- sometimes I wanted to leave home while a task was still running
- checking progress remotely was annoying

At first I only wanted auto-resume. Then it slowly turned into a small remote workflow tool.

---

## What this is NOT

- a hosted platform
- an "AI agent framework"
- a replacement for Claude Code
- a polished enterprise product

It's just a practical helper tool for people running Claude Code for long periods.

---

## Features

- Auto-detect Claude Code limit states and resume automatically
- Persistent tmux-based sessions that outlive the pilot process
- Web UI for monitoring and control from phone or any browser — with full ANSI color terminal rendering
- Telegram notifications when sessions need attention
- Browser desktop notifications on status changes
- Broadcast a message to all active sessions at once
- Lightweight, self-hosted — just Node.js and tmux
- Experimental but surprisingly useful 👀

---

## Current Status

Very experimental. Built quickly to scratch a personal itch, so expect rough edges. If you try it and hit weird issues, feel free to open an issue or PR.

---

## Typical Workflow

1. Start the pilot and spawn Claude Code sessions
2. Leave it running — go touch grass
3. Pilot detects limit hits and auto-resumes
4. Get notified via Telegram or browser notification
5. Check progress remotely from your phone

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

- View terminal output with **full ANSI color rendering** (24-bit color, bold, dim, italic) — looks like the real terminal
- Send a message to Claude directly from the browser (or press Esc / ^C / ^D)
- **Broadcast** a message to all active sessions at once
- Spawn new sessions with a name, path, and optional initial prompt
- Kill sessions
- See a live activity log of status transitions
- Receive **browser desktop notifications** when any session needs input or hits a usage limit

By default the server binds to `127.0.0.1` — local only. To access from other devices on your network:

```
claude-pilot> web 3742 0.0.0.0
  ✓ Web dashboard started at http://0.0.0.0:3742
```

You can also bind to a specific interface IP: `web 3742 192.168.1.10`.

---

## Remote access via Cloudflare Tunnel (recommended)

Binding to `0.0.0.0` exposes the dashboard on your local network but not the internet. For secure remote access from anywhere — phone, another machine, a coffee shop — use a [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/).

This is the recommended setup for remote work: the dashboard stays on `127.0.0.1` (never directly exposed), and Cloudflare handles TLS, authentication, and routing.

### Quick start (no domain required)

Install `cloudflared`:

```bash
# macOS
brew install cloudflare/cloudflare/cloudflared

# Linux
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o cloudflared
chmod +x cloudflared && sudo mv cloudflared /usr/local/bin/
```

Start the pilot's web dashboard, then in a second terminal run:

```bash
cloudflared tunnel --url http://127.0.0.1:3742
```

Cloudflare prints a random `https://*.trycloudflare.com` URL. Open it on any device. The tunnel closes when you stop `cloudflared`.

### Persistent tunnel with a custom domain

If you have a domain on Cloudflare, you can get a stable URL and add Cloudflare Access (zero-trust auth) in front of the dashboard.

**1. Authenticate and create a tunnel:**

```bash
cloudflared tunnel login
cloudflared tunnel create claude-pilot
```

**2. Create `~/.cloudflared/config.yml`:**

```yaml
tunnel: <your-tunnel-id>
credentials-file: /home/<user>/.cloudflared/<tunnel-id>.json

ingress:
  - hostname: pilot.yourdomain.com
    service: http://127.0.0.1:3742
  - service: http_status:404
```

**3. Add a DNS record:**

```bash
cloudflared tunnel route dns claude-pilot pilot.yourdomain.com
```

**4. Start the tunnel:**

```bash
cloudflared tunnel run claude-pilot
```

The dashboard is now reachable at `https://pilot.yourdomain.com`.

### Adding authentication (Cloudflare Access)

Cloudflare Access puts a login wall in front of the tunnel — no inbound ports, no VPN.

1. Go to **Cloudflare Zero Trust → Access → Applications → Add an application**
2. Choose **Self-hosted**, set the domain to `pilot.yourdomain.com`
3. Add a policy: allow your email address (or Google/GitHub OAuth)

After this, anyone reaching `pilot.yourdomain.com` must authenticate with Cloudflare before the dashboard loads.

### Run the tunnel as a background service

```bash
# Install as a system service (runs on boot)
sudo cloudflared service install
sudo systemctl start cloudflared   # Linux
sudo launchctl start cloudflared   # macOS
```

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
- [x] ANSI color terminal rendering in browser
- [x] browser desktop notifications on status changes
- [x] broadcast message to all sessions
- [x] auto-discover untracked tmux sessions on startup
- [ ] auto-yes rules — confirm prompts automatically by pattern
- [ ] smarter retry logic
- [ ] usage statistics and session timeline
- [ ] remote command queue
- [ ] pluggable notification providers

---

## Contributing

PRs, ideas, and weird experiments are welcome 😄

---

## License

MIT
