#!/usr/bin/env node
/**
 * 影响域测试选择器（Impact-scoped test selector）
 *
 * 目的：改动某个系统的某个菜单小功能时，只跑"受影响的测试"，而不是全量。
 * 跨系统关联由依赖图自动覆盖：改了共享模块（api / 公共组件 / 工具），
 * 所有间接引用它的页面测试都会被选中；反之不相关系统的测试不会跑。
 *
 * 用法：
 *   node scripts/affected-tests.mjs                 # 只分析并打印推荐命令
 *   node scripts/affected-tests.mjs --run           # 分析并直接执行
 *   node scripts/affected-tests.mjs --base origin/main
 *   node scripts/affected-tests.mjs --files src/pages/X/y.ts   # 显式指定本次编辑的文件
 *   node scripts/affected-tests.mjs --json          # 机器可读输出
 *
 * 安全策略（fail-closed）：
 *   - 命中"共享/契约层"文件 → 强制升档为全量
 *   - 无法判定影响范围（解析异常、命中比例过高）→ 升档为全量
 *   - 本地提速不削减门禁：提交/推送前与 CI 仍必须全量
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

// ───────────────────────── 命令行参数 ─────────────────────────
const argv = process.argv.slice(2)
const has = (flag) => argv.includes(flag)
const valueOf = (flag, fallback) => {
  const i = argv.indexOf(flag)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback
}

const opts = {
  base: valueOf('--base', 'HEAD'),
  run: has('--run'),
  json: has('--json'),
  lintOnly: has('--lint-only'),
  skipLint: has('--skip-lint'),
  skipTypecheck: has('--skip-typecheck'),
  skipBackend: has('--skip-backend'),
  frontendOnly: has('--frontend-only'),
  /** 影响域测试数占全量比例超过该阈值时升档为全量 */
  escalateRatio: Number(valueOf('--max-ratio', 0.6)),
  /** 后端反向依赖扩散跳数 */
  beHops: Number(valueOf('--be-hops', 2)),
  /** 显式变更文件列表（逗号或空格分隔），优先于 git diff */
  files: valueOf('--files', ''),
}

// ───────────────────────── 共享层（命中即全量）─────────────────────────
// 这些文件被多个系统/菜单共用，任何改动都可能波及全量，必须跑全量。
const GLOBAL_FE = [
  /^src\/main\.tsx$/,
  /^src\/App\.tsx$/,
  /^src\/App\.css$/,
  /^src\/build-meta/,
  /^src\/api\/request/,
  /^src\/api\/index/,
  /^src\/contexts\//,
  /^src\/hooks\//,
  /^src\/i18n\//,
  /^src\/constants\//,
  /^src\/components\//,
  /^src\/styles\//,
  /^src\/utils\//,
  /^src\/test\//,
  /^src\/pages\/_shared\//,
  /^(package\.json|package-lock\.json|tsconfig\.json|vite\.config\.ts|vitest\.config\.ts|eslint\.config\.js|index\.html)$/,
]

const GLOBAL_BE = [
  /^backend\/pom\.xml$/,
  /^backend\/src\/main\/resources\/application/,
  /^backend\/src\/main\/resources\/db\/migrations\//,
  /^backend\/sql\//,
  /^backend\/src\/main\/java\/com\/mftb\/admin\/common\//,
  /^backend\/src\/main\/java\/com\/mftb\/admin\/config\//,
  /^backend\/src\/main\/java\/com\/mftb\/admin\/aspect\//,
  /^backend\/src\/main\/java\/com\/mftb\/admin\/util\//,
  /^backend\/src\/main\/java\/com\/mftb\/admin\/constant\//,
  /^backend\/src\/main\/java\/com\/mftb\/admin\/mapper\//,
  /^backend\/src\/main\/java\/com\/mftb\/admin\/entity\//,
  /^backend\/src\/test\/(resources|java\/com\/mftb\/admin\/security\/SecurityTestBase\.java)/,
]

const GLOBAL_BOTH = [/^scripts\//, /^\.github\//, /^\.qoder\/rules\//, /^AGENTS\.md$/]

// ───────────────────────── 工具函数 ─────────────────────────
function git(args, allowFail = false) {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim()
  } catch (err) {
    if (allowFail) return ''
    throw err
  }
}

