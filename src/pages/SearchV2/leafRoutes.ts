import type { MenuVO } from '@/api/menu'
import { translateMenuName } from '@/i18n/menuNameEn'
import type { Pane } from './prototypeData'

/**
 * 菜单融合第一阶段的「既有菜单叶子 → 原型能力」映射（方案 §18.3）。
 *
 * 一个叶子可承载同一数据域的多个类型（kinds 为该叶子允许的 kind code 子集），
 * 这样既保留既有菜单的细粒度，又让多个菜单共用一张后端配置表、单一数据源。
 *
 * menuKey 显式写出而非从 path 推导：两者当前恰好同名，但菜单 key 的真值在 sys_menu，
 * 隐式约定会在某个叶子 key 与路径不一致时静默取错名称。
 *
 * 引导域三叶的划分口径：「配置」管现在展示什么，「词库」管候选池里有什么：
 *   底紋配置 = placeholder；熱搜配置 = hotNatural(自然热榜) + promoted(付费推广)；
 *   熱搜詞庫 = candidate(候选热词池)。三者不重叠，契约测试会锁定这一点；
 *   若运营不同意该划分，改本表一行即可，不涉及后端与数据变更。
 *
 * 未列入本表的叶子（底紋校驗 / 熱搜校驗 / 底紋報表 / 熱搜報表）本轮维持原页面：
 * 它们是「配置生效诊断」与「词级报表」，与实验室（消费者结果预览）和分析仪表盘
 * （漏斗与口径护栏）能力不重叠，强行归并会丢功能；待实验室/分析页长出对应维度后再合并。
 * 它们的共同问题是数据为 mock，真实化属 B1/B2 范围。
 */
export const LEAF_ROUTES: { path: string; menuKey: string; pane: Pane; kinds?: string[] }[] = [
  // 搜索引導：一张引导表按 word_type 拆成三个既有叶子（熱搜詞庫来自搜索詞庫组，同为引导表）
  { path: '/hint-config', menuKey: 'hint-config', pane: 'guidance', kinds: ['placeholder'] },
  { path: '/hot-search-config', menuKey: 'hot-search-config', pane: 'guidance', kinds: ['hotNatural', 'promoted'] },
  { path: '/hot-search-library', menuKey: 'hot-search-library', pane: 'guidance', kinds: ['candidate'] },
  { path: '/search-weight-config', menuKey: 'search-weight-config', pane: 'interventions' },
  // 搜索配置：场景策略承接维度策略；配置发布为第二阶段新注册叶子
  { path: '/channel-strategy', menuKey: 'channel-strategy', pane: 'scenarios' },
  { path: '/config-release', menuKey: 'config-release', pane: 'releases' },
  // 搜索詞庫：一张词库表按 word_type 拆成三个既有叶子
  { path: '/word-segmentation', menuKey: 'word-segmentation', pane: 'lexicon', kinds: ['business'] },
  { path: '/synonym-config', menuKey: 'synonym-config', pane: 'lexicon', kinds: ['alias', 'directionSynonym'] },
  { path: '/stop-words', menuKey: 'stop-words', pane: 'lexicon', kinds: ['banned'] },
  // 效果校驗：搜索实验室落地为「搜索校驗」叶子（地图选点/用户代入/维度得分在后续刀吸收）
  { path: '/search-verify', menuKey: 'search-verify', pane: 'lab' },
]

/** 按当前路径取叶子配置；未融合的叶子返回 undefined，由 App 路由继续指向原页面。 */
export function leafConfigFor(pathname: string) {
  return LEAF_ROUTES.find(leaf => leaf.path === pathname)
}

/**
 * 叶子页面标题取菜单自身名称：以 sys_menu 为真值，避免把菜单名硬抄进前端文案
 * （check:menu 已有「名称快照与后端种子不一致」告警类别，复制会制造漂移）。
 * 菜单树不可达（离线/未授权）时返回 null，由调用方回退能力域标题。
 */
export function leafMenuName(tree: MenuVO[] | null, menuKey: string): string | null {
  const stack = [...(tree ?? [])]
  while (stack.length) {
    const node = stack.pop()!
    if (node.menuKey === menuKey) return translateMenuName(node.menuKey, node.name, node.nameEn)
    if (node.children?.length) stack.push(...node.children)
  }
  return null
}
