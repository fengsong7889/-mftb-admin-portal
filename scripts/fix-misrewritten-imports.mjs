#!/usr/bin/env node
/**
 * 迁移修复工具：把「拆包重写时误改的页面本地引用」改回正确的相对路径。
 *
 * 背景：rewrite-package-relative-imports.mjs 按层名（components/hooks/utils…）重挂别名，
 * 但页面目录里普遍存在同名的本地子目录（如 src/pages/AccountBalance/components/shared.tsx），
 * 这类 `../components/shared` 原本指向页面本地文件，被误改成了全局别名 `@/components/shared`，
 * 而全局包里并没有这些文件 → TS2307。
 *
 * 本工具的判定很保守：只处理「别名解析后目标不存在」的说明符；
 * 修复方式是在导入方所在页面根（src/pages/<Top>）子树内按 basename 找唯一候选，
 * 找到才改写为相对路径，找不到就报告出来交人工判断，绝不猜。
 */
import fs from 'node:fs'
import path from 'node:path'
import { ALIAS_DIRS } from './lib/impact-graph.mjs'

const REPO = process.cwd()
const CANDIDATES = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx']

function resolveAlias(spec) {
  for (const [alias, dir] of ALIAS_DIRS) {
    if (spec === alias.replace(/\/$/, '') || spec.startsWith(alias)) {
      const base = dir + (spec.startsWith(alias) ? spec.slice(alias.length) : '')
      for (const cand of CANDIDATES) {
        const p = path.join(REPO, base + cand)
        if (fs.existsSync(p) && fs.statSync(p).isFile()) return p
      }
      return null
    }
  }
  return null
}

function pageRoot(file) {
  const parts = file.split('/')
  const i = parts.indexOf('pages')
  return i >= 0 ? parts.slice(0, i + 2).join('/') : null
}

function findLocal(file, basename) {
  const root = pageRoot(file)
  if (!root) return null
  const hits = []
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) walk(full)
      else {
        const stem = e.name.replace(/\.(ts|tsx|js|jsx)$/, '')
        if (stem === basename && !/\.test\./.test(e.name)) hits.push(full)
        if (stem === 'index' && e.name !== 'index.json' && basename === path.basename(dir)) hits.push(full)
      }
    }
  }
  walk(path.join(REPO, root))
  if (hits.length === 1) return hits[0]
  // 多个候选时优先页面本地 components/ 目录（误改高发区）
  const pref = hits.filter((h) => h.includes(`/${root}/components/`))
  return pref.length === 1 ? pref[0] : null
}

function toRelative(fromFile, target) {
  let rel = path.relative(path.dirname(fromFile), target).split(path.sep).join('/')
  rel = rel.replace(/\.(ts|tsx)$/, '')
  if (rel.endsWith('/index')) rel = rel.slice(0, -'/index'.length)
  return rel.startsWith('.') ? rel : `./${rel}`
}

function walkSrc(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) walkSrc(full, out)
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(full)
  }
  return out
}

let fixed = 0
const unresolved = []
for (const file of walkSrc(path.join(REPO, 'src'))) {
  const code = fs.readFileSync(file, 'utf8')
  const out = code.replace(/(from\s*|import\s*\(\s*)(['"])(@\/[^'"]+)\2/g, (m, head, q, spec) => {
    if (resolveAlias(spec)) return m
    const basename = spec.split('/').pop()
    const target = findLocal(path.relative(REPO, file), basename)
    if (!target) {
      unresolved.push(`${path.relative(REPO, file)}: ${spec}`)
      return m
    }
    fixed += 1
    return `${head}${q}${toRelative(file, target)}${q}`
  })
  if (out !== code) fs.writeFileSync(file, out)
}
console.log(`修复 ${fixed} 处误改的页面本地引用`)
if (unresolved.length) {
  console.log(`仍有 ${unresolved.length} 处别名无法解析（需人工判断）：`)
  for (const u of unresolved.slice(0, 30)) console.log('  - ' + u)
  process.exitCode = 2
}
