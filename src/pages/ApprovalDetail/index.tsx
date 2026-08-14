import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Tag, Input, Modal, Table, message } from 'antd'
import {
  ArrowLeftOutlined,
  UndoOutlined,
  ExclamationCircleOutlined,
  FileImageOutlined,
  FilePdfOutlined,
  EyeOutlined,
} from '@ant-design/icons'
import './ApprovalDetail.css'
import {
  approveCurrentNode,
  rejectCurrentNode,
  getApprovalRecordByFlowNo,
  updateApprovalRecord,
  hasNodeApprovalRole,
  getRequiredApprovalRole,
  APPROVAL_NODE_LABELS,
} from '../../utils/approvalStore'
import {
  fetchFinApprovalDetail,
  approveFinApproval,
  rejectFinApproval,
  cancelFinApproval,
} from '../../api/finance'
import type { FinApproval, ApprovalNodeInstance } from '../../api/finance'
import { useTranslation } from 'react-i18next'

/** 審批历史记录 */
interface ApprovalTimelineItem {
  node: string
  time: string
  approver: string
  status: 'approved' | 'rejected' | 'submitted' | 'pending'
  comment: string
  rejectReason?: string
  /** 多人审批时的审批人列表 */
  approvers?: { name: string; status: string; time: string | null }[]
  /** 审批规则: any / all */
  approvalRule?: string
}

/** 审批详情数据 */
interface ApprovalDetailData {
  approvalType: 'recharge' | 'deduct' | 'transfer' | 'merge' | 'gift'
  applicant: string
  applyDate: string
  flowNo: string
  flowStatus: string
  brand: string
  // 充值
  settlementMethod?: string
  businessType?: string
  businessChannel?: string
  rechargeAmount?: number
  bankTransfer?: number
  revenueDeduction?: number
  bdPerson?: string
  discountAmount?: number
  actualTotal?: number
  isActual?: boolean
  payMethod?: 'corporate' | 'mixed' | 'revenue'
  deductStores?: { storeId: string; storeName: string; amount: number }[]
  // 扣款
  deductMethodType?: 'consume' | 'batch' | 'account'
  deductMethod?: string
  deductAmount?: number
  virtualBalance?: number
  consumeChannel?: string
  consumeStore?: string
  consumeType?: string
  batchNo?: string
  batchDeductible?: number
  batchSettlement?: string
  // 转账
  fromGroupId?: string
  fromGroupName?: string
  fromBrand?: string
  fromVirtualBalance?: number
  toGroupId?: string
  toGroupName?: string
  toBrand?: string
  transferAmount?: number
  // 合并
  sourceBrand?: string
  mergeGroupId?: string
  mergeGroupName?: string
  mergeBrand?: string
  mergeVirtualBalance?: number
  mergeDebtAmount?: number
  mergeToGroupId?: string
  mergeToGroupName?: string
  mergeToBrand?: string
  repayStores?: { storeId: string; storeName: string; bd: string; amount: number }[]
  debtNote?: string
  repaymentStores?: { store: string; channel: string; amount: number; bd: string }[]
  // 赠送
  giftGroupId?: string
  giftGroupName?: string
  giftStoreId?: string
  giftStoreName?: string
  giftBrand?: string
  giftAdType?: string
  giftDays?: number
  giftValidDays?: number
  // 通用
  groupId?: string
  groupName?: string
  documents?: { type: 'image' | 'pdf' | 'view'; name?: string }[]
  notes?: string
  timeline: ApprovalTimelineItem[]
  hasRevoke?: boolean
}

