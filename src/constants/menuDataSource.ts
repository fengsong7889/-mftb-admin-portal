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
  'hr-onboarding': '/hr-onboarding',
  'hr-regularization': '/hr-regularization',
  'hr-transfer': '/hr-transfer',
  'hr-dimission': '/hr-dimission',
  'hr-dict': '/hr-dict',
  'contract-ledger': '/contract-ledger',
  'position-management': '/position-management',
  'login-log': '/login-log',
  // 組織管理（v44 独立一级域：目录 org-center + 叶子部門架構）
  'hr-leave': '/hr-leave',
  'hr-leave-quota': '/hr-leave-quota',
  // 員工自助（v45 独立一级域：目录 ess-center + 三个自助叶子）
  'ess-center': '/ess-leave',
  'ess-leave': '/ess-leave',
  'ess-requests': '/ess-requests',
  'ess-profile': '/ess-profile',
  'ess-certificate': '/ess-certificate',
  'hr-certificate': '/hr-certificate',
  // 績效考核（v46 一级域 perf-center：HR 三叶 + 自助叶挂在 ess-center 下）
  'perf-center': '/hr-perf-cycle',
  'hr-perf-admin': '/hr-perf-cycle',
  'hr-perf-review': '/hr-perf-review',
  'hr-perf-calibration': '/hr-perf-calibration',
  'ess-performance': '/ess-performance',
  // 績效台账（v47 第二个绩效一级域，与执行域分开授权）
  'perf-report-center': '/hr-perf-ledger',
  'hr-perf-ledger': '/hr-perf-ledger',
  'hr-perf-audit': '/hr-perf-audit',
  'hr-perf-appeal': '/hr-perf-appeal',
  'org-center': '/org-center',
  'org-structure': '/organization-management',
  // 權限管理（功能授權/系統授權已合并為授權中心；舊 key 保留映射，历史种子/缓存菜单点击直接重定向）
  'role-management': '/role-management',
  'authorization-center': '/authorization-center',
  'function-permission': '/authorization-center',
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
  'rule-ad-sales': '/rule-center/ad-sales',
  'rule-gift': '/rule-center/gift',
  'rule-security': '/rule-center/security',
  'rule-algorithm': '/rule-center/algorithm',
  'rule-seq': '/rule-center/seq',
  'notification-config': '/notification-config',
  'workflow-config': '/workflow-config',
  'version-history': '/version-history',
  // 智能中心(AI)
  'ai_model_hub': '/ai-model-hub',
  'ai-operation-auth': '/ai-operation-auth',
  'agent-overview': '/agent-overview',
  'agent-apps': '/agent-apps',
  'agent-budget': '/agent-budget',
  'agent-actions': '/agent-actions',
  'agent-knowledge': '/agent-knowledge',
  'agent-data': '/agent-data',
  'agent-runs': '/agent-runs',
  'agent-evaluation': '/agent-evaluation',
  'ai-assistant-overview': '/ai-assistant',
  'ai-assistant-capability': '/ai-assistant/capability',
  'ai-assistant-profile': '/ai-assistant/profile',
  'ai-assistant-glossary': '/ai-assistant/glossary',
  'ai-assistant-knowledge': '/ai-assistant/knowledge',
  'ai-assistant-guardrail': '/ai-assistant/guardrail',
  'ai-assistant-feedback': '/ai-assistant/feedback',
  'ai-assistant-audit': '/ai-assistant/audit',
  'ai-assistant-quick-prompt': '/ai-assistant/quick-prompt',
  'ai-assistant-push-template': '/ai-assistant/push-template',
  'ai-assistant-memory': '/ai-assistant/memory',
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
  'asset-loss':          '/asset-loss',
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
  'consumable-inbound':   '/consumable-inbound',
  'consumable-report':    '/consumable-report',
  'consumable-claim':     '/consumable-claim',
  'consumable-stock':     '/consumable-stock',
  'consumable-stock-txn': '/consumable-stock-txn',
  'consumable-alert':     '/consumable-alert',
  // 產研交付（RDM）—— v3.13 生命周期分组结构（DB 已是目标结构，不再需要阶段 A 展示层合成）
  'rdm-workbench':        '/rdm-workbench',
  'rdm-requirement':      '/rdm-requirement',
  'rdm-intake':           '/rdm-intake',
  // v3.11 拆分：一级分组「需求池」折叠态跳转指向首个子页（与 rdm-efficiency 同法）；
  // 二级「提交需求」是业务侧入口（我的提交 + 待我審批）
  'rdm-pool-group':       '/rdm-intake-approval',
  'rdm-intake-approval':  '/rdm-intake-approval',
  // 需求總看板已升为一级分组：分组折叠态跳转指向首个子页，交付看板/質量/追溯/周报各自成菜单
  'rdm-dashboard':          '/rdm-dashboard',
  'rdm-dashboard-board':    '/rdm-dashboard',
  // v3.5 拆分：風險明细与部门/人员负载各自成页；新分组折叠态跳首个子页（与其他分组同法）
  'rdm-dashboard-risk':     '/rdm-risk',
  // 团队负载（rdm-resource-load）：从研发工作台资源负载 Tab 升级为独立菜单，放在项目与计划分组下
  'rdm-resource-load':      '/rdm-resource-load',
  'rdm-efficiency':         '/rdm-score',
  'rdm-efficiency-output':  '/rdm-output',
  'rdm-dashboard-quality':  '/rdm-quality',
  'rdm-dashboard-version':  '/rdm-version-trace',
  'rdm-dashboard-report':   '/rdm-weekly-report',
  'rdm-dashboard-score':     '/rdm-score',
  'rdm-dashboard-trend':     '/rdm-metric-trend',
  // V3 分批交付「項目總覽」（RdmMenuInitializer Batch 1 种子 rdm-dashboard-project）。
  // 这三个 key 曾漏登记，导致侧边栏点击落到 keyToPath 兜底、误报「該功能模塊開發中」（页面与路由其实已存在）。
  'rdm-dashboard-project':   '/rdm-project',
  // 需求配置为分组目录，折叠态跳转指向首个子页（与其他一级分组同法）
  // 研發交付已升为一级分组：分组折叠态跳转指向首个子页（与 rdm-config-group 同法）
  'rdm-delivery':            '/rdm-delivery',
  'rdm-delivery-board':      '/rdm-delivery',
  'rdm-delivery-iteration':  '/rdm-iteration',
  // v3.13 新建分组（声明必须在叶子之前，否则 pathToKey 反向映射被分组覆盖，叶子高亮失效）
  'rdm-test-quality-group':  '/rdm-test',
  'rdm-release-accept-group': '/rdm-acceptance',
  // 驗收中心叶子菜单必须声明在同路径分组「之后」：pathToKey 反向映射按声明顺序后写覆盖先写，
  // 早于分组声明会让 '/rdm-acceptance' 归到分组 key 上，侧边栏叶子项拿不到高亮（见本文件分组声明处注释）。
  'rdm-acceptance':       '/rdm-acceptance',
  // V3 分批交付「測試工作台 / 發布中心」（种子 rdm-delivery-test / rdm-delivery-release）
  'rdm-delivery-test':       '/rdm-test',
  'rdm-delivery-release':    '/rdm-release',
  // 需求配置为分组目录，折叠态跳转指向首个子页（与其他一级分组同法）
  'rdm-config-group':     '/rdm-config-status',
  'rdm-config-status':    '/rdm-config-status',
  'rdm-config-routing':   '/rdm-config-routing',
  'rdm-config-sla':       '/rdm-config-sla',
  'rdm-config-score':     '/rdm-score-rule',
  'rdm-task-type-config': '/rdm-task-type-config',
  // 進度日報（一级菜单）：推送配置 / 模板配置 / 发送记录 / 手动触发
  'rdm-daily-report-group': '/rdm-daily-report-rules',
  'rdm-daily-report-rule': '/rdm-daily-report-rules',
  'rdm-daily-report-template': '/rdm-daily-report-templates',
  'rdm-daily-report-record': '/rdm-daily-report-records',
  'rdm-daily-report-trigger': '/rdm-daily-report-trigger',
  // 用車管理（階段 B1）—— 歸屬物資管理系統（EAM）的顶级分组「用車管理」。
  // 職責邊界：車輛檔案/辦理/台賬/維護等業務菜單全部在 EAM；OA 側只保留流程定義
  // （biz_oa_process: vehicle_use）、審批待辦與流程中心一張跳轉入口卡，不承載任何
  // 用車業務頁面——與 consumable-claim（業務頁在 EAM，流程中心只放 route）同法。
  // 菜单真值已由 VehicleSchemaMigrationInitializer 写入 sys_menu（system_code=eam）。
  'vehicle-files':        '/vehicle-files',
  'my-vehicle-use':       '/my-vehicle-use',
  'vehicle-dispatch':     '/vehicle-dispatch',
  'vehicle-ledger':       '/vehicle-ledger',
  'vehicle-master-data':  '/vehicle-master-data',
  // 組織編制系統（organization）—— 菜单真值由 HcmOrganizationMenuInitializer 写入 sys_menu。
  // 本批只交付法人主体与管理组织两个真实页面；职位体系/岗位编制随后续批次登记，
  // 不先写空壳路径，否则离线菜单门禁会当成「页面未接」报出来。
  'hcm-org-legal':        '/hcm-org-legal',
  'hcm-org-unit':         '/hcm-org-unit',
  'hcm-payroll-component': '/hcm-payroll-component',
  'hcm-payroll-standard':  '/hcm-payroll-standard',
  'hcm-payroll-benefit':   '/hcm-payroll-benefit',
  'hcm-payroll-rule':      '/hcm-payroll-rule',
  'hcm-org-job-family':   '/hcm-org-job-family',
  'hcm-org-job-grade':    '/hcm-org-job-grade',
  'hcm-org-position':     '/hcm-org-position',
  // 人事管理（hr）· 人員主檔：菜單真值由 HcmPersonMenuInitializer 写入 sys_menu
  'hcm-person':           '/hcm-person',
  // 考勤假勤系统（attendance）—— 独立入口，菜单真值由 AttendanceMenuInitializer 写入 sys_menu。
  'attendance-workbench':  '/attendance-workbench',
  'attendance-group':      '/attendance-group',
  'attendance-shift':      '/attendance-shift',
  'attendance-holiday':    '/attendance-holiday',
  'attendance-schedule':   '/attendance-schedule',
  'attendance-punch':      '/attendance-punch',
  'attendance-exception':  '/attendance-exception',
  'attendance-daily':      '/attendance-daily',
  'attendance-monthly':    '/attendance-monthly',
  'attendance-setting':    '/attendance-setting',
  // 文檔中心：菜單真值由 DocSchemaMigrationInitializer 寫入 sys_menu
  'doc-plans': '/doc-plans',
  'doc-governance': '/doc-governance',
  'doc-library': '/doc-center',
  'doc-space': '/doc-space',
  'doc-stats': '/doc-stats',
  'doc-learning': '/doc-learning',
  'doc-system-plans': '/doc-system-plans',
  'doc-api-center': '/doc-api-center',
  // 会议管理系统（meeting）—— 独立入口，菜单真值由 MeetingSchemaMigrationInitializer 写入 sys_menu。
  // 只登记 M1 已交付的 4 个；看板与预约规则分属 M3/M2，菜单跟随页面一起登记，
  // 提前登记会让菜单指向一个不存在的路由（点击后白屏）。
  'meeting-my':            '/meeting-my',
  'meeting-booking':       '/meeting-booking',
  'meeting-room':          '/meeting-room',
  'meeting-record':        '/meeting-record',
  'meeting-config':        '/meeting-config',
  // 行政側紀要檢索（會議治理 › 會議紀要）
  'meeting-minutes-list':  '/meeting-minutes-list',
  // 通知模板 / 推送開關：緊鄰「通知渠道配置」
  'notification-template': '/notification-template',
  'notification-switch':   '/notification-switch',
}

