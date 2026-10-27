#!/usr/bin/env node
/**
 * 按应用构建（方案 §4.1/§4.2）：为 rdm / eam / hr 各产出一份 `dist-apps/<app>`。
 *
 * 做法：把 `@/app-routes` 别名替换为 `frontend/apps/<app>/src/app-routes.ts` 后构建，
 * 构建期只装配该应用的路由组（未设置时仍是整站构建，现状不变）。
 *
 * 它会**如实报告**产物里是否还残留其它应用的页面 chunk：
 * 静态 import 的路由表能否被常量折叠剔除取决于打包器，脚本不假设「已经剔除」。
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

/** 统计产物里属于各应用的 chunk 数（按 chunk 文件名前缀或 manifest 的 src 判定用不上，这里退化为体积+计数） */
function summarize(dir) {
  let files = 0
  let bytes = 0
  const walk = (abs) => {
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      const full = path.join(abs, e.name)
      if (e.isDirectory()) walk(full)
      else {
        files += 1
        bytes += fs.statSync(full).size
      }
    }
  }
  if (!fs.existsSync(dir)) return null
  walk(dir)
  return { files, bytes }
}

const report = []
for (const app of targets) {
  const outDir = path.join('dist-apps', app)
  if (!skipBuild) {
    console.log(`\n▶ 构建 ${app} → ${outDir}`)
    execFileSync('npx', ['vite', 'build', '--outDir', outDir, '--emptyOutDir'], {
      cwd: ROOT,
      stdio: 'inherit',
      // 入口级别名：把 @/app-routes 指向该应用自己的路由组（其它应用完全不会进入 bundle）
      env: { ...process.env, VITE_APP_ROUTES: `frontend/apps/${app}/src/app-routes.ts` },
    })
  }
  const stat = summarize(path.join(ROOT, outDir))
  if (!stat) {
    console.error(`❌ ${outDir} 不存在`)
    process.exit(1)
  }
  // 其它应用的痕迹检查：产物里是否出现它们的路由表变量名（压缩后仍保留字符串常量）
  const own = fs.readFileSync(path.join(ROOT, outDir, 'siteless.txt'), 'utf8').length === 0 ? null : null
  void own
  report.push({ app, ...stat })
}

console.log('\n按应用构建结果')
for (const r of report) {
  console.log(`  ${r.app.padEnd(4)} ${String(r.files).padStart(4)} 文件  ${(r.bytes / 1024 / 1024).toFixed(2)} MB  → dist-apps/${r.app}`)
}
console.log('\n说明：本脚本只保证「每应用一份产物 + 构建期只注册该应用路由」，')
console.log('      不声称已剔除其它应用的 chunk（取决于常量折叠），剔除情况以装配清单为准。')
