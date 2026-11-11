/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

/**
 * 主题状态层单测（方案 §8.1 第 1 组用例）。
 *
 * 最要紧的一条：`src/test/setup.ts` 里的全局 matchMedia mock **恒返回 matches:false**，
 * 如果本文件直接沿用它的 mock，那么「跟随系统」相关的所有断言都只能在浅色分支上跑，
 * 深色路径一次都没被走过，测试却全绿——属于典型的假绿。
 * 所以下面用 installMatchMedia 显式接管，并把「能触发 change」也做进去。
 *
 * 灰度开关也同理必须接管：它读 import.meta.env，而 `vi.stubEnv` 对动态属性访问不生效
 * （实测过：设了 true 仍拿到 false，于是所有期望深色的用例集体变成期望不匹配）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** 可控的开关状态：vi.mock 会被提升，所以共享变量必须用 vi.hoisted 创建 */
const { switchRef } = vi.hoisted(() => ({ switchRef: { enabled: false } }))
vi.mock('./featureFlag', () => ({ isThemeSwitchEnabled: () => switchRef.enabled }))

import {
  THEME_CHANGED_EVENT,
  THEME_STORAGE_KEY,
  applyTheme,
  getThemePreference,
  resolveTheme,
  setThemePreference,
  subscribeSystemTheme,
  systemPrefersDark,
} from './index'

/** 可控的 matchMedia：既能设定初始偏好，也能触发 change 事件 */
function installMatchMedia(initial = false) {
  const listeners = new Set<() => void>()
  const mql = {
    matches: initial,
    media: '',
    onchange: null,
    addEventListener: (_type: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_type: string, cb: () => void) => listeners.delete(cb),
    dispatchEvent: () => true,
    /** 模拟操作系统切换深浅色 */
    emit: (next: boolean) => {
      mql.matches = next
      listeners.forEach((cb) => cb())
    },
  }
  vi.spyOn(window, 'matchMedia').mockImplementation(() => mql as unknown as MediaQueryList)
  return mql
}

