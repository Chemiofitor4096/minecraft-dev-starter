/**
 * 样式：一次性注入一段 <style>，不用 CSS modules，也不引 UI 库。
 *
 * 颜色用 DSH 的 CSS 变量，取不到时退到中性的深色/浅色都能看的值。
 * @module minecraft-dev-starter/client/styles
 */

export const STYLE_ID = 'mcdev-styles'

export const CSS = `
.mcdev-anchor { position: relative; display: inline-flex; }
.mcdev-pill {
  display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 8px;
  border-radius: 999px; border: 1px solid var(--dsh-border, rgba(139,148,158,.35));
  background: transparent; color: inherit; font: inherit; font-size: 12px; cursor: pointer;
  max-width: 220px; overflow: hidden; white-space: nowrap;
}
.mcdev-pill:hover { background: var(--dsh-hover, rgba(139,148,158,.12)); }
.mcdev-dot { width: 7px; height: 7px; border-radius: 50%; flex: none; background: #8b949e; }
.mcdev-dot[data-state="ok"] { background: #3fb950; }
.mcdev-dot[data-state="idle"] { background: #8b949e; }
.mcdev-dot[data-state="error"] { background: #f85149; }
.mcdev-flyout {
  position: absolute; top: 30px; right: 0; z-index: 60; width: 340px; max-height: 60vh; overflow: auto;
  padding: 10px; border-radius: 10px; border: 1px solid var(--dsh-border, rgba(139,148,158,.35));
  background: var(--dsh-surface, #1b1f24); color: var(--dsh-text, #e6edf3);
  box-shadow: 0 12px 32px rgba(0,0,0,.35); font-size: 12px; line-height: 1.55;
}
.mcdev-title { font-weight: 600; font-size: 12px; }
.mcdev-muted { opacity: .62; }
.mcdev-row { display: flex; align-items: baseline; gap: 8px; }
.mcdev-key { flex: none; width: 78px; opacity: .55; }
.mcdev-project { padding: 8px 6px; border-radius: 8px; }
.mcdev-project + .mcdev-project { border-top: 1px solid var(--dsh-border, rgba(139,148,158,.2)); }
.mcdev-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.mcdev-chip {
  height: 22px; padding: 0 8px; display: inline-flex; align-items: center; gap: 4px;
  border-radius: 6px; border: 1px solid var(--dsh-border, rgba(139,148,158,.35));
  background: transparent; color: inherit; font: inherit; font-size: 11px; opacity: .55;
  cursor: not-allowed;
}
.mcdev-chip[data-guessed="true"] { border-style: dashed; }
.mcdev-link {
  background: transparent; border: 0; color: #58a6ff; font: inherit; font-size: 12px;
  cursor: pointer; padding: 0;
}
.mcdev-link:hover { text-decoration: underline; }
.mcdev-section { margin-top: 12px; }
.mcdev-section > h4 { margin: 0 0 4px; font-size: 11px; font-weight: 600; opacity: .7; letter-spacing: .04em; text-transform: uppercase; }
.mcdev-list { margin: 0; padding-left: 16px; }
.mcdev-list li { margin: 2px 0; }
.mcdev-warn { color: #d29922; }
.mcdev-error { color: #f85149; }
.mcdev-table { width: 100%; border-collapse: collapse; font-size: 11px; }
.mcdev-table th, .mcdev-table td { text-align: left; padding: 3px 6px 3px 0; vertical-align: top; }
.mcdev-table th { font-weight: 500; opacity: .55; }
.mcdev-code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; }
.mcdev-detail { padding: 12px; font-size: 12px; }
`

/** 注入一次；重复调用无副作用。 */
export function ensureStyles() {
  if (typeof document === 'undefined') return
  if (document.getElementById(STYLE_ID) !== null) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  document.head.appendChild(style)
}
