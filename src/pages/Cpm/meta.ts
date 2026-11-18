/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import type { CpmItemVO } from '@/api/cpm'

/**
 * 持續績效系統（cpm）前端常量。
 *
 * 只保留「枚举语义 + 展示文案」：数据形状一律用 @/api/cpm 的契约类型（与后端 CpmDto 逐字对应），
 * 页面本地再定义一套 interface 就是第二真源——第二阶段接通后端后，这里就是漂移的起点。
 */

/** 条目状态：与后端 biz_cpm_item.status CHECK 一致 */
export const CpmStatus = {
  TODO: 'todo',
  DOING: 'doing',
  DONE: 'done',
  BLOCKED: 'blocked',
} as const
export type CpmStatusValue = CpmItemVO['status']

export const CPM_STATUS_LABELS: Record<CpmStatusValue, string> = {
  [CpmStatus.TODO]: '待辦',
  [CpmStatus.DOING]: '進行中',
  [CpmStatus.DONE]: '已完成',
  [CpmStatus.BLOCKED]: '受阻',
}

/** 汇报周期：与 biz_cpm_report.period_type CHECK 一致 */
export const CpmPeriod = {
  WEEK: 'week',
  MONTH: 'month',
  QUARTER: 'quarter',
} as const
export type CpmPeriodValue = 'week' | 'month' | 'quarter'

export const CPM_PERIOD_LABELS: Record<CpmPeriodValue, string> = {
  [CpmPeriod.WEEK]: '週報',
  [CpmPeriod.MONTH]: '月報',
  [CpmPeriod.QUARTER]: '季度報告',
}

/** 成果认定类型：与 biz_cpm_recognition.kind CHECK 一致 */
export const RecognitionKind = {
  HIGHLIGHT: 'highlight',
  MILESTONE: 'milestone',
} as const
export type RecognitionKindValue = 'highlight' | 'milestone'

export const RECOGNITION_KIND_LABELS: Record<RecognitionKindValue, string> = {
  [RecognitionKind.HIGHLIGHT]: '亮點',
  [RecognitionKind.MILESTONE]: '里程碑',
}
