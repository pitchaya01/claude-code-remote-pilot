'use strict';
const { execSync, spawnSync } = require('child_process');
const crypto = require('crypto');
const notifier = require('./notifier');

const LIMIT_RE = /hit your limit|usage limit|rate limit|limit reached|try again after/i;
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
    this.onEnded = opts.onEnded || (() => { });
    this.checkInterval = opts.checkInterval || 5000;
    this.fallbackWait = opts.fallbackWait || 300;
    this.cooldown = opts.cooldown || 180;
    this.captureLines = opts.captureLines || 500;
    this.resumeCommand = opts.resumeCommand || 'The usage limit has reset. Please continue where you left off.';
    this.lastHash = '';
    this.lastResumeAt = 0;
    this._lastNeedsResponseNotify = 0;
    this._timer = null;
    this._needsResponseTimer = null;
    this._busy = false;
  }

  _stripAnsi(text) {
    return text.replace(/\x1b\[[0-9;]*[mGKHFABCDJsuhl]/g, '').replace(/\x1b[()][AB012]/g, '');
  }

  start() {
    this._check(); // run immediately so status is correct from the first second
    this._timer = setInterval(() => this._check(), this.checkInterval);
  }

  stop() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
    if (this._needsResponseTimer) clearTimeout(this._needsResponseTimer);
    this._needsResponseTimer = null;
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

  _parseResetAtMs(text) {
    const atMatch = text.match(RESET_AT_RE);
    if (atMatch) {
      const raw = atMatch[1].trim().toLowerCase();
      const m = raw.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/);
      if (m) {
        let hour = parseInt(m[1], 10);
        const minute = parseInt(m[2], 10);
        const suffix = m[3];
        if (suffix === 'pm' && hour !== 12) hour += 12;
        if (suffix === 'am' && hour === 12) hour = 0;

        const now = new Date();
        const resetAt = new Date(now);
        resetAt.setHours(hour, minute, 0, 0);
        if (resetAt.getTime() <= now.getTime()) {
          resetAt.setDate(resetAt.getDate() + 1);
        }
        return resetAt.getTime();
      }
    }

    const inMatch = text.match(/(?:try again|retry|wait).*?in\s+(\d+)\s*(second|minute|hour)/i);
    if (!inMatch) return null;
    const v = parseInt(inMatch[1], 10);
    const mult = inMatch[2].startsWith('second') ? 1 : inMatch[2].startsWith('minute') ? 60 : 3600;
    return Date.now() + (v * mult * 1000);
  }

  async _check() {
    if (this._busy) return;
    this._busy = true;
    try {
      try { execSync(`tmux has-session -t "${this.session.name}"`, { stdio: 'ignore' }); }
      catch {
        this.stop();
        this.onEnded(this.session);
        if (this.telegram.enabled !== false)
          notifier.send(this.telegram.token, this.telegram.chatId,
            `Pilot: session "${this.session.name}" ended.`);
        return;
      }

      const raw = this._capture();
      const text = this._stripAnsi(raw);
      const nonEmptyLines = text.split('\n').filter(l => l.trim());
      const recentLines = nonEmptyLines.slice(-5).join('\n');
      const limitWindow = nonEmptyLines.slice(-15).join('\n');

      // Extract token usage from footer whenever visible
      const tokenMatch = recentLines.match(TOKEN_RE);
      if (tokenMatch) {
        this.session.tokens = { sent: tokenMatch[1], received: tokenMatch[2] };
      }

      if (RUNNING_RE.test(recentLines)) {
        if (this.session.status !== 'running') {
          this.session.status = 'running';
          this.session.resumeAt = null;
          if (this._needsResponseTimer) { clearTimeout(this._needsResponseTimer); this._needsResponseTimer = null; }
        }
      } else if (LIMIT_RE.test(limitWindow)) {
        if (this._needsResponseTimer) { clearTimeout(this._needsResponseTimer); this._needsResponseTimer = null; }
        await this._handleLimit(limitWindow);
      } else if (RESPONSE_RE.test(recentLines)) {
        if (this.session.status !== 'needs-response') {
          this.session.status = 'needs-response';
          if (this.telegram.enabled !== false && !this._needsResponseTimer) {
            this._needsResponseTimer = setTimeout(() => {
              this._needsResponseTimer = null;
              if (this.session.status !== 'needs-response') return;
              if (this.telegram.enabled === false) return;
              const now = Date.now();
              if (now - this._lastNeedsResponseNotify < 60000) return;
              this._lastNeedsResponseNotify = now;
              const url = this.telegram.dashboardUrl ? `\n${this.telegram.dashboardUrl}` : '';
              notifier.send(this.telegram.token, this.telegram.chatId,
                `Pilot: "${this.session.name}" needs your response.${url}`);
            }, 30000);
          }
        }
      } else {
        // No "esc to interrupt" visible — Claude is not actively processing
        if (this.session.status !== 'idle') {
          this.session.status = 'idle';
          this.session.resumeAt = null;
          if (this._needsResponseTimer) { clearTimeout(this._needsResponseTimer); this._needsResponseTimer = null; }
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
    const resetAtMs = this._parseResetAtMs(text);
    const resetTime = this._parseResetTime(text);
    const effectiveResumeAtMs = resetAtMs || (Date.now() + wait * 1000);
    const effectiveWaitSeconds = Math.max(1, Math.ceil((effectiveResumeAtMs - Date.now()) / 1000));

    this.session.status = 'limit';
    this.session.resumeAt = effectiveResumeAtMs;
    this.session.resetTime = resetTime;

    if (this.telegram.enabled !== false) {
      const url = this.telegram.dashboardUrl ? `\n${this.telegram.dashboardUrl}` : '';
      notifier.send(this.telegram.token, this.telegram.chatId,
        `Pilot: limit in "${this.session.name}". Resets ${resetTime || `in ${Math.ceil(effectiveWaitSeconds / 60)}m`}.${url}`);
    }

    await new Promise(r => setTimeout(r, effectiveWaitSeconds * 1000));

    try { spawnSync('tmux', ['send-keys', '-t', this.session.name, this.resumeCommand, 'Enter'], { stdio: 'ignore' }); }
    catch { }

    this.lastResumeAt = Date.now() / 1000;
    this.session.status = 'running';
    this.session.resumeAt = null;
    this.session.resetTime = null;

    if (this.telegram.enabled !== false)
      notifier.send(this.telegram.token, this.telegram.chatId,
        `Pilot: resumed "${this.session.name}".`);
  }
}

module.exports = Watcher;
