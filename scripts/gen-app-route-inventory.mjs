#!/usr/bin/env node
/**
 * 应用路由清单生成器（方案 §4.1「每个应用独立入口、路由…」的前置清单）。
 *
 * 为什么不直接改 App.tsx：把 182 条应用路由从门户壳里搬走属于高风险重构（JSX 解析、包裹顺序、
 * 公开分享页的 Suspense 包裹都要逐字保持），必须配回归测试单独做。
 * 在那之前，先把「每个应用到底拥有哪些路由」变成机器可读、可校验的数据：
 *
 *   frontend/apps/<app>/src/routes.inventory.json
 *
 * 清单字段：path（路由路径）、module（页面模块，相对应用 src）、shareWrapped（是否被
 * Suspense 包裹 —— 这类是公开分享页，拆分时要留在壳侧或按公开路由处理）。
 *
 * 用法：node scripts/gen-app-route-inventory.mjs [--check]
 *   --check：只比较，不写文件；不一致时退出码 1（CI 门禁用）。
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const APP_SRC = path.join(ROOT, 'src', 'App.tsx')
const APPS = ['rdm', 'eam', 'hr']
const checkOnly = process.argv.includes('--check')

const lines = fs.readFileSync(APP_SRC, 'utf8').split('\n')

/**
 * 应用内 rows.tsx（拆分后路由主体）。返回 { lines, lazyPrefix } 供解析：
 * 这里的 import 是相对路径（'./pages/...'），模块名同样相对应用 src。
 */
function appRoutesFile(app) {
  const p = path.join(ROOT, 'frontend', 'apps', app, 'src', 'routes.tsx')
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8').split('\n') : null
}

/** 收集各应用的 lazy 声明：组件名 → 模块路径（相对应用 src） */
function lazyOf(app) {
  const map = new Map()
  const shellRe = new RegExp(`^const (\\w+) = lazy\\(\\(\\) => import\\('@mftb/app-${app}/(.+)'\\)\\)$`)
  for (const line of lines) {
    const m = line.trim().match(shellRe)
    if (m) map.set(m[1], m[2])
  }
  const appLines = appRoutesFile(app)
  if (appLines) {
    const localRe = /^const (\w+) = lazy\(\(\) => import\('\.\/(.+)'\)\)$/
    for (const line of appLines) {
      const m = line.trim().match(localRe)
      if (m) map.set(m[1], m[2])
    }
  }
  return map
}

/** 逐块扫描 `<Route ...>`；source 决定用哪份源码（壳 or 应用 routes.tsx） */
function routeBlocks(source) {
  const src = source ?? lines
  const out = []
  for (let i = 0; i < src.length; i++) {
    const first = src[i].trim()
    if (!first.startsWith('<Route ')) continue
    let end = i
    if (!/\/>,?$/.test(first)) {
      while (end + 1 < src.length && !/^[}\s]*\/>,?$/.test(src[end].trim())) end++
      if (!/^[}\s]*\/>,?$/.test(src[end].trim())) continue
    }
    const raw = src.slice(i, end + 1).join('\n')
    const pathMatch = raw.match(/path="([^"]+)"/)
    if (!pathMatch) continue
    const names = new Set([
      ...[...raw.matchAll(/<([A-Z][A-Za-z0-9_]*)\s*\/>/g)].map((m) => m[1]),
      ...[...raw.matchAll(/element=\{<([A-Z][A-Za-z0-9_]*)/g)].map((m) => m[1]),
    ])
    out.push({ path: pathMatch[1], names, shareWrapped: /<Suspense/.test(raw) })
    i = end
  }
  return out
}


const NEUTRAL = new Set(['Suspense', 'PageLoading', 'Navigate', 'Fragment'])

/**
 * 死代码守卫：App.tsx 里「声明了但没被引用」的应用页面 lazy 必须报错。
 *
 * 为什么：`lazy(() => import(...))` 是一次函数调用，打包器不能假定它无副作用，
 * 即使变量没人用也会保留 → 动态 import 仍然进产物。
 * 实测（方案 C.29）：157 条这种残留声明让 eam 产物多出 57 个 rdm chunk、60 个 hr chunk，
 * 「按应用构建」直接失效。路由搬迁/删除后必须把不再引用的声明一起清掉。
 *
 * 判定前先去掉字符串字面量，避免 import 路径里的同名片段（如 `AssetTransfer/TransferDetail`）造成假引用。
 */
