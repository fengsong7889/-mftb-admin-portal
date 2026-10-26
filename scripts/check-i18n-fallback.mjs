#!/usr/bin/env node
/**
 * i18n 兜底文案扫描（企业门户设计评审 P0-6 后半句）
 *
 * 背景：`t(key, '中文兜底')` 的第二参数是「语言包没取到时的最后一道文字」。
 * 它一旦出现在生产包里，就意味着界面语言切换后仍会看到硬编码中文——正是评审
 * 在「移动 APP」页签上看到的「Tab 写移動 APP、副标题写原型預覽」这类中英混排。
 *
 * 两条规则：
 *   ERROR  引用的 key 在 zh-TW 与 en 里都不存在 → 生产环境必然吃中文兜底，直接阻断。
 *   WARN   key 存在但仍写中文兜底 → 兜底已是死代码，可安全删成单参 t(key)（计数不阻断）。
 *
 * 为什么 WARN 不阻断：存量页面大量使用双参写法（历史风格），一次性改成单参会牵动
 * 上百行；先用计数把「只增不减」卡住，再逐批清理。
 *
 * 用法：
 *   node scripts/check-i18n-fallback.mjs          # 检查
 *   node scripts/check-i18n-fallback.mjs --json   # 输出 JSON 明细
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, extname } from 'node:path'

const ROOT = process.cwd()
const SRC_DIR = join(ROOT, 'src')
const LOCALE_DIR = join(ROOT, 'frontend/packages/i18n/src/i18n/locales')
/** 基线：key 存在却仍写中文兜底的行数上限。只允许下降，新增即失败。 */
const REDUNDANT_BASELINE = Number(readBaseline())

function readBaseline() {
  try {
    const raw = readFileSync(join(ROOT, 'scripts/i18n-fallback-baseline.json'), 'utf8')
    return JSON.parse(raw).redundantFallback ?? 0
  } catch {
    return 0
  }
}

/** 把嵌套语言包展平成点号 key 集合，用于判断某个 key 是否真的存在 */
function flattenKeys(node, prefix = '', out = new Set()) {
  if (!node || typeof node !== 'object') return out
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value)) flattenKeys(value, path, out)
    else out.add(path)
  }
  return out
}

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      if (entry === 'node_modules' || entry === 'test') continue
      walk(full, files)
    } else if (['.ts', '.tsx'].includes(extname(entry)) && !/\.(test|spec)\.tsx?$/.test(entry)) {
      files.push(full)
    }
  }
  return files
}

const zhKeys = flattenKeys(JSON.parse(readFileSync(join(LOCALE_DIR, 'zh-TW.json'), 'utf8')))
const enKeys = flattenKeys(JSON.parse(readFileSync(join(LOCALE_DIR, 'en.json'), 'utf8')))
const knownKeys = new Set([...zhKeys, ...enKeys])

/**
 * 匹配 t('key', '含中文的兜底') / t("key", "含中文") / t(`key`, `含中文`)
 * 只关心第二参数里含中日韩汉字的字面量；跳过带插值对象的调用。
 */
const CALL_RE = /\bt\(\s*(['"`])([A-Za-z0-9_.:-]+)\1\s*,\s*(['"`])([^'"`\\]*[\u4e00-\u9fff][^'"`\\]*)\3/g

const missing = []
const redundant = []

for (const file of walk(SRC_DIR)) {
  const code = readFileSync(file, 'utf8')
  const lines = code.split('\n')
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    CALL_RE.lastIndex = 0
    let match
    while ((match = CALL_RE.exec(line)) !== null) {
      const key = match[2]
      const fallback = match[4]
      const record = {
        file: relative(ROOT, file),
        line: i + 1,
        key,
        fallback,
      }
      if (knownKeys.has(key)) redundant.push(record)
      else missing.push(record)
    }
  }
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ missing, redundant }, null, 2))
  process.exit(missing.length > 0 || redundant.length > REDUNDANT_BASELINE ? 1 : 0)
}

console.log('i18n 兜底文案扫描（t(key, \'中文兜底\')）\n')

if (missing.length > 0) {
  console.error(`❌ ${missing.length} 处兜底 key 在 zh-TW / en 中都不存在（生产必现中文硬编码）：`)
  for (const item of missing.slice(0, 20)) {
    console.error(`   ${item.file}:${item.line}  t('${item.key}', '${item.fallback}')`)
  }
  if (missing.length > 20) console.error(`   …… 其余 ${missing.length - 20} 处省略，用 --json 查看全量`)
} else {
  console.log('✅ 无「key 不存在」的中文兜底')
}

console.log(`\nℹ️  ${redundant.length} 处 key 已存在但仍写中文兜底（基线 ${REDUNDANT_BASELINE}，可安全改单参 t(key)）`)

const redundantOverflow = redundant.length > REDUNDANT_BASELINE
if (redundantOverflow) {
  console.error(`❌ 冗余兜底 ${redundant.length} 处，超过基线 ${REDUNDANT_BASELINE}：新增文案必须用单参 t(key) 并补语言包`)
}

if (missing.length > 0 || redundantOverflow) process.exit(1)

console.log('\n✅ i18n 兜底扫描通过')
