// @vitest-environment node
/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

/**
 * i18n 门禁「后端 DB 供数命名空间免检」判据的回归测试。
 *
 * 为什么需要它：`check-i18n-coverage.py` 为了让 `sys_translation` 整体供数的文案不误报，
 * 会跳过一部分静态引用。这个跳过判据一旦写宽，**该前缀下的所有引用就静默免检**——语言包被
 * 整段覆盖掉、或有人写了个根本不存在的 key，门禁照样报「无法解析 0 条」。这类「门禁看着绿、
 * 其实什么都没比对」的形态本仓库已实踩多次（带点扁平键事故、CI 少跑一道门禁、正则匹配到 0 项），
 * 所以必须写成可执行的回归，而不是靠人记住判据长什么样。
 *
 * 具体防的事故：旧判据 `key.split('.')[0] in db_keys` 把快照里的**裸叶子键**
 * （`channel` / `region` / `remark` / `storeName` / `groupName` 等 12 个，下面没有任何子键）
 * 升格成了命名空间前缀，于是 `t('channel.任意键')` 全部免检。已用变异验证复现：
 * 引用一个根本不存在的 `channel.__missing__`，门禁不报。
 *
 * 做法：把**真脚本**连同夹具树拷进临时目录再执行。脚本的 ROOT 由 `__dirname/..` 解析，
 * 因此天然指向夹具树，不需要给它加环境变量后门。不 mock 判定逻辑——mock 出来的和被测的
 * 就不是同一份代码，测过了也不算数。
 */
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const LOCALE_DIR = join('frontend', 'packages', 'i18n', 'src', 'i18n', 'locales')

let root
let stdout

beforeAll(() => {
  // python3 缺失必须判失败而不是 skip：静默 skip 等于这道回归不存在
  const probe = spawnSync('python3', ['--version'], { encoding: 'utf8' })
  if (probe.error || probe.status !== 0) {
    throw new Error('本测试需要 python3（与 npm run check:i18n 同一前提）；请安装后重跑，不要跳过')
  }

  root = mkdtempSync(join(tmpdir(), 'i18n-dbns-'))
  mkdirSync(join(root, 'scripts'), { recursive: true })
  mkdirSync(join(root, 'src'), { recursive: true })
  mkdirSync(join(root, LOCALE_DIR), { recursive: true })

  // 被测对象是真脚本，不是复刻的判定
  cpSync(join(REPO, 'scripts', 'check-i18n-coverage.py'), join(root, 'scripts', 'check-i18n-coverage.py'))

  // 夹具：asset.title / asset.desc 是「后端确实供数」的具体键（快照里有）；
  // channel/remark/storeName 是裸叶子键，旧判据会把它们误升格成命名空间前缀；
  // plainNs 完全不来自 DB。静态语言包故意不含 asset，这样 asset.title 只能靠快照免检。
  writeFileSync(
    join(root, 'scripts', 'i18n-db-keys.json'),
    JSON.stringify(['asset.title', 'asset.desc', 'channel', 'remark', 'storeName']),
  )
  // 棘轮与引用基线都设成 0：本测试只关心「哪些 key 被判为无法解析」，不关心退出码
  writeFileSync(
    join(root, 'scripts', 'i18n-baseline.json'),
    JSON.stringify({ meeting: 0, attendance: 0, vehicle: 0, asset: 0, rdm: 0, _refsMissing: 0 }),
  )
  const locales = {
    plainNs: { known: '已知' },
  }
  // 脚本按 ALL_LANGS（zh-TW/en/ja/ko/ru）全量加载，少一个会直接 FileNotFoundError；
  // 只写两语会留下「测试根本没跑起来」的假绿坑，所以五份全部落盘。
  for (const lang of ['zh-TW', 'en', 'ja', 'ko', 'ru']) {
    writeFileSync(join(root, LOCALE_DIR, `${lang}.json`), JSON.stringify(locales, null, 2))
  }

  writeFileSync(
    join(root, 'src', 'probe.tsx'),
    [
      'import { useTranslation } from "react-i18next"',
      '',
      'export function Probe() {',
      '  const { t } = useTranslation()',
      '  return <span>{t("channel.__missing_under_bare_leaf__", { defaultValue: "a" })}',
      '    {t("remark.__missing_under_bare_leaf__", { defaultValue: "b" })}',
      '    {t("plainNs.__missing_plain__", { defaultValue: "c" })}',
      '    {t("asset.title", { defaultValue: "d" })}',
      '    {t("asset.__missing_in_db_ns__", { defaultValue: "e" })}</span>',
      '}',
      '',
    ].join('\n'),
  )

  // 必须用 spawnSync：夹具里故意留着不存在的 key，脚本会以退出码 1 结束；
  // 换成 execFileSync 会直接抛异常，断言还没跑就「测试报错」，掩盖真实判定。
  const run = spawnSync('python3', [join(root, 'scripts', 'check-i18n-coverage.py')], {
    cwd: root,
    encoding: 'utf8',
  })
  stdout = run.stdout ?? ''
  // stdout 为空说明脚本压根没跑起来（语法错、路径不对），此时下面每条断言都会空过
  expect(stdout.length, `门禁脚本无输出，夹具未真正执行：${run.stderr}`).toBeGreaterThan(0)
})

afterAll(() => {
  if (root) rmSync(root, { recursive: true, force: true })
})

describe('i18n 门禁的 DB 供数免检判据', () => {
  it('夹具确实被扫到了（防止 0 比对假绿）', () => {
    const scanned = Number((stdout.match(/扫描 (\d+) 条静态 key/) ?? [])[1])
    expect(Number.isFinite(scanned)).toBe(true)
    // 5 条引用全在夹具里；若解析逻辑失效会退化成 0 条并让下面所有断言空过
    expect(scanned).toBeGreaterThanOrEqual(5)
  })

  it('裸叶子键不再被当成命名空间前缀，其下缺失 key 必须报出来', () => {
    expect(stdout).toContain('channel.__missing_under_bare_leaf__')
    expect(stdout).toContain('remark.__missing_under_bare_leaf__')
  })

  it('普通命名空间的缺失 key 照报', () => {
    expect(stdout).toContain('plainNs.__missing_plain__')
  })

  it('完整键命中快照的后端供数文案仍然不误报（免检机制没被删坏）', () => {
    expect(stdout).not.toContain('asset.title')
  })

  it('同命名空间下未被快照覆盖的缺失 key 仍要报（不得按前缀整体免检）', () => {
    expect(stdout).toContain('asset.__missing_in_db_ns__')
  })
})
