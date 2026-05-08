'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync, spawn } = require('child_process');
const config = require('./config');


class WebServer {
  constructor(manager, port = 3742, host = '127.0.0.1', password = null) {
    this.manager = manager;
    this.port = port;
    this.host = host;
    this.password = password || null;
    this._token = password ? crypto.randomBytes(20).toString('hex') : null;
    this.startedAt = new Date();
    this.server = null;
    this._clients = new Set();
    this._broadcastInterval = null;
    this._heartbeatInterval = null;
    this._tunnelProcess = null;
    this._tunnelUrl = null;
    this._queues = new Map(); // name → { items: [{id,message}], autoFeed, pendingSend }
    this._sessionMeta = config.getAllSessionMeta(); // name → { emoji, color }
  }

  _buildAllSessions() {
    const active = this.manager.list();
    const activeNames = new Set(active.map(s => s.name));
    const history = config.getHistory();
    const offline = history
      .filter(h => !activeNames.has(h.name))
      .map(h => ({ name: h.name, path: h.path, status: 'offline', startedAt: h.lastSeen, resumeAt: null }));
    return [...active, ...offline].map(s => {
      const q = this._queues.get(s.name);
      const m = this._sessionMeta[s.name] || {};
      return {
        ...s, id: s.name,
        queueLength: q ? q.items.length : 0, autoFeed: q ? q.autoFeed : false,
        emoji: m.emoji || '', color: m.color || '',
      };
    });
  }

  _getQueue(name) {
    if (!this._queues.has(name)) {
      this._queues.set(name, { items: [], autoFeed: false, pendingSend: false });
    }
    return this._queues.get(name);
  }

  // Send a text message followed by Enter. Uses -l (literal) so message content
  // is never misinterpreted as tmux key sequences, then sends Enter separately.
  _tmuxSend(target, message) {
    spawnSync('tmux', ['send-keys', '-t', target, '-l', message]);
    spawnSync('tmux', ['send-keys', '-t', target, 'Enter']);
  }

  _getOutput(name) {
    const result = spawnSync('tmux', ['capture-pane', '-pt', name, '-e', '-S', '-500'], { encoding: 'utf8' });
    if (!result.stdout) return '';
    // Trim trailing whitespace from each line (tmux pads lines to terminal width)
    return result.stdout.split('\n').map(l => l.trimEnd()).join('\n');
  }

