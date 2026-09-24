import { describe, it, expect, vi, afterEach } from 'vitest'
import { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { message } from 'antd'
import { invalidateSystemNavigation, loadSystemNavigation } from '../hooks/useSystemNavigation'
import request, { SILENT_HEADER, isBackendUnavailable, TOKEN_KEY, AUTH_UNAUTHORIZED_EVENT, SESSION_CONFLICT_EVENT, FORCE_LOGOUT_EVENT, ACCOUNT_DISABLED_EVENT } from './request'

vi.mock('antd', () => ({ message: { error: vi.fn() } }))

describe('API request 模块', () => {
  describe('常量导出', () => {
    it('TOKEN_KEY 为固定值', () => {
      expect(TOKEN_KEY).toBe('mftb_token')
    })

    it('全局事件名不冲突', () => {
      const events = [AUTH_UNAUTHORIZED_EVENT, SESSION_CONFLICT_EVENT, FORCE_LOGOUT_EVENT, ACCOUNT_DISABLED_EVENT]
      expect(new Set(events).size).toBe(events.length)
    })
  })

  describe('isBackendUnavailable', () => {
    it('非 axios 错误返回 false', () => {
      expect(isBackendUnavailable(new Error('普通错误'))).toBe(false)
      expect(isBackendUnavailable('string error')).toBe(false)
      expect(isBackendUnavailable(null)).toBe(false)
    })

    it('无响应（连接被拒/超时）视为后端不可用', () => {
      // 手动构造一个无 response 的 axios error
      const noResponseErr = Object.assign(new Error('Network Error'), {
        isAxiosError: true,
        response: undefined,
      })
      expect(isBackendUnavailable(noResponseErr)).toBe(true)
    })

    it('404 视为后端不可用', () => {
      const err = Object.assign(new Error('Not Found'), {
        isAxiosError: true,
        response: { status: 404 },
      })
      expect(isBackendUnavailable(err)).toBe(true)
    })

    it('5xx 视为后端不可用', () => {
      const err500 = Object.assign(new Error('Internal Server Error'), {
        isAxiosError: true,
        response: { status: 500 },
      })
      const err503 = Object.assign(new Error('Service Unavailable'), {
        isAxiosError: true,
        response: { status: 503 },
      })
      expect(isBackendUnavailable(err500)).toBe(true)
      expect(isBackendUnavailable(err503)).toBe(true)
    })

    it('400/401/403 等业务错误不视为后端不可用', () => {
      const err400 = Object.assign(new Error('Bad Request'), {
        isAxiosError: true,
        response: { status: 400 },
      })
      const err401 = Object.assign(new Error('Unauthorized'), {
        isAxiosError: true,
        response: { status: 401 },
      })
      const err403 = Object.assign(new Error('Forbidden'), {
        isAxiosError: true,
        response: { status: 403 },
      })
      expect(isBackendUnavailable(err400)).toBe(false)
      expect(isBackendUnavailable(err401)).toBe(false)
      expect(isBackendUnavailable(err403)).toBe(false)
    })
  })

  describe('系统导航请求路径', () => {
    it.each(['iam', 'ai'])('系统 %s 使用门户导航接口', async (systemCode) => {
      const originalAdapter = request.defaults.adapter
      const adapter = vi.fn(async (config: InternalAxiosRequestConfig) => ({
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
        data: { code: 200, message: '操作成功', data: [] },
      }))
      request.defaults.adapter = adapter
      try {
        await expect(loadSystemNavigation(systemCode)).resolves.toEqual([])
        expect(adapter).toHaveBeenCalledTimes(1)
        expect(adapter.mock.calls[0][0]).toMatchObject({
          method: 'get',
          url: `/portal/systems/${systemCode}/navigation`,
        })
      } finally {
        request.defaults.adapter = originalAdapter
        invalidateSystemNavigation(systemCode)
      }
    })
  })

  describe('HTTP 错误提示（响应拦截器）', () => {
    const originalAdapter = request.defaults.adapter

    /** 用固定状态码的适配器驱动拦截器的错误分支 */
    function stubHttpStatus(status: number, data: unknown) {
      request.defaults.adapter = (config: InternalAxiosRequestConfig) => {
        const error = new AxiosError(
          `Request failed with status code ${status}`,
          undefined,
          config,
          undefined,
          { status, statusText: '', headers: {}, config, data },
        )
        return Promise.reject(error)
      }
    }

    afterEach(() => {
      request.defaults.adapter = originalAdapter
      vi.mocked(message.error).mockClear()
    })

    it('404 提示接口路径与排查指引，不再透出 axios 原文', async () => {
      stubHttpStatus(404, { code: 404, message: '請求的資源不存在' })
      await expect(request.get('/mcp/tools', { baseURL: '/api/' })).rejects.toBeInstanceOf(AxiosError)
      const tip = String(vi.mocked(message.error).mock.calls[0]?.[0])
      expect(message.error).toHaveBeenCalledTimes(1)
      expect(tip).toContain('接口或资源不存在（404）')
      expect(tip).toContain('/api/mcp/tools')
      expect(tip).toContain('后端版本是否已更新')
      expect(tip).not.toContain('Request failed with status code')
    })

    it('静默 404 不弹提示，但仍向调用方抛错', async () => {
      stubHttpStatus(404, {})
      await expect(request.get('/mcp/tools', {
        headers: { [SILENT_HEADER]: '1' },
      })).rejects.toBeInstanceOf(AxiosError)
      expect(message.error).not.toHaveBeenCalled()
    })

    it('绝对地址不拼接基础地址，也不展示查询参数或片段', async () => {
      stubHttpStatus(404, {})
      await expect(request.get('https://example.com/api/mcp/tools?token=test-only#fragment', {
        baseURL: '/ignored',
      })).rejects.toBeInstanceOf(AxiosError)
      const tip = String(vi.mocked(message.error).mock.calls[0]?.[0])
      expect(tip).toContain('https://example.com/api/mcp/tools')
      expect(tip).not.toContain('/ignored')
      expect(tip).not.toContain('test-only')
      expect(tip).not.toContain('fragment')
    })

    it('5xx 仍提示服务器异常', async () => {
      stubHttpStatus(503, { code: 503 })
      await expect(request.get('/mcp/tools')).rejects.toBeTruthy()
      expect(message.error).toHaveBeenCalledWith('服务器异常, 请稍后重试')
    })
  })
})
