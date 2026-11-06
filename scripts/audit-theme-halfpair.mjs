#!/usr/bin/env node
/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

/**
 * 主题令牌化「半对」门禁（方案 §17.2 第 2 条 / §18.2 第 4c 步的常设化）。
 *
 * 为什么值得单独做一个门禁：批量令牌化最阴的失败不是「少改了几处」，而是**改了一半**——
 * 同一元素一侧换成 CSS 变量、另一侧仍钉裸色值，深色主题下两侧朝不同方向变。这类缺陷
 * 看不见、不影响浅色、也不报错。裸色棘轮也拦不住它：两侧都退回裸值同样让计数下降。
 *
 * 为什么以前没入库：第六批用的是一次性脚本，它会「静默返回空」——基线树读成 0 或字符类写错时，
 * 「本批新增 0」就是空输入的假绿（第八批实踩，见 §18.1 幽灵模块那段）。所以这一版把自证放在
 * 结论前面：**自检不过 → exit 2 且不输出任何结论**；差分基线扫到 0 个文件同样直接失败。
 *
 * 判据（一般化）：一个 style 块里**同时存在**
 *   - 被钉住的颜色属性：值里有不透明 hex（含 `border: '1px solid #xxx'` 这种简写内嵌）
 *   - 已令牌化的颜色属性：值是 var(--*) 且自身不含 hex
 * 就构成半对。按被钉住的那一段分成三类，只降不升：
 *   前景钉 / 背景钉 / 描边钉。不只卡「前景 vs 背景」两侧——单测抓出过同段内的半对
 *   （`background: '#F0F5FF'` 钉住 + `fill: 'var(--brand)'` 自适应）。
 *
 * 不计入（都有明确理由，不得当成缺陷）：
 *   - 8 位带 alpha 的 hex：随下层自动合成，本身就自适应（§18.5 既有例外）
 *   - `url(#id)` 片段引用：id 名叫 #feed 时形似 hex，但它不是颜色
 *   - 注释里的色值示例：文档式注释大量举例，不剥掉就是假阳性
 *
 * 用法：
 *   node scripts/audit-theme-halfpair.mjs                    # 与棘轮基线比对，超过即失败
 *   node scripts/audit-theme-halfpair.mjs --snapshot         # 写下当前计数（只降不升）
 *   node scripts/audit-theme-halfpair.mjs --report            # 按文件列出现存危险点，便于分批清理
 *   node scripts/audit-theme-halfpair.mjs --baseline <改前目录>  # 本批差分（PRE vs POST）
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isExcluded } from './lib/theme-token-map.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BASELINE_PATH = join(ROOT, 'scripts', 'theme-halfpair-baseline.json')
const ARGS = process.argv.slice(2)

export const CLASSES_KEYS = ['前景钉裸值（半对）', '背景钉裸值（半对）', '描边钉裸值（半对）']

/**
 * 差分用的站点键：文件 + 类别 + 归一化块体（body 已在 scan 里压平并截到 120 字）。
 * 故意不含行号：同一块体在文件里往上或往下漂几行，语义上是同一个半对；
 * 把行号放进键会让“只是行号漂了”被误报成“新增 + 消失”各一次。
 */
export const hazardKey = (h) => `${h.file}\u0000${h.kind}\u0000${h.body}`

/**
 * 差分定位：返回新增与消失的站点。抽成纯函数是为了可测 —— 旧版直接在 main 里
 * `result.hazards.slice(0, 12)`，标题写「本批新增」而内容其实是 POST 全量，
 * 这种错法只能跑两个树才能发现；抽出来后可以用分叉的假站点直接测。
 */
export function diffHazards(baseHazards, nowHazards) {
  const baseKeys = new Set(baseHazards.map(hazardKey))
  const nowKeys = new Set(nowHazards.map(hazardKey))
  return {
    fresh: nowHazards.filter((h) => !baseKeys.has(hazardKey(h))),
    gone: baseHazards.filter((h) => !nowKeys.has(hazardKey(h))),
  }
}

/**
 * 颜色属性分段。必须与 codemod 的 classifyProperty 同口径，否则「工具能改、门禁看不见」：
 * 变异验证 H3 就是踩在漏了 fill / stroke 上（当时 url 保护样本因此空转）。
 */
const PROP_CLASS = [
  ['fg', /^(color|WebkitTextFillColor|webkit-text-fill-color)$/i],
  ['bg', /^(background|backgroundColor|background-color|fill)$/i],
  ['compound', /^(border|borderTop|borderRight|borderBottom|borderLeft|borderColor|border-color|outline|outlineColor|stroke|boxShadow)$/i],
]

