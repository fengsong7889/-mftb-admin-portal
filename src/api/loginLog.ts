import request from './request'

/** 登录日志记录 */
export interface LoginLogRecord {
  id: number
  empId: string
  employeeName: string
  departmentId: number | null
  departmentName: string
  loginTime: string
  logoutTime: string | null
  duration: number | null
  logoutReason: string | null
}

/** 分页结果 */
interface PageResult<T> {
  records: T[]
  total: number
}

/** 查询参数 */
export interface LoginLogQuery {
  page?: number
  size?: number
  keyword?: string
  departmentId?: number | null
  status?: string
  startDate?: string
  endDate?: string
}

/** 分页查询登录日志 */
export function fetchLoginLogs(params: LoginLogQuery): Promise<PageResult<LoginLogRecord>> {
  return request.get('/login-logs', { params })
}

/** 强制下线指定用户 */
export function forceLogout(loginLogId: number): Promise<void> {
  return request.post(`/login-logs/${loginLogId}/force-logout`)
}

/** 删除登录日志 */
export function deleteLoginLog(loginLogId: number): Promise<void> {
  return request.delete(`/login-logs/${loginLogId}`)
}
