// @vitest-environment node
/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

/**
 * check-gitignore-shadow.mjs 的端到端用例。
 *
 * 为什么开临时 git 仓库而不是拿真仓断言：本门禁的两条判据都读 git 实时状态，
 * 真仓里既不能制造「已跟踪却被遮蔽」的文件，也不该为了测试往工作区丢凭据副本。
 * 临时仓库是独立 git 目录，与被测逻辑完全等价，且不会污染并发会话共用的主检出。
 *
 * 变异验证设计（关键）：G2 的「失败组」和「通过组」只差 .gitignore 里那一行规则，
 * 文件名一字不变。若判据其实只看文件名，通过组就会一起变红，本用例当场暴露它。
 *
 * 临时目录落在 .qoder/temp（已被 `.qoder/*` 忽略）而不是 os.tmpdir()：
 * 本机沙箱常禁止工作区外写入，放 /tmp 会让用例在本地必然失败（环境伪影，不是缺陷）。
 * 例外：「不在 git 仓库内」那条必须用 os.tmpdir() —— .qoder/temp 本身就在主仓工作树内，
 * 在它下面建的目录对 git 来说仍是仓库子目录，根本测不出「非仓库」分支（实跑踩过）。
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SCRIPT = path.join(HERE, 'check-gitignore-shadow.mjs')
const SANDBOX_ROOT = path.resolve(HERE, '..', '.qoder', 'temp')

let repo = ''

function git(args, cwd = repo) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' })
}

function write(rel, text) {
  const abs = path.join(repo, rel)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, text, 'utf8')
}

function run(cwd = repo) {
  try {
    const out = execFileSync(process.execPath, [SCRIPT], { cwd, encoding: 'utf8', stdio: 'pipe' })
    return { code: 0, text: out }
  } catch (e) {
    return { code: e.status, text: `${e.stdout || ''}${e.stderr || ''}` }
  }
}

function initRepo() {
  fs.mkdirSync(SANDBOX_ROOT, { recursive: true })
  repo = fs.mkdtempSync(path.join(SANDBOX_ROOT, 'gate-selftest-'))
  git(['init', '-q'])
  git(['config', 'user.email', 'gate@test.local'])
  git(['config', 'user.name', 'gate'])
  // 关掉全局/仓库外忽略文件的干扰，保证判据只来自本仓库的 .gitignore
  git(['config', 'core.excludesFile', '/dev/null'])
}

function commitAll(msg = 'chore: fixture') {
  git(['add', '-A'])
  git(['commit', '-q', '-m', msg])
}

beforeEach(() => initRepo())
afterEach(() => {
  if (repo) fs.rmSync(repo, { recursive: true, force: true })
})

describe('check-gitignore-shadow', () => {
  it('自检：夹具本身必须能被 git 正常识别，否则所有断言都是空比对', () => {
    write('README.md', 'x\n')
    commitAll()
    expect(Number(git(['ls-files']).split('\n').filter(Boolean).length)).toBeGreaterThanOrEqual(1)
  })

  it('干净仓库（模板已跟踪 + 备份已忽略）应通过', () => {
    write('.gitignore', '.env.local\n.env.local.*\n!.env.local.example\n*.bak\n*.bak*\n')
    write('backend/.env.local.example', 'DB_URL=\n')
    write('backend/.env.local', 'DB_URL=jdbc:mysql://h:3306/d\nDB_PASSWORD=secret\n')
    commitAll()
    write('backend/.env.local.bak-20261106', 'DB_PASSWORD=secret\n')
    const r = run()
    expect(r.text).toContain('✅')
    expect(r.code).toBe(0)
  })

  it('G2：备份副本存在但没被任何规则忽略 → 必须失败并点名该文件', () => {
    write('.gitignore', '.env.local\n')
    write('backend/.env.local.example', 'DB_URL=\n')
    commitAll()
    write('backend/.env.local.bak-20261106', 'DB_PASSWORD=secret\n')
    const r = run()
    expect(r.code).toBe(1)
    expect(r.text).toContain('backend/.env.local.bak-20261106')
    expect(r.text).toContain('G2')
  })

  it('G2 变异对照：同一个文件名，只加一行忽略规则就必须转绿', () => {
    write('.gitignore', '.env.local\n.env.local.*\n!.env.local.example\n')
    write('backend/.env.local.example', 'DB_URL=\n')
    commitAll()
    write('backend/.env.local.bak-20261106', 'DB_PASSWORD=secret\n')
    const before = run()
    expect(before.code).toBe(0)
    // 再把规则删掉（保留例外行不影响），同一个文件必须立刻判红：证明判据真的来自规则
    write('.gitignore', '.env.local\n')
    expect(run().code).toBe(1)
  })

  it('G2：无后缀备份（.bak / 编辑器交换产物 ~）未忽略同样失败', () => {
    write('.gitignore', '.env.local\n')
    write('run-local.sh', 'echo hi\n')
    commitAll()
    write('run-local.sh.bak', 'DB_PASSWORD=secret\n')
    write('run-local.sh~', 'DB_PASSWORD=secret\n')
    const r = run()
    expect(r.code).toBe(1)
    expect(r.text).toContain('run-local.sh.bak')
    expect(r.text).toContain('run-local.sh~')
  })

  it('G1：忽略规则写宽把已跟踪模板一起遮蔽 → 必须失败', () => {
    // 先按正确规则把模板提交进去
    write('.gitignore', '.env.local\n')
    write('backend/.env.local.example', 'DB_URL=\n')
    commitAll()
    // 再有人加宽成 .env.local.* 且忘配例外：模板被静默遮蔽
    write('.gitignore', '.env.local\n.env.local.*\n')
    const r = run()
    expect(r.code).toBe(1)
    expect(r.text).toContain('G1')
    expect(r.text).toContain('backend/.env.local.example')
  })

  it('G1 变异对照：补上例外规则即转绿（证明卡的是规则组合而不是文件名）', () => {
    write('.gitignore', '.env.local\n')
    write('backend/.env.local.example', 'DB_URL=\n')
    commitAll()
    write('.gitignore', '.env.local\n.env.local.*\n!.env.local.example\n')
    expect(run().code).toBe(0)
  })

  it('非 git 目录必须退出 2，不能伪装成通过', () => {
    // 必须开在工作区外：建在 .qoder/temp 里会被主仓 git 视为仓库子目录，测不到这个分支
    const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-plain-'))
    try {
      const r = run(plain)
      expect(r.code).toBe(2)
      expect(r.text).toContain('无法执行')
    } finally {
      fs.rmSync(plain, { recursive: true, force: true })
    }
  })

  it('已 init 但没有任何提交（空仓库）同样退出 2，不许报绿灯', () => {
    write('.gitignore', '.env.local\n')
    const r = run()
    expect(r.code).toBe(2)
    expect(r.text).toContain('0 个跟踪文件')
  })

  it('在仓库子目录执行也必须审整仓（全仓门禁语义，不是子集）', () => {
    write('.gitignore', '.env.local\n')
    write('backend/.env.local.example', 'DB_URL=\n')
    commitAll()
    // 违规文件在 backend/ 下；从 backend/ 跑不能因为「只看当前目录」而漏掉
    write('backend/.env.local.bak-20261106', 'DB_PASSWORD=secret\n')
    expect(run(path.join(repo, 'backend')).code).toBe(1)
  })

  it('--json 输出可被机器消费（供后续编排使用）', () => {
    write('.gitignore', '.env.local\n')
    write('a.txt', 'x\n')
    commitAll()
    const out = execFileSync(process.execPath, [SCRIPT, '--json'], { cwd: repo, encoding: 'utf8' })
    const parsed = JSON.parse(out)
    expect(parsed.ok).toBe(true)
    expect(parsed.trackedCount).toBeGreaterThanOrEqual(1)
    expect(parsed.shadowed).toEqual([])
  })
})
