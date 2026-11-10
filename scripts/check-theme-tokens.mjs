#!/usr/bin/env node
/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

/**
 * 主题令牌门禁（方案：docs/design/深浅色主题切换_可落地实施方案_2026-11-03.md §8.2）
 *
 * 守四件事，任一失败即阻断：
 *
 *   1. 令牌完整性 —— theme.css 的 `:root` 与 `html[data-theme='dark']` 两块 key 集合必须完全一致。
 *      漏定义深色值不会报错，只会静默 fallback 到浅色值，是最难发现的一类缺陷
 *      （表现为「切了深色但某处还是白的」，且只在深色下出现）。
 *   2. 双源一致 —— theme.css 的令牌值必须与 themeTokens.ts 的 antd token 逐项相等。
 *      antd 的 token 会经 derivative 算法派生，传 var() 字符串会让派生色全错，
 *      所以两侧必然是双源；双源就会漂移，用门禁钉住。
 *   3. 棘轮基线 —— 裸色值（CSS 十六进制 / 内联十六进制 / 黑色 rgba 阴影）三项只允许下降。
 *      存量 3218+9987 处不可能一次清完，用棘轮把「只增不减」卡住，再按方案 §5.3 分批清理。
 *   4. 排除区未污染 —— 登录页、门户插画 scene 色、PetMascot 动效变量等
 *      方案 §5.4 列明的路径内不得出现令牌替换痕迹；primitive 层令牌（--gray-* / --orange-*）
 *      不得被业务代码引用。
 *
 * Phase 0 的降级行为：断言 1、2 依赖的文件（theme.css / themeTokens.ts）在 Phase 1 才创建，
 * 此时打印 SKIP 而不判失败，避免 CI 恒红（AGENTS.md 明令门禁不得依赖不存在的文件）。
 * 但 SKIP 不是永久豁免：baseline 里的 expectThemeFiles 一旦为 true（由 --snapshot 在文件
 * 出现后自动置位），后续文件若被误删就会从 SKIP 变成 ERROR。
 *
 * 用法：
 *   node scripts/check-theme-tokens.mjs              # 检查
 *   node scripts/check-theme-tokens.mjs --snapshot   # 用当前实测值写基线（清理完一批后下调）
 *   node scripts/check-theme-tokens.mjs --report     # 输出未覆盖色值 Top50，用于扩充映射表
 *   node scripts/check-theme-tokens.mjs --json       # 输出 JSON 明细
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import {
  COLOR_TO_TOKEN,
  COMPONENT_TOKENS,
  NON_COLOR_TOKENS,
  REVIEW_REQUIRED,
  SCAN_ROOTS,
  SCENE_COLOR_BASELINE,
  SEMANTIC_TOKENS,
  TOKEN_VALUES,
  countBareColors,
  isExcluded,
} from './lib/theme-token-map.mjs'

const ROOT = process.cwd()
const BASELINE_PATH = join(ROOT, 'scripts/theme-token-baseline.json')
const THEME_CSS = join(ROOT, 'frontend/packages/ui/src/styles/theme.css')
const THEME_TOKENS_TS = join(ROOT, 'frontend/packages/ui/src/theme/themeTokens.ts')

/** 生成 theme.css 的真源取值表（与生成脚本保持同一合并顺序） */
const TOKEN_SOURCE_VALUES = { ...TOKEN_VALUES, ...NON_COLOR_TOKENS }

/**
 * 别名宿主机：`@/theme` 必须在这四处同时存在。
 *
 * 为什么是四处而不是两处：`vitest.config.ts` **不继承** `vite.config.ts` 的 resolve.alias（各自一份完整定义），
 * 而 `scripts/lib/boundary-rules.mjs` 还有自己的一套别名解析表：漏它的表现不是测试挂，
 * 而是 `@/theme/xxx` 被回退成 `src/theme/xxx`，于是 ui 包引自己包内的目录被误判为
 * 「公共层越界依赖业务页面」，check:boundary 直接报新增越界（本次实踩）。
 * 新增共享层目录要同步四处——靠人记住守不住，所以写进门禁。
 */
