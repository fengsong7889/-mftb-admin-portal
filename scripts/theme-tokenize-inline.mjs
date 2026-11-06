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
  isExcludedSelector,
  normalizeHex,
} from './lib/theme-token-map.mjs'

const ROOT = process.cwd()
const ARGS = process.argv.slice(2)
const RUN = ARGS.includes('--run')
/**
 * CSS 侧开关。默认关：现有各批的 TSX 行为一字不改，避免“同一命令突然开始改 CSS”这种静默扩大作用域。
 * 为什么需要它：档 B（页面 CSS）有 2874 个裸色值，此前只能手工一个个改（档 A 就是这么做的），
 * 而里面的绝大多数其实有严格等值令牌——工具不支 CSS 纯粹是历史缺口，不是风险判断。
 */
const CSS = ARGS.includes('--css')
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
const VALID_FLAGS = ['--run', '--dir', '--verbose', '--all', '--dry-run', '--css']
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
    } else if (['.tsx', '.ts'].includes(extname(entry)) || (CSS && extname(entry) === '.css')) {
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
  /** 当前 style 块是否被成对锁定哨兵护住（必须整块护，原因见下方注释） */
  let pairLocked = false

  const next = source
    .split('\n')
    .map((line) => {
      const eligible = inStyle || line.includes('style={{')
      if (line.includes('style={{')) {
        inStyle = !line.includes('}}')
        // 每进入一个新的 style 块先清锁：锁不跨块，也不残留给下一个元素
        pairLocked = false
      } else if (inStyle && line.includes('}}')) inStyle = false
      if (!eligible) return line
      // 成对锁定哨兵（字符串 theme-pair-locked，写在 style 对象内部的注释里才合法）。
      // 为什么必需：人工把半对回退成「两侧都裸」后，这一行不再含 var(，行级与串级守卫
      // 都保护不了它；下一次重跑（比如新增令牌后的回填轮）会把其中一侧重新刷成令牌。
      // 第九批实测踩中了 4 处，其中两处代码里原本就写着「单独跑 codemod 会把背景重新刷上去」
      // 的 prose 注释（RDM ResourceLoad / GrayscaleConfig）——人工决定必须变成机器可读的标记。
      //
      // 锁必须按**整块**生效而不是按行：真实站点的 background 与 color 分处相邻两行，
      // 只锁写哨兵那一行，未来给那个色值建了令牌（如 brand-deep）就会反向造出新的半对。
      if (line.includes('theme-pair-locked')) {
        pairLocked = true
        return line
      }
      if (pairLocked) return line
      if (!/(["'][^"']*#[0-9a-fA-F]{3})|([^"']#[0-9a-fA-F]{3,8}[^"']*['"])/.test(line)) return line
      // 行级「含 var( 就整行跳过」的写法在第八批后已收到串级（见下方 QUOTED_ANY 处理）。
      // 原意是防「把人工选定的 var(--on-brand) 改回自动映射结果」，但工具只换 #hex、
      // 永远改写不了已有的 var()，所以那条守卫比必要范围宽得多：它把同一行里
      // **另一个仍钉着裸值的属性**也一并护住了——恰好就是最需要配对的半对形态（实测占残留 46/78）。

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
          // 同一条串里已经混用令牌与裸色（典型是只换了一半的渐变）：整串跳过。
          // 再往里只换其中一段会做出「一半随主题一半不随」，比不换更难查。
          if (inner.includes('var(')) {
            localSkipsHere += 1
            return rawStr
          }
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

/**
 * CSS 侧改写。与 TSX 侧共用同一张映射表、同一个 classifyProperty、同一套「严格等值」判据，
 * 只把作域识别从 `style={{…}}` 换成选择器块。**故意不另写一份映射逻辑**——
 * 分叉的计数/判据实现已经多次造成假结论（§18.4）。
 *
 * 六条刻意保守的规则，每条背后都是一个具体事故：
 *  1. 选择器命中 EXCLUDE_SELECTOR_PREFIXES（`.login-` / `.biz-` / `[data-scene=` 等）→ 整块跳过。
 *     多选择器组 `.a, .login-b {…}` 只要有一个命中就整块跳过（宁可漏改，不可误伤品牌固定样式）。
 *  2. **嵌套选择器继承上层的锁定**：`&:hover` 这种自身不包含 `.login-` 字样，
 *     不继承就会去改登录页的 hover 颜。这是本函数与直觉写法最容易错开的一处。
 *  3. `@media print` 块内不动：打印恒浅色是已定版策略（theme.css 里用 `html, html[data-theme='dark']`
 *     抬特异性做到），在页面 CSS 里把它改成令牌等于把这条策略交给运行时。
 *  4. 值里含 `gradient(` → 整值跳过：只换首尾停靠色会做出「一半随主题一半不随」。
 *  5. 值里已含 `var(` 又还有裸 hex → 整值跳过（人工只换了一半的现场，动它前需要人看）。
 *  6. `url(#id)` 里的 `#` 不是颜色（实测 id 叫 #feed 时会被当 hex）。
 * 另外 `theme-pair-locked` 哨兵在规则块内同样生效（锁整块，不锁单行）。
 */
const CSS_PROP_RE = /(^|[{;\s])(-{0,2}[a-z][a-z0-9-]*)\s*:\s*([^;{}]+)/g

/** 对一段声明文本跑映射；只换 hex 本身，**不重建 `prop: value`**（否则会抹掉原始空格与分号） */
function rewriteDecls(text, counters) {
  return text.replace(CSS_PROP_RE, (whole, pre, prop, expr) => {
    const segment = classifyProperty(prop)
    if (!segment) return whole
    if (!/#[0-9a-fA-F]{3}/.test(expr)) return whole
    // 规则 4 / 5 / 6：这三种形态整值不动，只计入未覆盖报告
    if (/gradient\(/i.test(expr) || expr.includes('var(') || /url\(\s*#/.test(expr)) {
      counters.skips += 1
      return whole
    }
    let changed = false
    // head = 匹配串里除 expr 以外的部分（`pre + prop + ':' + 空格`），原样保留
    const head = whole.slice(0, whole.length - expr.length)
    const nextExpr = expr.replace(HEX_INNER_RE, (rawHex, digits) => {
      const normalized = normalizeHex(digits)
      if (!normalized || normalized.hasAlpha) return rawHex
      const token = COLOR_TO_TOKEN[segment]?.[normalized.hex]
      if (!token) {
        counters.skips += 1
        return rawHex
      }
      changed = true
      counters.replaced += 1
      return `var(--${token})`
    })
    HEX_INNER_RE.lastIndex = 0
    return changed ? head + nextExpr : whole
  })
}

export function transformCss(source) {
  const counters = { replaced: 0, skips: 0 }
  const skipped = []
  /** 块栈：每层带自己的锁定标志，嵌套层继承上层 */
  const stack = []
  let pending = ''
  /** 本行内先开后关的单行规则，它的锁定必须在 pop 之后仍然可用 */
  let singleLineLock = true

  const next = source
    .split('\n')
    .map((line) => {
      const opens = (line.match(/\{/g) || []).length
      const closes = (line.match(/\}/g) || []).length
      const braceIdx = line.indexOf('{')

      // 选择器头 = 之前累积的行 + 本行 `{` 之前的部分。
      // 必须在处理前算好：同一行先开后关（`.login-x { color:#fff }`）时
      // pending 是空的，不拿本行开头就会让锁定失效——这是最危险的一种漏判。
      const head = braceIdx >= 0 ? (pending + line.slice(0, braceIdx)).trim() : pending.trim()
      if (braceIdx >= 0) pending = ''

      if (braceIdx >= 0) {
        const isAt = head.startsWith('@')
        const lockedByAt = /@media[^{]*\bprint\b/i.test(head)
        const lockedBySel = !isAt && head.split(',').some((s) => isExcludedSelector(s.trim()))
        const inherited = stack.length ? stack[stack.length - 1].locked : false
        singleLineLock = lockedByAt || lockedBySel || inherited
        stack.push({ locked: singleLineLock })
      }
      for (let i = 0; i < closes; i++) stack.pop()

      // 哨兵：锁当前最内层块（不锁单行，原因同 TSX 侧）
      if (stack.length && line.includes('theme-pair-locked')) {
        stack[stack.length - 1].locked = true
        return line
      }
      // 哨兵写在规则头那一行时，刚压的栈就是它自己的块
      if (braceIdx >= 0 && line.includes('theme-pair-locked')) return line

      // 单行规则（`.a { color:#fff }`）在本行内先 push 后 pop，栈会回到外层；
      // 此时必须用刚算出的本块锁定，不能用“栈顶”——否则栈为空会被当成“不在任何块里”
      // 而整行跳过（测试用 2≠3 的精确计数拦住了这个：上一轮自以为修好了单行规则）。
      const locked = opens > 0 && closes > 0
        ? singleLineLock
        : (stack.length ? stack[stack.length - 1].locked : true)
      if (locked || !/#[0-9a-fA-F]{3}/.test(line)) return line

      if (opens > 0 && closes > 0) {
        // 单行规则 `.a { color: #fff; }`：只重写 `{…}` 之间的部分，头尾不动
        const close = line.lastIndexOf('}')
        const body = line.slice(braceIdx + 1, close)
        const before = counters.skips
        const rewritten = line.slice(0, braceIdx + 1) + rewriteDecls(body, counters) + line.slice(close)
        if (counters.skips > before) skipped.push(line.trim().slice(0, 72))
        return rewritten
      }
      if (opens > 0 || closes > 0) return line // 开合混排行（如 `} else`、多块一行）不猜

      const before = counters.skips
      const rewritten = rewriteDecls(line, counters)
      if (counters.skips > before) skipped.push(line.trim().slice(0, 72))
      return rewritten
    })
    .join('\n')

  return { next, replaced: counters.replaced, skipped }
}

let totalFiles = 0
let totalReplaced = 0

for (const rel of collectFiles()) {
  const before = readFileSync(join(ROOT, rel), 'utf8')
  const { next, replaced, skipped } = rel.endsWith('.css') ? transformCss(before) : transform(before)
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
