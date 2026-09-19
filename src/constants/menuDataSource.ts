/**
 * 菜单数据源登记（menuDataSource.ts）
 *
 * 业务规则：
 * - 以叶子菜单为单位分类：只要该页面及其子路由使用了真实后端业务 API，即归为「已接入后端」(backend)；
 * - 完全未接入后端业务 API 的页面归为「纯前端原型」(prototype)，后端停服时照常展示；
 * - 混合页面（部分子功能已接入 API、主列表仍为 mock）整页按 backend 处理：停服时隐藏，
 *   在线时仅展示真实数据，未接接口的部分保持空态。
 *
 * 本文件职责：
 * 1. 维护 menuKey → 路由路径 映射（全应用唯一真值）；
 * 2. 登记已接入后端 API 的菜单 key 集合，供离线过滤、路由守卫、标签页过滤使用；
 * 3. 导出反向映射 pathToKey 供侧边栏高亮与标签页名称查找。
 */

/** ────────────────────────────────────────────────────────────
 *  1. 菜单 key → 路由路径 映射（全应用唯一真值）
 *  ──────────────────────────────────────────────────────────── */
export const keyToPath: Record<string, string> = {
  // 首頁
  'home': '/',
  // 商戶集團管理
  'merchant-group-list': '/merchant-group-list',
  'store-list': '/store-list',
  // 财务管理 - 推广金管理
  'account-balance': '/account-balance',
  'consume-risk': '/consume-risk',
  'batch-query': '/batch-query',
  'detail-query': '/detail-query',
  // 财务管理 - 商户通对账
  'writeoff-reconcile': '/writeoff-reconcile',
  'debt-reconcile': '/debt-reconcile',
  // 财务管理 - 审批管理
  'approval-center': '/approval-center',
  // 搜索管理 - 搜索引导
  'hint-config': '/hint-config',
  'hint-preview': '/hint-preview',
  'hot-search-config': '/hot-search-config',
  'hot-search-preview': '/hot-search-preview',
  'search-weight-config': '/search-weight-config',
  // 搜索管理 - 搜索词库
  'word-segmentation': '/word-segmentation',
  'synonym-config': '/synonym-config',
  'hot-search-library': '/hot-search-library',
  'stop-words': '/stop-words',
  // 搜索管理 - 报表统计
  'hint-report': '/hint-report',
  'hot-search-report': '/hot-search-report',
  // 搜索配置管理(新系统)
  'global-config': '/global-config',
  'channel-strategy': '/channel-strategy',
  // 搜索校驗
  'search-verify': '/search-verify',
  'search-verify-detail': '/search-verify-detail',
  'hint-verify': '/hint-verify',
  'hot-search-verify': '/hot-search-verify',
  // 集團人事
  'employee-management': '/employee-management',
  'organization-management': '/organization-management',
  'position-management': '/position-management',
  'login-log': '/login-log',
  // 權限管理
  'role-management': '/role-management',
  'function-permission': '/function-permission',
  'data-permission': '/data-permission',
  // 商家推广工具 - 词库管理
  'promotion-word-library': '/promotion-word-library',
  // 商家推广工具 - 流量沙盤（prototype — 纯前端 mock）
  // 'waterfall-simulation': '/waterfall-simulation',
  // 'algorithm-simulation': '/algorithm-simulation',
  // 'merchant-score-insight': '/merchant-score-insight',
  // 'merchant-promotion-diagnose': '/merchant-promotion-diagnose',
  // 商家推广工具
  'promotion-dashboard': '/promotion-dashboard',
  'promotion-algorithm': '/promotion-algorithm',
  'promotion-slot-config': '/promotion-slot-config',
  'promotion-waterfall': '/promotion-waterfall',
  'promotion-sales-config': '/promotion-sales-config',
  // 广告销售
  'ad-sales': '/ad-sales',
  // 推广赠送
  'gift-detail': '/gift-detail',
  'gift-consume-detail': '/gift-consume-detail',
  // 推广通 - 報表分析
  'promotion-report-overview': '/promotion-report-overview',
  'promotion-report-order': '/promotion-report-order',
  'promotion-report-compare': '/promotion-report-compare',
  // 團購管理
  'group-purchase-dashboard': '/group-purchase-dashboard',
  'flash-sale-register': '/flash-sale-register',
  'flash-sale-stats': '/flash-sale-stats',
  'flash-sale-price': '/flash-sale-price',
  // 系统配置
  'menu-config': '/menu-config',
  'translation-manage': '/i18n-center/workbench',
  'i18n-language': '/i18n-center/language',
  'i18n-import-export': '/i18n-center/import-export',
  'i18n-mt-engine': '/i18n-center/mt-engine',
  'i18n-dashboard': '/i18n-center/dashboard',
  'rule-config': '/rule-config',
  'notification-config': '/notification-config',
  'workflow-config': '/workflow-config',
  'version-history': '/version-history',
  // 智能中心(AI)
  'ai_model_hub': '/ai-model-hub',
  'ai_quota_auth': '/ai-quota-auth',
  'ai-operation-auth': '/ai-operation-auth',
  'ai-access-request': '/ai-access-apply',
  'ai-mcp-service': '/ai-mcp-service',
  'ai-conversation-audit': '/ai-conversation-audit',
  'ai_usage_stats': '/ai-usage-stats',
  'ai_energy_detail': '/ai-energy-detail',
  'ai-model-provider': '/ai-model-provider',
  'ai-model-list': '/ai-model-list',
  'ai-auth': '/ai-auth',
  'ai-dept-model-auth': '/ai-dept-model-auth',
  'ai-emp-model-auth': '/ai-emp-model-auth',
  'ai-pos-auth': '/ai-pos-auth',
  'ai-dept-quota': '/ai-dept-quota',
  'ai-emp-quota': '/ai-emp-quota',
  // OA中心
  'oa-requests': '/oa-requests',
  'process-center': '/process-center',
  // 门店数据配置
  'store-data-config': '/store-data-config',
  // 地图規劃
  'map-planning': '/map-planning',
  // 赠送管理子页面
  'gift-add': '/gift-add',
  'gift-detail-view': '/gift-detail-view',
  // AI 子页面
  'ai-model-edit': '/ai-model-edit',
  'ai-model-detail': '/ai-model-detail',
  'ai-dept-auth-edit': '/ai-dept-auth-edit',
  'ai-dept-auth-detail': '/ai-dept-auth-detail',
  'ai-pos-auth-edit': '/ai-pos-auth-edit',
  'ai-pos-auth-detail': '/ai-pos-auth-detail',
  'ai-role-auth-edit': '/ai-role-auth-edit',
  'ai-role-auth-detail': '/ai-role-auth-detail',
  'ai-dept-quota-edit': '/ai-dept-quota-edit',
  'ai-dept-quota-detail': '/ai-dept-quota-detail',
  'ai-emp-permission': '/ai-emp-permission',
  'ai-emp-permission-detail': '/ai-emp-permission-detail',
  // 物資管理（EAM）
  'asset-dashboard':     '/asset-dashboard',
  'asset-supplier':      '/asset-supplier',
  'asset-list':          '/asset-list',
  'asset-category':      '/asset-category',
  'asset-model':         '/asset-model',
  'asset-location':      '/asset-location',
  'param-library':       '/param-library',
  'asset-tag':           '/asset-tag',
  'asset-inbound':       '/asset-inbound',
  'asset-claim':         '/asset-claim',
  'asset-borrow':        '/asset-borrow',
  'asset-return':        '/asset-return',
  'asset-transfer-list': '/asset-transfer-list',
  'asset-handover':      '/asset-handover',
  'asset-repair':        '/asset-repair',
  'asset-compensation':  '/asset-compensation',
  'asset-scrap':         '/asset-scrap',
  'asset-flow':          '/asset-flow',
  'asset-inventory':     '/asset-inventory',
  // EAM 採購
  'purchase-order':      '/purchase-order',
  'purchase-request':    '/oa-purchase-request',
  // 耗材管理
  'consumable-dashboard': '/consumable-dashboard',
  'consumable-item':      '/consumable-item',
  'consumable-claim':     '/consumable-claim',
  'consumable-stock':     '/consumable-stock',
  'consumable-stock-txn': '/consumable-stock-txn',
  'consumable-alert':     '/consumable-alert',
}

