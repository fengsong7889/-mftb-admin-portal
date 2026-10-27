#!/usr/bin/env node
/**
 * 菜单一致性门禁（npm run check:menu）
 *
 * 背景：菜单曾同时存在于 6 份副本（后端种子 / sys_menu / Sidebar 静态树 / MenuTabs 兜底表 /
 * Home.allMenus / Permission.menuPermissionTree），任一处改名就会出现「左侧菜单与页面标题不一致」
 * 「后端启动与否菜单不一样」等问题。本脚本固化收敛后的约束：
 *
 *   真值源：后端 sys_menu（种子见 DataInitializer.seedSystemMenus / reconcileMenuMasterData）
 *   前端只保留：menuKey → 路由路径（Sidebar.keyToPath）、图标兜底、离线菜单清单（offlineMenus.ts）
 *
 * 校验项：
 *   1. 离线菜单清单的每个 key 都有路由映射，且都存在于后端种子菜单中
 *   2. 离线菜单清单只允许收录「页面仍依赖 mock」的菜单（反查 frontend/packages/platform-client/src/api/*.ts 的 mock 回退）
 *   3. 受控菜单（CONTROLLED_MENU_KEYS）必须可路由，且不能是目录 key
 *   4. 路由守卫映射（ROUTE_MENU_KEY_MAP）中的路径必须已在 App.tsx 注册
 *   5. 后端种子里的叶子菜单必须有前端路由映射（新增菜单忘配 keyToPath 时立刻失败）
 *   6. 后端种子里的叶子菜单必须在 MENU_ACTIONS_MAP 登记功能操作集（否则授权中心
 *      「功能操作」面板会回退成全部 8 个通用动作，把導入/啟用 等无关项授予出去）
 *   7. 禁止回归：Sidebar 不得再声明整棵静态菜单树；MenuTabs 名称兜底表条目数不得超过上限
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => readFileSync(join(ROOT, rel), 'utf-8')

const failures = []
const warnings = []
const fail = (msg) => failures.push(msg)
const warn = (msg) => warnings.push(msg)

/** 提取 `const X = { 'k': 'v', ... }` 形式的字符串字面量映射 */
function extractStringMap(source, declRegex, label) {
  const match = source.match(declRegex)
  if (!match) {
    fail(`未能解析 ${label}（结构变更请同步更新 scripts/check-menu-consistency.mjs）`)
    return {}
  }
  return Object.fromEntries([...match[1].matchAll(/'([^']+)':\s*'([^']+)'/g)].map((m) => [m[1], m[2]]))
}

// ────────── 前端：路由映射 / 离线清单 ──────────
const sidebar = read('frontend/packages/ui/src/components/Sidebar.tsx')
const menuDataSource = read('frontend/packages/contracts/src/constants/menuDataSource.ts')
const keyToPath = extractStringMap(
  menuDataSource,
  /export const keyToPath: Record<string, string> = \{([\s\S]*?)\n\}/,
  'menuDataSource.keyToPath',
)

const offlineSrc = read('frontend/packages/contracts/src/constants/offlineMenus.ts')
const offlineKeys = [...offlineSrc.matchAll(/key:\s*'([^']+)'/g)].map((m) => m[1])
const offlineLabelByKeys = Object.fromEntries(
  [...offlineSrc.matchAll(/key:\s*'([^']+)',\s*label:\s*'([^']+)'/g)].map((m) => [m[1], m[2]]),
)

