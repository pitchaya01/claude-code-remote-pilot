'use strict';
const { execSync } = require('child_process');
const crypto = require('crypto');
const notifier = require('./notifier');

const LIMIT_RE = /hit your limit|usage limit|rate limit|limit reached|try again|resets/i;
const RESPONSE_RE = /do you want to proceed|esc to cancel|ctrl\+e to explain|❯\s*\d+\.\s*yes/i;
const RUNNING_RE = /esc to interrupt/i;
// Claude Code footer: "tokens: ↑1,234 ↓567" or "↑1.2k ↓890"
const TOKEN_RE = /↑\s*([\d.,]+[km]?)\s*↓\s*([\d.,]+[km]?)/i;
// Limit reset time: "resets at 2:00 AM" or "resets at 14:30"
const RESET_AT_RE = /resets?\s+(?:at\s+)?(\d{1,2}:\d{2}\s*(?:am|pm)?)/i;

class Watcher {
  constructor(session, opts = {}) {
    this.session = session;
    this.telegram = opts.telegram || {};
    this.onEnded = opts.onEnded || (() => {});
    this.checkInterval = opts.checkInterval || 5000;
    this.fallbackWait = opts.fallbackWait || 300;
    this.cooldown = opts.cooldown || 180;
    this.captureLines = opts.captureLines || 500;
    this.resumeCommand = opts.resumeCommand || 'The usage limit has reset. Please continue where you left off.';
    this.lastHash = '';
    this.lastResumeAt = 0;
    this._timer = null;
    this._busy = false;
  }

  _stripAnsi(text) {
    return text.replace(/\x1b\[[0-9;]*[mGKHFABCDJsuhl]/g, '').replace(/\x1b[()][AB012]/g, '');
  }

  start() {
    this._timer = setInterval(() => this._check(), this.checkInterval);
  }

  stop() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  }

  _capture() {
    try {
      return execSync(
        `tmux capture-pane -pt "${this.session.name}" -S "-${this.captureLines}"`,
        { encoding: 'utf8' }
      );
    } catch { return ''; }
  }

  _hash(text) {
    return crypto.createHash('sha256').update(text.slice(-2000)).digest('hex');
  }

  _parseWait(text) {
    const m = text.match(/(?:try again|retry|wait).*?in\s+(\d+)\s*(second|minute|hour)/i);
    if (m) {
      const v = parseInt(m[1]);
      if (m[2].startsWith('second')) return Math.max(10, v);
      if (m[2].startsWith('minute')) return Math.max(10, v * 60);
      return Math.max(10, v * 3600);
    }
    return this.fallbackWait;
  }

  _parseResetTime(text) {
    // "resets at 2:00 AM"
    const atMatch = text.match(RESET_AT_RE);
    if (atMatch) return atMatch[1].trim().toUpperCase();
    // "try again in X minutes" — calculate clock time
    const inMatch = text.match(/(?:try again|retry|wait).*?in\s+(\d+)\s*(second|minute|hour)/i);
    if (inMatch) {
      const v = parseInt(inMatch[1]);
      const mult = inMatch[2].startsWith('second') ? 1 : inMatch[2].startsWith('minute') ? 60 : 3600;
      const resetMs = Date.now() + v * mult * 1000;
      return new Date(resetMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return null;
  }

  async _check() {
    if (this._busy) return;
    this._busy = true;
    try {
      try { execSync(`tmux has-session -t "${this.session.name}"`, { stdio: 'ignore' }); }
      catch {
        this.stop();
        this.onEnded(this.session);
        notifier.send(this.telegram.token, this.telegram.chatId,
          `Pilot: session "${this.session.name}" ended.`);
        return;
      }

      const raw = this._capture();
      const text = this._stripAnsi(raw);
      const nonEmptyLines = text.split('\n').filter(l => l.trim());
      const recentLines = nonEmptyLines.slice(-5).join('\n');

      // Extract token usage from footer whenever visible
      const tokenMatch = recentLines.match(TOKEN_RE);
      if (tokenMatch) {
        this.session.tokens = { sent: tokenMatch[1], received: tokenMatch[2] };
      }

      if (LIMIT_RE.test(text)) {
        await this._handleLimit(text);
      } else if (RESPONSE_RE.test(recentLines)) {
        if (this.session.status !== 'needs-response') {
          this.session.status = 'needs-response';
          notifier.send(this.telegram.token, this.telegram.chatId,
            `Pilot: "${this.session.name}" needs your response.`);
        }
      } else if (RUNNING_RE.test(recentLines)) {
        if (this.session.status !== 'running') {
          this.session.status = 'running';
          this.session.resumeAt = null;
        }
      } else {
        // No "esc to interrupt" visible — Claude is not actively processing
        if (this.session.status !== 'idle') {
          this.session.status = 'idle';
          this.session.resumeAt = null;
        }
      }
    } finally {
      this._busy = false;
    }
  }

  async _handleLimit(text) {
    const hash = this._hash(text);
    if (hash === this.lastHash) return;
    if ((Date.now() / 1000) - this.lastResumeAt < this.cooldown) return;

    this.lastHash = hash;
    const wait = this._parseWait(text);
    const resetTime = this._parseResetTime(text);

    this.session.status = 'limit';
    this.session.resumeAt = Date.now() + wait * 1000;
    this.session.resetTime = resetTime;

    notifier.send(this.telegram.token, this.telegram.chatId,
      `Pilot: limit in "${this.session.name}". Resets ${resetTime || `in ${Math.ceil(wait / 60)}m`}.`);

    await new Promise(r => setTimeout(r, wait * 1000));

    try { execSync(`tmux send-keys -t "${this.session.name}" "${this.resumeCommand}" Enter`, { stdio: 'ignore' }); }
    catch {}

    this.lastResumeAt = Date.now() / 1000;
    this.session.status = 'running';
    this.session.resumeAt = null;
    this.session.resetTime = null;

    notifier.send(this.telegram.token, this.telegram.chatId,
      `Pilot: resumed "${this.session.name}".`);
  }
}

module.exports = Watcher;
