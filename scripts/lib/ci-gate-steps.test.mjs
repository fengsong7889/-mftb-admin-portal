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
const raw = readFileSync(WORKFLOW, 'utf8')

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
  'Secret Scan',
  'Test',
]

/** 构建/发布步骤：所有门禁都必须排在它们之前，否则等于「先上线再检查」 */
const RELEASE_STEPS = ['Build', 'Site assembly manifest', 'Site assembly check', 'Upload Pages artifact']

/** 取 build job 内的步骤名（`- name:` 固定 6 空格缩进） */
function stepNames(text) {
  return [...text.matchAll(/^ {6}- name:\s*(.+)$/gm)].map((m) => m[1].trim())
}

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
