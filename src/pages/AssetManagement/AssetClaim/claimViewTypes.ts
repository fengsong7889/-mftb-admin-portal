import type { AssetItem } from '../../../api/asset'
import type { AssetParameterSource } from '../../../utils/assetParams'
import type { DepartmentItem } from '../../../api/department'

// 界面契約與數據接入分離；第三階段由真實 API 提供這些只讀模型。
export const CLAIM_STATUS = {
  PENDING: 'pending_signature', CLAIMED: 'claimed', RETURNED: 'returned', CANCELLED: 'cancelled', TRANSFERRED: 'transferred',
  LOSS_CLOSED: 'loss_closed', SCRAP_CLOSED: 'scrap_closed', REPAIR_CLOSED: 'repair_closed',
} as const
export type ClaimStatus = typeof CLAIM_STATUS[keyof typeof CLAIM_STATUS]
export const SIGNATURE_STATUS = {
  PENDING: 'pending', SIGNED: 'signed', PROXY_PENDING: 'proxy_pending', NOT_REQUIRED: 'not_required',
} as const
export type SignatureStatus = typeof SIGNATURE_STATUS[keyof typeof SIGNATURE_STATUS]

export interface ClaimStatsData {
  employeeCount: number
  claimedCount: number
  returnedCount: number
  pendingSignatureCount: number
}
export interface ClaimEmployee {
  employeeId: number
  empNo: string
  empName: string
  departmentId?: number
  department: string
}
export interface ClaimEmployeeSummary extends ClaimEmployee {
  claimedCount: number
  returnedCount: number
  pendingCount: number
  proxyPendingCount: number
  lastClaimDate?: string
}
export interface ClaimRow extends AssetParameterSource {
  id: number
  claimNo: string
  sourceTransferId?: number | null
  previousClaimId?: number | null
  assetId: number
  assetNo: string
  assetName: string
  assetType: string
  brand: string
  companyBrand?: number
  employeeId: number
  empNo: string
  empName: string
  department: string
  claimDate: string
  claimReason?: string
  remark?: string
  operator: string
  operatorEmpNo?: string
  status: ClaimStatus
  signatureStatus: SignatureStatus
  proxyReason?: string
  signedAt?: string
  returnDate?: string
  returnReason?: string
  cancelledReason?: string
  createdAt?: string
  returnedAt?: string
  updatedBy?: string
  updatedAt?: string
  contentHash?: string
  /** 購買時價值（來自資產台賬） */
  purchaseValue?: number | null
  /** 管理部門（來自資產台賬） */
  adminDepartment?: string
  /** 歸還驗收狀況：normal/damaged/lost（僅已歸還時有值） */
  assetCondition?: 'normal' | 'damaged' | 'lost'
  /** 簽名憑證 Data URL（簽署後才有） */
  signatureImageUrl?: string
  /** 領用配件快照 [{name, qty}] */
  accessories?: { name: string; qty: number }[]
}
export interface ClaimPage<T> { records: T[]; total: number }
export interface ClaimSummaryData extends ClaimPage<ClaimEmployeeSummary> { stats: ClaimStatsData }
export interface ClaimQuery {
  page: number
  size: number
  keyword?: string
  departmentId?: number
  status?: ClaimStatus
  pendingSignature?: boolean
  employeeId?: number
}
export interface ClaimRegistration {
  assetId: number
  employeeId: number
  claimDate: string
  claimReason?: string
  remark?: string
  mode: 'standard' | 'proxy'
  proxyReason?: string
  /** 領用配件快照 JSON */
  accessories?: string
}
export type ClaimAssetOption = Pick<AssetItem,
  'id' | 'assetNo' | 'assetName' | 'assetType' | 'brand' | 'companyBrand' | 'location' | 'purchaseValue' | 'params' | 'categoryCode' | 'categoryId' | 'accessories'>

export interface DepartmentNode { value: number; title: string; children: DepartmentNode[] }
export function buildDeptTree(departments: DepartmentItem[]): DepartmentNode[] {
  const nodes = new Map(departments.map((dept) => [dept.id, { value: dept.id, title: dept.name, children: [] as DepartmentNode[] }]))
  const roots: DepartmentNode[] = []
  for (const dept of departments) {
    const node = nodes.get(dept.id)!
    const parent = dept.parentId && dept.parentId !== dept.id ? nodes.get(dept.parentId) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  return roots
}

export function parseClaimId(value: string | null): number | undefined {
  if (!value || !/^[1-9]\d*$/.test(value)) return undefined
  const id = Number(value)
  return Number.isSafeInteger(id) ? id : undefined
}
