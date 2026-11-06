// @vitest-environment node
/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

/**
 * 前端 CI 门禁清单守卫（`.github/workflows/deploy.yml`）。
 *
 * 为什么需要它：deploy.yml 是「CI 必过哪些门禁」的唯一真源，而 **CI 自身发现不了少跑了一道门禁**——
 * 删掉一行 `- name: Theme Tokens` 之后流水线照样全绿，部署照常出去。这类「配置被静默削弱」
 * 与本仓库反复强调的「不得删测试换绿灯」「排除只能防工具、基线同时防人和工具」是同一问题，
 * 所以把它写成测试而不是靠人记住。
 *
 * 不用 YAML 库解析：`js-yaml` / `yaml` 都不是本项目的**声明依赖**（只是别的包的传递依赖），
 * 任何一次 `npm ci` 都可能让它们消失或改版本，拿它当门禁依赖等于埋一颗雷。
 * 这里只按固定缩进取步骤名与少量结构特征，够用且零依赖。
 *
 * ⚠ 解析结果为空必须判失败：本项目实踩过「正则匹配到 0 项、门禁看起来是绿的但其实什么都没比对」，
 *   那比写错更险。因此每条断言前都有一道「至少解析出 N 个步骤」的自检。
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const WORKFLOW = resolve(dirname(fileURLToPath(import.meta.url)), '../../.github/workflows/deploy.yml')

/** CI 必须执行的步骤，顺序敏感：新增门禁请同时把它加进本清单 */
const REQUIRED_STEPS = [
  'Lint',
  'Resolve type-check heap',
  'Type Check',
  'Menu Consistency',
  'Dependency Boundary',
  'Engineering Registry',
  'Regression Gates (§6)',
  'App Route Inventory',
  'Stat Card Order',
  'Confirm Modal Style',
  'Theme Tokens',
  'Half-Pair Audit',
  'i18n Coverage',
  'i18n Fallback Copy',
  'i18n zh-CN Static Bundle',
  'i18n Backend Mirror',
  'Ignore Shadow Guard',
  'Secret Scan',
  'Test',
]

/** 构建/发布步骤：所有门禁都必须排在它们之前，否则等于「先上线再检查」 */
const RELEASE_STEPS = ['Build', 'Site assembly manifest', 'Site assembly check', 'Upload Pages artifact']

/** 取 build job 内的步骤名（`- name:` 固定 6 空格缩进） */
function stepNames(text) {
  return [...text.matchAll(/^ {6}- name:\s*(.+)$/gm)].map((m) => m[1].trim())
}

/**
 * 按步骤切块，收每块里出现过的 `npm run <命令>`。
 * 两个细节都是实跑坑出来的：
 * 1. 必须按块而不是按行：Type Check 用的是 `run: |` 多行块，命令不在 `run:` 那一行上；
 * 2. 不用 `split(正则)` 切块：同一份文本里 `matchAll(/^ {6}- name:/gm)` 能命中 23 处，
 *    而 `split(/^ {6}- (?=.+)$/m)` 命中 0 处——切块失效会退化成「空集合 = 空集合」的假绿灯。
 *    改成按命中下标切片，并天然保证与 stepNames() 同序同数。
 * 3. 必须先剥掉注释行：本文件大量注释会引用其它命令名（「与本地 npm run verify 同序」、
 *    「不再走 build:strict」），把它们当执行命令会让双向比对假红。
 */
function stepsWithCommands(text) {
  const starts = [...text.matchAll(/^ {6}- name:\s*(.+)$/gm)]
  return starts.map((m, i) => {
    const end = i + 1 < starts.length ? starts[i + 1].index : text.length
    const body = text
      .slice(m.index, end)
      .split('\n')
      .filter((line) => !line.trim().startsWith('#'))
      .join('\n')
    return {
      name: m[1].trim(),
      cmds: [...body.matchAll(/npm run ([a-zA-Z0-9:_-]+)/g)].map((c) => c[1]),
    }
  })
}

