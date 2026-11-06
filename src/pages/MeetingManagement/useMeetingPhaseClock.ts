/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
/**
 * 会议阶段时钟：让「待開會 → 進行中 → 已結束」在页面上自己走完，而不是等用户手动刷新。
 *
 * <p>为什么必须有它：会议的阶段是**时间的函数**——服务端每次响应都按 now 现算 `phase`，
 * 客户端拿到的是那一刻的快照。页面停着不动，快照就永远停在旧阶段：2026-11-06 E2E 实测
 * 07:00 开始的会，07:01:53 详情页仍写「待開會」，探针确认 JS 在跑但没有任何取数请求，
 * 必须手动刷新才变「進行中」；同一缺陷也出现在「已釋放」与纪要发送记录状态上。
 * 用户据此判断「会还没开始」而错过签到窗口，是业务后果而不只是观感问题。
 *
 * <p>为什么不做固定间隔轮询：会议列表/台账一次拉 20~200 条，30 秒一轮等于把
 * 首页请求风暴那套压力再引回来（见 docs/HOME_REQUEST_STORM_2026-10.md 的教训）。
 * 这里只在「未来确实有一个阶段要跨」时定时唤醒一次，醒来刷新后重新计算下一个临界点；
 * 没有活跃会议就不挂定时器。
 *
 * <p>临界点之后额外补一次延迟再醒：提前结束、超时未签到自动释放这类事件
 * 落在 startTime/endTime 之后的某个不确定时刻，只醒一次会漏掉它。
 */
import { useEffect, useRef } from 'react'

/** 阶段点之后补看一次的间隔（覆盖自动释放、服务端补算） */
const AFTER_PHASE_MS = 60_000
/** 最早临界点太远时的兜底重估间隔：再远也按时醒来一次，容忍数据变化与服务端补算 */
const MAX_DELAY_MS = 10 * 60_000
/** 临界点过于密集时的最小间隔，避免连续唤醒造成请求抖动 */
const MIN_DELAY_MS = 15_000

/** 只取阶段时钟关心的字段，便于列表页与详情页共用（VO 与派生行都能传进来） */
export interface PhaseClockRow {
  phase?: string | null
  startTime?: string | null
  endTime?: string | null
  /** 签到截止（服务端按规则算），用于覆盖「超时未签到自动释放」这个第三类临界点 */
  checkinDeadlineAt?: string | null
}

const LIVE_PHASES = new Set(['pending', 'ongoing'])

/**
 * 算出这批会议里「下一个会改变阶段的时刻」。
 * 导出是为了能单独断言口径——临界点算错等于时钟白挂，页面照旧停在旧阶段。
 * 返回 null 表示这批数据里没有会跨阶段（全部已收尾），不需要挂定时器。
 */
export function nextPhaseBoundary(rows: PhaseClockRow[], now = Date.now()): number | null {
  let nearest: number | null = null
  for (const row of rows) {
    if (!row.phase || !LIVE_PHASES.has(row.phase)) continue
    const candidates = [row.startTime, row.endTime, row.checkinDeadlineAt]
      .map(value => (value ? Date.parse(value) : Number.NaN))
      .filter(ts => Number.isFinite(ts) && ts > now)
    if (candidates.length === 0) continue
    const soonest = Math.min(...candidates)
    if (nearest === null || soonest < nearest) nearest = soonest
  }
  return nearest
}

/**
 * 挂上阶段时钟：到点调用 `onTick` 重新取数，取完自动按新数据重排下一次唤醒。
 *
 * @param rows 当前已渲染的会议行（列表/台账/详情均可）
 * @param onTick 重新取数的回调；必须稳定（用 useCallback），否则会不断重挂定时器
 * @param enabled 页面处于不可用状态（加载中/报错）时传 false，不抢跑取数
 */
export function useMeetingPhaseClock(rows: PhaseClockRow[], onTick: () => void, enabled = true): void {
  // 只存最新回调、不进依赖：否则调用方没把 onTick 包成 useCallback 时，
  // 父组件每次输入筛选都会重排定时器，临界点永远追不完
  const tickRef = useRef(onTick)
  tickRef.current = onTick

  useEffect(() => {
    if (!enabled) return
    const boundary = nextPhaseBoundary(rows)
    if (boundary === null) return

    let retry: number | undefined
    const now = Date.now()
    const delay = Math.min(Math.max(boundary - now, MIN_DELAY_MS), MAX_DELAY_MS)
    const wake = () => {
      tickRef.current()
      // 阶段点之后再看一眼：提前结束/自动释放不落在 startTime 上
      retry = window.setTimeout(() => tickRef.current(), AFTER_PHASE_MS)
    }
    const timer = window.setTimeout(wake, delay)

    // 后台标签页里定时器会被浏览器节流，回到前台时必须立刻补一次，
    // 否则用户切回来看到的还是切走之前那个阶段的旧快照
    const onVisible = () => { if (document.visibilityState === 'visible') tickRef.current() }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      window.clearTimeout(timer)
      if (retry !== undefined) window.clearTimeout(retry)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [rows, enabled])
}
