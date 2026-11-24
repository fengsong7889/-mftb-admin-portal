/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import dayjs, { type Dayjs } from 'dayjs'
import i18n from '@/i18n'
import { noteToText } from './noteRich'

/**
 * 「項目甘特台账」视图的本地数据模型与工作日日历引擎（阶段一 UI）。
 *
 * 口径（用户硬性要求）：耗时只算工作日——周末与节假日一律剔除，
 * 调休上班的周末按工作日计。耗时 = 起止区间内工作日数 × 8h。
 * 节假日/调休名单可在界面「節假日口徑」里编辑，存本地。
 */

export const HOURS_PER_DAY = 8
export const STORAGE_KEY = 'cpm-worklog-gantt-v1'

export interface GanttTask {
  id: string
  title: string
  /** YYYY-MM-DD；null = 未排期 */
  start: string | null
  end: string | null
  /** 0-100 */
  progress: number
  note: string
  /** 進度流水（匯報「進度變更」聚合的唯一來源）；舊存量數據可缺省 */
  history?: { at: string; progress: number }[]
  /** 計劃屬性：原計劃 / 臨時插入（計劃凍結後新安排）；舊存量默認 planned */
  planType?: 'planned' | 'inserted'
  /** 標記為臨時插入的日期（YYYY-MM-DD）；原計劃為 null */
  insertedAt?: string | null
}

export interface GanttGroup {
  id: string
  title: string
  /** GROUP_COLORS 下标，决定合并单元格底色 */
  hue: number
  tasks: GanttTask[]
}

export interface GanttData {
  groups: GanttGroup[]
  /** 法定节假日（YYYY-MM-DD），不计工时 */
  holidays: string[]
  /** 调休上班（周末但计工时） */
  makeup: string[]
  /** 调休（工作日换休，不计工时） */
  compOff: string[]
  /** 请假（本人不在岗，不计工时） */
  leave: string[]
}

/**
 * 特殊日期四类型：口徑统一为「是否计工时」——只有補班计入，其余三种都剔除。
 * label 用 getter 而不是模块级常量（与 meta.ts 同一决策）：常量表在 import 那一刻
 * 就把词定死，用户切语言后重渲染仍拿不到新词，比不接 i18n 更难查。
 */
export type SpecialDayType = 'holiday' | 'makeup' | 'compOff' | 'leave'
export const SPECIAL_DAY_TYPES: { value: SpecialDayType; label: string; tag: string; color: string }[] = [
  { value: 'holiday', tag: 'orange', color: 'var(--warning)', get label() { return i18n.t('cpm.gantt.dayType.holiday', { defaultValue: '節假日' }) } },
  { value: 'makeup', tag: 'blue', color: 'var(--info)', get label() { return i18n.t('cpm.gantt.dayType.makeup', { defaultValue: '補班' }) } },
  { value: 'compOff', tag: 'volcano', color: 'var(--warning-deep)', get label() { return i18n.t('cpm.gantt.dayType.compOff', { defaultValue: '調休' }) } },
  { value: 'leave', tag: 'purple', color: 'var(--purple)', get label() { return i18n.t('cpm.gantt.dayType.leave', { defaultValue: '請假' }) } },
]

/** 日列轴线的单字角标：休/班/請/今，与四类型同一口径但更省宽度。
 * key 一律写字面量：check:i18n 的引用解析只识别 t('字面量')，变量 key 会整段逃过门禁。 */
export function dayBadge(type: SpecialDayType): string {
  if (type === 'holiday' || type === 'compOff') return i18n.t('cpm.gantt.badge.rest', { defaultValue: '休' })
  if (type === 'makeup') return i18n.t('cpm.gantt.badge.makeup', { defaultValue: '班' })
  return i18n.t('cpm.gantt.badge.leave', { defaultValue: '請' })
}