// ────────── 前端：受控菜单与路由守卫映射 ──────────
const permTypes = read('frontend/packages/contracts/src/menuPermission.ts')
const controlledBlock = permTypes.match(/export const CONTROLLED_MENU_KEYS: string\[\] = \[([\s\S]*?)\n\]/)
const controlledKeys = controlledBlock
  ? [...controlledBlock[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
  : (fail('未能解析 CONTROLLED_MENU_KEYS'), [])

const routeMapBlock = permTypes.match(/const ROUTE_MENU_KEY_MAP[^=]*= \{([\s\S]*?)\n\}/)
  ?? permTypes.match(/ROUTE_MENU_KEY_MAP[^\n]*\n[\s\S]*?\{([\s\S]*?)\n\}/)
const menuActionsBlock = permTypes.match(/export const MENU_ACTIONS_MAP[^=]*= \{([\s\S]*?)\n\}/)
const menuActionKeys = new Set(menuActionsBlock
  ? [...menuActionsBlock[1].matchAll(/^ {2}'([^']+)':\s*\[/gm)].map((m) => m[1])
  : (fail('未能解析 MENU_ACTIONS_MAP（结构变更请同步更新 scripts/check-menu-consistency.mjs）'), []))
// 路由真值 = 门户壳 + 各应用路由表（方案 P2 之后应用路由已搬进 frontend/apps/<app>/src/routes.tsx）
// 用显式循环而不是 new Set(...flatMap(...)) 链式写法：后者在本仓的表达式嵌套下曾静默退化成 1 个元素。
const appRoutePaths = []
for (const routeFile of ['src/App.tsx', ...appRouteFiles()]) {
  for (const m of read(routeFile).matchAll(/<Route path="([^"]+)"/g)) appRoutePaths.push(m[1])
}
const appRoutes = new Set(appRoutePaths)

// ────────── 前端：静态副本回归检测 ──────────
if (/^const menuItems: MenuItem\[\] = \{$/m.test(sidebar)) {
  fail('Sidebar.tsx 重新出现了整棵静态菜单树 menuItems（菜单真值应来自 /api/menus/tree）')
}
const menuTabs = read('frontend/packages/ui/src/components/MenuTabs.tsx')
const subPageName = menuTabs.match(/const SUB_PAGE_NAME: Record<string, string> = \{([\s\S]*?)\n\}/)
const subPageCount = subPageName ? [...subPageName[1].matchAll(/'[^']+':\s*'[^']+'/g)].length : 0
// 棘轮上限：表内只允许详情页/独立页（无菜单记录的路由）；每新增一个合法独立页 +1 并在此登记原因
// 20 → 21：v3.18 新增独立页 /rdm-gantt（需求甘特圖，无后端菜单记录，侧栏高亮归 rdm-requirement）
const SUB_PAGE_NAME_LIMIT = 21
if (!subPageName) {
  fail('未能解析 MenuTabs.SUB_PAGE_NAME（菜单名兜底表应仅保留非菜单页, 不得回填菜单名）')
} else if (subPageCount > SUB_PAGE_NAME_LIMIT) {
  fail(`MenuTabs.SUB_PAGE_NAME 条目数 ${subPageCount} 超过上限 ${SUB_PAGE_NAME_LIMIT}：`
    + '菜单页名称必须来自后端菜单树, 该表只允许保留详情页/独立页')
}

// ────────── 后端：种子菜单与目录判定 ──────────
const dataInitializer = read('backend/modules/legacy/src/main/java/com/mftb/admin/config/DataInitializer.java')
const seedEntries = [...dataInitializer.matchAll(
  /menus\.put\("([^"]+)",\s*new String\[\]\{"([^"]*)",\s*(null|"[^"]*"),\s*"(\d+)"\}\)/g,
)]
if (seedEntries.length === 0) {
  fail('未能解析 DataInitializer.seedSystemMenus 的种子菜单（格式变更请同步本脚本）')
}
const seedKeys = seedEntries.map((m) => m[1])
const seedNames = Object.fromEntries(seedEntries.map((m) => [m[1], m[2]]))
const parentKeys = new Set(seedEntries.map((m) => (m[3] === 'null' ? null : m[3].replace(/"/g, ''))).filter(Boolean))
const seedLeafKeys = seedKeys.filter((k) => !parentKeys.has(k))
/** 其它初始化器/SQL 负责种子的菜单（不在 DataInitializer 主种子里） */
const SEEDED_ELSEWHERE = new Set(['consumable-ops', 'consumable-dashboard', 'consumable-item',
  'consumable-claim', 'consumable-stock', 'consumable-stock-txn', 'consumable-alert'])

// 域初始化器不经过 menus.put；直接解析 ensureMenu，避免新增菜单落在主种子门禁盲区。
// 多模块（方案 P3）：域模块各自持有初始化器（如耗材/资产菜单随 modules/eam），
// 只扫 legacy 会把「域模块里新增的菜单」判成未登记，门禁会误报失败。
const initializerDirs = [
  'backend/modules/legacy/src/main/java/com/mftb/admin/config',
  'backend/modules/rdm/src/main/java/com/mftb/admin/config',
  'backend/modules/eam/src/main/java/com/mftb/admin/config',
].filter((dir) => existsSync(join(ROOT, dir)))
const initializerFiles = initializerDirs.flatMap((dir) =>
  readdirSync(join(ROOT, dir)).map((file) => `${dir}/${file}`),
)
const domainSeedMenus = initializerFiles
  .filter((file) => file.endsWith('Initializer.java'))
  .flatMap((file) => [...read(file).matchAll(
    /\bensureMenu\(\s*\w+,\s*"([^"]+)",\s*"([^"]+)",\s*"(\/[^"\s]*)",\s*"([^"]+)",\s*"([^"]+)"/g,
  )].map((m) => ({ key: m[1], name: m[2], path: m[3], icon: m[5], file })))
// 注意：file 现在是「目录/文件名」完整相对路径（多模块后可能来自 legacy 或域模块）
if (!domainSeedMenus.some((menu) => menu.file.endsWith('/ConsumableSchemaInitializer.java'))) {
  fail('未能解析耗材初始化器的 ensureMenu 种子，不能跳过域菜单检查')
}

/**
 * 数组式种子菜单（`private static final String[][] MENUS = { {"key", "名", "英文名", "/path", ...} }`）。
 * <p>背景：RdmMenuInitializer 这类初始化器不走 ensureMenu，历史上落在本脚本盲区——
 * 「項目總覽/測試工作台/發布中心」三个菜单上线时没同步 Sidebar.keyToPath，
 * 点击直接报「該功能模塊開發中」而 CI 全绿。此处把它们纳入校验 5/6 的叶子菜单集合。
 * <p>只补「路由映射 + 功能操作集」两项盲区；离线阻断等更严的校验仍由校验 8 的 ensureMenu 路径负责；
 * 图标盲区由 arraySeedIcons 在校验 5 补查（生产「測試工作台无图标」事故反补）。
 */
const arraySeedMenus = initializerFiles
  .filter((file) => file.endsWith('Initializer.java'))
  .flatMap((file) => [...read(file).matchAll(
    /^\s*\{"([^"]+)",\s*"([^"]+)",\s*(?:"[^"]*"|null),\s*"(\/[^"\s]*)"/gm,
  )].map((m) => ({ key: m[1], name: m[2], path: m[3], file })))
/**
 * 数组式种子的图标列（第 6 列）：{key, 名, 英文名, "/path", 组件, "Icon", ...}。
 * <p>事故反补盲区：「測試工作台」种子图标 BugOutlined 从未在 MenuIcon 注册，
 * 侧边栏图标为空上了生产而 CI 全绿——此前本脚本只对 ensureMenu/MenuDef 路径查图标。
 * <p>独立解析不并入 arraySeedMenus：图标列解析不到的行不能连带拖垮校验 5 的导航检查。
 * <p>只收有路由的叶子菜单：目录行（path=null）的图标走 Sidebar keyToIcon 兜底，渲染路径不同。
 */
const arraySeedIcons = Object.fromEntries(initializerFiles
  .filter((file) => file.endsWith('Initializer.java'))
  .flatMap((file) => [...read(file).matchAll(
    /^\s*\{"([^"]+)",\s*"([^"]+)",\s*(?:"[^"]*"|null),\s*"(\/[^"\s]*)",\s*(?:"[^"]*"|null),\s*"([^"]+)"/gm,
  )].map((m) => [m[1], { icon: m[4], file }])))
/**
 * record 式种子菜单（`new MenuDef("key", "名", "英文名", "/path", "Component", "Icon", ...)`）。
 * <p>背景：AI 助手配置中心由 AiAssistantConfigMenuInitializer 的 MenuDef 声明子菜单，
 * 既不在 DataInitializer 主种子，也不符合 ensureMenu / 数组式模式，长期落在本脚本盲区：
 * 新增子页漏配 keyToPath/权限/图标时 CI 全绿，但点击报“开发中”或授权中心少动作集。
 * <p>此处按 ensureMenu 同档检查（导航/页面/后端连接/权限路由/受控/图标/操作集）。
 */
const menuDefMenus = initializerFiles
  .filter((file) => file.endsWith('.java'))
  .flatMap((file) => [...read(file).matchAll(
    /new MenuDef\(\s*"([^"]+)",\s*"[^"]*",\s*"[^"]*",\s*"(\/[^"\s]*)",\s*"[^"]*",\s*"([^"]+)"/g,
  )].map((m) => ({ key: m[1], path: m[2], icon: m[3], file })))
if (!menuDefMenus.some((menu) => menu.file.endsWith('/AiAssistantConfigMenuInitializer.java'))) {
  fail('未能解析 AI 助手配置中心的 MenuDef 种子，不能跳过该域菜单检查')
}
const backendKeysBlock = menuDataSource.match(/export const BACKEND_CONNECTED_KEYS[^=]*= new Set\(\[([\s\S]*?)\]\)/)
const backendKeys = new Set(backendKeysBlock
  ? [...backendKeysBlock[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
  : (fail('未能解析 BACKEND_CONNECTED_KEYS'), []))
const registeredIcons = new Set([...read('frontend/packages/ui/src/components/MenuIcon.tsx')
  .matchAll(/'([^']+)':\s*\w+/g)].map((m) => m[1]))
const fallbackIcons = Object.fromEntries([...sidebar.matchAll(/'([^']+)':\s*<(\w+)/g)]
  .map((m) => [m[1], m[2]]))
const routeMenuMap = routeMapBlock
  ? Object.fromEntries([...routeMapBlock[1].matchAll(/'([^']+)':\s*'([^']+)'/g)].map((m) => [m[1], m[2]]))
  : {}

// ────────── 校验 1：离线菜单必须有路由映射且在种子中 ──────────
for (const key of offlineKeys) {
  if (!keyToPath[key] && !parentKeys.has(key) && !SEEDED_ELSEWHERE.has(key)) {
    fail(`离线菜单 ${key} 缺少 Sidebar.keyToPath 路由映射`)
  }
  if (!seedKeys.includes(key) && !SEEDED_ELSEWHERE.has(key)) {
    fail(`离线菜单 ${key} 不存在于后端种子菜单, 后端可用时会被本地值覆盖不到的分支干扰（请先补种子）`)
  }
}

// ────────── 校验 2：离线菜单必须确实未接入后端 API ──────────
/** 检测页面文件是否调用了真实后端 API（通过 request 实例的 import） */
function appRouteFiles() {
  const base = join(ROOT, 'frontend', 'apps')
  if (!existsSync(base)) return []
  return readdirSync(base)
    .map((code) => `frontend/apps/${code}/src/routes.tsx`)
    .filter((rel) => existsSync(join(ROOT, rel)))
}

const app = read('src/App.tsx')
const compDirs = {}
for (const m of app.matchAll(/(?:const|import)\s+(\w+)\s*=\s*(?:lazy\(\(\)\s*=>\s*)?import\('([^']+)'\)/g)) {
  compDirs[m[1]] = m[2].replace('./', 'src/')
}
for (const m of app.matchAll(/import\s+(\w+)\s+from\s+'(\.\/pages\/[^']+)'/g)) {
  compDirs[m[1]] = m[2].replace('./', 'src/')
}
const pathToComp = {}
const compToPath = {}
for (const m of app.matchAll(/<Route path="([^"]+)"\s+element=\{<(\w+)/g)) {
  pathToComp[m[1]] = m[2]
  if (!compToPath[m[2]]) compToPath[m[2]] = m[1]
}

/** 页面文件集合：lazy 路径既可能是目录也可能是单文件 */
function pageFilesUnder(dir) {
  const asDir = join(ROOT, dir)
  const asFile = `${asDir}.tsx`
  if (existsSync(asFile)) return [`${dir}.tsx`]
  const out = []
  const walk = (abs, rel) => {
    if (!existsSync(abs)) return
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      const absChild = join(abs, entry.name)
      const relChild = `${rel}/${entry.name}`
      if (entry.isDirectory()) walk(absChild, relChild)
      else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.includes('.test.')) out.push(relChild)
    }
  }
  walk(asDir, dir)
  return out
}

/** 检测页面是否引用了真实 API 模块（排除 type-only import） */
const API_IMPORT_RE = /from\s+'[^']*(?:api|request)(?:\/[^']*)?'/
const TYPE_ONLY_RE = /^\s*import\s+type\s/

function pageHasApiDependency(dir) {
  try {
    return pageFilesUnder(dir).some((f) => {
      const src = read(f)
      const lines = src.split('\n')
      return lines.some((line) => API_IMPORT_RE.test(line) && !TYPE_ONLY_RE.test(line))
    })
  } catch {
    return false
  }
}

/** 收集有后端 API 依赖的菜单 key */
const backendIntegratedMenuKeys = new Set()
for (const comp of Object.keys(compDirs)) {
  const dir = compDirs[comp]
  if (!pageHasApiDependency(dir)) continue
  const path = compToPath[comp]
  const menuKey = Object.keys(keyToPath).find((k) => keyToPath[k].split('#')[0] === path)
  if (menuKey) backendIntegratedMenuKeys.add(menuKey)
}

for (const key of offlineKeys) {
  const isDirectory = parentKeys.has(key)
  if (!isDirectory && backendIntegratedMenuKeys.has(key)) {
    fail(`离线菜单 ${key} 的页面已接入后端 API, 应从 frontend/packages/contracts/src/constants/offlineMenus.ts 移除`)
  }
}

// ────────── 校验 3：受控菜单必须可路由 ──────────
for (const key of controlledKeys) {
  if (!keyToPath[key]) {
    fail(`受控菜单 ${key} 缺少 Sidebar.keyToPath 映射, 权限过滤后会导致菜单不可见/无法跳转`)
  }
  if (parentKeys.has(key)) {
    fail(`受控菜单 ${key} 是目录节点, 不应出现在 CONTROLLED_MENU_KEYS`)
  }
}

// ────────── 校验 4：路由守卫映射的路径必须已注册 ──────────
if (routeMapBlock) {
  const entries = [...routeMapBlock[1].matchAll(/'([^']+)':\s*'([^']+)'/g)]
  for (const [, path, key] of entries) {
    const base = path.split('/:')[0].replace(/\/$/, '')
    const registered = [...appRoutes].some((r) => r === path || r.startsWith(`${base}/`) || r === base)
    if (!registered) {
      fail(`ROUTE_MENU_KEY_MAP 中的 ${path}（${key}）未在 App.tsx 注册路由`)
    }
  }
} else {
  warn('未能解析 ROUTE_MENU_KEY_MAP, 跳过路由守卫健校')
}

// ────────── 校验 5：种子叶子菜单必须有路由映射 ──────────
for (const key of seedLeafKeys) {
  if (!keyToPath[key] && !SEEDED_ELSEWHERE.has(key)) {
    fail(`后端种子菜单 ${key}「${seedNames[key]}」缺少 Sidebar.keyToPath 映射, 点击菜单将提示"开发中"`)
  }
}
for (const { key, name, path, file } of arraySeedMenus) {
  if (keyToPath[key] !== path) {
    fail(`${file} 种子菜单 ${key}「${name}」缺少/不匹配 Sidebar.keyToPath 映射（应为 ${path}）, `
      + '点击菜单将落到“該功能模塊開發中”兜底提示')
  }
}
// 数组式种子图标盲区补查（与校验 8 同档查注册表，但不要求 Sidebar 兜底图标：
// 这些菜单的图标存在 DB icon 字段，运行时由 renderMenuIcon 按名称解析）。
for (const [key, { icon, file }] of Object.entries(arraySeedIcons)) {
  if (!registeredIcons.has(icon)) {
    fail(`${file} 种子菜单 ${key} 的后端图标 ${icon} 未在 MenuIcon 注册, 侧边栏图标将为空`)
  }
}
for (const { key, path, file } of menuDefMenus) {
  if (keyToPath[key] !== path) {
    fail(`${file} MenuDef 菜单 ${key} 缺少/不匹配 Sidebar.keyToPath 映射（应为 ${path}）, `
      + '点击菜单将落到“該功能模塊開發中”兜底提示')
  }
}

// ────────── 校验 6：叶子菜单必须登记功能操作集 ──────────
// 后端 sys_menu.actions 大多未回填（主种子不写 actions），授权中心「功能操作」面板实际取
// MENU_ACTIONS_MAP；缺失即回退成全部 8 个通用动作，会把導入/啟用 等无关动作授予出去。
for (const key of [...seedLeafKeys, ...domainSeedMenus.map((m) => m.key), ...arraySeedMenus.map((m) => m.key), ...menuDefMenus.map((m) => m.key)]) {
  if (!menuActionKeys.has(key)) {
    fail(`菜单 ${key}「${seedNames[key] || ''}」未在 MENU_ACTIONS_MAP 登记功能操作集, `
      + '授权中心将回退展示全部通用动作（按后端 @RequirePermission 实际动作补齐）')
  }
}

// ────────── 校验 7：种子默认名与离线清单快照名一致（避免离线时看到旧名） ──────────
for (const [key, label] of Object.entries(offlineLabelByKeys)) {
  if (seedNames[key] && seedNames[key] !== label) {
    warn(`离线菜单 ${key} 名称快照「${label}」与后端种子默认名「${seedNames[key]}」不一致`
      + '（运行时以 DB 为准, 建议同步快照）')
  }
}

// ────────── 校验 8：域初始化器菜单（导航/页面/后端/权限/图标）──────────
// 域菜单同时检查导航、页面、后端连接、权限和两级图标，不再只检查主初始化器。
for (const { key, name, path, icon, file } of domainSeedMenus) {
  const label = `${file}: ${key}「${name}」`
  if (keyToPath[key] !== path) fail(`${label} 导航映射缺失或与后端路径 ${path} 不一致`)
  if (!appRoutes.has(path)) fail(`${label} 未在 App.tsx 注册页面 ${path}`)
  if (!backendKeys.has(key)) fail(`${label} 未登记 BACKEND_CONNECTED_KEYS，离线路由无法阻断`)
  if (routeMenuMap[path] !== key) fail(`${label} 缺少 ROUTE_MENU_KEY_MAP 权限路由登记`)
  // 耗材领用为已有全员自助入口；资产历史授权/图标差异仅告警，不在本轮改变授权语义。
  const reportAccessIssue = key.startsWith('consumable-') ? fail : warn
  if (key !== 'consumable-claim' && !controlledKeys.includes(key)) reportAccessIssue(`${label} 未登记 CONTROLLED_MENU_KEYS`)
  if (!registeredIcons.has(icon)) reportAccessIssue(`${label} 的后端图标 ${icon} 未在 MenuIcon 注册`)
  if (fallbackIcons[key] !== icon) reportAccessIssue(`${label} 缺少与 ${icon} 一致的 Sidebar 兜底图标`)
}

// ────────── 校验 9：MenuDef 式菜单（AI 助手配置中心）──────────
for (const { key, path, icon, file } of menuDefMenus) {
  const label = `${file}: ${key}`
  if (!appRoutes.has(path)) fail(`${label} 未在 App.tsx 注册页面 ${path}`)
  if (!backendKeys.has(key)) fail(`${label} 未登记 BACKEND_CONNECTED_KEYS，离线路由无法阻断`)
  if (routeMenuMap[path] !== key) fail(`${label} 缺少 ROUTE_MENU_KEY_MAP 权限路由登记`)
  if (!controlledKeys.includes(key)) fail(`${label} 未登记 CONTROLLED_MENU_KEYS`)
  if (!registeredIcons.has(icon)) fail(`${label} 的后端图标 ${icon} 未在 MenuIcon 注册`)
  if (fallbackIcons[key] !== icon) fail(`${label} 缺少与 ${icon} 一致的 Sidebar 兜底图标`)
}

// ────────── 输出 ──────────
console.log('菜单一致性检查')
console.log(`  域初始化器菜单声明 ${domainSeedMenus.length} 条（含导航、权限、图标检查）/ `
  + `数组式种子菜单 ${arraySeedMenus.length} 条（导航 + 功能操作集检查）/ `
  + `MenuDef 菜单 ${menuDefMenus.length} 条（导航/页面/权限/图标）`)
console.log(`  后端种子菜单 ${seedKeys.length} 条 / 前端路由映射 ${Object.keys(keyToPath).length} 条 / `
  + `离线菜单 ${offlineKeys.length} 条 / 受控菜单 ${controlledKeys.length} 条 / `
  + `功能操作登记 ${menuActionKeys.size} 条`)
console.log(`  已接入后端 API 的菜单 ${backendIntegratedMenuKeys.size} 条`)
for (const w of warnings) console.log(`⚠  ${w}`)
for (const f of failures) console.error(`✗  ${f}`)
if (failures.length > 0) {
  console.error(`\n菜单一致性检查失败：${failures.length} 项。菜单真值源为后端 sys_menu, `
    + '新增/改名菜单请同步后端种子与 Sidebar.keyToPath, 不要新增前端菜单名副本。')
  process.exit(1)
}
console.log('\n✅ 菜单一致性检查通过')
