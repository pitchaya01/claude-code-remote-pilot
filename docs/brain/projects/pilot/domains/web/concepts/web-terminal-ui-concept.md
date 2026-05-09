---
id: web-terminal-ui-concept
name: Web Terminal UI Concept
type: concept
domain: web
status: active
confidence: source_supported
source_files:
  - lib/ui.html
last_reviewed: 2026-05-09
version: 0.9.1
tags:
  - type/concept
  - domain/web
  - status/active
---

# Web Terminal UI Concept

The dashboard terminal is a React SPA embedded in `lib/ui.html`. It polls session output every ~3 s via SSE, renders ANSI escape sequences to HTML, and provides a text input pinned to the bottom of the panel that sends keystrokes to the tmux pane.

## Key behaviours

- **ANSI rendering** — `ansiToHtml()` converts colour/formatting escapes to `<span>` elements with inline styles; falls back to stripped plain text on error.
- **Click-to-focus** — clicking anywhere on the terminal body focuses the hidden input so keystrokes are forwarded to tmux. Guard: only steals focus when `window.getSelection().toString()` is empty, so click-drag text selection is preserved.
- **Tab-switching layout** — `SessionDetailScreen` has an `activeTab` state and a `.tab-bar`. On desktop: two tabs (`terminal` | `git`); terminal tab shows `detail-grid` (terminal + sidebar with Session Info and `QueuePanel`), git tab shows `GitPanel` full-width. On mobile: four tabs (`terminal` | `info` | `queue` | `git`); terminal tab shows terminal full-width with no sidebar; Info tab shows action buttons + session info + label; Queue tab shows `QueuePanel`. `activeTab` resets to `'terminal'` whenever the selected session changes.
- **Mobile full-screen terminal** — on `isMobile` (`window.innerWidth < 768`), terminal height is `calc(100dvh - 190px)` (uses dynamic viewport height to account for mobile browser chrome). The `.terminal-footer` gets the `mobile-fixed` class (`position:fixed; bottom:0; left:0; right:0; z-index:50`) so the input stays visible while scrolling output. The `.terminal-body` gets `paddingBottom:130` to avoid content hidden behind the fixed footer. Action buttons are hidden via `.detail-actions{display:none}` on mobile and surfaced in the Info tab instead. The detail-header (title + path bar) is hidden on mobile via `.detail-header{display:none}` to reclaim vertical space.
- **Font size controls** — `A-` / `A+` buttons in the terminal header adjust `termFontSize` state (range 10–18 px, default 12). Value is persisted to `localStorage` under key `pilot-term-fsz` and restored on mount. Applied as inline `fontSize` on the terminal body. The resize-sync probe also uses `termFontSize` so column/row calculations stay accurate after a font change (`termFontSize` is in the resize effect dependency array).
- **Queue sidebar** — on desktop, `QueuePanel` is rendered inside `.detail-sidebar` (right column of the detail grid), beneath Session Info. The sidebar is `flex-direction:column; overflow-y:auto` so a long queue list scrolls without overflowing the layout.
- **Resize sync** — on mount and resize, the component measures the rendered terminal viewport (using a hidden probe character at the current `termFontSize`) and calls `POST /api/sessions/:name/resize` to match the tmux pane dimensions to the browser window.
- **Multi-line input** — the input element is a `<textarea>` (since v0.8.4), not an `<input>`. It auto-resizes via a `useEffect` that sets `el.style.height` to `Math.min(el.scrollHeight, 120)px` on every `msg` state change. Maximum visible height is 120 px (~5 lines); content beyond that scrolls inside the textarea.
- **Special keys** — Ctrl+C, Ctrl+D, Tab, Up/Down arrow, Ctrl+U, Ctrl+L are intercepted in `handleKeyDown` and forwarded as tmux key sequences.
- **Enter behaviour** — Enter sends the message (single or multi-line). Ctrl/Cmd+Enter inserts a newline at the cursor (manual `\n` splice into state + `requestAnimationFrame` cursor reposition). Shift+Enter sends a bare Enter to tmux (quick confirm). Enter with empty input sends a bare Enter to tmux.
- **Send button** — a `.btn-key-send` button labelled "↵ Send" sits in `.terminal-input-row` next to the textarea. Disabled when `msg` is empty or `sending`. Primary send path for mobile users who have no Ctrl key.
- **Footer layout** — `.terminal-footer` contains two children: `.terminal-input-row` (prompt char + textarea + Send button) and `.terminal-keys` (key shortcut buttons). On desktop both sit side-by-side (`flex-direction: row`, `align-items: flex-end`). On mobile (`max-width: 767px`) the footer switches to `flex-direction: column` so the input row is always fully visible above the scrollable key strip. Mobile key buttons are ~10 % smaller (`min-height:36px; padding:3px 9px; font-size:11px`).
- **Key button order** — `Esc` is at the far left of `.terminal-keys`, bare `↵` (send Enter to tmux) is at the far right. Navigation keys (↑ ↓ ⇥) and interrupt keys (^C ^D) sit between them, maximising tap-target separation between Esc and Enter.
- **Session avatar** — each session card shows a 40 px circular `.session-avatar` div on the left of the card header. Displays the session's emoji if set, otherwise the first character of the session name. The avatar background is tinted with `session.color + '33'` (10 % opacity) when a color is set.
- **Emoji preset picker** — `EmojiPicker` component renders a 12-button grid (`EMOJI_PRESETS`) plus a free-text fallback input. Used in the desktop sidebar "Label" section and the mobile Info tab. Clicking a preset toggles it; free-text supports any custom emoji up to 8 characters. Replaces the old single `<input>` field.
- **Active sort mode** — default sort is `'active'`: sessions are bucketed by `ACTIVE_GROUP_ORDER` (needs-response and running both get rank 0, idle rank 1, limit/offline/ended rank 2), then sorted by name within each bucket. Prevents cards from jumping positions when a session flips between `running` and `needs-response`.

## Non-obvious details

The click-to-focus guard (`window.getSelection()?.toString()`) is what makes copy-paste work. Without it every click clears the browser selection immediately after `mouseup`, making it impossible to copy terminal output.

The textarea auto-resize resets height to `'auto'` before measuring `scrollHeight`; omitting the reset causes the element to never shrink when lines are deleted.

`apiFetch` returns a raw `Response` object — callers must chain `.then(r => r.json())` to get parsed JSON. Omitting this step causes fields to resolve as `[object Response]` or `NaN` (seen in SysInfoBar before fix).

## Related

- [[web|Web domain]]
- [[web-serve-dashboard|Serve Dashboard]]
- [[web-request-flow|Web Request Flow]]