/** 菜单接口省略 path 时使用本地路由登记；只接受站内路径，不推测未知菜单。 */
export function resolveMenuPath(menu: { menuKey: string; path?: string }): string | null {
  const path = menu.path || keyToPath[menu.menuKey]
  return path?.startsWith('/') && !path.startsWith('//') ? path : null
}

/** ────────────────────────────────────────────────────────────
 *  2. 路由路径 → 菜单 key 反向映射
 *  ──────────────────────────────────────────────────────────── */
export const pathToKey: Record<string, string> = {}
Object.entries(keyToPath).forEach(([key, path]) => {
  const cleanPath = path.split('#')[0]
  pathToKey[cleanPath] = key
})
// 字典表单为 hr-dict 菜单的子页面（非独立菜单），归入 hr-dict 供侧边栏高亮/标签名/离线过滤使用
pathToKey['/hr-dict-edit'] = 'hr-dict'
// RDM 詳情/驗收表單/交付子頁歸入對應菜單，供側邊欄高亮與標籤名使用
pathToKey['/rdm-detail'] = 'rdm-requirement'
// 需求甘特图：不单独建菜单，侧栏高亮归属需求跟进清单（与详情页同锚点）
pathToKey['/rdm-gantt'] = 'rdm-requirement'
pathToKey['/rdm-acceptance-form'] = 'rdm-acceptance'
// 交付中需求、產品需求處理、提交需求已随菜单收敛退役（不再出现在 keyToPath）；任务/迭代表单仍为子页
pathToKey['/rdm-task'] = 'rdm-delivery-board'
// 分配产品经理独立页：后端 batch-assign 校 rdm-intake 的 edit，此处归属保持一致
pathToKey['/rdm-assign'] = 'rdm-intake'
pathToKey['/rdm-iteration-form'] = 'rdm-delivery-iteration'
// 進度日報的两个独立表单页（非菜单）：归属各自列表页，保证侧栏高亮/页签名/权限守卫有锚点
pathToKey['/rdm-daily-report-rule-form'] = 'rdm-daily-report-rule'
pathToKey['/rdm-daily-report-template-form'] = 'rdm-daily-report-template'
// 內置版式詳情頁（非菜單）：入口在「推送配置」的釘釘消息區，故錨定推送配置菜單，
// 保證從那裡點進來時側欄高亮的是「推送配置」而不是「模板配置」
pathToKey['/rdm-daily-report-template-builtin'] = 'rdm-daily-report-rule'
// 分發矩陣新增/編輯獨立頁：權限錨點沿用列表菜單
pathToKey['/rdm-config-routing-form'] = 'rdm-config-routing'
// 貢獻分預算新增/調整獨立頁：權限錨點沿用產出積分菜單
pathToKey['/rdm-score-budget-form'] = 'rdm-dashboard-score'
// 任務類型新增/編輯獨立頁：權限錨點沿用任務類型菜單
pathToKey['/rdm-task-type-config-form'] = 'rdm-task-type-config'
// 移動端日報頁：從釘釘通知連結打開，無獨立菜單，側欄高亮與權限守衛都錨到「推送配置」
// （後端快照介面的 @RequirePermission 也以 rdm-daily-report-rule 為主錨點、anyOf 放行各 RDM 承載菜單）
pathToKey['/rdm-daily'] = 'rdm-daily-report-rule'
// 团队负载子页（人员详情/分派表单）归属同一菜单
pathToKey['/rdm-resource-load'] = 'rdm-resource-load'
// V3 分批交付子页（非独立菜单）：归属按后端 @RequirePermission 的菜单锚点，守卫与页签高亮才有锚点
// RdmProjectController=rdm-dashboard-project，RdmTestBatch/RdmIssue=rdm-delivery-test，
// RdmReleaseBatch/RdmFlowConfig=rdm-delivery-release，RdmDeliveryItem=rdm-delivery-board，RdmStockMigration=rdm-delivery
pathToKey['/rdm-project-detail'] = 'rdm-dashboard-project'
pathToKey['/rdm-test-detail'] = 'rdm-delivery-test'
// 发起提测 / 创建发布批次：独立表单页（§9.1 不得用 Modal），归属各自菜单权限锚点
pathToKey['/rdm-test-submit'] = 'rdm-delivery-test'
pathToKey['/rdm-release-create'] = 'rdm-delivery-release'
pathToKey['/rdm-issue'] = 'rdm-delivery-test'
pathToKey['/rdm-release-detail'] = 'rdm-delivery-release'
pathToKey['/rdm-grayscale'] = 'rdm-delivery-release'
pathToKey['/rdm-delivery-item'] = 'rdm-delivery-board'
pathToKey['/rdm-stock-migration'] = 'rdm-delivery'
// 需求↔版本追溯、交付周报、產出積分、效能量趨勢均已升为看板子菜单（由 keyToPath 反向映射）；PRD/变更仍为子页
// PRD/评审的受理与处理权已从退役的 rdm-product 平移到需求清单的 edit
pathToKey['/rdm-prd'] = 'rdm-requirement'
pathToKey['/rdm-review'] = 'rdm-requirement'
pathToKey['/rdm-change'] = 'rdm-requirement'
// 入转调离表单/详情为各菜单子页面（非独立菜单），归入各自列表菜单
pathToKey['/hr-onboarding-form'] = 'hr-onboarding'
pathToKey['/hr-onboarding-detail'] = 'hr-onboarding'
pathToKey['/hr-regularization-form'] = 'hr-regularization'
pathToKey['/hr-regularization-detail'] = 'hr-regularization'
pathToKey['/hr-transfer-form'] = 'hr-transfer'
pathToKey['/hr-transfer-detail'] = 'hr-transfer'
pathToKey['/hr-dimission-form'] = 'hr-dimission'
pathToKey['/hr-dimission-detail'] = 'hr-dimission'
// 请假表单/详情、额度表单为各自菜单的子页面
pathToKey['/hr-leave-form'] = 'hr-leave'
pathToKey['/hr-leave-detail'] = 'hr-leave'
pathToKey['/hr-leave-quota-form'] = 'hr-leave-quota'
// 自助端请假表单/详情复用同一菜单授权
pathToKey['/ess-leave-form'] = 'ess-leave'
pathToKey['/ess-leave-detail'] = 'ess-leave'
pathToKey['/ess-certificate-form'] = 'ess-certificate'
pathToKey['/ess-certificate-detail'] = 'ess-certificate'
pathToKey['/hr-certificate-issue'] = 'hr-certificate'
pathToKey['/hr-certificate-detail'] = 'hr-certificate'
// 绩效计划台账/发起表单/进度详情都是「周期與計劃」菜单的子页面（非独立菜单）
pathToKey['/hr-perf-plan'] = 'hr-perf-admin'
pathToKey['/hr-perf-plan-form'] = 'hr-perf-admin'
pathToKey['/hr-perf-plan-detail'] = 'hr-perf-admin'
pathToKey['/hr-perf-template'] = 'hr-perf-admin'

