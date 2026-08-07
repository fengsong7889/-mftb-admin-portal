import i18n from 'i18next'

/**
 * 菜单 key → 英文名称 映射表（方案 A）
 *
 * 切換英文時，菜單名稱優先取此映射；未覆蓋的菜單（如菜單配置頁後續新增）回退顯示中文。
 * 修改翻譯統一改這裡，與 src/i18n/locales/en.json 互不干擾。
 */
export const MENU_NAME_EN: Record<string, string> = {
  // 首頁
  'home': 'Home',
  // 商戶集團管理
  'merchant_group': 'Merchant Group',
  'merchant-group-list': 'Group Management',
  'store-list': 'Store Management',
  // 商家推广工具
  'merchant_promotion': 'Merchant Promotion Tools',
  'promotion-dashboard': 'Dashboard',
  'promotion-algorithm': 'Algorithm Library',
  'promotion-slot-config': 'Feed Strategy',
  'promotion-waterfall': 'Sales Pricing',
  'gift-manage': 'Gift Management',
  'gift-detail': 'Promotion Gifts',
  'gift-consume-detail': 'Consumption Details',
  'ad-sales': 'Ad Sales',
  'promotion-word-library': 'Word Library',
  // 推广通
  'promotion-tool': 'Promotion Pass',
  'promotion_tool': 'Promotion Pass',
  'promotion-sales-config': 'Store Promotion',
  'promotion-report-group': 'Report Analysis',
  'promotion-report-overview': 'Overview',
  'promotion-report-order': 'Order Report',
  'promotion-report-compare': 'Type Comparison',
  // 搜索管理
  'search': 'Search Management',
  'search-config-new': 'Search Config',
  'global-config': 'Global Config',
  'channel-strategy': 'Dimension Strategy',
  'search-guide': 'Search Guide',
  'hint-config': 'Hint Config',
  'hot-search-config': 'Hot Search Config',
  'search-weight-config': 'Weight Control',
  'search-library': 'Search Library',
  'word-segmentation': 'Word Segmentation',
  'synonym-config': 'Synonym Library',
  'hot-search-library': 'Hot Search Library',
  'stop-words': 'Stop Words',
  'search-verify-group': 'Verification',
  'search-verify': 'Search Verify',
  'hint-verify': 'Hint Verify',
  'hot-search-verify': 'Hot Search Verify',
  'report': 'Reports',
  'hint-report': 'Hint Report',
  'hot-search-report': 'Hot Search Report',
  // 財務管理
  'finance': 'Finance',
  'promotion': 'Promotion Funds',
  'account-balance': 'Account Balance',
  'batch-query': 'Batch Query',
  'detail-query': 'Detail Query',
  'merchant-reconcile': 'Merchant Reconciliation',
  'writeoff-reconcile': 'Write-off Reconciliation',
  'debt-reconcile': 'Debt Reconciliation',
  'approval': 'Approval Management',
  'approval-center': 'Approval Center',
  // 集團人事
  'hr': 'Group HR',
  'employee-management': 'Employee Management',
  'organization-management': 'Organization',
  'position-management': 'Position',
  'login-log': 'Employee Activity',
  // 權限管理
  'permission': 'Permission Management',
  'role-management': 'Role Management',
  'function-permission': 'Function Authorization',
  'data-permission': 'Data Authorization',
  // 系統配置
  'system-config': 'System Config',
  'menu-config': 'Menu Config',
  'translation-manage': 'Translation Config',
  // 訂單管理（複用頁面）
  'merchant-order-manage': 'Order Management',
  'promotion-order-manage': 'Order Management',
}

/**
 * 根據當前語言翻譯菜單名稱：
 * 優先取靜態映射表（英文），再取 i18next 資源（含後端注入的語言包 menu.${menuKey}），
 * 最後回退中文（數據庫菜單名）。
 * - 非英文模式：原樣返回中文
 */
export function translateMenuName(menuKey: string, zhName: string): string {
  if (!i18n.language?.startsWith('en')) return zhName

  // 1. 靜態映射表（英文硬編碼，最高優先）
  const staticEn = MENU_NAME_EN[menuKey]
  if (staticEn) return staticEn

  // 2. i18next 資源（後端 bundle 注入的動態翻譯，key 格式 menu.${menuKey}）
  const bundleKey = `menu.${menuKey}`
  const bundleVal = i18n.t(bundleKey)
  // i18next 找不到 key 時返回 key 本身，需排除這種情況
  if (bundleVal && bundleVal !== bundleKey) return bundleVal

  // 3. 嘗試直接用 menuKey 查找（兼容不同 key 格式）
  const directVal = i18n.t(menuKey)
  if (directVal && directVal !== menuKey) return directVal

  // 4. 回退中文
  return zhName
}
