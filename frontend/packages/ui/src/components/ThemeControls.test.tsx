/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

/**
 * 主题切换控件单测（方案 §8.1 第 3 组用例）。
 *
 * 为什么必须 mock `featureFlag` 而不是设环境变量：那个开关读的是
 * `import.meta.env.VITE_THEME_SWITCH_ENABLED`，属于 Vite 构建期静态替换的值，
 * 运行期改不动（`vi.stubEnv` 实测对它无效）。所以这里把开关本身换掉，
 * 让「开 / 关」两条分支都能被真正执行到。
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import i18n from '@/i18n'
import ThemeProvider from '@/theme/ThemeProvider'
import ThemeControls from './ThemeControls'

const { switchRef } = vi.hoisted(() => ({ switchRef: { enabled: false } }))
vi.mock('@/theme/featureFlag', () => ({ isThemeSwitchEnabled: () => switchRef.enabled }))

/** 可控 matchMedia：setup.ts 的全局 mock 恒为浅色，深色分支必须自己接管才能跑到 */
function installMatchMedia(initial = false) {
  const mql = {
    matches: initial,
    media: '',
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }
  vi.spyOn(window, 'matchMedia').mockImplementation(() => mql as unknown as MediaQueryList)
  return mql
}

function mount() {
  return render(
    <ThemeProvider>
      <I18nextProvider i18n={i18n}>
        <ThemeControls />
      </I18nextProvider>
    </ThemeProvider>,
  )
}

beforeEach(async () => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  switchRef.enabled = false
  installMatchMedia(false)
  // 控件文案走 i18n，而 setup 清空 storage 后 getSavedLanguage() 默认返回 'en'，
  // 不显式切到繁中会让 getByRole(name:'主題') 与菜单项断言全部找不到节点。
  await i18n.changeLanguage('zh-TW')
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('灰度开关关闭时不得露出入口', () => {
  it('返回 null，连 Provider 都不需要', () => {
    const { container } = render(
      <I18nextProvider i18n={i18n}>
        <ThemeControls />
      </I18nextProvider>,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('开关关闭时即使 storage 写着 dark，解析结果也不会落到深色', () => {
    localStorage.setItem('app_theme', 'dark')
    const { container } = render(
      <ThemeProvider>
        <I18nextProvider i18n={i18n}>
          <ThemeControls />
        </I18nextProvider>
      </ThemeProvider>,
    )
    expect(container).toBeEmptyDOMElement()
    expect(document.documentElement.dataset.theme ?? 'light').toBe('light')
  })
})

describe('开关开启但缺少 Provider 时必须显式失败', () => {
  it('抛错而不是静默不渲染——否则「主题没生效」会成为一个没人发现的缺陷', () => {
    switchRef.enabled = true
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() =>
      render(
        <I18nextProvider i18n={i18n}>
          <ThemeControls />
        </I18nextProvider>,
      ),
    ).toThrow(/ThemeProvider/)
    spy.mockRestore()
  })
})

describe('开关开启后的交互', () => {
  beforeEach(() => {
    switchRef.enabled = true
  })

  it('渲染带无障碍标签的触发按钮', () => {
    mount()
    expect(screen.getByRole('button', { name: '主題' })).toBeTruthy()
  })

  it('跟随系统且系统为浅色时，触发图标是显示器而不是太阳', () => {
    const { container } = mount()
    expect(container.querySelector('.anticon-desktop')).toBeTruthy()
    expect(container.querySelector('.anticon-sun')).toBeNull()
  })

  it('手动选深色后图标切到月亮', async () => {
    localStorage.setItem('app_theme', 'dark')
    const { container } = mount()
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'))
    expect(container.querySelector('.anticon-moon')).toBeTruthy()
  })

  it('展开菜单显示三个繁中文案选项', async () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: '主題' }))
    expect(await screen.findByText('淺色')).toBeTruthy()
    expect(screen.getByText('深色')).toBeTruthy()
    expect(screen.getByText('跟隨系統')).toBeTruthy()
  })

  it('点「深色」写入偏好并把 data-theme 落到 html', async () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: '主題' }))
    fireEvent.click(await screen.findByText('深色'))
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'))
    expect(localStorage.getItem('app_theme')).toBe('dark')
  })

  it('点「跟隨系統」是删除记录，不是写入字面量 system', async () => {
    localStorage.setItem('app_theme', 'dark')
    mount()
    fireEvent.click(screen.getByRole('button', { name: '主題' }))
    fireEvent.click(await screen.findByText('跟隨系統'))
    await waitFor(() => expect(localStorage.getItem('app_theme')).toBeNull())
    // 系统侧被 mock 成浅色，所以交回系统控制权后应落回 light
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('light'))
  })

  it('键盘 Enter 可在三态间轮换，不依赖指针', async () => {
    localStorage.setItem('app_theme', 'light')
    mount()
    fireEvent.keyDown(screen.getByRole('button', { name: '主題' }), { key: 'Enter' })
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'))
    expect(localStorage.getItem('app_theme')).toBe('dark')
    fireEvent.keyDown(screen.getByRole('button', { name: '主題' }), { key: 'Enter' })
    await waitFor(() => expect(localStorage.getItem('app_theme')).toBeNull())
  })

  it('切换过程中不得弹 toast（效果即时可见，提示是噪声）', async () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: '主題' }))
    fireEvent.click(await screen.findByText('深色'))
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'))
    expect(document.querySelector('.ant-message')).toBeNull()
  })
})
