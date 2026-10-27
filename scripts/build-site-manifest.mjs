#!/usr/bin/env node
/**
 * 站点装配清单生成器（方案 §4.2）。
 *
 * 解决什么问题：现在是一次 `vite build` 产出整站 `dist/`，没有任何机器可读的
 * 「产物 → 应用 / 入口」映射。方案要求「独立构建产物按应用保存；由装配步骤组合目标应用的新产物
 * 与其它应用已验证的旧产物」，并且「旧产物须有来源 SHA、输入摘要与文件校验」。
 *
 * 本脚本读取 Vite 的 `dist/.vite/manifest.json`（vite.config.ts 已开启 build.manifest），
 * 把每个 chunk 按源码路径归到应用（frontend/apps/<app> → app；其余归 legacy），
 * 并输出 `dist/site-manifest.json`：应用 → chunk 列表 + sha256 + 大小 + 构建元信息。
 *
 * 注意边界：这是**装配清单**，不是「按应用独立构建」——
 * 独立构建还需要把路由拆到各应用（后续切片），本脚本不冒充已完成。
 *
 * 用法：node scripts/build-site-manifest.mjs [--dist dist] [--out dist/site-manifest.json] [--app rdm]
 *   --app：按应用构建（VITE_APP_ROOT）的产物资单必填。此时 Vite manifest 的 key 相对应用根
 *          （形如 `src/pages/...`），无法用 `frontend/apps/<app>/` 前缀归属，
 *          未命中前缀的 chunk 一律归到该应用（单应用产物里不存在「其它应用的代码」）。
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const valueOf = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const distDir = path.resolve(ROOT, valueOf('dist', 'dist'))
const outFile = path.resolve(ROOT, valueOf('out', 'dist/site-manifest.json'))
const scopedApp = valueOf('app', null)
const viteManifestPath = path.join(distDir, '.vite', 'manifest.json')

if (!fs.existsSync(viteManifestPath)) {
  console.error(
    `❌ 未找到 ${path.relative(ROOT, viteManifestPath)}。\n` +
    `   请确认 vite.config.ts 开启 build.manifest 后重新构建（npm run build）。`,
  )
  process.exit(1)
}

/** 源码路径 → 应用名。只做前缀匹配，未命中时：按应用构建产物归该应用，整站产物归 legacy（诚实标记，不猜）。 */
function appOfSource(src) {
  const m = /^frontend\/apps\/([a-z0-9-]+)\//.exec(src ?? '')
  if (m) return m[1]
  return scopedApp ?? 'legacy'
}

const viteManifest = JSON.parse(fs.readFileSync(viteManifestPath, 'utf8'))
const apps = {}
let totalBytes = 0
let totalFiles = 0

for (const [key, chunk] of Object.entries(viteManifest)) {
  const app = appOfSource(chunk.src ?? key)
  const file = path.join(distDir, chunk.file)
  if (!fs.existsSync(file)) continue
  const buf = fs.readFileSync(file)
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex')
  totalBytes += buf.length
  totalFiles += 1
  if (!apps[app]) apps[app] = { fileCount: 0, totalBytes: 0, chunks: [] }
  apps[app].fileCount += 1
  apps[app].totalBytes += buf.length
  apps[app].chunks.push({
    file: chunk.file,
    bytes: buf.length,
    sha256,
    isEntry: Boolean(chunk.isEntry),
    imports: chunk.imports ?? [],
  })
}

/**
 * 入口文档摘要：只读 dist 根下的 index.html（应用构建时为该应用自己的文档）。
 * 缺失不算错（整站调试产物可能没有），装配检查会单独报。
 */
function readDocument() {
  const p = path.join(distDir, 'index.html')
  if (!fs.existsSync(p)) return null
  const buf = fs.readFileSync(p)
  return {
    file: 'index.html',
    bytes: buf.length,
    sha256: crypto.createHash('sha256').update(buf).digest('hex'),
    title: (/<title>([^<]*)<\/title>/.exec(buf.toString('utf8')) ?? [])[1] ?? null,
  }
}

const manifest = {
  $comment: [
    '站点装配清单（方案 §4.2）。由 scripts/build-site-manifest.mjs 生成。',
    'app = 源码路径前缀 frontend/apps/<app>；未命中的共享/legacy 代码统一记 legacy。',
    '装配与回滚按本清单的 sha256 校验，禁止用「最新构建」覆盖已验证产物。',
    '本清单只描述归属与摘要，不代表已实现按应用独立构建（路由拆分仍在后续切片）。',
    '按应用构建产物（--app）另登记 index.html 摘要，装配时连文档一起校验。',
  ],
  buildTime: new Date().toISOString(),
  commit: process.env.GITHUB_SHA ?? null,
  // 独立 index.html 的摘要：装配时先校文档再校资源，避免「文档与资产来自不同构建」
  document: readDocument(),
  apps: Object.fromEntries(
    Object.entries(apps)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([app, data]) => [
        app,
        {
          fileCount: data.fileCount,
          totalBytes: data.totalBytes,
          entries: data.chunks.filter((c) => c.isEntry).map((c) => c.file),
          chunks: data.chunks.sort((a, b) => b.bytes - a.bytes),
        },
      ]),
  ),
  totals: { appCount: Object.keys(apps).length, fileCount: totalFiles, totalBytes },
}

fs.mkdirSync(path.dirname(outFile), { recursive: true })
fs.writeFileSync(outFile, `${JSON.stringify(manifest, null, 2)}\n`)

console.log('站点装配清单')
for (const [app, data] of Object.entries(manifest.apps)) {
  console.log(`  ${app.padEnd(10)} ${String(data.fileCount).padStart(4)} 文件  ${(data.totalBytes / 1024).toFixed(1)} KB  入口=${data.entries.join(',') || '—'}`)
}
console.log(`  合计 ${manifest.totals.fileCount} 文件 / ${(manifest.totals.totalBytes / 1024 / 1024).toFixed(1)} MB → ${path.relative(ROOT, outFile)}`)
