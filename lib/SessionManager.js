'use strict';
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const Watcher = require('./Watcher');
const config = require('./config');

const RESERVED = new Set(['spawn', 'list', 'watch', 'attach', 'kill', 'help', 'exit', 'quit', 'resume']);

function sanitizeName(name) {
  return name.replace(/[.:\s]/g, '-');
}

class SessionManager {
  constructor({ telegram = {}, resumeCommand } = {}) {
    this.sessions = new Map();
    this.telegram = telegram;
    this.resumeCommand = resumeCommand;
  }

  _makeWatcher(session) {
    return new Watcher(session, {
      telegram: this.telegram,
      resumeCommand: this.resumeCommand,
      onEnded: (s) => this.sessions.delete(s.name),
    });
  }

  spawn(dirPath, name, command = 'claude') {
    const resolved = path.resolve(dirPath.replace(/^~/, process.env.HOME || ''));
    if (!fs.existsSync(resolved)) throw new Error(`Path not found: ${resolved}`);

    const sessionName = sanitizeName(name || path.basename(resolved));
    if (RESERVED.has(sessionName)) throw new Error(`"${sessionName}" is a reserved command name. Choose a different session name.`);
    if (this.sessions.has(sessionName)) throw new Error(`Session "${sessionName}" already exists.`);

    // Kill stale tmux session from a previous crashed run
    try {
      execSync(`tmux has-session -t "${sessionName}"`, { stdio: 'ignore' });
      execSync(`tmux kill-session -t "${sessionName}"`, { stdio: 'ignore' });
    } catch { }

    execSync(`tmux new-session -d -s "${sessionName}" -c "${resolved}" "${command}"`, { stdio: 'ignore' });

    const session = { name: sessionName, path: resolved, command, status: 'running', startedAt: new Date(), resumeAt: null };
    const watcher = this._makeWatcher(session);
    watcher.start();
    this.sessions.set(sessionName, { session, watcher });
    config.addToHistory(sessionName, resolved, command);
    return session;
  }

  respawn(name) {
    const h = config.getHistory().find(e => e.name === name);
    if (!h) throw new Error(`No history for session "${name}"`);
    return this.spawn(h.path, name, h.command || 'claude');
  }

  adopt(name, dirPath) {
    try { execSync(`tmux has-session -t "${name}"`, { stdio: 'ignore' }); }
    catch { throw new Error(`tmux session "${name}" not found.`); }

    if (this.sessions.has(name)) throw new Error(`Session "${name}" already being watched.`);

    const session = { name, path: dirPath, status: 'running', startedAt: new Date(), resumeAt: null };
    const watcher = this._makeWatcher(session);
    watcher.start();
    this.sessions.set(name, { session, watcher });
    config.addToHistory(name, dirPath);
    return session;
  }

  kill(name) {
    const entry = this.sessions.get(name);
    if (!entry) throw new Error(`Session "${name}" not found.`);
    entry.watcher.stop();
    try { execSync(`tmux kill-session -t "${name}"`, { stdio: 'ignore' }); } catch { }
    this.sessions.delete(name);
  }

  killAll() {
    for (const name of [...this.sessions.keys()]) {
      try { this.kill(name); } catch { }
    }
  }

  removeFromHistory(name) {
    if (this.sessions.has(name)) throw new Error(`Session "${name}" is still active. Kill it first.`);
    config.removeFromHistory(name);
  }

  list() {
    return [...this.sessions.values()].map(e => e.session);
  }
}

module.exports = SessionManager;
