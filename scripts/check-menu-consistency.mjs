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
 *   2. 离线菜单清单只允许收录「页面仍依赖 mock」的菜单（反查 src/api/*.ts 的 mock 回退）
 *   3. 受控菜单（CONTROLLED_MENU_KEYS）必须可路由，且不能是目录 key
 *   4. 路由守卫映射（ROUTE_MENU_KEY_MAP）中的路径必须已在 App.tsx 注册
 *   5. 后端种子里的叶子菜单必须有前端路由映射（新增菜单忘配 keyToPath 时立刻失败）
 *   6. 禁止回归：Sidebar 不得再声明整棵静态菜单树；MenuTabs 名称兜底表条目数不得超过上限
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
const sidebar = read('src/components/Sidebar.tsx')
const keyToPath = extractStringMap(
  sidebar,
  /const keyToPath: Record<string, string> = \{([\s\S]*?)\n\}/,
  'Sidebar.keyToPath',
)

const offlineSrc = read('src/constants/offlineMenus.ts')
const offlineKeys = [...offlineSrc.matchAll(/key:\s*'([^']+)'/g)].map((m) => m[1])
const offlineLabelByKeys = Object.fromEntries(
  [...offlineSrc.matchAll(/key:\s*'([^']+)',\s*label:\s*'([^']+)'/g)].map((m) => [m[1], m[2]]),
)

// ────────── 前端：受控菜单与路由守卫映射 ──────────
const permTypes = read('src/pages/Permission/types.ts')
const controlledBlock = permTypes.match(/export const CONTROLLED_MENU_KEYS: string\[\] = \[([\s\S]*?)\n\]/)
const controlledKeys = controlledBlock
  ? [...controlledBlock[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
  : (fail('未能解析 CONTROLLED_MENU_KEYS'), [])

const routeMapBlock = permTypes.match(/const ROUTE_MENU_KEY_MAP[^=]*= \{([\s\S]*?)\n\}/)
  ?? permTypes.match(/ROUTE_MENU_KEY_MAP[^\n]*\n[\s\S]*?\{([\s\S]*?)\n\}/)
const appRoutes = new Set(
  [...read('src/App.tsx').matchAll(/<Route path="([^"]+)"/g)].map((m) => m[1]),
)

// ────────── 前端：静态副本回归检测 ──────────
if (/^const menuItems: MenuItem\[\] = \{$/m.test(sidebar)) {
  fail('Sidebar.tsx 重新出现了整棵静态菜单树 menuItems（菜单真值应来自 /api/menus/tree）')
}
const menuTabs = read('src/components/MenuTabs.tsx')
const subPageName = menuTabs.match(/const SUB_PAGE_NAME: Record<string, string> = \{([\s\S]*?)\n\}/)
const subPageCount = subPageName ? [...subPageName[1].matchAll(/'[^']+':\s*'[^']+'/g)].length : 0
const SUB_PAGE_NAME_LIMIT = 20
if (!subPageName) {
  fail('未能解析 MenuTabs.SUB_PAGE_NAME（菜单名兜底表应仅保留非菜单页, 不得回填菜单名）')
} else if (subPageCount > SUB_PAGE_NAME_LIMIT) {
  fail(`MenuTabs.SUB_PAGE_NAME 条目数 ${subPageCount} 超过上限 ${SUB_PAGE_NAME_LIMIT}：`
    + '菜单页名称必须来自后端菜单树, 该表只允许保留详情页/独立页')
}

// ────────── 后端：种子菜单与目录判定 ──────────
const dataInitializer = read('backend/src/main/java/com/mftb/admin/config/DataInitializer.java')
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
    fail(`离线菜单 ${key} 的页面已接入后端 API, 应从 src/constants/offlineMenus.ts 移除`)
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

// ────────── 校验 6：种子默认名与离线清单快照名一致（避免离线时看到旧名） ──────────
for (const [key, label] of Object.entries(offlineLabelByKeys)) {
  if (seedNames[key] && seedNames[key] !== label) {
    warn(`离线菜单 ${key} 名称快照「${label}」与后端种子默认名「${seedNames[key]}」不一致`
      + '（运行时以 DB 为准, 建议同步快照）')
  }
}

// ────────── 输出 ──────────
console.log('菜单一致性检查')
console.log(`  后端种子菜单 ${seedKeys.length} 条 / 前端路由映射 ${Object.keys(keyToPath).length} 条 / `
  + `离线菜单 ${offlineKeys.length} 条 / 受控菜单 ${controlledKeys.length} 条`)
console.log(`  已接入后端 API 的菜单 ${backendIntegratedMenuKeys.size} 条`)
for (const w of warnings) console.log(`⚠  ${w}`)
for (const f of failures) console.error(`✗  ${f}`)
if (failures.length > 0) {
  console.error(`\n菜单一致性检查失败：${failures.length} 项。菜单真值源为后端 sys_menu, `
    + '新增/改名菜单请同步后端种子与 Sidebar.keyToPath, 不要新增前端菜单名副本。')
  process.exit(1)
}
console.log('\n✅ 菜单一致性检查通过')
