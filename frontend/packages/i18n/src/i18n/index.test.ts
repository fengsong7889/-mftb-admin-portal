/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { describe, expect, it, vi } from 'vitest'
import i18n, {
  ensureLanguageBundle,
  injectTranslationBundle,
  registerRemoteBundleLoader,
  TRANSLATION_BUNDLE_EVENT,
} from './index'
import zhTW from './locales/zh-TW.json'
import zhCN from './locales/zh-CN.json'

/**
 * 简体中文静态语言包回归测试。
 *
 * 钉住 2026-11-05 的故障：`locales/` 原先只有 zh-TW/en/ja/ko/ru，唯独 zh-CN 一份都没有，
 * 而 `fallbackLng` 是 `'en'`。于是简体中文的每个字只能来自后端数据库语言包，库里缺的
 * key（当时 8036 个，占全站约一半）一律回退英文，登录页更是整页英文。
 * 繁中与英文界面有完整静态包，看不出这个缺陷，所以必须靠断言把「zh-CN 有静态兜底」钉住。
 */

/** 递归收集语言包叶子键 */
function leaves(node: unknown, prefix = '', out: string[] = []): string[] {
  if (!node || typeof node !== 'object') return out
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value)) leaves(value, path, out)
    else out.push(path)
  }
  return out
}

/** 取嵌套值；不存在返回 undefined（i18next 按同样的点路径查） */
function pick(bundle: unknown, dotted: string): unknown {
  let node: unknown = bundle
  for (const part of dotted.split('.')) {
    if (!node || typeof node !== 'object') return undefined
    node = (node as Record<string, unknown>)[part]
  }
  return node
}

/** 语言包叶子键 → 文案，用于按键比对空值 */
function flatLeaves(node: unknown, prefix = '', out: Record<string, unknown> = {}): Record<string, unknown> {
  if (!node || typeof node !== 'object') return out
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value)) flatLeaves(value, path, out)
    else out[path] = value
  }
  return out
}

/**
 * 「静态包有、数据库没有、且繁中≠英文」的探针键。
 * 缺 zh-CN 静态包时它必然渲染成英文，因此这条断言是可变异验证的（不是恒真）。
 */
const PROBE_KEY = 'rdm.import.colRowNo'
const PROBE_ZH_TW = '行號'
const PROBE_ZH_CN = '行号'
const PROBE_EN = 'Row'

