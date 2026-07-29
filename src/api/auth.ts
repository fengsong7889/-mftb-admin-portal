import request from './request'
import { SILENT_HEADER } from './request'
import type { MenuPermission } from '../pages/Permission/types'

/** 登录请求参数 */
export interface LoginParams {
  username: string
  password: string
}

/** 后端返回的用户信息 */
export interface UserInfo {
  id: number
  username: string
  name: string
  empId: string
  avatar: string
  role: string
  department?: string
  position?: string
  /** 职位英文名称 */
  positionEn?: string
  /** 职级 (如 M10/T5) */
  jobLevel?: string
  functionRoleIds?: number[] // 绑定的功能角色ID
  permissions?: MenuPermission[] // 登录时下发的合并菜单权限
}

/** 登录响应 */
export interface LoginResult {
  token: string
  userInfo: UserInfo
}

/** 登录 */
export function login(params: LoginParams) {
  // 带静默标记：后端不可用时由 AuthContext 降级到 mock 登录，避免全局弹出「服务器异常」
  return request.post<unknown, LoginResult>('/auth/login', params, {
    headers: { [SILENT_HEADER]: '1' },
  })
}

/** 登出 */
export function logout() {
  return request.post<unknown, void>('/auth/logout')
}

/** 获取当前登录用户信息 */
export function getUserInfo() {
  // 带静默标记：用于启动时后台刷新用户信息，后端不可用时不弹全局错误提示
  return request.get<unknown, UserInfo>('/auth/info', {
    headers: { [SILENT_HEADER]: '1' },
  })
}
