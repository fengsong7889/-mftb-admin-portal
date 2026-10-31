/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「闪蜂推广管理后台」专有软件的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
/**
 * 模型供应商列表 —— API Key 三态渲染契约测试
 *
 * 背景（2026-10-31 事故）：轮换 JWT_SECRET 后已入库的供应商密文全部解不开，
 * 列表却只显示「未配置」，管理员据此以为没保存成功、反复重填。三态必须由
 * 服务端 apiKeyStatus 驱动，且「密鑰已失效」不得显示脱敏串（否则会被读成已配置）。
 *
 * 本文件钉住四条口径：
 * 1. UNSET / OK / STALE 各显示各的文案，互不混用；
 * 2. STALE 行即使带回脱敏串也不得显示；
 * 3. 旧后端未回 apiKeyStatus 时按脱敏串兜底，不得整表显示未配置；
 * 4. STALE 行留空保存必须被拦下——后端语义是「空值保留旧 Key」，放行等于什么都没改。
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ConfigProvider, message } from 'antd'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiProvider } from '@/api'
import AiModelProvider from './index'

const api = vi.hoisted(() => ({
  fetchProviders: vi.fn(),
  updateProvider: vi.fn(),
  deleteProvider: vi.fn(),
}))

// 只替换取数函数：AI_API_KEY_STATUS / resolveApiKeyStatus 必须用真实实现，
// 否则测的是 mock 而不是契约本身
vi.mock('@/api', async (importOriginal) => {
  const mod = await importOriginal<Record<string, unknown>>()
  return { ...mod, fetchProviders: api.fetchProviders, updateProvider: api.updateProvider, deleteProvider: api.deleteProvider }
})
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'zh-TW' } }),
}))
vi.mock('@/hooks/useColumnConfig', () => ({
  useColumnConfig: () => ({ configComponent: null, applyConfig: (cols: unknown[]) => cols }),
}))

/** 0=未配置 1=已配置 2=密钥已失效（界面文案为「密鑰已失效」），与后端 AiProviderDTO.API_KEY_* 同值 */
function provider(id: number, apiKeyStatus: number | undefined, apiKeyMasked = ''): AiProvider {
  return {
    id,
    providerKey: `provider-${id}`,
    name: `供應商 ${id}`,
    apiUrlBase: 'https://example.com/v1',
    apiKeyMasked,
    apiKeyStatus,
    status: 1,
  }
}

async function mount(rows: AiProvider[]) {
  api.fetchProviders.mockResolvedValue(rows)
  render(<ConfigProvider theme={{ token: { motion: false } }}>
    <AiModelProvider />
  </ConfigProvider>)
  await waitFor(() => expect(screen.getByText(rows[0].name)).toBeInTheDocument())
}

beforeEach(() => {
  vi.clearAllMocks()
  // message.warning 是 antd 真实实现，必须显式 spy 才能断言拦截有没有生效
  vi.spyOn(message, 'warning')
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('API Key 三态显示', () => {
  it('未配置 / 已配置 / 密鑰已失效 各显示各的文案', async () => {
    await mount([provider(1, 0), provider(2, 1, 'sk-a****wxyz'), provider(3, 2)])

    expect(screen.getByText('未配置')).toBeInTheDocument()
    expect(screen.getByText('sk-a****wxyz')).toBeInTheDocument()
    expect(screen.getByText('密鑰已失效')).toBeInTheDocument()
  })

  it('密鑰已失效的行不得显示脱敏串', async () => {
    await mount([provider(1, 2, 'sk-a****wxyz')])

    expect(screen.getByText('密鑰已失效')).toBeInTheDocument()
    expect(screen.queryByText('sk-a****wxyz')).not.toBeInTheDocument()
  })

  /** 前后端同仓发布，但滚动升级期间仍可能「新前端 + 旧后端」；兜底口径必须与改造前一致。 */
  it('后端未回 apiKeyStatus 时按脱敏串兜底，不得整表显示未配置', async () => {
    await mount([provider(1, undefined, 'sk-a****wxyz')])

    expect(screen.getByText('sk-a****wxyz')).toBeInTheDocument()
    expect(screen.queryByText('未配置')).not.toBeInTheDocument()
  })

  it('失效行留空保存被拦下，不发无意义的更新请求', async () => {
    await mount([provider(1, 2)])

    await act(async () => { fireEvent.click(screen.getByText('編輯')) })
    // antd 会在两字按钮中间插空格（渲染成「保 存」），因此用正则而非字面量匹配
    const saveButton = await screen.findByRole('button', { name: /保\s*存/ })
    await act(async () => { fireEvent.click(saveButton) })

    await waitFor(() => expect(message.warning).toHaveBeenCalled())
    expect(api.updateProvider).not.toHaveBeenCalled()
  })
})