function unusedAppLazy() {
  const stripped = lines.map((l) => l.replace(/'[^']*'/g, "''").replace(/"[^"]*"/g, '""'))
  const declRe = /^const (\w+) = lazy\(\(\) => import\('@mftb\/app-(rdm|eam|hr)\/([^']+)'\)\)$/
  const unused = []
  lines.forEach((line, i) => {
    const m = line.match(declRe)
    if (!m) return
    const name = m[1]
    let refs = 0
    stripped.forEach((s, j) => {
      if (j === i) return
      refs += (s.match(new RegExp(`\\b${name}\\b`, 'g')) ?? []).length
    })
    if (refs === 0) unused.push({ name, app: m[2], module: m[3] })
  })
  return unused
}

function inventoryFor(app) {
  const lazy = lazyOf(app)
  const appLines = appRoutesFile(app)
  const blocks = [...routeBlocks(), ...(appLines ? routeBlocks(appLines) : [])]
  const owned = []
  for (const b of blocks) {
    const hit = [...b.names].filter((n) => lazy.has(n))
    if (!hit.length) continue
    // 只收「组件全部属于本应用」的路由；混用例（例如壳内组件 + 应用组件）不猜，留给后续人审
    const foreign = [...b.names].filter((n) => !lazy.has(n) && !NEUTRAL.has(n))
    if (foreign.length) continue
    owned.push({
      path: b.path,
      module: hit.map((n) => lazy.get(n)).sort()[0],
      shareWrapped: b.shareWrapped,
    })
  }
  owned.sort((a, b) => a.path.localeCompare(b.path))
  return owned
}

let failed = false
const deadLazy = unusedAppLazy()
if (deadLazy.length) {
  if (checkOnly) {
    console.error(
      `❌ src/App.tsx 有 ${deadLazy.length} 条未被引用的应用页面 lazy 声明（会让所有应用的产物互相夹带）：\n` +
      deadLazy.slice(0, 8).map((d) => `   - ${d.name} → @mftb/app-${d.app}/${d.module}`).join('\n') +
      (deadLazy.length > 8 ? `\n   …其余 ${deadLazy.length - 8} 条` : ''),
    )
    failed = true
  } else {
    console.warn(`⚠️  src/App.tsx 仍有 ${deadLazy.length} 条未被引用的应用页面 lazy 声明（建议随路由搬迁一并删除）`)
  }
}

for (const app of APPS) {
  const owned = inventoryFor(app)
  const target = path.join(ROOT, 'frontend', 'apps', app, 'src', 'routes.inventory.json')
  const next = `${JSON.stringify({
    $comment: [
      `由 scripts/gen-app-route-inventory.mjs 从 src/App.tsx 生成（方案 §4.1），请勿手改。`,
      '这是「该应用拥有哪些路由」的清单，用于后续把路由从门户壳搬到应用内时做对照。',
      'shareWrapped=true 表示该路由被 Suspense 包裹（公开分享页），拆分时需单独处理。',
    ],
    app,
    routeCount: owned.length,
    routes: owned,
  }, null, 2)}\n`

  if (checkOnly) {
    const prev = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : ''
    if (prev !== next) {
      console.error(
        `❌ ${app} 路由清单与 src/App.tsx 不一致。\n` +
        `   若新增/调整了该应用的路由，请重跑：node scripts/gen-app-route-inventory.mjs\n` +
        `   该清单是后续「路由随应用走」拆分的对照基线，不允许静默漂移。`,
      )
      failed = true
    }
    continue
  }
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, next)
  console.log(`  ${app.padEnd(4)} ${String(owned.length).padStart(3)} 条路由 → ${path.relative(ROOT, target)}`)
}

if (checkOnly) {
  if (failed) process.exit(1)
  console.log('✅ 应用路由清单与 App.tsx 一致')
}
