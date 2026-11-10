#!/usr/bin/env node
/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

/**
 * CSS 裸色值存量摸底（方案 §28.1 / §31.4 第 1 条的落地工具）。
 *
 * 为什么它必须入库而不是留在本机：本方案曾两次因为「凭印象挑目录」漏掉整片批次盲区
 * （`_shared`、`AppPreview`），改成"先摸底、按可自动量排序选目标"之后单批降幅从百位跳到 665。
 * 工具若只存在某台机器上，接手者就会重写一份，而重写最容易踩的正是下面那条归一化漂移。
 *
 * ⚠ 归一化与分段一律复用工具自己的 normalizeHex / classifyProperty / isExcludedSelector。
 *   `COLOR_TO_TOKEN` 的键是**小写无 `#`**；自己拼 '#ABCDEF' 去查会恒 0 命中，
 *   从而得出「这个文件一个都令牌化不了」的反向结论（本仓实测踩过）。
 *
 * 口径限制（读结果前必须知道）：
 *   本工具只统计「能归入 bg/fg/border 三段的声明」里的 hex，所以
 *   `可自动 + 必须人工` 会**小于** cssHex —— 差额是渐变内未归类、属性不承载颜色语义、
 *   以及排除区。两个数不该相等，别拿它们的差当异常。
 *
 * 用法：
 *   node scripts/precheck-css-inventory.mjs            # 全仓
 *   node scripts/precheck-css-inventory.mjs --top 20   # 多看几行
 */
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { COLOR_TO_TOKEN, normalizeHex, classifyProperty, isExcluded, isExcludedCssBlock, walkCssBlocks, stripCssCommentsKeepLines } from './lib/theme-token-map.mjs'

const ROOT = process.cwd()
const TOP_FLAG = '--top'
const topIdx = process.argv.indexOf(TOP_FLAG)
const TOP = topIdx >= 0 ? Number(process.argv[topIdx + 1]) : 12
if (topIdx >= 0 && !Number.isFinite(TOP)) throw new Error(`--top 需要一个数字，实际：${process.argv[topIdx + 1]}`)
const unknownFlag = process.argv.slice(2).find((a) => a.startsWith('--') && a !== TOP_FLAG)
if (unknownFlag) throw new Error(`未知参数 ${unknownFlag}；可用：--top <n>`)

const files = execFileSync('git', ['ls-files', '*.css'], { cwd: ROOT, encoding: 'utf8' })
  .split('\n').filter(Boolean)

const DECL_RE = /([-A-Za-z][-\w]*)\s*:\s*([^;{}]+)/g
const HEX_RE = /#[0-9a-fA-F]{3,8}\b/g
const rows = []
for (const rel of files) {
  if (isExcluded(rel)) continue
  const src = stripCssCommentsKeepLines(readFileSync(resolve(ROOT, rel), 'utf8'))
  let auto = 0, manual = 0, alpha = 0
  /*
   * 块归属一律走 walkCssBlocks / isExcludedCssBlock（与棘轮同一份实现）。
   * 原先本脚本自己按「本行含 {」定标：单行规则 `.a{color:#fff}` 与多行选择器前言行都会归错，
   * 而 `countBareColors` 根本不认块——三方各自一套时，「豁免了多少」根本对不上账（§卅七）。
   */
  for (const block of walkCssBlocks(src)) {
    if (isExcludedCssBlock(block)) continue
    let m
    DECL_RE.lastIndex = 0
    while ((m = DECL_RE.exec(block.body))) {
      const seg = classifyProperty(m[1])
      if (!seg) continue
      for (const raw of m[2].match(HEX_RE) || []) {
        const n = normalizeHex(raw)
        if (!n) continue
        if (n.hasAlpha) { alpha++; continue }
        if ((COLOR_TO_TOKEN[seg] || {})[n.hex]) auto++; else manual++
      }
    }
  }
  if (auto + manual + alpha > 0) rows.push({ rel, auto, manual, alpha })
}

const sum = (k) => rows.reduce((s, r) => s + r[k], 0)
const total = sum('auto') + sum('manual') + sum('alpha')
console.log(`未排除的 .css 文件 ${rows.length} 个：可自动 ${sum('auto')} / 必须人工 ${sum('manual')} / 带 alpha ${sum('alpha')}（三段合计 ${total}，口径见文件头「口径限制」）`)

const byAuto = [...rows].sort((a, b) => b.auto - a.auto || b.manual - a.manual)
console.log(`\n可自动量前 ${TOP}（机械批的下一次目标）：`)
for (const r of byAuto.slice(0, TOP)) {
  console.log(`  ${String(r.auto).padStart(4)} 自动 / ${String(r.manual).padStart(4)} 人工  ${r.rel}`)
}
console.log(`\n人工量大头前 ${TOP}（档 B 的真实剩余）：`)
for (const r of [...rows].sort((a, b) => b.manual - a.manual).slice(0, TOP)) {
  console.log(`  ${String(r.manual).padStart(4)} 处 / ${String(r.auto).padStart(4)} 仍可自动  ${r.rel}`)
}
