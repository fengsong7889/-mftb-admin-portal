/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import type { CpmSnapshot, CpmTimeTotals } from '@/api/cpm'
import { CpmStatus, type CpmStatusValue } from './meta'
import { formatSegmentRange, percentOf } from './cpmTime'

/**
 * 汇报阅读面的视图模型（阶段三）。
 *
 * 单独成模块的原因与 `cpmPeriod.ts` 同款：react-refresh 要求组件文件只导出组件，
 * 而这份映射被日报、周月报已发布视图、上级查看页三处共用。
 *
 * 关键边界：**这里只做形状整理，不做任何计算**。分钟数、来源标记、时段区间、
 * 工时汇总全部来自服务端快照（`CpmSnapshotBuilder` 的唯一算式），本模块一个数字都不新增。
 * 一旦展示层开始「顺手补个分母」，页面与通知、导出就会出现三种说法，
 * 而那种差异从来不会被当成缺陷去查——每一处都「看起来正常」。
 */

/** 明细行里的一段投入（服务端冻结快照自带） */
export interface DocSegmentCell {
  /** 起止区间文案；null = 这段没填起止，由展示层给占位文案 */
  range: string | null
  minutes: number
  note?: string | null
  /** 跨日标记：区间跨夜时必须带日期偏移，否则读者会算出「负三小时」 */
  crossesMidnight: boolean
  workDate?: string | null
}

export interface DocEntry {
  itemId: number
  title: string
  status: string
  progress: number
  workDate?: string | null
  trail: number[]
  sourceType?: string | null
  sourceLabel?: string | null
  /** 期间内投入分钟；null = 既无时段也无手工工时，界面显示占位而不是 0 */
  minutes: number | null
  minutesSource: 'segment' | 'manual' | 'none'
  segments: DocSegmentCell[]
}

export interface DocGroup {
  category: string
  categoryLabel: string
  items: DocEntry[]
  minutes: number
}

export interface DocTotals {
  total: number
  done: number
  doing: number
  todo: number
  blocked: number
  cancelled: number
  deferred: number
  /** 完成率分母：已取消不计入（取消不是没做完，而是不再该做） */
  completionBase: number
  completionPercent: number
  /** 有工时记录的条目数：给统计区一个诚实的空态，而不是「0 小时 = 没干活」 */
  timedEntryCount: number
}

export interface DocModel {
  groups: DocGroup[]
  totals: DocTotals
  /** null 表示这份快照没有工时维度（阶段二 V1 冻结快照），与「全 0」必须区分 */
  time: CpmTimeTotals | null
}

const SOURCE_TYPES = Object.values(CpmStatus) as string[]

function isStatus(value: string): value is CpmStatusValue {
  return SOURCE_TYPES.includes(value)
}

/**
 * 快照 → 阅读面视图模型。
 *
 * 完成率的分桶直接从快照条目统计，而不是另发一次「统计请求」：
 * 快照本身就是服务端聚合的产物，再取一次只会取到与冻结内容不同时间点的数（发布后又有人补了记录），
 * 于是「已发布的那一版」在页面上会变成「现在这一版」——历史版本就白冻结了。
 */
export function buildDocModel(snapshot: CpmSnapshot | null): DocModel {
  const groups: DocGroup[] = []
  const bucket = { done: 0, doing: 0, todo: 0, blocked: 0, cancelled: 0, deferred: 0 }
  let timedEntryCount = 0

  snapshot?.groups.forEach(group => {
    const items: DocEntry[] = group.items.map(item => {
      const minutes = item.minutes ?? null
      if (minutes && minutes > 0) timedEntryCount += 1
      if (isStatus(item.status)) bucket[item.status] += 1
      return {
        itemId: item.itemId,
        title: item.title,
        status: item.status,
        progress: item.progress,
        workDate: item.workDate,
        trail: item.trail ?? [],
        sourceType: item.sourceType,
        sourceLabel: item.sourceLabel,
        minutes,
        minutesSource: item.minutesSource ?? 'none',
        segments: (item.segments ?? []).map(segment => ({
          // 区间文案复用 cpmTime.formatSegmentRange：这里再写一份「未填起止 / 起 / 至」的拼法，
          // 记时弹层与阅读面就会对同一段给出两种读法
          range: formatSegmentRange(segment.startTime, segment.endTime, segment.crossesMidnight === true),
          minutes: segment.durationMinutes ?? 0,
          note: segment.note,
          crossesMidnight: segment.crossesMidnight === true,
          workDate: segment.workDate,
        })),
      }
    })
    // 分组小计优先用服务端给的 minutes；缺失（V1 老快照）时才由明细行相加，两者同源不冲突
    const minutes = group.minutes ?? items.reduce((sum, entry) => sum + (entry.minutes ?? 0), 0)
    groups.push({ category: group.category, categoryLabel: group.categoryLabel, items, minutes })
  })

  const total = snapshot?.totals?.total ?? groups.reduce((sum, group) => sum + group.items.length, 0)
  const completionBase = Math.max(0, total - bucket.cancelled)

  return {
    groups,
    totals: {
      total,
      ...bucket,
      completionBase,
      completionPercent: percentOf(bucket.done, completionBase),
      timedEntryCount,
    },
    time: snapshot?.time ?? null,
  }
}

/** 把「有工时记录」这件事说清楚：V1 老快照与真的零投入是两种需要不同措辞的空态 */
export function timeEmptyReason(model: DocModel): 'legacy' | 'not-recorded' | 'has-data' {
  if (model.time) return model.time.totalMinutes > 0 ? 'has-data' : 'not-recorded'
  return 'legacy'
}