const setSwitch = (on: boolean) => {
  switchRef.enabled = on
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  setSwitch(false)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('feature flag 关闭期间必须恒浅色', () => {
  /**
   * 取值语义必须由用例自己构造，不能读运行环境。
   *
   * 旧写法直接 `expect(actual.isThemeSwitchEnabled()).toBe(false)`，读的是本机
   * `.env.local` 里的 VITE_THEME_SWITCH_ENABLED：本地开着灰度就判红，而 CI 没有该文件
   * 又恒绿 —— 于是「显式 true 才开启」这条分支在 CI 从未被验证过，且本地那 1 例红
   * 会被当成本次改动弄坏的。现在用 stubEnv 逐个构造取值，两侧环境结论一致。
   *
   * vitest 4 的 stubEnv 直接写 metaEnv，传 undefined 会删键（真正的「未配置」），
   * unstubAllEnvs 精确还原；静态成员访问 import.meta.env.KEY 不受「动态属性访问」那个坑影响。
   */
  it('真实实现只在显式字符串 true 时开启，未配置与其它取值一律关闭', async () => {
    // 上面已经把 ./featureFlag mock 掉了，这里必须取未 mock 的实现才能验它的真实语义
    const actual = await vi.importActual<typeof import('./featureFlag')>('./featureFlag')

    vi.stubEnv('VITE_THEME_SWITCH_ENABLED', undefined)
    expect(actual.isThemeSwitchEnabled(), '未配置必须关闭').toBe(false)

    // 只有逐字符等于 'true' 才算开启：大小写变体、布尔串、前后空白都不得放行
    for (const raw of ['', 'false', 'TRUE', 'True', '1', 'yes', ' true', 'true ']) {
      vi.stubEnv('VITE_THEME_SWITCH_ENABLED', raw)
      expect(actual.isThemeSwitchEnabled(), `取值 ${JSON.stringify(raw)} 不应开启`).toBe(false)
    }

    vi.stubEnv('VITE_THEME_SWITCH_ENABLED', 'true')
    expect(actual.isThemeSwitchEnabled(), '显式 true 必须开启（生产 .env.production 走的就是这条）').toBe(true)
  })

  it('即使 storage 写着 dark、系统也要深色，解析结果仍是 light', () => {
    setSwitch(false)
    localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    installMatchMedia(true)
    expect(resolveTheme('dark')).toBe('light')
    expect(resolveTheme()).toBe('light')
  })

  it('开关打开后同样的输入才真正生效', () => {
    setSwitch(true)
    localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    installMatchMedia(true)
    expect(resolveTheme()).toBe('dark')
  })
})

describe('偏好解析与非法值回落', () => {
  beforeEach(() => setSwitch(true))

  it('无记录 = 跟随系统', () => {
    expect(getThemePreference()).toBe('system')
  })

  it.each([['DARK'], ['Dark'], ['blue'], [''], ['system']] as const)('脏值 %s 归为 system', (raw) => {
    localStorage.setItem(THEME_STORAGE_KEY, raw)
    expect(getThemePreference()).toBe('system')
  })

  it('系统深色时无记录解析为 dark；系统浅色时为 light', () => {
    installMatchMedia(true)
    expect(resolveTheme()).toBe('dark')
    installMatchMedia(false)
    expect(resolveTheme()).toBe('light')
  })

  it('手动选择必须覆盖系统偏好，两个方向都成立', () => {
    installMatchMedia(true)
    expect(resolveTheme('light')).toBe('light')
    installMatchMedia(false)
    expect(resolveTheme('dark')).toBe('dark')
  })
})

describe('落 DOM 与事件广播', () => {
  beforeEach(() => setSwitch(true))

  it('applyTheme 写 data-theme 并广播变化事件', () => {
    const seen: string[] = []
    const onEvent = () => seen.push(document.documentElement.dataset.theme ?? '')
    window.addEventListener(THEME_CHANGED_EVENT, onEvent)
    try {
      expect(applyTheme('dark')).toBe('dark')
      expect(applyTheme('light')).toBe('light')
    } finally {
      window.removeEventListener(THEME_CHANGED_EVENT, onEvent)
    }
    expect(document.documentElement.dataset.theme).toBe('light')
    // 两次调用都应当广播，供 charts / leaflet 这类不吃 CSS 变量的渲染面重绘
    expect(seen).toEqual(['dark', 'light'])
  })

  it('setThemePreference 写入偏好并立即生效', () => {
    installMatchMedia(false)
    expect(setThemePreference('dark')).toBe('dark')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('选跟隨系統要**删除**记录，而不是写入字面量 system', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    const mql = installMatchMedia(true)
    expect(setThemePreference('system')).toBe('dark')
    // 「无记录 = 跟随系统」是唯一真值口径：留下 'system' 字符串会让两种表示并存
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull()
    // 删掉记录后解析就要走系统分支，系统变了结果就得跟着变
    expect(resolveTheme()).toBe('dark')
    mql.matches = false
    expect(resolveTheme()).toBe('light')
  })

  it('存储不可写时仍完成本次切换，不得让按钮点了没反应', () => {
    installMatchMedia(false)
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(setThemePreference('dark')).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    spy.mockRestore()
  })
})

describe('系统主题订阅', () => {
  beforeEach(() => setSwitch(true))

  it('跟随系统时，OS 切换要即时落到 DOM', () => {
    const mql = installMatchMedia(false)
    applyTheme(resolveTheme())
    const next = vi.fn()
    const dispose = subscribeSystemTheme(next)
    mql.emit(true)
    expect(next).toHaveBeenCalledWith('dark')
    dispose()
  })

  it('用户手动选过浅色后，OS 切深色不得覆盖他的选择', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light')
    const mql = installMatchMedia(false)
    const next = vi.fn()
    subscribeSystemTheme(next)
    mql.emit(true)
    expect(next).not.toHaveBeenCalled()
  })

  it('取消订阅后不再回调', () => {
    const mql = installMatchMedia(false)
    const next = vi.fn()
    subscribeSystemTheme(next)()
    mql.emit(true)
    expect(next).not.toHaveBeenCalled()
  })
})

describe('无浏览器环境的防御', () => {
  it('matchMedia 不存在时按浅色处理，不得抛错', () => {
    setSwitch(true)
    // 注意是「移除属性」而不是 spy 成 undefined：typeof 检查要真的拿不到函数
    const original = window.matchMedia
    delete (window as unknown as { matchMedia?: unknown }).matchMedia
    try {
      expect(systemPrefersDark()).toBe(false)
      expect(resolveTheme('system')).toBe('light')
      expect(typeof subscribeSystemTheme(() => {})).toBe('function')
    } finally {
      window.matchMedia = original
    }
  })
})