/** 本地 `npm run verify` 里声明的门禁命令（唯一另一份「跑哪些门禁」的真源） */
function verifyCommands(verifyScript) {
  return [...new Set([...verifyScript.matchAll(/npm run ([a-zA-Z0-9:_-]+)/g)].map((m) => m[1]))]
}

function readVerifyScript() {
  const pkg = JSON.parse(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../package.json'), 'utf8'))
  return pkg.scripts.verify || ''
}

/**
 * 双向比对：CI「发布前的门禁步骤」跟本地 verify 必须跑同一套命令。
 * 抽成纯函数是为了能拿「内存里改过的副本」做变异验证：本仓的 package.json / deploy.yml
 * 是多会话共用的热文件，不应为了验一次判据而真去改它们（改动窗口里被并发
 * `git add -A` 扫走就是坏 main）。
 */
function gateDiff(workflowText, verifyScript) {
  const names = stepNames(workflowText)
  const steps = stepsWithCommands(workflowText)
  if (steps.length !== names.length) throw new Error(`CI 步骤解析不一致：names=${names.length}, steps=${steps.length}`)
  const releaseIdx = RELEASE_STEPS.map((s) => names.indexOf(s)).filter((i) => i >= 0)
  if (!releaseIdx.length) throw new Error('未解析出任何发布步骤，切块边界不可信')
  const ci = new Set([...new Set(steps.slice(0, Math.min(...releaseIdx)).flatMap((s) => s.cmds))])
  const local = new Set(verifyCommands(verifyScript))
  return {
    ciCount: ci.size,
    localCount: local.size,
    missingInCi: [...local].filter((c) => !ci.has(c)),
    missingInLocal: [...ci].filter((c) => !local.has(c)),
  }
}

const raw = readFileSync(WORKFLOW, 'utf8')
const names = stepNames(raw)

describe('deploy.yml 门禁清单守卫', () => {
  it('自检：必须真的解析出步骤，否则后面所有断言都是空比对', () => {
    // 阈值取 REQUIRED + RELEASE 的总数，防止解析规则失配时静默通过
    expect(names.length).toBeGreaterThanOrEqual(REQUIRED_STEPS.length + RELEASE_STEPS.length)
  })

  it.each(REQUIRED_STEPS)('门禁步骤「%s」仍在 CI 中', (step) => {
    expect(names).toContain(step)
  })

  it('门禁步骤保持既有相对顺序（防止被挪到构建/发布之后）', () => {
    const idx = REQUIRED_STEPS.map((s) => names.indexOf(s))
    expect(idx.includes(-1)).toBe(false)
    expect(idx).toEqual([...idx].sort((a, b) => a - b))
  })

  it.each(RELEASE_STEPS)('所有门禁都排在「%s」之前', (releaseStep) => {
    const rIdx = names.indexOf(releaseStep)
    expect(rIdx).toBeGreaterThanOrEqual(0)
    for (const s of REQUIRED_STEPS) expect(names.indexOf(s)).toBeLessThan(rIdx)
  })

  // 双向防复发：上面只能发现「清单里写的步骤被删了」，发现不了
  // 「本地 verify 加了一道门禁、CI 忘加」——那正是 REQUIRED_STEPS 自己会跟进失配的地方
  // （2026-11-06 拉取 a71cc774 时就撞见两道新 i18n 门禁在 CI 里、却没进本清单）。
  it('本地 verify 与 CI 门禁步骤的命令集合必须一致（双向）', () => {
    const d = gateDiff(raw, readVerifyScript())
    // 自检：解析真的有效，否则两条集合比对会退化成「空 = 相等」的假绿灯
    expect(d.ciCount).toBeGreaterThanOrEqual(REQUIRED_STEPS.length - 1)
    expect(d.localCount).toBeGreaterThanOrEqual(REQUIRED_STEPS.length - 1)
    expect(d.missingInCi, `这些门禁在本地 verify 里有、CI 却没跑：${d.missingInCi.join(', ')}`).toEqual([])
    expect(d.missingInLocal, `这些门禁 CI 跑了、本地 verify 漏了：${d.missingInLocal.join(', ')}`).toEqual([])
  })

  // 下面两条是常驻的变异验证：只删 CI 那一行步骤 / 只删 verify 里那一段命令，
  // 两个方向都必须各自判红，而且只对应方向报错。没这两条，上面的双向比对等于没测过：
  // 集合方向写反、切块取错区间、命令名被注释污染，全都能照样绿。
  it('变异验证：CI 少一步门禁时必须报 missingInCi', () => {
    const mutated = raw.replace(/^ {6}- name: Ignore Shadow Guard\r?\n {8}run: npm run check:ignore-shadow\r?\n/m, '')
    expect(mutated, '变异没生效，本用例自身失效').not.toBe(raw)
    const d = gateDiff(mutated, readVerifyScript())
    expect(d.missingInCi).toContain('check:ignore-shadow')
    expect(d.missingInLocal).toEqual([])
  })

  it('变异验证：verify 少一段命令时必须报 missingInLocal', () => {
    const verify = readVerifyScript()
    const mutated = verify.replace(' && npm run check:ignore-shadow', '')
    expect(mutated.length, '变异没生效，本用例自身失效').toBeLessThan(verify.length)
    const d = gateDiff(raw, mutated)
    expect(d.missingInLocal).toContain('check:ignore-shadow')
    expect(d.missingInCi).toEqual([])
  })

  // 2026-11-04 第五批合入 main 时，裸 `npm run typecheck` 因 Node 默认 ~2GB 堆间歇 OOM
  // （退出码 134），把生产部署打断一次。这里钉住修复的两个必要条件，防止被"简化"回去。
  it('Type Check 必须由步骤级 env 注入堆上限', () => {
    const tc = raw.match(/^ {6}- name:\s*Type Check\r?\n([\s\S]*?)(?=^ {6}- name:|z)/m)
    expect(tc, '未找到 Type Check 步骤').toBeTruthy()
    expect(tc[1]).toMatch(/^ {8}env:/m)
    expect(tc[1]).toContain('NODE_OPTIONS')
  })

  it('Type Check 的堆上限必须真的接到 Resolve 步骤的输出（断链会让 NODE_OPTIONS 变空值）', () => {
    expect(raw).toContain('id: tscheap')
    expect(raw).toMatch(/NODE_OPTIONS:\s*--max-old-space-size=\$\{\{\s*steps\.tscheap\.outputs\.heap\s*\}\}/)
  })

  it('NODE_OPTIONS 不得出现在 job/workflow 级 env（会乘到 vitest 多个 fork 上造成集体假红）', () => {
    // job 级 env 在 4 空格缩进、workflow 级在 2 空格；步骤级至少 8 空格。
    for (const m of raw.matchAll(/^(\s*)env:\s*$/gm)) {
      const indent = m[1].length
      const after = raw.slice(m.index).split('\n').slice(1)
      const block = []
      for (const line of after) {
        if (line.trim() === '' || /^\s*#/.test(line)) continue
        // env 块只包含比 env: 更深缩进的键
        if (/^\s*/.test(line) && (line.match(/^\s*/)[0].length > indent)) block.push(line)
        else break
      }
      if (block.some((l) => l.includes('NODE_OPTIONS'))) {
        expect(indent, `NODE_OPTIONS 被写在 ${indent} 空格缩进的 env 上，必须改为步骤级`).toBeGreaterThanOrEqual(8)
      }
    }
    // 兜一条硬规则：整份文件里 NODE_OPTIONS 出现处必须在深缩进
    for (const line of raw.split('\n')) {
      if (line.includes('NODE_OPTIONS') && !line.trim().startsWith('#')) {
        expect(line.match(/^\s*/)[0].length).toBeGreaterThanOrEqual(10)
      }
    }
  })
})
