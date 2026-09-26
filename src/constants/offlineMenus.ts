/**
 * 离线菜单清单（前端唯一保留的本地菜单定义）
 *
 * 业务规则：后端服务停止时只展示尚未对接后端业务接口的菜单。
 * 判定标准：页面及其子路由是否调用了真实后端 API（通过 src/api/*.ts 的 request 实例），
 * 而非是否包含 mock fallback 代码。已对接后端的页面即使保留 mock 回退，
 * 也不属于离线可展示菜单。
 *
 * 约束：
 * 1. 只允许收录「页面完全未接入后端业务 API」的菜单；
 * 2. 名称/层级以 DB 为准——后端菜单树可用时本清单仅补挂 DB 中完全缺失的项；
 * 3. 某页面接完真实 API 后，必须把对应条目从本清单移除。
 */

/** 离线菜单节点（label 为 DB 真值快照, 后端可用时会被 DB 值覆盖） */
export interface OfflineMenuNode {
  key: string
  label: string
  systemCode?: string
  children?: OfflineMenuNode[]
}

export const OFFLINE_MENUS: OfflineMenuNode[] = [
  {
    key: 'search',
    label: '搜索管理',
    systemCode: 'search',
    children: [
      {
        key: 'search-config-new',
        label: '搜索配置',
        children: [
          { key: 'global-config', label: '全局配置' },
          { key: 'channel-strategy', label: '維度策略' },
        ],
      },
      {
        key: 'search-guide',
        label: '搜索引導',
        children: [
          { key: 'hint-config', label: '底紋配置' },
          // 熱搜配置已接入 fetchAdAlgorithms/fetchStores，停服时不展示
          { key: 'search-weight-config', label: '權重干預' },
        ],
      },
      {
        key: 'search-library',
        label: '搜索詞庫',
        children: [
          { key: 'word-segmentation', label: '分詞詞庫' },
          { key: 'synonym-config', label: '同義詞庫' },
          { key: 'hot-search-library', label: '熱搜詞庫' },
          { key: 'stop-words', label: '停用詞庫' },
        ],
      },
      {
        key: 'search-verify-group',
        label: '效果校驗',
        children: [
          { key: 'search-verify', label: '搜索校驗' },
          { key: 'hint-verify', label: '底紋校驗' },
          { key: 'hot-search-verify', label: '熱搜校驗' },
        ],
      },
      {
        key: 'report',
        label: '報表統計',
        children: [
          { key: 'hint-report', label: '底紋報表' },
          { key: 'hot-search-report', label: '熱搜報表' },
        ],
      },
    ],
  },
  // ── 推廣報表（纯前端 mock，未接入后端业务 API） ──
  {
    key: 'promotion-report-group',
    label: '推廣報表',
    systemCode: 'seller',
    children: [
      { key: 'promotion-report-overview', label: '報表總覽' },
      { key: 'promotion-report-order', label: '訂單報表' },
      { key: 'promotion-report-compare', label: '對比分析' },
    ],
  },
]

/** 递归扁平化离线菜单 key 集合（供侧边栏补挂判定与 CI 一致性校验使用） */
export const collectOfflineMenuKeys = (nodes: OfflineMenuNode[] = OFFLINE_MENUS, acc = new Set<string>()): Set<string> => {
  for (const n of nodes) {
    acc.add(n.key)
    if (n.children?.length) collectOfflineMenuKeys(n.children, acc)
  }
  return acc
}

/** 离线菜单全部 key（含分组目录） */
export const OFFLINE_MENU_KEYS: Set<string> = collectOfflineMenuKeys()

/** 递归收集离线菜单 key → 名称映射（供标签页等无后端菜单树时展示名称） */
export const collectOfflineMenuLabels = (
  nodes: OfflineMenuNode[] = OFFLINE_MENUS,
  acc: Record<string, string> = {},
): Record<string, string> => {
  for (const n of nodes) {
    acc[n.key] = n.label
    if (n.children?.length) collectOfflineMenuLabels(n.children, acc)
  }
  return acc
}

/** 离线菜单 key → 名称 */
export const OFFLINE_MENU_LABELS: Record<string, string> = collectOfflineMenuLabels()
