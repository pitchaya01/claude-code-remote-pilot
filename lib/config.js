'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG_PATH = path.join(os.homedir(), '.claude-remote-pilot.json');

function load() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function save(data) {
  const current = load();
  fs.writeFileSync(CONFIG_PATH, JSON.stringify({ ...current, ...data }, null, 2));
}

function saveTelegram(token, chatId) {
  save({ telegram: { token, chatId } });
}

function saveSessions(sessions) {
  save({ sessions: sessions.map(s => ({ name: s.name, path: s.path })) });
}

function clearSessions() {
  save({ sessions: [] });
}

function saveResumeCommand(cmd) {
  save({ resumeCommand: cmd });
}

function addToHistory(name, path) {
  const cfg = load();
  const history = (cfg.sessionHistory || []).filter(s => s.name !== name);
  history.unshift({ name, path, lastSeen: new Date().toISOString() });
  save({ sessionHistory: history.slice(0, 30) }); // cap at 30
}

function removeFromHistory(name) {
  const cfg = load();
  save({ sessionHistory: (cfg.sessionHistory || []).filter(s => s.name !== name) });
}

function getHistory() {
  return load().sessionHistory || [];
}

module.exports = { load, saveTelegram, saveSessions, clearSessions, saveResumeCommand, addToHistory, removeFromHistory, getHistory };
