import { describe, it, expect, vi, beforeEach } from 'vitest'

// updateSystemConfig 走 axios 封装，mock 掉避免真发请求
const { putMock } = vi.hoisted(() => ({ putMock: vi.fn() }))
vi.mock('@/api/request', () => ({
  default: { put: putMock, get: vi.fn(), post: vi.fn() },
  SILENT_HEADER: 'x-silent',
  TOKEN_KEY: 'mftb_token',
}))

import { saveAiModelAccounts, parseAccountWhitelist, SYS_CONFIG_VALUE_MAX_LENGTH } from './useSystemRules'

/**
 * 通道账号白名单的保存口径。
 * <p>背景：AI 深度测试发现「賬號白名單」页只 setState + 弹「已保存」，实际没有任何写库请求，
 * 而后端网关真的按这份白名单做准入 —— 配置看着生效其实从未生效。这里钉住「必须发 PUT」，
 * 以及「超长要报错而不是静默截断」：白名单写坏会让名单外与名单内一起被拒，比保存失败更难排查。
 */
describe('saveAiModelAccounts', () => {
  beforeEach(() => {
    localStorage.clear()
    putMock.mockReset()
    putMock.mockResolvedValue(undefined)
  })

  it('按通道写对应的 sys_config key，值为 JSON 数组', async () => {
    await saveAiModelAccounts('QW', ['MF00001', ' MF00002 '])
    expect(putMock).toHaveBeenCalledWith('/sys-config/ai_model_qw_accounts', { value: '["MF00001","MF00002"]' })
  })

  it('清空名单 = 全部账号可用，写入空数组而不是空串', async () => {
    await saveAiModelAccounts('DS', [])
    expect(putMock).toHaveBeenCalledWith('/sys-config/ai_model_ds_accounts', { value: '[]' })
  })

  it('超过字段长度上限时直接报错，不发被截断的半截名单', async () => {
    const tooMany = Array.from({ length: 400 }, (_, i) => `MF${String(i).padStart(8, '0')}`)
    await expect(saveAiModelAccounts('QW', tooMany)).rejects.toThrow(/白名單過長/)
    expect(putMock).not.toHaveBeenCalled()
    expect(JSON.stringify(tooMany).length).toBeGreaterThan(SYS_CONFIG_VALUE_MAX_LENGTH)
  })

  it('解析兼容 JSON 数组与逗号分隔串', () => {
    expect(parseAccountWhitelist('["a","b"]')).toEqual(['a', 'b'])
    expect(parseAccountWhitelist(' a , b ')).toEqual(['a', 'b'])
    expect(parseAccountWhitelist(null)).toEqual([])
    expect(parseAccountWhitelist('')).toEqual([])
  })
})
