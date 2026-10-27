/**
 * 影响域分析的纯函数层（无 fs / 无 git / 无进程环境变量）。
 *
 * 为什么要从 scripts/affected-tests.mjs 里拆出来：分系统独立工程改造方案 §十 要求
 * 「影响分析单元测试：单系统变更、多跳依赖、跨语言契约、删除/重命名、Git 失败、0 测试、
 * 全局升档、缓存失效」。原来这些逻辑和 git/fs 读取混在一个自执行脚本里，
 * 任何一条规则改动都无法在不跑真实仓库的情况下验证 —— 而选错测试的影响是「漏测后照常发布」。
 *
 * 约定：所有需要读文件的地方都由调用方注入 `read(relPath) => string`，
 * 需要判断文件存在性时注入 `isFile(relPath) => boolean`。真实脚本注入 fs，测试注入内存 map。
 */

// 多模块（方案 P3）：业务实现留在 modules/legacy，集成测试在 bootstrap。
// 保留 JAVA_ROOT 作为兼容常量（= legacy 主源码根），新增测试根单独判断，
// 否则“后端测试文件”会被判成业务源码，影响域会算错。
export const JAVA_ROOT = 'backend/modules/legacy/src'
export const JAVA_TEST_ROOT = 'backend/bootstrap/src'
// 已拆出的域模块（方案 P3 第 3 步）：与 legacy 一起构成后端主源码
// 注意：数组顺序即扫描顺序；新增域模块时同步追加，否则其测试类不会被选中。
export const JAVA_DOMAIN_ROOTS = ['backend/modules/rdm/src', 'backend/modules/eam/src', 'backend/modules/hr/src']

// ───────────────────────── 共享层规则（命中即升档全量） ─────────────────────────
// 这些文件被多个系统/菜单共用，任何改动都可能波及全量，必须跑全量。
export const GLOBAL_FE = [
  /^src\/main\.tsx$/,
  /^src\/App\.tsx$/,
  /^src\/App\.css$/,
  /^src\/build-meta\.d\.ts$/,
  /^src\/test\//,
  /^src\/pages\/_shared\//,
  // 共享层已拆为 workspace 包：包内任何文件都是共享层，命中即升档全量
  /^frontend\/packages\//,
  /^(package\.json|package-lock\.json|tsconfig\.json|vite\.config\.ts|vitest\.config\.ts|eslint\.config\.js|index\.html)$/,
]

export const GLOBAL_BE = [
  /^backend\/pom\.xml$/,
  // 多模块（P3）：模块 POM / 技术底座 / 共享平台层 / 启动配置 任一改动都必须升档全量
  /^backend\/(libraries|contracts|modules|bootstrap)\/[^/]+\/pom\.xml$/,
  /^backend\/libraries\/platform-core\//,
  /^backend\/modules\/shared\//,
  /^backend\/bootstrap\/src\/main\/resources\//,
  /^backend\/modules\/legacy\/src\/main\/resources\/application/,
  /^backend\/modules\/legacy\/src\/main\/resources\/db\/migrations\//,
  /^backend\/sql\//,
  // 跨域共享的技术层：改变会波及所有域，按全量处理
  /^backend\/modules\/legacy\/src\/main\/java\/com\/mftb\/admin\/(config|aspect|util|constant|mapper|entity)\//,
  /^backend\/modules\/rdm\/src\/main\/java\/com\/mftb\/admin\/(config|aspect|util|constant|mapper|entity)\//,
  /^backend\/bootstrap\/src\/test\/java\/com\/mftb\/admin\/security\/SecurityTestBase\.java$/,
]

