/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import dayjs, { type Dayjs } from 'dayjs'
import i18n from '@/i18n'
// 只取类型不取运行时：这个模块是台账的纯数据模型（可单测、无请求），
// 但 RDM 回写形状已经进了行模型，复制一份定义就会与条目侧分叉
import type { CpmRdmSyncVO } from '@/api/cpm'
import { noteToText } from './noteRich'

/**
 * 「項目甘特台账」视图的本地数据模型与工作日日历引擎（阶段一 UI）。
 *
 * 口径（用户硬性要求）：耗时只算工作日——周末与节假日一律剔除，
 * 调休上班的周末按工作日计。耗时 = 起止区间内工作日数 × 8h。
 * 节假日/调休名单可在界面「節假日口徑」里编辑，存本地。
 */

export const HOURS_PER_DAY = 8
/**
 * 单个自然日的绝对工时上限（小时）。
 *
 * <p>正常口径是 8h，但加班是真实存在的投入：把上限钉在 8h 会让人无法记录
 * 「一个工作日干了 12 小时」，只能去拉长排期凑数字——那等于逼用户伪造排期。
 * 24h 是「一天最多装得下多少」的物理上限，不是鼓励值；超过它一律拒绝。
 */
export const HOURS_CAP_PER_DAY = 24
/**
 * 单条子任務工时的存储天花板：对齐服务端列宽 DECIMAL(4,1)（与 CpmConstants.WORKLOG_HOURS_MAX 同源）。
 *
 * <p>一个跳半年的任务按 × 24h 会算出六千多小时，那个数根本存不下去；前端不封这一层
 * 就会做出一个「能填进去、保存才报错」的输入框。
 */
export const HOURS_STORAGE_MAX = 999
export const STORAGE_KEY = 'cpm-worklog-gantt-v1'

/** 服务端进度快照种类；前端只展示，不自行实现回退规则。 */
export type PeriodProgressKind = 'live' | 'period' | 'stale' | 'notStarted' | 'legacy' | 'future'
export interface PeriodProgress { value: number; kind: PeriodProgressKind }

/**
 * 读取服务端算好的周期快照；旧后端未回传时只回落当前值，不在前端重算流水。
 *
 * <p>回落不伪造历史：滚动发布期间若 Pages 先于后端上线，历史档暂时显示当前值，
 * 也不会在前端实现第二套 R1–R5 与后端分叉。
 */
export function periodProgressOfTask(t: GanttTask): PeriodProgress {
  return { value: t.periodProgress ?? t.progress, kind: t.periodProgressKind ?? 'live' }
}

export interface GanttTask {
  id: string
  title: string
  /** YYYY-MM-DD；null = 未排期 */
  start: string | null
  end: string | null
  /** 0-100：始终是此刻真实最新进度，编辑提交改的是它 */
  progress: number
  /** 服务端算的查询周期期初/期末快照；旧后端缺省时由适配层回落当前值 */
  periodStartProgress?: number
  periodProgress?: number
  periodProgressKind?: PeriodProgressKind
  /** 全部流水的最新日期；用于判断往期快照卡是否冗余 */
  latestProgressAt?: string | null
  note: string
  /** 進度流水（匯報「進度變更」聚合的唯一來源）；舊存量數據可缺省 */
  history?: { at: string; progress: number }[]
  /** 計劃屬性：原計劃 / 臨時插入（計劃凍結後新安排）；舊存量默認 planned */
  planType?: 'planned' | 'inserted'
  /** 標記為臨時插入的日期（YYYY-MM-DD）；原計劃為 null */
  insertedAt?: string | null
  /**
   * 手工耗時覆蓋（小時）。缺省/ null 時耗時回落到「區間工作日 × 8h」的計算值；
   * 一旦用戶在耗時列改過就以它為準——計算值是預算口徑，人是唯一能說清實際投入的。
   */
  hoursOverride?: number | null
  /** 來源系統類型（meeting/rdm_task/…）；手工錄入為 null */
  sourceType?: string | null
  /** 來源對象 ID（與 sourceType 成對，重复导入由服务端唯一键裁决） */
  sourceRef?: string | null
  /**
   * 來源已取消（目前只有會議會置 true）。
   *
   * <p>它不是「進度 0%」也不該被刪掉：會被人取消不代表自己沒做過安排，
   * 事实必须留着，只是不再占用日常注意力。服务端由台账读取时对账得出。
   */
  cancelled?: boolean
  /** RDM 回寫狀態（只有关联 RDM 任務的行有值）：台账不另立口径，沿用条目侧结构 */
  rdmSync?: CpmRdmSyncVO | null
}

