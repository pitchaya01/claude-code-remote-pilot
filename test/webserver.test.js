'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const os = require('os');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// ── helpers ──────────────────────────────────────────────────────────────────

function tmpConfigPath() {
  return path.join(os.tmpdir(), `ccp-ws-test-${process.pid}-${Date.now()}.json`);
}

/** Build a minimal mock manager that WebServer needs. */
function makeMockManager(sessions = []) {
  return {
    sessions,
    list() { return sessions; },
    spawn(dirPath, name) {
      const s = { name: name || path.basename(dirPath), path: dirPath, status: 'running', startedAt: new Date(), resumeAt: null };
      sessions.push(s);
      return s;
    },
    kill(name) {
      const idx = sessions.findIndex(s => s.name === name);
      if (idx === -1) throw new Error(`Session "${name}" not found.`);
      sessions.splice(idx, 1);
    },
    respawn(name) {
      throw new Error(`No history for session "${name}"`);
    },
  };
}

/** Start a WebServer on a random port, return { server, port, close }. */
function startServer(manager, password = null, configPath) {
  if (configPath) process.env.CCP_CONFIG_PATH = configPath;

  // Re-require config so CONFIG_PATH picks up the env var
  const cfgKey = require.resolve('../lib/config');
  delete require.cache[cfgKey];

  const wsKey = require.resolve('../lib/WebServer');
  delete require.cache[wsKey];
  const WebServer = require('../lib/WebServer');

  const ws = new WebServer(manager, 0, '127.0.0.1', password);
  // Stub out tmux calls
  ws._tmuxSend = () => {};
  ws._getOutput = () => '';

  const port = ws.start();

  return new Promise((resolve) => {
    ws.server.once('listening', () => {
      const actualPort = ws.server.address().port;
      resolve({
        ws,
        port: actualPort,
        close() {
          ws.stop();
          if (configPath) {
            try { fs.unlinkSync(configPath); } catch {}
          }
        },
      });
    });
    // If already listening (synchronous listen on port 0 may fire before 'listening' event is added)
    if (ws.server.listening) {
      const actualPort = ws.server.address().port;
      resolve({
        ws,
        port: actualPort,
        close() {
          ws.stop();
          if (configPath) {
            try { fs.unlinkSync(configPath); } catch {}
          }
        },
      });
    }
  });
}

/** Simple HTTP helper — returns { status, body (parsed JSON) }. */
function req(port, method, pathname, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: '127.0.0.1',
      port,
      path: pathname,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...headers,
      },
    };
    const r = http.request(opts, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });
}

// ── tests ────────────────────────────────────────────────────────────────────

