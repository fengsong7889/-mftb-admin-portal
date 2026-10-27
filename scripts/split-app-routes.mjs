#!/usr/bin/env node
/**
 * 把一个应用的 `<Route>` 从门户壳 `src/App.tsx` 搬到该应用内的 `routes.tsx`（方案 §4.1）。
 *
 * 为什么必须是脚本 + 逐应用验证：App.tsx 有 447 条 Route，其中应用路由 217 条，
 * 且存在两种写法（单行；`element={` 换行 + Suspense 包裹的公开页）。
 * 手工搬容易漏、脚本写错会产出破损 JSX —— 所以这里把「块识别规则」与 inventory 生成器对齐，
 * 并对每个应用单独跑 tsc/build 验证后再搬下一个。
 *
 * 用法：node scripts/split-app-routes.mjs --app rdm [--dry-run]
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const APP_SRC = path.join(ROOT, 'src', 'App.tsx')
const args = process.argv.slice(2)
const app = (() => {
  const i = args.indexOf('--app')
  return i >= 0 ? args[i + 1] : null
})()
const dryRun = args.includes('--dry-run')
if (!app) {
  console.error('用法：node scripts/split-app-routes.mjs --app <rdm|eam|hr> [--dry-run]')
  process.exit(2)
}

const NEUTRAL = new Set(['Suspense', 'PageLoading', 'Navigate', 'Fragment'])
const lines = fs.readFileSync(APP_SRC, 'utf8').split('\n')

/** 该应用的 lazy 声明：组件名 → 模块路径（相对应用 src） */
const lazyRe = new RegExp(`^const (\\w+) = lazy\\(\\(\\) => import\\('@mftb/app-${app}/(.+)'\\)\\)$`)
const lazy = new Map()
for (const line of lines) {
  const m = line.trim().match(lazyRe)
  if (m) lazy.set(m[1], m[2])
}

/** 与 inventory 生成器一致的块扫描：单行以 `/>` 结束；多行以 `} />` 结束 */
function scanBlocks() {
  const blocks = []
  for (let i = 0; i < lines.length; i++) {
    const first = lines[i].trim()
    if (!first.startsWith('<Route ')) continue
    let end = i
    if (!first.endsWith('/>')) {
      end = i + 1
      while (end < lines.length && !/^[}\s]*\/>$/.test(lines[end].trim())) end++
      if (end >= lines.length) continue
    }
    const raw = lines.slice(i, end + 1)
    const pathMatch = raw.join('\n').match(/path="([^"]+)"/)
    if (!pathMatch) continue
    const names = new Set([
      ...[...raw.join('\n').matchAll(/<([A-Z][A-Za-z0-9_]*)\s*\/>/g)].map((m) => m[1]),
      ...[...raw.join('\n').matchAll(/element=\{<([A-Z][A-Za-z0-9_]*)/g)].map((m) => m[1]),
    ])
    const hit = [...names].filter((n) => lazy.has(n))
    const foreign = [...names].filter((n) => !lazy.has(n) && !NEUTRAL.has(n))
    blocks.push({ start: i, end, raw, path: pathMatch[1], hit, foreign })
    i = end
  }
  return blocks
}

const blocks = scanBlocks()
// Suspense 包裹的是公开分享页：fallback 用的是壳内局部组件，留在壳侧（方案里也是单独处理）
const isShareWrapped = (b) => b.raw.some((l) => l.includes('<Suspense'))
const owned = blocks.filter((b) => b.hit.length > 0 && b.foreign.length === 0 && !isShareWrapped(b))
const skipped = blocks.filter((b) => b.hit.length > 0 && b.foreign.length > 0)
if (!owned.length) {
  console.error(`❌ ${app} 没有可搬迁的路由块（lazy 声明 ${lazy.size} 个）`)
  process.exit(1)
}

console.log(`${app}: lazy=${lazy.size} 可搬=${owned.length} 混用跳过=${skipped.length}`)
for (const s of skipped) console.log(`   跳过 ${s.path}（含非本应用组件：${s.foreign.join(',')}）`)

