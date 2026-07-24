import request from './request'

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
}

/** 登录响应 */
export interface LoginResult {
  token: string
  userInfo: UserInfo
}

/** 登录 */
export function login(params: LoginParams) {
  return request.post<unknown, LoginResult>('/auth/login', params)
}

/** 登出 */
export function logout() {
  return request.post<unknown, void>('/auth/logout')
}

/** 获取当前登录用户信息 */
export function getUserInfo() {
  return request.get<unknown, UserInfo>('/auth/info')
}
