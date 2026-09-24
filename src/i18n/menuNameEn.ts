import i18n from 'i18next'

/**
 * 菜单 key → 英文名称 兼容兜底映射表
 *
 * 英文名称的真值源已收敛为后端 sys_menu.name_en（菜单树接口 nameEn 字段, 「菜單配置」页可编辑）,
 * 本表仅在 DB 未配置 name_en 时兜底, 新增菜单不应再往这里添加, 请补齐 DB name_en。
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
  // 流量沙盤
  'traffic-sandbox': 'Experiment Sandbox',
  'waterfall-simulation': 'Waterfall Simulation',
  'algorithm-simulation': 'Algorithm Simulation',
  'merchant-score-insight': 'Merchant Score Insight',
  'merchant-promotion-diagnose': 'Promotion Diagnosis',
  // 推广通（后端 menu_key：promotion_tool）
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
  'consume-risk': 'Consumption Risk',
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
  // 團購管理
  'group-purchase': 'Group Purchase',
  'group-purchase-dashboard': 'Flash Sale Overview',
  'flash-sale-register': 'Flash Sale Register',
  'flash-sale-stats': 'Flash Sale Stats',
  'flash-sale-price': 'Macau Flash Sale Price',
  // 權限管理
  'permission': 'Permission Management',
  'role-management': 'Role Management',
  'function-permission': 'Function Authorization',
  'data-permission': 'Data Authorization',
  'system-authorization': 'System Authorization',
  // 系統配置
  'system-config': 'System Config',
  'menu-config': 'Menu Config',
  'translation-manage': 'Translation Workbench',
  // 多语言管理（i18n-center 独立模块）
  'i18n-center': 'i18n Management',
  'i18n-language': 'Language Config',
  'i18n-import-export': 'Import & Export',
  'i18n-mt-engine': 'MT Engine',
  'i18n-dashboard': 'Translation Dashboard',
  'rule-config': 'Rule Config',
  'workflow-config': 'Workflow Config',
  'version-history': 'Version History',
  'ai-assistant': 'AI Center (AI)',
  'ai_model_hub': 'Model Access',
  'ai_quota_auth': 'Authorization & Quota',
  'ai-operation-auth': 'AI Access Control',
  'ai_usage_stats': 'Energy Statistics',
  'ai_energy_detail': 'Energy Detail',
  // 智能中心 (AI) - 拆分后的新菜单 key
  'ai-models': 'Model Management',
  'ai-model-provider': 'Model Provider',
  'ai-model-list': 'Model Access',
  'ai-auth-quota': 'Authorization & Quota',
  'ai-auth': 'Model Authorization',
  'ai-quota': 'Quota Policy',
  // AI 配额与策略（拆分后的分组与子菜单）
  'ai-auth-manage': 'Model Access Control',
  'ai-quota-manage': 'Quota Management',
  'ai-dept-model-auth': 'Dept Model Access',
  'ai-emp-model-auth': 'Employee Model Access',
  'ai-pos-auth': 'Position-Based Authorization',    // 按职位授权
  'ai-role-auth': 'Role-Based Authorization',       // 角色授权
  'ai-dept-quota': 'Department Quota',
  'ai-emp-quota': 'Employee Quota',
  'ai-emp-permission': 'Employee AI Quota Management',
  // 能耗與賬單
  'ai-energy-billing': 'Energy & Billing',
  // AI 使用申請（與 en.json aiApply.pageTitle 保持一致）
  'ai-access-request': 'AI Access Application',
  // MCP 服務
  'ai-mcp-service': 'MCP Services',
  // OA中心
  'oa-center': 'OA Center',
  'oa-requests': 'Workflow Items',
  'process-center': 'Process Center',
  // 物資管理
  'asset-management': 'Asset Management',
  'eam-master-data':  'Basic Configuration',
  'asset-basic':      'Basic Configuration',
  'asset-flow-ops':   'Asset Management',
  'asset-maintenance': 'Maintenance & Disposal',
  'asset-purchase':   'Procurement & Inbound',
  'asset-dashboard':   'Asset Dashboard',
  'asset-list':       'Asset Ledger',
  'asset-category':   'Category Library',
  'asset-model':      'Brand Product Library',
  'asset-location':   'Warehouse Management',
  'param-library':    'Product Parameter Library',
  'asset-tag':        'Asset Tag',
  'asset-supplier':   'Suppliers',
  'purchase-request':  'Purchase Request',
  'purchase-order':   'Purchase Order',
  'asset-inbound':    'Asset Inbound',
  'asset-claim':      'Asset Claim',
  'asset-borrow':     'Asset Borrow',
  'asset-return':     'Asset Return',
  'asset-transfer-list': 'Asset Transfer',
  'asset-handover':   'Asset Handover',
  'asset-repair':     'Asset Repair',
  'asset-loss':       'Lost Asset',
  'asset-compensation': 'Damage Compensation',
  'asset-scrap':      'Asset Scrap',
  'asset-flow':       'Asset Flow',
  'asset-inventory':     'Asset Inventory',
}

/**
 * 根據當前語言翻譯菜單名稱：
 * - 中文（zh-TW/zh-CN）：原樣返回 DB 名稱
 * - 英文：優先 DB name_en → 再取静态映射表 MENU_NAME_EN → 再取 i18next 資源
 * - 其它語言（ja/ko/ru 等）：取 i18next 資源（後端 bundle 注入的動態翻譯）, 再回退 DB name_en
 * - 最終回退中文（數據庫菜單名）
 */
export function translateMenuName(menuKey: string, zhName: string, dbNameEn?: string | null): string {
  // 中文模式直接返回
  if (i18n.language?.startsWith('zh')) return zhName

  // 1. 后端 name_en 为真值源（菜单配置页改名后实时生效）
  if (dbNameEn && dbNameEn.trim()) {
    return dbNameEn
  }

  // 2. 英文静态映射表（仅 DB 未配置 name_en 时兜底）
  if (i18n.language?.startsWith('en')) {
    const staticEn = MENU_NAME_EN[menuKey]
    if (staticEn) return staticEn
  }

  // 3. i18next 資源（後端 bundle 注入的動態翻譯，key 格式 menu.${menuKey}）
  const bundleKey = `menu.${menuKey}`
  const bundleVal = i18n.t(bundleKey)
  // i18next 找不到 key 時返回 key 本身，需排除這種情況
  if (bundleVal && bundleVal !== bundleKey) return bundleVal

  // 4. 嘗試直接用 menuKey 查找（兼容不同 key 格式）
  const directVal = i18n.t(menuKey)
  if (directVal && directVal !== menuKey) return directVal

  // 5. 英文模式回退静态映射表
  if (i18n.language?.startsWith('en')) {
    const fallback = MENU_NAME_EN[menuKey]
    if (fallback) return fallback
  }

  // 6. 回退中文
  return zhName
}
