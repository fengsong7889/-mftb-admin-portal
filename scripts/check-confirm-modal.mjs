#!/usr/bin/env node
/**
 * Modal.confirm 统一确认弹窗样式检查（对应 .qoder/rules/frontend-ui-design-spec.md §B.3）
 *
 * 规则：所有 `Modal.confirm({...})` 必须带
 *   className: 'custom-confirm-modal',
 *   icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
 * 原因：Modal.confirm 走 antd 静态 API，不在 React 树内，**不继承 ConfigProvider 的
 * colorPrimary**，确认按钮会退回 antd 默认蓝，与 §B.1「弹窗底部-确认 = 主色实心」冲突；
 * 圆角/间距/图标也依赖该类名。
 *
 * 豁免：在 `Modal.confirm(` 所在行或其上一行加注释
 *   // confirm-modal-exempt: 原因
 * 用于「表单弹窗借 Modal.confirm 承载、刻意不要图标」这类场景。
 *
 * 用法：
 *   node scripts/check-confirm-modal.mjs            # 全量扫描
 *   node scripts/check-confirm-modal.mjs --quiet    # 仅输出违规文件清单
 *
 * 退出码：0 = 通过；1 = 存在违规
 */
import { readdirSync, readFileSync, statSync, existsSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = process.cwd()
const SCAN_DIRS = ['src', 'frontend']
const QUIET = process.argv.includes('--quiet')
const SNAPSHOT = process.argv.includes('--snapshot')
const CALL_RE = /Modal\.confirm\(\s*\{/g
const EXEMPT_RE = /confirm-modal-exempt\s*:/
const STANDARD_ICON_RE = /confirm-icon-wrapper/
/**
 * 危险确认图标变体的存量基线（每文件违规处数，只降不升）。
 * <p>为什么用基线而不是直接全量强制：这条规则是 2026-11-06 会议模块 E2E 之后补的，
 * 存量 91 处横跨 eam/hr/rdm/ads 四个系统，一次性改完会把一次业务修复变成 74 文件的噪声提交。
 * 没有基线的话就只能「要么不开这条规则、要么 CI 恒红」，两个都是坏选项。
 */
const DANGER_BASELINE_PATH = join(ROOT, 'scripts', 'confirm-modal-danger-icon-baseline.json')

/**
 * 从 '{' 起做括号配对扫描，返回配置对象顶层属性名列表与结束位置。
 * 跳过字符串/模板串/注释，避免把 JSX 里的 className= 或嵌套对象键误判成顶层属性。
 */
function topLevelKeys(src, openIdx) {
  const keys = []
  let depth = 0
  let i = openIdx
  const n = src.length
  while (i < n) {
    const c = src[i]
    if (c === '/' && src[i + 1] === '/') {
      const nl = src.indexOf('\n', i)
      i = nl < 0 ? n : nl
      continue
    }
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2)
      i = end < 0 ? n : end + 2
      continue
    }
    if (c === '"' || c === "'" || c === '`') {
      i += 1
      while (i < n) {
        if (src[i] === '\\') { i += 2; continue }
        if (src[i] === c) break
        i += 1
      }
      i += 1
      continue
    }
    if (c === '{') depth += 1
    else if (c === '}') {
      depth -= 1
      if (depth === 0) return { keys, end: i }
    } else if (depth === 1) {
      const m = /^([A-Za-z_$][\w$]*)\s*:/.exec(src.slice(i))
      if (m && (i === openIdx + 1 || /[ \n\t,;]/.test(src[i - 1]))) {
        keys.push(m[1])
        i += m[0].length
        continue
      }
    }
    i += 1
  }
  return { keys, end: -1 }
}

/** 取某个顶层属性的值片段（用于判断 icon 是否为规范节点） */
function valueOf(src, openIdx, key) {
  const re = new RegExp(`\\b${key}\\s*:`)
  let depth = 0
  for (let i = openIdx; i < src.length; i += 1) {
    const c = src[i]
    if (c === '{') depth += 1
    else if (c === '}') {
      depth -= 1
      if (depth === 0) break
    } else if (depth === 1) {
      const m = re.exec(src.slice(i, i + key.length + 4))
      if (m && m.index === 0 && (i === openIdx + 1 || /[ \n\t,;]/.test(src[i - 1]))) {
        return src.slice(i, i + 200)
      }
    }
  }
  return null
}

function collectFiles(dir, acc) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return acc
  }
  for (const name of entries) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) collectFiles(full, acc)
    else if (/\.tsx?$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name)) acc.push(full)
  }
  return acc
}

/**
 * 读危险确认图标基线。文件不存在按「零容忍」处理（所有违规都是新增），
 * 不能把读不到当成空基线静默放行——那等于门禁本身被删了也不会响。
 */
function readDangerBaseline() {
  if (!existsSync(DANGER_BASELINE_PATH)) return { meta: {}, entries: {} }
  let parsed = {}
  try {
    parsed = JSON.parse(readFileSync(DANGER_BASELINE_PATH, 'utf8'))
  } catch {
    return { meta: {}, entries: {} }
  }
  const entries = {}
  const meta = {}
  for (const [key, value] of Object.entries(parsed)) {
    if (key.startsWith('_')) meta[key] = value
    else if (typeof value === 'number') entries[key] = value
  }
  return { meta, entries }
}

