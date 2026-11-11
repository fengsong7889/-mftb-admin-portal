#!/usr/bin/env node
/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

/**
 * CSS 侧「半对」门禁（方案 §卅八 第 3 步：把一次性差分脚本常设化）。
 *
 * 为什么 TSX 那个门禁盖不住 CSS：
 *   1. `audit-theme-halfpair.mjs` 实测只扫 `.tsx`（713 个），页面级 CSS 完全不在它视野里；
 *   2. CSS 的「块」是规则块而不是 `style={{…}}` 对象，归属口径（@media 嵌套、多选择器共用一块、
 *      单行规则）必须与棘轮计数一致，否则会出现「codemod 能改、门禁看不见」。
 *   所以本门禁直接复用 lib 的 walkCssBlocks / isExcludedCssBlock / classifyProperty —— 同一份判据。
 *
 * 判据（与 TSX 那条**刻意不同**，这是本轮实测出来的修正）：
 *   一个规则块里同时存在
 *     - 至少一个**会翻面**的令牌引用（该令牌 `light !== dark`）
 *     - 至少一个被钉住的颜色属性（值里有 3~6 位裸 hex）
 *   才算半对。只看「一侧令牌一侧裸值」会大量误报：`linear-gradient(90deg, var(--brand), #F59432)`
 *   两侧都是浅深同值的品牌固定色，谁都不朝任何方向变，不是缺陷
 *   （§卅八 实测：48 处告警里 30 处是这种假警报）。
 *   按被钉住的那一段分三类计数，只降不升。
 *
 * 不计入（都有理由，不得当成缺陷）：
 *   - 整块落在选择器排除区的（拟真 APP 壳内 / 登录页区段 / scene 色板）—— 语义本就是「不跟随主题」，
 *     里面全是固定值反而是正确状态；这类由 findExcludedBlockPollution 反向守。
 *   - `@media print` 内的块：打印恒浅色是刻意锁定（与 theme.css 同一口径）。
 *   - 8 位带 alpha 的 hex：随下层自动合成，本身自适应。
 *   - `url(#id)` 片段引用：id 名叫 #feed 时形似 hex 但不是颜色。
 *   - 注释里的示例色值。
 *
 * 用法：
 *   node scripts/audit-theme-halfpair-css.mjs                 # 与棘轮基线比对，超过即失败
 *   node scripts/audit-theme-halfpair-css.mjs --snapshot      # 写下当前计数（只降不升）
 *   node scripts/audit-theme-halfpair-css.mjs --report        # 按文件列出危险点，便于分批清理
 *   node scripts/audit-theme-halfpair-css.mjs --baseline <改前目录>   # 本批差分
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  NON_COLOR_TOKENS, TOKEN_VALUES, classifyProperty, isExcluded, isExcludedCssBlock,
  stripCssCommentsKeepLines, walkCssBlocks,
} from './lib/theme-token-map.mjs'
import { compareRatchet, diffHazards, hazardKey } from './audit-theme-halfpair.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BASELINE_PATH = join(ROOT, 'scripts', 'theme-halfpair-css-baseline.json')
const ARGS = process.argv.slice(2)

export const CSS_CLASSES_KEYS = ['CSS 前景钉裸值（半对）', 'CSS 背景钉裸值（半对）', 'CSS 描边钉裸值（半对）']
const SEG_KEY = { fg: CSS_CLASSES_KEYS[0], bg: CSS_CLASSES_KEYS[1], border: CSS_CLASSES_KEYS[2] }
const URL_REF = /url\(\s*#/i
const PRINT_AT = /@media[^(]*print/i

/** 令牌会不会随主题翻面。不在真源里的名字（局部变量）按「不翻面」处理。 */
export function tokenFlips(name) {
  const t = TOKEN_VALUES[name] ?? NON_COLOR_TOKENS[name]
  if (!t) return false
  return String(t.light).toLowerCase() !== String(t.dark).toLowerCase()
}

