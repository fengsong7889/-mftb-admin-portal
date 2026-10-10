#!/usr/bin/env node
/**
 * 列表页统计卡片位置检查（对应 .qoder/rules/frontend-ui-design-spec.md §E.8）
 *
 * 规则：带搜索区的列表页，统计卡片必须渲染在 .search-section 之后、.action-section 之前。
 * 原因：卡片展示的是当前搜索条件过滤后的口径，放搜索区上方会让用户先看到未过滤的全量数字。
 *
 * 用法：
 *   node scripts/check-stat-card-order.mjs            # 全量扫描
 *   node scripts/check-stat-card-order.mjs --quiet     # 仅输出违规摘要
 *
 * 退出码：0 = 通过；1 = 存在违规
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = process.cwd()
const SCAN_DIRS = ['src/pages', 'src/components']
const QUIET = process.argv.includes('--quiet')

/** 搜索区标记 */
const SEARCH_RE = /className=["'`]search-section/
/** 组件顶层 return（本项目风格：缩进恰好 2 空格） */
const TOP_RETURN_RE = /^  return\b/
/** 统计卡片信号：专用组件 / 动效统计卡 hover / 计数动画 / 淡色指标底 */
const STAT_SIGNAL_RE = new RegExp([
  '<(?:StatCards?|[A-Za-z]*Stats|[A-Za-z]*StatCard|SummaryCards?|[A-Za-z]*OverviewCards?|[A-Za-z]*MetricCard)(?=[\\s/>])',
  '<Statistic(?=[\\s/>])',
  '<AnimatedNumber(?=[\\s/>])',
  'translateY\(-4px\)',
  'background:\s*[\'"]?#(?:E6F7FF|FFF7E6|F6FFED|F9F0FF|E6FFFB|FFF1F0)(?![0-9a-fA-F])',
].join('|'), 'i')
/** 声明行不算渲染位置 */
const DECLARATION_RE = /^\s*(import|export|function|const|let|interface|type|\/\*|\*|\/\/)/

function collectFiles(dir, acc) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return acc
  }
  for (const name of entries) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      collectFiles(full, acc)
    } else if (/\.tsx$/.test(name) && !/\.(test|spec)\.tsx$/.test(name)) {
      acc.push(full)
    }
  }
  return acc
}

const violations = []
let scanned = 0

for (const dir of SCAN_DIRS) {
  const files = collectFiles(join(ROOT, dir), [])
  for (const file of files) {
    const lines = readFileSync(file, 'utf8').split('\n')
    const searchIdx = lines.findIndex((l) => SEARCH_RE.test(l))
    if (searchIdx < 0) continue
    scanned += 1

    let returnIdx = -1
    for (let i = searchIdx - 1; i >= 0; i -= 1) {
      if (TOP_RETURN_RE.test(lines[i])) {
        returnIdx = i
        break
      }
    }
    // 找不到顶层 return（结构特殊）就跳过，避免误报
    if (returnIdx < 0) continue

    const hits = []
    for (let i = returnIdx + 1; i < searchIdx; i += 1) {
      const line = lines[i]
      if (DECLARATION_RE.test(line)) continue
      if (!STAT_SIGNAL_RE.test(line)) continue
      // 提示/错误横幅不属于统计卡片
      if (/<Alert\b/.test(line)) continue
      hits.push({ no: i + 1, text: line.trim().slice(0, 120) })
    }
    if (hits.length) {
      violations.push({ file: relative(ROOT, file), searchLine: searchIdx + 1, hits })
    }
  }
}

if (violations.length) {
  console.error(
    `\n\u274C 列表页统计卡片位置检查未通过（${violations.length} 个文件）\n`
    + '   统计卡片必须渲染在 .search-section 之后、.action-section 之前'
    + '（.qoder/rules/frontend-ui-design-spec.md §E.8）\n',
  )
  if (!QUIET) {
    for (const v of violations) {
      console.error(`  ${v.file}（搜索区在第 ${v.searchLine} 行）`)
      for (const h of v.hits) console.error(`      第 ${h.no} 行: ${h.text}`)
      console.error('')
    }
  } else {
    for (const v of violations) console.error(`  ${v.file}`)
  }
  process.exit(1)
}

console.log(`\u2705 列表页统计卡片位置检查通过（扫描 ${scanned} 个含搜索区的列表页）`)