function propClass(name) {
  for (const [cls, re] of PROP_CLASS) if (re.test(name)) return cls
  return null
}

const URL_REF = /url\(\s*#/i

/** 去掉带 alpha 的 8 位 hex（随下层合成，不算钉住）；url(#) 片段引用整串不算颜色 */
function effectiveHexes(value) {
  if (URL_REF.test(value)) return 0
  return (value.replace(/#[0-9a-fA-F]{8}\b/g, ' ').match(/#[0-9a-fA-F]{3,6}\b/g) || []).length
}

/** 把一个样式块拆成颜色属性实例：{cls, name, hasToken, bareHex} */
export function colorPropsOfBlock(body) {
  const props = []
  for (const m of body.matchAll(/([A-Za-z][\w-]*)\s*:\s*(['"`])([^'"`]*)\2/g)) {
    const cls = propClass(m[1])
    if (!cls) continue
    props.push({ cls, name: m[1], hasToken: m[3].includes('var('), bareHex: effectiveHexes(m[3]) })
  }
  return props
}

export function classifyWithCounts(body) {
  let props
  try {
    props = colorPropsOfBlock(body)
  } catch {
    // 判定抛错一律按三类全命中：宁可误报让人来看，也绝不因异常被吞掉而报「干净」
    return Object.fromEntries(CLASSES_KEYS.map((k) => [k, 1]))
  }
  const pinned = props.filter((p) => p.bareHex > 0)
  // 同一条属性自己混用（只换了一半的渐变）算「被钉住」，不算「已令牌」，否则一个块会被重复计入多段
  const tokenized = props.filter((p) => p.hasToken && p.bareHex === 0)
  if (!pinned.length || !tokenized.length) return {}
  const bySeg = { fg: 0, bg: 0, compound: 0 }
  for (const p of pinned) bySeg[p.cls] += 1
  const out = {}
  if (bySeg.fg) out[CLASSES_KEYS[0]] = bySeg.fg
  if (bySeg.bg) out[CLASSES_KEYS[1]] = bySeg.bg
  if (bySeg.compound) out[CLASSES_KEYS[2]] = bySeg.compound
  return out
}

export function classify(block) {
  return Object.keys(classifyWithCounts(block))
}

/* ---------------------------------------------------------------- 阳性对照自检 */

export const SELF_SAMPLES = [
  { kind: 'fg', expect: CLASSES_KEYS[0], block: ` background: 'var(--danger-soft)', color: '#F5222D' ` },
  { kind: 'bg', expect: CLASSES_KEYS[1], block: ` background: '#FFF1F0', color: 'var(--danger)' ` },
  { kind: 'compound', expect: CLASSES_KEYS[2], block: ` background: 'var(--surface-2)', border: '1px solid #e8eaed' ` },
  { kind: 'same-segment', expect: CLASSES_KEYS[1], block: ` background: '#F0F5FF', fill: 'var(--brand)' ` },
  { kind: 'ok', expect: null, block: ` background: 'var(--danger-soft)', color: 'var(--danger)', border: '1px solid var(--danger-border)' ` },
  { kind: 'ok-both-bare', expect: null, block: ` background: '#FFEBEE', color: '#FF4D4F' ` },
  { kind: 'alpha', expect: null, block: ` color: 'var(--purple)', borderColor: '#722ED166', background: '#722ED112' ` },
  { kind: 'url', expect: null, block: ` background: 'var(--surface-2)', stroke: 'url(#grad) #D6E4FF' ` },
]

/** 自检不过时返回失败项；全过返回空数组。调用方据此拒绝出结论 */
export function selfCheck() {
  const failures = []
  for (const s of SELF_SAMPLES) {
    const hits = classify(s.block)
    if (s.expect === null) {
      if (hits.length) failures.push(`样本 ${s.kind}（${s.block.trim()}）应无危险却报出：${hits.join(', ')}`)
    } else if (!hits.includes(s.expect)) {
      failures.push(`样本 ${s.kind} 应命中「${s.expect}」，实际命中：${hits.join(' ') || '无'}`)
    }
  }
  return failures
}

/* ------------------------------------------------------------------------ 扫描 */

/**
 * 相对路径只在这里算一次，排除判定与 hazards 共用同一个值。
 * 曾经分两处各自 slice（一处用扫描根、一处用模块 ROOT）：`--baseline` 扫的是另一棵树，
 * 用 ROOT 会得到带临时目录名的碎片，而 isExcluded 用 includes 匹配，碎片照样能撞上排除串，
 * 于是「基线侧口径错了」这件事测试根本分辨不出（变异验证 H6 实踩）。
 */
function walk(rootDir) {
  const out = []
  ;(function step(dir) {
    for (const entry of readdirSync(dir)) {
      if (['node_modules', 'dist', 'dist-apps', '.git', '.qoder', 'coverage'].includes(entry)) continue
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) step(full)
      else if (extname(full) === '.tsx') {
        const rel = full.slice(rootDir.length + 1).replace(/\\/g, '/')
        if (!isExcluded(rel) && !/(\.test|\.spec)\./.test(entry)) out.push({ full, rel })
      }
    }
  })(rootDir)
  return out
}

/** 剥掉块注释与行注释，否则注释里的示例色值会被当成真缺陷 */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

/**
 * 按花括号配平切出每个样式对象块（样式常跳行书写，单行正则必然漏报）。
 * 不只匹 `style={{`：antd 的 `styles={{ header: {...} }}`、v4 的 headerStyle / bodyStyle /
 * labelStyle 同样渲染成 DOM 样式，正是「四件套」类站点的常见形态。
 * 图表配置与 SVG 属性不是这种写法，天然不在本门禁范围。
 */
export function styleBlocks(text) {
  const out = []
  const re = /\b[A-Za-z0-9]*[sS]tyles?=\{\{/g
  let m
  while ((m = re.exec(text)) !== null) {
    const bodyStart = m.index + m[0].length
    let depth = 2
    let i = bodyStart
    while (i < text.length) {
      const c = text[i]
      if (c === '{') depth += 1
      else if (c === '}') {
        depth -= 1
        if (depth <= 0) break
      }
      i += 1
    }
    out.push({ line: text.slice(0, m.index).split('\n').length, body: text.slice(bodyStart, i) })
  }
  return out
}

export function scan(rootDir = ROOT) {
  const counts = Object.fromEntries(CLASSES_KEYS.map((k) => [k, 0]))
  const hazards = []
  let files = 0
  let alphaSkipped = 0
  for (const { full, rel } of walk(rootDir)) {
    files += 1
    const text = stripComments(readFileSync(full, 'utf8'))
    for (const b of styleBlocks(text)) {
      for (const [kind, n] of Object.entries(classifyWithCounts(b.body))) {
        counts[kind] += n
        hazards.push({ file: rel, line: b.line, kind, body: b.body.replace(/\s+/g, ' ').trim().slice(0, 120) })
      }
      const alpha = b.body.match(/#[0-9a-fA-F]{8}\b/g)
      if (alpha && /var\(/.test(b.body)) alphaSkipped += alpha.length
    }
  }
  return { counts, hazards, files, alphaSkipped }
}

/**
 * 棘轮比较。抽成导出函数是为了能被单测碰到：它是「拦住新增」的最终判据，
 * 留在 main 里就只能靠人工跑一遍看脸——本项目已经为「看不见就等于没测」付过代价。
 * 规则：只允许下降；基线里没记录的项当 0（新增一类得立刻补基线，不能默认放行）。
 */
export function compareRatchet(baseline, counts) {
  const errors = []
  for (const k of CLASSES_KEYS) {
    const allowed = baseline?.[k] ?? 0
    if (counts[k] > allowed) errors.push(`${k} ${allowed} → ${counts[k]}（+${counts[k] - allowed}）`)
  }
  return errors
}

/* ---------------------------------------------------------------------- 主流程 */

function main() {
  const failures = selfCheck()
  if (failures.length) {
    console.error('❌ 半对门禁自检失败，**不输出任何结论**（自检不过时的数字没有意义）：')
    for (const f of failures) console.error(`   · ${f}`)
    process.exit(2)
  }

  const result = scan(ROOT)

  if (ARGS.includes('--baseline')) {
    const idx = ARGS.indexOf('--baseline')
    const baseDir = resolve(idx >= 0 ? ARGS[idx + 1] : '')
    if (!baseDir || !existsSync(baseDir)) {
      console.error(`❌ --baseline 取值不可用：${baseDir || '(未提供)'}`)
      process.exit(2)
    }
    const base = scan(baseDir)
    if (base.files === 0) {
      console.error('❌ --baseline 树里一个 .tsx 都没扫到（空基线）——差分结论作废，不得读成「本批没新增」')
      process.exit(2)
    }
    console.log(`半对差分：PRE ${base.files} 文件 / POST ${result.files} 文件`)
    let added = 0
    for (const k of CLASSES_KEYS) {
      const d = result.counts[k] - (base.counts[k] ?? 0)
      added += Math.max(0, d)
      console.log(`  ${d > 0 ? '❌' : '  '} ${k.padEnd(22)} 改前 ${base.counts[k] ?? 0} → 改后 ${result.counts[k]}（${d > 0 ? '+' : ''}${d}）`)
    }
    console.log(`  （带 alpha 的 8 位色值按既有例外跳过 ${result.alphaSkipped} 处，不参与判定）`)
    if (added) {
      // 只列**新增**的站点。键用「文件 + 类别 + 归一化块体」而不行号：编辑会让行号漂，
      // 而旧版这里打的是 `result.hazards.slice(0, 12)`——POST 全量前 12 条，标题却写「本批新增」，
      // 会把历史存量指成本批引入（2026-11-06 实踩：差点去“修”三处 EAM 老站点）。
      const { fresh, gone } = diffHazards(base.hazards, result.hazards)
      console.error(`❌ 本批新增 ${added} 处半对（定位到新站点 ${fresh.length} 个、消失 ${gone.length} 个），必须逐处定性：能成对令牌化就补令牌，只能回退的就两侧一起回退并加 theme-pair-locked 哨兵`)
      // 反向自证：计数说新增了却一个站点都定位不到，说明差分本身有毛病，
      // 不能把“没列出站点”读成“其实没新增”（空输入假绿的老坑）。
      if (fresh.length === 0) console.error('::error 计数显示新增但 0 个新站点被定位 —— 差分不可信，请人工核对两棵树')
      for (const h of fresh) console.error(`   ${h.file}:${h.line} [${h.kind}] ${h.body}`)
      process.exit(1)
    }
    console.log('✅ 三类半对本批新增 0 处')
    process.exit(0)
  }

  if (ARGS.includes('--report')) {
    const byFile = new Map()
    for (const h of result.hazards) byFile.set(h.file, (byFile.get(h.file) || 0) + 1)
    console.log(`扫描 ${result.files} 个 .tsx：`)
    for (const [k, v] of Object.entries(result.counts)) console.log(`  ${String(v).padStart(5)}  ${k}`)
    console.log(`  ${String(result.alphaSkipped).padStart(5)}  （带 alpha 底色，既有例外，不计入）`)
    console.log('\n现存危险点按文件排序（前 20）：')
    for (const [f, n] of [...byFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) console.log(`  ${String(n).padStart(3)}  ${f}`)
    process.exit(0)
  }

  if (ARGS.includes('--snapshot')) {
    const payload = {
      $comment: [
        "半对棘轮基线，由 scripts/audit-theme-halfpair.mjs 校验（方案 §17.2 第 2 条 / §18.2 第 4c 步）。",
        "半对 = 同一 style 块里既有被钉住（裸 hex）的颜色属性、又有已令牌化的颜色属性；深色下两侧朝不同方向变。",
        "三类计数只允许下降。计数单位是被钉住的颜色属性实例（按前景/背景/描边分段），不是块数。",
        "确属新增且已逐处定性的，才用 --snapshot 上调；只能成对回退的站点必须带 theme-pair-locked 哨兵，",
        "否则下一次因新增令牌重跑同一目录会把回退静默刷掉（方案 §18.6 实踩过 4 处）。",
        "不计入：8 位带 alpha 的底色（随下层自动合成）、url(#) 片段引用、注释里的示例色值。",
      ],
      ...result.counts,
      files: result.files,
      updatedAt: new Date().toISOString().slice(0, 10),
    }
    writeFileSync(BASELINE_PATH, `${JSON.stringify(payload, null, 2)}\n`)
    console.log(`✅ 已写入 scripts/theme-halfpair-baseline.json：${JSON.stringify(result.counts)}`)
    process.exit(0)
  }

  if (!existsSync(BASELINE_PATH)) {
    console.error('❌ 缺少 scripts/theme-halfpair-baseline.json —— 先跑 --snapshot 建立基线')
    process.exit(1)
  }
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
  const errors = compareRatchet(baseline, result.counts)
  console.log('半对门禁（audit-theme-halfpair）')
  console.log(`  扫描 ${result.files} 个 .tsx；${Object.entries(result.counts).map(([k, v]) => `${k}=${v}`).join(' / ')}`)
  console.log(`  带 alpha 底色按既有例外跳过 ${result.alphaSkipped} 处`)
  for (const e of errors) console.log(`  ERROR 新增半对：${e}`)
  if (errors.length) {
    console.log('\n❌ 半对门禁失败：' + errors.length + ' 项。新代码必须两侧成对令牌化，或成对回退并加 theme-pair-locked 哨兵')
    process.exit(1)
  }
  console.log('\n✅ 半对门禁通过（只降不升）')
}

// 被测试 import 时不执行主流程：这个脚本一跑就扫全仓并按模式 exit
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