/** ────────────────────────────────────────────────────────────
 *  2. 路由路径 → 菜单 key 反向映射
 *  ──────────────────────────────────────────────────────────── */
export const pathToKey: Record<string, string> = {}
Object.entries(keyToPath).forEach(([key, path]) => {
  const cleanPath = path.split('#')[0]
  pathToKey[cleanPath] = key
})

/** ────────────────────────────────────────────────────────────
 *  3. 已接入后端 API 的菜单 key 集合
 *
 *  判定标准：页面及其子路由通过 src/api/*.ts 的 request 实例调用了真实后端业务接口。
 *  不在此集合中的菜单 = 纯前端原型（prototype），后端停服时照常展示。
 *  流量沙盤（waterfall-simulation 等 4 个）和推廣報表（promotion-report-* 3 个）
 *  仍完全依赖 mock，不在此集合中。
 *  ──────────────────────────────────────────────────────────── */
export const BACKEND_CONNECTED_KEYS: Set<string> = new Set([
  // 首页（安全入口，始终可用）
  'home',
  // 商戶集團管理
  'merchant-group-list', 'store-list',
  // 财务管理
  'account-balance', 'consume-risk', 'batch-query', 'detail-query',
  'writeoff-reconcile', 'debt-reconcile', 'approval-center',
  // 搜索管理 — 熱搜配置/預覽已接入 fetchAdAlgorithms/fetchStores（混合页面按 backend 处理）
  'hot-search-config', 'hot-search-preview',
  // 集團人事
  'employee-management', 'organization-management', 'position-management', 'login-log',
  // 權限管理
  'role-management', 'function-permission', 'data-permission',
  // 商家推广工具（已接入后端的部分）
  'promotion-word-library',
  'promotion-dashboard', 'promotion-algorithm', 'promotion-slot-config',
  'promotion-waterfall', 'promotion-sales-config', 'ad-sales',
  // 赠送管理
  'gift-detail', 'gift-consume-detail',
  // 團購管理
  'group-purchase-dashboard', 'flash-sale-register', 'flash-sale-stats', 'flash-sale-price',
  // 系统配置
  'menu-config', 'translation-manage',
  'i18n-language', 'i18n-import-export', 'i18n-mt-engine', 'i18n-dashboard',
  'rule-config', 'notification-config', 'workflow-config', 'version-history',
  // 智能中心(AI)
  'ai_model_hub', 'ai_quota_auth', 'ai-operation-auth', 'ai-access-request',
  'ai-mcp-service', 'ai-conversation-audit', 'ai_usage_stats', 'ai_energy_detail',
  'ai-model-provider', 'ai-model-list', 'ai-auth',
  'ai-dept-model-auth', 'ai-emp-model-auth', 'ai-pos-auth',
  'ai-dept-quota', 'ai-emp-quota',
  // OA中心
  'oa-requests', 'process-center',
  // 门店数据配置
  'store-data-config',
  // 赠送子页面
  'gift-add', 'gift-detail-view',
  // AI 子页面
  'ai-model-edit', 'ai-model-detail',
  'ai-dept-auth-edit', 'ai-dept-auth-detail',
  'ai-pos-auth-edit', 'ai-pos-auth-detail',
  'ai-role-auth-edit', 'ai-role-auth-detail',
  'ai-dept-quota-edit', 'ai-dept-quota-detail',
  'ai-emp-permission', 'ai-emp-permission-detail',
  // 物資管理（EAM 全部 19 个子菜单）
  'asset-dashboard', 'asset-supplier', 'asset-list', 'asset-category', 'asset-model',
  'asset-location', 'param-library', 'asset-tag', 'asset-inbound',
  'asset-claim', 'asset-borrow', 'asset-return', 'asset-transfer-list',
  'asset-handover', 'asset-repair', 'asset-compensation', 'asset-scrap',
  'asset-flow', 'asset-inventory',
  // EAM 採購
  'purchase-order', 'purchase-request',
  // 耗材管理
  'consumable-dashboard', 'consumable-item', 'consumable-claim',
  'consumable-stock', 'consumable-stock-txn', 'consumable-alert',
])

/** 判断菜单 key 是否已接入后端 API */
export function isBackendConnected(menuKey: string): boolean {
  return BACKEND_CONNECTED_KEYS.has(menuKey)
}

/** 判断路由路径是否指向已接入后端的菜单 */
export function isPathBackendConnected(path: string): boolean {
  const cleanPath = path.split('?')[0].split('#')[0]
  const key = pathToKey[cleanPath]
  return key ? BACKEND_CONNECTED_KEYS.has(key) : false
}