// 用車管理子页（新增/编辑/详情/登记表单）均为各菜单的子页面，非独立菜单
pathToKey['/vehicle-files/add'] = 'vehicle-files'
pathToKey['/vehicle-files/edit'] = 'vehicle-files'
pathToKey['/vehicle-files/detail'] = 'vehicle-files'
pathToKey['/vehicle-files/qualification'] = 'vehicle-files'
pathToKey['/my-vehicle-use/apply'] = 'my-vehicle-use'
pathToKey['/my-vehicle-use/detail'] = 'my-vehicle-use'
pathToKey['/vehicle-dispatch/assign'] = 'vehicle-dispatch'
pathToKey['/vehicle-dispatch/direct'] = 'vehicle-dispatch'
pathToKey['/vehicle-dispatch/depart'] = 'vehicle-dispatch'
pathToKey['/vehicle-dispatch/return'] = 'vehicle-dispatch'
pathToKey['/vehicle-dispatch/confirm'] = 'vehicle-dispatch'
pathToKey['/vehicle-dispatch/detail'] = 'vehicle-dispatch'
pathToKey['/vehicle-ledger/detail'] = 'vehicle-ledger'
pathToKey['/vehicle-ledger/correct'] = 'vehicle-ledger'
pathToKey['/vehicle-ledger/backfill'] = 'vehicle-ledger'

