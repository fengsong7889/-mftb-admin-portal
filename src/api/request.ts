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
/** 无权限状态码 */
const FORBIDDEN_CODE = 403
/** 空闲超时状态码（后端检测用户长时间无操作后返回） */
const SESSION_IDLE_TIMEOUT_CODE = 1004

/** 登录失效全局事件: AuthContext 监听后清除 React 登录态, 触发路由守卫跳回登录页 */
export const AUTH_UNAUTHORIZED_EVENT = 'auth:unauthorized'

/** 被顶下线全局事件: 账号在其他设备登录, 携带登录设备信息 */
export const SESSION_CONFLICT_EVENT = 'auth:session-conflict'

/** 被强制下线全局事件: 管理员操作下线, 携带操作人信息 */
export const FORCE_LOGOUT_EVENT = 'auth:force-logout'

/** 账号被停用全局事件: 登录时或在线时被停用 */
export const ACCOUNT_DISABLED_EVENT = 'auth:account-disabled'

/** 被顶下线事件详情 */
export interface SessionConflictDetail {
  loginIp: string
  loginLocation: string
}

/** 被强制下线事件详情 */
export interface ForceLogoutDetail {
  operatorName: string
  operatorEmpId: string
}

/** 并发请求同时返回 401 时只处理一次, 登录成功后通过 resetUnauthorizedGuard 重置 */
let unauthorizedHandled = false

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
    // 未认证: 区分「被顶下线」与「普通 Token 过期」
    if (res.code === UNAUTHORIZED_CODE) {
      const data = res.data as { reason?: string; loginIp?: string; loginLocation?: string; operatorName?: string; operatorEmpId?: string } | null
      if (data?.reason === 'SESSION_CONFLICT') {
        // 被顶下线: 发送带设备信息的事件, 由 AuthContext 弹窗展示
        window.dispatchEvent(
          new CustomEvent(SESSION_CONFLICT_EVENT, {
            detail: { loginIp: data.loginIp || '', loginLocation: data.loginLocation || '' } as SessionConflictDetail,
          })
        )
      } else if (data?.reason === 'FORCE_LOGOUT') {
        // 被管理员强制下线: 发送带操作人信息的事件, 由 AuthContext 弹窗展示
        window.dispatchEvent(
          new CustomEvent(FORCE_LOGOUT_EVENT, {
            detail: { operatorName: data.operatorName || '', operatorEmpId: data.operatorEmpId || '' } as ForceLogoutDetail,
          })
        )
      } else if (data?.reason === 'ACCOUNT_DISABLED') {
        // 账号被停用: 发送事件, 由 AuthContext 或登录页弹窗展示
        window.dispatchEvent(new CustomEvent(ACCOUNT_DISABLED_EVENT))
        handleUnauthorized()
      } else {
        handleUnauthorized()
      }
      return Promise.reject(new Error(res.message || '登录校验已过期，请重新登录'))
    }
    // 空闲超时: 后端检测到用户长时间无操作，强制登出并提示
    if (res.code === SESSION_IDLE_TIMEOUT_CODE) {
      handleUnauthorized(res.message || '您已长时间未操作，会话已过期')
      return Promise.reject(new Error(res.message))
    }
    // 业务层无权限: 后端权限模块以业务码 403 返回（如菜单/数据未授权）
    if (res.code === FORBIDDEN_CODE) {
      if (!silent) message.error(res.message || '您没有权限执行此操作，请联系管理员授权')
      return Promise.reject(new Error(res.message || '无权限'))
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
      // 登录失效一律强制登出（handleUnauthorized 内部已做去重）
      handleUnauthorized()
    } else if (status === FORBIDDEN_CODE) {
      // HTTP 403: 优先展示后端返回的提示信息（Spring Security 拦截时可能无 body）
      const backendMsg = error?.response?.data?.message
      if (!silent) message.error(backendMsg || '您没有权限执行此操作，请联系管理员授权')
    } else if (status >= 500) {
      if (!silent) message.error('服务器异常, 请稍后重试')
    } else {
      if (!silent) message.error(error?.message || '网络异常')
    }
    return Promise.reject(error)
  },
)

/**
 * 处理登录失效（Token 过期 / 被清除 / 无效）:
 * 清除本地登录信息, 提示用户, 并通知 AuthContext 同步清除 React 登录态,
 * 由路由守卫将用户带回登录页。并发 401 只处理一次。
 */
function handleUnauthorized(customMessage?: string) {
  if (unauthorizedHandled) return
  unauthorizedHandled = true
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem('is_authenticated')
  localStorage.removeItem('user_info')
  message.error(customMessage || '登录校验已过期，请重新登录')
  // 通知 AuthContext 清除 React 状态（isAuthenticated），路由守卫自动跳回登录页
  window.dispatchEvent(new Event(AUTH_UNAUTHORIZED_EVENT))
  // 兜底: HashRouter 场景下直接跳转登录页
  if (window.location.hash !== '#/login') {
    window.location.hash = '#/login'
  }
}

/** 重新登录成功后重置登录失效标记, 保证同一 SPA 会话内再次过期仍可正常登出 */
export function resetUnauthorizedGuard() {
  unauthorizedHandled = false
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
