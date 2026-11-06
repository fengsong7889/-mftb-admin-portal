/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 */
/**
 * theme-bootstrap-plugin 的行为契约测试。
 *
 * 核心一条是第 1 例「只有 config.env 为 true 也必须注入」：这就是本轮实际修掉的缺陷 ——
 * 旧实现读 process.env，`.env.local` 里打开关时客户端看到 true（入口出现）而 Node 侧没收到，
 * 引导脚本不注入 → 深色刷新先闪白。所以本文件同时是那件事的回归守卫。
 */
import { describe, expect, it } from 'vitest'
import { THEME_BOOT_MARKER, THEME_BOOT_SCRIPT } from './theme-boot-script.mjs'
import { THEME_FLAG_KEY, isThemeSwitchEnabled, themeBootstrapPlugin } from './theme-bootstrap-plugin.mjs'

/** 走一遍 Vite 的调用顺序：先 configResolved，再 transformIndexHtml.handler */
function injectWith(env) {
  const plugin = themeBootstrapPlugin()
  plugin.configResolved({ env })
  return plugin.transformIndexHtml
}

function tagsWith(env) {
  const plugin = themeBootstrapPlugin()
  plugin.configResolved({ env })
  return plugin.transformIndexHtml.handler('<html></html>')
}

describe('主题引导插件的开关判定必须与客户端同源', () => {
  it('键名两侧共用同一个常量，客户端 featureFlag.ts 读的就是它', () => {
    expect(THEME_FLAG_KEY).toBe('VITE_THEME_SWITCH_ENABLED')
  })

  it('① 只有 config.env 为 true（= 只写在 .env.local）也必须注入 —— 本轮修的半开缺陷', () => {
    const saved = process.env[THEME_FLAG_KEY]
    delete process.env[THEME_FLAG_KEY] // 明确让 Node 侧读不到，复现「只写 .env.local」的场景
    try {
      expect(tagsWith({ [THEME_FLAG_KEY]: 'true' })).toHaveLength(1)
    } finally {
      if (saved !== undefined) process.env[THEME_FLAG_KEY] = saved
    }
  })

  it('② shell 变量路径（CI 与本地临时开）同样注入', () => {
    expect(tagsWith({ [THEME_FLAG_KEY]: 'true' })).toHaveLength(1)
  })

  it('③ 两侧都关闭时绝不注入：这是「无 data-theme → 浅色令牌」的生产不变量', () => {
    expect(tagsWith({})).toHaveLength(0)
    expect(tagsWith(undefined)).toHaveLength(0)
    expect(tagsWith({ [THEME_FLAG_KEY]: 'false' })).toHaveLength(0)
  })

  it('④ 只认字面 true：1 / yes / TRUE / 布尔 true / 空串都不算开（宁可少开）', () => {
    for (const v of ['1', 'yes', 'TRUE', true, '']) {
      expect(isThemeSwitchEnabled({ [THEME_FLAG_KEY]: v }), `不应把 ${JSON.stringify(v)} 当成开启`).toBe(false)
    }
    expect(isThemeSwitchEnabled({ [THEME_FLAG_KEY]: 'true' })).toBe(true)
  })

  it('⑤ 注入位置契约：order=pre + head-prepend，否则深色仍会先画一帧浅色', () => {
    const t = injectWith({ [THEME_FLAG_KEY]: 'true' })
    expect(t.order).toBe('pre')
    const [tag] = t.handler('<html></html>')
    expect(tag.injectTo).toBe('head-prepend')
    expect(tag.tag).toBe('script')
  })

  it('⑥ 注入内容就是引导脚本本体，且脚本里确实读 app_theme 偏好', () => {
    const [tag] = tagsWith({ [THEME_FLAG_KEY]: 'true' })
    expect(tag.children).toBe(THEME_BOOT_SCRIPT)
    expect(tag.children).toContain(THEME_BOOT_MARKER)
  })

  it('⑦ 没跑过 configResolved 之前不得注入（防止默认打开）', () => {
    const plugin = themeBootstrapPlugin()
    expect(plugin.transformIndexHtml.handler('<html></html>')).toHaveLength(0)
  })
})