test('GET / returns HTML', async () => {
  const p = tmpConfigPath();
  const { port, close } = await startServer(makeMockManager(), null, p);
  try {
    const result = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/`, (res) => {
        let data = '';
        res.on('data', d => data += d);
        res.on('end', () => resolve({ status: res.statusCode, ct: res.headers['content-type'], body: data }));
      }).on('error', reject);
    });
    assert.equal(result.status, 200);
    assert.ok(result.ct.includes('text/html'));
    assert.ok(result.body.includes('<html'));
  } finally { close(); }
});

test('GET /api/sessions returns array when no password', async () => {
  const p = tmpConfigPath();
  const { port, close } = await startServer(makeMockManager(), null, p);
  try {
    const { status, body } = await req(port, 'GET', '/api/sessions');
    assert.equal(status, 200);
    assert.ok(Array.isArray(body));
  } finally { close(); }
});

test('GET /api/sessions returns 401 without token when password set', async () => {
  const p = tmpConfigPath();
  const { port, close } = await startServer(makeMockManager(), 'secret', p);
  try {
    const { status } = await req(port, 'GET', '/api/sessions', null, { 'X-Forwarded-For': '203.0.113.10' });
    assert.equal(status, 401);
  } finally { close(); }
});

test('POST /api/login with correct password returns token', async () => {
  const p = tmpConfigPath();
  const { port, ws, close } = await startServer(makeMockManager(), 'secret', p);
  try {
    const { status, body } = await req(port, 'POST', '/api/login', { password: 'secret' });
    assert.equal(status, 200);
    assert.equal(body.token, ws._token);
  } finally { close(); }
});

test('POST /api/login with wrong password returns 401', async () => {
  const p = tmpConfigPath();
  const { port, close } = await startServer(makeMockManager(), 'secret', p);
  try {
    const { status } = await req(port, 'POST', '/api/login', { password: 'wrong' });
    assert.equal(status, 401);
  } finally { close(); }
});

test('Bearer token allows access to protected routes', async () => {
  const p = tmpConfigPath();
  const { port, ws, close } = await startServer(makeMockManager(), 'secret', p);
  try {
    const { status, body } = await req(port, 'GET', '/api/sessions', null, {
      'Authorization': `Bearer ${ws._token}`,
    });
    assert.equal(status, 200);
    assert.ok(Array.isArray(body));
  } finally { close(); }
});

test('sessions list includes queueLength, autoFeed, emoji, color fields', async () => {
  const p = tmpConfigPath();
  const manager = makeMockManager([
    { name: 'my-sess', path: '/tmp', status: 'running', startedAt: new Date(), resumeAt: null },
  ]);
  const { port, close } = await startServer(manager, null, p);
  try {
    const { status, body } = await req(port, 'GET', '/api/sessions');
    assert.equal(status, 200);
    assert.equal(body.length, 1);
    const sess = body[0];
    assert.equal(sess.id, 'my-sess');
    assert.equal(typeof sess.queueLength, 'number');
    assert.equal(typeof sess.autoFeed, 'boolean');
    assert.equal(typeof sess.emoji, 'string');
    assert.equal(typeof sess.color, 'string');
  } finally { close(); }
});

test('GET /api/sessions/:name/queue returns empty queue', async () => {
  const p = tmpConfigPath();
  const manager = makeMockManager([
    { name: 'sess', path: '/tmp', status: 'running', startedAt: new Date(), resumeAt: null },
  ]);
  const { port, close } = await startServer(manager, null, p);
  try {
    const { status, body } = await req(port, 'GET', '/api/sessions/sess/queue');
    assert.equal(status, 200);
    assert.deepEqual(body.items, []);
    assert.equal(body.autoFeed, false);
  } finally { close(); }
});

test('POST /api/sessions/:name/queue enqueues a message', async () => {
  const p = tmpConfigPath();
  const { port, ws, close } = await startServer(makeMockManager(), null, p);
  try {
    const { status, body } = await req(port, 'POST', '/api/sessions/sess/queue', { message: 'hello' });
    assert.equal(status, 201);
    assert.equal(body.item.message, 'hello');
    assert.ok(body.item.id);
    assert.equal(ws._queues.get('sess').items.length, 1);
  } finally { close(); }
});

test('DELETE /api/sessions/:name/queue/:id removes item', async () => {
  const p = tmpConfigPath();
  const { port, ws, close } = await startServer(makeMockManager(), null, p);
  try {
    const { body: added } = await req(port, 'POST', '/api/sessions/sess/queue', { message: 'x' });
    const id = added.item.id;
    const { status } = await req(port, 'DELETE', `/api/sessions/sess/queue/${id}`);
    assert.equal(status, 200);
    assert.equal(ws._queues.get('sess').items.length, 0);
  } finally { close(); }
});

test('PATCH /api/sessions/:name/queue sets autoFeed', async () => {
  const p = tmpConfigPath();
  const { port, ws, close } = await startServer(makeMockManager(), null, p);
  try {
    const { status, body } = await req(port, 'PATCH', '/api/sessions/sess/queue', { autoFeed: true });
    assert.equal(status, 200);
    assert.equal(body.autoFeed, true);
    assert.equal(ws._queues.get('sess').autoFeed, true);
  } finally { close(); }
});

test('POST /api/sessions/:name/queue/play sends and dequeues first item', async () => {
  const p = tmpConfigPath();
  const { port, ws, close } = await startServer(makeMockManager(), null, p);
  const sent = [];
  ws._tmuxSend = (name, msg) => sent.push({ name, msg });
  try {
    await req(port, 'POST', '/api/sessions/sess/queue', { message: 'task one' });
    await req(port, 'POST', '/api/sessions/sess/queue', { message: 'task two' });
    const { status, body } = await req(port, 'POST', '/api/sessions/sess/queue/play');
    assert.equal(status, 200);
    assert.equal(body.item.message, 'task one');
    assert.equal(ws._queues.get('sess').items.length, 1);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].msg, 'task one');
  } finally { close(); }
});

test('POST /api/sessions/:name/queue/play on empty queue returns 400', async () => {
  const p = tmpConfigPath();
  const { port, close } = await startServer(makeMockManager(), null, p);
  try {
    const { status } = await req(port, 'POST', '/api/sessions/sess/queue/play');
    assert.equal(status, 400);
  } finally { close(); }
});

test('PATCH /api/sessions/:name/meta saves emoji and color', async () => {
  const p = tmpConfigPath();
  const manager = makeMockManager([
    { name: 'my-sess', path: '/tmp', status: 'running', startedAt: new Date(), resumeAt: null },
  ]);
  const { port, ws, close } = await startServer(manager, null, p);
  try {
    const { status } = await req(port, 'PATCH', '/api/sessions/my-sess/meta', { emoji: '🔧', color: '#ef4444' });
    assert.equal(status, 200);
    assert.equal(ws._sessionMeta['my-sess'].emoji, '🔧');
    assert.equal(ws._sessionMeta['my-sess'].color, '#ef4444');
    // Verify sessions list reflects the meta
    const { body } = await req(port, 'GET', '/api/sessions');
    const sess = body.find(s => s.name === 'my-sess');
    assert.equal(sess.emoji, '🔧');
    assert.equal(sess.color, '#ef4444');
  } finally { close(); }
});

test('auto-feed sends next item when session becomes idle', () => {
  // Unit-test the _broadcast() logic directly without HTTP
  const p = tmpConfigPath();
  process.env.CCP_CONFIG_PATH = p;
  const cfgKey = require.resolve('../lib/config');
  delete require.cache[cfgKey];
  const wsKey = require.resolve('../lib/WebServer');
  delete require.cache[wsKey];
  const WebServer = require('../lib/WebServer');

  const session = { name: 'sess', path: '/tmp', status: 'idle', startedAt: new Date(), resumeAt: null };
  const manager = makeMockManager([session]);
  const ws = new WebServer(manager, 0, '127.0.0.1', null);
  const sent = [];
  ws._tmuxSend = (name, msg) => sent.push({ name, msg });

  const q = ws._getQueue('sess');
  q.autoFeed = true;
  q.items.push({ id: '1', message: 'do task' });

  ws._broadcast();

  assert.equal(sent.length, 1);
  assert.equal(sent[0].msg, 'do task');
  assert.equal(q.items.length, 0);
  assert.equal(q.pendingSend, true);

  try { fs.unlinkSync(p); } catch {}
});

test('auto-feed does not double-send while session is still idle (pendingSend guard)', () => {
  const p = tmpConfigPath();
  process.env.CCP_CONFIG_PATH = p;
  const cfgKey = require.resolve('../lib/config');
  delete require.cache[cfgKey];
  const wsKey = require.resolve('../lib/WebServer');
  delete require.cache[wsKey];
  const WebServer = require('../lib/WebServer');

  const session = { name: 'sess', path: '/tmp', status: 'idle', startedAt: new Date(), resumeAt: null };
  const manager = makeMockManager([session]);
  const ws = new WebServer(manager, 0, '127.0.0.1', null);
  const sent = [];
  ws._tmuxSend = (name, msg) => sent.push({ name, msg });

  const q = ws._getQueue('sess');
  q.autoFeed = true;
  q.items.push({ id: '1', message: 'first' });
  q.items.push({ id: '2', message: 'second' });

  // First broadcast — should send 'first'
  ws._broadcast();
  // Second broadcast while still idle — should NOT send 'second'
  ws._broadcast();

  assert.equal(sent.length, 1, 'only one message sent while pendingSend is true');
  assert.equal(sent[0].msg, 'first');

  try { fs.unlinkSync(p); } catch {}
});

test('auto-feed resets pendingSend when session leaves idle', () => {
  const p = tmpConfigPath();
  process.env.CCP_CONFIG_PATH = p;
  const cfgKey = require.resolve('../lib/config');
  delete require.cache[cfgKey];
  const wsKey = require.resolve('../lib/WebServer');
  delete require.cache[wsKey];
  const WebServer = require('../lib/WebServer');

  const session = { name: 'sess', path: '/tmp', status: 'idle', startedAt: new Date(), resumeAt: null };
  const manager = makeMockManager([session]);
  const ws = new WebServer(manager, 0, '127.0.0.1', null);
  const sent = [];
  ws._tmuxSend = (name, msg) => sent.push({ name, msg });

  const q = ws._getQueue('sess');
  q.autoFeed = true;
  q.items.push({ id: '1', message: 'first' });
  q.items.push({ id: '2', message: 'second' });

  ws._broadcast();
  assert.equal(sent.length, 1);

  // Session moves to running (not idle/needs-response)
  session.status = 'running';
  ws._broadcast();
  assert.equal(q.pendingSend, false, 'pendingSend reset when not idle');

  // Session becomes idle again
  session.status = 'idle';
  ws._broadcast();
  assert.equal(sent.length, 2);
  assert.equal(sent[1].msg, 'second');

  try { fs.unlinkSync(p); } catch {}
});

test('DELETE /api/sessions/:name kills session', async () => {
  const p = tmpConfigPath();
  const manager = makeMockManager([
    { name: 'sess-kill', path: '/tmp', status: 'running', startedAt: new Date(), resumeAt: null },
  ]);
  const { port, close } = await startServer(manager, null, p);
  try {
    const { status } = await req(port, 'DELETE', '/api/sessions/sess-kill');
    assert.equal(status, 200);
    assert.equal(manager.list().length, 0);
  } finally { close(); }
});

test('GET /api/status returns server metadata', async () => {
  const p = tmpConfigPath();
  const { port, close } = await startServer(makeMockManager(), null, p);
  try {
    const { status, body } = await req(port, 'GET', '/api/status');
    assert.equal(status, 200);
    assert.equal(typeof body.port, 'number');
    assert.equal(typeof body.activeSessions, 'number');
    assert.ok(body.startedAt);
  } finally { close(); }
});

test('unknown API route returns 404', async () => {
  const p = tmpConfigPath();
  const { port, close } = await startServer(makeMockManager(), null, p);
  try {
    const { status } = await req(port, 'GET', '/api/nonexistent');
    assert.equal(status, 404);
  } finally { close(); }
});