const violations = []
let scanned = 0
/** 危险确认图标缺 --danger 变体：按文件计数，最后与基线对比（只降不升） */
const dangerByFile = new Map()

for (const dir of SCAN_DIRS) {
  for (const file of collectFiles(join(ROOT, dir), [])) {
    const src = readFileSync(file, 'utf8')
    if (!src.includes('Modal.confirm(')) continue
    const lines = src.split('\n')
    const rel = relative(ROOT, file)
    const isTsx = file.endsWith('.tsx')
    let hits = 0

    for (const m of src.matchAll(CALL_RE)) {
      scanned += 1
      const lineIdx = src.slice(0, m.index).split('\n').length - 1
      // 本行或上一行带豁免标记就跳过
      const around = `${lines[lineIdx] ?? ''}\n${lines[lineIdx - 1] ?? ''}`
      if (EXEMPT_RE.test(around)) continue

      const openIdx = m.index + m[0].length - 1
      const { keys } = topLevelKeys(src, openIdx)
      const problems = []
      if (!keys.includes('className')) {
        problems.push("缺少 className: 'custom-confirm-modal'")
      }
      if (isTsx) {
        const icon = valueOf(src, openIdx, 'icon')
        if (icon === null) {
          problems.push('缺少规范 icon（confirm-icon-wrapper）')
        } else {
          const val = icon.slice(icon.indexOf(':') + 1)
          const isNull = /^\s*null\b/.test(val)
          const hasStandard = STANDARD_ICON_RE.test(val)
          /* icon: someIdent —— 引用本文件定义的规范节点常量（如 ConfirmSubmitModal 的 confirmIcon）也合规 */
          const viaIdent = /^\s*[A-Za-z_$][\w$]*\s*[,)\n]/.test(val) && src.includes('confirm-icon-wrapper')
          if (!isNull && !hasStandard && !viaIdent) {
            problems.push('icon 未使用规范的 confirm-icon-wrapper 节点')
          }
          // 危险确认的图标必须转红：按钮已经是 danger 红、图标还顶品牌橙，
          // 同一个弹窗两套语义色，用户无法从颜色判断这件事能不能撤销（§B.1/§B.3）。
          // 2026-11-06 E2E 实测：删除会议室的确认按钮是 #FF4D4F，图标仍是橙色。
          // 只看 icon 之后到 okButtonProps 之间的那几个顶层键，不把同文件下一个弹窗的 danger 算进来。
          const okProps = valueOf(src, openIdx, 'okButtonProps')
          const isDanger = !!okProps && /danger:\s*true/.test(okProps)
          if (isDanger && !isNull && !/confirm-icon-wrapper--danger/.test(val) && !viaIdent) {
            const rel2 = relative(ROOT, file)
            dangerByFile.set(rel2, (dangerByFile.get(rel2) ?? 0) + 1)
          }
        }
      }
      if (problems.length) {
        hits += 1
        const msg = problems.join('；')
        if (!QUIET) violations.push(`  ${rel}:${lineIdx + 1}  ${msg}`)
        else violations.push(`  ${rel}:${lineIdx + 1}`)
      }
    }
  }
}

if (SNAPSHOT) {
  const baseline = readDangerBaseline()
  const next = { ...baseline.meta }
  for (const [file, count] of [...dangerByFile.entries()].sort()) next[file] = count
  writeFileSync(DANGER_BASELINE_PATH, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  console.log(`✅ 危险确认图标基线已下调：${dangerByFile.size} 个文件 / ${[...dangerByFile.values()].reduce((a, b) => a + b, 0)} 处`)
  // 快照模式不重复报违规：它的用途就是把整改成果固定下来
} else {
  const baseline = readDangerBaseline()
  for (const [file, count] of [...dangerByFile.entries()].sort()) {
    const allowed = baseline.entries[file] ?? 0
    if (count > allowed) {
      violations.push(`  ${file}  危险确认图标缺 confirm-icon-wrapper--danger 变体 ${count} 处（基线 ${allowed}）——新增危险确认必须用红色图标变体`)
    }
  }
  const stale = Object.entries(baseline.entries).filter(([file]) => (dangerByFile.get(file) ?? 0) < baseline.entries[file])
  if (stale.length > 0) {
    const saved = stale.reduce((sum, [file, n]) => sum + (n - (dangerByFile.get(file) ?? 0)), 0)
    console.log(`ℹ️  危险确认图标已有 ${stale.length} 个文件整改到位（可再降 ${saved} 处），执行 node scripts/check-confirm-modal.mjs --snapshot 下调基线`)
  }
}

if (violations.length) {
  console.error(
    `\n\u274C Modal.confirm 统一确认弹窗检查未通过（${violations.length} 处）\n`
    + '   Modal.confirm 不继承 ConfigProvider 主题，必须带 custom-confirm-modal 类名，\n'
    + '   否则确认按钮退回 antd 默认蓝（违反 §B.1「弹窗底部-确认 = 主色实心」）。\n'
    + '   确需豁免请加注释： // confirm-modal-exempt: 原因\n\n',
  )
  console.error(violations.join('\n'))
  process.exit(1)
}

console.log(`\u2705 Modal.confirm 统一确认弹窗检查通过（扫描 ${scanned} 处调用）`)