/** 值里被钉住的裸 hex 个数（剥掉 8 位 alpha；url(#) 整串不算颜色） */
export function pinnedHexes(value) {
  if (URL_REF.test(value)) return 0
  return (value.replace(/#[0-9a-fA-F]{8}\b/g, ' ').match(/#[0-9a-fA-F]{3,6}\b/g) || []).length
}

/**
 * 把一个 CSS 规则块拆成颜色属性实例：{ seg, name, flippingVar, bareHex }
 * 分段一律复用门禁的 classifyProperty，避免「工具能改、门禁看不见」的口径分叉。
 */
export function colorPropsOfCssBlock(body) {
  const props = []
  for (const m of body.matchAll(/([-A-Za-z][-\w]*)\s*:\s*([^;{}]+)/g)) {
    const seg = classifyProperty(m[1])
    if (!seg) continue
    const value = m[2]
    const flipping = [...value.matchAll(/var\(\s*--([a-z0-9-]+)/g)].some((v) => tokenFlips(v[1]))
    props.push({ seg, name: m[1], flippingVar: flipping, bareHex: pinnedHexes(value) })
  }
  return props
}

/**
 * 块级判据。返回 { 类别: 计数 }；无半对返回空对象。
 * 判定抛错一律按三类全命中：宁可误报让人来看，也绝不因异常被吞掉而报「干净」。
 */
export function classifyCssBlock(body) {
  let props
  try {
    props = colorPropsOfCssBlock(body)
  } catch {
    return Object.fromEntries(CSS_CLASSES_KEYS.map((k) => [k, 1]))
  }
  const hasFlipping = props.some((p) => p.flippingVar)
  const pinned = props.filter((p) => p.bareHex > 0)
  if (!hasFlipping || !pinned.length) return {}
  const out = {}
  for (const p of pinned) {
    const key = SEG_KEY[p.seg]
    if (key) out[key] = (out[key] ?? 0) + 1
  }
  return out
}

/* ---------------------------------------------------------------- 阳性对照自检 */

export const SELF_SAMPLES = [
  { kind: 'flip+pin-bg', expect: CSS_CLASSES_KEYS[1], body: 'background: linear-gradient(135deg, var(--brand-soft), #FFFDFB);' },
  { kind: 'flip+pin-fg', expect: CSS_CLASSES_KEYS[0], body: 'background: var(--surface-2); color: #94A3B8;' },
  { kind: 'flip+pin-border', expect: CSS_CLASSES_KEYS[2], body: 'background: var(--surface-2); border: 1px solid #eef0f3;' },
  // 两侧都不翻面：品牌固定色渐变，不是半对（本仓实测这类占了误报的 30/48）
  { kind: 'ok-nonflipping-both', expect: null, body: 'background: linear-gradient(90deg, var(--brand), #F59432);' },
  { kind: 'ok-all-token', expect: null, body: 'background: var(--surface-2); color: var(--text-1); border: 1px solid var(--border-2);' },
  { kind: 'ok-all-pinned', expect: null, body: 'background: #FFF7E6; color: #C2410C;' },
  { kind: 'ok-alpha', expect: null, body: 'background: var(--surface-2); color: #722ED166;' },
  { kind: 'ok-url-ref', expect: null, body: 'background: var(--surface-2); fill: url(#feed) #D6E4FF;' },
  { kind: 'ok-local-var', expect: null, body: 'background: var(--apcs-pink); color: #94A3B8;' },
]

export function selfCheck() {
  const failures = []
  for (const s of SELF_SAMPLES) {
    const hits = Object.keys(classifyCssBlock(s.body))
    if (s.expect === null) {
      if (hits.length) failures.push(`样本 ${s.kind}（${s.body}）应无危险却报出：${hits.join(', ')}`)
    } else if (!hits.includes(s.expect)) {
      failures.push(`样本 ${s.kind} 应命中「${s.expect}」，实际：${hits.join(', ') || '无'}`)
    }
  }
  // 翻面性判据本身要有牙齿：--brand 不翻、--surface-2 翻，判反了整条门禁就是空转
  if (tokenFlips('brand') !== false) failures.push('--brand 浅深同值，应判为不翻面')
  if (tokenFlips('surface-2') !== true) failures.push('--surface-2 浅深不同，应判为会翻面')
  return failures
}

/* ------------------------------------------------------------------------ 扫描 */

function walk(rootDir) {
  const out = []
  ;(function step(dir) {
    for (const entry of readdirSync(dir)) {
      if (['node_modules', 'dist', 'dist-apps', '.git', '.qoder', 'coverage', 'target'].includes(entry)) continue
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) step(full)
      else if (extname(full) === '.css') {
        const rel = full.slice(rootDir.length + 1).replace(/\\/g, '/')
        if (!isExcluded(rel)) out.push({ full, rel })
      }
    }
  })(rootDir)
  return out
}

export function scan(rootDir = ROOT) {
  const counts = Object.fromEntries(CSS_CLASSES_KEYS.map((k) => [k, 0]))
  const hazards = []
  let files = 0
  let blocks = 0
  let excludedBlocks = 0
  let printSkipped = 0
  for (const { full, rel } of walk(rootDir)) {
    files += 1
    const text = stripCssCommentsKeepLines(readFileSync(full, 'utf8'))
    for (const b of walkCssBlocks(text)) {
      if (isExcludedCssBlock(b)) { excludedBlocks += 1; continue }
      if (b.insideAt && PRINT_AT.test(b.insideAt)) { printSkipped += 1; continue }
      blocks += 1
      const hit = classifyCssBlock(b.body)
      for (const [kind, n] of Object.entries(hit)) {
        counts[kind] += n
        hazards.push({
          file: rel, line: b.startLine, kind,
          body: `${b.selector} { ${b.body.replace(/\s+/g, ' ').trim().slice(0, 90)} }`,
        })
      }
    }
  }
  return { counts, hazards, files, blocks, excludedBlocks, printSkipped }
}

/* ------------------------------------------------------------------------- CLI */

function main() {
const unknownFlag = ARGS.find((a) => a.startsWith('--') && !['--snapshot', '--report'].includes(a) && a !== '--baseline')
if (unknownFlag && !(ARGS.includes('--baseline') && ARGS.indexOf(unknownFlag) === ARGS.indexOf('--baseline') + 1)) {
  console.error(`未知参数 ${unknownFlag}；可用：[--snapshot|--report|--baseline <改前目录>]`)
  process.exit(2)
}

const failures = selfCheck()
if (failures.length) {
  console.error('CSS 半对门禁自检未通过，拒绝给出任何结论：')
  for (const f of failures) console.error('  ✗', f)
  process.exit(2)
}

const baselineArg = ARGS.includes('--baseline') ? ARGS[ARGS.indexOf('--baseline') + 1] : null
const target = baselineArg ? resolve(ROOT, baselineArg) : ROOT
if (baselineArg && !existsSync(join(target, 'package.json'))) {
  console.error(`--baseline 指向的目录不像仓库根：${target}`)
  process.exit(2)
}

const result = scan(target)
if (result.files < 20) {
  console.error(`只扫到 ${result.files} 个 CSS 文件，判据或扫描根已坏，拒绝出结论`)
  process.exit(2)
}

let baseline = null
if (existsSync(BASELINE_PATH)) baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))

if (baselineArg) {
  const now = scan(ROOT)
  const { fresh, gone } = diffHazards(result.hazards, now.hazards)
  console.log(`CSS 半对差分：基线 ${result.hazards.length} 处 → 当前 ${now.hazards.length} 处`)
  console.log(`  新增 ${fresh.length} 处，消失 ${gone.length} 处`)
  for (const h of fresh.slice(0, 20)) console.log(`  + ${h.file}:${h.line} ${h.kind} ${h.body.slice(0, 70)}`)
  process.exit(0)
}

if (ARGS.includes('--report')) {
  console.log(`CSS 半对危险点 ${result.hazards.length} 处，分布在 ${new Set(result.hazards.map((h) => h.file)).size} 个文件`)
  const byFile = new Map()
  for (const h of result.hazards) byFile.set(h.file, (byFile.get(h.file) ?? 0) + 1)
  for (const [f, n] of [...byFile].sort((a, b) => b[1] - a[1]).slice(0, 20)) console.log(`  ${String(n).padStart(3)}  ${f}`)
  for (const h of result.hazards.slice(0, 12)) console.log(`  · ${h.file}:${h.line} ${h.kind}\n      ${h.body}`)
  process.exit(0)
}

if (ARGS.includes('--snapshot')) {
  const written = {
    $comment: [
      'CSS 侧半对棘轮基线，由 scripts/audit-theme-halfpair-css.mjs 校验（方案 §卅八 第 3 步）。',
      '半对 = 同一 CSS 规则块里既有「会翻面的令牌引用（light !== dark）」又有「被钉住的裸 hex」；',
      '深色下两侧朝不同方向变。只看「一侧令牌一侧裸值」会大量误报品牌固定色渐变，所以判据是翻面性。',
      '三类计数只允许下降；单位是被钉住的颜色属性实例，不是块数。',
      '不计入：整块落在选择器排除区的（由 findExcludedBlockPollution 反向守）、@media print 内的、',
      '8 位带 alpha 的 hex、url(#) 片段引用、注释里的示例色值。',
    ],
    ...result.counts,
    files: result.files,
    blocks: result.blocks,
    updatedAt: new Date().toISOString().slice(0, 10),
  }
  writeFileSync(BASELINE_PATH, `${JSON.stringify(written, null, 2)}\n`)
  console.log(`✅ 已写入 ${BASELINE_PATH.replace(`${ROOT}/`, '')}`)
  console.log(`   ${CSS_CLASSES_KEYS.map((k) => `${k}=${written[k]}`).join(' ')}`)
  console.log(`   扫描 ${result.files} 个 CSS 文件 / ${result.blocks} 个规则块（排除块 ${result.excludedBlocks}，print 跳过 ${result.printSkipped}）`)
  process.exit(0)
}

console.log('CSS 半对门禁（audit-theme-halfpair-css）')
console.log(`  扫描 ${result.files} 个 .css；规则块 ${result.blocks} 个（选择器排除块 ${result.excludedBlocks}，@media print 跳过 ${result.printSkipped}）`)
console.log(`  ${CSS_CLASSES_KEYS.map((k) => `${k}=${result.counts[k]}`).join(' / ')}`)
const errors = baseline ? compareRatchet(baseline, result.counts, CSS_CLASSES_KEYS) : ['缺基线 scripts/theme-halfpair-css-baseline.json']
if (errors.length) {
  console.log('')
  for (const e of errors) console.error(`❌ ${e}`)
  console.error('   修法优先级：① 把被钉住的那侧也换成会翻面的令牌；② 无等值令牌时成对回退并加 theme-pair-locked 哨兵；')
  console.error('   ③ 只有逐处定性确属新增时才允许 --snapshot，且快照必须是推送前最后一次改动。')
  process.exit(1)
}
console.log('\n✅ CSS 半对门禁通过（只降不升）')
}

// 只在直接执行时跑 CLI；被单测 import 时只导出纯函数，不扫盘也不 exit 进程。
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) main()
