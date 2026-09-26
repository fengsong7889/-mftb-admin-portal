/** 门户展示映射只选择文案与插画，不参与系统准入或导航判断。 */
const PORTAL_SYSTEM_KEYS = [
  'ads', 'merchant', 'search', 'finance', 'ai', 'hr', 'eam', 'oa', 'iam', 'platform',
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