/** 递归列出目录下的文件（相对 ROOT 的 posix 路径），按扩展名过滤 */
function walk(dir, extensions, skipDirs = new Set()) {
  const out = []
  const abs = path.join(ROOT, dir)
  if (!fs.existsSync(abs)) return out
  const stack = [abs]
  while (stack.length) {
    const cur = stack.pop()
    let entries
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of entries) {
      const full = path.join(cur, e.name)
      if (e.isDirectory()) {
        if (!skipDirs.has(e.name)) stack.push(full)
      } else if (extensions.some((ext) => e.name.endsWith(ext))) {
        out.push(path.relative(ROOT, full).split(path.sep).join('/'))
      }
    }
  }
  return out
}

const readFile = (rel) => {
  try {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8')
  } catch {
    return ''
  }
}

// ───────────────────────── 1. 变更文件集合 ─────────────────────────
function collectChangedFiles() {
  if (opts.files) {
    return opts.files.split(/[,\s]+/).map((f) => f.replace(/^\.\//, '')).filter(Boolean)
  }
  const set = new Set()
  const base = opts.base
  const ref = base === 'HEAD' ? 'HEAD' : base
  // 已跟踪文件的改动（工作区 + 暂存区 vs ref）
  for (const line of git(['diff', '--name-only', ref], true).split('\n')) {
    if (line.trim()) set.add(line.trim())
  }
  if (base !== 'HEAD') {
    // 指定 base 时补上 base..HEAD 的提交差异
    const mergeBase = git(['merge-base', 'HEAD', base], true)
    if (mergeBase) {
      for (const line of git(['diff', '--name-only', mergeBase, 'HEAD'], true).split('\n')) {
        if (line.trim()) set.add(line.trim())
      }
    }
  }
  // 未跟踪的新文件
  for (const line of git(['ls-files', '--others', '--exclude-standard'], true).split('\n')) {
    if (line.trim()) set.add(line.trim())
  }
  // 已删除的文件仍可能出现在升档规则匹配中，一并保留（读取时按空内容处理）
  return [...set]
}

// ───────────────────────── 2. 前端依赖图 ─────────────────────────
const SPEC_PATTERNS = [
  /\bfrom\s*['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\bimport\s*['"]([^'"]+)['"]/g,
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\bvi\.mock\s*\(\s*['"]([^'"]+)['"]/g,
]

function extractSpecifiers(code) {
  const specs = new Set()
  for (const re of SPEC_PATTERNS) {
    re.lastIndex = 0
    let m
    while ((m = re.exec(code))) specs.add(m[1])
  }
  return [...specs]
}

const RESOLVE_CANDIDATES = [
  '', '.ts', '.tsx', '.js', '.jsx', '.json',
  '/index.ts', '/index.tsx', '/index.js',
]

function resolveSpecifier(spec, fromFile) {
  if (!spec.startsWith('@/') && !spec.startsWith('.') && !spec.startsWith('/')) return null
  let target
  if (spec.startsWith('@/')) target = path.join(ROOT, 'src', spec.slice(2))
  else target = path.resolve(path.join(ROOT, fromFile), '..', spec)
  for (const cand of RESOLVE_CANDIDATES) {
    const p = target + cand
    if (fs.existsSync(p) && fs.statSync(p).isFile()) {
      const rel = path.relative(ROOT, p).split(path.sep).join('/')
      return rel.startsWith('src/') ? rel : null
    }
  }
  return null
}

/** 构建前端反向依赖图：file → 依赖它的文件集合 */
function buildFrontendGraph(feFiles) {
  const reverse = new Map()
  for (const file of feFiles) {
    if (!/\.(ts|tsx)$/.test(file)) continue
    const specs = extractSpecifiers(readFile(file))
    for (const spec of specs) {
      const dep = resolveSpecifier(spec, file)
      if (!dep || dep === file) continue
      if (!reverse.has(dep)) reverse.set(dep, new Set())
      reverse.get(dep).add(file)
    }
  }
  return reverse
}

const isTestFile = (f) => /\.(test|spec)\.(ts|tsx)$/.test(f)

/** 从变更文件反向扩散，收集受影响的测试文件 */
function frontendAffectedTests(changed, reverse) {
  const seeds = new Set()
  for (const f of changed) {
    if (f.startsWith('src/')) seeds.add(f)
  }
  const selected = new Set()
  const visited = new Set()
  const queue = [...seeds]
  while (queue.length) {
    const cur = queue.shift()
    if (visited.has(cur)) continue
    visited.add(cur)
    if (isTestFile(cur)) selected.add(cur)
    for (const dependent of reverse.get(cur) || []) {
      if (!visited.has(dependent)) queue.push(dependent)
    }
  }
  return selected
}

// ───────────────────────── 3. 后端依赖图 ─────────────────────────
const JAVA_ROOT = 'backend/src'

/** 取出文件里的所有 Java 标识符（近似词法切分，够用于类名共现分析） */
function extractIdentifiers(code) {
  const stripped = code
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/"(?:\\.|[^"\\])*"/g, ' ')
    .replace(/'(?:\\.|[^'\\])'/g, ' ')
  return new Set(stripped.match(/[A-Za-z_$][A-Za-z0-9_$]*/g) || [])
}

