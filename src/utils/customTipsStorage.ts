/**
 * 自定义页面提示存储工具
 * 使用 localStorage 存储用户自定义的菜单说明
 */

export interface CustomPageTips {
  /** 自定义气泡提示 */
  tips?: string[]
  /** 自定义交互说明 */
  interaction?: string[]
  /** 自定义公式计算 */
  formulas?: string[]
  /** 自定义取值规则 */
  rules?: string[]
  /** 最后编辑时间 */
  lastEdited?: string
  /** 最后编辑人 */
  lastEditedBy?: string
}

const STORAGE_KEY = 'custom_page_tips'

/**
 * 获取所有自定义页面提示
 */
export function getAllCustomTips(): Record<string, CustomPageTips> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? JSON.parse(stored) : {}
  } catch {
    return {}
  }
}

/**
 * 获取指定页面的自定义提示
 */
export function getCustomTips(pathname: string): CustomPageTips | null {
  const all = getAllCustomTips()
  return all[pathname] || null
}

/**
 * 保存指定页面的自定义提示
 */
export function saveCustomTips(pathname: string, tips: CustomPageTips): void {
  const all = getAllCustomTips()
  all[pathname] = {
    ...tips,
    lastEdited: new Date().toLocaleString('zh-TW'),
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
}

/**
 * 删除指定页面的自定义提示（恢复默认）
 */
export function deleteCustomTips(pathname: string): void {
  const all = getAllCustomTips()
  delete all[pathname]
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
}

/**
 * 合并默认提示和自定义提示
 * 自定义提示优先级更高
 */
export function mergeTips(
  defaultTips: Partial<CustomPageTips>,
  customTips: CustomPageTips | null
): CustomPageTips {
  if (!customTips) return defaultTips

  return {
    tips: customTips.tips && customTips.tips.length > 0 ? customTips.tips : defaultTips.tips,
    interaction: customTips.interaction && customTips.interaction.length > 0
      ? customTips.interaction : defaultTips.interaction,
    formulas: customTips.formulas && customTips.formulas.length > 0
      ? customTips.formulas : defaultTips.formulas,
    rules: customTips.rules && customTips.rules.length > 0
      ? customTips.rules : defaultTips.rules,
    lastEdited: customTips.lastEdited,
    lastEditedBy: customTips.lastEditedBy,
  }
}
