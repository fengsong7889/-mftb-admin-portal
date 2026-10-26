#!/usr/bin/env node
/**
 * 迁移工具：把包内的「相对路径跨包引用」改写成别名引用。
 *
 * 为什么需要它：共享层拆包（方案 P2）用 git mv 整目录搬迁后，文件之间的相对深度变了，
 * 原先 `../../api/employee` 这类跨层相对引用会解析到包内不存在的目录 —— 编译报错还是小事，
 * 更糟的是它可能解析到包内同名目录，形成「看着能编译其实是另一份代码」的假连接。
 * 别名（@/api、@/components、@mftb/contracts…）与目录位置解耦，是拆包后的稳定引用面。
 *
 * 用法：node scripts/rewrite-package-relative-imports.mjs --root frontend/packages/ui/src [--dry-run]
 * 行为：只改写「解析结果落在 --root 之外」的相对说明符；包内相对引用保持不动。
 */
import fs from 'node:fs'
import path from 'node:path'
import { ALIAS_DIRS } from './lib/impact-graph.mjs'

const argv = process.argv.slice(2)
const rootArg = argv[argv.indexOf('--root') + 1]
const dryRun = argv.includes('--dry-run')
if (!rootArg) {
  console.error('用法：node scripts/rewrite-package-relative-imports.mjs --root <dir> [--dry-run]')
  process.exit(1)
}
const ROOT_PKG = path.resolve(rootArg)
const REPO = path.resolve('.')

const ALIAS_MAP = [
  ['frontend/packages/platform-client/src/api/', '@/api/'],
  ['frontend/packages/platform-client/src/contexts/', '@/contexts/'],
  ['frontend/packages/platform-client/src/utils/', '@/utils/'],
  ['frontend/packages/ui/src/components/', '@/components/'],
  ['frontend/packages/ui/src/hooks/', '@/hooks/'],
  ['frontend/packages/ui/src/styles/', '@/styles/'],
  ['frontend/packages/i18n/src/i18n/', '@/i18n/'],
  ['frontend/packages/contracts/src/constants/', '@/constants/'],
  ['frontend/packages/contracts/src/', '@mftb/contracts/'],
  ['src/', '@/'],
]


/** 仓库级“层”目录名：相对引用跨过包边界时，按层名重挂到别名上 */
const LAYERS = new Set(['api', 'contexts', 'utils', 'components', 'hooks', 'styles', 'constants', 'i18n', 'assets', 'pages', 'test'])

const CANDIDATES = ['', '.ts', '.tsx', '.js', '.jsx', '.json', '/index.ts', '/index.tsx', '/index.js', '.css']

/** 相对说明符当前是否能解析到真实文件（能 → 说明是包内/页面本地引用，不动它） */
function resolvesRel(spec, fromFile) {
  const base = path.resolve(path.dirname(fromFile), spec)
  return CANDIDATES.some((c) => {
    const p = base + c
    return fs.existsSync(p) && fs.statSync(p).isFile()
  })
}

/** 层名别名候选是否能解析到真实文件（不能 → 不改写，避免造出不存在的引用） */
function aliasExists(alias) {
  for (const [a, dir] of ALIAS_DIRS) {
    if (alias === a.replace(/\/$/, '') || alias.startsWith(a)) {
      const base = path.join(REPO, dir + alias.slice(a.length))
      if (CANDIDATES.some((c) => fs.existsSync(base + c) && fs.statSync(base + c).isFile())) return true
    }
  }
  return false
}

/**
 * 拆包后相对深度失真：只改写「当前解析不到、但层名别名能解析到」的相对说明符。
 * 页面本地同名子目录（pages/X/components/…）因为相对仍能解析，不会被误改。
 */
function rewriteSpec(spec, fromFile) {
  if (!spec.startsWith('.')) return null
  if (resolvesRel(spec, fromFile)) return null
  // 越出仓库根的相对引用不改写（交给编译报错暴露，而不是猜）
  const abs = path.resolve(path.dirname(fromFile), spec)
  if (!abs.startsWith(REPO + path.sep)) return null
  const segs = spec.split('/').filter((s) => s && s !== '.')
  const stack = []
  for (const s of segs) {
    if (s === '..') stack.pop()
    else stack.push(s)
  }
  if (!stack.length || !LAYERS.has(stack[0])) return null
  const alias = stack[0] === 'i18n' && stack.length === 1 ? '@/i18n' : `@/${stack.join('/')}`
  return aliasExists(alias) ? alias : null
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(full)
  }
  return out
}

let changedFiles = 0
let changedSpecs = 0
const skipped = []

for (const file of walk(ROOT_PKG)) {
  const code = fs.readFileSync(file, 'utf8')
  const out = code.replace(/(from\s*|import\s*\(\s*|import\s+|vi\.mock\(\s*|vi\.doMock\(\s*|vi\.unmock\(\s*|vi\.importActual\s*(?:<[^>]*>\s*)?\(\s*)(['"])(\.[^'"]*)\2/g, (m, head, q, spec) => {
    const alias = rewriteSpec(spec, file)
    if (!alias) return m
    changedSpecs += 1
    return `${head}${q}${alias}${q}`
  })
  if (out !== code) {
    changedFiles += 1
    if (!dryRun) fs.writeFileSync(file, out)
  }
}

console.log(`${dryRun ? '[dry-run] ' : ''}改写 ${changedSpecs} 处跨包相对引用（${changedFiles} 个文件），root=${rootArg}`)
for (const s of skipped) console.log(`  ⚠ ${s}`)