const TYPE_LIST_KEY: Record<SpecialDayType, keyof Pick<GanttData, 'holidays' | 'makeup' | 'compOff' | 'leave'>> = {
  holiday: 'holidays', makeup: 'makeup', compOff: 'compOff', leave: 'leave',
}

/** 某天的特殊类型（互斥：以最后一次登记为准，按 holidays→compOff→leave→makeup 优先） */
export function dayType(key: string, data: Pick<GanttData, 'holidays' | 'makeup' | 'compOff' | 'leave'>): SpecialDayType | null {
  if (data.holidays.includes(key)) return 'holiday'
  if (data.compOff.includes(key)) return 'compOff'
  if (data.leave.includes(key)) return 'leave'
  if (data.makeup.includes(key)) return 'makeup'
  return null
}

/** 设置某天类型：先从全部名单摸除再落入目标表（null=恢复默认周末/工作日口径） */
export function setDayType(data: GanttData, key: string, type: SpecialDayType | null): Pick<GanttData, 'holidays' | 'makeup' | 'compOff' | 'leave'> {
  const next = {
    holidays: data.holidays.filter(x => x !== key),
    makeup: data.makeup.filter(x => x !== key),
    compOff: data.compOff.filter(x => x !== key),
    leave: data.leave.filter(x => x !== key),
  }
  if (type) next[TYPE_LIST_KEY[type]] = [...next[TYPE_LIST_KEY[type]], key].sort()
  return next
}

export type TaskStatus = 'done' | 'doing' | 'todo' | 'plan'

/** 状态由进度唯一推导，避免「進行中 + 100%」式自相矛盾（与 meta.ts 同一决策） */
export function taskStatus(t: GanttTask): TaskStatus {
  if (t.progress >= 100) return 'done'
  if (!t.start || !t.end) return 'plan'
  if (t.progress > 0) return 'doing'
  return 'todo'
}

/**
 * 状态标签：done/doing 复用 cpm.status 既有词条（同一语义不另造译法），
 * todo/plan 是本视图特有档位——待處理=已排期 0%，待排期=尚未给日期。
 */
export const TASK_STATUS_META: Record<TaskStatus, { label: string; tag: string }> = {
  done: { tag: 'green', get label() { return i18n.t('cpm.status.done', { defaultValue: '已完成' }) } },
  doing: { tag: 'blue', get label() { return i18n.t('cpm.status.doing', { defaultValue: '進行中' }) } },
  todo: { tag: 'red', get label() { return i18n.t('cpm.gantt.status.todo', { defaultValue: '待處理' }) } },
  plan: { tag: 'default', get label() { return i18n.t('cpm.gantt.status.plan', { defaultValue: '待排期' }) } },
}

/**
 * 進度五段色：0–20 紅 / 21–40 品牌橙 / 41–60 琥珀 / 61–99 藍 / 100 綠。
 * 左欄進度條與甘特色條共用同一色階，保證兩處讀數同一語義。
 */
export function progressColor(p: number): string {
  if (p >= 100) return 'var(--success)'
  if (p > 60) return 'var(--info)'
  if (p > 40) return 'var(--warning)'
  if (p > 20) return 'var(--brand)'
  return 'var(--danger)'
}

export const PROGRESS_BANDS = [
  { label: '0–20%', color: 'var(--danger)' },
  { label: '21–40%', color: 'var(--brand)' },
  { label: '41–60%', color: 'var(--warning)' },
  { label: '61–99%', color: 'var(--info)' },
  { label: '100%', color: 'var(--success)' },
]

/** 需求合并单元格色相：一律取主题令牌，深浅主题自动翻面 */
export const GROUP_COLORS = [
  'var(--brand)',
  'var(--warning)',
  'var(--info)',
  'var(--success)',
  'var(--purple)',
  'var(--info-deep)',
]

export const fmt = (d: Dayjs): string => d.format('YYYY-MM-DD')
export const shortDate = (s: string): string => dayjs(s).format('MM/DD')

