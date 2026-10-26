/**
 * 員工自助（ESS）API
 * 对应后端 HrEssController（/api/hr/ess）
 * <p>
 * 这组端点的数据范围固定为登录人本人，不接收员工标识；
 * 请假单与本人额度的读写仍复用 api/hrLeave（服务端按数据范围收敛到本人）。
 */
import request from './request'
import type { PageResult } from './employee'
import type { HrLifecycleItem, HrLifecycleType } from './hrLifecycle'

/** 我的档案（服务端脱敏视图：证件号/住址已打码） */
export interface EssProfile {
  personalInfo?: {
    gender?: string | null
    nationality?: string | null
    ethnicity?: string | null
    birthDate?: string | null
    maritalStatus?: string | null
    politicalStatus?: string | null
    religion?: string | null
  }
  idInfo?: {
    idType?: string | null
    /** 服务端脱敏后的证件号 */
    idNumber?: string | null
    idAddress?: string | null
    householdType?: string | null
    householdLocation?: string | null
    nativePlace?: string | null
  }
  contactInfo?: {
    mobile?: string | null
    email?: string | null
    addressCountry?: string | null
    addressCity?: string | null
    addressDetail?: string | null
  }
  accountInfo?: {
    dingtalkUserId?: string | null
  }
}

/** 我的人事异动单据分页 */
export const fetchMyRequests = (params: {
  page: number
  size: number
  type?: HrLifecycleType | string
  status?: string
}) => request.get<unknown, PageResult<HrLifecycleItem>>('/hr/ess/my-requests', { params })

/** 我的异动单据状态计数（Tab 徽标） */
export const fetchMyRequestStats = () =>
  request.get<unknown, Record<string, number>>('/hr/ess/my-request-stats')

/** 我的档案 */
export const fetchMyProfile = () =>
  request.get<unknown, EssProfile>('/hr/ess/profile')
