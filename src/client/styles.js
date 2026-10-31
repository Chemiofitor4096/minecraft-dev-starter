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
.mcdev-capsule { display: inline-flex; align-items: center; gap: 4px; }

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
/* 窄的时候让工程名让步：目标名永远完整显示 */
.mcdev-pill-text { display: flex; align-items: center; min-width: 0; }
.mcdev-pill-project {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dsw-alias-label-secondary);
}
.mcdev-pill-sep { flex: none; padding: 0 4px; color: var(--dsw-alias-label-tertiary); }
.mcdev-pill-target { flex: none; white-space: nowrap; }

.mcdev-dot {
  width: 7px;
  height: 7px;
  flex: none;
  border-radius: 50%;
  background: var(--dsw-alias-label-tertiary);
}
.mcdev-dot[data-state="ok"] { background: var(--dsw-alias-state-success-primary); }
.mcdev-dot[data-state="warn"] { background: var(--dsw-alias-state-warn-primary); }
.mcdev-dot[data-state="error"] { background: var(--dsw-alias-state-error-primary); }

/* 浮层：三层结构（表头 / 列表 / 选择区），选工程时列表高度不变 */
.mcdev-flyout {
  position: absolute;
  top: 30px;
  right: 0;
  z-index: 60;
  display: flex;
  flex-direction: column;
  width: 340px;
  max-height: 60vh;
  padding: 0;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
  font: var(--dsw-font-xxs-12);
  box-shadow: 0 8px 24px var(--dsw-alias-bg-mask-1);
  overflow: hidden;
}
.mcdev-flyout-head {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: none;
  padding: 10px 10px 8px;
  border-bottom: 1px solid var(--dsw-alias-hairline);
}
.mcdev-flyout-list {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: 6px;
}
.mcdev-flyout-pane {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: none;
  padding: 8px 10px 10px;
  border-top: 1px solid var(--dsw-alias-hairline);
}

/* 列表行：一行一个工程，高度恒定 */
.mcdev-list-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  height: 30px;
  padding: 0 8px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: var(--dsw-font-xxs-12);
  text-align: left;
  cursor: pointer;
}
.mcdev-list-row:hover { background: var(--dsw-alias-interactive-bg-hover); }
.mcdev-list-row[data-current="true"] { background: var(--dsw-alias-interactive-bg-hover); }
.mcdev-list-row[data-current="true"] .mcdev-list-name { font: var(--dsw-font-xxs-strong-12); }
.mcdev-list-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mcdev-list-meta { flex: none; color: var(--dsw-alias-label-tertiary); font: var(--dsw-font-xxxs-11); }
.mcdev-ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.mcdev-title { font: var(--dsw-font-xxs-strong-12); }
.mcdev-sub { color: var(--dsw-alias-label-secondary); }
.mcdev-muted { color: var(--dsw-alias-label-tertiary); }
.mcdev-code { font-family: var(--dsw-font-mono); font-size: 11px; }
.mcdev-warn { color: var(--dsw-alias-state-warn-primary); }
.mcdev-error { color: var(--dsw-alias-state-error-primary); }

.mcdev-row { display: flex; align-items: baseline; gap: 8px; }
.mcdev-key { flex: none; width: 78px; color: var(--dsw-alias-label-tertiary); }

.mcdev-mini {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  height: 22px;
  padding: 0 8px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 4px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: var(--dsw-font-xxxs-11);
  cursor: pointer;
}
.mcdev-mini:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.mcdev-mini-icon { width: 22px; padding: 0; justify-content: center; }

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

/* 运行按钮：系统尺寸（24 高、4 圆角），中性底色 */
.mcdev-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.mcdev-run {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding: 0 8px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 4px;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: var(--dsw-font-xxs-12);
  cursor: pointer;
}
.mcdev-run:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.mcdev-run:disabled { opacity: 0.4; cursor: default; }
.mcdev-run[data-tone="stop"] { color: var(--dsw-alias-danger); border-color: var(--dsw-alias-danger); }
.mcdev-run-icon { width: 24px; padding: 0; justify-content: center; }

/* 目标单选列表：一行一个，模块名做小标题 */
.mcdev-options { display: flex; flex-direction: column; gap: 2px; margin-top: 6px; }
.mcdev-option-group { display: flex; flex-direction: column; gap: 2px; }
.mcdev-option-module { margin-top: 4px; color: var(--dsw-alias-label-tertiary); font: var(--dsw-font-xxxs-11); }
.mcdev-option {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 22px;
  padding: 0 4px;
  border-radius: 4px;
  cursor: pointer;
}
.mcdev-option:hover { background: var(--dsw-alias-interactive-bg-hover); }
.mcdev-option.is-disabled { opacity: 0.5; cursor: default; }
.mcdev-radio { margin: 0; accent-color: var(--dsw-alias-accent); }
.mcdev-option-label { font: var(--dsw-font-xxs-12); }

