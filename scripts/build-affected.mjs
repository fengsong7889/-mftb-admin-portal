#!/usr/bin/env node
/**
 * 按系统/按影响域的构建与启动入口（方案 §4.3 拟提供的命令接口）。
 *
 *   npm run build:affected [-- --run]                 只构建受影响的一侧（前端产物 / 后端 JAR）
 *   npm run build:system   -- --system rdm [-- --run] 构建指定系统（该系统尚未独立时会明确拒绝）
 *   npm run dev:system     -- --system rdm            启动指定系统所需的前端 + 后端 + 场景依赖
 *
 * 为什么要有「明确拒绝」这条路径：本期后端仍是单个部署单元、前端仍是单站点产物（方案 §一）。
 * 如果 `build:system -- --system ads` 在应用尚未建立时悄悄退化成「构建整个前端」，
 * 使用者就会以为已经在按系统构建 —— 这正是方案 §三 要求避免的「把移动目录当成拆分完成」。
 * 因此这里以 engineering/systems.json 的 isolation 状态为准：未 isolated 一律拒绝并说明缺什么。
 *
 * 命令一律以参数数组执行，不把系统名/文件名拼进 shell。
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { classify } from './lib/impact-graph.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const REGISTRY = path.join(ROOT, 'engineering', 'systems.json')

const argv = process.argv.slice(2)
const flag = (name) => argv.includes(`--${name}`)
const valueOf = (name, fallback = '') => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback
}

const opts = {
  run: flag('run'),
  system: valueOf('system'),
  side: valueOf('side', 'auto'),
  dev: flag('dev-mode'),
}

function git(args) {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' })
  } catch {
    return ''
  }
}

/** 与 affected-tests 同口径的变更集：工作区 + 暂存区 + 未跟踪 */
function changedFiles() {
  const set = new Set()
  for (const line of git(['diff', '--name-only', 'HEAD']).split('\n')) if (line.trim()) set.add(line.trim())
  for (const line of git(['ls-files', '--others', '--exclude-standard']).split('\n')) if (line.trim()) set.add(line.trim())
  return [...set]
}

function readRegistry() {
  if (!fs.existsSync(REGISTRY)) {
    throw new Error(`缺少 engineering/systems.json，请先执行：python3 engineering/generate-systems.py`)
  }
  return JSON.parse(fs.readFileSync(REGISTRY, 'utf8'))
}

/** 解析出本次要构建的范围 */
function resolveScope(changed) {
  const cls = classify(changed)
  const feTouched = changed.some((f) => f.startsWith('src/')) || Boolean(cls.feGlobal.length)
  const beTouched = changed.some((f) => f.startsWith('backend/')) || Boolean(cls.beGlobal.length)
  // 工程脚本 / CI / 规则变更：两侧都可能受影响，保守按 both
  const bothForced = Boolean(cls.bothGlobal.length)
  return {
    frontend: feTouched || bothForced,
    backend: beTouched || bothForced,
    reasons: {
      frontend: feTouched ? 'src/ 有变更' : bothForced ? '工程脚本/CI 变更（保守按全侧）' : '无',
      backend: beTouched ? 'backend/ 有变更' : bothForced ? '工程脚本/CI 变更（保守按全侧）' : '无',
    },
  }
}

/** 指定系统的构建命令；未独立则抛错（拒绝伪装） */
function systemCommands(registry, code, side) {
  const sys = registry.systems?.[code]
  if (!sys) {
    throw new Error(`系统 ${code} 不在 engineering/systems.json 中；可选：${Object.keys(registry.systems ?? {}).join(', ')}`)
  }
  const cmds = []
  const feIsolated = sys.isolation?.frontend === 'isolated'
  const beIsolated = sys.isolation?.backend === 'isolated'
  if (side !== 'backend') {
    if (!feIsolated) {
      throw new Error(
        `${code} 前端尚未建立独立工程（isolation=${sys.isolation?.frontend ?? 'pending'}）。` +
        `缺：${sys.planned?.frontendApp ?? `frontend/apps/${code}`}/package.json + tsconfig.json。` +
        `本期请按 npm run build:affected 构建单站点产物，不要伪装成按系统构建。`,
      )
    }
    // 应用壳（index.html/main.tsx）仍在 legacy，按应用独立打包待壳拆分切片；
    // 现阶段的「按系统构建」= 该应用自己的类型检查，保证不拉入无关应用源码
    cmds.push({ argv: ['npm', 'run', 'typecheck', '--workspace', sys.planned.frontendApp], cwd: ROOT })
  }
  if (side !== 'frontend') {
    if (!beIsolated) {
      throw new Error(
        `${code} 后端尚未拆成独立 Maven 模块（isolation=${sys.isolation?.backend ?? 'pending'}）。` +
        `缺：${sys.planned?.backendModule ?? `backend/modules/${code}`}/pom.xml。` +
        `本期后端仍是单体 JAR，构建范围只能是整包。`,
      )
    }
    cmds.push({
      argv: ['mvn', '-o', '-B', '-pl', path.relative('backend', sys.planned.backendModule), '-am', 'package', '-DskipTests'],
      cwd: path.join(ROOT, 'backend'),
    })
  }
  return cmds
}

function execute(cmds, display) {
  console.log(`\n${display}`)
  for (const c of cmds) {
    const shown = `${c.cwd === ROOT ? '' : `cd ${path.relative(ROOT, c.cwd) || '.'} && `}${c.argv.join(' ')}`
    if (!opts.run) {
      console.log(`   [dry-run] $ ${shown}`)
      continue
    }
    console.log(`   $ ${shown}`)
    execFileSync(c.argv[0], c.argv.slice(1), { cwd: c.cwd, stdio: 'inherit' })
  }
  if (!opts.run) console.log('   （加 -- --run 才会真正执行）')
}

function main() {
  const registry = readRegistry()

  if (opts.system) {
    if (opts.dev) {
      // dev:system 同样受 isolation 约束；本期后端仍是单体，所以“启动依赖”就是整包 JAR
      systemCommands(registry, opts.system, 'frontend')
      const app = registry.systems[opts.system].planned?.frontendApp ?? `frontend/apps/${opts.system}`
      execute(
        [{ argv: ['npm', 'run', 'dev', '--workspace', app], cwd: ROOT }],
        `── 按系统启动：${opts.system} ──\n   后端依赖：本期为单体 mftb-admin.jar（本地用 npm run restart:backend 启动）`,
      )
      return
    }
    const cmds = systemCommands(registry, opts.system, opts.side)
    execute(cmds, `── 按系统构建/启动：${opts.system}（side=${opts.side}）──`)
    return
  }

  const changed = changedFiles()
  if (!changed.length) {
    console.log('没有检测到变更文件，无需构建。')
    return
  }
  const scope = resolveScope(changed)
  const cmds = []
  if (scope.frontend && opts.side !== 'backend') {
    cmds.push({ argv: ['npm', 'run', 'build'], cwd: ROOT })
  }
  if (scope.backend && opts.side !== 'frontend') {
    cmds.push({ argv: ['mvn', '-o', '-B', 'package', '-DskipTests'], cwd: path.join(ROOT, 'backend') })
  }
  if (!cmds.length) {
    console.log('本次变更不涉及前端或后端产物（仅文档/规则），无需构建。')
    return
  }
  execute(
    cmds,
    `── 影响域构建（变更 ${changed.length} 个文件）──\n   前端：${scope.frontend ? scope.reasons.frontend : '跳过'}\n   后端：${scope.backend ? scope.reasons.backend : '跳过'}`,
  )
}

try {
  main()
} catch (err) {
  console.error(`❌ ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
}
