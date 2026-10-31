/**
 * 右侧栏「运行日志」标签：按时间列出这个工作区跑过的实例，默认最新一条。
 *
 * 日志本体在宿主侧已经按行解码（UTF-8 / GBK 回退），这里只负责展示与跟随。
 * @module minecraft-dev-starter/client/LogTab
 */

import { useEffect, useRef, useState } from 'react'
import { call } from './api.js'
import { h } from './h.js'
import { IconRefresh, IconWarning } from './icons.js'
import { highlightLine } from './logFormat.js'
import { launchStatusText, pickLogTarget } from './selection.js'
import { Skeleton } from './Skeleton.js'
import { loadLaunches, selectedProject, useLaunches } from './state.js'

/** 关掉标签再打开时，尽量回到上次看的那条。 */
let lastLogId

export function LogTab() {
  const launches = useLaunches(1500)
  const project = selectedProject()
  const [logId, setLogId] = useState(/** @type {string | undefined} */ (lastLogId))
  const [log, setLog] = useState(/** @type {any} */ (undefined))
  const [follow, setFollow] = useState(true)
  const [pinned, setPinned] = useState(false)
  const body = useRef(/** @type {HTMLPreElement | null} */ (null))

  // 历史按当前工程过滤；工程还没识别出来时退回全部
  const projectRoot = project === undefined ? undefined : String(project.root).toLowerCase()
  const scoped = launches.list.filter((entry) => projectRoot === undefined || String(entry.root).toLowerCase() === projectRoot)
  const history = scoped.length > 0 ? scoped : launches.list

  // 跟随：有实例在跑就跟它；用户手动选过就保持；否则跟当前/最新
  const target = pickLogTarget(history, logId, pinned)
  useEffect(() => {
    if (target === undefined || target === logId) return
    lastLogId = target
    setLogId(target)
    setLog(undefined)
    // 新实例跑起来时解除手动固定
    if (history.some((entry) => entry.id === target && (entry.status === 'starting' || entry.status === 'running'))) {
      setPinned(false)
    }
  }, [target, logId, history])

  // 拉日志：运行中的实例每 1.5s 刷一次，结束的不再轮询
  useEffect(() => {
    if (logId === undefined) {
      setLog(undefined)
      return undefined
    }
    let cancelled = false
    const pull = async () => {
      try {
        const result = await call('launch.logs', { id: logId, offset: 0, limit: 800 })
        if (!cancelled) setLog(result)
      } catch (error) {
        if (!cancelled) setLog({ error: error instanceof Error ? error.message : String(error) })
      }
    }
    void pull()
    const timer = setInterval(() => {
      if (log?.status === 'starting' || log?.status === 'running' || log === undefined) void pull()
    }, 1500)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [logId, log?.status])

  // 跟随尾部
  useEffect(() => {
    if (!follow) return
    const element = body.current
    if (element !== null) element.scrollTop = element.scrollHeight
  }, [log?.lines?.length, follow])

  if (history.length === 0) {
    return h(
      'div',
      { className: 'mcdev-detail' },
      h('div', { className: 'mcdev-title' }, '运行日志'),
      h('div', { className: 'mcdev-muted', style: { marginTop: 8 } }, '还没有运行记录。用标题栏胶囊的 ▶ 启动一次。'),
    )
  }

  const running = log?.status === 'starting' || log?.status === 'running'
  const tone =
    log?.error !== undefined
      ? 'error'
      : running
        ? (log?.status === 'starting' ? 'warn' : 'ok')
        : log?.outcome === 'normal'
          ? 'idle'
          : 'error'

  return h(
    'div',
    { className: 'mcdev-logtab' },
    h(
      'div',
      { className: 'mcdev-log-head' },
      h(
        'select',
        {
          className: 'mcdev-select',
          value: logId ?? '',
          onChange: (event) => {
            // 手动选过就固定住，等下一次有新实例跑起来再自动跟随
            setPinned(true)
            lastLogId = event.target.value
            setLogId(event.target.value)
            setLog(undefined)
          },
        },
        history.map((entry) => h('option', { key: entry.id, value: entry.id }, optionLabel(entry))),
      ),
      h('span', { className: 'mcdev-dot', 'data-state': tone }),
      h('span', { className: 'mcdev-hint' }, statusText(log, running)),
      h(
        'label',
        { className: 'mcdev-follow' },
        h('input', { type: 'checkbox', checked: follow, onChange: (event) => setFollow(event.target.checked) }),
        '跟随',
      ),
    ),
    log?.diagnosis === undefined
      ? undefined
      : h(
          'div',
          { className: 'mcdev-diagnosis' },
          h(
            'div',
            { className: 'mcdev-diagnosis-hint mcdev-icon-text' },
            h('span', { className: 'mcdev-icon' }, h(IconWarning, undefined)),
            log.diagnosis.hint,
          ),
          h('div', { className: 'mcdev-hint mcdev-code' }, log.diagnosis.line),
        ),
    log?.error === undefined
      ? log === undefined && running
        ? h(Skeleton, { rows: 4, hint: '正在读取日志…' })
        : h(
            'pre',
            { ref: body, className: 'mcdev-logs mcdev-logs-full' },
            (log?.lines ?? []).length === 0
              ? '（还没有输出）'
              : (log?.lines ?? []).map((line, index) =>
                  h(
                    'span',
                    { key: index, className: 'mcdev-log-line' },
                    highlightLine(line).map((part, partIndex) =>
                      h('span', { key: partIndex, 'data-kind': part.kind }, part.text),
                    ),
                    '\n',
                  ),
                ),
          )
      : h('div', { className: 'mcdev-error', style: { marginTop: 8 } }, log.error),
    h(
      'div',
      { style: { marginTop: 8 } },
      h(
        'button',
        { type: 'button', className: 'mcdev-mini', onClick: () => void loadLaunches() },
        h('span', { className: 'mcdev-icon' }, h(IconRefresh, { size: 12 })),
        '刷新实例列表',
      ),
    ),
  )
}

/**
 * @param {Record<string, any>} entry
 * @returns {string}
 */
function optionLabel(entry) {
  const time = new Date(entry.startedAt)
  const clock = Number.isNaN(time.getTime())
    ? '--:--'
    : `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`
  const mark = entry.status === 'running' || entry.status === 'starting' ? '●' : entry.outcome === 'normal' ? '○' : '✕'
  return `${mark} ${entry.label} · ${clock} · ${launchStatusText(entry)}`
}

/**
 * @param {any} log
 * @param {boolean} running
 * @returns {string}
 */
function statusText(log, running) {
  if (log === undefined) return '加载中…'
  void running
  return launchStatusText({ status: log.status, outcome: log.outcome, exitCode: log.exitCode })
}