/** 模拟数据 */
const mockDetails: Record<string, ApprovalDetailData> = {
  // 充值 — 對公轉賬
  'CZ202601160000': {
    approvalType: 'recharge',
    applicant: '朱棣(002)',
    applyDate: '2026-01-16 09:16:21',
    flowNo: 'CZ202601160000',
    flowStatus: 'pending',
    brand: '閃蜂',
    groupId: '20261298121911',
    groupName: '亞述集團',
    isActual: true,
    payMethod: 'corporate' as const,
    businessType: '外賣到家',
    businessChannel: '美食外賣',
    bdPerson: '關山月(001)',
    rechargeAmount: 100000,
    actualTotal: 100000,
    bankTransfer: 100000,
    discountAmount: 0,
    settlementMethod: '對公轉賬',
    documents: [
      { type: 'image' }, { type: 'image' },
      { type: 'pdf', name: '銀行轉賬憑證.pdf' },
      { type: 'view' },
    ],
    notes: '已通過銀行對公轉賬完成匯款，請審批。',
    hasRevoke: true,
    timeline: [
      { node: 'finance', time: '--', approver: '--', status: 'pending', comment: '' },
      { node: 'operation', time: '--', approver: '--', status: 'pending', comment: '' },
      { node: 'business', time: '--', approver: '--', status: 'pending', comment: '' },
      { node: 'created', time: '2026-01-16 09:16:21', approver: '朱棣(002)', status: 'submitted', comment: '' },
    ],
  },
  // 充值 — 混合支付
  'CZ202601160001': {
    approvalType: 'recharge',
    applicant: '朱棣(002)',
    applyDate: '2026-01-16 09:16:21',
    flowNo: 'CZ202601160001',
    flowStatus: 'pending',
    brand: '閃蜂',
    groupId: '20261298121911',
    groupName: '亞述集團',
    isActual: true,
    payMethod: 'mixed' as const,
    businessType: '外賣到家',
    businessChannel: '美食外賣',
    bdPerson: '關山月(001)',
    rechargeAmount: 100000,
    actualTotal: 85000,
    bankTransfer: 50000,
    revenueDeduction: 35000,
    discountAmount: 15000,
    deductStores: [
      { storeId: '1234567890', storeName: '廣州酒店天河廣場1號店', amount: 20000 },
      { storeId: '2345678910', storeName: '廣州酒店越秀領展2號店', amount: 15000 },
    ],
    settlementMethod: '混合支付',
    documents: [
      { type: 'image' }, { type: 'image' }, { type: 'image' },
      { type: 'pdf', name: '合同文件1.pdf' }, { type: 'pdf', name: '合同文件2.pdf' },
      { type: 'view' },
    ],
    notes: '請領導迅速審批，老闆等著推廣金到賬，消費一波，謝謝！',
    hasRevoke: true,
    timeline: [
      { node: 'finance', time: '--', approver: '--', status: 'pending', comment: '' },
      { node: 'operation', time: '--', approver: '--', status: 'pending', comment: '' },
      { node: 'business', time: '--', approver: '--', status: 'pending', comment: '' },
      { node: 'created', time: '2026-01-16 09:16:21', approver: '朱棣(002)', status: 'submitted', comment: '' },
    ],
  },
  // 充值 — 營業額支付
  'CZ202601160002': {
    approvalType: 'recharge',
    applicant: '朱棣(002)',
    applyDate: '2026-01-16 09:16:21',
    flowNo: 'CZ202601160002',
    flowStatus: 'pending',
    brand: 'mFood',
    groupId: '20261298121912',
    groupName: '漢堡王',
    isActual: true,
    payMethod: 'revenue' as const,
    businessType: '團購到店',
    businessChannel: '團購到店',
    bdPerson: '浩源(002)',
    rechargeAmount: 80000,
    actualTotal: 80000,
    revenueDeduction: 80000,
    discountAmount: 0,
    deductStores: [
      { storeId: '3456789012', storeName: '漢堡王澳門官也街店', amount: 40000 },
      { storeId: '4567890123', storeName: '漢堡王澳門議事亭店', amount: 25000 },
      { storeId: '5678901234', storeName: '漢堡王珠海拱北店', amount: 15000 },
    ],
    settlementMethod: '營業額支付',
    documents: [
      { type: 'image' }, { type: 'image' },
      { type: 'pdf', name: '營業額扣款協議.pdf' },
      { type: 'view' },
    ],
    notes: '商家委託進行營業額扣款充值，請審批。',
    hasRevoke: true,
    timeline: [
      { node: 'finance', time: '--', approver: '--', status: 'pending', comment: '' },
      { node: 'operation', time: '--', approver: '--', status: 'pending', comment: '' },
      { node: 'business', time: '--', approver: '--', status: 'pending', comment: '' },
      { node: 'created', time: '2026-01-16 09:16:21', approver: '朱棣(002)', status: 'submitted', comment: '' },
    ],
  },
  deduct: {
    approvalType: 'deduct',
    applicant: '朱棟(002)',
    applyDate: '2026-01-16 09:16:21',
    flowNo: 'KK202601160000',
    flowStatus: 'pending',
    brand: 'mFood',
    groupId: '20261298121911',
    groupName: '亞述集團',
    virtualBalance: 128560.50,
    deductMethodType: 'consume' as const,
    deductMethod: 'consume',
    deductAmount: 30000,
    consumeChannel: '美食外賣',
    consumeStore: '廣州酒店天河廣場1號店(1234567890)',
    consumeType: '基礎套餐',
    documents: [
      { type: 'image' }, { type: 'image' },
      { type: 'pdf', name: '扣款憑證.pdf' },
    ],
    notes: '商家需要在巴士進行打廣告，委託我們進行操作，與商家達成協議，扣取推廣金30,000元。',
    hasRevoke: true,
    timeline: [
      { node: 'finance', time: '--', approver: '--', status: 'pending', comment: '' },
      { node: 'operation', time: '--', approver: '--', status: 'pending', comment: '' },
      { node: 'business', time: '--', approver: '--', status: 'pending', comment: '' },
      { node: 'created', time: '2026-01-16 09:16:21', approver: '朱棟(002)', status: 'submitted', comment: '' },
    ],
  },
  transfer: {
    approvalType: 'transfer',
    applicant: '朱棟(002)',
    applyDate: '2026-01-16 09:16:21',
    flowNo: 'ZZ202601160000',
    flowStatus: 'pending',
    brand: 'mFood',
    fromGroupId: '20261298121911',
    fromGroupName: '亞述集團',
    fromBrand: 'mFood',
    fromVirtualBalance: 128560.50,
    toGroupId: '20261298121912',
    toGroupName: '廣州酒家',
    toBrand: 'mFood',
    transferAmount: 50000,
    documents: [
      { type: 'image' }, { type: 'image' }, { type: 'image' },
      { type: 'pdf', name: '轉賬協議.pdf' },
      { type: 'view' },
    ],
    notes: '商戶A和商戶B已完成合併協議簽訂，現在申請將商戶A賬戶推廣金餘額轉入商戶B。',
    hasRevoke: true,
    timeline: [
      { node: 'finance', time: '--', approver: '--', status: 'pending', comment: '' },
      { node: 'operation', time: '--', approver: '--', status: 'pending', comment: '' },
      { node: 'business', time: '--', approver: '--', status: 'pending', comment: '' },
      { node: 'created', time: '2026-01-16 09:16:21', approver: '朱棟(002)', status: 'submitted', comment: '' },
    ],
  },
  merge: {
    approvalType: 'merge',
    applicant: '朱棣(002)',
    applyDate: '2026-01-16 09:16:21',
    flowNo: 'HB202601160000',
    flowStatus: 'pending',
    brand: 'mFood',
    sourceBrand: 'mFood',
    mergeGroupId: '20261298121911',
    mergeGroupName: '亞述集團',
    mergeBrand: 'mFood',
    mergeVirtualBalance: 128560.50,
    mergeDebtAmount: 15800.00,
    mergeToGroupId: '20261298121912',
    mergeToGroupName: '廣州酒家',
    mergeToBrand: 'mFood',
    repayStores: [
      { storeId: '1234567890', storeName: '廣州酒店天河廣場1號店(1234567890)', bd: '關山月(001)', amount: 8000 },
      { storeId: '2345678910', storeName: '廣州酒店越秀領展2號店(2345678910)', bd: '古月(002)', amount: 5000 },
      { storeId: '3456789012', storeName: '廣州酒店琶洲保利3號店(3456789012)', bd: '浩遠(003)', amount: 2800 },
    ],
    documents: [
      { type: 'image' }, { type: 'image' }, { type: 'image' },
      { type: 'pdf', name: '合併協議.pdf' },
    ],
    notes: '亞述集團和廣州酒家已完成合併協議簽訂，現在申請將亞述集團賬戶推廣金餘額全部轉入廣州酒家。',
    hasRevoke: true,
    timeline: [
      { node: 'finance', time: '--', approver: '--', status: 'pending', comment: '' },
      { node: 'operation', time: '--', approver: '--', status: 'pending', comment: '' },
      { node: 'business', time: '--', approver: '--', status: 'pending', comment: '' },
      { node: 'created', time: '2026-01-16 09:16:21', approver: '朱棣(002)', status: 'submitted', comment: '' },
    ],
  },
  gift: {
    approvalType: 'gift',
    applicant: '朱棣(002)',
    applyDate: '2026-07-17 10:00:00',
    flowNo: 'ZS202607170000',
    flowStatus: 'pending',
    brand: '閃蜂',
    giftGroupId: 'G001',
    giftGroupName: '廣州酒家',
    giftStoreId: 'S1001',
    giftStoreName: '澳門總店',
    giftBrand: '閃蜂',
    giftAdType: 'new_store',
    giftDays: 30,
    giftValidDays: 90,
    documents: [
      { type: 'image' }, { type: 'image' },
    ],
    notes: '商家需要推廣支持，申請贈送推廣金。',
    hasRevoke: true,
    timeline: [
      { node: 'finance', time: '--', approver: '--', status: 'pending', comment: '' },
      { node: 'operation', time: '2026-07-17 14:30:00', approver: '劉邦(000)', status: 'approved', comment: '同意贈送，商家推廣需求屬實。' },
      { node: 'business', time: '2026-07-17 11:20:00', approver: '朱元璋(001)', status: 'approved', comment: '已核實商家資質，同意贈送。' },
      { node: 'created', time: '2026-07-17 10:00:00', approver: '朱棣(002)', status: 'submitted', comment: '' },
    ],
  },
}

/** 標題映射（i18n key，value 為英文枚舉碼） */
const typeTitleMapKeys: Record<string, string> = {
  recharge: 'approvalDetail.typeTitleRecharge',
  deduct: 'approvalDetail.typeTitleDeduct',
  transfer: 'approvalDetail.typeTitleTransfer',
  merge: 'approvalDetail.typeTitleMerge',
  gift: 'approvalDetail.typeTitleGift',
}

