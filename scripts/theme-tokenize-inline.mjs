#!/usr/bin/env node
/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

/**
 * TSX/TS 内联 style 裸色值 → 语义令牌（方案 §5.2 档 C，9026 处）。
 *
 * 用法：
 *   node scripts/theme-tokenize-inline.mjs --dry-run --dir src/pages/OrderDetail
 *   node scripts/theme-tokenize-inline.mjs --run --dir src/pages/OrderDetail
 *   node scripts/theme-tokenize-inline.mjs --dry-run            # 全站扫描，看规模与分布
 *
 * 与 CSS 版的三个关键差异（都是踩出来的，不是设计偏好）：
 *
 * 1. **按「属性: 字符串值」整段解析，而不是直接搜色值**。
 *    内联 style 里 `border: '1px solid #d9d9d9'` 的色值嵌在字符串中间，直接搜色值会丢掉属性名，
 *    于是无法判断它属于 bg / fg / border 哪一段 —— 而 `#fff` 在 bg 段是 --surface-2、
 *    在 fg 段则**根本不该映射**（白字语义取决于背板）。属性名是正确性的前提。
 *
 * 2. **只处理引号完整闭合的普通字符串**。模板字符串（`` `${tone}22` ``）、
 *    SVG 的 `fill="#E8720C"` JSX 属性、canvas 绘制参数都不匹配本正则，
 *    这是刻意的：它们要么需要拼接语义（换成 var() 会拼出非法值），
 *    要么属于插画/图表零件（方案 §5.4 排除，需人工判断深色可读性）。
 *
 * 3. **跳过含 var( 的行**。已经人工令牌化过的地方不再自动触碰，
 *    避免把 `color: 'var(--on-brand)'` 这类有意选择改回自动映射结果。
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import {
  COLOR_TO_TOKEN,
  SCAN_ROOTS,
  classifyProperty,
  isExcluded,
  normalizeHex,
} from './lib/theme-token-map.mjs'

const ROOT = process.cwd()
const ARGS = process.argv.slice(2)
const RUN = ARGS.includes('--run')
const dirIdx = ARGS.indexOf('--dir')
/** --dir 限定批次范围（方案 §5.3 按菜单分批），不传则全站 */
const onlyDir = dirIdx >= 0 ? ARGS[dirIdx + 1] : null