function buildBackendGraph(javaFiles) {
  // 主代码类名集合（简单名）
  const mainFiles = javaFiles.filter((f) => f.startsWith(`${JAVA_ROOT}/main/java/`))
  const classNames = new Map() // simpleName -> main file
  for (const f of mainFiles) {
    const simple = path.basename(f, '.java')
    // 内部类同名文件极少，直接登记；重名简单名保留首个并标记冲突
    if (!classNames.has(simple)) classNames.set(simple, f)
    else classNames.set(simple, null)
  }
  const validNames = new Set([...classNames.entries()].filter(([, v]) => v).map(([k]) => k))

  // 反向边：className(simple) → 依赖它的 java 文件（含 main 与 test）
  const reverse = new Map()
  for (const f of javaFiles) {
    const selfSimple = path.basename(f, '.java')
    for (const id of extractIdentifiers(readFile(f))) {
      if (!validNames.has(id) || id === selfSimple) continue
      if (!reverse.has(id)) reverse.set(id, new Set())
      reverse.get(id).add(f)
    }
  }
  return { reverse, classNames, validNames }
}

/** 后端影响域：变更类 → 扩散 N 跳 → 命中的 *Test 文件 */
function backendAffectedTests(changed, graph, javaFiles) {
  const allTests = javaFiles.filter(
    (f) => f.startsWith(`${JAVA_ROOT}/test/java/`) && /Test\.java$/.test(f),
  )
  const testSet = new Set(allTests)
  const seeds = []
  for (const f of changed) {
    if (!f.startsWith(`${JAVA_ROOT}/main/java/`) || !f.endsWith('.java')) continue
    const simple = path.basename(f, '.java')
    if (graph.validNames.has(simple)) seeds.push(simple)
  }
  const changedTests = changed.filter((f) => testSet.has(f))

  const selected = new Set(changedTests)
  let frontier = new Set(seeds)
  const visited = new Set(seeds)
  for (let hop = 0; hop < opts.beHops && frontier.size; hop++) {
    const next = new Set()
    for (const cls of frontier) {
      for (const dep of graph.reverse.get(cls) || []) {
        if (testSet.has(dep)) {
          selected.add(dep)
          continue
        }
        const simple = path.basename(dep, '.java')
        if (!visited.has(simple) && graph.validNames.has(simple)) {
          visited.add(simple)
          next.add(simple)
        }
      }
    }
    frontier = next
    // 扩散失控 → 交给调用方升档
    if (visited.size > 400) return { selected, exploded: true, seeds }
  }
  return { selected, exploded: false, seeds }
}

// ───────────────────────── 4. 变更分类 ─────────────────────────
function classify(changed) {
  const reasons = []
  const hit = (patterns) => changed.filter((f) => patterns.some((re) => re.test(f)))

  const feGlobal = hit(GLOBAL_FE)
  const beGlobal = hit(GLOBAL_BE)
  const bothGlobal = hit(GLOBAL_BOTH)
  if (feGlobal.length) reasons.push({ side: 'frontend', files: feGlobal, why: '前端共享/契约层' })
  if (beGlobal.length) reasons.push({ side: 'backend', files: beGlobal, why: '后端共享/契约层或 SQL/配置' })
  if (bothGlobal.length) reasons.push({ side: 'both', files: bothGlobal, why: '工程脚本/CI/规则' })

  return { feGlobal, beGlobal, bothGlobal, reasons }
}

// ───────────────────────── 5. Maven 环境探测 ─────────────────────────
function resolveMavenEnv() {
  const env = { ...process.env }
  if (!env.JAVA_HOME && process.platform === 'darwin') {
    const found = execFileSyncSafe(['/usr/libexec/java_home', '-v', '17'])
    if (found) env.JAVA_HOME = found
  }
  const localCandidates = [
    path.join(process.env.HOME || '', 'Library/apache-maven-3.9.9/bin/mvn'),
    path.join(process.env.HOME || '', 'apache-maven-3.9.6/bin/mvn'),
    path.join(ROOT, '.local/apache-maven-3.9.6/bin/mvn'),
  ]
  let mvn = null
  for (const abs of localCandidates) {
    if (fs.existsSync(abs)) { mvn = abs; break }
  }
  if (!mvn) {
    try {
      execFileSync('mvn', ['-v'], { stdio: 'ignore' })
      mvn = 'mvn'
    } catch { /* 找不到 Maven：交由 runCommands 报错提示 */ }
  }
  return { env, mvn }
}

