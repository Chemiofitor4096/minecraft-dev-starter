/**
 * 样式：一次性注入 <style>，**只使用 DSH 的设计 token**（`--dsw-*`）。
 *
 * 规则来自系统自身：颜色一律走 `--dsw-alias-*`，字号走 `--dsw-font-*`，
 * 控件高度对齐 24/28、圆角 3/4/8。不写死任何色值——跟随主题与皮肤切换，
 * 也不会在亮色主题下突然出现一块深色面板。
 *
 * 这条约束由测试守护：`test/styles.test.js` 会拒绝出现原始色值的声明。
 * @module minecraft-dev-starter/client/styles
 */

export const STYLE_ID = 'mcdev-styles'

export const CSS = `
.mcdev-anchor { position: relative; display: inline-flex; }

/* 标题栏胶囊：与系统控件同高同圆角，默认无底色 */
.mcdev-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 24px;
  max-width: 220px;
  padding: 0 8px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 999px;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: var(--dsw-font-xxs-12);
  cursor: pointer;
}
.mcdev-pill:hover { background: var(--dsw-alias-interactive-bg-hover); }

.mcdev-dot {
  width: 7px;
  height: 7px;
  flex: none;
  border-radius: 50%;
  background: var(--dsw-alias-label-tertiary);
}
.mcdev-dot[data-state="ok"] { background: var(--dsw-alias-state-success-primary); }
.mcdev-dot[data-state="error"] { background: var(--dsw-alias-state-error-primary); }

/* 浮层：系统层级 2 的底色 + 一级描边 */
.mcdev-flyout {
  position: absolute;
  top: 30px;
  right: 0;
  z-index: 60;
  width: 340px;
  max-height: 60vh;
  overflow: auto;
  padding: 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
  font: var(--dsw-font-xxs-12);
  box-shadow: 0 8px 24px var(--dsw-alias-bg-mask-1);
}

.mcdev-title { font: var(--dsw-font-xxs-strong-12); }
.mcdev-sub { color: var(--dsw-alias-label-secondary); }
.mcdev-muted { color: var(--dsw-alias-label-tertiary); }
.mcdev-code { font-family: var(--dsw-font-mono); font-size: 11px; }
.mcdev-warn { color: var(--dsw-alias-state-warn-primary); }
.mcdev-error { color: var(--dsw-alias-state-error-primary); }

.mcdev-row { display: flex; align-items: baseline; gap: 8px; }
.mcdev-key { flex: none; width: 78px; color: var(--dsw-alias-label-tertiary); }
.mcdev-divider { height: 1px; margin: 8px 0; background: var(--dsw-alias-hairline); }

.mcdev-project { padding: 8px 6px; border-radius: 4px; }
.mcdev-project.is-active { background: var(--dsw-alias-interactive-bg-hover); }

/* 目标标签：中性徽标，不是按钮——M2 之前没有可点的动作 */
.mcdev-badges { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.mcdev-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 20px;
  padding: 0 6px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 4px;
  background: var(--dsw-alias-bg-layer-3);
  color: var(--dsw-alias-label-secondary);
  font: var(--dsw-font-xxxs-11);
}
.mcdev-badge[data-guessed="true"] {
  border-style: dashed;
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
}
.mcdev-badge-tag { color: var(--dsw-alias-label-tertiary); }

.mcdev-hint { color: var(--dsw-alias-label-tertiary); font: var(--dsw-font-xxxs-11); }

.mcdev-link {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--dsw-alias-accent);
  font: var(--dsw-font-xxs-12);
  cursor: pointer;
}
.mcdev-link:hover { text-decoration: underline; }

.mcdev-section { margin-top: 12px; }
.mcdev-section > h4 {
  margin: 0 0 4px;
  color: var(--dsw-alias-label-tertiary);
  font: var(--dsw-font-xxxs-strong-11);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.mcdev-table { width: 100%; border-collapse: collapse; font: var(--dsw-font-xxxs-11); }
.mcdev-table th,
.mcdev-table td { padding: 3px 6px 3px 0; text-align: left; vertical-align: top; }
.mcdev-table thead th {
  color: var(--dsw-alias-label-tertiary);
  font: var(--dsw-font-xxxs-strong-11);
  border-bottom: 1px solid var(--dsw-alias-hairline);
}

.mcdev-detail { padding: 12px; font: var(--dsw-font-xxs-12); color: var(--dsw-alias-label-primary); }
.mcdev-stack { display: flex; flex-direction: column; gap: 4px; }
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
