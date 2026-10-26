import { execFileSync } from 'child_process'
import type { Plugin } from 'vite'

/**
 * 版本检测（构建元信息）插件。
 *
 * 为什么不再是「构建时写文件」：原实现把 version.json 写进 `public/`、把 build-meta.ts 写进 `src/`，
 * 造成三个问题——① 构建污染受版本控制的工作区（`scripts/affected-tests.mjs` 把 `src/build-meta`
 * 归为共享层，任何一次构建都会把验证档位推到全量）；② 多应用并行构建互相覆盖；
 * ③ 版本信息与产物分离，无法按应用区分。改为虚拟模块 + 产物资产后，源码目录零写入。
 */

/** 版本元信息虚拟模块 ID：应用侧 import 该 ID，构建期注入，不落盘 */
export const BUILD_META_ID = 'virtual:build-meta'

/** Vite 约定：自定义解析的模块加 \0 前缀，避免被其它插件当真实文件处理 */
const RESOLVED_BUILD_META_ID = `\0${BUILD_META_ID}`

/** 构建时间戳：虚拟模块与 version.json 共用同一值，确保前端对比一致 */
const BUILD_TIME = new Date().toISOString()

/** 随版本下发的提交日志条数：再多会淹没更新弹窗里的说明文字 */
const CHANGELOG_LIMIT = 10

/**
 * git --pretty 输出的字段分隔符（US, 0x1f）。
 * 用 fromCharCode 构造而非内联控制字符：控制字符写进源码文件容易被编辑器/工具链吞掉，
 * 造成字符串未闭合的语法错误（本文件曾踩过一次）。
 */
const RECORD_SEP = String.fromCharCode(0x1f)

/** 当前提交短哈希；非 git 环境回落 unknown（与旧实现一致，不阻断构建） */
function readCommitHash(): string {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim() || 'unknown'
  } catch {
    return 'unknown'
  }
}

/**
 * 读取最近提交日志（短哈希 + 标题），供版本更新弹窗展示「本次更新内容」。
 * 非 git 环境或 CI 浅克隆只拿到部分历史时返回可用部分，不得阻断构建。
 */
function readRecentCommits(limit = CHANGELOG_LIMIT): Array<{ hash: string; subject: string }> {
  try {
    // %x1f 由 git 侧展开成分隔符，避免提交标题里出现竖线等字符时解析错位
    const output = execFileSync(
      'git',
      ['log', `-n${limit}`, '--pretty=format:%h%x1f%s'],
      { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' },
    )
    return output
      .split('\n')
      .map((line) => {
        const [hash = '', ...rest] = line.split(RECORD_SEP)
        return { hash: hash.trim(), subject: rest.join(RECORD_SEP).trim() }
      })
      .filter((item) => Boolean(item.hash && item.subject))
  } catch {
    return []
  }
}

/** version.json 内容：公开静态产物，字段形状与前端 useVersionCheck 的解析保持兼容 */
export function buildMetaJson(commitHash: string): string {
  return JSON.stringify(
    { buildTime: BUILD_TIME, commitHash, changes: readRecentCommits() },
    null,
    2,
  )
}

/**
 * 插件本体：
 * 1. `virtual:build-meta` —— 应用直接 import 取得构建期 buildTime/commitHash（不落盘源码）
 * 2. `version.json` —— 构建时作为资产写入产物目录；开发时由中间件提供同一内容
 */
export function buildMetaPlugin(): Plugin {
  const commitHash = readCommitHash()
  const metaSource =
    `// Injected at build time by buildMetaPlugin (virtual module) — no source-tree file is written.\n` +
    `export const BUILD_TIME = '${BUILD_TIME}'\n` +
    `export const COMMIT_HASH = '${commitHash}'\n`

  return {
    name: 'build-meta',
    resolveId(id) {
      return id === BUILD_META_ID ? RESOLVED_BUILD_META_ID : null
    },
    load(id) {
      return id === RESOLVED_BUILD_META_ID ? metaSource : null
    },
    configureServer(server) {
      // 开发期不写 public/version.json：请求由中间件即时生成，避免构建污染工作区
      server.middlewares.use('/version.json', (_req, res) => {
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Cache-Control', 'no-store')
        res.end(buildMetaJson(commitHash))
      })
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: buildMetaJson(commitHash) })
    },
  }
}
