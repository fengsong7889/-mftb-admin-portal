import axios from 'axios'
import type { AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import { message } from 'antd'

/** 后端统一响应结构 */
export interface ApiResult<T = unknown> {
  code: number
  message: string
  data: T
}

/** 本地存储的 Token key */
export const TOKEN_KEY = 'mftb_token'

/**
 * 自定义请求头：抑制全局错误提示
 * 当请求 config 中携带 { silent: true } 时，响应拦截器不会自动弹出错误 toast，
 * 由调用方自行处理错误提示（如登录接口的 mock 降级场景）。
 */
export const SILENT_HEADER = 'X-Request-Silent'

/** 业务成功状态码 */
const SUCCESS_CODE = 200
/** 未认证状态码 */
const UNAUTHORIZED_CODE = 401

/**
 * 计算 API 基础地址: 统一保证以 /api 结尾
 * 开发环境通过 Vite proxy 代理到后端 (见 vite.config.ts)
 * 生产环境通过 VITE_API_BASE_URL 环境变量指定后端地址（可不带 /api 前缀, 此处自动补全）
 */
function resolveBaseURL(): string {
  const raw = import.meta.env.VITE_API_BASE_URL as string | undefined
  if (!raw) return '/api'
  const trimmed = raw.replace(/\/+$/, '')
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`
}

/** 创建 axios 实例 */
const request: AxiosInstance = axios.create({
  baseURL: resolveBaseURL(),
  timeout: 15000,
})

/** 请求拦截器: 自动携带 JWT Token */
request.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem(TOKEN_KEY)
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error),
)

/** 响应拦截器: 统一处理业务错误与鉴权失效 */
request.interceptors.response.use(
  (response: AxiosResponse<ApiResult>) => {
    const res = response.data
    // 业务成功: 直接返回 data
    if (res.code === SUCCESS_CODE) {
      return res.data as never
    }
    const silent = response.config?.headers?.[SILENT_HEADER] === '1'
    // 未认证: 清除登录态并跳转登录页（静默请求由调用方自行处理, 如登录接口的 mock 降级）
    if (res.code === UNAUTHORIZED_CODE) {
      if (!silent) handleUnauthorized()
      return Promise.reject(new Error(res.message || '登录已过期'))
    }
    // 其它业务错误: 弹出提示（除非调用方声明静默）
    if (!silent) {
      message.error(res.message || '请求失败')
    }
    return Promise.reject(new Error(res.message || '请求失败'))
  },
  (error) => {
    // HTTP 层错误
    const status = error?.response?.status
    const silent = error?.config?.headers?.[SILENT_HEADER] === '1'
    if (status === UNAUTHORIZED_CODE) {
      if (!silent) handleUnauthorized()
    } else if (status === 403) {
      if (!silent) message.error('没有访问权限')
    } else if (status >= 500) {
      if (!silent) message.error('服务器异常, 请稍后重试')
    } else {
      if (!silent) message.error(error?.message || '网络异常')
    }
    return Promise.reject(error)
  },
)

/** 处理未认证: 清除本地登录信息并跳转登录页 */
function handleUnauthorized() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem('is_authenticated')
  localStorage.removeItem('user_info')
  message.error('登录已过期, 请重新登录')
  // HashRouter 场景下跳转登录页
  if (window.location.hash !== '#/login') {
    window.location.hash = '#/login'
  }
}

/**
 * 判断错误是否为「后端不可用」类错误（网络异常 / 404 / 5xx）
 * 用于 API 层降级到本地 Mock 数据：本地未启动后端或静态部署时自动使用虚拟数据，
 * 后端可用时的业务错误（如参数校验失败）不会触发降级。
 */
export function isBackendUnavailable(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false
  const status = error.response?.status
  // 无响应（连接被拒/超时）、代理 404、服务端 5xx 均视为后端不可用
  return !status || status === 404 || status >= 500
}

export default request
