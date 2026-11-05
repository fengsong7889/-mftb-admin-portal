/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

/**
 * 主题切换入口的「挂载点」守卫。
 *
 * 为什么单独要有这个测试：`ThemeControls.test.tsx` 只测控件自身，而控件**有没有被挂到壳层顶栏上**
 * 一直没被钉住——本仓库为此实踩过两次：
 *   1. §17.1：主题按钮被插到语言与铃铛之间，把既有消息入口挤走，用户报「铃铛被删了」；
 *   2. 2026-11-05：用户看企业门户发现「深浅色切换按钮没有了」，而代码里 PortalTopBar 明明挂着它
 *      ——因为入口是否出现取决于构建期灰度开关，肉眼无法区分「被删」与「没开」。
 * 这个测试把两件事一次钉死：开关开着时两个顶栏都必须有入口、且排在铃铛之后；
 * 开关关着时必须没有（灰度语义，防止有人把 null 分支当成缺陷「修好」）。
 *
 * 断言用 class 而不是文案：文案走 i18n，五个语言包并非都有 header 段（见方案 §16.3），
 * 拿名字定位会让测试跟着语言包状态抖。
 */
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nextProvider } from 'react-i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import i18n from '@/i18n'
import ThemeProvider from '@/theme/ThemeProvider'
import HeaderBar from './HeaderBar'
import PortalTopBar from './PortalTopBar'

const { switchRef } = vi.hoisted(() => ({ switchRef: { enabled: false } }))
vi.mock('@/theme/featureFlag', () => ({ isThemeSwitchEnabled: () => switchRef.enabled }))

// 顶栏的其余数据依赖全部桩掉：本测试的命题只有「主题入口挂没挂、位置对不对」
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: '1', username: 'admin', fullName: '系統管理員', employeeNo: 'MF00001' } }),
}))
vi.mock('@/contexts/MenuContext', () => ({ useMenu: () => ({ menuTree: null }) }))
vi.mock('@/api/translation', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  fetchLanguages: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/api/notification', () => ({
  fetchNotifications: vi.fn().mockResolvedValue({ items: [], unreadCount: 0 }),
  markAllNotificationsRead: vi.fn(),
}))
vi.mock('@/api/auth', () => ({
  fetchPortalFavorites: vi.fn().mockResolvedValue([]),
  savePortalFavorites: vi.fn(),
  changePassword: vi.fn(),
  uploadAvatar: vi.fn(),
}))
vi.mock('@/i18n', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  changeAppLanguage: vi.fn().mockResolvedValue(undefined),
  ensureLanguageBundle: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('./SystemSwitcher', () => ({ default: () => <span data-testid="system-switcher" /> }))
vi.mock('./UserMenu', () => ({ default: () => <span data-testid="user-menu" /> }))

const TOGGLE = '.header-theme-toggle'

function mountTopBar(node: ReactNode) {
  // 必须套 ThemeProvider：控件在「flag 开 + 拿不到 Context」时是故意抛错的
  //（防止「主题切换没生效」变成没人发现的缺陷），真实应用在 bootstrap.tsx 里装配。
  return render(
    <MemoryRouter>
      <ThemeProvider>
        <I18nextProvider i18n={i18n}>{node}</I18nextProvider>
      </ThemeProvider>
    </MemoryRouter>,
  )
}

beforeEach(async () => {
  localStorage.clear()
  switchRef.enabled = true
  await i18n.changeLanguage('zh-TW')
})

afterEach(() => {
  vi.clearAllMocks()
  switchRef.enabled = false
})

describe('主题切换入口挂载点守卫', () => {
  it('灰度开启时，企业门户顶栏必须挂上主题入口（否则用户在门户看到浅色、进系统变深色）', () => {
    const { container } = mountTopBar(<PortalTopBar />)
    expect(container.querySelectorAll(TOGGLE)).toHaveLength(1)
  })

  it('灰度开启时，系统内顶栏必须挂上主题入口', () => {
    const { container } = mountTopBar(<HeaderBar collapsed={false} onToggle={() => {}} />)
    expect(container.querySelectorAll(TOGGLE)).toHaveLength(1)
  })

  it('系统内顶栏里主题入口必须排在消息铃铛之后（§17.1：新控件不得把既有消息入口挤走）', () => {
    const { container } = mountTopBar(<HeaderBar collapsed={false} onToggle={() => {}} />)
    const bell = container.querySelector('.header-bell')
    const toggle = container.querySelector(TOGGLE)
    expect(bell).toBeTruthy()
    expect(toggle).toBeTruthy()
    // compareDocumentPosition：若 bell 在 toggle 之前，则从 bell 看 toggle 应返回 FOLLOWING
    const toggleFollowsBell =
      !!(bell!.compareDocumentPosition(toggle!) & Node.DOCUMENT_POSITION_FOLLOWING)
    expect(toggleFollowsBell).toBe(true)
  })

  it('灰度关闭时两个顶栏都不出现该入口（这是刻意的灰度语义，不是缺陷）', () => {
    switchRef.enabled = false
    const portal = mountTopBar(<PortalTopBar />)
    const header = mountTopBar(<HeaderBar collapsed={false} onToggle={() => {}} />)
    // 先坐实「顶栏真的渲染了」，否则下面两条 null 断言在「整个顶栏没渲染」时也会过
    // ——那正是本会话两次栽过的「匹配到 0 项却全绿」。
    expect(portal.container.querySelector('.portal-top-bar')).toBeTruthy()
    expect(portal.container.querySelector('.portal-user-controls')).toBeTruthy()
    expect(header.container.querySelector('.header-user-info, .header-bell')).toBeTruthy()
    expect(portal.container.querySelector(TOGGLE)).toBeNull()
    expect(header.container.querySelector(TOGGLE)).toBeNull()
  })
})
