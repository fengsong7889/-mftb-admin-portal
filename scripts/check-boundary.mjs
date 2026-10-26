#!/usr/bin/env node
/**
 * 依赖越界门禁（Boundary check）
 *
 * 目的：把「按系统独立工程」的边界规则变成可执行检查，而不是靠人记。
 * 背景见 docs/design/分系统独立工程改造_63bd100a.md §4.1 / §5.2：
 * 公共层一旦 import 业务页面目录，业务页面就成为共享依赖源头 ——
 * 任何登录/菜单/权限改动都会把整棵页面子树拉进编译图，按应用拆分后仍会频繁全量验证。
 *
 * 规则实现在 scripts/lib/boundary-rules.mjs（纯函数，有单测），本文件只做 fs 装配与棘轮比对：
 *   R1 公共层生产代码不得 import `src/pages/**`（测试文件除外：测试允许直达页面）
 *   R2 `frontend/packages/contracts/**` 必须是叶子：不得依赖 src/ 下任何业务或公共代码
 *   R3 违规必须登记在 scripts/boundary-baseline.json。新增违规 → 失败；
 *      已修复但未从 baseline 移除 → 也失败（两个方向都要同步，避免基线静默腐坏）
 *
 * 用法：node scripts/check-boundary.mjs [--json]
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { evaluateViolations, diffAgainstBaseline } from './lib/boundary-rules.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const BASELINE_FILE = path.join(ROOT, 'scripts', 'boundary-baseline.json')

/** 递归收集 .ts/.tsx（参数用绝对路径，避免重复拼 ROOT 导致只扫到顶层） */
function walk(absDir, out = []) {
  if (!fs.existsSync(absDir)) return out
  for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
    const full = path.join(absDir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(path.relative(ROOT, full).split(path.sep).join('/'))
    }
  }
  return out
}

function collectViolations() {
  // 两处都要扫：legacy 应用壳 src/，以及全部 workspace 包（包间依赖方向约束）
  const rels = [
    ...walk(path.join(ROOT, 'src')),
    ...walk(path.join(ROOT, 'frontend', 'packages')),
  ]
  const files = rels.map((rel) => {
    let code = ''
    try {
      code = fs.readFileSync(path.join(ROOT, rel), 'utf8')
    } catch {
      code = ''
    }
    return { file: rel, code }
  })
  return evaluateViolations(files)
}

function main() {
  const asJson = process.argv.includes('--json')
  const baseline = fs.existsSync(BASELINE_FILE)
    ? JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'))
    : { violations: [] }
  const actual = collectViolations()
  const { added, stale } = diffAgainstBaseline(actual, baseline.violations ?? [])

  if (asJson) {
    console.log(JSON.stringify({ total: actual.length, added, stale }, null, 2))
  } else {
    console.log(`🔍 依赖越界检查：当前违规 ${actual.length} 处，baseline 登记 ${(baseline.violations ?? []).length} 处`)
    if (added.length) {
      console.error(`❌ 新增越界 ${added.length} 处（公共层不得依赖业务页面；契约必须是叶子）：`)
      for (const v of added) console.error(`   [${v.rule}] ${v.file}  →  ${v.imports}`)
    }
    if (stale.length) {
      console.error(`❌ baseline 中有 ${stale.length} 条已不再出现的越界，请同步删除：`)
      for (const k of stale) console.error(`   ${k}`)
    }
    if (!added.length && !stale.length) console.log('✅ 依赖边界符合预期（无新增越界，baseline 无失效项）')
  }

  if (added.length || stale.length) process.exit(1)
}

main()
