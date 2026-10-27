#!/usr/bin/env node
/**
 * 工程归属登记表校验（engineering registry check）
 *
 * 对应分系统独立工程改造方案 §4.1 / P0：「建立系统、文件、表、任务和测试归属清单，
 * 检测重叠、遗漏、循环与跨事务写入」。清单一旦靠人脑记就会与代码脱节，因此这里把
 * engineering/systems.json 变成可执行约束：
 *
 *   C1 每个 src/pages/* 目录必须有归属：公共层 / 唯一系统 / 已登记的多系统共享 / 显式未归属
 *   C2 登记表里出现的目录必须仍然存在（防止清单腐化成"看着通过其实什么都不管"）
 *   C3 多系统共享目录必须逐条写明处置方式，且确实仍是多系统共享
 *   C4 isolation=isolated 必须能落到真实工程（app 的 package.json + tsconfig / module 的 pom.xml），
 *      防止把「已经拆完」写在文档里而代码并没有
 *   C5 后端类名前缀同样必须归属或显式未归属，双向棘轮（新增未登记 → 失败；已消失未移除 → 失败）
 *
 * 归属派生逻辑在 engineering/generate-systems.py；发现漂移时按提示重跑该脚本再提交。
 * 用法：node scripts/check-engineering-registry.mjs [--json]
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const REGISTRY = path.join(ROOT, 'engineering', 'systems.json')
const BACKEND_ROOT = 'backend/src/main/java/com/mftb/admin'
const REGEN = 'python3 engineering/generate-systems.py'

const fail = []
const info = []

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function listAppsPageDirs() {
  const apps = listDirs('frontend/apps')
  const out = []
  for (const a of apps) out.push(...listDirs(`frontend/apps/${a}/src/pages`))
  return out
}

function listDirs(rel) {
  const abs = path.join(ROOT, rel)
  if (!fs.existsSync(abs)) return []
  return fs.readdirSync(abs, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
}

/** 后端类名前缀：与生成器保持同一口径（文件名首个大写字母段） */
function backendPrefixes() {
  const counts = new Map()
  const walk = (abs) => {
    if (!fs.existsSync(abs)) return
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      const full = path.join(abs, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith('.java')) {
        const base = entry.name.slice(0, -'.java'.length)
        const m = base.match(/^([A-Z][a-z0-9]*)/)
        const key = m ? m[1] : 'unknown'
        counts.set(key, (counts.get(key) ?? 0) + 1)
      }
    }
  }
  walk(path.join(ROOT, BACKEND_ROOT))
  return counts
}

/** 特征回归计数（方案 §六）：前端 *.test.* 文件 + 后端 *Test.java 类，只允许变多 */
function actualTestCounts(dirs, prefixes) {
  let fe = 0
  for (const d of dirs) {
    let base = path.join(ROOT, 'src/pages', d)
    if (!fs.existsSync(base)) {
      for (const a of listDirs('frontend/apps')) {
        const cand = path.join(ROOT, 'frontend/apps', a, 'src/pages', d)
        if (fs.existsSync(cand)) { base = cand; break }
      }
    }
    if (!fs.existsSync(base)) continue
    const walk = (abs) => {
      for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
        const full = path.join(abs, e.name)
        if (e.isDirectory()) walk(full)
        else if (/\.(test|spec)\.(ts|tsx)$/.test(e.name)) fe += 1
      }
    }
    walk(base)
  }
  let be = 0
  const testRoot = path.join(ROOT, 'backend/src/test/java/com/mftb/admin')
  const walk = (abs) => {
    if (!fs.existsSync(abs)) return
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      const full = path.join(abs, e.name)
      if (e.isDirectory()) walk(full)
      else if (e.name.endsWith('Test.java')) {
        const m = e.name.slice(0, -'Test.java'.length).match(/^([A-Z][a-z0-9]*)/)
        if (m && prefixes.has(m[1])) be += 1
      }
    }
  }
  walk(testRoot)
  return { frontend: fe, backend: be }
}