function execFileSyncSafe(cmdAndArgs) {
  try {
    return execFileSync(cmdAndArgs[0], cmdAndArgs.slice(1), { encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}

// ───────────────────────── 6. 主流程 ─────────────────────────
function main() {
  const changed = collectChangedFiles()
  const result = {
    base: opts.base,
    changedCount: changed.length,
    changed,
    escalate: [],
    frontend: { full: false, tests: [], skipped: '无前端源码改动' },
    backend: { full: false, tests: [], skipped: '无后端源码改动' },
    lintTargets: [],
    commands: [],
  }

  if (!changed.length) {
    result.message = '没有检测到变更文件（git diff 为空）。'
    output(result)
    return
  }

  const cls = classify(changed)
  const feChanged = changed.filter((f) => f.startsWith('src/'))
  const beChanged = changed.filter((f) => f.startsWith('backend/'))

  // ── 前端 ──
  if (cls.bothGlobal.length) {
    result.frontend.full = true
  }
  if (feChanged.length || cls.feGlobal.length || cls.bothGlobal.length) {
    if (cls.feGlobal.length || cls.bothGlobal.length) {
      result.frontend.full = true
      result.escalate.push({ side: 'frontend', files: cls.feGlobal, why: '前端共享/契约层' })
    } else {
      const allFe = walk('src', ['.ts', '.tsx'])
      const reverse = buildFrontendGraph(allFe)
      const tests = frontendAffectedTests(changed, reverse)
      const totalTests = allFe.filter(isTestFile).length
      if (!tests.size) {
        result.frontend.skipped = '影响域内无测试用例（仅做 lint/typecheck）'
      } else if (totalTests && tests.size / totalTests > opts.escalateRatio) {
        result.frontend.full = true
        result.escalate.push({
          side: 'frontend',
          files: [],
          why: `影响域覆盖 ${tests.size}/${totalTests} 个测试文件，超过 ${Math.round(opts.escalateRatio * 100)}% 阈值`,
        })
      } else {
        result.frontend.tests = [...tests].sort()
        result.frontend.skipped = null
      }
    }
  } else {
    result.frontend.skipped = '无前端源码改动'
  }

  // ── 后端 ──
  if (!opts.frontendOnly && !opts.skipBackend) {
    const beJavaChanged = beChanged.filter((f) => f.endsWith('.java'))
    if (cls.beGlobal.length || cls.bothGlobal.length) {
      result.backend.full = true
      result.escalate.push({ side: 'backend', files: [...cls.beGlobal, ...cls.bothGlobal], why: '后端共享/契约层、SQL/配置或工程脚本' })
    } else if (beJavaChanged.length) {
      const javaFiles = walk(JAVA_ROOT, ['.java'], new Set(['target']))
      const graph = buildBackendGraph(javaFiles)
      const { selected, exploded } = backendAffectedTests(beChanged, graph, javaFiles)
      const allTests = javaFiles.filter(
        (f) => f.startsWith(`${JAVA_ROOT}/test/java/`) && /Test\.java$/.test(f),
      )
      if (exploded || (allTests.length && selected.size / allTests.length > opts.escalateRatio)) {
        result.backend.full = true
        result.escalate.push({
          side: 'backend',
          files: [],
          why: exploded
            ? '后端依赖扩散失控（被大量文件引用，如 entity/util）'
            : `影响域覆盖 ${selected.size}/${allTests.length} 个测试类，超过阈值`,
        })
      } else if (!selected.size) {
        result.backend.skipped = '影响域内无测试用例（仅做 compile）'
        result.backend.tests = []
      } else {
        result.backend.skipped = null
        result.backend.tests = [...selected].sort()
      }
    } else {
      result.backend.skipped = beChanged.length ? '后端仅非 Java 文件变更' : '无后端改动'
    }
  }

  // ── 推荐命令（kind 用于 --lint-only 过滤）──
  const push = (kind, cmd) => result.commands.push({ kind, cmd })
  const srcLint = changed.filter((f) => /^src\/.+\.(ts|tsx|js)$/.test(f))
  const toolLint = changed.filter((f) => /^scripts\/.+\.(mjs|js|ts)$/.test(f))
  result.lintTargets = [...srcLint, ...toolLint]
  if (!opts.skipLint) {
    // 变更文件过多时命令行会超长，且成本已接近全量，直接走 npm run lint
    if (srcLint.length > 30) push('lint', 'npm run lint')
    else if (srcLint.length) push('lint', `npx eslint ${srcLint.join(' ')}`)
    if (toolLint.length) push('lint', `npx eslint ${toolLint.join(' ')}`)
  }
  if (!opts.skipTypecheck && (feChanged.length || cls.feGlobal.length)) {
    push('lint', 'npx tsc --noEmit')
  }
  if (result.frontend.full) {
    push('test', 'npm run test:run')
  } else if (result.frontend.tests.length) {
    push('test', `npx vitest run ${result.frontend.tests.join(' ')}`)
  }
  if (!opts.frontendOnly && !opts.skipBackend) {
    const beJavaChanged = beChanged.filter((f) => f.endsWith('.java'))
    if (beJavaChanged.length || cls.beGlobal.length || cls.bothGlobal.length) {
      if (result.backend.full) {
        push('test', 'cd backend && mvn test -B')
      } else if (result.backend.tests.length) {
        const simpleNames = result.backend.tests.map((f) => path.basename(f, '.java'))
        push(
          'test',
          `cd backend && mvn test -B -Dtest='${simpleNames.join(',')}' -Dsurefire.failIfNoSpecifiedTests=false`,
        )
      } else if (beJavaChanged.length) {
        push('test', 'cd backend && mvn compile -q')
      }
    }
  }

  output(result)
  if (opts.run) runCommands(result)
}

function output(result) {
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2))
    return
  }
  const line = (s) => console.log(s)
  line(`\n── 影响域分析（base: ${result.base}，变更 ${result.changedCount} 个文件）──`)
  if (result.message) {
    line(result.message)
    return
  }
  if (result.escalate.length) {
    line('⚠️  升档为全量的原因：')
    for (const e of result.escalate) {
      const files = e.files.slice(0, 6).join(', ') + (e.files.length > 6 ? ` …(+${e.files.length - 6})` : '')
      line(`   · [${e.side}] ${e.why}${files ? `\n     命中: ${files}` : ''}`)
    }
  }
  if (!opts.skipLint) {
    line(`\n前端 Lint：${result.lintTargets.length ? `${result.lintTargets.length} 个变更文件` : '无 js/ts 变更'}`)
  }
  if (result.frontend.full) {
    line(`前端测试：FULL（全量 vitest）`)
  } else if (result.frontend.skipped) {
    line(`前端测试：跳过 —— ${result.frontend.skipped}`)
  } else {
    line(`前端测试：影响域 ${result.frontend.tests.length} 个文件`)
    for (const t of result.frontend.tests) line(`   · ${t}`)
  }
  if (result.backend.full) {
    line(`后端测试：FULL（mvn test -B）`)
  } else if (result.backend.skipped) {
    line(`后端测试：跳过 —— ${result.backend.skipped}`)
  } else {
    line(`后端测试：影响域 ${result.backend.tests.length} 个测试类`)
    for (const t of result.backend.tests) line(`   · ${path.basename(t)}`)
  }
  line('\n推荐命令：')
  if (!result.commands.length) line('   （无需执行测试，仅编辑期检查）')
  for (const c of result.commands) line(`   $ ${c.cmd}`)
}

function runCommands(result) {
  const kinds = opts.lintOnly ? new Set(['lint']) : new Set(['lint', 'test'])
  const commands = result.commands.filter((c) => kinds.has(c.kind)).map((c) => c.cmd)
  if (!commands.length) {
    console.log('\n影响域内无需执行的检查命令。')
    return
  }
  const { env, mvn } = resolveMavenEnv()
  for (const cmd of commands) {
    let actual = cmd
    if (actual.includes('mvn ')) {
      if (!mvn) {
        console.error('\n❌ 未找到 mvn，请安装 Maven 或指定 PATH（后端检查无法自动执行）')
        process.exit(1)
      }
      if (mvn !== 'mvn') actual = actual.replace(/\bmvn /, `${mvn} `)
    }
    console.log(`\n══════ $ ${actual} ══════`)
    try {
      execFileSync('bash', ['-lc', actual], { cwd: ROOT, stdio: 'inherit', env })
    } catch {
      console.error(`\n❌ 命令失败：${cmd}`)
      process.exit(1)
    }
  }
}

main()