  _stripAnsi(text) {
    return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/\x1b[()][AB012]/g, '').replace(/\r/g, '');
  }

  _detectMenuOptionsFromText(text) {
    const plain = this._stripAnsi(text);
    const lines = plain.split('\n').slice(-50);
    const found = new Map();
    for (const line of lines) {
      const m = line.match(/^\s*(?:[❯>◆│]\s*)?(\d+)[.)]\s+(.+?)\s*$/);
      if (m) {
        const num = parseInt(m[1], 10);
        const label = m[2].replace(/\s*\(esc\)\s*$/i, '').trim();
        if (num >= 1 && num <= 9 && label) found.set(num, label);
      }
    }
    if (found.size < 2) return [];
    const opts = [...found.entries()].sort((a, b) => a[0] - b[0]).map(([num, label]) => ({ num, label }));
    if (opts[0].num !== 1) return [];
    for (let i = 0; i < opts.length; i++) if (opts[i].num !== i + 1) return [];
    return opts;
  }

  async _detectMenuWithOllama(text) {
    const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
    const model = process.env.OLLAMA_MODEL || 'phi3:mini';
    const lines = this._stripAnsi(text).split('\n').slice(-30).join('\n');
    const resp = await fetch(`${ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: `Extract numbered menu options from this terminal output. Reply with ONLY a JSON array like [{"num":1,"label":"Yes"},{"num":2,"label":"No"}]. If no menu found, reply []. Nothing else.\n\n${lines}`,
        stream: false,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return [];
    const data = await resp.json();
    const raw = (data.response || '').trim();
    const match = raw.match(/\[[\s\S]*?\]/);
    if (!match) return [];
    try {
      const parsed = JSON.parse(match[0]);
      return Array.isArray(parsed)
        ? parsed.filter(o => typeof o.num === 'number' && o.num >= 1 && o.num <= 9 && typeof o.label === 'string' && o.label)
        : [];
    } catch { return []; }
  }

  _json(res, code, data) {
    res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(data));
  }

  _readBody(req, cb) {
    let raw = '';
    req.on('data', d => raw += d);
    req.on('end', () => {
      try { cb(null, JSON.parse(raw || '{}')); }
      catch { cb(new Error('Invalid JSON')); }
    });
  }

  // Returns true if authorized (or no password set). Sends 401 and returns false otherwise.
  _checkAuth(req, res, url) {
    if (!this.password) return true;
    const authHeader = req.headers['authorization'];
    if (authHeader === `Bearer ${this._token}`) return true;
    if (url && url.searchParams.get('token') === this._token) return true;
    this._json(res, 401, { error: 'Unauthorized' });
    return false;
  }

  _handleApi(req, res, pathname, url) {
    // POST /api/login — no auth required
    if (req.method === 'POST' && pathname === '/api/login') {
      return this._readBody(req, (err, body) => {
        if (err) return this._json(res, 400, { error: err.message });
        if (!this.password) return this._json(res, 200, { token: null });
        if (body.password !== this.password) return this._json(res, 401, { error: 'Wrong password' });
        return this._json(res, 200, { token: this._token });
      });
    }

    // All other API routes require auth
    if (!this._checkAuth(req, res, url)) return;

    // GET /api/sessions
    if (req.method === 'GET' && pathname === '/api/sessions') {
      return this._json(res, 200, this._buildAllSessions());
    }

    // GET /api/status
    if (req.method === 'GET' && pathname === '/api/status') {
      return this._json(res, 200, {
        startedAt: this.startedAt,
        port: this.port,
        activeSessions: this.manager.list().length,
      });
    }

    // POST /api/sessions — spawn
    if (req.method === 'POST' && pathname === '/api/sessions') {
      return this._readBody(req, (err, body) => {
        if (err) return this._json(res, 400, { error: err.message });
        const { name, path: dirPath, prompt: initialPrompt, command } = body;
        try {
          const session = this.manager.spawn(dirPath, name, command || 'claude');
          if (initialPrompt) {
            setTimeout(() => this._tmuxSend(session.name, initialPrompt), 2000);
          }
          this._json(res, 201, { ...session, id: session.name });
        } catch (e) {
          this._json(res, 400, { error: e.message });
        }
      });
    }

    // POST /api/sessions/:name/respawn
    const respawnMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/respawn$/);
    if (req.method === 'POST' && respawnMatch) {
      const name = decodeURIComponent(respawnMatch[1]);
      try {
        const session = this.manager.respawn(name);
        return this._json(res, 200, { ...session, id: session.name });
      } catch (e) {
        return this._json(res, 400, { error: e.message });
      }
    }

    // GET /api/sessions/:name/output
    const outputMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/output$/);
    if (req.method === 'GET' && outputMatch) {
      const name = decodeURIComponent(outputMatch[1]);
      return this._json(res, 200, { output: this._getOutput(name) });
    }

    // POST /api/sessions/:name/send
    const sendMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/send$/);
    if (req.method === 'POST' && sendMatch) {
      const name = decodeURIComponent(sendMatch[1]);
      return this._readBody(req, (err, body) => {
        if (err) return this._json(res, 400, { error: err.message });
        const { message, key } = body;
        if (key) {
          spawnSync('tmux', ['send-keys', '-t', name, key]);
          return this._json(res, 200, { ok: true });
        }
        if (!message) return this._json(res, 400, { error: 'message or key required' });
        this._tmuxSend(name, message);
        this._json(res, 200, { ok: true });
      });
    }

    // Queue routes — GET|POST|PATCH /api/sessions/:name/queue
    const queueBaseMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/queue$/);
    if (queueBaseMatch) {
      const name = decodeURIComponent(queueBaseMatch[1]);
      if (req.method === 'GET') {
        const q = this._getQueue(name);
        return this._json(res, 200, { items: q.items, autoFeed: q.autoFeed });
      }
      if (req.method === 'POST') {
        return this._readBody(req, (err, body) => {
          if (err) return this._json(res, 400, { error: err.message });
          if (!body.message) return this._json(res, 400, { error: 'message required' });
          const q = this._getQueue(name);
          const item = { id: crypto.randomBytes(4).toString('hex'), message: body.message };
          q.items.push(item);
          return this._json(res, 201, { item });
        });
      }
      if (req.method === 'PATCH') {
        return this._readBody(req, (err, body) => {
          if (err) return this._json(res, 400, { error: err.message });
          const q = this._getQueue(name);
          if (typeof body.autoFeed === 'boolean') {
            q.autoFeed = body.autoFeed;
            if (!body.autoFeed) q.pendingSend = false;
          }
          return this._json(res, 200, { autoFeed: q.autoFeed });
        });
      }
    }

    // POST /api/sessions/:name/queue/play — send and dequeue first item
    const queuePlayMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/queue\/play$/);
    if (req.method === 'POST' && queuePlayMatch) {
      const name = decodeURIComponent(queuePlayMatch[1]);
      const q = this._queues.get(name);
      if (!q || !q.items.length) return this._json(res, 400, { error: 'Queue is empty' });
      const item = q.items.shift();
      this._tmuxSend(name, item.message);
      return this._json(res, 200, { ok: true, item });
    }

    // PATCH /api/sessions/:name/meta — save emoji / color label
    const metaMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/meta$/);
    if (req.method === 'PATCH' && metaMatch) {
      const name = decodeURIComponent(metaMatch[1]);
      return this._readBody(req, (err, body) => {
        if (err) return this._json(res, 400, { error: err.message });
        const patch = {};
        if (body.emoji !== undefined) patch.emoji = String(body.emoji).slice(0, 8);
        if (body.color !== undefined) patch.color = String(body.color).slice(0, 20);
        this._sessionMeta[name] = { ...(this._sessionMeta[name] || {}), ...patch };
        config.saveSessionMeta(name, patch);
        return this._json(res, 200, { ok: true });
      });
    }

    // DELETE /api/sessions/:name/queue/:id — remove a specific queued item
    const queueItemMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/queue\/([^/]+)$/);
    if (req.method === 'DELETE' && queueItemMatch) {
      const name = decodeURIComponent(queueItemMatch[1]);
      const id = queueItemMatch[2];
      const q = this._queues.get(name);
      if (q) q.items = q.items.filter(it => it.id !== id);
      return this._json(res, 200, { ok: true });
    }

    // DELETE /api/sessions/:name
    const killMatch = pathname.match(/^\/api\/sessions\/([^/]+)$/);
    if (req.method === 'DELETE' && killMatch) {
      const name = decodeURIComponent(killMatch[1]);
      try {
        this.manager.kill(name);
        return this._json(res, 200, { ok: true });
      } catch (e) {
        return this._json(res, 400, { error: e.message });
      }
    }

    // GET /api/sessions/:name/menu — detect numbered choice menu; uses ollama if OLLAMA_URL is set
    const menuMatch2 = pathname.match(/^\/api\/sessions\/([^/]+)\/menu$/);
    if (req.method === 'GET' && menuMatch2) {
      const name = decodeURIComponent(menuMatch2[1]);
      const output = this._getOutput(name);
      const options = this._detectMenuOptionsFromText(output);
      if (options.length >= 2 || !process.env.OLLAMA_URL) {
        return this._json(res, 200, { options, source: 'regex' });
      }
      this._detectMenuWithOllama(output)
        .then(opts => this._json(res, 200, { options: opts, source: 'model' }))
        .catch(() => this._json(res, 200, { options, source: 'regex' }));
      return;
    }

    // POST /api/broadcast
    if (req.method === 'POST' && pathname === '/api/broadcast') {
      return this._readBody(req, (err, body) => {
        if (err) return this._json(res, 400, { error: err.message });
        const { message } = body;
        if (!message) return this._json(res, 400, { error: 'message required' });
        const sessions = this.manager.list().filter(s => s.status !== 'offline');
        for (const s of sessions) {
          spawnSync('tmux', ['send-keys', '-t', s.name, message, 'Enter'], { stdio: 'ignore' });
        }
        return this._json(res, 200, { ok: true, sent: sessions.length });
      });
    }

    this._json(res, 404, { error: 'Not found' });
  }

  _broadcast() {
    // Auto-feed: send the next queued message when a session becomes idle/waiting
    for (const session of this.manager.list()) {
      const q = this._queues.get(session.name);
      if (!q || !q.autoFeed || !q.items.length) {
        if (q && session.status !== 'idle' && session.status !== 'needs-response') q.pendingSend = false;
        continue;
      }
      const isWaiting = session.status === 'idle' || session.status === 'needs-response';
      if (isWaiting && !q.pendingSend) {
        q.pendingSend = true;
        const item = q.items.shift();
        this._tmuxSend(session.name, item.message);
      } else if (!isWaiting) {
        q.pendingSend = false;
      }
    }

    if (!this._clients.size) return;
    const payload = `data: ${JSON.stringify(this._buildAllSessions())}\n\n`;
    for (const res of this._clients) {
      try { res.write(payload); } catch { this._clients.delete(res); }
    }
  }

  start() {
    const uiHtml = fs.readFileSync(path.join(__dirname, 'ui.html'), 'utf8');

    this.server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://127.0.0.1:${this.port}`);
      const pathname = url.pathname;

      if (pathname === '/' || pathname === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(uiHtml);
      }

      if (pathname === '/events') {
        if (!this._checkAuth(req, res, url)) return;
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no',  // prevent Cloudflare/nginx from buffering the stream
        });
        this._clients.add(res);
        res.write(`data: ${JSON.stringify(this._buildAllSessions())}\n\n`);
        req.on('close', () => this._clients.delete(res));
        return;
      }

      if (pathname.startsWith('/api/')) {
        return this._handleApi(req, res, pathname, url);
      }

      res.writeHead(404);
      res.end('Not found');
    });

    this._broadcastInterval = setInterval(() => this._broadcast(), 3000);
    // Keep SSE connections alive through proxies (Cloudflare timeout is ~100s)
    this._heartbeatInterval = setInterval(() => {
      for (const res of this._clients) {
        try { res.write(': heartbeat\n\n'); } catch { this._clients.delete(res); }
      }
    }, 20000);
    this.server.listen(this.port, this.host);
    return this.port;
  }

  startTunnel() {
    return new Promise((resolve, reject) => {
      const cf = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${this.port}`], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      this._tunnelProcess = cf;
      let resolved = false;
      const onData = (chunk) => {
        const text = chunk.toString();
        const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
        if (match && !resolved) {
          resolved = true;
          this._tunnelUrl = match[0];
          resolve(match[0]);
        }
      };
      cf.stdout.on('data', onData);
      cf.stderr.on('data', onData);
      cf.on('exit', (code) => {
        if (!resolved) reject(new Error(`cloudflared exited (code ${code})`));
      });
      setTimeout(() => {
        if (!resolved) reject(new Error('Timed out waiting for tunnel URL (30s)'));
      }, 30000);
    });
  }

  stopTunnel() {
    if (this._tunnelProcess) {
      try { this._tunnelProcess.kill(); } catch {}
      this._tunnelProcess = null;
      this._tunnelUrl = null;
    }
  }

  stop() {
    this.stopTunnel();
    clearInterval(this._broadcastInterval);
    clearInterval(this._heartbeatInterval);
    for (const res of this._clients) { try { res.end(); } catch {} }
    this._clients.clear();
    if (this.server) this.server.close();
  }
}

module.exports = WebServer;