const ALIAS_HOSTS = [
  ['tsconfig.json', '"@/theme"'],
  ['vite.config.ts', "'@/theme'"],
  ['vitest.config.ts', "'@/theme'"],
  ['scripts/lib/boundary-rules.mjs', "'@/theme/'"],
]

const ARGS = new Set(process.argv.slice(2))
const errors = []
const warns = []
const skips = []

/* ------------------------------------------------------------------ 扫描 */

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
      // node_modules / dist 在排除清单里，但提前剪枝可省掉数万次 stat
      if (entry === 'node_modules' || entry === 'dist' || entry === 'dist-apps' || entry === 'target') continue
      walk(full, out)
    } else {
      out.push(full)
    }
  }
  return out
}

/**
 * 一次遍历收集全部 .css/.ts/.tsx（含排除区），由调用方分流。
 * 不能先 filter 再 walk：排除区文件正是断言 4 要检查的对象，提前丢弃就检不到了。
 */
function collectAllFiles() {
  const files = []
  for (const root of SCAN_ROOTS) {
    const abs = join(ROOT, root)
    if (!existsSync(abs)) continue
    walk(abs, files)
  }
  return files
    .map((f) => relative(ROOT, f).replace(/\\/g, '/'))
    .filter((rel) => ['.css', '.ts', '.tsx'].includes(extname(rel)))
    .sort()
}

/**
 * 全仓扫描结果。
 * unmapped 汇总「既不在映射表也不在 REVIEW_REQUIRED」的长尾色值，供 --report 扩充映射表；
 * reviewHits 统计 REVIEW_REQUIRED 各值的实际出现次数，让「待人工判定」的债务量可见。
 * 两者均由 countBareColors 返回的 hits 派生，全仓只跑一轮正则。
 */