// 考勤假勤子页（新增/编辑/详情/处理）均为对应菜单的子页面，非独立菜单，复用同一菜单授权
pathToKey['/hcm-org-legal-form'] = 'hcm-org-legal'
pathToKey['/hcm-org-legal-detail'] = 'hcm-org-legal'
pathToKey['/hcm-org-unit-form'] = 'hcm-org-unit'
pathToKey['/hcm-payroll-component-form'] = 'hcm-payroll-component'
pathToKey['/hcm-payroll-standard'] = 'hcm-payroll-standard'
pathToKey['/hcm-payroll-standard-form'] = 'hcm-payroll-standard'
pathToKey['/hcm-payroll-benefit'] = 'hcm-payroll-benefit'
pathToKey['/hcm-payroll-benefit-plan-form'] = 'hcm-payroll-benefit'
pathToKey['/hcm-payroll-enrollment-form'] = 'hcm-payroll-benefit'
pathToKey['/hcm-payroll-rule'] = 'hcm-payroll-rule'
pathToKey['/hcm-payroll-rule-form'] = 'hcm-payroll-rule'
pathToKey['/hcm-org-unit-detail'] = 'hcm-org-unit'
pathToKey['/hcm-org-job-family-form'] = 'hcm-org-job-family'
pathToKey['/hcm-org-job-family-detail'] = 'hcm-org-job-family'
pathToKey['/hcm-org-job-grade-form'] = 'hcm-org-job-grade'
pathToKey['/hcm-org-job-grade-detail'] = 'hcm-org-job-grade'
pathToKey['/hcm-org-position-form'] = 'hcm-org-position'
pathToKey['/hcm-org-position-detail'] = 'hcm-org-position'
pathToKey['/hcm-person-form'] = 'hcm-person'
pathToKey['/hcm-person-detail'] = 'hcm-person'
pathToKey['/hcm-person-employment-form'] = 'hcm-person'
pathToKey['/hcm-person-assignment-form'] = 'hcm-person'
pathToKey['/hcm-person-profile-form'] = 'hcm-person'
pathToKey['/attendance-group-form'] = 'attendance-group'
pathToKey['/attendance-group-detail'] = 'attendance-group'
pathToKey['/attendance-shift-form'] = 'attendance-shift'
pathToKey['/attendance-shift-detail'] = 'attendance-shift'
pathToKey['/attendance-holiday-form'] = 'attendance-holiday'
pathToKey['/attendance-holiday-detail'] = 'attendance-holiday'
pathToKey['/attendance-exception-handle'] = 'attendance-exception'
// 会议详情不是菜单项（从钉钉卡片/日程单元格跳进来），但路由必须归到「我的會議」的菜单权限下，
// 否则守卫拿不到菜单 key，要么人人可进要么永久 403
pathToKey['/meeting-detail'] = 'meeting-my'
// 会议室新增/编辑、预约新增都是独立页（非菜单项）：归到各自的父菜单，守卫与页签高亮才有锚点
pathToKey['/meeting-room-form'] = 'meeting-room'
pathToKey['/meeting-booking-form'] = 'meeting-booking'
pathToKey['/meeting-blacklist-form'] = 'meeting-config'
// 签到二维码指向的独立免登页：不套后台布局，注册进 pathToKey 只为了菜单高亮不报错
pathToKey['/meeting-checkin'] = 'meeting-my'
// 文檔中心子頁（詳情/登記/編輯歸文檔庫，空間表單歸空間管理）：守衛與頁簽高亮才有錨點
pathToKey['/doc-plans/detail'] = 'doc-plans'
pathToKey['/doc-plans/edit'] = 'doc-plans'
pathToKey['/doc-plans/confirm'] = 'doc-plans'
pathToKey['/doc-plans/handoff'] = 'doc-plans'
pathToKey['/doc-plans/acl'] = 'doc-plans'
pathToKey['/doc-plans/execution'] = 'doc-plans'
pathToKey['/doc-governance/members'] = 'doc-governance'
pathToKey['/doc-governance/taxonomy'] = 'doc-governance'
pathToKey['/doc-governance/clearance'] = 'doc-governance'
pathToKey['/doc-center/knowledge'] = 'doc-library'
pathToKey['/doc-center/my-acks'] = 'doc-library'
pathToKey['/doc-books'] = 'doc-library'
pathToKey['/doc-archives'] = 'doc-library'
pathToKey['/doc-system-plans'] = 'doc-system-plans'
pathToKey['/doc-system-plans/detail'] = 'doc-system-plans'
pathToKey['/doc-api-center'] = 'doc-api-center'
pathToKey['/doc-center/detail'] = 'doc-library'
pathToKey['/doc-center/register'] = 'doc-library'
pathToKey['/doc-center/edit'] = 'doc-library'
pathToKey['/doc-space/form'] = 'doc-space'
// 學習路徑子頁（詳情/策展表單）：守衛與頁簽高亮錨點
pathToKey['/doc-learning/detail'] = 'doc-learning'
pathToKey['/doc-learning/form'] = 'doc-learning'