const brandLabelMap: Record<string, string> = { flashBee: '閃蜂', mFood: 'mFood' }
/** 流程狀態映射（i18n key，value 為英文枚舉碼） */
const flowStatusLabelMapKeys: Record<string, string> = {
  pending: 'approvalCenter.flowPending', approved: 'approvalCenter.flowApproved',
  rejected: 'approvalCenter.flowRejected', cancelled: 'approvalCenter.flowCancelled',
}
/** 流程狀態標籤顏色（與審批中心列表保持一致：審核中藍/通過綠/駁回紅/撤銷灰） */
const flowStatusColorMap: Record<string, string> = {
  pending: 'processing', approved: 'success', rejected: 'error', cancelled: 'default',
}
/** 支付方式映射（i18n key，value 為英文枚舉碼） */
const payMethodLabelMapKeys: Record<string, string> = {
  corporate: 'approvalDetail.payMethodCorporate',
  mixed: 'approvalDetail.payMethodMixed',
  revenue: 'approvalDetail.payMethodRevenue',
}
/** 廣告類型映射（i18n key，value 為英文枚舉碼） */
const giftAdTypeLabelMapKeys: Record<string, string> = {
  new_store: 'approvalDetail.giftAdTypeNewStore',
  revival: 'approvalDetail.giftAdTypeRevival',
  exclusive: 'approvalDetail.giftAdTypeExclusive',
  gold: 'approvalDetail.giftAdTypeGold',
  ka: 'approvalDetail.giftAdTypeKa',
}
/** 扣款方式映射（i18n key，value 為英文枚舉碼） */
const deductMethodLabelMapKeys: Record<string, string> = {
  account: 'approvalDetail.deductMethodAccount',
  consume: 'approvalDetail.deductMethodConsume',
  batch: 'approvalDetail.deductMethodBatch',
}
/** 審批時間軸節點映射（i18n key，value 為英文枚舉碼） */
const timelineNodeMapKeys: Record<string, string> = {
  finance: 'approvalDetail.nodeFinance',
  operation: 'approvalDetail.nodeOperation',
  business: 'approvalDetail.nodeBusiness',
  created: 'approvalDetail.nodeCreated',
}