describe('简体中文静态语言包', () => {
  it('zh-CN 的键集合与 zh-TW 完全齐备', () => {
    const twKeys = leaves(zhTW)
    const cnKeys = new Set(leaves(zhCN))
    const missing = twKeys.filter(key => !cnKeys.has(key))
    // 全量比对而不是抽样：缺哪个都会让那一片界面掉英文，抽样会漏
    expect(missing).toEqual([])
    expect(cnKeys.size).toBeGreaterThan(10000)
  })

  it('繁中有文案的地方简体中文不得为空：空串会被 i18next 当作未命中继续回退英文', () => {
    const tw = flatLeaves(zhTW)
    const cn = flatLeaves(zhCN)
    // 量词类文案（個/家/週/項）在英文里合法地留空，但繁中/简中同族，
    // 所以只校「繁中有值而简中没值」——那才是简中独有的空洞
    const blankWhereTwHasText = Object.entries(tw)
      .filter(([key, value]) => String(value ?? '').trim() && !String(cn[key] ?? '').trim())
      .map(([key]) => key)
    expect(blankWhereTwHasText).toEqual([])
  })

  it('zh-CN 键集不得超出 zh-TW（前端已删除的文案不应留在兜底包里）', () => {
    const twKeys = new Set(leaves(zhTW))
    const stale = leaves(zhCN).filter(key => !twKeys.has(key))
    expect(stale).toEqual([])
  })

  it('探针键在简体中文下取简体值，而不是按 fallbackLng 回退英文', () => {
    const tZhCN = i18n.getFixedT('zh-CN')
    expect(tZhCN(PROBE_KEY)).toBe(PROBE_ZH_CN)
    // 对照：同一键在繁中/英文下各自取自己的值，说明命中静态包而非统一回退
    expect(i18n.getFixedT('zh-TW')(PROBE_KEY)).toBe(PROBE_ZH_TW)
    expect(i18n.getFixedT('en')(PROBE_KEY)).toBe(PROBE_EN)
    // 变异基准：ja 的静态包只覆盖门户文案，这个 rdm 键没入库，所以必定回退英文。
    // 它就是 zh-CN 补静态包之前的现状——把上面两条断言的「不会回退」说清楚。
    expect(i18n.getFixedT('ja')(PROBE_KEY)).toBe(PROBE_EN)
  })

  it('冒号命名空间写法 t("rdm:key") 同样能取到简体中文', () => {
    // buildResources 会把每个顶层段额外注册为独立 ns，两种 t() 写法都得可用
    expect(i18n.getFixedT('zh-CN')(`rdm:${PROBE_KEY.slice('rdm.'.length)}`)).toBe(PROBE_ZH_CN)
  })

  it('数据库语言包只补静态包没有的键，不得覆盖已本地化的简体中文', () => {
    const event = vi.fn()
    window.addEventListener(TRANSLATION_BUNDLE_EVENT, event)
    injectTranslationBundle('zh-CN', {
      [PROBE_KEY]: '数据库里的旧文案',
      'brandX.demoKey': '补位文案',
    })

    // overwrite=false 的口径：静态真源优先，否则后端回退链产出的旧值会盖掉正确译文
    expect(i18n.getFixedT('zh-CN')(PROBE_KEY)).toBe(PROBE_ZH_CN)
    // 静态包没有的键必须由数据库补上，这是业务字段/菜单名的唯一来源
    expect(i18n.getFixedT('zh-CN')('brandX.demoKey')).toBe('补位文案')
    expect(event).toHaveBeenCalled()
    window.removeEventListener(TRANSLATION_BUNDLE_EVENT, event)
  })

  it('zh-CN 支持点路径的中间层不得被字符串占位（否则整棵子树查不到）', () => {
    // 例如 zh-TW 有 a.b，zh-CN 却把 'a' 写成字符串时，getFixedT 会返回键名本身
    const dotted = leaves(zhCN).filter(key => {
      const parts = key.split('.')
      for (let i = 1; i < parts.length; i += 1) {
        const ancestor = pick(zhCN, parts.slice(0, i).join('.'))
        if (ancestor !== undefined && typeof ancestor !== 'object') return true
      }
      return false
    })
    expect(dotted).toEqual([])
  })

  it('登录页文案在简体中文下有静态兜底（登录页取不到数据库语言包）', () => {
    // bundle 接口需要登录，所以登录页不可能拿到 sys_translation；
    // 没有静态 zh-CN.json 时，简体中文登录页是整页英文的
    const tZhCN = i18n.getFixedT('zh-CN')
    expect(tZhCN('login.welcomeTitle')).toBe('您好！欢迎登录MFTB集团门户')
    expect(tZhCN('login.empIdLabel')).toBe('登录工号')
    expect(tZhCN('login.submit')).not.toBe('login.submit')
  })

  it('语言包拉取返回 null 时不得把该语言永久标成已处理（后端重启窗口内要能重试）', async () => {
    // 旧实现只在抛异常时回滚去重标记，而 fetchTranslationBundle 在后端不可用时是「返回 null」，
    // 于是后端重启期间切一次语言，本次会话就再也不会重拉——用户只能刷新整个页面
    let calls = 0
    registerRemoteBundleLoader(async () => null)
    await ensureLanguageBundle('la')
    expect(calls).toBe(0)

    registerRemoteBundleLoader(async () => {
      calls += 1
      return calls === 1 ? null : { 'brandX.laKey': 'lacca' }
    })
    await ensureLanguageBundle('la')
    await ensureLanguageBundle('la')
    expect(calls).toBe(2)
    expect(i18n.getFixedT('la')('brandX.laKey')).toBe('lacca')

    // 不恢复会影响同一文件后续用例的加载器状态
    registerRemoteBundleLoader(null)
  })
})
