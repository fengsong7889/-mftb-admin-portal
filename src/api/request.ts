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

/** 业务成功状态码 */
const SUCCESS_CODE = 200
/** 未认证状态码 */
const UNAUTHORIZED_CODE = 401

/**
 * 创建 axios 实例
 * 开发环境通过 Vite proxy 代理到后端 (见 vite.config.ts)
 */
const request: AxiosInstance = axios.create({
  baseURL: '/api',
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
    // 未认证: 清除登录态并跳转登录页
    if (res.code === UNAUTHORIZED_CODE) {
      handleUnauthorized()
      return Promise.reject(new Error(res.message || '登录已过期'))
    }
    // 其它业务错误: 弹出提示
    message.error(res.message || '请求失败')
    return Promise.reject(new Error(res.message || '请求失败'))
  },
  (error) => {
    // HTTP 层错误
    const status = error?.response?.status
    if (status === UNAUTHORIZED_CODE) {
      handleUnauthorized()
    } else if (status === 403) {
      message.error('没有访问权限')
    } else if (status >= 500) {
      message.error('服务器异常, 请稍后重试')
    } else {
      message.error(error?.message || '网络异常')
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

export default request
