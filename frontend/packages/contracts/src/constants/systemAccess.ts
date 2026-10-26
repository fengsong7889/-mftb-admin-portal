import type { TFunction } from 'i18next'

/**
 * 系統權限申請：使用场景与使用期限枚举。
 *
 * 场景是「业务动作粒度」而不是「菜单粒度」：申请人能表达自己要做什么，但拿不到、也不需要拿到
 * 系统的功能分解。2026-10 前本页让申请人勾选目标系统的菜单树，被否掉的原因有三条——
 * 把整棵功能树摊给对该系统零权限的人（架构泄露）、勾选树加「全选」与最小权限反向（诱导过度授权）、
 * 「需要哪些功能」本属审批人的专业判断（责任错位）。改口径后与 Entra Access Packages /
 * SailPoint business role 一致：申请对象是诉求或角色，不是权限点。
 *
 * code 与后端 SystemAccessConstants.ALLOWED_SCENARIOS / ALLOWED_DURATION_TYPES 同源，
 * 展示名一律走 i18n（本文件不硬编码文案），未知 code 回落显示 code 本身而不是编一个假名字。
 */
export const SYSTEM_ACCESS_SCENARIOS = [
  'daily_view',
  'data_check',
  'report_export',
  'approval_ops',
  'config_maintain',
  'other',
] as const

export type SystemAccessScenario = (typeof SYSTEM_ACCESS_SCENARIOS)[number]

/** 使用期限：长期（永不自动回收）/ 至指定日期（到期次日起自动收回本单绑上的角色） */
export const SYSTEM_ACCESS_DURATION_TYPES = ['permanent', 'until'] as const

export type SystemAccessDurationType = (typeof SYSTEM_ACCESS_DURATION_TYPES)[number]

/** 使用场景 code → 展示名 */
export function getScenarioLabel(t: TFunction, code: string): string {
  switch (code) {
    case 'daily_view':
      return t('systemAccessApply.scenarioDailyView')
    case 'data_check':
      return t('systemAccessApply.scenarioDataCheck')
    case 'report_export':
      return t('systemAccessApply.scenarioReportExport')
    case 'approval_ops':
      return t('systemAccessApply.scenarioApprovalOps')
    case 'config_maintain':
      return t('systemAccessApply.scenarioConfigMaintain')
    case 'other':
      return t('systemAccessApply.scenarioOther')
    default:
      // 后端将来加场景而前端未同步时，显示 code 好过显示错的名字：审批人看得出这里有个未识别项
      return code
  }
}

/**
 * 使用期限 → 展示名。
 *
 * @param untilDate 截止日（yyyy-MM-dd）；durationType=until 且有值时拼在文案后面，
 *                  让审批人在列表/详情里一眼看到「到什么时候」（到期次日起权限会被自动收回）
 */
export function getDurationLabel(
  t: TFunction,
  durationType: string | null | undefined,
  untilDate?: string | null,
): string {
  if (durationType === 'until') {
    return untilDate
      ? t('systemAccessApply.durationUntilDate', { date: untilDate })
      : t('systemAccessApply.durationUntil')
  }
  if (durationType === 'permanent') {
    return t('systemAccessApply.durationPermanent')
  }
  // 历史单据没有期限字段（2026-10 前提交）：明说未采集，不要用「长期」糊过去
  return t('systemAccessApply.durationNotCollected')
}