// 生成应用路由表
const used = new Set()
for (const b of owned) for (const h of b.hit) used.add(h)
const usesSuspense = owned.some((b) => b.raw.some((l) => l.includes('<Suspense')))
const out = [
  '/**',
  ` * ${app.toUpperCase()} 应用的路由表（方案 §4.1：路由随应用走）。`,
  ' *',
  ' * 由 scripts/split-app-routes.mjs 从 src/App.tsx 搬迁生成；路径、元素与包裹顺序与原壳逐字一致。',
  ' * 门户壳只负责布局/会话/菜单与「装配这些路由」，不再持有本应用的具体页面。',
  ' */',
  `import { lazy${usesSuspense ? ', Suspense' : ''}, type ReactElement } from 'react'`,
  "import { Route } from 'react-router-dom'",
  ...(usesSuspense ? ["import PageLoading from '@/components/PageLoading'"] : []),
  '',
  ...[...used].sort().map((n) => `const ${n} = lazy(() => import('./${lazy.get(n)}'))`),
  '',
  `export const ${app.toUpperCase()}_ROUTES: ReactElement[] = [`,
  ...owned.flatMap((b) => [...b.raw.map((l) => `  ${l.trim()}`), '  // eslint-disable-next-line react/jsx-key']),
  ']',
  '',
]
// 上面把逗号放在注释行前不合法，改为：每个块结束后加逗号
const rendered = []
for (const b of owned) {
  const body = b.raw.map((l) => `  ${l.trim()}`)
  body[body.length - 1] = `${body[body.length - 1]},`
  rendered.push(...body)
}
const head = out.slice(0, out.indexOf(`export const ${app.toUpperCase()}_ROUTES: ReactElement[] = [`))
const final = [...head, `export const ${app.toUpperCase()}_ROUTES: ReactElement[] = [`, ...rendered, ']', '']

const target = path.join(ROOT, 'frontend', 'apps', app, 'src', 'routes.tsx')
if (!dryRun) {
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, `${final.join('\n')}`)
  console.log(`写入 ${path.relative(ROOT, target)}（${owned.length} 条）`)
}

// 从 App.tsx 移除：这些块 + 该应用的 lazy 声明，并插入 {XXX_ROUTES}
const dropLines = new Set()
for (const b of owned) for (let i = b.start; i <= b.end; i++) dropLines.add(i)
const firstOwnedStart = Math.min(...owned.map((b) => b.start))
let insertAt = 0
for (let i = 0; i < firstOwnedStart; i++) if (!dropLines.has(i)) insertAt++

const next = []
let inserted = false
for (let i = 0; i < lines.length; i++) {
  if (!inserted && i >= firstOwnedStart && !dropLines.has(i)) {
    next.push(`              {/* ${app.toUpperCase()} 应用路由：见 frontend/apps/${app}/src/routes.tsx */}`)
    next.push(`              {${app.toUpperCase()}_ROUTES}`)
    inserted = true
  }
  if (dropLines.has(i)) continue
  next.push(lines[i])
}
// 删除「只被搬走的路由使用」的 lazy 声明；壳内仍有引用的必须保留（否则 Cannot find name）
const stillReferenced = new Set()
for (const line of next) {
  for (const m of line.matchAll(/\b([A-Z][A-Za-z0-9_]*)\b/g)) if (lazy.has(m[1])) stillReferenced.add(m[1])
}
const keptLazy = []
for (let i = 0; i < next.length; i++) {
  const m = next[i].trim().match(lazyRe)
  if (m && !stillReferenced.has(m[1])) continue
  keptLazy.push(next[i])
}
next.length = 0
next.push(...keptLazy)
const importLine = `import { ${app.toUpperCase()}_ROUTES } from '@mftb/app-${app}/routes'`
if (!next.some((l) => l === importLine)) {
  const lastImport = next.reduce((acc, l, i) => (l.startsWith('import ') ? i : acc), 0)
  next.splice(lastImport + 1, 0, importLine)
}

if (dryRun) {
  console.log(`[dry-run] 将从 App.tsx 删除 ${dropLines.size} 行、${owned.length} 条路由，插入 ${app.toUpperCase()}_ROUTES`)
} else {
  fs.copyFileSync(APP_SRC, path.join(ROOT, '.qoder', 'temp', `App.tsx.before-${app}`))
  fs.writeFileSync(APP_SRC, next.join('\n'))
  console.log(`App.tsx: ${lines.length} → ${next.length} 行；已备份 .qoder/temp/App.tsx.before-${app}`)
}
