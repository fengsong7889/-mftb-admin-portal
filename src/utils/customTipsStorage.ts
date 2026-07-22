/**
 * 自定义页面提示存储工具
 * 使用 localStorage 存储用户自定义的菜单说明
 */

export interface CustomPageTips {
  /** PRD需求文档（结构化数据或富文本HTML） */
  prdContent?: {
    description?: string
    features?: { label: string; desc: string }[]
    searchConditions?: { label: string; desc: string }[]
    fields?: { label: string; desc: string }[]
    actions?: string[]
    interaction?: string[]
    rules?: string[]
    formulas?: string[]
    notes?: string[]
  } | string
  /** 小蜜蜂知识库（气泡提示） */
  tips?: string[]
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
    prdContent: customTips.prdContent || defaultTips.prdContent,
    tips: customTips.tips && customTips.tips.length > 0 ? customTips.tips : defaultTips.tips,
    lastEdited: customTips.lastEdited,
    lastEditedBy: customTips.lastEditedBy,
  }
}
