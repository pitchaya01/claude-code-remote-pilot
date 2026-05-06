'use strict';
const { execSync } = require('child_process');

function send(token, chatId, message) {
  if (!token || !chatId) return;
  try {
    execSync(
      `curl -sS -X POST "https://api.telegram.org/bot${token}/sendMessage"` +
      ` --data-urlencode "chat_id=${chatId}"` +
      ` --data-urlencode "text=${message}"`,
      { stdio: 'ignore', timeout: 5000 }
    );
  } catch {}
}

module.exports = { send };
