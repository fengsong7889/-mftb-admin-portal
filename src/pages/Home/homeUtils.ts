import { pinyin } from 'pinyin-pro'
import type { MenuVO } from '../../api/menu'
import type { QuotaSource } from '../../api/aiMyCenter'

/* ── 类型定义 ── */

/** AI 助手未開通原因：無模型權限 / 無額度 / 兩者皆無 / 額度已用完(拒絕) / 需審批 */
export type AiBlockReason = 'no-models' | 'no-quota' | 'no-both' | 'quota-exhausted' | 'needs-approval'

/* ── 常量 ── */

/** 額度維度來源 → Tag 顏色（員工/部門/職位/角色四維度 + 審批授予視覺區分） */
export const DIM_SOURCE_COLOR: Record<QuotaSource, string> = {
  employee: '#722ED1',
  department: '#1890FF',
  position: '#E8720C',
  role: '#13C2C2',
  grant: '#52C41A',
}

/** 額度維度來源 → i18n key */
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

/* ── 纯函数 ── */

/** localStorage key（按用戶隔離） */
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

/** 將 AI 回覆中的字面 \n 轉為真正換行（CSS white-space: pre-wrap 負責渲染） */
export const formatAiText = (text: string) => text.replace(/\\n/g, '\n')

/** 递归收集菜单 key → 名称映射 */
export const collectMenuNames = (menus: MenuVO[], map: Record<string, string>) => {
  menus.forEach((m) => {
    map[m.menuKey] = m.name
    if (m.children?.length) collectMenuNames(m.children, map)
  })
}