/** ────────────────────────────────────────────────────────────
 *  2.1 共用落地頁的來源歸屬（側邊欄高亮跟隨進入的菜單）
 *
 *  需求詳情頁是三張需求列表（提需求 / 認領分配 / 需求跟進清單）共用的落地頁。
 *  pathToKey 只能表達「一個 path 歸一個菜單」，若只按 pathname 反查，從任何一側
 *  進詳情都會把高亮釘在默認歸屬（需求跟進清單）上，用戶會以為跳錯了菜單。
 *  與共用訂單路由同一解法：由進入時攜帶的 from 參數決定歸屬（見 Sidebar）。
 *
 *  【只影響高亮，不影響鑒權】：能否進詳情仍由 ROUTE_MENU_KEY_MAP + 後端逐個校驗決定。
 *  ──────────────────────────────────────────────────────────── */

/** 需求詳情頁 pathname（三張需求列表共用的落地頁） */
export const RDM_DETAIL_PATH = '/rdm-detail'

/** 需求詳情默認歸屬菜單（需求跟進清單，即 pathToKey 裡登記的歸屬）與其列表頁路徑 */
const RDM_DETAIL_DEFAULT_MENU_KEY = 'rdm-requirement'

/** 允許作為需求詳情歸屬的來源菜單白名單：只列那些會跳詳情的列表頁所掛的菜單 key */
export const RDM_DETAIL_FROM_MENUS: readonly string[] = ['rdm-intake-approval', 'rdm-intake', 'rdm-requirement', 'rdm-acceptance']

