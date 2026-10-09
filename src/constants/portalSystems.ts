import type { TFunction } from 'i18next'

/** 门户展示映射只选择文案与插画，不参与系统准入或导航判断。 */
const PORTAL_SYSTEM_KEYS = [
  'ads', 'merchant', 'search', 'finance', 'ai', 'hr', 'eam', 'rdm', 'oa', 'iam', 'platform',
  'merchantWorkbench', 'translation',
] as const

export type PortalSystemKey = (typeof PORTAL_SYSTEM_KEYS)[number]

/** 系统品牌图标兜底；优先使用门户接口配置的图标，不参与授权判断。 */
export const PORTAL_SYSTEM_ICONS: Record<PortalSystemKey, string> = {
  ads: 'AimOutlined',
  merchant: 'ShopOutlined',
  search: 'SearchOutlined',
  finance: 'AccountBookOutlined',
  ai: 'RobotOutlined',
  hr: 'TeamOutlined',
  eam: 'InboxOutlined',
  rdm: 'ProjectOutlined',
  oa: 'SolutionOutlined',
  iam: 'SafetyCertificateOutlined',
  platform: 'SettingOutlined',
  merchantWorkbench: 'ShopOutlined',
  translation: 'GlobalOutlined',
}

/** 优先业务编码；自定义目录保留原始名称匹配，切换语言不会改变场景。 */
export function getPortalSystemKey(code: string, name: string): PortalSystemKey | null {
  const identity = `${code} ${name}`
  if (/翻[译譯]|translation|i18n/i.test(identity)) return 'translation'
  if (code === 'seller' || /(?:商家|商[户戶]).*工作[台臺]|merchant[-_ ]?(?:workbench|workspace|console|portal)/i.test(identity)) return 'merchantWorkbench'
  const known = PORTAL_SYSTEM_KEYS.find(key => key === code)
  if (known) return known
  if (/平台|platform|system[-_ ]?(?:config|settings)/i.test(identity)) return 'platform'
  return null
}

/** 系统名称展示的最小数据来源（sys_system 目录 / 门户上下文 / 授权快照均满足）。 */
export interface SystemNameSource {
  code: string
  name: string
  nameEn?: string | null
}

/**
 * 全局唯一的系统名称取名入口。
 * <p>为什么必须统一：门户卡片、侧边栏品牌、系统切换器、首页、授权中心历史上各自取名，
 * 有的直接读 `sys_system.name`，有的走 `portal.systems.*.name` 语言包，导致同一系统在
 * 不同界面显示成「HR 系統 / 人力資源系統」两套名字。所有界面一律经此函数取名，
 * 语言包为真值，`sys_system` 仅提供语言包缺失时的兜底与自定义系统的原始名。
 * @param language 当前界面语言；非中文时优先用英文名列兜底，避免中文兜底混进外语界面
 */
export function getSystemDisplayName(
  t: TFunction,
  system: SystemNameSource,
  language?: string,
): string {
  const key = getPortalSystemKey(system.code, system.name) ?? system.code
  const fallback = (language && !language.startsWith('zh') && system.nameEn) || system.name
  return t(`portal.systems.${key}.name`, { defaultValue: fallback })
}
