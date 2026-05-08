#!/usr/bin/env node
'use strict';

const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const readline = require('readline');
const SessionManager = require('../lib/SessionManager');
const WebServer = require('../lib/WebServer');
const config = require('../lib/config');
const notifier = require('../lib/notifier');

// ─── dependency checks ────────────────────────────────────────────────────────

function has(cmd) {
  try { execSync(`command -v ${cmd}`, { stdio: 'ignore' }); return true; } catch { return false; }
}

function detectPlatform() {
  if (process.platform === 'darwin') return 'macos';
  try {
    const r = fs.readFileSync('/etc/os-release', 'utf8');
    if (/ID=arch/i.test(r)) return 'arch';
    if (/ID=(fedora|rhel|centos)/i.test(r)) return 'fedora';
  } catch {}
  return 'debian';
}

function tmuxInstallCmd() {
  const p = detectPlatform();
  if (p === 'macos') return 'brew install tmux';
  if (p === 'arch') return 'sudo pacman -S --noconfirm tmux';
  if (p === 'fedora') return 'sudo dnf install -y tmux';
  return 'sudo apt-get install -y tmux';
}

function cloudflaredInstallCmd() {
  const p = detectPlatform();
  if (p === 'macos') return 'brew install cloudflare/cloudflare/cloudflared';
  if (p === 'arch') return 'yay -S cloudflared';
  return 'curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared && chmod +x /usr/local/bin/cloudflared';
}

function isYes(answer) { return answer === '' || answer === 'y' || answer === 'yes'; }

function getLanIp() {
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces) {
      if (!iface.internal && iface.family === 'IPv4') return iface.address;
    }
  }
  return null;
}
function isNo(answer)  { return answer === '' || answer === 'n' || answer === 'no'; }

async function ensureDep(rl, cmd, label, installCmd) {
  if (has(cmd)) return;
  console.log(`\n${label} is not installed.`);
  const answer = await question(rl, 'Install it now? (Y/n) ');
  if (!isYes(answer)) {
    console.log(`Run manually: ${installCmd}`);
    process.exit(1);
  }
  console.log(`Running: ${installCmd}\n`);
  try { execSync(installCmd, { stdio: 'inherit' }); console.log(`\n${label} installed.\n`); }
  catch { console.error(`Install failed. Run manually: ${installCmd}`); process.exit(1); }
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function question(rl, q) {
  return new Promise(r => rl.question(q, a => r(a.trim().toLowerCase())));
}

function questionRaw(rl, q) {
  return new Promise(r => rl.question(q, a => r(a.trim())));
}

// ─── telegram setup ───────────────────────────────────────────────────────────

async function setupTelegram(rl) {
  if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
    return { token: process.env.TELEGRAM_BOT_TOKEN, chatId: process.env.TELEGRAM_CHAT_ID };
  }
  const saved = config.load().telegram;
  if (saved && saved.token && saved.chatId) {
    console.log('  Telegram: using saved config.\n');
    return saved;
  }
  console.log('\nTelegram notifications (optional).');
  const answer = await question(rl, 'Set up Telegram now? (y/N) ');
  if (answer === '' || !isYes(answer)) { console.log('Skipping.\n'); return {}; }
  const token = await questionRaw(rl, 'Bot token: ');
  const chatId = await questionRaw(rl, 'Chat ID: ');
  config.saveTelegram(token, chatId);
  console.log('  Telegram configured and saved.\n');
  return { token, chatId };
}

// ─── table rendering ──────────────────────────────────────────────────────────

const C = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  orange: '\x1b[38;5;208m',
  dim: '\x1b[2m',
};

function formatStatus(session) {
  switch (session.status) {
    case 'running':
      return { plain: 'running', colored: `${C.green}running${C.reset}` };
    case 'idle':
      return { plain: 'idle', colored: `${C.blue}idle${C.reset}` };
    case 'needs-response':
      return { plain: 'needs response', colored: `${C.orange}needs response${C.reset}` };
    case 'limit': {
      const secs = session.resumeAt ? Math.max(0, Math.round((session.resumeAt - Date.now()) / 1000)) : 0;
      const label = `limit ${Math.ceil(secs / 60)}m`;
      return { plain: label, colored: `${C.yellow}${label}${C.reset}` };
    }
    case 'offline':
      return { plain: 'offline', colored: `${C.dim}offline${C.reset}` };
    case 'ended':
      return { plain: 'ended', colored: `${C.dim}ended${C.reset}` };
    default:
      return { plain: session.status, colored: session.status };
  }
}

