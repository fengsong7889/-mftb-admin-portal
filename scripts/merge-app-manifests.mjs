#!/usr/bin/env node
/**
 * 多份按应用产物的装配清单（方案 §4.2）。
 *
 * 读取 `dist-apps/<app>/site-manifest.json`（由 build-apps.mjs 逐应用生成），
 * 先逐份自检，再合并成一份「站点级」清单供装配比对：
 *   - 文件键加应用前缀，避免不同应用的 `assets/index-*.js` 互相覆盖；
 *   - 跨应用同名文件摘要不一致 → 冲突，退出码 1（禁止混装）；
 *   - 缺 index.html 摘要 → 报错（说明该应用不是用自己的文档构建的）。
 *
 * 用法：
 *   node scripts/merge-app-manifests.mjs [--dir dist-apps] [--out dist-apps/site-manifest.json]
 *   node scripts/merge-app-manifests.mjs --check     # 只校验，不写文件
 * 退出码：0 通过；1 校验失败；2 参数/文件问题。
 */
import fs from 'node:fs'
import path from 'node:path'
import { mergeAppManifests } from './lib/app-manifests.mjs'
import { validateManifest } from './lib/site-assembly.mjs'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const args = process.argv.slice(2)
const valueOf = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}
const checkOnly = args.includes('--check')
const dir = path.resolve(ROOT, valueOf('dir', 'dist-apps'))
const outFile = path.resolve(ROOT, valueOf('out', path.join(dir, 'site-manifest.json')))

if (!fs.existsSync(dir)) {
  console.error(`❌ ${path.relative(ROOT, dir)} 不存在。请先跑 npm run build:apps。`)
  process.exit(2)
}

const apps = fs
  .readdirSync(dir, { withFileTypes: true })
  .filter((e) => e.isDirectory() && fs.existsSync(path.join(dir, e.name, 'site-manifest.json')))
  .map((e) => e.name)
  .sort()

if (!apps.length) {
  console.error(`❌ ${path.relative(ROOT, dir)} 下没有任何 <app>/site-manifest.json。`)
  process.exit(2)
}

const problems = []
const manifests = []
for (const app of apps) {
  const file = path.join(dir, app, 'site-manifest.json')
  let m
  try {
    m = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (err) {
    problems.push(`${app}: 清单无法解析（${err.message}）`)
    continue
  }
  for (const p of validateManifest(m)) problems.push(`${app}: ${p}`)
  if (!m?.document?.sha256) problems.push(`${app}: 缺少 index.html 摘要（不是用应用自己的文档构建的？）`)
  manifests.push(m)
}

const { manifest, conflicts } = mergeAppManifests(manifests)
for (const c of conflicts) problems.push(c)

if (problems.length) {
  console.error('❌ 按应用产物清单校验失败：')
  for (const p of problems) console.error(`   - ${p}`)
  process.exit(1)
}

const totals = {
  appCount: Object.keys(manifest.apps).length,
  fileCount: Object.values(manifest.apps).reduce((n, a) => n + a.fileCount, 0),
  totalBytes: Object.values(manifest.apps).reduce((n, a) => n + a.totalBytes, 0),
}
const output = {
  $comment: [
    '站点级装配清单（方案 §4.2）：由 scripts/merge-app-manifests.mjs 合并各应用产物清单而成。',
    '文件键以 <app>/ 前缀命名空间化；跨应用同名但摘要不同会被判为冲突并拒绝合并。',
    '装配与回滚按本清单的 sha256 校验，禁止用「最新构建」覆盖已验证产物。',
  ],
  buildTime: new Date().toISOString(),
  commit: process.env.GITHUB_SHA ?? null,
  apps: manifest.apps,
  documents: manifest.documents,
  totals,
}

console.log('按应用产物装配清单')
for (const [app, data] of Object.entries(output.apps)) {
  console.log(
    `  ${app.padEnd(6)} ${String(data.fileCount).padStart(4)} 文件  ` +
    `${(data.totalBytes / 1024 / 1024).toFixed(2)} MB  文档=${data.document?.title ?? '—'}`,
  )
}
console.log(`  合计 ${totals.fileCount} 文件 / ${(totals.totalBytes / 1024 / 1024).toFixed(2)} MB`)

if (checkOnly) {
  console.log('✅ 校验通过（--check 未写文件）')
} else {
  fs.mkdirSync(path.dirname(outFile), { recursive: true })
  fs.writeFileSync(outFile, `${JSON.stringify(output, null, 2)}\n`)
  console.log(`✅ 已写入 ${path.relative(ROOT, outFile)}`)
}