export interface GanttGroup {
  id: string
  title: string
  /** GROUP_COLORS 下标，决定合并单元格底色 */
  hue: number
  tasks: GanttTask[]
  /**
   * 未分组虚拟分组（服务端 id=0 容器）：只读——不给改名/删除，
   * 标题由界面按语言渲染「未分組記錄」；里面的子任务照常编辑。
   * 本地旧台账没有这一档，缺省即真实工作項。
   */
  virtual?: boolean
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

export type TaskStatus = 'done' | 'doing' | 'todo' | 'plan' | 'cancelled'

/**
 * 状态推导：来源已取消优先于进度。
 *
 * <p>不让进度参与：一场会取消了但人确实为它排过时间，进度仍停在 60% 时，
 * 把它显示成「進行中」就是在催一件已经不存在的事；反过来也不能因为来源取消就把进度清零，
 * 那是删事实。「已取消」单独成档，筛得出、看得见。
 */
export function taskStatus(t: GanttTask): TaskStatus {
  if (t.cancelled) return 'cancelled'
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
  // 灰色而不标红：红代「异常/失败」，会议被取消不是本人的过错，也不该进异常统计
  cancelled: { tag: 'default', get label() { return i18n.t('cpm.status.cancelled', { defaultValue: '已取消' }) } },
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

/**
 * 手工耗时的绝对上限：交集工作日数 × 24h，未排期时退回一个工作日。
 *
 * <p>用工作日数而不是自然日数：周末与节假日根本不在岗，把它们算进上限就等于
 * 承认「七天连轴」是正常安排，而这一列的口径本来就是工作日。
 */
export function hoursCap(workdays: number): number {
  return Math.min(Math.max(workdays, 1) * HOURS_CAP_PER_DAY, HOURS_STORAGE_MAX)
}

/**
 * 把合计拆成正常工时与加班工时——加班不另存一列，只由「合计 − 工作日 × 8h」派生。
 *
 * <p>派生而不是入库：加班量完全由已有的两个数（合计、工作日数）决定，存成第三列
 * 就会在用户改排期时留下一个没人维护的旧数字，而它会直接进周报。
 * <p>正常工时不会超过合计：填 3 小时就是 3 小时正常、0 加班，不会因为「本来有 16h
 * 额度」而虚报成 16h。
 */
export function splitHours(total: number, workdays: number): { normal: number; overtime: number } {
  const normal = Math.min(Math.max(total, 0), workdays * HOURS_PER_DAY)
  return { normal, overtime: Math.max(0, Math.max(total, 0) - normal) }
}

/** 任務排期與查詢區間是否相交（時間維度篩選口徑） */
export function overlaps(t: GanttTask, startStr: string, endStr: string): boolean {
  return !!t.start && !!t.end && t.start <= endStr && t.end >= startStr
}

/**
 * 整段耗時：手工覆蓋值優先，其次「工作日 × 8h」的計算值。
 *
 * <p>手工值不参与工作日换算：用户填 3 小时就是 3 小时，跨了几个周末与它无关——
 * 計算值是「没量过」时的默认口径，不是对实际投入的约束。
 */
export function taskHours(t: GanttTask, data: Pick<GanttData, 'holidays' | 'makeup' | 'compOff' | 'leave'>): number {
  if (t.hoursOverride != null && t.hoursOverride > 0) return t.hoursOverride
  return workdayCount(t.start, t.end, data) * HOURS_PER_DAY
}

/** 该行的加班工时（合计超出工作日 × 8h 的部分）；无手工覆盖时恒为 0 */
export function taskOvertimeHours(t: GanttTask, data: Pick<GanttData, 'holidays' | 'makeup' | 'compOff' | 'leave'>): number {
  if (t.hoursOverride == null || t.hoursOverride <= 0) return 0
  return splitHours(t.hoursOverride, workdayCount(t.start, t.end, data)).overtime
}

/**
 * 區間內投入工時：手工值就是手工值（不按区间折算），无覆盖时才取交集工作日 × 8h。
 *
 * <p>加班拆分同样走这一条：合计里超出「交集工作日 × 8h」的部分就是本期加班，
 * 不在这里另算一套，否则台账列、统计卡与周报会各自给出对不上的正常/加班数字。
 */
export function hoursInPeriod(t: GanttTask, startStr: string, endStr: string, data: Pick<GanttData, 'holidays' | 'makeup' | 'compOff' | 'leave'>): number {
  if (!t.start || !t.end) return 0
  // 手工填的总工时不拆到周期：把 12h 按工作日比例劈成「本周 4.3h」是编出来的数字，
  // 用户看到只会怀疑自己填错了；所以有覆盖值时只在与本周期相交时整笔计入
  if (t.hoursOverride != null && t.hoursOverride > 0) return overlaps(t, startStr, endStr) ? t.hoursOverride : 0
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