/**
 * 员工展示统一口径：**姓名（工号）**。
 *
 * <p>为什么抽成工具：同一个员工在需求清单、任务表、甘特图、验收页各自拼字符串，
 * 很容易出现「这里带工号、那里只有名字」。列表是管理识别人的主场景，只有姓名时
 * 同名同事无法区分，催办和派活都会找错人。
 *
 * <p>admin 除外：内置超管没有工号，强制拼括号只会显示「管理員（）」。
 */
const SYSTEM_ADMIN_NAMES = new Set(['admin', 'administrator', '管理員', '管理员', 'system'])

/** 内置超管/系统账号是否需要隐藏工号 */
export function isSystemAdminName(name?: string | null): boolean {
  return !!name && SYSTEM_ADMIN_NAMES.has(name.trim().toLowerCase())
}

/** 姓名（工号）；无工号或超管账号时只给姓名，不留空括号 */
export function formatEmployee(name?: string | null, empNo?: string | null): string {
  if (!name) return ''
  const trimmed = name.trim()
  if (!empNo || isSystemAdminName(trimmed)) return trimmed
  return `${trimmed}（${empNo}）`
}

/** 列表单元格：没有姓名时统一显示占位符，不显示空白 */
export function formatEmployeeOrDash(name?: string | null, empNo?: string | null, dash = '-'): string {
  return formatEmployee(name, empNo) || dash
}