export function uid(): string {
  return `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

export function isRestDay(d: Dayjs, data: Pick<GanttData, 'holidays' | 'makeup' | 'compOff' | 'leave'>): boolean {
  const key = fmt(d)
  if (data.holidays.includes(key) || data.compOff.includes(key) || data.leave.includes(key)) return true
  const weekend = d.day() === 0 || d.day() === 6
  return weekend && !data.makeup.includes(key)
}

/** 起止闭区间内的工作日数；未排期返回 0 */
export function workdayCount(start: string | null, end: string | null, data: Pick<GanttData, 'holidays' | 'makeup' | 'compOff' | 'leave'>): number {
  if (!start || !end) return 0
  let cur = dayjs(start)
  const last = dayjs(end)
  if (last.isBefore(cur)) return 0
  let n = 0
  while (cur.isBefore(last) || cur.isSame(last, 'day')) {
    if (!isRestDay(cur, data)) n += 1
    cur = cur.add(1, 'day')
  }
  return n
}

export function taskHours(t: GanttTask, data: Pick<GanttData, 'holidays' | 'makeup' | 'compOff' | 'leave'>): number {
  return workdayCount(t.start, t.end, data) * HOURS_PER_DAY
}

/** 任務排期與查詢區間是否相交（時間維度篩選口徑） */
export function overlaps(t: GanttTask, startStr: string, endStr: string): boolean {
  return !!t.start && !!t.end && t.start <= endStr && t.end >= startStr
}

/** 區間內投入工時 = 交集工作日 × 8h（匯報工時分布同一口徑） */
export function hoursInPeriod(t: GanttTask, startStr: string, endStr: string, data: Pick<GanttData, 'holidays' | 'makeup' | 'compOff' | 'leave'>): number {
  if (!t.start || !t.end) return 0
  const s = t.start > startStr ? t.start : startStr
  const e = t.end < endStr ? t.end : endStr
  if (e < s) return 0
  return workdayCount(s, e, data) * HOURS_PER_DAY
}

export function shiftDate(s: string | null, delta: number): string | null {
  return s ? fmt(dayjs(s).add(delta, 'day')) : s
}

/** 周一为一周起点 */
export function mondayOf(d: Dayjs): Dayjs {
  return d.subtract((d.day() + 6) % 7, 'day')
}

export interface DayCell {
  date: Dayjs
  key: string
  rest: boolean
  weekend: boolean
  holiday: boolean
  makeup: boolean
  compOff: boolean
  leave: boolean
  today: boolean
}

/** 台账时间轴范围：覆盖全部排期 + 今天，前后补齐整周，至少四周；
 *  focus 給定時（時間維度篩選）軸線聚焦查詢區間，不再強制四周 */
export function buildRange(groups: GanttGroup[], data: Pick<GanttData, 'holidays' | 'makeup' | 'compOff' | 'leave'>, focus?: { start: Dayjs; end: Dayjs }): DayCell[] {
  const today = dayjs()
  let min = today.subtract(3, 'day')
  let max = today.add(7, 'day')
  groups.forEach(g => g.tasks.forEach(t => {
    if (t.start && dayjs(t.start).isBefore(min)) min = dayjs(t.start)
    if (t.end && dayjs(t.end).isAfter(max)) max = dayjs(t.end)
  }))
  let start = mondayOf(min)
  let end = mondayOf(max).add(6, 'day')
  if (focus) {
    // 聚焦區間原樣呈現（單日就是一列），由視圖層按可用寬度鋪滿，不再補整周留白
    start = focus.start
    end = focus.end.isBefore(start) ? start : focus.end
  } else if (end.diff(start, 'day') < 27) {
    end = start.add(27, 'day')
  }
  const days: DayCell[] = []
  for (let cur = start; cur.isBefore(end) || cur.isSame(end, 'day'); cur = cur.add(1, 'day')) {
    const key = fmt(cur)
    const weekend = cur.day() === 0 || cur.day() === 6
    days.push({
      date: cur,
      key,
      weekend,
      rest: isRestDay(cur, data),
      holiday: data.holidays.includes(key),
      makeup: data.makeup.includes(key) && weekend,
      compOff: data.compOff.includes(key),
      leave: data.leave.includes(key),
      today: cur.isSame(today, 'day'),
    })
  }
  return days
}

/** 週序標籤：按 count 插值而不是模块级数组，切语言后立刻生效 */
export function weekName(i: number): string {
  return i18n.t('cpm.gantt.weekNth', { count: i + 1, defaultValue: '第{{count}}週' })
}

/** 甘特日列的星期缩写（单字）。语言包存 7 元素数组——数组型 key 的真源只能是静态包
 *  （sys_translation 是 key→字符串扁平表，装不下数组），故用 joinArrays 拼回字符串再拆。 */
export function weekdayShort(index: number): string {
  // 先转 unknown 再分叉：i18next 对 returnObjects 的返回类型仍是 string，
  // 直接写 typeof raw === 'string' 会让另一个分支被推成 never（tsc 报 split 不存在）
  const raw = i18n.t('cpm.gantt.weekdayShort', { returnObjects: true, joinArrays: '|' }) as unknown
  const parts = typeof raw === 'string' ? raw.split('|') : Array.isArray(raw) ? raw.map(String) : []
  return parts.length === 7 ? parts[index] : ''
}

/* ==================== 本地持久化 ==================== */

export function saveData(data: GanttData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    /* 隐私模式等写入失败不影响使用 */
  }
}

export function loadData(): GanttData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as GanttData
      if (Array.isArray(parsed.groups) && Array.isArray(parsed.holidays) && Array.isArray(parsed.makeup)) {
        // 存量旧版数据没有 compOff/leave：补空数组而不是拒加载，否则用户台账被当损坏重置
        return {
          ...parsed,
          compOff: parsed.compOff ?? [],
          leave: parsed.leave ?? [],
          groups: parsed.groups.map(g => ({
            ...g,
            tasks: g.tasks.map(t => ({ ...t, planType: t.planType ?? 'planned', insertedAt: t.insertedAt ?? null })),
          })),
        }
      }
    }
  } catch {
    /* 损坏数据回退示例 */
  }
  return seedData()
}

/* ==================== 示例数据（贴近用户 Excel 原件） ==================== */

/**
 * 例外登记：下面的 groups 是**演示内容**（用户 Excel 原件的工作项标题），不是界面文案。
 * 把它们塞进 sys_translation 会让翻译工作台多出几十条「广告销售-门店购买」之类的业务垃圾词条，
 * 而任何真实用户的数据本来就不该被翻译。负责人：fengsong7889；到期：台账迁服务端后随种子一并移除。
 */
export function seedData(): GanttData {
  const todayStr = fmt(dayjs())
  const t = (title: string, start: string | null, end: string | null, progress: number, note = '', insertedAt: string | null = null): GanttTask => {
    const history: { at: string; progress: number }[] = []
    if (start) {
      history.push({ at: start, progress: 0 })
      if (progress > 0) history.push({ at: end && end < todayStr ? end : todayStr, progress })
    }
    return { id: uid(), title, start, end, progress, note, history, planType: insertedAt ? 'inserted' : 'planned', insertedAt }
  }
  const storageNote = '1，需要考慮不同瀑布流曝光路徑（短期存儲）。\n2，滿足曝光數據匯總（長期存儲）；'
  return {
    holidays: [
      '2026-01-01', '2026-01-02', '2026-01-03',
      '2026-02-15', '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20', '2026-02-21', '2026-02-22',
      '2026-04-04', '2026-04-05', '2026-04-06',
      '2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05',
      '2026-06-19', '2026-06-20', '2026-06-21',
      '2026-09-25', '2026-09-26', '2026-09-27',
      '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07',
    ],
    makeup: ['2026-02-14', '2026-02-28', '2026-10-10'],
    compOff: [],
    leave: [],
    groups: [
      {
        id: uid(), title: '團購瀑布流調整導入研發', hue: 0,
        tasks: [
          t('瀑布流改動導入研發', '2026-11-16', '2026-11-16', 100),
          t('篩選項改動導入研發', '2026-11-16', '2026-11-16', 100),
        ],
      },
      {
        id: uid(), title: '外賣瀑布流篩選選項輸出', hue: 1,
        tasks: [
          t('外賣瀑布流查詢條件產出', '2026-11-16', '2026-11-17', 100),
          t('跟進設計產出', '2026-11-23', '2026-11-23', 60, '', '2026-11-23'),
        ],
      },
      {
        id: uid(), title: '無敵星星廣告', hue: 2,
        tasks: [
          t('【算法庫】-門店', '2026-11-18', '2026-11-18', 100),
          t('【算法庫】-商品', '2026-11-18', '2026-11-18', 100),
          t('【瀑布流策略】-門店', '2026-11-19', '2026-11-19', 100),
          t('【瀑布流策略】-商品', '2026-11-19', '2026-11-19', 100),
          t('銷售定價-門店', '2026-11-20', '2026-11-23', 90),
          t('銷售定價-商品', '2026-11-20', '2026-11-23', 90),
          t('廣告銷售-門店購買', '2026-11-24', '2026-11-25', 0),
          t('廣告銷售-商品購買', '2026-11-24', '2026-11-25', 0),
          t('廣告銷售-門店訂單', '2026-11-26', '2026-11-26', 0),
          t('廣告銷售-訂單訂單', '2026-11-26', '2026-11-26', 0, storageNote),
          t('廣告銷售-門店推廣數據', '2026-11-27', '2026-11-27', 0, storageNote),
          t('廣告銷售-商品推廣數據', '2026-11-27', '2026-11-27', 0),
          t('商家PC端', null, null, 0),
          t('商戶通APP端', null, null, 0),
        ],
      },
      {
        id: uid(), title: '門店搜索詞庫優化', hue: 3,
        tasks: [
          t('詞庫清洗與同義詞歸一', '2026-11-24', '2026-11-26', 40),
          t('灰度上線與效果回收', '2026-11-27', '2026-11-30', 0),
        ],
      },
    ],
  }
}

/* ==================== 导出 CSV（Excel 可直接打开） ==================== */

export function exportCsv(groups: GanttGroup[], data: GanttData): void {
  const esc = (v: string | number): string => `"${String(v).replace(/"/g, '""')}"`
  const lines: string[] = [
    [
      i18n.t('cpm.gantt.csv.colGroup', { defaultValue: '工作項' }),
      i18n.t('cpm.gantt.csv.colTask', { defaultValue: '任務子項' }),
      i18n.t('cpm.gantt.csv.colStart', { defaultValue: '開始日期' }),
      i18n.t('cpm.gantt.csv.colEnd', { defaultValue: '結束日期' }),
      i18n.t('cpm.gantt.csv.colHours', { defaultValue: '耗時(小時)' }),
      i18n.t('cpm.gantt.csv.colProgress', { defaultValue: '當前進度' }),
      i18n.t('cpm.gantt.csv.colStatus', { defaultValue: '完成狀態' }),
      i18n.t('cpm.gantt.csv.colNote', { defaultValue: '備註原因' }),
    ].map(esc).join(','),
  ]
  groups.forEach(g => g.tasks.forEach(t => {
    lines.push([
      g.title, t.title, t.start ?? '', t.end ?? '',
      taskHours(t, data), `${t.progress}%`,
      TASK_STATUS_META[taskStatus(t)].label, noteToText(t.note),
    ].map(esc).join(','))
  }))
  const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = i18n.t('cpm.gantt.csv.fileBase', { date: fmt(dayjs()), defaultValue: '我的工作記錄_{{date}}' })
  a.click()
  URL.revokeObjectURL(url)
}