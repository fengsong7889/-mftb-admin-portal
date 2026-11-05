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

/*
 * 参数校验（2026-11-05 加，起因是跑第八批时漏敲 --dir，把目录写成了位置参数）：
 * 本工具以前不检查参数，于是三个错误用法都“看起来正常”：
 *   1. 位置参数被静默忽略 → 作用域退成全站（--run 下去就是 300+ 文件 / 3000+ 处）；
 *   2. --dry-run 只写在注释里，其实从未实现（不写 --run 默认就是预览，所“能跑通”是偶然）；
 *   3. --report 在方案 §5 里写着「输出未命中映射表的色值 Top50」，但本工具没有这个功能。
 * 批量令牌化的作用域只能靠人工确认，恰好是最不能“静默失败”的地方，因此直接拒跑而不是提示后继续。
 */
const VALID_FLAGS = ['--run', '--dir', '--verbose', '--all', '--dry-run']
// dirIdx 为 -1（没传 --dir）时 dirIdx+1 恰好是 0，会把第一个位置参数误当成 --dir 的值而漏检；
// 索引必须先判存在再取后继，不能靠 -1+1 的巧合。
const dirValueIdx = dirIdx >= 0 ? dirIdx + 1 : -1
const positional = ARGS.filter((a, i) => !a.startsWith('--') && i !== dirValueIdx)
const unknownFlag = ARGS.find((a) => a.startsWith('--') && !VALID_FLAGS.includes(a))
const argErrors = []
if (positional.length) {
  argErrors.push(`多余的位置参数：${positional.join(' ')}。本工具只认 --dir <路径>；不传 --dir 就是全站扫描。`
    + '\n   （历史批次靠 --dir 分批，误当位置参数会一刷整仓并和并行线冲突）')
}
if (unknownFlag) {
  argErrors.push(`未实现的参数：${unknownFlag}。未命中色值的分布请看 node scripts/check-theme-tokens.mjs --report（那个才有 --report）`)
}
if (ARGS.includes('--dry-run') && RUN) argErrors.push('--run 与 --dry-run 同时传入是矛盾的；不写 --run 即为预览')
if (RUN && !onlyDir && !ARGS.includes('--all')) {
  argErrors.push('写模式（--run）缺 --dir：全站刷色值不是任何一批的意图。\n   确定要全站才加 --all，否则用 --run --dir src/pages/<目录>')
}
if (onlyDir && !onlyDir.startsWith('src/') && !onlyDir.startsWith('frontend/')) {
  argErrors.push(`--dir 取值看起来不像仓内相对路径：${onlyDir}`)
}
if (argErrors.length) {
  console.error('❌ 参数不合法，未做任何修改：')
  for (const e of argErrors) console.error(`   · ${e}`)
  process.exit(1)
}

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
/** 任意单行引号串（不含模板字符串）——用于拿「简写里内嵌的色值」 */
const QUOTED_ANY_RE = /(["'])((?:(?!\1)[^\\]|\\.)*?)\1/g
/** 串内部的一个 hex 片段（可能多个，如渐变、border 简写） */
const HEX_INNER_RE = /#([0-9a-fA-F]{3,8})\b/g

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
        if (!/#[0-9a-fA-F]{3}/.test(expr)) return whole

        // 一个颜色属性值里可能同时存在两种写法：
        //   color: '#333'                     整串纯色（旧行为）
        //   border: '1px solid #e8eaed'       简写内嵌（盲区②，2026-11-05 补）
        // 不补后者会造成一个很阴的回归：同一块的 background 被刷成 var(--surface-2)、
        // 而 border 里的近白描边不动，深色下就是「深卡配白边」——比两侧都裸更难看。
        // 判据不变：仍要求与令牌**浅色值严格等值**，段不匹配就进 skipped 行报告。
        let localSkipsHere = 0
        const nextExpr = expr.replace(QUOTED_ANY_RE, (rawStr, quote, inner) => {
          if (!/#([0-9a-fA-F]{3,8})/.test(inner)) return rawStr
          // url(#grad1) 这类片段引用里的 #xxx 不是颜色（实测 id 叫 #feed 时会被当 hex）。
          // 宁可漏改也不能把引用 id 换成令牌；含此形态的串整条跳过。
          if (/url\(\s*#/.test(inner)) {
            localSkipsHere += 1
            return rawStr
          }
          let changed = false
          const nextInner = inner.replace(HEX_INNER_RE, (rawHex, digits) => {
            const normalized = normalizeHex(digits)
            if (!normalized || normalized.hasAlpha) return rawHex
            const token = COLOR_TO_TOKEN[segment]?.[normalized.hex]
            if (!token) {
              localSkipsHere += 1
              return rawHex
            }
            changed = true
            replaced += 1
            return `var(--${token})`
          })
          HEX_INNER_RE.lastIndex = 0
          return changed ? `${quote}${nextInner}${quote}` : rawStr
        })
        QUOTED_ANY_RE.lastIndex = 0
        if (localSkipsHere > 0) localSkips += localSkipsHere

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
