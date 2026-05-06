#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const scriptPath = path.resolve(__dirname, '..', 'claude-pilot.sh');

if (!fs.existsSync(scriptPath)) {
  console.error('claude-pilot.sh not found');
  process.exit(1);
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Claude Code Pilot

Usage:
  claude-pilot

Environment variables:
  TELEGRAM_BOT_TOKEN
  TELEGRAM_CHAT_ID
  CLAUDE_SESSION
  CLAUDE_COMMAND

Example:
  TELEGRAM_BOT_TOKEN=xxx TELEGRAM_CHAT_ID=123456 claude-pilot

Attach to tmux:
  tmux attach -t claude
`);
  process.exit(0);
}

const child = spawn('bash', [scriptPath], {
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code) => {
  process.exit(code || 0);
});
