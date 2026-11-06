/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter } from 'react-router-dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { SUPPORTED_LANGUAGES } from '@/i18n'
import zhCN from '@/i18n/locales/zh-CN.json'

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ login: vi.fn(), isAuthenticated: false, user: null }),
}))
vi.mock('@/api/auth', () => ({
  fetchCaptchaToken: vi.fn().mockResolvedValue({ token: 'test-token' }),
}))

import Login from './index'

/**
 * 登录页语言下拉的收敛回归。
 *
 * 钉住两件事：
 * 1. 下拉只给「前端真的能渲染」的语言。旧实现直接铺全 LANG_INFO 的 60 种，而
 *    applyLoginLanguage 只对 SUPPORTED_LANGUAGES 里的代码调 changeAppLanguage——
 *    于是剩下 54 项是**死选项**：选中了、localStorage 也写了，界面却一动不动，
 *    用户只会当成「切换坏了」。顺带也消掉了这 54 项在简体中文界面里的繁体标签。
 * 2. 选中简体中文必须真的生效（i18next 语言 + 两个 localStorage 键同时落）。
 *    这是本轮简体中文改造里唯一发生在「未登录」阶段的可见面：登录页拿不到
 *    数据库语言包（bundle 接口需要登录），只能靠静态 zh-CN.json 兜底。
 */

/** 取当前界面语言下的翻译函数 */
const tr = () => i18n.getFixedT(i18n.language)

function mountLogin() {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={['/login']}>
        <Login />
      </MemoryRouter>
    </I18nextProvider>,
  )
}

/** 打开语言下拉并返回当前可见的选项文本 */
async function openLanguageOptions() {
  // 用 findByRole 而不是 getByRole：登录页的界面语言是在初始 useEffect 里按
  // login_language 应用的，aria-label 会跟着语言变（Language → 语言），
  // 同步取会抢到「应用语言之前」那一帧
  const combobox = await screen.findByRole('combobox', { name: tr()('portal.language') })
  fireEvent.mouseDown(combobox)
  await waitFor(() => {
    expect(document.querySelectorAll('.ant-select-item-option-content').length).toBeGreaterThan(0)
  })
  return Array.from(document.querySelectorAll('.ant-select-item-option-content')).map(el => el.textContent ?? '')
}

beforeAll(() => {
  // jsdom 的 HTMLMediaElement.play() 是空实现且返回 undefined，而登录页背景视频写的是
  // play().catch(() => {})：不补这一层，挂载就先报 unhandled rejection，断言还没跑到就红了
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
  // 锁住静态兜底与页面断言同源：一旦 locales/zh-CN.json 不再包含这些文案，
  // 下面“切换后看到简体标题”的用例会变成假绿
  expect((zhCN as { login: { empIdLabel: string } }).login.empIdLabel).toBe('登录工号')
})

beforeEach(async () => {
  localStorage.clear()
  await i18n.changeLanguage('en')
})

describe('登录页语言下拉', () => {
  it('只列前端能渲染的 6 种语言，不再铺全 60 种死选项', async () => {
    // 在简体中文界面下验：这个用例同时卡住两件事——选项收敛到 6 种，
    // 以及这 6 种的标签要是简体（旧实现铺全量 60 种，长尾语言在简中界面下还是繁体）。
    // 必须走 login_language 而不是直接 changeLanguage：登录页的初始 useEffect 会按
    // login_language 重算界面语言，直接改会被它接回 en
    localStorage.setItem('login_language', 'zh-CN')
    localStorage.setItem('app_language', 'zh-CN')
    mountLogin()
    const options = await openLanguageOptions()

    expect(options).toHaveLength(SUPPORTED_LANGUAGES.length)
    expect(options.join('\n')).toContain('简体中文')
    expect(options.join('\n')).toContain('繁体中文')
    // 未注册的长尾语言不再出现在登录页：选了也不会生效，属于死选项
    expect(options.join('\n')).not.toMatch(/ภาษาไทย|Français|Tiếng Việt|العربية/)
  })

  it('选简体中文会真的切换语言，并同步落两个 localStorage 键', async () => {
    mountLogin()
    const options = await openLanguageOptions()
    // 英文界面下 zh-CN 的标签是「Chinese (Simplified)」，与繁中的「Chinese」可区分
    const target = options.findIndex(text => text.includes('Chinese (Simplified)'))
    expect(target).toBeGreaterThanOrEqual(0)

    fireEvent.click(document.querySelectorAll('.ant-select-item-option-content')[target])

    await waitFor(() => expect(i18n.language).toBe('zh-CN'))
    // login_language 与 app_language 必须同时写：只写一个会让刷新后又被登录页的选择覆盖回去
    expect(localStorage.getItem('login_language')).toBe('zh-CN')
    expect(localStorage.getItem('app_language')).toBe('zh-CN')
    // 简体中文的文案来自静态包（此时还拿不到数据库语言包）
    expect(await screen.findByText('您好！欢迎登录MFTB集团门户')).toBeInTheDocument()
  })

  it('历史遗留的未支持 login_language 不再被恢复成「选中但不生效」', async () => {
    localStorage.setItem('login_language', 'th')
    mountLogin()

    await waitFor(() => expect(i18n.language).toBe('en'))
    const options = await openLanguageOptions()
    // 下拉当前值不应是泰文（旧实现会因为 LANG_INFO 里有 th 而把它选中并高亮）
    const selected = document.querySelector('.ant-select-selection-item')?.textContent ?? ''
    expect(selected).not.toContain('ไทย')
    expect(options).toHaveLength(SUPPORTED_LANGUAGES.length)
  })

  it('国家下拉仍可搜索且带无障碍标签（不能因为收敛语言而丢可访问性）', async () => {
    mountLogin()
    const t = tr()
    expect(screen.getByRole('combobox', { name: t('portal.country') })).toBeTruthy()
    expect(screen.getByRole('combobox', { name: t('portal.language') })).toBeTruthy()
  })
})
