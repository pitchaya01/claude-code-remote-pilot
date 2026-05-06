# Tasks

## In Progress
- Session history + interactive watch feature
  - [x] lib/config.js: addToHistory, removeFromHistory, getHistory
  - [ ] lib/SessionManager.js: call addToHistory in spawn() and adopt()
  - [ ] bin/claude-pilot.js: rewrite startWatch() with offline sessions + interactive actions

## Completed
- Package rename to claude-code-remote-pilot
- Dep checks (tmux, claude) with auto-install
- Telegram setup and persistence
- REPL server architecture
- Session status detection (running/idle/needs-response/limit)
- Token usage in watch
- Persistent sessions config
- Uppercase default prompts
- Session history functions in config.js