function scan() {
  const result = {
    cssHex: 0,
    inlineHex: 0,
    rgbaBlack: 0,
    tokenized: 0,
    /** 落在豁免块里的 CSS 裸色值：不计棘轮，但必须报出来，否则豁免区就是账目上的黑洞 */
    cssExcludedHex: 0,
    files: 0,
    excluded: 0,
    unmapped: new Map(),
    reviewHits: new Map(),
    pollution: [],
    primitive: [],
    /** rel -> 内联裸色值个数（仅 >0 的入表）。见下方 --per-file 的说明 */
    byFile: new Map(),
  }

  const POLLUTION_RE = /var\(\s*--(surface|text|border|brand|success|info|warning|danger|purple|shadow)-/

  for (const rel of collectAllFiles()) {
    const text = readFileSync(join(ROOT, rel), 'utf8')

    // 排除区：不计数，但反向校验它没被令牌化污染（方案 §5.4）
    if (isExcluded(rel)) {
      result.excluded += 1
      // theme.css 是令牌定义处，内部引用 var(--border-2)（--card-outline）属正常，不是污染
      if (rel === 'frontend/packages/ui/src/styles/theme.css') continue
      if (!rel.endsWith('.test.tsx') && !rel.endsWith('.test.ts') && POLLUTION_RE.test(text)) {
        result.pollution.push(rel)
      }
      continue
    }

    const kind = extname(rel) === '.css' ? 'css' : 'inline'
    const stat = countBareColors(text, kind)

    result.files += 1
    result.tokenized += stat.tokenized
    result.rgbaBlack += stat.rgbaBlack
    if (kind === 'css') {
      result.cssHex += stat.hex
      result.cssExcludedHex += stat.excluded
    } else {
      result.inlineHex += stat.hex
      if (stat.hex > 0) result.byFile.set(rel, stat.hex)
    }

    for (const [value, n] of stat.unmapped) result.unmapped.set(value, (result.unmapped.get(value) ?? 0) + n)
    for (const [value, n] of stat.hits) {
      if (value in REVIEW_REQUIRED) result.reviewHits.set(value, (result.reviewHits.get(value) ?? 0) + n)
    }

    // 断言 4：primitive 层不得被业务代码引用（theme.css 自身在排除区内，天然豁免）
    if (/var\(\s*--(gray|orange)-\d/.test(text)) result.primitive.push(rel)
  }

  return result
}

/* ------------------------------------------------------- 断言 1 / 2：theme.css */

/** 抽出 theme.css 中某个选择器块内的 `--name: value` 键值对 */
function parseTokenBlock(css, blockSelector) {
  const start = css.indexOf(blockSelector)
  if (start < 0) return null
  const open = css.indexOf('{', start)
  if (open < 0) return null
  let depth = 0
  let end = -1
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1
    else if (css[i] === '}') {
      depth -= 1
      if (depth === 0) {
        end = i
        break
      }
    }
  }
  if (end < 0) return null

  const body = css.slice(open + 1, end).replace(/\/\*[\s\S]*?\*\//g, '')
  const tokens = new Map()
  for (const m of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    tokens.set(m[1], m[2].replace(/\s+/g, ' ').trim())
  }
  return tokens
}

/**
 * 断言 1 / 2：theme.css 自身健康度。
 *
 * 这里**不再**比对 antd token：靠正则把 CSS 的 `--surface-2` 猜成 antd 的 `colorBgContainer` 行不通
 * （初稿那样写过，实际匹配到 0 项、静默比对了个空——比写错更险，因为它看起来是绿的）。
 * 「CSS ↔ antd token」的值对齐已移交 frontend/packages/ui/src/theme/themeTokens.test.ts，
 * 那里有显式的语义对齐表 + 已知漂移白名单，且随 test:run 一起在 CI 执行。
 */
function checkThemeCss(expectFiles) {
  if (!existsSync(THEME_CSS)) {
    const msg = 'theme.css 尚未创建（Phase 1 交付物）'
    if (expectFiles) errors.push(`${msg} —— 但基线已置 expectThemeFiles=true，文件被误删或缺失`)
    else skips.push(msg)
    return
  }

  const css = readFileSync(THEME_CSS, 'utf8')
  const light = parseTokenBlock(css, ':root')
  const dark = parseTokenBlock(css, "html[data-theme='dark']") ?? parseTokenBlock(css, '[data-theme=dark]')

  if (!light) errors.push('theme.css 缺少 :root 令牌块')
  if (!dark) errors.push("theme.css 缺少 html[data-theme='dark'] 令牌块")
  if (!light || !dark) return

  // 断言 1：两块 key 集合一致
  const missingInDark = [...light.keys()].filter((k) => !dark.has(k))
  const missingInLight = [...dark.keys()].filter((k) => !light.has(k))
  if (missingInDark.length) {
    errors.push(`深色块缺少 ${missingInDark.length} 个令牌（会静默 fallback 到浅色值）：${missingInDark.slice(0, 8).join(', ')}${missingInDark.length > 8 ? ' …' : ''}`)
  }
  if (missingInLight.length) {
    errors.push(`浅色块缺少 ${missingInLight.length} 个令牌：${missingInLight.slice(0, 8).join(', ')}`)
  }

  // 语义令牌必须齐备（少一个就意味着某处只能写裸色值）
  const declared = new Set([...light.keys()].map((k) => k.replace(/^--/, '')))
  const absent = [...SEMANTIC_TOKENS, ...COMPONENT_TOKENS].filter((t) => !declared.has(t))
  if (absent.length) errors.push(`theme.css 未定义 ${absent.length} 个约定令牌：${absent.join(', ')}`)

  // 断言 2：theme.css 是 TOKEN_VALUES 的生成物，手改或忘跑生成脚本都会在这里暴露
  const drift = []
  for (const [name, values] of Object.entries(TOKEN_SOURCE_VALUES)) {
    const inLight = light.get(`--${name}`)?.toLowerCase() ?? '缺失'
    const inDark = dark.get(`--${name}`)?.toLowerCase() ?? '缺失'
    if (inLight !== values.light.toLowerCase()) drift.push(`--${name} 浅色 css=${inLight} 真源=${values.light}`)
    if (inDark !== values.dark.toLowerCase()) drift.push(`--${name} 深色 css=${inDark} 真源=${values.dark}`)
  }
  if (drift.length) {
    errors.push(`theme.css 与真源 TOKEN_VALUES 不一致 ${drift.length} 处：${drift.slice(0, 4).join('; ')}`)
    errors.push('   正确做法：改 scripts/lib/theme-token-map.mjs 后跑 node scripts/generate-theme-css.mjs')
  }

  // CSS 里不得出现真源未定义的令牌（防止绕过 TOKEN_VALUES 直接往 CSS 塞变量）
  const undeclared = [...light.keys()].filter((k) => !(k.replace(/^--/, '') in TOKEN_SOURCE_VALUES))
  if (undeclared.length) {
    errors.push(`theme.css 出现真源未定义的令牌 ${undeclared.length} 个：${undeclared.slice(0, 6).join(', ')}`)
  }

  // themeTokens.ts 的存在性仍要盯（它是 antd 侧唯一消费点；值对齐交给前端单测）
  if (!existsSync(THEME_TOKENS_TS)) {
    const msg = 'themeTokens.ts 尚未创建（Phase 1 交付物）'
    if (expectFiles) errors.push(`${msg} —— 但基线已置 expectThemeFiles=true，文件被误删或缺失`)
    else skips.push(msg)
  }
}

/**
 * 断言 5：`@/theme` 别名必须在四处宿主配置里同时存在（含 boundary-rules 的自建解析表）。
 */
function checkThemeAliasSync() {
  const missing = []
  for (const [file, needle] of ALIAS_HOSTS) {
    const abs = join(ROOT, file)
    if (!existsSync(abs)) {
      missing.push(`${file}（文件缺失）`)
      continue
    }
    if (!readFileSync(abs, 'utf8').includes(needle)) missing.push(file)
  }
  if (missing.length) {
    errors.push(`@/theme 别名未在四处宿主配置同步，缺：${missing.join(', ')}`)
    errors.push('   漏 vitest.config.ts 会让测试解析失败；漏 boundary-rules.mjs 会把包内自引误判为越界依赖')
  }
}

/**
 * 断言 6：门户 16 个 scene 色必须与 SCENE_COLOR_BASELINE 逐字相符。
 *
 * Portal/index.css 已从「整文件排除」降级为「只排除 [data-scene= 块」，
 * 所以光靠排除清单不足以保证 scene 色不变（写错块头、或后来人直接改色都拦不住）；
 * 基线比对能同时防住人与工具。同一 scene 只取首个声明块（主色），后续 hover 态不计。
 */
function checkScenePalette() {
  const rel = 'src/pages/Portal/index.css'
  const abs = join(ROOT, rel)
  if (!existsSync(abs)) {
    errors.push(`${rel} 缺失，无法校验 scene 色板`)
    return
  }
  const css = readFileSync(abs, 'utf8')
  const found = new Map()
  for (const m of css.matchAll(/\[data-scene='([A-Za-z]+)'\]\s*\{([^}]*)\}/g)) {
    if (found.has(m[1])) continue
    const color = (m[2].match(/color:\s*(#[0-9a-fA-F]{3,8})/) ?? [])[1]
    if (color) found.set(m[1], color)
  }
  const drift = Object.entries(SCENE_COLOR_BASELINE).flatMap(([scene, expect]) => {
    const actual = found.get(scene)
    if (!actual) return [`${scene} 缺声明`]
    return actual.toLowerCase() === expect.toLowerCase() ? [] : [`${scene}: ${actual} ≠ ${expect}`]
  })
  if (drift.length) {
    errors.push(`门户 scene 色板与 §A.1.1 基线不符：${drift.join('; ')}`)
    errors.push('   scene 色是插画色调唯一真源且不得参与主题切换；如需改值必须同步规则 §A.1.1 与 SCENE_COLOR_BASELINE')
  }
  const extra = [...found.keys()].filter((k) => !(k in SCENE_COLOR_BASELINE))
  if (extra.length) warns.push(`scene 出现基线未登记的新项：${extra.join(', ')}（需同步补录 §A.1.1 与 SCENE_COLOR_BASELINE）`)
}

/* ---------------------------------------------------------------- 基线读写 */

function readBaseline() {
  try {
    return JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
  } catch {
    return null
  }
}

function writeBaseline(result) {
  const payload = {
    $comment: [
      '主题令牌化棘轮基线，由 scripts/check-theme-tokens.mjs 校验（方案 §5.2 / §8.2）。',
      '规则：三项裸色值计数只允许下降。清理完一批就用 --snapshot 下调一次；',
      '新增裸色值会让门禁失败 —— 新代码必须直接用 var(--*) 语义令牌。',
      'cssHex = CSS 文件里的十六进制裸色值；inlineHex = TSX/TS 引号内的十六进制裸色值；',
      'rgbaBlack = rgba(0,0,0,*) 形式的黑色阴影（深色下几乎不可见，需换成 --shadow-* + --card-outline）。',
      '统计已排除方案 §5.4 的排除区（登录页 / 门户插画 scene / PetMascot 动效变量 / 测试断言）。',
      '自 2026-11-11 起 CSS 计数是**选择器感知**的：整块落在 EXCLUDE_SELECTOR_PREFIXES 的规',
      '则（拟真 APP 壳内配色、登录页区段、scene 色板）不再计入 cssHex；只有一环排除的混排块仍计入',
      '（另一侧是真债务）。豁免块内的裸色值单独作为「豁免区存量」报出，不进棘轮但不允许隐形。',
      'expectThemeFiles：theme.css 与 themeTokens.ts 是否应已存在；置 true 后文件缺失即判失败，防止门禁长期 SKIP。',
    ],
    cssHex: result.cssHex,
    inlineHex: result.inlineHex,
    rgbaBlack: result.rgbaBlack,
    tokenized: result.tokenized,
    expectThemeFiles: existsSync(THEME_CSS) && existsSync(THEME_TOKENS_TS),
    updatedAt: new Date().toISOString().slice(0, 10),
  }
  writeFileSync(BASELINE_PATH, `${JSON.stringify(payload, null, 2)}\n`)
  return payload
}

/* -------------------------------------------------------------------- 主流程 */

const result = scan()
const baseline = readBaseline()

if (ARGS.has('--snapshot')) {
  const written = writeBaseline(result)
  console.log('✅ 已写入 scripts/theme-token-baseline.json')
  console.log(`   cssHex=${written.cssHex} inlineHex=${written.inlineHex} rgbaBlack=${written.rgbaBlack} tokenized=${written.tokenized}`)
  console.log(`   expectThemeFiles=${written.expectThemeFiles}`)
  process.exit(0)
}

if (ARGS.has('--per-file')) {
  // 逐文件内联裸色值计数，走与门禁完全相同的 scan()（同排除区、同剥注释/剥 className 口径）。
  // 加这个模式的原因：批量令牌化需要「本批范围 PRE/POST 差分」来证明没新增半对，
  // 而差分脚本若自己另写一份计数正则，就会和门禁口径分叉（实测能差出近 200 处）；
  // 早期脚本还 import 过并不存在的 lib/theme-token-ratchet.mjs，拿到空输入后直接把「新增 0」当成通过。
  // 结论：任何对账都必须复用门禁自己的输出，不得另建一份实现。
  const rows = [...result.byFile.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const sum = rows.reduce((n, [, v]) => n + v, 0)
  if (sum !== result.inlineHex) {
    console.error(`::error(--per-file 分解与总数不一致：逐文件合计 ${sum} ≠ inlineHex ${result.inlineHex}，差分结论作废）`)
    process.exit(1)
  }
  for (const [rel, n] of rows) console.log(`${n}\t${rel}`)
  console.log(`# 合计 ${result.inlineHex} 处 / ${rows.length} 个文件（与门禁 inlineHex 同口径，已自检相等）`)
  process.exit(0)
}

if (ARGS.has('--report')) {
  const mapped = Object.values(COLOR_TO_TOKEN).reduce((n, seg) => n + Object.keys(seg).length, 0)
  console.log(`映射表：严格等值可自动替换 ${mapped} 项 / 待人工判定 ${Object.keys(REVIEW_REQUIRED).length} 项\n`)
  console.log('待人工判定色值的实际命中次数（REVIEW_REQUIRED）：')
  for (const [value, n] of [...result.reviewHits].sort((a, b) => b[1] - a[1])) {
    console.log(`  #${value} ×${String(n).padStart(4)}  ← ${REVIEW_REQUIRED[value]}`)
  }
  console.log('\n映射表尚未覆盖的长尾色值 Top50（扩充 COLOR_TO_TOKEN 的候选）：')
  for (const [value, n] of [...result.unmapped].sort((a, b) => b[1] - a[1]).slice(0, 50)) {
    console.log(`  #${value} ×${n}`)
  }
  console.log(`\n长尾独立色值 ${result.unmapped.size} 个，合计 ${[...result.unmapped.values()].reduce((a, b) => a + b, 0)} 处`)
}

checkThemeCss(baseline?.expectThemeFiles === true)
checkThemeAliasSync()
checkScenePalette()

// 断言 3：棘轮
if (!baseline) {
  warns.push('基线文件缺失，先跑 node scripts/check-theme-tokens.mjs --snapshot 建立初版')
} else {
  for (const key of ['cssHex', 'inlineHex', 'rgbaBlack']) {
    const now = result[key]
    const allowed = baseline[key] ?? 0
    if (now > allowed) {
      errors.push(`裸色值上升：${key} ${allowed} → ${now}（+${now - allowed}）。新代码必须用 var(--*) 令牌；确属计划内新增需说明理由并 --snapshot 上调`)
    }
  }
}

// 断言 4：排除区污染 / primitive 层引用
if (result.pollution.length) {
  errors.push(`排除区被令牌化污染 ${result.pollution.length} 个文件（方案 §5.4 明令跳过）：${result.pollution.slice(0, 5).join(', ')}`)
}
if (result.primitive.length) {
  errors.push(`primitive 层令牌被业务代码引用 ${result.primitive.length} 个文件（只允许 theme.css 内部使用）：${result.primitive.slice(0, 5).join(', ')}`)
}

/* -------------------------------------------------------------------- 输出 */

if (ARGS.has('--json')) {
  console.log(JSON.stringify({
    ...result,
    unmapped: Object.fromEntries(result.unmapped),
    reviewHits: Object.fromEntries(result.reviewHits),
    errors,
    warns,
    skips,
  }, null, 2))
  process.exit(errors.length ? 1 : 0)
}

console.log('主题令牌门禁（check:theme-tokens）')
console.log(`  扫描文件 ${result.files} 个（另排除 ${result.excluded} 个：登录页 / 门户插画 scene / PetMascot / 测试断言）`)
console.log(`  CSS 裸色值 ${result.cssHex} 处 / 内联裸色值 ${result.inlineHex} 处 / 黑色 rgba 阴影 ${result.rgbaBlack} 处`)
console.log(`  已令牌化 var(--*) 用量 ${result.tokenized} 处`)
console.log(`  豁免区存量（不计棘轮）CSS 裸色值 ${result.cssExcludedHex} 处 —— 登录页区段 / scene 色板 / 拟真 APP 壳内`)
if (baseline) {
  console.log(`  基线 cssHex=${baseline.cssHex} inlineHex=${baseline.inlineHex} rgbaBlack=${baseline.rgbaBlack}（expectThemeFiles=${baseline.expectThemeFiles}）`)
}

for (const s of skips) console.log(`  SKIP  ${s}`)
for (const w of warns) console.log(`  WARN  ${w}`)
for (const e of errors) console.log(`  ERROR ${e}`)

if (errors.length) {
  console.log(`\n❌ 主题令牌门禁失败：${errors.length} 项`)
  process.exit(1)
}
console.log('\n✅ 主题令牌门禁通过')