/**
 * 白名單校驗：只有那三張需求列表的菜單 key 才能作為來源。
 * <p>拼錯/偽造的 from 一律視為沒有來源，不得讓 URL 參數把側欄高亮指到用戶根本沒點過的菜單上。
 */
function isRdmDetailFromMenu(menuKey: string | null | undefined): menuKey is string {
  return !!menuKey && RDM_DETAIL_FROM_MENUS.includes(menuKey)
}

/** 解析需求詳情頁的歸屬菜單 key；非該路由返回 null，交由調用方按 path 反查 */
export function resolveRdmDetailMenuKey(pathname: string, search = ''): string | null {
  if (pathname !== RDM_DETAIL_PATH) return null
  const from = new URLSearchParams(search).get('from')
  return (isRdmDetailFromMenu(from) && from) || pathToKey[RDM_DETAIL_PATH] || RDM_DETAIL_DEFAULT_MENU_KEY
}

/**
 * 生成需求詳情頁的路徑 + query（列表頁用 `#${...}` 拼 href 亦可）。
 * <p>來源菜單不在白名單（如需求跟進清單自身）時不帶 from，URL 與歷史鏈接保持一致。
 */
export function buildRdmDetailPath(query: { id: number; tab?: string; from?: string | null }): string {
  const params = new URLSearchParams({ id: String(query.id) })
  if (query.tab) params.set('tab', query.tab)
  if (isRdmDetailFromMenu(query.from)) params.set('from', query.from)
  return `${RDM_DETAIL_PATH}?${params.toString()}`
}

