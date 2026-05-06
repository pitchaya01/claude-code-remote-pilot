'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
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
  }

  _buildAllSessions() {
    const active = this.manager.list();
    const activeNames = new Set(active.map(s => s.name));
    const history = config.getHistory();
    const offline = history
      .filter(h => !activeNames.has(h.name))
      .map(h => ({ name: h.name, path: h.path, status: 'offline', startedAt: h.lastSeen, resumeAt: null }));
    return [...active, ...offline].map(s => ({ ...s, id: s.name }));
  }

  _getOutput(name) {
    const result = spawnSync('tmux', ['capture-pane', '-pt', name, '-e', '-S', '-500'], { encoding: 'utf8' });
    if (!result.stdout) return '';
    // Trim trailing whitespace from each line (tmux pads lines to terminal width)
    return result.stdout.split('\n').map(l => l.trimEnd()).join('\n');
  }

  _json(res, code, data) {
    res.writeHead(code, { 'Content-Type': 'application/json' });
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
        const { name, path: dirPath, prompt: initialPrompt } = body;
        try {
          const session = this.manager.spawn(dirPath, name);
          if (initialPrompt) {
            setTimeout(() => {
              spawnSync('tmux', ['send-keys', '-t', session.name, initialPrompt, 'Enter']);
            }, 2000);
          }
          this._json(res, 201, { ...session, id: session.name });
        } catch (e) {
          this._json(res, 400, { error: e.message });
        }
      });
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
        spawnSync('tmux', ['send-keys', '-t', name, message, 'Enter']);
        this._json(res, 200, { ok: true });
      });
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
    this.server.listen(this.port, this.host);
    return this.port;
  }

  stop() {
    clearInterval(this._broadcastInterval);
    for (const res of this._clients) { try { res.end(); } catch {} }
    this._clients.clear();
    if (this.server) this.server.close();
  }
}

module.exports = WebServer;