function trunc(str, len) {
  return str.length <= len ? str.padEnd(len) : str.slice(0, len - 1) + '…';
}

function uptime(startedAt) {
  const s = Math.floor((Date.now() - new Date(startedAt)) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

function formatUsage(session) {
  if (session.status === 'limit' && session.resetTime) {
    return `resets ${session.resetTime}`;
  }
  if (session.tokens) {
    return `↑${session.tokens.sent} ↓${session.tokens.received}`;
  }
  return '';
}

// ─── watch mode ───────────────────────────────────────────────────────────────

function buildAllSessions(manager) {
  const active = manager.list();
  const activeNames = new Set(active.map(s => s.name));
  const history = config.getHistory();
  const offline = history
    .filter(h => !activeNames.has(h.name))
    .map(h => ({ name: h.name, path: h.path, status: 'offline', startedAt: h.lastSeen, resumeAt: null }));
  return [...active, ...offline].sort((a, b) => a.name.localeCompare(b.name));
}

function renderWatchTable(allSessions, selectedIdx, webServer = null) {
  const NW = 18, SW = 14, UW = 7, TW = 16;
  const bar = '  ' + '─'.repeat(NW + SW + UW + TW + 10);
  const header = `  ${'#'.padEnd(3)}${'SESSION'.padEnd(NW)}  ${'STATUS'.padEnd(SW)}  ${'UP'.padEnd(UW)}  ${'USAGE / RESET'.padEnd(TW)}`;

  const rows = allSessions.slice(0, 9).map((s, i) => {
    const num = `${i + 1}`;
    const { plain, colored } = formatStatus(s);
    const pad = ' '.repeat(Math.max(0, SW - plain.length));
    const usage = s.status === 'offline' ? '' : formatUsage(s);
    const up = s.status === 'offline' ? '—' : uptime(s.startedAt);
    const sel = selectedIdx === i ? '▶' : ' ';
    return `  ${sel}${num.padEnd(2)}${trunc(s.name, NW)}  ${colored}${pad}  ${up.padEnd(UW)}  ${trunc(usage, TW)}`;
  });

  let footer;
  if (selectedIdx >= 0 && selectedIdx < allSessions.length) {
    const sel = allSessions[selectedIdx];
    if (sel.status === 'offline') {
      footer = `  [s] spawn   [r] remove from history   Esc: back`;
    } else {
      footer = `  [t] terminal   [k] kill   Esc: back`;
    }
  } else {
    footer = `  [1-${Math.min(allSessions.length, 9)}]: select session   w: web ui   q: exit watch`;
  }

  const lines = ['\n', '  Claude Code Remote Pilot'];
  if (webServer) {
    if (webServer._tunnelUrl) {
      lines.push(`  ${C.blue}Tunnel${C.reset}: ${webServer._tunnelUrl}  ${C.dim}local: http://127.0.0.1:${webServer.port}${C.reset}`);
    } else {
      lines.push(`  ${C.dim}Web UI: http://${webServer.host}:${webServer.port}${C.reset}`);
    }
  }
  lines.push(bar, header, bar, ...rows, bar, footer, '');
  return lines.join('\n');
}

function startWatch(manager, rl) {
  let selectedIdx = -1;
  let allSessions = buildAllSessions(manager);
  const timer = { id: null };

  function draw() {
    allSessions = buildAllSessions(manager);
    process.stdout.write('\x1B[2J\x1B[0f');
    process.stdout.write(renderWatchTable(allSessions, selectedIdx, manager._webServer));
  }

  function startTimer() {
    timer.id = setInterval(draw, 1000);
  }

  function stopTimer() {
    clearInterval(timer.id);
    timer.id = null;
  }

  function exitWatch() {
    process.stdin.removeListener('keypress', onKeypress);
    stopTimer();
    process.stdout.write('\x1B[2J\x1B[0f');
    rl.write(null, { ctrl: true, name: 'u' });
    rl.prompt();
  }

  function redraw() {
    process.stdout.write('\x1B[2J\x1B[0f');
    process.stdout.write(renderWatchTable(allSessions, selectedIdx, manager._webServer));
  }

  function onKeypress(str, key) {
    if (!key) return;

    if (key.ctrl && key.name === 'c') { exitWatch(); return; }

    if (key.name === 'escape') {
      selectedIdx = -1;
      redraw();
      return;
    }

    if (selectedIdx < 0) {
      if (str === 'q' || str === 'Q') { exitWatch(); return; }
      if (str === 'w' || str === 'W') {
        let webServer = manager._webServer;
        if (!webServer) {
          webServer = new WebServer(manager, 3742, '127.0.0.1');
          manager._webServer = webServer;
          webServer.start();
        }
        const url = `http://${webServer.host}:${webServer.port}`;
        const opener = process.platform === 'darwin' ? 'open' : 'xdg-open';
        spawn(opener, [url], { stdio: 'ignore', detached: true }).unref();
        return;
      }
      const n = parseInt(str);
      if (!isNaN(n) && n >= 1 && n <= Math.min(allSessions.length, 9)) {
        selectedIdx = n - 1;
        redraw();
      }
      return;
    }

    const sel = allSessions[selectedIdx];

    if (sel.status === 'offline') {
      if (str === 's' || str === 'S') {
        selectedIdx = -1;
        stopTimer();
        process.stdin.removeListener('keypress', onKeypress);
        process.stdout.write('\x1B[2J\x1B[0f');
        try {
          const session = manager.spawn(sel.path, sel.name);
          process.stdout.write(`\n  ✓ "${session.name}" spawned.\n    tmux attach -t ${session.name}\n\n`);
        } catch (e) {
          process.stdout.write(`\n  Error: ${e.message}\n\n`);
        }
        setTimeout(() => {
          allSessions = buildAllSessions(manager);
          draw();
          startTimer();
          process.stdin.on('keypress', onKeypress);
        }, 1500);
        return;
      }
      if (str === 'r' || str === 'R') {
        config.removeFromHistory(sel.name);
        selectedIdx = -1;
        allSessions = buildAllSessions(manager);
        redraw();
        return;
      }
    } else {
      if (str === 't' || str === 'T') {
        stopTimer();
        process.stdin.removeListener('keypress', onKeypress);
        rl.pause();
        process.stdout.write('\x1B[2J\x1B[0f');
        const child = spawn('tmux', ['attach-session', '-t', sel.name], { stdio: 'inherit' });
        child.on('exit', () => {
          process.stdout.write('\n');
          rl.resume();
          selectedIdx = -1;
          allSessions = buildAllSessions(manager);
          draw();
          startTimer();
          process.stdin.on('keypress', onKeypress);
        });
        return;
      }
      if (str === 'k' || str === 'K') {
        try { manager.kill(sel.name); } catch {}
        selectedIdx = -1;
        allSessions = buildAllSessions(manager);
        redraw();
        return;
      }
    }
  }

  draw();
  startTimer();
  process.stdin.on('keypress', onKeypress);
}

// ─── exit handling ───────────────────────────────────────────────────────────

async function handleExit(manager, rl) {
  const sessions = manager.list();
  if (!sessions.length) {
    config.clearSessions();
    console.log('');
    process.exit(0);
  }
  const answer = await question(rl, `\n  Kill all ${sessions.length} session(s) before exiting? (y/N) `);
  if (isYes(answer) && answer !== '') {
    manager.killAll();
    config.clearSessions();
    console.log('  All sessions killed.\n');
  } else {
    config.saveSessions(sessions);
    console.log('  Sessions keep running. Use tmux to attach.\n');
  }
  process.exit(0);
}

// ─── REPL ─────────────────────────────────────────────────────────────────────

const HELP = `
  spawn <path> [name]                        Start Claude at path (name defaults to dir name)
  list                                       Show all sessions
  watch                                      Live session monitor  (q to exit)
  web [port] [host] [password] [--tunnel]    Start web dashboard  (default: 3742 127.0.0.1)
  attach <name>                              Open tmux session in this terminal
  kill <name>                                Stop a session
  resume [message]                           Show or set the message sent after a limit resets
  telegram on|off                            Enable or disable Telegram notifications
  help                                       Show this help
  exit                                       Quit pilot  (asks whether to kill sessions)
`;

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(`
Claude Code Remote Pilot

Usage:
  claude-remote-pilot

Interactive commands:
${HELP}`);
    process.exit(0);
  }

  const setupRl = readline.createInterface({ input: process.stdin, output: process.stdout });

  await ensureDep(setupRl, 'tmux', 'tmux', tmuxInstallCmd());
  await ensureDep(setupRl, 'claude', 'Claude Code CLI', 'npm install -g @anthropic-ai/claude-code');
  const telegram = await setupTelegram(setupRl);

  const cfg = config.load();
  const manager = new SessionManager({ telegram, resumeCommand: cfg.resumeCommand });

  // Recover sessions from previous run
  const savedSessions = (cfg.sessions || []).filter(s => {
    try { execSync(`tmux has-session -t "${s.name}"`, { stdio: 'ignore' }); return true; }
    catch { return false; }
  });

  if (savedSessions.length) {
    console.log(`\n  Found ${savedSessions.length} session(s) still running from last time:`);
    savedSessions.forEach(s => console.log(`    ${s.name.padEnd(22)} ${s.path}`));
    const recover = await question(setupRl, '  Re-adopt and watch them? (Y/n) ');
    if (isYes(recover)) {
      savedSessions.forEach(s => {
        try { manager.adopt(s.name, s.path); console.log(`  ✓ Re-adopted "${s.name}"`); }
        catch (e) { console.log(`  ✗ Could not adopt "${s.name}": ${e.message}`); }
      });
      console.log('');
    }
  }

  // Auto-discover tmux sessions not already managed
  try {
    const tmuxListRaw = execSync('tmux ls -F "#{session_name}"', { encoding: 'utf8' });
    const allTmux = tmuxListRaw.trim().split('\n').filter(Boolean);
    const managed = new Set(manager.list().map(s => s.name));
    const untracked = allTmux.filter(n => !managed.has(n));
    if (untracked.length) {
      console.log(`\n  Found ${untracked.length} untracked tmux session(s):`);
      untracked.forEach(n => console.log(`    ${n}`));
      const adoptAns = await question(setupRl, '  Adopt and watch these? (y/N) ');
      if (adoptAns === 'y' || adoptAns === 'yes') {
        for (const sessionName of untracked) {
          try {
            let sessionPath = '';
            try { sessionPath = execSync(`tmux display-message -p -t "${sessionName}" '#{pane_current_path}'`, { encoding: 'utf8' }).trim(); } catch {}
            manager.adopt(sessionName, sessionPath);
            console.log(`  ✓ Adopted "${sessionName}"${sessionPath ? ` at ${sessionPath}` : ''}`);
          } catch (e) { console.log(`  ✗ ${e.message}`); }
        }
        console.log('');
      }
    }
  } catch {}

  const cwd = process.cwd();
  const defaultName = path.basename(cwd);
  const mount = await question(setupRl, `Mount current directory as a session? (${defaultName}) [y/N] `);

  if (mount === 'y' || mount === 'yes') {
    const rawName = await questionRaw(setupRl, `Session name [${defaultName}]: `);
    const session = manager.spawn(cwd, rawName || defaultName);
    console.log(`  ✓ "${session.name}" started at ${session.path}`);
    console.log(`    tmux attach -t ${session.name}\n`);
  }

  const openWeb = await question(setupRl, 'Open web dashboard? (Y/n) ');
  if (isYes(openWeb)) {
    let webPassword = null;
    let useTunnel = false;

    const lanAns = await question(setupRl, 'Expose on LAN (all interfaces)? (y/N) ');
    const bindLan = lanAns === 'y' || lanAns === 'yes';
    const webHost = bindLan ? '0.0.0.0' : '127.0.0.1';

    const tunnelAns = await question(setupRl, 'Expose publicly via cloudflared tunnel? (y/N) ');
    useTunnel = tunnelAns === 'y' || tunnelAns === 'yes';

    if (useTunnel && !has('cloudflared')) {
      console.log(`\n  cloudflared not found. Install it:\n    ${cloudflaredInstallCmd()}\n  Continuing without tunnel.\n`);
      useTunnel = false;
    }

    if (useTunnel) {
      console.log('\n  ⚠  Public tunnel exposes your dashboard to the internet.');
      const pwAns = await questionRaw(setupRl, '  Set a password (strongly recommended, Enter to skip): ');
      if (pwAns) {
        webPassword = pwAns;
        console.log('  Password protection enabled.\n');
      } else {
        console.log('  ⚠  No password set — anyone with the URL can control your sessions!\n');
      }
    }

    const webServer = new WebServer(manager, 3742, webHost, webPassword);
    manager._webServer = webServer;
    webServer.start();
    const localUrl = 'http://127.0.0.1:3742';
    const lanIp = bindLan ? getLanIp() : null;
    const lanNote = lanIp ? `  ${C.dim}(LAN: http://${lanIp}:3742)${C.reset}` : '';
    console.log(`  ✓ Web dashboard at ${localUrl}${lanNote}`);

    // Use LAN IP in notifications only when actually bound to all interfaces.
    // Tunnel URL overrides this once cloudflared is ready.
    telegram.dashboardUrl = lanIp ? `http://${lanIp}:3742` : localUrl;

    if (useTunnel) {
      console.log('  Starting cloudflared tunnel...');
      webServer.startTunnel().then(publicUrl => {
        telegram.dashboardUrl = publicUrl; // upgrade to public URL once tunnel is ready
        console.log(`  ✓ Tunnel ready: ${publicUrl}`);
        console.log('    Note: first visit may show a Cloudflare warning — click "Proceed" to open the dashboard.');
        if (!webPassword) console.log('  ⚠  Reminder: no password set. Restart with a password for security.');
        if (telegram.token && telegram.chatId) {
          notifier.send(telegram.token, telegram.chatId,
            `Claude Remote Pilot tunnel ready: ${publicUrl}${webPassword ? ' (password protected)' : ' ⚠ no password set'}`);
          console.log('  ✓ Tunnel URL sent via Telegram.');
        }
      }).catch(e => console.log(`  ✗ Tunnel failed: ${e.message}`));
    }

    const opener = process.platform === 'darwin' ? 'open' : 'xdg-open';
    spawn(opener, [localUrl], { stdio: 'ignore', detached: true }).unref();
    console.log('');
  }

  setupRl.close();

  console.log('  Type help for commands.\n');
  const replRl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'claude-pilot> ',
  });

  // Auto-enter watch if there are sessions to monitor
  const allAtStart = buildAllSessions(manager);
  if (allAtStart.length) {
    startWatch(manager, replRl);
  } else {
    replRl.prompt();
  }

  replRl.on('line', async (line) => {
    const parts = line.trim().split(/\s+/).filter(Boolean);
    const [cmd, ...args] = parts;

    if (!cmd) { replRl.prompt(); return; }

    try {
      switch (cmd) {
        case 'spawn': {
          if (!args[0]) { console.log('  Usage: spawn <path> [name]'); break; }
          const session = manager.spawn(args[0], args[1]);
          console.log(`  ✓ "${session.name}" started at ${session.path}`);
          console.log(`    tmux attach -t ${session.name}`);
          break;
        }
        case 'list': {
          const sessions = manager.list();
          if (!sessions.length) { console.log('  No sessions.'); break; }
          console.log('');
          sessions.forEach(s => {
            const { plain } = formatStatus(s);
            console.log(`  ${s.name.padEnd(22)} ${plain.padEnd(14)} ${s.path}`);
          });
          console.log('');
          break;
        }
        case 'watch': {
          const all = buildAllSessions(manager);
          if (!all.length) { console.log('  No sessions.'); break; }
          startWatch(manager, replRl);
          return;
        }
        case 'web': {
          const flags = args.filter(a => a.startsWith('--'));
          const positional = args.filter(a => !a.startsWith('--'));
          const port = parseInt(positional[0]) || 3742;
          const host = positional[1] || '127.0.0.1';
          const password = positional[2] || null;
          const useTunnel = flags.includes('--tunnel');
          let webServer = manager._webServer;
          if (webServer) {
            console.log(`  Web dashboard already running at http://${webServer.host}:${webServer.port}`);
            if (useTunnel && !webServer._tunnelProcess) {
              if (!has('cloudflared')) { console.log(`  cloudflared not found. Install: ${cloudflaredInstallCmd()}`); break; }
              if (!webServer.password) console.log('  ⚠  No password set — anyone with the URL can control your sessions!');
              console.log('  Starting cloudflared tunnel...');
              webServer.startTunnel().then(publicUrl => {
                console.log(`  ✓ Tunnel ready: ${publicUrl}`);
                console.log('    Note: first visit may show a Cloudflare warning — click "Proceed" to open the dashboard.');
                if (telegram.token && telegram.chatId) {
                  notifier.send(telegram.token, telegram.chatId,
                    `Claude Remote Pilot tunnel ready: ${publicUrl}${webServer.password ? ' (password protected)' : ' ⚠ no password set'}`);
                  console.log('  ✓ Tunnel URL sent via Telegram.');
                }
              }).catch(e => console.log(`  ✗ Tunnel failed: ${e.message}`));
            }
            break;
          }
          if (useTunnel && !has('cloudflared')) {
            console.log(`  cloudflared not found. Install:\n    ${cloudflaredInstallCmd()}`);
            break;
          }
          if (useTunnel && !password) console.log('  ⚠  No password set — anyone with the URL can control your sessions!');
          webServer = new WebServer(manager, port, host, password);
          manager._webServer = webServer;
          webServer.start();
          const url = `http://${host}:${port}`;
          console.log(`  ✓ Web dashboard started at ${url}`);
          if (password) console.log('  Password protection enabled.');
          const opener = process.platform === 'darwin' ? 'open' : 'xdg-open';
          spawn(opener, [url], { stdio: 'ignore', detached: true }).unref();
          if (useTunnel) {
            console.log('  Starting cloudflared tunnel...');
            webServer.startTunnel().then(publicUrl => {
              console.log(`  ✓ Tunnel ready: ${publicUrl}`);
              console.log('    Note: first visit may show a Cloudflare warning — click "Proceed" to open the dashboard.');
              if (!password) console.log('  ⚠  Reminder: add a password with: web <port> <host> <password> --tunnel');
              if (telegram.token && telegram.chatId) {
                notifier.send(telegram.token, telegram.chatId,
                  `Claude Remote Pilot tunnel ready: ${publicUrl}${password ? ' (password protected)' : ' ⚠ no password set'}`);
                console.log('  ✓ Tunnel URL sent via Telegram.');
              }
            }).catch(e => console.log(`  ✗ Tunnel failed: ${e.message}`));
          }
          break;
        }
        case 'attach': {
          if (!args[0]) { console.log('  Usage: attach <name>'); break; }
          replRl.pause();
          const child = spawn('tmux', ['attach-session', '-t', args[0]], { stdio: 'inherit' });
          child.on('exit', () => { process.stdout.write('\n'); replRl.resume(); replRl.prompt(); });
          return;
        }
        case 'kill': {
          if (!args[0]) { console.log('  Usage: kill <name>'); break; }
          manager.kill(args[0]);
          console.log(`  ✓ "${args[0]}" killed.`);
          break;
        }
        case 'resume': {
          if (args.length) {
            const resumeMsg = args.join(' ');
            manager.resumeCommand = resumeMsg;
            config.saveResumeCommand(resumeMsg);
            console.log(`  ✓ Resume message saved: "${resumeMsg}"`);
          } else {
            console.log(`  Current resume message: "${manager.resumeCommand || '(default)'}"`);
          }
          break;
        }
        case 'telegram': {
          const sub = positional[0];
          if (sub === 'on') {
            telegram.enabled = true;
            console.log('  ✓ Telegram notifications enabled.');
          } else if (sub === 'off') {
            telegram.enabled = false;
            console.log('  ✓ Telegram notifications disabled.');
          } else {
            const state = telegram.enabled !== false ? 'on' : 'off';
            const configured = telegram.token ? 'configured' : 'not configured';
            console.log(`  Telegram: ${state}  (${configured})`);
            console.log('  Usage: telegram on | telegram off');
          }
          break;
        }
        case 'help': {
          console.log(HELP);
          break;
        }
        case 'exit':
        case 'quit': {
          await handleExit(manager, replRl);
          return;
        }
        default:
          console.log(`  Unknown command: ${cmd}. Type help.`);
      }
    } catch (err) {
      console.error(`  Error: ${err.message}`);
    }

    replRl.prompt();
  });

  replRl.on('close', () => {
    console.log('\n  Sessions keep running. Use tmux to attach.\n');
    process.exit(0);
  });
}

main().catch(err => { console.error(err.message); process.exit(1); });
