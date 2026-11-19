/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import i18n from '@/i18n'

/**
 * 条目状态。
 *
 * todo/doing/done/blocked 与后端 `biz_cpm_item.status` CHECK 同源；
 * cancelled/deferred 是阶段三新增的两类事实——「不做了」和「改期了」既不是受阻也不是待办，
 * 混在 blocked 里会让催办照发、混在 todo 里会让完成率虚高（CHECK 放宽见 `cpm:schema:v1.2`）。
 *
 * 刻意不另立 `completion_status` 第二列：两个状态字段必然长出「進行中 + 已完成」
 * 这种自相矛盾的组合（RDM 曾因此修过「進行中 + 100%」的矛盾任务）。
 */
export type CpmStatusValue = 'todo' | 'doing' | 'done' | 'blocked' | 'cancelled' | 'deferred'

export const CpmStatus = {
  TODO: 'todo',
  DOING: 'doing',
  DONE: 'done',
  BLOCKED: 'blocked',
  CANCELLED: 'cancelled',
  DEFERRED: 'deferred',
} as const satisfies Record<string, CpmStatusValue>

/**
 * 状态文案表：取值一律用 getter，而不是模块级常量。
 *
 * 为什么（与 `meetingMeta.ts` 同一决策）：模块级 `i18n.t()` 在 import 那一刻就把词定成
 * 当时的语言，用户切换语言后组件重渲染仍拿不到新词——比不接 i18n 更难查。
 * getter 在每次读取时求值，于是 `CPM_STATUS_LABELS[status]` 这种既有写法一处都不用改，
 * 换语言却立刻生效。`defaultValue` 是繁中兜底真值：语言包缺词时界面仍是中文而不是 key。
 */
export const CPM_STATUS_LABELS: Record<CpmStatusValue, string> = {
  get todo() { return i18n.t('cpm.status.todo', { defaultValue: '待辦' }) },
  get doing() { return i18n.t('cpm.status.doing', { defaultValue: '進行中' }) },
  get done() { return i18n.t('cpm.status.done', { defaultValue: '已完成' }) },
  get blocked() { return i18n.t('cpm.status.blocked', { defaultValue: '受阻' }) },
  get cancelled() { return i18n.t('cpm.status.cancelled', { defaultValue: '已取消' }) },
  get deferred() { return i18n.t('cpm.status.deferred', { defaultValue: '延期' }) },
}

/** 来源系统标签（与后端 `biz_cpm_item.source_type` 同源；手动记录不标注，所以没有 manual） */
export const CPM_SOURCE_LABELS: Record<string, string> = {
  get ai() { return i18n.t('cpm.source.ai', { defaultValue: 'AI 整理' }) },
  get rdm_requirement() { return i18n.t('cpm.source.rdmRequirement', { defaultValue: 'RDM 需求' }) },
  get rdm_task() { return i18n.t('cpm.source.rdmTask', { defaultValue: 'RDM 任務' }) },
  get meeting_action() { return i18n.t('cpm.source.meetingAction', { defaultValue: '會議行動項' }) },
}

/**
 * 分组色一律走主题令牌而不是裸色：已取消用 text-3（中性灰）而不是 danger 红——
 * 取消不是错误，标红会让人不敢取消，进而长出「僵尸待办」。
 */
export const CPM_STATUS_ACCENTS: Record<CpmStatusValue, string> = {
  [CpmStatus.TODO]: 'var(--warning)',
  [CpmStatus.DOING]: 'var(--info)',
  [CpmStatus.DONE]: 'var(--success)',
  [CpmStatus.BLOCKED]: 'var(--danger)',
  [CpmStatus.DEFERRED]: 'var(--purple)',
  [CpmStatus.CANCELLED]: 'var(--text-3)',
}

/**
 * 展示顺序：正在进行的排最前，已取消永远垫底。
 * 顺序是真值而不是各页面自行排序，否则日视图与汇报明细会给出两种「重要程度」。
 */
export const CPM_STATUS_ORDER: CpmStatusValue[] = [
  CpmStatus.DOING,
  CpmStatus.TODO,
  CpmStatus.DONE,
  CpmStatus.BLOCKED,
  CpmStatus.DEFERRED,
  CpmStatus.CANCELLED,
]

/** 默认折叠的状态：不参与日常注意力，但事实必须看得见（折叠 ≠ 隐藏） */
export const CPM_STATUS_DEFAULT_COLLAPSED: CpmStatusValue[] = [CpmStatus.CANCELLED]

/** Tag 的色板名（不是 CSS 色值）：列表行内标注用，与分组令牌色各自服务组件与文件版式 */
export const CPM_STATUS_TAG_COLORS: Record<CpmStatusValue, string> = {
  [CpmStatus.TODO]: 'orange',
  [CpmStatus.DOING]: 'blue',
  [CpmStatus.DONE]: 'green',
  [CpmStatus.BLOCKED]: 'red',
  [CpmStatus.DEFERRED]: 'purple',
  [CpmStatus.CANCELLED]: 'default',
}

/**
 * 汇报周期。
 *
 * `day` 是阶段三新增的**查看档位**：日报不落 `biz_cpm_report` 实体（后端 period_type 的 CHECK
 * 不放宽），它只是「条目按日投影」——给日报加发布动作等于给每个人每天多一个打卡任务。
 */
export type CpmPeriodValue = 'day' | 'week' | 'month' | 'quarter'

export const CpmPeriod = {
  DAY: 'day',
  WEEK: 'week',
  MONTH: 'month',
  QUARTER: 'quarter',
} as const satisfies Record<string, CpmPeriodValue>

export const CPM_PERIOD_LABELS: Record<CpmPeriodValue, string> = {
  get day() { return i18n.t('cpm.period.day', { defaultValue: '日報' }) },
  get week() { return i18n.t('cpm.period.week', { defaultValue: '週報' }) },
  get month() { return i18n.t('cpm.period.month', { defaultValue: '月報' }) },
  get quarter() { return i18n.t('cpm.period.quarter', { defaultValue: '季度報告' }) },
}

/** 可发布的周期（日报只读不可发布；与后端 period_type CHECK 一致） */
export const PUBLISHABLE_PERIODS: CpmPeriodValue[] = ['week', 'month', 'quarter']

/** 成果认定类型：与 biz_cpm_recognition.kind CHECK 一致 */
export const RecognitionKind = {
  HIGHLIGHT: 'highlight',
  MILESTONE: 'milestone',
} as const
export type RecognitionKindValue = 'highlight' | 'milestone'

export const RECOGNITION_KIND_LABELS: Record<RecognitionKindValue, string> = {
  get highlight() { return i18n.t('cpm.recognition.kind.highlight', { defaultValue: '亮點' }) },
  get milestone() { return i18n.t('cpm.recognition.kind.milestone', { defaultValue: '里程碑' }) },
}
