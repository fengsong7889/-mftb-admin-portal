import { pinyin } from 'pinyin-pro'
import type { QuotaSource } from '../../api/aiMyCenter'

/* ── 类型定义 ── */

/** AI 助手未开通原因：无模型权限 / 无额度 / 两者皆无 / 额度已用完(拒绝) / 需审批 */
export type AiBlockReason = 'no-models' | 'no-quota' | 'no-both' | 'quota-exhausted' | 'needs-approval'

/* ── 常量 ── */

/** 额度维度来源 → Tag 颜色（员工/部门/职位/角色四维度 + 审批授予视觉区分） */
export const DIM_SOURCE_COLOR: Record<QuotaSource, string> = {
  employee: '#722ED1',
  department: '#1890FF',
  position: '#E8720C',
  role: '#13C2C2',
  grant: '#52C41A',
}

/** 额度维度来源 → i18n key */
export const DIM_SOURCE_LABEL_KEY: Record<QuotaSource, string> = {
  employee: 'home.usageDimSourceEmployee',
  department: 'home.usageDimSourceDepartment',
  position: 'home.usageDimSourcePosition',
  role: 'home.usageDimSourceRole',
  grant: 'home.usageDimSourceGrant',
}

/** 文件大小限制 */
export const MAX_IMAGE_SIZE = 10 * 1024 * 1024  // 10MB
export const MAX_FILE_SIZE = 5 * 1024 * 1024    // 5MB

/** 默认常用菜单 */
export const defaultFavorites = [
  'account-balance',
  'batch-query',
  'detail-query',
  'approval-center',
]

/** 快捷入口收藏上限（后端 sys_user.quick_favorites TEXT 列，前端限制防止超限） */
export const MAX_FAVORITES = 20

/* ── 纯函数 ── */

/** localStorage key（按用户隔离） */
export const FAV_KEY = (username: string) => `home_favorites:${username}`

/** 从 localStorage 读取已保存的快捷入口 */
export const loadFavorites = (username: string): string[] => {
  try {
    const raw = localStorage.getItem(FAV_KEY(username))
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch { /* 数据损坏则回退默认 */ }
  return defaultFavorites
}

/** 中文姓名转英文拼音格式：名在前、姓在后，首字母大写 */
export const chineseNameToPinyinEnglish = (name: string): string => {
  if (!name) return ''
  if (!/[\u4e00-\u9fa5]/.test(name)) return name
  const py = pinyin(name, { toneType: 'none', type: 'array' })
  if (py.length <= 1) return name
  const surname = py[0]
  const givenName = py.slice(1).join('')
  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
  return `${capitalize(givenName)} ${capitalize(surname)}`
}

/** 时段问候 */
export const getGreeting = (hour: number, t: (key: string) => string) => {
  if (hour >= 5 && hour < 11) return t('home.greetingMorning')
  if (hour >= 11 && hour < 13) return t('home.greetingNoon')
  if (hour >= 13 && hour < 18) return t('home.greetingAfternoon')
  return t('home.greetingEvening')
}

/** 将 AI 回复中的字面 \n 转为真正换行（CSS white-space: pre-wrap 负责渲染） */
export const formatAiText = (text: string) => text.replace(/\\n/g, '\n')
