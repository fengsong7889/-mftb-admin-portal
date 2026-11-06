/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

/**
 * 路由守卫受控名单的覆盖度测试。
 *
 * <p>钉住的设计缺陷：`AuthContext.hasMenuPermission` 对**不在 CONTROLLED_MENU_KEYS 里**的
 * key 直接 `return true`（注释写的是「未接入权限校验的原型菜单：所有登录用户可访问」）。
 * 这个默认值是 fail-open 的：任何人新加一个菜单 key，只要忘了同步这份名单，
 * 前端守卫就当它不存在，任何登录用户都能整页打开，只剩后端 @RequirePermission 在最后兜底——
 * 用户看到的是一屏带内部权限键的 403，而不是干净的无权页。
 *
 * <p>2026-11-06 E2E 实测命中三处：`meeting-minutes-list`（行政侧全量纪要检索）、
 * `notification-template` / `notification-switch`、`consumable-claim`。
 * 所以这里不是描述现状，而是把「路由映射引用的每一个菜单 key 都必须在受控名单里」
 * 变成断言，让下一次漏登记在 CI 就红。
 */
import { describe, expect, it } from 'vitest'
import { CONTROLLED_MENU_KEYS, ROUTE_MENU_ANY_OF_MAP, ROUTE_MENU_KEY_MAP } from './menuPermission'

/**
 * 刻意对所有登录用户开放的菜单 key。
 * <p>必须是**显式**名单而不是"没登记就等于开放"：漏登记与刻意开放是两件事，
 * 混在一起才会让 meeting-minutes-list 那种全量检索页静默变成公共页面。
 */
const INTENTIONALLY_OPEN_KEYS = ['home']

describe('受控菜单名单覆盖度', () => {
  const controlled = new Set(CONTROLLED_MENU_KEYS)
  const mappedKeys = [...new Set([
    ...Object.values(ROUTE_MENU_KEY_MAP),
    ...Object.values(ROUTE_MENU_ANY_OF_MAP).flat(),
  ])]

  it('路由映射确实覆盖了大量菜单（若为 0 则下面的断言全部空转）', () => {
    expect(mappedKeys.length).toBeGreaterThan(50)
  })

  it('每个被路由守卫引用的菜单 key 都在受控名单里，或已显式登记为刻意开放', () => {
    const uncovered = mappedKeys
      .filter(key => !controlled.has(key))
      .filter(key => !INTENTIONALLY_OPEN_KEYS.includes(key))
    expect(uncovered, `以下菜单 key 有路由但不在受控名单，任何登录用户都能整页打开：${uncovered.join(', ')}`)
      .toEqual([])
  })

  it('会议域全部纳入受控（本轮事故域单独点名，防止将来又漏一个新菜单）', () => {
    const meetingKeys = mappedKeys.filter(key => key.startsWith('meeting-'))
    expect(meetingKeys.length).toBeGreaterThan(0)
    for (const key of meetingKeys) {
      expect(controlled.has(key), `meeting 菜单 ${key} 未纳入受控名单`).toBe(true)
    }
    // 本轮修掉的三个必须留在名单里，不能被"整理"掉
    expect(CONTROLLED_MENU_KEYS).toContain('meeting-minutes-list')
  })

  it('刻意开放名单里的 key 不得同时出现在受控名单（两个集合必须互斥，否则语义打架）', () => {
    for (const key of INTENTIONALLY_OPEN_KEYS) {
      expect(controlled.has(key), `${key} 同时登记在受控与刻意开放两个名单里`).toBe(false)
    }
  })
})
