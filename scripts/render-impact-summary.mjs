#!/usr/bin/env node
/**
 * 把 affected-tests 的 --json 结果渲染成 GitHub Step Summary 表格（方案 §八 影响分析矩阵）。
 *
 * 用法：node scripts/render-impact-summary.mjs impact.json
 * 设计约束：本脚本只读分析结果做展示，不改变任何判定；判定全在 affected-tests.mjs。
 */
import fs from 'node:fs'

const file = process.argv[2]
if (!file) {
  console.error('用法：node scripts/render-impact-summary.mjs <impact.json>')
  process.exit(1)
}

const r = JSON.parse(fs.readFileSync(file, 'utf8'))
const out = []

out.push('## 影响域分析矩阵')
out.push('')
out.push(`- base：\`${r.base}\``)
out.push(`- 变更文件：${r.changedCount ?? 0}`)
if (r.message) out.push(`- 说明：${r.message}`)

out.push('')
out.push('### 测试范围（门禁仍按现行规则执行，本表只说明影响域）')
out.push('')
out.push('| 侧 | 范围 | 明细 |')
out.push('|---|---|---|')
const fe = r.frontend ?? {}
const be = r.backend ?? {}
// full=true 时 skipped 字段仍是初始文案（如「无前端源码改动」），不能当明细展示
const feDetail = fe.full ? '共享/契约层命中，不区分影响域' : (fe.skipped ?? (fe.tests?.length ? fe.tests.slice(0, 3).join(', ') + (fe.tests.length > 3 ? ' …' : '') : '—'))
const beDetail = be.full ? '共享层/SQL/工程配置命中，不区分影响域' : (be.skipped ?? (be.tests?.length ? be.tests.slice(0, 3).map((t) => t.split('/').pop()).join(', ') + (be.tests.length > 3 ? ' …' : '') : '—'))
out.push(`| 前端 | ${fe.full ? 'FULL（全量 vitest）' : fe.tests?.length ? `影响域 ${fe.tests.length} 个测试文件` : '跳过'} | ${feDetail} |`)
out.push(`| 后端 | ${be.full ? 'FULL（mvn test -B）' : be.tests?.length ? `影响域 ${be.tests.length} 个测试类` : '跳过'} | ${beDetail} |`)

if (r.escalate?.length) {
  out.push('')
  out.push('### 升档原因')
  for (const e of r.escalate) out.push(`- [${e.side}] ${e.why}（${(e.files ?? []).length} 个文件命中）`)
}

const touched = Object.entries(r.systems?.touched ?? {})
out.push('')
out.push('### 受影响系统')
out.push('')
if (touched.length) {
  out.push('| 系统 | 前端文件 | 后端文件 |')
  out.push('|---|---:|---:|')
  for (const [code, row] of touched) out.push(`| ${code} | ${row.frontend} | ${row.backend} |`)
  if (r.systems.skipped?.length) out.push('')
  if (r.systems.skipped?.length) out.push(`未触碰：${r.systems.skipped.join(', ')}`)
} else {
  out.push('无业务系统被触碰（仅公共层 / 工程配置）。')
}

out.push('')
out.push('### 待发布产物范围')
out.push('')
const units = r.matrix?.releaseUnits ?? []
if (units.length) for (const u of units) out.push(`- ${u}`)
else out.push('- 无（本次变更不涉及产物重建）')

const gaps = r.coverageGaps ?? []
if (gaps.length) {
  out.push('')
  out.push('### ⚠️ 测试覆盖缺口')
  out.push('')
  out.push('有业务源码变更但影响域内选不到测试 —— 这不是「已验证」，是「没测到」。')
  for (const g of gaps) out.push(`- [${g.side}] ${g.why}：${(g.files ?? []).slice(0, 5).join(', ')}${(g.files ?? []).length > 5 ? ' …' : ''}`)
}

const unattr = r.systems?.unattributed ?? []
if (unattr.length) {
  out.push('')
  out.push(`### ⚠️ 未归属文件（${unattr.length} 个）`)
  out.push('')
  out.push('请执行 `python3 engineering/generate-systems.py` 更新归属登记表。')
  for (const u of unattr.slice(0, 10)) out.push(`- ${u.file} —— ${u.reason}`)
}

console.log(out.join('\n'))