function main() {
  if (!fs.existsSync(REGISTRY)) {
    console.error(`❌ 缺少归属登记表 engineering/systems.json，请先执行：${REGEN}`)
    process.exit(1)
  }
  const reg = readJson(REGISTRY)
  const systems = reg.systems ?? {}
  const shared = new Set((reg.sharedFrontendDirs ?? []).map((d) => `src/pages/${d}`))
  const multi = reg.multiOwnerExceptions ?? {}
  const unattrDirs = new Set((reg.unattributed?.frontendDirs ?? []).map((x) => x.dir))

  // ── C1 / C2 / C3：前端页面目录归属 ──
  const pageDirs = [
    ...listDirs('src/pages'),
    ...listAppsPageDirs(),
  ]
  const ownerOf = new Map()
  for (const [code, sys] of Object.entries(systems)) {
    for (const dir of Object.keys(sys.frontendDirs ?? {})) {
      if (!ownerOf.has(dir)) ownerOf.set(dir, [])
      ownerOf.get(dir).push(code)
    }
  }
  for (const dir of pageDirs) {
    const rel = `src/pages/${dir}`
    const owners = ownerOf.get(dir) ?? []
    if (shared.has(rel)) continue
    if (owners.length === 1) continue
    if (owners.length > 1) {
      if (!multi[dir]) {
        fail.push(`C3 页面目录 ${rel} 被 ${owners.join('/')} 共同拥有，但未在 multiOwnerExceptions 说明处置方式`)
      }
      continue
    }
    if (unattrDirs.has(dir)) continue
    fail.push(`C1 页面目录 ${rel} 没有任何归属（既不属于系统，也不在 unattributed 清单）→ 重跑 ${REGEN} 或补登记`)
  }
  for (const dir of ownerOf.keys()) {
    if (!pageDirs.includes(dir)) fail.push(`C2 登记表中的页面目录 src/pages/${dir} 已不存在 → 重跑 ${REGEN}`)
  }
  for (const x of reg.unattributed?.frontendDirs ?? []) {
    if (!pageDirs.includes(x.dir)) fail.push(`C2 未归属清单中的 ${x.dir} 已不存在 → 重跑 ${REGEN}`)
  }
  for (const dir of Object.keys(multi)) {
    if ((ownerOf.get(dir) ?? []).length < 2) {
      fail.push(`C3 multiOwnerExceptions 中的 ${dir} 已不再是多系统共享 → 重跑 ${REGEN} 并移除该例外`)
    }
  }

  // ── C4：隔离声明必须落地 ──
  for (const [code, sys] of Object.entries(systems)) {
    const iso = sys.isolation ?? {}
    if (iso.frontend === 'isolated') {
      const app = sys.planned?.frontendApp ?? `frontend/apps/${code}`
      for (const f of ['package.json', 'tsconfig.json']) {
        if (!fs.existsSync(path.join(ROOT, app, f))) {
          fail.push(`C4 系统 ${code} 声称前端已独立，但缺少 ${app}/${f}`)
        }
      }
    }
    if (iso.backend === 'isolated') {
      const mod = sys.planned?.backendModule ?? `backend/modules/${code}`
      if (!fs.existsSync(path.join(ROOT, mod, 'pom.xml'))) {
        fail.push(`C4 系统 ${code} 声称后端已独立，但缺少 ${mod}/pom.xml`)
      }
    }
  }

  // ── C5：后端类名前缀归属（双向棘轮） ──
  const actual = backendPrefixes()
  const claimedPrefix = new Set()
  for (const sys of Object.values(systems)) {
    for (const p of Object.keys(sys.backendPrefixes ?? {})) claimedPrefix.add(p)
  }
  const unattrPrefix = new Map(
    Object.entries(reg.unattributed?.backendPrefixes ?? {}).map(([k, v]) => [k, v]),
  )
  for (const [p, n] of actual) {
    if (claimedPrefix.has(p) || unattrPrefix.has(p)) continue
    fail.push(`C5 后端类名前缀 ${p}*（${n} 个文件）未登记归属 → 重跑 ${REGEN} 或在生成器里声明所属系统`)
  }
  for (const p of unattrPrefix.keys()) {
    if (!actual.has(p)) fail.push(`C5 未归属前缀 ${p}* 已不存在 → 重跑 ${REGEN} 清理登记表`)
  }
  for (const p of claimedPrefix) {
    if (!actual.has(p)) fail.push(`C5 已归属前缀 ${p}* 在代码中已不存在 → 重跑 ${REGEN} 清理登记表`)
  }

  // ── C6：特征回归只许变多，不许变少（§六「先建立特征回归，再移动代码」）──
  for (const [code, sys] of Object.entries(systems)) {
    const want = sys.testCounts ?? { frontend: 0, backend: 0 }
    const got = actualTestCounts(Object.keys(sys.frontendDirs ?? {}), new Set(Object.keys(sys.backendPrefixes ?? {})))
    if (got.frontend < want.frontend) {
      fail.push(`C6 系统 ${code} 前端特征回归从 ${want.frontend} 降到 ${got.frontend}（搬迁/重构不得丢测试）`)
    }
    if (got.backend < want.backend) {
      fail.push(`C6 系统 ${code} 后端特征回归从 ${want.backend} 降到 ${got.backend}（搬迁/重构不得丢测试）`)
    }
  }

  const isolated = Object.entries(systems).filter(
    ([, s]) => s.isolation?.frontend === 'isolated' || s.isolation?.backend === 'isolated',
  )
  info.push(
    `系统数=${Object.keys(systems).length}，前端页面目录=${pageDirs.length}，` +
    `后端类名前缀=${actual.size}，已声明独立的应用=${isolated.length ? isolated.map(([c]) => c).join(',') : '无（本期未拆部署单元，符合方案 §一）'}`,
  )

  const result = { ok: fail.length === 0, failures: fail, info }
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    for (const line of info) console.log(`ℹ️  ${line}`)
    if (fail.length) {
      console.error(`❌ 工程归属登记表校验失败（${fail.length} 项）：`)
      for (const f of fail) console.error(`   ${f}`)
    } else {
      console.log('✅ 工程归属登记表与代码一致（无未登记目录/前缀，无失效条目，无虚假独立声明）')
    }
  }
  if (fail.length) process.exit(1)
}

main()
