/**
 * 钉钉签署页专用 API（令牌免登）
 *
 * 领用人从钉钉工作通知点击签署链接进入（#/asset-claim-sign?token=...），
 * 后端凭 HMAC 签署令牌校验身份，无需登录后台。
 *
 * 接口已加入后端安全白名单（/api/sign-page/**），
 * 请求携带静默头：错误提示由签署页自身状态展示，不弹全局 toast。
 */
import request, { SILENT_HEADER } from './request'

/** 静默请求头：签署页自行处理错误展示（移动端无全局 message 依赖） */
const SILENT = { headers: { [SILENT_HEADER]: '1' } }

/** 待签署领用详情（对应后端 EamClaimVO） */
export interface SignPageClaimDetail {
  id: number
  /** 领用单号 */
  claimNo: string
  assetId: number
  assetNo: string
  assetName: string
  assetType?: string
  brand?: string
  /** 领用人员工 ID（与令牌绑定） */
  employeeId: number
  empNo: string
  empName: string
  department?: string
  /** 领用日期（yyyy-MM-dd） */
  claimDate: string
  claimReason?: string
  remark?: string
  /** 登记人（经办人） */
  operator?: string
  /** 领用状态：pending_signature / claimed / ... */
  status: string
  /** 签名状态 */
  signatureStatus?: string
  /** 已签署时间（已签署时有值） */
  signedAt?: string
  /** 签名凭证 Data URL（已签署时有值） */
  signatureImageUrl?: string
  createdAt?: string
  updatedAt?: string
}

/** 凭令牌读取待签署领用详情 */
export async function fetchSignPageDetail(token: string): Promise<SignPageClaimDetail> {
  return request.get<unknown, SignPageClaimDetail>('/sign-page/detail', {
    params: { token },
    ...SILENT,
  })
}

/** 凭令牌提交签名（签名图片为 Base64 PNG Data URL） */
export async function submitSignPageSign(token: string, signatureImage: string): Promise<void> {
  await request.post<unknown, void>('/sign-page/sign', { token, signatureImage }, SILENT)
}