/** 詳情頁取不到數據時的返回落點：跟隨進入來源，無來源才回需求跟進清單 */
export function resolveRdmDetailBackPath(search: string): string {
  const from = new URLSearchParams(search).get('from')
  const backPath = isRdmDetailFromMenu(from) ? keyToPath[from] : undefined
  return backPath || keyToPath[RDM_DETAIL_DEFAULT_MENU_KEY] || '/rdm-requirement'
}

/** ────────────────────────────────────────────────────────────
 *  2.2 提交需求表單頁的返回落點（返回要回到點進來的那張菜單）
 *
 *  歷史 bug：/rdm-submit 的「返回」與「取消」寫死跳個人工作台，從「提需求」菜單點
 *  「提需求」進來的人按返回卻落到工作台，剛存的草稿在那裡根本看不到。
 *  與詳情頁同一解法：入口帶 from 標明來源，返回落點跟隨來源；from 必須先過白名單再查
 *  keyToPath，禁止拿 URL 參數直接當路徑跳（開放重定向）。只影響落點，不參與鑒權。
 *  ──────────────────────────────────────────────────────────── */

/** 提交需求頁 pathname（個人工作台與兩張需求列表共用的表單入口） */
export const RDM_SUBMIT_PATH = '/rdm-submit'

/** 允許作為提交需求返回來源的菜單 key：只列真的放了「提需求」入口的那幾張頁（治理側不提供入口） */
export const RDM_SUBMIT_FROM_MENUS: readonly string[] = ['rdm-workbench', 'rdm-requirement', 'rdm-intake-approval']

/** 無來源時的默認落點：草稿回「提需求」（草稿只在那張頁展示），新建回個人工作台（歷史行為） */
const RDM_SUBMIT_DEFAULT_INTAKE_MENU_KEY = 'rdm-intake-approval'
const RDM_SUBMIT_DEFAULT_WORKBENCH_MENU_KEY = 'rdm-workbench'

/** 白名單校驗：拼錯/偽造的 from 一律視為沒有來源，不得讓 URL 參數決定用戶被丟到哪一頁 */
function isRdmSubmitFromMenu(menuKey: string | null | undefined): menuKey is string {
  return !!menuKey && RDM_SUBMIT_FROM_MENUS.includes(menuKey)
}

/**
 * 提交需求頁返回歸屬的菜單 key（落點與按鈕文案共用同一個值，才會出現「返回提需求」就真回提需求）。
 * @param search 當前頁的 query 串
 * @param isDraftEdit 是否草稿續編（帶 ?id= 進來）：無來源時草稿必須回「提需求」才找得到
 */
export function resolveRdmSubmitBackMenuKey(search: string, isDraftEdit = false): string {
  const from = new URLSearchParams(search).get('from')
  if (isRdmSubmitFromMenu(from)) return from
  return isDraftEdit ? RDM_SUBMIT_DEFAULT_INTAKE_MENU_KEY : RDM_SUBMIT_DEFAULT_WORKBENCH_MENU_KEY
}

