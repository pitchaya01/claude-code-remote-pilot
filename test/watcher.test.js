'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Watcher = require('../lib/Watcher');

function makeWatcher(overrides = {}) {
  const session = {
    name: 'test-session',
    path: '/tmp',
    status: 'running',
    startedAt: new Date(),
    resumeAt: null,
  };
  return new Watcher(session, {
    telegram: { enabled: false },
    checkInterval: 1000,
    fallbackWait: 1,
    cooldown: 0,
    ...overrides,
  });
}

test('active limit detection ignores stale limit text outside recent visible window', () => {
  const watcher = makeWatcher();
  const staleScrollback = [
    "You've hit your usage limit. resets 6am (Asia/Bangkok)",
    'older output',
    ...Array.from({ length: 16 }, (_, i) => `newer output ${i + 1}`),
    'esc to interrupt',
  ].join('\n');

  assert.equal(watcher._hasActiveLimit(staleScrollback), false);
});

test('active limit detection matches recent visible limit text', () => {
  const watcher = makeWatcher();
  const activeLimit = [
    'working',
    'esc to interrupt',
    "You've hit your usage limit. resets 6am (Asia/Bangkok)",
  ].join('\n');

  assert.equal(watcher._hasActiveLimit(activeLimit), true);
});

test('post-reset verification resumes when only stale scrollback contains limit text', async () => {
  const watcher = makeWatcher();
  watcher._capture = () => [
    "You've hit your usage limit. try again in 1 second",
    ...Array.from({ length: 16 }, (_, i) => `newer output ${i + 1}`),
    'Claude continued after reset',
    'esc to interrupt',
  ].join('\n');

  await watcher._handleLimit("You've hit your usage limit. try again in 1 second");

  assert.equal(watcher.session.status, 'running');
  assert.equal(watcher.session.resumeAt, null);
  assert.equal(watcher.session.resetTime, null);
});

test('reset parser honors explicit IANA timezone when present', () => {
  const watcher = makeWatcher();
  const resetAt = watcher._parseResetAtMs('Usage limit reached. resets 6am (Asia/Bangkok)');
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(resetAt));
  const values = Object.fromEntries(parts.filter(p => p.type !== 'literal').map(p => [p.type, p.value]));

  assert.equal(values.hour, '06');
  assert.equal(values.minute, '00');
});
