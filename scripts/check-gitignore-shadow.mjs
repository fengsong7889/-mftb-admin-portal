#!/usr/bin/env node
/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

/**
 * gitignore 遮蔽与本地凭据副本门禁
 *
 * 防的是两类「配置被静默削弱」，它们都不会让任何测试变红：
 *
 * G1 已跟踪文件被忽略规则遮蔽。有人为了省事把规则写宽（例如 `.env.local.*` 却没配
 *    反向例外），入库模板 `backend/.env.local.example` 就会同时被遮蔽：`git status`
 *    不再提示它的改动，新协作者 `git add` 它会被静默忽略。仓库里已有别人的成果被
 *    隐藏，比漏一个文件严重得多。
 *
 * G2 未忽略的本地凭据副本。本仓库是公开仓，`backend/.env.local` 里有 DB 口令与
 *    JWT 密钥；2026-11-06 实测有人手工 `cp .env.local .env.local.bak-<日期>` 做备份，
 *    该副本不匹配任何忽略规则，直接落进未跟踪列表，而并发会话习惯 `git add -A`。
 *    凭据一旦进了公开仓的历史，就只能按「轮换/作废优先于清洗历史」的口径处置。
 *
 * 与 secret-scan 的分工：secret-scan 查「已入库文件里的硬编码凭据」，本门禁查
 * 「还没入库、但随时会被扫进去的本地文件」，以及「入库文件被新规则挡在视野外」。
 *
 * ⚠ 仓库根取「git 解析出的 worktree 顶层」，不用 __dirname 反推：
 *   - 在 git worktree 里执行时，顶层就是自己那棵树（scripts/*.mjs 用 __dirname/.. 的写法会指回主检出目录）；
 *   - 在仓库子目录（如 backend/）执行时，也必须审整仓而不是子集——这是全仓门禁的基本语义。
 *
 * 用法：
 *   node scripts/check-gitignore-shadow.mjs          # 全量检查
 *   node scripts/check-gitignore-shadow.mjs --json   # 机器可读输出
 *
 * 退出码：0 = 通过；1 = 存在违规；2 = 无法执行（不在 git 仓库内或 git 不可用）。
 *   2 与 0 必须可区分：本仓库实踩过「工具匹配到 0 项仍然报通过」，静默的空跑比报错更险。
 */
import { execFileSync } from 'node:child_process'

const JSON_MODE = process.argv.includes('--json')

/**
 * 一看就是「本地凭据载体」的文件名形态。只用于未跟踪文件，命中后还必须真的被忽略，
 * 否则判失败。刻意不收 `*.md`：docs/ 下有凭据操作规程文档，它是正常入库资产。
 */
const LOCAL_SECRET_PATTERNS = [
  { why: '.env 本地变量的任何变体（含备份/改名）', re: /(^|\/)\.env[^/]*\.local/i },
  { why: '通用备份/编辑器交换产物', re: /(\.bak|\.bak-[\w-]+|\.backup|\.save|\.old|\.orig|\.rej|~)$/i },
  { why: '私钥/证书/密钥库', re: /(\.pem|\.p12|\.pfx|\.keystore|\.jks)$/i },
  { why: 'SSH 私钥与服务账号文件', re: /(^|\/)(id_rsa|id_ed25519|service-account.*\.json|kubeconfig.*)$/i },
]

/** 先取仓库顶层作为 ROOT；未解析成功前不能执行任何判据，所以单独保留 cwd */
let ROOT = process.cwd()

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}

/** git check-ignore 对「未被忽略」返回退出码 1，execFileSync 会抛错，统一转成布尔 */
function isIgnored(file) {
  try {
    git(['check-ignore', '-q', file])
    return true
  } catch {
    return false
  }
}

function inRepo() {
  try {
    return git(['rev-parse', '--is-inside-work-tree']).trim() === 'true'
  } catch {
    return false
  }
}

/** G1：已跟踪但同时被忽略规则遮蔽的文件 */
function shadowedTracked() {
  const out = git(['ls-files', '--ignored', '--cache', '--exclude-standard']).trim()
  return out ? out.split('\n') : []
}

/** G2：未跟踪文件里命中本地凭据形态、却没有被忽略的那些 */
function exposedLocalSecrets() {
  const out = git(['status', '--porcelain', '--untracked-files=all']).split('\n')
  const hits = []
  for (const line of out) {
    if (!line.startsWith('?? ')) continue
    const file = line.slice(3).trim().replace(/^"|"$/g, '')
    const matched = LOCAL_SECRET_PATTERNS.filter((p) => p.re.test(file))
    if (!matched.length) continue
    if (isIgnored(file)) continue
    hits.push({ file, reasons: [...new Set(matched.map((p) => p.why))] })
  }
  return hits
}

function main() {
  if (!inRepo()) {
    const msg = '不在 git 仓库内，本门禁无法执行（判为 2，不判为通过）'
    if (JSON_MODE) console.log(JSON.stringify({ ok: false, error: msg }, null, 2))
    else console.error(`❌ ${msg}`)
    process.exit(2)
  }
  // 跳到 worktree 顶层：在子目录执行时不能只审子集，否则主仓里的违规会全部逸出
  ROOT = git(['rev-parse', '--show-toplevel']).trim()

  const shadowed = shadowedTracked()
  const exposed = exposedLocalSecrets()

  // 自检：两条判据都真的跑起来了（命令失配 / 解析规则写错时会双双返回空，看着像绿灯）
  const trackedCount = Number(git(['ls-files']).split('\n').filter(Boolean).length)
  if (!Number.isFinite(trackedCount) || trackedCount === 0) {
    console.error('❌ git ls-files 取到 0 个跟踪文件，判定测量链路本身失效（exit 2）')
    process.exit(2)
  }

  const failures = [
    ...shadowed.map((f) => `G1 已跟踪文件被忽略规则遮蔽：${f} —— 它的后续改动不会再出现在 git status 里。`),
    ...exposed.map(
      (h) =>
        `G2 本地凭据副本未被忽略：${h.file}（${h.reasons.join('；')}）—— ` +
        `公开仓里随时会被 git add -A 扫进提交，请先补 .gitignore 或直接删除副本。`,
    ),
  ]

  if (JSON_MODE) {
    console.log(JSON.stringify({ ok: !failures.length, trackedCount, shadowed, exposed, failures }, null, 2))
  } else if (failures.length) {
    console.error(`❌ gitignore 遮蔽/凭据副本检查失败（${failures.length} 项，已跟踪文件 ${trackedCount} 个）：`)
    for (const f of failures) console.error(`   ${f}`)
    console.error('   修复方式：只加宽「忽略」，不要改判定；入库模板必须配 !例外规则（gitignore 后匹配优先）。')
  } else {
    console.log(`✅ 无已跟踪文件被忽略规则遮蔽，无未忽略的本地凭据副本（已跟踪文件 ${trackedCount} 个）`)
  }
  process.exit(failures.length ? 1 : 0)
}

main()