/** 生成提交需求頁路徑 + query；來源不在白名單（如治理側）時不帶 from，URL 與歷史鏈接保持一致 */
export function buildRdmSubmitPath(query?: { id?: number; from?: string | null }): string {
  const params = new URLSearchParams()
  if (query?.id) params.set('id', String(query.id))
  if (isRdmSubmitFromMenu(query?.from)) params.set('from', query.from)
  const qs = params.toString()
  return qs ? `${RDM_SUBMIT_PATH}?${qs}` : RDM_SUBMIT_PATH
}

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
  'employee-management', 'hr-onboarding', 'hr-regularization', 'hr-transfer', 'hr-dimission',
  'hr-dict', 'contract-ledger', 'position-management', 'login-log',
  // 組織管理（一级域）
  'org-structure',
  // 假期域
  'hr-leave', 'hr-leave-quota',
  // 員工自助域
  'ess-leave', 'ess-requests', 'ess-profile', 'ess-certificate',
  'hr-certificate',
  // 績效考核域
  'hr-perf-admin', 'hr-perf-review', 'hr-perf-calibration', 'ess-performance',
  // 績效台账域
  'hr-perf-ledger', 'hr-perf-audit', 'hr-perf-appeal',
  // 權限管理（授權中心已合并舊 功能授權/系統授權 兩入口，後端守衛 menu=authorization-center）
  'role-management', 'authorization-center', 'data-permission',
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
  'rule-ad-sales', 'rule-gift', 'rule-security', 'rule-algorithm', 'rule-seq',
  // 智能中心(AI)
  'ai_model_hub', 'ai-operation-auth', 'ai-assistant-overview', 'ai-assistant-capability',
  'ai-assistant-profile', 'ai-assistant-glossary', 'ai-assistant-knowledge',
  'ai-assistant-guardrail', 'ai-assistant-feedback', 'ai-assistant-audit',
  'ai-assistant-quick-prompt', 'ai-assistant-push-template', 'ai-assistant-memory', 'ai-access-request',
  // 企業 Agent 控制台（治理面，独立于 AI 助手使用入口）
  'agent-overview', 'agent-apps', 'agent-budget', 'agent-actions',
  'agent-knowledge', 'agent-data', 'agent-runs', 'agent-evaluation',
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
  'asset-handover', 'asset-repair', 'asset-loss', 'asset-compensation', 'asset-scrap',
  'asset-flow', 'asset-inventory',
  // 用車管理（B1 已接真实 /api/vehicle/*，不再是前端原型，必须登记为已接入后端 ）
  'vehicle-files', 'vehicle-dispatch', 'vehicle-ledger', 'my-vehicle-use', 'vehicle-master-data',
  // 組織編制系统：两个菜单及其表单/详情页全部走真实 /api/hcm/v1/organization/*，无前端 mock 回退
  'hcm-org-legal', 'hcm-org-unit', 'hcm-org-job-family', 'hcm-org-job-grade', 'hcm-org-position',
  'hcm-payroll-component', 'hcm-payroll-standard', 'hcm-payroll-benefit', 'hcm-payroll-rule',
  'hcm-person',
  // 考勤假勤系统：菜单来自后端 sys_menu（阶段二 2A 已落种子），因此十个菜单全部必须登记：
  // 未登记会被 check-menu-consistency 判为「离线路由无法阻断」。
  // 2C 已完成：十个菜单及其子页（表单/详情/处理页）全部走真实 /api/attendance/*，
  // 模块内 mockData.ts 已删除，后端离线时页面如实报错而不是展示假数据。
  'attendance-workbench', 'attendance-group', 'attendance-shift', 'attendance-holiday',
  'attendance-schedule', 'attendance-punch', 'attendance-exception', 'attendance-daily',
  'attendance-monthly', 'attendance-setting',
  // 会议管理：四个菜单及其详情页全部走真实 /api/meeting/*，无前端 mock 回退
  'meeting-my', 'meeting-booking', 'meeting-room', 'meeting-record', 'meeting-config', 'meeting-minutes-list',
  'notification-template', 'notification-switch',
  // 文檔中心：四個菜單及子頁全部走真實 /api/doc/*，無前端 mock 回退
  'doc-library', 'doc-space', 'doc-stats', 'doc-learning',
  // 原生入口必须在线，不能回退到第一阶段演示数据。
  'doc-plans', 'doc-governance',
  // 专题视图：系统方案库、接口管理
  'doc-system-plans', 'doc-api-center',
  // EAM 採購
  'purchase-order', 'purchase-request',
  // 耗材管理
  'consumable-dashboard', 'consumable-item', 'consumable-claim',
  'consumable-inbound', 'consumable-report',
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