export const GLOBAL_BOTH = [/^scripts\//, /^\.github\//, /^\.qoder\/rules\//, /^AGENTS\.md$/]

export const isTestFile = (f) => /\.(test|spec)\.(ts|tsx)$/.test(f)

/** 业务源码判定：排除测试与非逻辑资源，用于「有业务改动却选不到测试」的缺口检测 */
export const isFrontendBusinessFile = (f) =>
  (f.startsWith('src/') || f.startsWith('frontend/')) && /\.(ts|tsx)$/.test(f) && !isTestFile(f)

export const isBackendBusinessFile = (f) =>
  [`${JAVA_ROOT}/main/java/`, ...JAVA_DOMAIN_ROOTS.map((r) => `${r}/main/java/`)].some((r) => f.startsWith(r)) &&
  f.endsWith('.java') && !/Test\.java$/.test(f)

// ───────────────────────── 前端依赖图 ─────────────────────────
const SPEC_PATTERNS = [
  /\bfrom\s*['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\bimport\s*['"]([^'"]+)['"]/g,
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\bvi\.mock\s*\(\s*['"]([^'"]+)['"]/g,
]

export function extractSpecifiers(code) {
  const specs = new Set()
  for (const re of SPEC_PATTERNS) {
    re.lastIndex = 0
    let m
    while ((m = re.exec(code))) specs.add(m[1])
  }
  return [...specs]
}

const RESOLVE_CANDIDATES = ['', '.ts', '.tsx', '.js', '.jsx', '.json', '/index.ts', '/index.tsx', '/index.js']

/**
 * 别名 → 仓库内目录。与 tsconfig.json / vite.config.ts / vitest.config.ts 的 alias 保持一致；
 * 长前缀在前，'@/' 兑底。共享层拆包后，依赖图必须能解析到包内文件，
 * 否则影响域会漏选测试（这是拆包后最容易静默失效的地方）。
 */
export const ALIAS_DIRS = [
  ['@mftb/app-rdm/', 'frontend/apps/rdm/src/'],
  ['@mftb/app-eam/', 'frontend/apps/eam/src/'],
  ['@mftb/app-hr/', 'frontend/apps/hr/src/'],
  ['@mftb/contracts/', 'frontend/packages/contracts/src/'],
  ['@/api/', 'frontend/packages/platform-client/src/api/'],
  ['@/api', 'frontend/packages/platform-client/src/api'],
  ['@/contexts/', 'frontend/packages/platform-client/src/contexts/'],
  ['@/contexts', 'frontend/packages/platform-client/src/contexts'],
  ['@/utils/', 'frontend/packages/platform-client/src/utils/'],
  ['@/utils', 'frontend/packages/platform-client/src/utils'],
  ['@/components/', 'frontend/packages/ui/src/components/'],
  ['@/components', 'frontend/packages/ui/src/components'],
  ['@/hooks/', 'frontend/packages/ui/src/hooks/'],
  ['@/hooks', 'frontend/packages/ui/src/hooks'],
  ['@/styles/', 'frontend/packages/ui/src/styles/'],
  ['@/styles', 'frontend/packages/ui/src/styles'],
  ['@/i18n/', 'frontend/packages/i18n/src/i18n/'],
  ['@/i18n', 'frontend/packages/i18n/src/i18n'],
  ['@/constants/', 'frontend/packages/contracts/src/constants/'],
  ['@/constants', 'frontend/packages/contracts/src/constants'],
  ['@/assets/', 'frontend/packages/ui/src/assets/'],
  ['@/assets', 'frontend/packages/ui/src/assets'],
  ['@/', 'src/'],
]

/** join/normalize 的极简实现：只处理 ./ 与 ../，够用且行为可测 */
function joinPosix(fromDir, spec) {
  const parts = `${fromDir}/${spec}`.split('/')
  const out = []
  for (const p of parts) {
    if (!p || p === '.') continue
    if (p === '..') out.pop()
    else out.push(p)
  }
  return out.join('/')
}

/**
 * 把 import 说明符解析成仓库内相对路径。
 * 只认 `@/`（映射到 src/）与相对路径；裸包名返回 null（不参与本仓依赖图）。
 */
export function resolveSpecifier(spec, fromFile, isFile) {
  let base = null
  for (const [alias, dir] of ALIAS_DIRS) {
    if (spec.startsWith(alias)) {
      base = dir + spec.slice(alias.length)
      break
    }
  }
  if (base === null) {
    if (!spec.startsWith('.') && !spec.startsWith('/')) return null
    base = joinPosix(fromFile.split('/').slice(0, -1).join('/'), spec)
  }
  for (const cand of RESOLVE_CANDIDATES) {
    const p = base + cand
    if (isFile(p)) return p
  }
  return null
}

/** 前端反向依赖图：file → 依赖它的文件集合 */
export function buildFrontendGraph(feFiles, read) {
  const known = new Set(feFiles)
  const reverse = new Map()
  for (const file of feFiles) {
    if (!/\.(ts|tsx)$/.test(file)) continue
    for (const spec of extractSpecifiers(read(file) ?? '')) {
      const dep = resolveSpecifier(spec, file, (p) => known.has(p))
      if (!dep || dep === file) continue
      if (!reverse.has(dep)) reverse.set(dep, new Set())
      reverse.get(dep).add(file)
    }
  }
  return reverse
}

/** 从变更文件沿反向边扩散，收集受影响的测试文件 */
export function frontendAffectedTests(changed, reverse) {
  const seeds = changed.filter((f) => f.startsWith('src/') || f.startsWith('frontend/'))
  const selected = new Set()
  const visited = new Set()
  const queue = [...seeds]
  while (queue.length) {
    const cur = queue.shift()
    if (visited.has(cur)) continue
    visited.add(cur)
    if (isTestFile(cur)) selected.add(cur)
    for (const dependent of reverse.get(cur) || []) {
      if (!visited.has(dependent)) queue.push(dependent)
    }
  }
  return selected
}

// ───────────────────────── 后端依赖图 ─────────────────────────
/** 取出文件里的所有 Java 标识符（近似词法切分，够用于类名共现分析） */
export function extractIdentifiers(code) {
  const stripped = code
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/"(?:\\.|[^"\\])*"/g, ' ')
    .replace(/'(?:\\.|[^'\\])'/g, ' ')
  return new Set(stripped.match(/[A-Za-z_$][A-Za-z0-9_$]*/g) || [])
}