/** 属性名 + 引号包裹的完整字符串值；值内允许出现除该引号外的任意字符 */
const PROP_STR_RE = /([A-Za-z][A-Za-z0-9-]*)\s*:\s*(["'])((?:(?!\2)[^\\]|\\.)*?)\2/g
const HEX_RE = /#([0-9a-fA-F]{3,8})\b/g

/*
 * 值段形式：`属性: <不含 , ; { } 的表达式>`。
 * 它比 PROP_STR_RE 宽，能多抓住一类盲区——三元表达式里的色值：
 *   color: isBonus ? '#52C41A' : '#FF4D4F'      （Recommend 42 处 / 全仓 371 处）
 * 不含花括号是为了不跟跨对象边界，遇到嵌套 style={{...}} 会自然停下。
 * 段内只对「引号包裹的色值」动手，所以 `label: f ? '是' : '否'` 这类非色串不会被动到。
 * 仍不自动处理 JSX 属性形式（fill={...}）：插画里的白色对勾与中心点是刻意保留的决策，
 * 自动刷成令牌色会让它们在饱和底上消失。
 */
const PROP_EXPR_RE = /([A-Za-z][A-Za-z0-9-]*)\s*:\s*([^,;{}]+)/g
/** 只匹配引号内的十六进制色值串，确保不会改动非颜色文本 */
const QUOTED_HEX_RE = /(["'])#([0-9a-fA-F]{3,8})\1/g

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    let st
    try {
      st = statSync(full)
    } catch {
      continue
    }
    if (st.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist' || entry === 'dist-apps' || entry === 'target') continue
      walk(full, out)
    } else if (['.tsx', '.ts'].includes(extname(entry))) {
      out.push(full)
    }
  }
  return out
}

function collectFiles() {
  const bases = onlyDir ? [join(ROOT, onlyDir)] : SCAN_ROOTS.map((r) => join(ROOT, r))
  const files = []
  for (const base of bases) {
    if (!existsSync(base)) continue
    let st
    try {
      st = statSync(base)
    } catch {
      continue
    }
    if (st.isFile()) files.push(base)
    else walk(base, files)
  }
  return files.map((f) => relative(ROOT, f).replace(/\\/g, '/')).filter((rel) => !isExcluded(rel)).sort()
}

/**
 * 逐行改写。按行处理有两个必要原因：
 *   - 跳过含 var( 的行（已人工令牌化处不再自动触碰）
 *   - 让 skipped 报告能带上行号，人工分批时可直接定位
 */
function transform(source) {
  let replaced = 0
  const skipped = []
  /** style 区段状态：单行 `style={{...}}` 不残留，多行写法要跟踪到 `}}` 才退出 */
  let inStyle = false

  const next = source
    .split('\n')
    .map((line) => {
      const eligible = inStyle || line.includes('style={{')
      if (line.includes('style={{')) inStyle = !line.includes('}}')
      else if (inStyle && line.includes('}}')) inStyle = false
      if (!eligible) return line
      if (!/["'][^"']*#[0-9a-fA-F]{3}/.test(line)) return line
      if (line.includes('var(--')) return line

      // 只在真正的 style 上下文内替换。数据对象里的 `{ color: '#1890FF' }` 常被喂给
      // ECharts / SVG / canvas，它们不解析 CSS 变量，刷成 var(--info) 会静默毁掉配色。
      // 所以下面用轻量状态机识别 `style={{ ... }}` 区段（含跨行写法）。
      let localSkips = 0
      const rewritten = line.replace(PROP_EXPR_RE, (whole, prop, expr) => {
        const segment = classifyProperty(prop)
        if (!segment) return whole // 非颜色属性（width / transition / fontSize 等）
        if (!QUOTED_HEX_RE.test(expr)) {
          QUOTED_HEX_RE.lastIndex = 0
          return whole
        }
        QUOTED_HEX_RE.lastIndex = 0

        const nextExpr = expr.replace(QUOTED_HEX_RE, (rawStr, quote, digits) => {
          const normalized = normalizeHex(digits)
          if (!normalized || normalized.hasAlpha) return rawStr
          const token = COLOR_TO_TOKEN[segment]?.[normalized.hex]
          if (!token) {
            localSkips += 1
            return rawStr
          }
          replaced += 1
          return `${quote}var(--${token})${quote}`
        })

        return nextExpr === expr ? whole : whole.replace(expr, nextExpr)
      })

      if (localSkips > 0) skipped.push(line.trim().slice(0, 72))
      return rewritten
    })
    .join('\n')

  return { next, replaced, skipped }
}

let totalFiles = 0
let totalReplaced = 0

for (const rel of collectFiles()) {
  const before = readFileSync(join(ROOT, rel), 'utf8')
  const { next, replaced, skipped } = transform(before)
  if (replaced === 0) continue

  totalFiles += 1
  totalReplaced += replaced
  console.log(`${RUN ? '改写' : '待改'} ${rel}：${replaced} 处${skipped.length ? `（${skipped.length} 行含未覆盖色值）` : ''}`)
  if (RUN) writeFileSync(join(ROOT, rel), next)
  else if (ARGS.includes('--verbose')) skipped.forEach((s) => console.log(`      未覆盖: ${s}`))
}

console.log(
  RUN
    ? `\n✅ 已改写 ${totalFiles} 个文件、共 ${totalReplaced} 处。接着跑 npm run check:theme-tokens --snapshot 下调棘轮，并跑受影响测试`
    : `\n[dry-run] ${totalFiles} 个文件、共 ${totalReplaced} 处待改${onlyDir ? `（范围 ${onlyDir}）` : ''}`,
)
if (!RUN) console.log('提示：先加 --verbose 看未覆盖行，确认没有语义误判后再 --run；机械替换只保证严格等值，不保证语义恰当。')
