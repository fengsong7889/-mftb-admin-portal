import { pinyin } from 'pinyin-pro'
import type { QuotaSource } from '@/api/aiMyCenter'
import type { MenuVO } from '@/api/menu'
import { resolveMenuPath } from '@/constants/menuDataSource'

/* ── 类型定义 ── */

/** AI 助手未开通原因：无模型权限 / 无额度 / 两者皆无 / 额度已用完(拒绝) / 需审批 */
/**
 * AI 助手拦截原因。
 *
 * `check-failed`：额度校验接口本身失败（网络/5xx/超时）且从未拿到任何结果。
 * 必须作为一个独立拦截态存在：旧实现把校验失败静默吞掉，blockReason 落到 null，
 * 造成「后端拒不了但界面看起来可用」的 fail-open，与额度默认拒绝口径相悖。
 */
export type AiBlockReason = 'no-models' | 'no-quota' | 'no-both' | 'quota-exhausted' | 'needs-approval' | 'check-failed'

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

export interface HomeMenu {
  key: string
  label: string
  nameEn?: string | null
  icon?: string
  path: string
  group: string
}

const HOME_MENU_TYPE = { DIRECTORY: 1, MENU: 2 } as const
const ENABLED_MENU_STATUS = 1
const HOME_HIDDEN_MENU_KEYS = new Set(['ai-access-request'])

/**
 * 系统首页只消费已成功加载的服务端导航；公共首页可传入全量菜单树。
 * 系统导航省略归属时继承当前系统，但显式属于其他系统的节点不得混入。
 * 这是入口展示过滤，不替代后端业务鉴权，也不回写用户的全局收藏。
 */
export function collectHomeMenus(
  tree: MenuVO[],
  hasMenuPermission: (key: string) => boolean,
  systemCode: string | null = null,
): HomeMenu[] {
  const result: HomeMenu[] = []
  const seen = new Set<string>()
  const visit = (nodes: MenuVO[], group: string, inheritedSystem: string | null) => {
    for (const node of nodes) {
      if (node.status !== ENABLED_MENU_STATUS || HOME_HIDDEN_MENU_KEYS.has(node.menuKey)) continue
      const owner = node.systemCode ?? inheritedSystem
      if (systemCode && owner !== systemCode) continue
      const path = resolveMenuPath(node)
      if (node.type === HOME_MENU_TYPE.MENU && path && hasMenuPermission(node.menuKey) && !seen.has(node.menuKey)) {
        result.push({
          key: node.menuKey, label: node.name, nameEn: node.nameEn, icon: node.icon,
          path, group: group || node.parentName || '',
        })
        seen.add(node.menuKey)
      }
      if (node.children?.length) {
        visit(node.children, node.type === HOME_MENU_TYPE.DIRECTORY ? node.name : group, owner)
      }
    }
  }
  visit(tree, '', systemCode)
  return result
}

/** localStorage key（按用户隔离） */
export const FAV_KEY = (username: string) => `home_favorites:${username}`

/** 快捷入口面板折叠态（全局偏好：聊天窗口宽度优先是首页级选择，不按用户区分） */
export const QUICK_PANEL_COLLAPSED_KEY = 'home_quick_panel_collapsed'

/** 快捷入口面板宽度（拖拽结果，单位 px） */
export const QUICK_PANEL_WIDTH_KEY = 'home_quick_panel_width'

/** 面板宽度边界：下限保证搜索框与收藏项不被压扁，上限保证聊天区始终是主角 */
export const DEFAULT_QUICK_PANEL_WIDTH = 300
export const MIN_QUICK_PANEL_WIDTH = 220
export const MAX_QUICK_PANEL_WIDTH = 480

/** 收藏为空时的一次性收起建议，提示过后不再打扰 */
export const QUICK_PANEL_HINT_KEY = 'home_quick_panel_hint_shown'
export const QUICK_PANEL_HINT_NOTIFICATION_ID = 'home-quick-collapse-hint'

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
