#!/usr/bin/env node
/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

/**
 * CSS 裸色值 → 语义令牌的批量替换（方案 §5.2 档 B）。
 *
 * 用法：
 *   node scripts/theme-tokenize-css.mjs --dry-run                    # 只报将要改多少处
 *   node scripts/theme-tokenize-css.mjs --run --files frontend/packages/ui/src/styles/components.css
 *   node scripts/theme-tokenize-css.mjs --run                        # 全仓 CSS（谨慎，务必先 dry-run）
 *
 * 三条不显眼但决定成败的实现选择：
 *
 * 1. **按「声明」解析而不是全局替换色值**。
 *    `background: #fff` 要换成 `--surface-2`，`color: #fff` 要换成 `--on-brand` —— 同一个色值、
 *    相反语义。所以必须先取出属性名，交给 classifyProperty() 决定它属于 bg / fg / border 哪一段，
 *    再用那一段的映射表。做成单一色值映射表会把文字色批量刷成背景色。
 *
 * 2. **注释先行抽出**。CSS 注释里经常出现色值（「原 #E8720C 已废弃」），不隔离就会被改写，
 *    而改写注释等于销毁设计决策的证据。
 *
 * 3. **带 alpha 的 8 位十六进制不动**。`#E8720CFF` 与 `#E8720C` 不是同一个语义（半透明叠加），
 *    截断替换会改变渲染结果。
 *
 * 未命中映射表的值一律原样保留，并由 check-theme-tokens 的棘轮基线继续记为债务——**绝不猜**。
 * 阴影走单独的 SHADOW_VALUE_TO_TOKEN（整串严格等值），只收黑色阴影；
 * 未命中的复合/彩色阴影整条不动，留给人工判定。
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import {
  COLOR_TO_TOKEN,
  SCAN_ROOTS,
  SHADOW_VALUE_TO_TOKEN,
  classifyProperty,
  isExcluded,
  isExcludedSelector,
  normalizeHex,
  normalizeShadowValue,
} from './lib/theme-token-map.mjs'

const ROOT = process.cwd()
const ARGS = process.argv.slice(2)
const RUN = ARGS.includes('--run')
const explicit = ARGS.indexOf('--files')
/** --files 后跟仓库相对路径；不传则扫全部 CSS（务必先 --dry-run） */
const targets = explicit >= 0 ? ARGS.slice(explicit + 1).filter((a) => !a.startsWith('--')) : null

/** 声明级匹配：属性名 + 到分号/花括号结束的值段。伪类会因 classifyProperty 返回 null 而被自然跳过 */
const DECLARATION_RE = /([-a-zA-Z]+)\s*:\s*([^;{}]+)/g
const HEX_RE = /#([0-9a-fA-F]{3,8})\b/g

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
    } else if (extname(entry) === '.css') {
      out.push(full)
    }
  }
  return out
}

function collectFiles() {
  if (targets) return targets.map((t) => relative(ROOT, t).replace(/\\/g, '/'))
  const files = []
  for (const root of SCAN_ROOTS) {
    const abs = join(ROOT, root)
    if (existsSync(abs)) walk(abs, files)
  }
  return files.map((f) => relative(ROOT, f).replace(/\\/g, '/')).sort()
}

/**
 * 改写单个文件内容。
 * @returns {{ next: string, replaced: number, skipped: string[] }} skipped 记录「属性可识别但色值不在映射表」的情况，
 *          它们是扩充映射表的候选，静默丢掉就等于把信息扔了。
 *
 * 逐行处理是为了能追踪「当前在哪个选择器块里」：登录页、关键帧动画这些区段必须整块跳过。
 * 块上下文的三条规则：
 *   - `@keyframes X {` → 置为跳过大常量（关键帧颜色属于哪个组件无法从结构推出，交人工）
 *   - `from/to/N% {` → 沿用上一个上下文（它还在 keyframes 里）
 *   - `@media/@supports {` → 沿用外层（它只是容器，不是选择器）
 */
const KEYFRAMES = '__keyframes__'