.mcdev-status { margin-top: 6px; color: var(--dsw-alias-state-success-primary); font: var(--dsw-font-xxxs-11); }
.mcdev-inline-status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: 8px;
  color: var(--dsw-alias-state-success-primary);
  font: var(--dsw-font-xxxs-11);
}

/* 日志尾部：等宽、可滚，底色用系统层级 3 */
.mcdev-logs {
  max-height: 220px;
  margin: 8px 0 0;
  padding: 8px;
  overflow: auto;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 4px;
  background: var(--dsw-alias-bg-layer-3);
  color: var(--dsw-alias-label-secondary);
  font-family: var(--dsw-font-mono);
  font-size: 11px;
  line-height: 1.5;
  white-space: pre-wrap;
}

/* 运行日志标签：顶部一条控制带，下面是整块日志 */
.mcdev-logtab { display: flex; flex-direction: column; height: 100%; min-height: 0; padding: 8px 10px 10px; }
.mcdev-log-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding-bottom: 8px; }
.mcdev-select {
  height: 24px;
  max-width: 220px;
  padding: 0 6px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 4px;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
  font: var(--dsw-font-xxxs-11);
}
.mcdev-follow { display: inline-flex; align-items: center; gap: 4px; color: var(--dsw-alias-label-tertiary); font: var(--dsw-font-xxxs-11); }
.mcdev-diagnosis {
  margin-bottom: 8px;
  padding: 8px;
  border: 1px solid var(--dsw-alias-state-error-primary);
  border-radius: 4px;
  background: var(--dsw-alias-bg-layer-2);
}
.mcdev-diagnosis-hint { color: var(--dsw-alias-state-error-primary); font: var(--dsw-font-xxs-strong-12); }
.mcdev-logs-full { flex: 1 1 auto; min-height: 0; max-height: none; margin: 0; }

/* 日志高亮：只按语义上色，时间/线程/logger 一律压到 tertiary，让正文更清楚 */
.mcdev-log-line { display: inline; }
.mcdev-log-line [data-kind="time"],
.mcdev-log-line [data-kind="thread"],
.mcdev-log-line [data-kind="logger"] { color: var(--dsw-alias-label-tertiary); }
.mcdev-log-line [data-kind="muted"] { color: var(--dsw-alias-label-tertiary); }
.mcdev-log-line [data-kind="level-warn"] { color: var(--dsw-alias-state-warn-primary); }
.mcdev-log-line [data-kind="level-error"] { color: var(--dsw-alias-state-error-primary); }
.mcdev-log-line [data-kind="level-debug"] { color: var(--dsw-alias-label-tertiary); }
.mcdev-log-line [data-kind="task"] { color: var(--dsw-alias-label-secondary); }
.mcdev-log-line [data-kind="ok"] { color: var(--dsw-alias-state-success-primary); }
.mcdev-log-line [data-kind="fail"] { color: var(--dsw-alias-state-error-primary); font: var(--dsw-font-xxxs-strong-11); }
.mcdev-log-line [data-kind="stack"] { color: var(--dsw-alias-label-secondary); }

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
.mcdev-icon { display: inline-flex; align-items: center; justify-content: center; flex: none; }
.mcdev-icon-text { display: inline-flex; align-items: center; gap: 4px; }

/* 动效：短、克制；系统开了"减少动态效果"就全部关掉 */
@keyframes mcdev-pop-in {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: none; }
}
@keyframes mcdev-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
}
.mcdev-flyout { animation: mcdev-pop-in 120ms ease-out; }
.mcdev-dot[data-pulse="true"] { animation: mcdev-pulse 1.6s ease-in-out infinite; }
.mcdev-pill,
.mcdev-run,
.mcdev-mini,
.mcdev-option { transition: background-color 120ms ease, color 120ms ease, border-color 120ms ease; }

/* 骨架：扫描/加载中的占位，避免一片空白 */
.mcdev-skeleton { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
.mcdev-skeleton-row {
  height: 10px;
  border-radius: 3px;
  background: var(--dsw-alias-interactive-bg-hover);
  animation: mcdev-pulse 1.4s ease-in-out infinite;
}
.mcdev-skeleton-row:nth-child(2) { width: 72%; }
.mcdev-skeleton-row:nth-child(3) { width: 46%; }

@media (prefers-reduced-motion: reduce) {
  .mcdev-flyout,
  .mcdev-dot[data-pulse="true"],
  .mcdev-skeleton-row { animation: none; }
  .mcdev-pill,
  .mcdev-run,
  .mcdev-mini,
  .mcdev-option { transition: none; }
}
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
