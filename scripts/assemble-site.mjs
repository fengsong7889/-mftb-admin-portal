#!/usr/bin/env node
/**
 * 站点装配检查（方案 §4.2）。
 *
 * 在 CI/发布前回答三个问题，而不是靠人肉比对：
 *   1) 本次清单自身是否一致（sha256 合法、无重复登记）？
 *   2) 相对上一版清单，哪些应用可以复用、哪些必须重建、哪些旧文件要删除？
 *   3) 计划里若有 rebuild/drop，就要求显式确认（--accept），避免"顺手发布"覆盖已验证产物。
 *
 * 用法：
 *   node scripts/assemble-site.mjs --current dist/site-manifest.json [--previous prev.json] [--accept]
 *   node scripts/assemble-site.mjs --dist-apps dist-apps [--previous prev.json] [--accept]
 *     按应用产物装配：读每份 <app>/site-manifest.json，合并后整体比对（无需先手动合并）。
 * 退出码：0 通过；1 校验失败或需要显式确认；2 参数/文件问题。
 */
import fs from 'node:fs'
import path from 'node:path'
import { mergeAppManifests } from './lib/app-manifests.mjs'
import { planAssembly, validateManifest } from './lib/site-assembly.mjs'

const args = process.argv.slice(2)
const valueOf = (name) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : null
}
const readJson = (p) => {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch (err) {
    console.error(`❌ 无法读取清单 ${p}: ${err.message}`)
    process.exit(2)
  }
}

const currentPath = valueOf('current')
const distApps = valueOf('dist-apps')
if (!currentPath && !distApps) {
  console.error('用法：node scripts/assemble-site.mjs --current <manifest.json> [--previous <manifest.json>] [--accept]')
  console.error('   或：node scripts/assemble-site.mjs --dist-apps <dir> [--previous <manifest.json>] [--accept]')
  process.exit(2)
}

/** `--dist-apps`：逐应用清单先各自校验，再合并成一份站点清单（方案 §4.2） */
function loadFromDistApps(dir) {
  const abs = path.resolve(dir)
  if (!fs.existsSync(abs)) {
    console.error(`❌ ${dir} 不存在。请先跑 npm run build:apps。`)
    process.exit(2)
  }
  const apps = fs
    .readdirSync(abs, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(abs, e.name, 'site-manifest.json')))
    .map((e) => e.name)
    .sort()
  if (!apps.length) {
    console.error(`❌ ${dir} 下没有任何 <app>/site-manifest.json。`)
    process.exit(2)
  }
  const problems = []
  const manifests = apps.map((app) => {
    const m = readJson(path.join(abs, app, 'site-manifest.json'))
    for (const p of validateManifest(m)) problems.push(`${app}: ${p}`)
    if (!m?.document?.sha256) problems.push(`${app}: 缺少 index.html 摘要`)
    return m
  })
  const { manifest, conflicts } = mergeAppManifests(manifests)
  problems.push(...conflicts)
  if (problems.length) {
    console.error('❌ 按应用产物清单校验失败：')
    for (const p of problems) console.error(`   - ${p}`)
    process.exit(1)
  }
  return manifest
}

const current = distApps ? loadFromDistApps(distApps) : readJson(path.resolve(currentPath))
const previous = valueOf('previous') ? readJson(path.resolve(valueOf('previous'))) : null

const problems = validateManifest(current)
if (problems.length) {
  console.error('❌ 清单校验失败：')
  for (const p of problems) console.error(`   - ${p}`)
  process.exit(1)
}

const plan = planAssembly(previous, current)
console.log(previous ? '站点装配计划（对比上一版清单）' : '站点装配计划（首次发布，无上一版）')
for (const [app, row] of Object.entries(plan)) {
  console.log(
    `  ${app.padEnd(10)} ${row.action.padEnd(8)} 复用 ${String(row.reused.length).padStart(3)} / ` +
    `重建 ${String(row.rebuilt.length).padStart(3)} / 删除 ${String(row.dropped.length).padStart(3)}`,
  )
}

const needsConfirm = Object.entries(plan).filter(([, r]) => r.action !== 'reuse')
if (previous && needsConfirm.length && !args.includes('--accept')) {
  console.error(
    `\n❌ ${needsConfirm.length} 个应用需要重建或删除产物（${needsConfirm.map(([a]) => a).join(', ')}）。\n` +
    `   确认已保留上一版可回滚产物后，加 --accept 重跑。`,
  )
  process.exit(1)
}
console.log('\n✅ 装配检查通过')