function transform(source) {
  // 注释替换成占位符，处理完再还原：防止把「原值 #E8720C」这类设计说明改写成令牌
  const comments = []
  const shielded = source.replace(/\/\*[\s\S]*?\*\//g, (m) => {
    comments.push(m)
    return `\u0000${comments.length - 1}\u0000`
  })

  let replaced = 0
  const skipped = []
  let currentSelector = ''

  const nextLines = shielded.split('\n').map((line) => {
    const opensBlock = /\{\s*$/.test(line)
    if (opensBlock) {
      if (/^\s*@keyframes\b/.test(line)) currentSelector = KEYFRAMES
      else if (/^\s*(from|to|\d+%)\b/.test(line)) {
        /* 关键帧百分比：沿用上一个上下文，不要把 KEYFRAMES 洗掉 */
      } else if (!/^\s*@(media|supports|layer)\b/.test(line)) {
        // @media / @supports 是容器行，不覆盖外层选择器；其余以 { 结尾的行视为规则头
        currentSelector = line.replace(/\{\s*$/, '').trim()
      }
      return line
    }
    if (/^\s*\}/.test(line)) return line
    if (!currentSelector || currentSelector === KEYFRAMES || isExcludedSelector(currentSelector)) return line

    const rewritten = line.replace(DECLARATION_RE, (whole, prop, value) => {
      // box-shadow 优先整串匹配：同一个 rgba(0,0,0,0.06) 可以配不同的 offset/blur，
      // 而深色值是按「档位」定的。只替色值会把 shadow-1 与 shadow-2 弄混。
      if (/^box-shadow$/i.test(prop.trim())) {
        const shadowToken = SHADOW_VALUE_TO_TOKEN[normalizeShadowValue(value)]
        if (shadowToken) {
          replaced += 1
          return whole.split(value)[0] + `var(--${shadowToken})`
        }
        // 未命中就整条不动（复合阴影、彩色阴影、inset 等需人工判定），不能再走色值替换：
        // 否则会把 rgba 颜色单独换成 var(--*) 而保留原 offset，得到一个四不像的阴影。
        return whole
      }

      const segment = classifyProperty(prop)
      if (!segment) return whole // 非颜色属性（width / transition / 伪类残留等）

      let localSkips = 0
      const nextValue = value.replace(HEX_RE, (rawHex) => {
        const normalized = normalizeHex(rawHex)
        if (!normalized || normalized.hasAlpha) return rawHex
        const token = COLOR_TO_TOKEN[segment]?.[normalized.hex]
        if (!token) {
          localSkips += 1
          return rawHex
        }
        replaced += 1
        return `var(--${token})`
      })

      if (localSkips > 0) skipped.push(`${currentSelector} → ${prop}: ${localSkips} 处未命中 ${segment} 段映射`)
      return whole.split(value)[0] + nextValue + whole.split(value).slice(1).join(value)
    })

    return rewritten
  })

  const body = nextLines.join('\n')
  const next = body.replace(/\u0000(\d+)\u0000/g, (_, i) => comments[Number(i)])
  return { next, replaced, skipped }
}

let totalFiles = 0
let totalReplaced = 0

for (const rel of collectFiles()) {
  if (isExcluded(rel)) {
    console.log(`SKIP（排除区） ${rel}`)
    continue
  }
  const abs = join(ROOT, rel)
  if (!existsSync(abs)) {
    console.error(`文件不存在：${rel}`)
    process.exit(1)
  }

  const before = readFileSync(abs, 'utf8')
  const { next, replaced, skipped } = transform(before)
  if (replaced === 0) continue

  totalFiles += 1
  totalReplaced += replaced
  console.log(`${RUN ? '改写' : '待改'} ${rel}：${replaced} 处${skipped.length ? `（另有 ${skipped.length} 条声明含未覆盖色值）` : ''}`)
  if (RUN) writeFileSync(abs, next)
}

console.log(
  RUN
    ? `\n✅ 已改写 ${totalFiles} 个文件、共 ${totalReplaced} 处。请接着跑：npm run check:theme-tokens --run 下调基线，并跑测试确认无回归`
    : `\n[dry-run] ${totalFiles} 个文件、共 ${totalReplaced} 处待改。确认无误后加 --run 执行`,
)

if (!RUN) {
  console.log('\n提示：改写后务必人工核对 diff —— 机械替换只保证「严格等值」，不保证语义恰当（例如某处白底其实该用 --surface-3）。')
}
