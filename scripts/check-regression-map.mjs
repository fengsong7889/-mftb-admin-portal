#!/usr/bin/env node
/**
 * 方案 §六「稳定性与业务回归门槛」门禁。
 *
 * 读 engineering/regression-gates.json：把 8 类保护对象映射到真实测试文件，并检查：
 *   1) 每类对象的命中数不低于 require（回归集合不能是空的）；
 *   2) 测试文件总数不低于 floors（方案要求「测试数和安全门禁没有减少」）。
 *
 * 只看文件归属，不解析用例内容；用途是防止「测试被悄悄删掉/挪走却没人发现」。
 *
 * 用法：node scripts/check-regression-map.mjs [--json] [--config <path>]
 * 退出码：0 通过；1 不满足。
 */
import fs from 'node:fs'
import path from 'node:path'
import { evaluateRegressionMap } from './lib/regression-map.mjs'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const args = process.argv.slice(2)
const argValue = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}
// --config 供门禁自测：用临时配置验证「删测试/降门槛」会被拦下，而不碰仓库真实基线
const CONFIG = path.resolve(ROOT, argValue('config', 'engineering/regression-gates.json'))
const SKIP_DIRS = new Set(['node_modules', 'dist', 'dist-apps', 'target', '.git'])

/** 递归收集测试文件（相对仓库根，统一 / 分隔） */
function walk(absDir, out = []) {
  if (!fs.existsSync(absDir)) return out
  for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      walk(path.join(absDir, entry.name), out)
    } else if (/\.test\.(ts|tsx|mjs)$/.test(entry.name) || /Test\.java$/.test(entry.name)) {
      if (/Test\.java$/.test(entry.name) && !entry.name.endsWith('Test.java')) continue
      out.push(path.relative(ROOT, path.join(absDir, entry.name)).split(path.sep).join('/'))
    }
  }
  return out
}

const files = [
  ...walk(path.join(ROOT, 'backend')),
  ...walk(path.join(ROOT, 'src')),
  ...walk(path.join(ROOT, 'frontend')),
  ...walk(path.join(ROOT, 'scripts')),
]

const config = JSON.parse(fs.readFileSync(CONFIG, 'utf8'))
const { counts, categories, problems } = evaluateRegressionMap(files, config)

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ counts, categories, problems }, null, 2))
  process.exit(problems.length ? 1 : 0)
}

console.log('§六 回归门槛映射')
console.log(`  测试文件：backend ${counts.backend} / frontend ${counts.frontend} / scripts ${counts.scripts}`)
for (const cat of categories) {
  const req = Object.entries(cat.require).map(([b, n]) => `${b}≥${n}`).join(' ')
  console.log(
    `  ${cat.ok ? '✅' : '❌'} ${cat.key.padEnd(20)} backend ${String(cat.counts.backend).padStart(3)}  ` +
    `frontend ${String(cat.counts.frontend).padStart(3)}  scripts ${String(cat.counts.scripts).padStart(2)}   (${req})`,
  )
  if (cat.samples.length) {
    console.log(`       例：${cat.samples.map((s) => s.split('/').pop()).join(' / ')}`)
  }
}

if (problems.length) {
  console.error('\n❌ 回归门槛不满足：')
  for (const p of problems) console.error(`   - ${p}`)
  process.exit(1)
}
console.log('\n✅ §六 八类保护对象均有回归集合，且测试文件总数未低于基线')
