/**
 * 假勤设置的界面元数据：分组标题、字段标签、口径说明的 i18n 键。
 *
 * 为什么这些文案不在后端：设置页要支持五种语言，后端下发繁体句子会让其它四种语言
 * 永远显示中文（这类缺陷在编译期与接口测试里都看不出来）。因此契约是
 * **后端给 key + 值 + editable，前端给词**：后端 AttendanceSettingItem 只有
 * key/group/value/valueKey/editable/configKey 六个字段。
 *
 * valueKey 也是 i18n 键：只读口径说明（计算粒度、宽限出处、来源优先级、留存年限）
 * 的"值"本身就是一句话，同样必须由前端翻译；只有同步 cron 这类运行时数据才用 value 原样展示。
 */

/** 分组码 → 标题 i18n 键与配色（规范 §C.3 图标色块约定） */
export const SETTING_GROUP_META: Record<string, { titleKey: string; color: string; bg: string }> = {
  calculation: { titleKey: 'attendance.settingGroupCalculation', color: '#fa8c16', bg: '#fff7e6' },
  overtime: { titleKey: 'attendance.settingGroupOvertime', color: '#722ed1', bg: '#f9f0ff' },
  source: { titleKey: 'attendance.settingGroupSource', color: '#1890ff', bg: '#e6f7ff' },
  payroll: { titleKey: 'attendance.settingGroupPayroll', color: '#13a8a8', bg: '#e6fffb' },
  retention: { titleKey: 'attendance.settingGroupRetention', color: '#52c41a', bg: '#f6ffed' },
}

/** 设置项 key → 标签 i18n 键 */
export const SETTING_LABEL_KEY: Record<string, string> = {
  grain: 'attendance.settingLabelGrain',
  grace: 'attendance.settingLabelGrace',
  absentRule: 'attendance.settingLabelAbsentRule',
  otThreshold: 'attendance.settingLabelOtThreshold',
  otStep: 'attendance.settingLabelOtStep',
  freezeDay: 'attendance.settingLabelFreezeDay',
  sourcePriority: 'attendance.settingLabelSourcePriority',
  syncTime: 'attendance.settingLabelSyncTime',
  retention: 'attendance.settingLabelRetention',
}

/** 设置项 key → 口径说明 i18n 键（说明写的是"真值出处"，避免 HR 误以为这里能改） */
export const SETTING_HINT_KEY: Record<string, string> = {
  grain: 'attendance.settingHintGrain',
  grace: 'attendance.settingHintGrace',
  absentRule: 'attendance.settingHintAbsentRule',
  otThreshold: 'attendance.settingHintOtThreshold',
  otStep: 'attendance.settingHintOtStep',
  freezeDay: 'attendance.settingHintFreezeDay',
  sourcePriority: 'attendance.settingHintSourcePriority',
  syncTime: 'attendance.settingHintSyncTime',
  retention: 'attendance.settingHintRetention',
}

/** 分组展示顺序：与后端 list() 的顺序一致，未登记的分组排最后而不是丢弃 */
export const SETTING_GROUP_ORDER = ['calculation', 'overtime', 'source', 'payroll', 'retention']

export function orderedGroups(groups: string[]): string[] {
  const known = SETTING_GROUP_ORDER.filter(code => groups.includes(code))
  const unknown = groups.filter(code => !SETTING_GROUP_ORDER.includes(code))
  return [...known, ...unknown]
}