function num(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function str(v: unknown): string {
  return v == null ? '' : String(v)
}

/** extra 中的門店金額行（storeLabel 對應展示用的 storeName） */
function storeRows(v: unknown) {
  if (!Array.isArray(v)) return []
  return v.map(item => {
    const row = (item || {}) as Record<string, unknown>
    return {
      storeId: str(row.storeId),
      storeName: str(row.storeLabel ?? row.storeName),
      bd: str(row.bd),
      amount: num(row.amount),
    }
  })
}

/** 單個審批節點 → 時間軸項 */
function nodeItem(node: string, approver: string, time: string, status: string, rejectReason?: string): ApprovalTimelineItem {
  const normalized: ApprovalTimelineItem['status'] =
    status === 'approved' ? 'approved' : status === 'rejected' ? 'rejected' : 'pending'
  return {
    node,
    time: time && time !== '--' ? time : '--',
    approver: approver && approver !== '--' ? approver : '--',
    status: normalized,
    comment: '',
    rejectReason: normalized === 'rejected' ? rejectReason : undefined,
  }
}

/**
 * 審批記錄 → 審批詳情展示結構
 * 後端 FinApprovalVO.extra 與 approvalStore 寫入的 extra 同構，因此真實數據與降級數據共用本映射。
 */
function toDetailData(record: FinApproval, t?: (key: string) => string): ApprovalDetailData {
  const extra = (record.extra || {}) as Record<string, unknown>
  const brand = brandLabelMap[record.brand] || record.brand
  /** 業務類型代碼 → 翻譯標籤 */
  const bizTypeLabel = (code: string) => {
    if (!t) return code
    const map: Record<string, string> = { delivery: 'accountBalance.bizDelivery', store: 'accountBalance.bizStore' }
    return map[code] ? t(map[code]) : code
  }
  const base: ApprovalDetailData = {
    approvalType: record.approvalType as ApprovalDetailData['approvalType'],
    applicant: record.applicant,
    applyDate: record.applyTime,
    flowNo: record.flowNo,
    flowStatus: record.flowStatus,
    brand,
    groupId: record.groupId,
    groupName: record.groupName,
    notes: str(extra.remark),
    hasRevoke: record.flowStatus === 'pending',
    timeline: record.approvalNodes?.length
      ? [
          ...record.approvalNodes.map(n => ({
            node: n.nodeName,
            time: n.approvers?.find(a => a.status === 'approved' || a.status === 'rejected')?.time || '--',
            approver: n.approvers?.map(a => a.name).join(', ') || '--',
            status: (n.approvers?.some(a => a.status === 'rejected') ? 'rejected'
              : n.approvers?.every(a => a.status === 'approved' || a.status === 'skipped') ? 'approved'
              : 'pending') as ApprovalTimelineItem['status'],
            comment: '',
            rejectReason: n.approvers?.find(a => a.status === 'rejected')?.status === 'rejected' ? record.rejectReason : undefined,
            approvers: n.approvers?.map(a => ({ name: a.name, status: a.status, time: a.time })),
            approvalRule: n.approvalRule,
          })),
          { node: 'created', time: record.applyTime, approver: record.applicant, status: 'submitted' as const, comment: '' },
        ]
      : [
          nodeItem('finance', record.finApprover, record.finApproveTime, record.finApproveStatus, record.rejectReason),
          nodeItem('operation', record.opsApprover, record.opsApproveTime, record.opsApproveStatus, record.rejectReason),
          nodeItem('business', record.bizApprover, record.bizApproveTime, record.bizApproveStatus, record.rejectReason),
          { node: 'created', time: record.applyTime, approver: record.applicant, status: 'submitted' as const, comment: '' },
        ],
  }

  if (record.approvalType === 'recharge') {
    const payMethod = str(extra.payMethod) as ApprovalDetailData['payMethod']
    return {
      ...base,
      businessType: bizTypeLabel(str(extra.businessType)),
      businessChannel: str(extra.businessChannelLabel),
      bdPerson: str(extra.bd) || '--',
      isActual: extra.isActual === true,
      payMethod,
      settlementMethod: payMethod || '--',
      rechargeAmount: num(extra.virtualAmount),
      actualTotal: num(extra.actualTotal),
      discountAmount: num(extra.discountAmount),
      bankTransfer: num(extra.bankAmount),
      revenueDeduction: num(extra.revenueAmount),
      deductStores: storeRows(extra.deductStores),
    }
  }
  if (record.approvalType === 'deduct') {
    const method = str(extra.deductMethod)
    return {
      ...base,
      virtualBalance: num(extra.virtualBalance),
      deductMethodType: method as ApprovalDetailData['deductMethodType'],
      deductMethod: method,
      deductAmount: num(extra.deductAmount),
      consumeChannel: str(extra.consumeChannel),
      consumeStore: str(extra.consumeStore),
      consumeType: str(extra.consumeType),
      batchNo: str(extra.batchNo),
      batchDeductible: num(extra.batchDeductible),
      batchSettlement: str(extra.batchSettlement),
    }
  }
  if (record.approvalType === 'transfer') {
    return {
      ...base,
      fromGroupId: str(extra.fromGroupId),
      fromGroupName: str(extra.fromGroupName),
      fromBrand: brand,
      fromVirtualBalance: num(extra.fromVirtualBalance),
      toGroupId: str(extra.toGroupId),
      toGroupName: str(extra.toGroupName),
      toBrand: brand,
      transferAmount: num(extra.transferAmount),
    }
  }
  if (record.approvalType === 'merge') {
    return {
      ...base,
      sourceBrand: brand,
      mergeGroupId: str(extra.sourceGroupId),
      mergeGroupName: str(extra.sourceGroupName),
      mergeBrand: brand,
      mergeVirtualBalance: num(extra.sourceVirtualBalance),
      mergeDebtAmount: num(extra.sourceDebtAmount),
      mergeToGroupId: str(extra.targetGroupId),
      mergeToGroupName: str(extra.targetGroupName),
      mergeToBrand: brand,
      repayStores: storeRows(extra.repayStores),
    }
  }
  if (record.approvalType === 'gift') {
    const adType = str(extra.adType)
    const credentials = Array.isArray(extra.credentials) ? (extra.credentials as string[]) : []
    return {
      ...base,
      giftGroupId: str(extra.groupCode) || record.groupId,
      giftGroupName: str(extra.groupName) || record.groupName,
      giftStoreId: str(extra.storeCode) || str(extra.storeId),
      giftStoreName: str(extra.storeName),
      giftBrand: brand,
      giftAdType: adType,
      giftDays: num(extra.giftDays),
      giftValidDays: num(extra.validDays),
      notes: str(extra.reason) || str(extra.remark),
      documents: credentials.map(name => ({
        type: name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'image',
        name,
      })),
    }
  }
  return base
}

export default function ApprovalDetail() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const urlType = searchParams.get('type') || 'recharge'
  const flowNo = searchParams.get('flowNo') || ''

  /** 後端不可用時的降級詳情：本地審批記錄優先，其次靜態演示數據 */
  const fallbackDetail = useCallback((): ApprovalDetailData => {
    const local = getApprovalRecordByFlowNo(flowNo)
    if (local) return toDetailData(local as unknown as FinApproval, t)
    return mockDetails[flowNo] || mockDetails[urlType] || mockDetails['CZ202601160000']
  }, [flowNo, urlType, t])

  const [data, setData] = useState<ApprovalDetailData>(fallbackDetail)
  const [submitting, setSubmitting] = useState(false)
  const [approvalComment, setApprovalComment] = useState('')
  const [showRevokeModal, setShowRevokeModal] = useState(false)
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  /** 審批類型以記錄為準（未加載到時回退 URL 參數） */
  const type = data.approvalType || urlType
  /** 僅審批中的流程可通過/駁回 */
  const isPending = data.flowStatus === 'pending'

  /** 加載審批詳情 */
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (!flowNo) return
      try {
        const record = await fetchFinApprovalDetail(flowNo).catch(() => null)
        if (!cancelled) setData(record ? toDetailData(record, t) : fallbackDetail())
      } catch {
        // 流程不存在等業務錯誤：保留降級展示
        if (!cancelled) setData(fallbackDetail())
      }
    }
    void load()
    return () => { cancelled = true }
  }, [flowNo, fallbackDetail])

  const handleApprove = () => {
    // 贈送 ZS 流程為前端審批，需校驗當前人是否具備當前節點角色權限
    if (type === 'gift') {
      const localRecord = getApprovalRecordByFlowNo(flowNo)
      if (localRecord) {
        const check = hasNodeApprovalRole(localRecord)
        if (!check.ok) {
          message.error(`您沒有「${check.nodeName}」節點的角色權限，無法審批`)
          return
        }
      }
    }
    Modal.confirm({
      title: t('approvalDetail.approveConfirm'),
      content: t('approvalDetail.approveContent'),
      okText: t('approvalDetail.approveOk'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        setSubmitting(true)
        try {
          // 三級逐級推進（業務→運營→財務），財務節點通過同時寫入批次/明細/欠款單；贈送 TG 流程為前端記錄，直接本地審批
          const result = type === 'gift'
            ? approveCurrentNode(flowNo)
            : await approveFinApproval(flowNo)
          if (result) {
            message.success(result.finished
              ? t('approvalDetail.approveFinished', {
                  nodeName: result.nodeName,
                  writtenDesc: type === 'gift' ? t('approvalDetail.giftWritten') : t('approvalDetail.dataWritten'),
                })
              : t('approvalDetail.approveNext', { nodeName: result.nodeName, nextNode: result.nextNode }))
          } else {
            message.success(t('approvalCenter.approveSuccess'))
          }
          navigate('/approval-center')
        } catch (err) {
          // 無審批權限（403）或餘額不足等業務校驗失敗，展示後端給出的具體原因
          message.error((err as Error)?.message || t('approvalDetail.approveFailed'))
        } finally {
          setSubmitting(false)
        }
      },
    })
  }

  const handleReject = () => {
    setShowRejectModal(true)
  }

  const handleRejectConfirm = async () => {
    if (!rejectReason.trim()) {
      return
    }
    // 贈送 ZS 流程為前端審批，需校驗當前人是否具備當前節點角色權限
    if (type === 'gift') {
      const localRecord = getApprovalRecordByFlowNo(flowNo)
      if (localRecord) {
        const check = hasNodeApprovalRole(localRecord)
        if (!check.ok) {
          message.error(`您沒有「${check.nodeName}」節點的角色權限，無法駁回`)
          return
        }
      }
    }
    setSubmitting(true)
    try {
      // 駁回當前節點，流程結束（合併駁回時解凍雙方賬戶）；贈送 TG 流程直接本地駁回
      const rejectedNode = type === 'gift'
        ? rejectCurrentNode(flowNo, rejectReason)
        : (await rejectFinApproval(flowNo, rejectReason), null)
      message.success(rejectedNode
        ? t('approvalDetail.rejectDone', { nodeName: rejectedNode })
        : t('approvalCenter.rejectSuccess'))
      setShowRejectModal(false)
      navigate('/approval-center')
    } catch (err) {
      message.error((err as Error)?.message || t('approvalDetail.rejectFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleRevoke = () => {
    setShowRevokeModal(true)
  }

  const handleRevokeConfirm = async () => {
    setSubmitting(true)
    try {
      // 贈送 TG 流程為前端記錄，直接本地撤銷，不調後端
      if (type === 'gift') {
        updateApprovalRecord(flowNo, { flowStatus: 'cancelled' })
      } else {
        await cancelFinApproval(flowNo)
      }
      message.success(t('approvalDetail.revokeSuccess'))
      setShowRevokeModal(false)
      navigate('/approval-center')
    } catch (err) {
      message.error((err as Error)?.message || t('approvalDetail.revokeFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  const renderStatusTag = (status: string) => {
    const colorMap: Record<string, string> = {
      approved: 'success',
      rejected: 'error',
      submitted: 'processing',
      pending: 'default',
    }
    const statusKeyMap: Record<string, string> = {
      approved: 'approvalCenter.statusApproved',
      rejected: 'approvalCenter.statusRejected',
      submitted: 'approvalDetail.statusSubmitted',
      pending: 'approvalCenter.statusPending',
    }
    const labelKey = statusKeyMap[status] || statusKeyMap.pending
    return <Tag color={colorMap[status] || 'default'}>{t(labelKey)}</Tag>
  }

  const renderDocument = (doc: { type: string; name?: string }, index: number) => {
    if (doc.type === 'image') {
      return (
        <div key={index} className="approval-doc-thumb">
          <FileImageOutlined className="approval-doc-icon" style={{ color: '#1890ff' }} />
        </div>
      )
    }
    if (doc.type === 'pdf') {
      return (
        <div key={index} className="approval-doc-thumb">
          <FilePdfOutlined className="approval-doc-icon" style={{ color: '#e53935' }} />
          <span className="approval-doc-pdf-label">PDF</span>
        </div>
      )
    }
    return (
      <div key={index} className="approval-doc-thumb approval-doc-thumb--view">
        <EyeOutlined className="approval-doc-icon" style={{ color: '#666' }} />
        <span className="approval-doc-view-label">{t('approvalDetail.viewDoc')}</span>
      </div>
    )
  }

  return (
    <div className="approval-detail-page">
      {/* 顶部标题栏 */}
      <div style={{
        position: 'relative', background: '#fff', marginBottom: 16,
        borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        overflow: 'hidden',
      }}>
        <div style={{
          height: 3, background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
          backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite',
        }} />
        <div style={{
          padding: '16px 24px', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', animation: 'headerFadeSlideIn 0.5s ease',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Button type="primary" icon={<ArrowLeftOutlined />}
              onClick={() => navigate('/approval-center')}
              style={{
                backgroundColor: '#E8720C', borderColor: '#E8720C',
                borderRadius: 8, height: 36, padding: '0 16px',
                display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            >{t('common.back')}</Button>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>
                {typeTitleMapKeys[type] ? t(typeTitleMapKeys[type]) : type}
              </h2>
              <Tag color="blue">{data.brand}</Tag>
              <span style={{ fontSize: 13, color: '#8C8C8C' }}>{data.applyDate.split(' ')[0]}</span>
              <span style={{ fontSize: 13, color: '#595959', fontWeight: 500 }}>{data.applicant}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button onClick={() => navigate('/approval-center')}>{t('common.back')}</Button>
            {data.hasRevoke && (
              <Button icon={<UndoOutlined />} onClick={handleRevoke}>{t('approvalCenter.cancel')}</Button>
            )}
            {isPending && (
              <>
                <Button type="primary" loading={submitting} onClick={handleApprove}>{t('approvalCenter.statusApproved')}</Button>
                <Button danger loading={submitting} onClick={handleReject}>{t('approvalCenter.statusRejected')}</Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 主体内容 */}
      <div className="approval-detail-body">
        {/* 左侧信息 */}
        <div className="approval-detail-left">
          {/* 基本信息 */}
          <div className="approval-section">
            <div className="approval-section-title approval-section-title--blue">{t('approvalDetail.baseInfo')}</div>
            <div className="approval-info-grid">
              <div className="approval-info-item">
                <span className="approval-info-label">{t('approvalCenter.colApplicant')}</span>
                <span className="approval-info-value">{data.applicant}</span>
              </div>
              <div className="approval-info-item">
                <span className="approval-info-label">{t('approvalDetail.applyDate')}</span>
                <span className="approval-info-value">{data.applyDate}</span>
              </div>
              <div className="approval-info-item">
                <span className="approval-info-label">{t('common.colFlowNo')}</span>
                <span className="approval-info-value">{data.flowNo}</span>
              </div>
              <div className="approval-info-item">
                <span className="approval-info-label">{t('approvalCenter.colFlowStatus')}</span>
                <span className="approval-info-value">
                  <Tag color={flowStatusColorMap[data.flowStatus] || 'default'} className="approval-status-tag">{flowStatusLabelMapKeys[data.flowStatus] ? t(flowStatusLabelMapKeys[data.flowStatus]) : data.flowStatus}</Tag>
                </span>
              </div>
            </div>
          </div>

          {/* 充值类型 */}
          {type === 'recharge' && (
            <>
              {/* 充值帳戶資訊 */}
              <div className="approval-section">
                <div className="approval-section-title approval-section-title--purple">{t('approvalDetail.rechargeAccountInfo')}</div>
                <div className="approval-info-grid">
                  <div className="approval-info-item">
                    <span className="approval-info-label">{t('common.colGroupId')}</span>
                    <span className="approval-info-value">{data.groupId}</span>
                  </div>
                  <div className="approval-info-item">
                    <span className="approval-info-label">{t('common.colGroupName')}</span>
                    <span className="approval-info-value">{data.groupName}</span>
                  </div>
                  <div className="approval-info-item">
                    <span className="approval-info-label">{t('common.colBrand')}</span>
                    <span className="approval-info-value">{data.brand}</span>
                  </div>
                  <div className="approval-info-item">
                    <span className="approval-info-label">{t('approvalDetail.bizType')}</span>
                    <span className="approval-info-value">{data.businessType}</span>
                  </div>
                  <div className="approval-info-item">
                    <span className="approval-info-label">{t('approvalDetail.bizChannel')}</span>
                    <span className="approval-info-value">{data.businessChannel}</span>
                  </div>
                  <div className="approval-info-item">
                    <span className="approval-info-label">{t('common.colBd')}</span>
                    <span className="approval-info-value">{data.bdPerson}</span>
                  </div>
                </div>
              </div>

              {/* 充值金額明細 */}
              <div className="approval-section">
                <div className="approval-section-title approval-section-title--orange">{t('approvalDetail.rechargeAmountDetail')}</div>
                <div className="approval-info-grid">
                  <div className="approval-info-item">
                    <span className="approval-info-label">{t('approvalDetail.isActual')}</span>
                    <span className="approval-info-value">{t(data.isActual ? 'approvalDetail.yes' : 'approvalDetail.no')}</span>
                  </div>
                  <div className="approval-info-item">
                    <span className="approval-info-label">{t('approvalDetail.virtualRecharge')}</span>
                    <span className="approval-info-value approval-amount--orange">MOP {data.rechargeAmount?.toLocaleString()}</span>
                  </div>
                  {/* 僅實收時展示結算方式及明細 */}
                  {data.isActual && (
                    <>
                      <div className="approval-info-item">
                        <span className="approval-info-label">{t('approvalDetail.settlementMethod')}</span>
                        <span className="approval-info-value">{payMethodLabelMapKeys[data.settlementMethod ?? ''] ? t(payMethodLabelMapKeys[data.settlementMethod ?? '']) : data.settlementMethod}</span>
                      </div>
                      {/* 對公轉賬：僅銀行轉賬 */}
                      {data.payMethod === 'corporate' && (
                        <div className="approval-info-item">
                          <span className="approval-info-label">{t('approvalDetail.bankTransfer')}</span>
                          <span className="approval-info-value approval-amount--blue">MOP {data.bankTransfer?.toLocaleString()}</span>
                        </div>
                      )}
                      {/* 混合支付：銀行轉賬 + 營業額扣款 */}
                      {data.payMethod === 'mixed' && (
                        <>
                          <div className="approval-info-item">
                            <span className="approval-info-label">{t('approvalDetail.bankTransfer')}</span>
                            <span className="approval-info-value approval-amount--blue">MOP {data.bankTransfer?.toLocaleString()}</span>
                          </div>
                          <div className="approval-info-item">
                            <span className="approval-info-label">{t('approvalDetail.revenueDeduction')}</span>
                            <span className="approval-info-value approval-amount--purple">MOP {data.revenueDeduction?.toLocaleString()}</span>
                          </div>
                          <div className="approval-info-item">
                            <span className="approval-info-label">{t('approvalDetail.actualRechargeTotal')}</span>
                            <span className="approval-info-value approval-amount--orange">MOP {data.actualTotal?.toLocaleString()}</span>
                          </div>
                        </>
                      )}
                      {/* 營業額支付：僅營業額扣款 */}
                      {data.payMethod === 'revenue' && (
                        <>
                          <div className="approval-info-item">
                            <span className="approval-info-label">{t('approvalDetail.revenueDeduction')}</span>
                            <span className="approval-info-value approval-amount--purple">MOP {data.revenueDeduction?.toLocaleString()}</span>
                          </div>
                          <div className="approval-info-item">
                            <span className="approval-info-label">{t('approvalDetail.actualRechargeTotal')}</span>
                            <span className="approval-info-value approval-amount--orange">MOP {data.actualTotal?.toLocaleString()}</span>
                          </div>
                        </>
                      )}
                      <div className="approval-info-item">
                        <span className="approval-info-label">{t('approvalDetail.discountAmount')}</span>
                        <span className="approval-info-value approval-amount--green">MOP {(data.discountAmount ?? 0).toLocaleString()}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* 扣款門店（僅實收 & 混合支付/營業額支付時展示） */}
              {data.isActual && (data.payMethod === 'mixed' || data.payMethod === 'revenue') && data.deductStores && data.deductStores.length > 0 && (
                <div className="approval-section">
                  <div className="approval-section-title">{t('approvalDetail.deductStores')}</div>
                  <table className="approval-repayment-table">
                    <thead>
                      <tr>
                        <th>{t('common.colStoreId')}</th>
                        <th>{t('common.colStoreName')}</th>
                        <th>{t('approvalDetail.deductAmount')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.deductStores.map((store, i) => (
                        <tr key={i}>
                          <td>{store.storeId}</td>
                          <td>{store.storeName}</td>
                          <td>
                            <span style={{
                              display: 'inline-block', padding: '2px 10px', borderRadius: 4,
                              background: '#fff7e6', color: '#E8720C', fontWeight: 600, fontSize: 13,
                              border: '1px solid #ffd591',
                            }}>MOP {store.amount.toLocaleString()}</span>
                          </td>
                        </tr>
                      ))}
                      <tr style={{ fontWeight: 600, background: '#fafafa' }}>
                        <td colSpan={2} style={{ textAlign: 'right' }}>{t('approvalDetail.total')}</td>
                        <td>
                          <span style={{
                            display: 'inline-block', padding: '2px 10px', borderRadius: 4,
                            background: '#E8720C', color: '#fff', fontWeight: 700, fontSize: 13,
                          }}>MOP {data.deductStores.reduce((s, r) => s + r.amount, 0).toLocaleString()}</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* 扣款类型 */}
          {type === 'deduct' && (
            <>
              {/* 基础信息 */}
              <div className="approval-section">
                <div className="approval-section-title approval-section-title--purple">{t('approvalDetail.baseInfo')}</div>
                <div className="approval-info-grid">
                  <div className="approval-info-item">
                    <span className="approval-info-label">{t('common.colGroupId')}</span>
                    <span className="approval-info-value">{data.groupId}</span>
                  </div>
                  <div className="approval-info-item">
                    <span className="approval-info-label">{t('common.colGroupName')}</span>
                    <span className="approval-info-value">{data.groupName}</span>
                  </div>
                  <div className="approval-info-item">
                    <span className="approval-info-label">{t('common.colBrand')}</span>
                    <span className="approval-info-value">{data.brand}</span>
                  </div>
                </div>
              </div>
              {/* 扣款方式 */}
              <div className="approval-section">
                <div className="approval-section-title approval-section-title--orange">{t('approvalDetail.deductMethodTitle')}</div>
                <div className="approval-info-grid">
                  <div className="approval-info-item">
                    <span className="approval-info-label">{t('approvalDetail.deductMethodTitle')}</span>
                    <span className="approval-info-value"><Tag color="orange">{deductMethodLabelMapKeys[data.deductMethod ?? ''] ? t(deductMethodLabelMapKeys[data.deductMethod ?? '']) : data.deductMethod}</Tag></span>
                  </div>
                  <div className="approval-info-item">
                    <span className="approval-info-label">{t('approvalDetail.deductAmount')}</span>
                    <span className="approval-info-value approval-amount--red">MOP {data.deductAmount?.toLocaleString()}</span>
                  </div>
                  {/* 消费扣款特有字段 */}
                  {data.deductMethodType === 'consume' && (
                    <>
                      <div className="approval-info-item">
                        <span className="approval-info-label">{t('approvalDetail.bizChannel')}</span>
                        <span className="approval-info-value">{data.consumeChannel}</span>
                      </div>
                      <div className="approval-info-item">
                        <span className="approval-info-label">{t('common.colStoreName')}</span>
                        <span className="approval-info-value">{data.consumeStore}</span>
                      </div>
                      <div className="approval-info-item">
                        <span className="approval-info-label">{t('approvalDetail.consumeType')}</span>
                        <span className="approval-info-value">{data.consumeType}</span>
                      </div>
                    </>
                  )}
                  {/* 充值批次扣款特有字段 */}
                  {data.deductMethodType === 'batch' && (
                    <>
                      <div className="approval-info-item">
                        <span className="approval-info-label">{t('common.colBatchNo')}</span>
                        <span className="approval-info-value"><Tag color="blue">{data.batchNo}</Tag></span>
                      </div>
                      <div className="approval-info-item">
                        <span className="approval-info-label">{t('approvalDetail.batchDeductible')}</span>
                        <span className="approval-info-value approval-amount--blue">MOP {data.batchDeductible?.toLocaleString()}</span>
                      </div>
                      <div className="approval-info-item">
                        <span className="approval-info-label">{t('approvalDetail.settlementMethod')}</span>
                        <span className="approval-info-value">{data.batchSettlement}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </>
          )}

          {/* 转账类型 */}
          {type === 'transfer' && (
            <>
              {/* 转出集团资讯 */}
              <div className="approval-section">
                <div className="approval-section-title approval-section-title--purple">{t('approvalDetail.fromGroup')}</div>
                <div className="approval-info-grid">
                  <div className="approval-info-item">
                    <span className="approval-info-label">{t('common.colGroupId')}</span>
                    <span className="approval-info-value">{data.fromGroupId}</span>
                  </div>
                  <div className="approval-info-item">
                    <span className="approval-info-label">{t('common.colGroupName')}</span>
                    <span className="approval-info-value">{data.fromGroupName}</span>
                  </div>
                  <div className="approval-info-item">
                    <span className="approval-info-label">{t('common.colBrand')}</span>
                    <span className="approval-info-value">{data.fromBrand}</span>
                  </div>
                </div>
              </div>
              {/* 转入集团资讯 */}
              <div className="approval-section">
                <div className="approval-section-title approval-section-title--green">{t('approvalDetail.toGroup')}</div>
                <div className="approval-info-grid">
                  <div className="approval-info-item">
                    <span className="approval-info-label">{t('common.colGroupId')}</span>
                    <span className="approval-info-value">{data.toGroupId}</span>
                  </div>
                  <div className="approval-info-item">
                    <span className="approval-info-label">{t('common.colGroupName')}</span>
                    <span className="approval-info-value">{data.toGroupName}</span>
                  </div>
                  <div className="approval-info-item">
                    <span className="approval-info-label">{t('common.colBrand')}</span>
                    <span className="approval-info-value">{data.toBrand}</span>
                  </div>
                </div>
              </div>
              {/* 转账金额 */}
              <div className="approval-section">
                <div className="approval-section-title approval-section-title--orange">{t('approvalDetail.transferAmountTitle')}</div>
                <div className="approval-info-grid">
                  <div className="approval-info-item">
                    <span className="approval-info-label">{t('approvalDetail.transferAmountTitle')}</span>
                    <span className="approval-info-value approval-amount--orange">MOP {data.transferAmount?.toLocaleString()}</span>
                  </div>
                  <div className="approval-info-item">
                    <span className="approval-info-label">{t('approvalDetail.fromGroupDeduct')}</span>
                    <span className="approval-info-value approval-amount--red">-MOP {data.transferAmount?.toLocaleString()}</span>
                  </div>
                  <div className="approval-info-item">
                    <span className="approval-info-label">{t('approvalDetail.toGroupAdd')}</span>
                    <span className="approval-info-value approval-amount--green">+MOP {data.transferAmount?.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* 合并类型 */}
          {type === 'merge' && (
            <>
              {/* 合并集团资讯 */}
              <div className="approval-section">
                <div className="approval-section-title approval-section-title--purple">{t('approvalDetail.cancelledGroup')} <Tag color="red" style={{ fontSize: 11, marginLeft: 4 }}>{t('approvalDetail.closingSoon')}</Tag></div>
                <div className="approval-info-grid">
                  <div className="approval-info-item">
                    <span className="approval-info-label">{t('common.colGroupId')}</span>
                    <span className="approval-info-value">{data.mergeGroupId}</span>
                  </div>
                  <div className="approval-info-item">
                    <span className="approval-info-label">{t('common.colGroupName')}</span>
                    <span className="approval-info-value">{data.mergeGroupName}</span>
                  </div>
                  <div className="approval-info-item">
                    <span className="approval-info-label">{t('common.colBrand')}</span>
                    <span className="approval-info-value">{data.mergeBrand}</span>
                  </div>
                  <div className="approval-info-item">
                    <span className="approval-info-label">{t('approvalDetail.virtualBalance')}</span>
                    <span className="approval-info-value approval-amount--blue">MOP {data.mergeVirtualBalance?.toLocaleString()}</span>
                  </div>
                  <div className="approval-info-item">
                    <span className="approval-info-label">{t('approvalDetail.debtAmount')}</span>
                    <span className="approval-info-value approval-amount--red">MOP {data.mergeDebtAmount?.toLocaleString()}</span>
                  </div>
                </div>
              </div>
              {/* 被合并集团资讯 */}
              <div className="approval-section">
                <div className="approval-section-title approval-section-title--green">{t('approvalDetail.survivingGroup')} <Tag color="green" style={{ fontSize: 11, marginLeft: 4 }}>{t('approvalDetail.receivingAssets')}</Tag></div>
                <div className="approval-info-grid">
                  <div className="approval-info-item">
                    <span className="approval-info-label">{t('common.colGroupId')}</span>
                    <span className="approval-info-value">{data.mergeToGroupId}</span>
                  </div>
                  <div className="approval-info-item">
                    <span className="approval-info-label">{t('common.colGroupName')}</span>
                    <span className="approval-info-value">{data.mergeToGroupName}</span>
                  </div>
                  <div className="approval-info-item">
                    <span className="approval-info-label">{t('common.colBrand')}</span>
                    <span className="approval-info-value">{data.mergeToBrand}</span>
                  </div>
                </div>
              </div>
              {/* 欠款偿还 */}
              {data.repayStores && data.repayStores.length > 0 && (
                <div className="approval-section">
                  <div className="approval-section-title" style={{ borderLeftColor: '#ff4d4f', color: '#ff4d4f' }}>{t('approvalDetail.debtRepayment')}</div>
                  <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 12 }}>
                    {t('approvalDetail.debtRepaymentDesc', { amount: data.mergeDebtAmount?.toLocaleString() })}
                  </div>
                  <Table
                    size="small"
                    bordered
                    pagination={false}
                    dataSource={data.repayStores}
                    rowKey="storeId"
                    columns={[
                      {
                        title: t('approvalDetail.storeIdName'), dataIndex: 'storeName', width: 280,
                        render: (val: string) => <span>{val}</span>,
                      },
                      {
                        title: t('common.colBd'), dataIndex: 'bd', width: 120, align: 'center' as const,
                        render: (val: string) => <Tag color="blue">{val}</Tag>,
                      },
                      {
                        title: t('approvalDetail.repayAmount'), dataIndex: 'amount', width: 160, align: 'right' as const,
                        render: (val: number) => (
                          <span style={{
                            padding: '2px 10px', borderRadius: 4,
                            background: '#fff7e6', color: '#E8720C', fontWeight: 600, fontSize: 13,
                            border: '1px solid #ffd591',
                          }}>
                            MOP {val.toLocaleString()}
                          </span>
                        ),
                      },
                    ]}
                    summary={() => {
                      const total = data.repayStores!.reduce((sum, s) => sum + s.amount, 0)
                      return (
                        <Table.Summary fixed>
                          <Table.Summary.Row>
                            <Table.Summary.Cell index={0} colSpan={2} align="center">
                              <strong>{t('approvalDetail.allocatedTotal')}</strong>
                            </Table.Summary.Cell>
                            <Table.Summary.Cell index={1} align="center">
                              <span style={{
                                padding: '2px 10px', borderRadius: 4,
                                background: '#E8720C', color: '#fff', fontWeight: 700, fontSize: 13,
                              }}>
                                MOP {total.toLocaleString()}
                              </span>
                            </Table.Summary.Cell>
                          </Table.Summary.Row>
                        </Table.Summary>
                      )
                    }}
                  />
                  {data.repayStores && (
                    <div style={{ marginTop: 8, fontSize: 12, textAlign: 'right' }}>
                      {data.repayStores.reduce((sum, r) => sum + r.amount, 0) < (data.mergeDebtAmount || 0) && (
                        <span style={{ color: '#ff4d4f' }}>
                          {t('approvalDetail.unallocated', { amount: (data.mergeDebtAmount! - data.repayStores.reduce((sum, r) => sum + r.amount, 0)).toLocaleString() })}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* 赠送类型 */}
          {type === 'gift' && (
            <div className="approval-section">
              <div className="approval-section-title approval-section-title--purple">{t('approvalDetail.giftConfig')}</div>
              <div className="approval-info-grid">
                <div className="approval-info-item">
                  <span className="approval-info-label">{t('common.colGroupId')}</span>
                  <span className="approval-info-value">{data.giftGroupId}</span>
                </div>
                <div className="approval-info-item">
                  <span className="approval-info-label">{t('common.colGroupName')}</span>
                  <span className="approval-info-value">{data.giftGroupName}</span>
                </div>
                <div className="approval-info-item">
                  <span className="approval-info-label">{t('common.colStoreId')}</span>
                  <span className="approval-info-value">{data.giftStoreId}</span>
                </div>
                <div className="approval-info-item">
                  <span className="approval-info-label">{t('common.colStoreName')}</span>
                  <span className="approval-info-value">{data.giftStoreName}</span>
                </div>
                <div className="approval-info-item">
                  <span className="approval-info-label">{t('common.colBrand')}</span>
                  <span className="approval-info-value">{data.giftBrand}</span>
                </div>
                <div className="approval-info-item">
                  <span className="approval-info-label">{t('approvalDetail.adType')}</span>
                  <span className="approval-info-value approval-gift-highlight">{giftAdTypeLabelMapKeys[data.giftAdType ?? ''] ? t(giftAdTypeLabelMapKeys[data.giftAdType ?? '']) : data.giftAdType}</span>
                </div>
                <div className="approval-info-item">
                  <span className="approval-info-label">{t('approvalDetail.giftDays')}</span>
                  <span className="approval-info-value approval-gift-highlight">{data.giftDays} {t('approvalDetail.days')}</span>
                </div>
                <div className="approval-info-item">
                  <span className="approval-info-label">{t('approvalDetail.validDays')}</span>
                  <span className="approval-info-value approval-gift-highlight">{data.giftValidDays ?? '--'} {t('approvalDetail.days')}</span>
                </div>
              </div>
            </div>
          )}

          {/* 相关凭证 */}
          <div className="approval-section">
            <div className="approval-section-title">{t('approvalDetail.documents')}</div>
            <div className="approval-documents">
              {data.documents?.map((doc, i) => renderDocument(doc, i))}
            </div>
          </div>

          {/* 备注信息 */}
          <div className="approval-section">
            <div className="approval-section-title">{t('approvalDetail.notesTitle')}</div>
            <div className="approval-notes">{data.notes}</div>
          </div>

          {/* 审批意见 */}
          <div className="approval-section">
            <div className="approval-section-title">{t('approvalDetail.commentTitle')}</div>
            <Input.TextArea
              rows={3}
              placeholder={t('approvalDetail.commentPlaceholder')}
              maxLength={200}
              showCount
              value={approvalComment}
              onChange={(e) => setApprovalComment(e.target.value)}
            />
          </div>
        </div>

        {/* 右侧审批流 */}
        <div className="approval-detail-right">
          <div className="approval-timeline-title">{t('approvalCenter.flowSection')}</div>
          <div className="approval-timeline">
            {data.timeline.map((item, index) => (
              <div key={index} className={`approval-timeline-item approval-timeline-item--${item.status}`}>
                <div className="approval-timeline-dot" />
                <div className="approval-timeline-content">
                  <div className="approval-timeline-header">
                    <span className="approval-timeline-node">{timelineNodeMapKeys[item.node] ? t(timelineNodeMapKeys[item.node]) : item.node}</span>
                    <span className="approval-timeline-time">{item.time}</span>
                  </div>
                  {item.approvers?.length ? (
                    <div style={{ fontSize: 12, color: '#666', lineHeight: 2, marginTop: 4 }}>
                      {item.approvers.map((a, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span>{a.status === 'skipped' ? <s style={{ color: '#bbb' }}>{a.name}</s> : a.name}</span>
                          {renderStatusTag(a.status === 'skipped' ? 'pending' : a.status)}
                          <span style={{ color: '#999', fontSize: 11 }}>{a.time || '--'}</span>
                        </div>
                      ))}
                      {item.approvalRule === 'all' && (
                        <Tag color="orange" style={{ fontSize: 11, marginTop: 2 }}>{t('approvalCenter.countersign')}</Tag>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="approval-timeline-info">
                        {item.status === 'submitted' ? t('approvalCenter.colApplicant') : t('approvalCenter.colApprover')}：{item.approver}
                      </div>
                      <div className="approval-timeline-status">
                        {renderStatusTag(item.status)}
                      </div>
                    </>
                  )}
                  {item.comment && (
                    <div className="approval-timeline-comment">
                      <span className="approval-timeline-comment-label">{t('approvalDetail.commentTitle')}：</span>
                      {item.comment}
                    </div>
                  )}
                  {item.rejectReason && (
                    <div className="approval-timeline-reject">
                      <span className="approval-timeline-reject-label">{t('approvalCenter.rejectReasonTitle')}：</span>
                      {item.rejectReason}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 底部操作栏 */}
      <div className="approval-detail-footer">
        <Button onClick={() => navigate('/approval-center')}>{t('common.back')}</Button>
        {data.hasRevoke && (
          <Button icon={<UndoOutlined />} onClick={handleRevoke}>{t('approvalCenter.cancel')}</Button>
        )}
        {isPending && (
          <>
            {/* 赠送审批角色权限提示：显示当前节点所需角色 */}
            {type === 'gift' && (() => {
              const localRecord = getApprovalRecordByFlowNo(flowNo)
              if (!localRecord) return null
              const requiredRole = getRequiredApprovalRole(localRecord)
              if (!requiredRole) return null
              const nodeName = APPROVAL_NODE_LABELS[requiredRole] || requiredRole
              // 检查当前用户是否有该角色
              let hasRole = false
              try {
                const info = JSON.parse(localStorage.getItem('user_info') || '{}')
                if (info.role === 'admin') hasRole = true
                else hasRole = (info.functionRoleCodes || []).includes(requiredRole)
              } catch { /* ignore */ }
              return (
                <Tag color={hasRole ? 'green' : 'red'} style={{ marginRight: 4 }}>
                  當前節點：{nodeName}{hasRole ? ' ✓' : ' ✗'}
                </Tag>
              )
            })()}
            <Button type="primary" loading={submitting} onClick={handleApprove}>{t('approvalCenter.statusApproved')}</Button>
            <Button danger loading={submitting} onClick={handleReject}>{t('approvalCenter.statusRejected')}</Button>
          </>
        )}
      </div>

      {/* 撤销确认弹窗 */}
      <Modal
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{t('approvalCenter.cancelTitle')}</span>
            <Button type="link" size="small" onClick={() => setShowRevokeModal(false)} style={{ padding: 0 }}>{t('approvalDetail.close')}</Button>
          </div>
        }
        open={showRevokeModal}
        onCancel={() => setShowRevokeModal(false)}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
            <Button onClick={() => setShowRevokeModal(false)}>{t('common.cancel')}</Button>
            <Button type="primary" loading={submitting} onClick={handleRevokeConfirm}>{t('approvalDetail.confirmCancel')}</Button>
          </div>
        }
        width={440}
        centered
      >
        <div className="revoke-modal-content">
          <div className="revoke-modal-icon">
            <ExclamationCircleOutlined />
          </div>
          <div className="revoke-modal-question">{t('approvalDetail.revokeQuestion')}</div>
          <div className="revoke-modal-warning">{t('approvalDetail.revokeWarning')}</div>
        </div>
      </Modal>

      {/* 驳回弹窗 */}
      <Modal
        title={t('approvalDetail.rejectTitle')}
        open={showRejectModal}
        onCancel={() => setShowRejectModal(false)}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
            <Button onClick={() => setShowRejectModal(false)}>{t('common.cancel')}</Button>
            <Button danger loading={submitting} onClick={handleRejectConfirm} disabled={!rejectReason.trim()}>{t('approvalDetail.confirmReject')}</Button>
          </div>
        }
        width={480}
      >
        <div style={{ padding: '16px 0' }}>
          <div style={{ marginBottom: 8, fontWeight: 500 }}>{t('approvalCenter.rejectReasonTitle')} <span style={{ color: '#E53935' }}>*</span></div>
          <Input.TextArea
            rows={4}
            placeholder={t('approvalCenter.rejectPlaceholder')}
            maxLength={200}
            showCount
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
          />
        </div>
      </Modal>
    </div>
  )
}