const simpleName = (f) => f.split('/').pop().replace(/\.java$/, '')

export function buildBackendGraph(javaFiles, read) {
  // 主源码 = legacy + 已拆出的域模块（方案 P3）；只算 legacy 会让域模块改动无反向边
  const mainRoots = [`${JAVA_ROOT}/main/java/`, ...JAVA_DOMAIN_ROOTS.map((r) => `${r}/main/java/`)]
  const mainFiles = javaFiles.filter((f) => mainRoots.some((r) => f.startsWith(r)))
  const classNames = new Map()
  for (const f of mainFiles) {
    const simple = simpleName(f)
    // 简单名重名时置 null 标记冲突，避免把两个类的引用混成一类
    if (!classNames.has(simple)) classNames.set(simple, f)
    else classNames.set(simple, null)
  }
  const validNames = new Set([...classNames.entries()].filter(([, v]) => v).map(([k]) => k))

  const reverse = new Map()
  for (const f of javaFiles) {
    const selfSimple = simpleName(f)
    for (const id of extractIdentifiers(read(f) ?? '')) {
      if (!validNames.has(id) || id === selfSimple) continue
      if (!reverse.has(id)) reverse.set(id, new Set())
      reverse.get(id).add(f)
    }
  }
  return { reverse, classNames, validNames }
}

/**
 * 后端影响域：变更类 → 扩散 hops 跳 → 命中的 *Test 文件。
 * 扩散超过 explodeLimit 时返回 exploded=true，由调用方升档全量（fail-closed）。
 */
export function backendAffectedTests(changed, graph, javaFiles, { hops = 2, explodeLimit = 400 } = {}) {
  const allTests = javaFiles.filter(
    (f) => f.startsWith(`${JAVA_TEST_ROOT}/test/java/`) && /Test\.java$/.test(f),
  )
  const testSet = new Set(allTests)
  const seeds = []
  // 种子来自 legacy 主源码与已拆出的域模块（方案 P3）：两者都是「业务生产代码」，
  // 少算一侧会让域模块改动的测试选中数恒为 0（把“没测到”伪装成“无需测试”）。
  const mainRoots = [JAVA_ROOT, ...JAVA_DOMAIN_ROOTS]
  for (const f of changed) {
    if (!f.endsWith('.java')) continue
    if (!mainRoots.some((r) => f.startsWith(`${r}/main/java/`))) continue
    const simple = simpleName(f)
    if (graph.validNames.has(simple)) seeds.push(simple)
  }
  const changedTests = changed.filter((f) => testSet.has(f))

  const selected = new Set(changedTests)
  let frontier = new Set(seeds)
  const visited = new Set(seeds)
  for (let hop = 0; hop < hops && frontier.size; hop++) {
    const next = new Set()
    for (const cls of frontier) {
      for (const dep of graph.reverse.get(cls) || []) {
        if (testSet.has(dep)) {
          selected.add(dep)
          continue
        }
        const simple = simpleName(dep)
        if (!visited.has(simple) && graph.validNames.has(simple)) {
          visited.add(simple)
          next.add(simple)
        }
      }
    }
    frontier = next
    if (visited.size > explodeLimit) return { selected, exploded: true, seeds }
  }
  return { selected, exploded: false, seeds }
}

// ───────────────────────── 变更分类与升档判定 ─────────────────────────
export function classify(changed, rules = { fe: GLOBAL_FE, be: GLOBAL_BE, both: GLOBAL_BOTH }) {
  const reasons = []
  const hit = (patterns) => changed.filter((f) => patterns.some((re) => re.test(f)))

  const feGlobal = hit(rules.fe)
  const beGlobal = hit(rules.be)
  const bothGlobal = hit(rules.both)
  if (feGlobal.length) reasons.push({ side: 'frontend', files: feGlobal, why: '前端共享/契约层' })
  if (beGlobal.length) reasons.push({ side: 'backend', files: beGlobal, why: '后端共享/契约层或 SQL/配置' })
  if (bothGlobal.length) reasons.push({ side: 'both', files: bothGlobal, why: '工程脚本/CI/规则' })

  return { feGlobal, beGlobal, bothGlobal, reasons }
}

/**
 * 覆盖缺口：有业务源码变更，但影响域内一个测试都没选到。
 * 共享层命中会升档全量（full=true），那种情况不算缺口 —— 因为全量必然覆盖到。
 */
export function computeCoverageGaps({
  feBusinessFiles = [],
  beBusinessFiles = [],
  frontendFull = false,
  frontendTestCount = 0,
  backendFull = false,
  backendTestCount = 0,
}) {
  const gaps = []
  if (feBusinessFiles.length && !frontendFull && frontendTestCount === 0) {
    gaps.push({ side: 'frontend', files: feBusinessFiles, why: '变更了业务源码但影响域内没有可选测试' })
  }
  if (beBusinessFiles.length && !backendFull && backendTestCount === 0) {
    gaps.push({ side: 'backend', files: beBusinessFiles, why: '变更了 Java 生产代码但影响域内没有可选测试类' })
  }
  return gaps
}
