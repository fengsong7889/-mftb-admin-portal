#!/usr/bin/env node
/**
 * 按应用构建（方案 §4.1/§4.2）：为 rdm / eam / hr 各产出一份自带 index.html 的
 * `dist-apps/<app>`，并顺带生成该应用的装配清单 `dist-apps/<app>/site-manifest.json`。
 *
 * 做法：
 *   1. `VITE_APP_ROOT=frontend/apps/<app>` —— 让该目录的 index.html + src/main.tsx 成为真正入口
 *      （`dist-apps/<app>/index.html`，标题/文档不再共用根 index.html）；
 *   2. `VITE_APP_ROUTES=frontend/apps/<app>/src/app-routes.ts` —— 路由组只装配该应用。
 *
 * 脚本会**如实报告**三点，不假设「已经剔除」：
 *   - 产物是否有独立 index.html（缺了就是构建方式没生效）；
 *   - 产物里是否残留其它应用的 chunk（按 Vite manifest 的源码路径判定）；
 *   - 该应用清单里登记了多少 chunk / 多少字节。
 *
 * 用法：node scripts/build-apps.mjs [--app rdm] [--skip-build]
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const APPS = ['rdm', 'eam', 'hr']
const args = process.argv.slice(2)
const only = (() => {
  const i = args.indexOf('--app')
  return i >= 0 ? args[i + 1] : null
})()
const skipBuild = args.includes('--skip-build')

const targets = only ? APPS.filter((a) => a === only) : APPS
if (!targets.length) {
  console.error(`未知应用 ${only}；可选：${APPS.join(', ')}`)
  process.exit(2)
}

function walk(dir) {
  let files = 0
  let bytes = 0
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      const sub = walk(full)
      files += sub.files
      bytes += sub.bytes
    } else {
      files += 1
      bytes += fs.statSync(full).size
    }
  }
  return { files, bytes }
}

/** 读 Vite 产物 manifest：key 是相对 Vite root 的源码路径 */
function viteManifestOf(outDir) {
  const p = path.join(outDir, '.vite', 'manifest.json')
  if (!fs.existsSync(p)) return null
  return JSON.parse(fs.readFileSync(p, 'utf8'))
}

/**
 * 产物里是否残留其它应用的源码。
 * 注意：应用根下的 key 形如 `src/pages/...`（不含应用名），所以只能靠
 * 「路径里出现 frontend/apps/<其它应用>/」判定跨应用引用——这正是要拦的形态。
 */
function foreignAppsOf(manifest, own) {
  const hit = new Set()
  for (const key of Object.keys(manifest ?? {})) {
    const m = /frontend\/apps\/([a-z0-9-]+)\//.exec(key)
    if (m && m[1] !== own) hit.add(m[1])
  }
  return [...hit].sort()
}

const report = []
for (const app of targets) {
  const outDir = path.join(ROOT, 'dist-apps', app)
  if (!skipBuild) {
    console.log(`\n▶ 构建 ${app} → dist-apps/${app}`)
    execFileSync('npx', ['vite', 'build', '--outDir', outDir, '--emptyOutDir'], {
      cwd: ROOT,
      stdio: 'inherit',
      env: {
        ...process.env,
        // 应用根：独立 index.html + 独立入口；路由组只装配本应用（方案 §4.1）
        VITE_APP_ROOT: `frontend/apps/${app}`,
        VITE_APP_ROUTES: `frontend/apps/${app}/src/app-routes.ts`,
      },
    })
  }
  if (!fs.existsSync(outDir)) {
    console.error(`❌ dist-apps/${app} 不存在`)
    process.exit(1)
  }
  const indexPath = path.join(outDir, 'index.html')
  if (!fs.existsSync(indexPath)) {
    console.error(
      `❌ dist-apps/${app}/index.html 缺失：VITE_APP_ROOT 未生效，产物仍是共用根文档。`,
    )
    process.exit(1)
  }
  const title = (/<title>([^<]*)<\/title>/.exec(fs.readFileSync(indexPath, 'utf8')) ?? [])[1] ?? ''
  const foreign = foreignAppsOf(viteManifestOf(outDir), app)
  const stat = walk(outDir)
  report.push({ app, ...stat, title, foreign })
}

// 逐应用生成装配清单（chunk 归属 + sha256 + index.html 摘要）
for (const r of report) {
  execFileSync('node', [
    path.join(ROOT, 'scripts', 'build-site-manifest.mjs'),
    '--dist', path.join('dist-apps', r.app),
    '--out', path.join('dist-apps', r.app, 'site-manifest.json'),
    '--app', r.app,
  ], { cwd: ROOT, stdio: 'inherit' })
}

console.log('\n按应用构建结果')
let drifted = false
for (const r of report) {
  const flag = r.foreign.length ? `残留其它应用: ${r.foreign.join(',')}` : '无跨应用残留'
  if (r.foreign.length) drifted = true
  console.log(
    `  ${r.app.padEnd(4)} ${String(r.files).padStart(4)} 文件  ${(r.bytes / 1024 / 1024).toFixed(2)} MB  ` +
    `标题=${r.title || '—'}  ${flag}`,
  )
}
console.log('\n说明：每个应用都有独立 index.html 与独立 site-manifest.json；')
console.log('      跨应用残留判定读 Vite manifest 的源码路径，不做「体积变小了就算剔除」的推断。')
if (drifted) process.exit(1)
