import { describe, it, expect } from 'vitest'
import { isBackendUnavailable, TOKEN_KEY, AUTH_UNAUTHORIZED_EVENT, SESSION_CONFLICT_EVENT, FORCE_LOGOUT_EVENT, ACCOUNT_DISABLED_EVENT } from './request'
import axios from 'axios'

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
      const err = axios.create().get('http://localhost:1') // 不会真发请求
        .catch((e) => e)
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
})
