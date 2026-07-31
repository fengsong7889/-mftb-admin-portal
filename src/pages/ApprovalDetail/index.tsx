import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Tag, Input, Modal, Table, message } from 'antd'
import {
  ArrowLeftOutlined,
  CheckOutlined,
  CloseOutlined,
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
} from '../../utils/approvalStore'
import {
  fetchFinApprovalDetail,
  approveFinApproval,
  rejectFinApproval,
  cancelFinApproval,
  withFinanceFallback,
} from '../../api/finance'
import type { FinApproval } from '../../api/finance'

/** 审批历史记录 */
interface ApprovalTimelineItem {
  node: string
  time: string
  approver: string
  status: 'approved' | 'rejected' | 'submitted' | 'pending'
  comment: string
  rejectReason?: string
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
  // 推广赠送
  giftGroupId?: string
  giftGroupName?: string
  giftStoreId?: string
  giftStoreName?: string
  giftBrand?: string
  giftAdType?: string
  giftDays?: number
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
    flowStatus: '審核中',
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
      { node: '財務主管審批', time: '--', approver: '--', status: 'pending', comment: '' },
      { node: '運營主管審批', time: '--', approver: '--', status: 'pending', comment: '' },
      { node: '業務主管審批', time: '--', approver: '--', status: 'pending', comment: '' },
      { node: '流程創建', time: '2026-01-16 09:16:21', approver: '朱棣(002)', status: 'submitted', comment: '' },
    ],
  },
  // 充值 — 混合支付
  'CZ202601160001': {
    approvalType: 'recharge',
    applicant: '朱棣(002)',
    applyDate: '2026-01-16 09:16:21',
    flowNo: 'CZ202601160001',
    flowStatus: '審核中',
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
      { node: '財務主管審批', time: '--', approver: '--', status: 'pending', comment: '' },
      { node: '運營主管審批', time: '--', approver: '--', status: 'pending', comment: '' },
      { node: '業務主管審批', time: '--', approver: '--', status: 'pending', comment: '' },
      { node: '流程創建', time: '2026-01-16 09:16:21', approver: '朱棣(002)', status: 'submitted', comment: '' },
    ],
  },
  // 充值 — 營業額支付
  'CZ202601160002': {
    approvalType: 'recharge',
    applicant: '朱棣(002)',
    applyDate: '2026-01-16 09:16:21',
    flowNo: 'CZ202601160002',
    flowStatus: '審核中',
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
      { node: '財務主管審批', time: '--', approver: '--', status: 'pending', comment: '' },
      { node: '運營主管審批', time: '--', approver: '--', status: 'pending', comment: '' },
      { node: '業務主管審批', time: '--', approver: '--', status: 'pending', comment: '' },
      { node: '流程創建', time: '2026-01-16 09:16:21', approver: '朱棣(002)', status: 'submitted', comment: '' },
    ],
  },
  deduct: {
    approvalType: 'deduct',
    applicant: '朱棟(002)',
    applyDate: '2026-01-16 09:16:21',
    flowNo: 'KK202601160000',
    flowStatus: '審核中',
    brand: 'mFood',
    groupId: '20261298121911',
    groupName: '亞述集團',
    virtualBalance: 128560.50,
    deductMethodType: 'consume' as const,
    deductMethod: '消費扣款',
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
      { node: '財務主管審批', time: '--', approver: '--', status: 'pending', comment: '' },
      { node: '運營主管審批', time: '--', approver: '--', status: 'pending', comment: '' },
      { node: '業務主管審批', time: '--', approver: '--', status: 'pending', comment: '' },
      { node: '流程創建', time: '2026-01-16 09:16:21', approver: '朱棟(002)', status: 'submitted', comment: '' },
    ],
  },
  transfer: {
    approvalType: 'transfer',
    applicant: '朱棟(002)',
    applyDate: '2026-01-16 09:16:21',
    flowNo: 'ZZ202601160000',
    flowStatus: '審核中',
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
      { node: '財務主管審批', time: '--', approver: '--', status: 'pending', comment: '' },
      { node: '運營主管審批', time: '--', approver: '--', status: 'pending', comment: '' },
      { node: '業務主管審批', time: '--', approver: '--', status: 'pending', comment: '' },
      { node: '流程創建', time: '2026-01-16 09:16:21', approver: '朱棟(002)', status: 'submitted', comment: '' },
    ],
  },
  merge: {
    approvalType: 'merge',
    applicant: '朱棣(002)',
    applyDate: '2026-01-16 09:16:21',
    flowNo: 'HB202601160000',
    flowStatus: '審核中',
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
      { node: '財務主管審批', time: '--', approver: '--', status: 'pending', comment: '' },
      { node: '運營主管審批', time: '--', approver: '--', status: 'pending', comment: '' },
      { node: '業務主管審批', time: '--', approver: '--', status: 'pending', comment: '' },
      { node: '流程創建', time: '2026-01-16 09:16:21', approver: '朱棣(002)', status: 'submitted', comment: '' },
    ],
  },
  gift: {
    approvalType: 'gift',
    applicant: '朱棣(002)',
    applyDate: '2026-07-17 10:00:00',
    flowNo: 'ZS202607170000',
    flowStatus: '審核中',
    brand: '閃蜂',
    giftGroupId: 'G001',
    giftGroupName: '廣州酒家',
    giftStoreId: 'S1001',
    giftStoreName: '澳門總店',
    giftBrand: '閃蜂',
    giftAdType: '新店廣告',
    giftDays: 30,
    documents: [
      { type: 'image' }, { type: 'image' },
    ],
    notes: '商家需要推廣支持，申請贈送推廣金。',
    hasRevoke: true,
    timeline: [
      { node: '財務主管審批', time: '--', approver: '--', status: 'pending', comment: '' },
      { node: '運營主管審批', time: '2026-07-17 14:30:00', approver: '劉邦(000)', status: 'approved', comment: '同意贈送，商家推廣需求屬實。' },
      { node: '業務主管審批', time: '2026-07-17 11:20:00', approver: '朱元璋(001)', status: 'approved', comment: '已核實商家資質，同意贈送。' },
      { node: '流程創建', time: '2026-07-17 10:00:00', approver: '朱棣(002)', status: 'submitted', comment: '' },
    ],
  },
}

const typeTitleMap: Record<string, string> = {
  recharge: '充值審批',
  deduct: '扣款審批',
  transfer: '轉賬審批',
  merge: '合併審批',
  gift: '推廣贈送審批',
}

const brandLabelMap: Record<string, string> = { flashBee: '閃蜂', mFood: 'mFood' }
const flowStatusLabelMap: Record<string, string> = {
  pending: '審核中', approved: '已通過', rejected: '已駁回', cancelled: '已撤銷',
}
const payMethodLabelMap: Record<string, string> = {
  corporate: '對公轉賬', mixed: '混合支付', revenue: '營業額支付',
}
const deductMethodLabelMap: Record<string, string> = {
  account: '賬戶扣款', consume: '消費扣款', batch: '充值批次扣款',
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
function toDetailData(record: FinApproval): ApprovalDetailData {
  const extra = (record.extra || {}) as Record<string, unknown>
  const brand = brandLabelMap[record.brand] || record.brand
  const base: ApprovalDetailData = {
    approvalType: record.approvalType as ApprovalDetailData['approvalType'],
    applicant: record.applicant,
    applyDate: record.applyTime,
    flowNo: record.flowNo,
    flowStatus: flowStatusLabelMap[record.flowStatus] || record.flowStatus,
    brand,
    groupId: record.groupId,
    groupName: record.groupName,
    notes: str(extra.remark),
    hasRevoke: record.flowStatus === 'pending',
    timeline: [
      nodeItem('財務主管審批', record.finApprover, record.finApproveTime, record.finApproveStatus, record.rejectReason),
      nodeItem('運營主管審批', record.opsApprover, record.opsApproveTime, record.opsApproveStatus, record.rejectReason),
      nodeItem('業務主管審批', record.bizApprover, record.bizApproveTime, record.bizApproveStatus, record.rejectReason),
      { node: '流程創建', time: record.applyTime, approver: record.applicant, status: 'submitted', comment: '' },
    ],
  }

  if (record.approvalType === 'recharge') {
    const payMethod = str(extra.payMethod) as ApprovalDetailData['payMethod']
    return {
      ...base,
      businessType: str(extra.businessType),
      businessChannel: str(extra.businessChannelLabel),
      bdPerson: str(extra.bd) || '--',
      isActual: extra.isActual === true,
      payMethod,
      settlementMethod: payMethodLabelMap[str(extra.payMethod)] || '--',
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
      deductMethod: deductMethodLabelMap[method] || method,
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
  return base
}

export default function ApprovalDetail() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const urlType = searchParams.get('type') || 'recharge'
  const flowNo = searchParams.get('flowNo') || ''

  /** 後端不可用時的降級詳情：本地審批記錄優先，其次靜態演示數據 */
  const fallbackDetail = useCallback((): ApprovalDetailData => {
    const local = getApprovalRecordByFlowNo(flowNo)
    if (local) return toDetailData(local as unknown as FinApproval)
    return mockDetails[flowNo] || mockDetails[urlType] || mockDetails['CZ202601160000']
  }, [flowNo, urlType])

  const [data, setData] = useState<ApprovalDetailData>(fallbackDetail)
  const [submitting, setSubmitting] = useState(false)
  const [approvalComment, setApprovalComment] = useState('')
  const [showRevokeModal, setShowRevokeModal] = useState(false)
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  /** 審批類型以記錄為準（未加載到時回退 URL 參數） */
  const type = data.approvalType || urlType
  /** 僅審批中的流程可通過/駁回 */
  const isPending = data.flowStatus === '審核中'

  /** 加載審批詳情 */
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (!flowNo) return
      try {
        const record = await withFinanceFallback<FinApproval | null>(
          () => fetchFinApprovalDetail(flowNo),
          () => null,
        )
        if (!cancelled) setData(record ? toDetailData(record) : fallbackDetail())
      } catch {
        // 流程不存在等業務錯誤：保留降級展示
        if (!cancelled) setData(fallbackDetail())
      }
    }
    void load()
    return () => { cancelled = true }
  }, [flowNo, fallbackDetail])

  const handleApprove = () => {
    Modal.confirm({
      title: '審批確認',
      content: '確定要通過此審批申請嗎？',
      okText: '確定',
      cancelText: '取消',
      onOk: async () => {
        setSubmitting(true)
        try {
          // 三級逐級推進（業務→運營→財務），財務節點通過同時寫入批次/明細/欠款單
          const result = await withFinanceFallback(
            () => approveFinApproval(flowNo),
            () => approveCurrentNode(flowNo),
          )
          if (result) {
            message.success(result.finished
              ? `${result.nodeName}通過，流程全部節點審批完成，數據已寫入批次查詢`
              : `${result.nodeName}通過，流程進入「${result.nextNode}」節點`)
          } else {
            message.success('審批通過成功')
          }
          navigate('/approval-center')
        } catch (err) {
          // 無審批權限（403）或餘額不足等業務校驗失敗，展示後端給出的具體原因
          message.error((err as Error)?.message || '審批失敗')
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
    setSubmitting(true)
    try {
      // 駁回當前節點，流程結束（合併駁回時解凍雙方賬戶）
      const rejectedNode = await withFinanceFallback<string | null>(
        async () => {
          await rejectFinApproval(flowNo, rejectReason)
          return null
        },
        () => rejectCurrentNode(flowNo, rejectReason),
      )
      message.success(rejectedNode
        ? `已在「${rejectedNode}」節點駁回，流程已結束`
        : '審批駁回成功')
      setShowRejectModal(false)
      navigate('/approval-center')
    } catch (err) {
      message.error((err as Error)?.message || '駁回失敗')
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
      await withFinanceFallback(
        () => cancelFinApproval(flowNo),
        () => updateApprovalRecord(flowNo, { flowStatus: 'cancelled' }),
      )
      message.success('申請已撤銷')
      setShowRevokeModal(false)
      navigate('/approval-center')
    } catch (err) {
      message.error((err as Error)?.message || '撤銷失敗')
    } finally {
      setSubmitting(false)
    }
  }

  const renderStatusTag = (status: string) => {
    const map: Record<string, { color: string; text: string }> = {
      approved: { color: 'success', text: '通過' },
      rejected: { color: 'error', text: '駁回' },
      submitted: { color: 'processing', text: '提交' },
      pending: { color: 'default', text: '待審批' },
    }
    const info = map[status] || map.pending
    return <Tag color={info.color}>{info.text}</Tag>
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
        <span className="approval-doc-view-label">點擊查看</span>
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
            >返回</Button>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>
                {typeTitleMap[type]}
              </h2>
              <Tag color="blue">{data.brand}</Tag>
              <span style={{ fontSize: 13, color: '#8C8C8C' }}>{data.applyDate.split(' ')[0]}</span>
              <span style={{ fontSize: 13, color: '#595959', fontWeight: 500 }}>{data.applicant}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button onClick={() => navigate('/approval-center')}>返回</Button>
            {data.hasRevoke && (
              <Button icon={<UndoOutlined />} onClick={handleRevoke}>撤銷</Button>
            )}
            {isPending && (
              <>
                <Button type="primary" loading={submitting} onClick={handleApprove}>通過</Button>
                <Button danger loading={submitting} onClick={handleReject}>駁回</Button>
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
            <div className="approval-section-title approval-section-title--blue">基本資訊</div>
            <div className="approval-info-grid">
              <div className="approval-info-item">
                <span className="approval-info-label">申請人</span>
                <span className="approval-info-value">{data.applicant}</span>
              </div>
              <div className="approval-info-item">
                <span className="approval-info-label">申請日期</span>
                <span className="approval-info-value">{data.applyDate}</span>
              </div>
              <div className="approval-info-item">
                <span className="approval-info-label">流程編號</span>
                <span className="approval-info-value">{data.flowNo}</span>
              </div>
              <div className="approval-info-item">
                <span className="approval-info-label">流程狀態</span>
                <span className="approval-info-value">
                  <Tag color="warning" className="approval-status-tag">{data.flowStatus}</Tag>
                </span>
              </div>
            </div>
          </div>

          {/* 充值类型 */}
          {type === 'recharge' && (
            <>
              {/* 充值帳戶資訊 */}
              <div className="approval-section">
                <div className="approval-section-title approval-section-title--purple">充值帳戶資訊</div>
                <div className="approval-info-grid">
                  <div className="approval-info-item">
                    <span className="approval-info-label">集團ID</span>
                    <span className="approval-info-value">{data.groupId}</span>
                  </div>
                  <div className="approval-info-item">
                    <span className="approval-info-label">集團名稱</span>
                    <span className="approval-info-value">{data.groupName}</span>
                  </div>
                  <div className="approval-info-item">
                    <span className="approval-info-label">所屬品牌</span>
                    <span className="approval-info-value">{data.brand}</span>
                  </div>
                  <div className="approval-info-item">
                    <span className="approval-info-label">業務類型</span>
                    <span className="approval-info-value">{data.businessType}</span>
                  </div>
                  <div className="approval-info-item">
                    <span className="approval-info-label">業務頻道</span>
                    <span className="approval-info-value">{data.businessChannel}</span>
                  </div>
                  <div className="approval-info-item">
                    <span className="approval-info-label">歸屬BD</span>
                    <span className="approval-info-value">{data.bdPerson}</span>
                  </div>
                </div>
              </div>

              {/* 充值金額明細 */}
              <div className="approval-section">
                <div className="approval-section-title approval-section-title--orange">充值金額明細</div>
                <div className="approval-info-grid">
                  <div className="approval-info-item">
                    <span className="approval-info-label">是否實收</span>
                    <span className="approval-info-value">{data.isActual ? '是' : '否'}</span>
                  </div>
                  <div className="approval-info-item">
                    <span className="approval-info-label">虛擬賬戶充值</span>
                    <span className="approval-info-value approval-amount--orange">MOP {data.rechargeAmount?.toLocaleString()}</span>
                  </div>
                  {/* 僅實收時展示結算方式及明細 */}
                  {data.isActual && (
                    <>
                      <div className="approval-info-item">
                        <span className="approval-info-label">結算方式</span>
                        <span className="approval-info-value">{data.settlementMethod}</span>
                      </div>
                      {/* 對公轉賬：僅銀行轉賬 */}
                      {data.payMethod === 'corporate' && (
                        <div className="approval-info-item">
                          <span className="approval-info-label">銀行轉賬</span>
                          <span className="approval-info-value approval-amount--blue">MOP {data.bankTransfer?.toLocaleString()}</span>
                        </div>
                      )}
                      {/* 混合支付：銀行轉賬 + 營業額扣款 */}
                      {data.payMethod === 'mixed' && (
                        <>
                          <div className="approval-info-item">
                            <span className="approval-info-label">銀行轉賬</span>
                            <span className="approval-info-value approval-amount--blue">MOP {data.bankTransfer?.toLocaleString()}</span>
                          </div>
                          <div className="approval-info-item">
                            <span className="approval-info-label">營業額扣款</span>
                            <span className="approval-info-value approval-amount--purple">MOP {data.revenueDeduction?.toLocaleString()}</span>
                          </div>
                          <div className="approval-info-item">
                            <span className="approval-info-label">實收賬戶充值合計</span>
                            <span className="approval-info-value approval-amount--orange">MOP {data.actualTotal?.toLocaleString()}</span>
                          </div>
                        </>
                      )}
                      {/* 營業額支付：僅營業額扣款 */}
                      {data.payMethod === 'revenue' && (
                        <>
                          <div className="approval-info-item">
                            <span className="approval-info-label">營業額扣款</span>
                            <span className="approval-info-value approval-amount--purple">MOP {data.revenueDeduction?.toLocaleString()}</span>
                          </div>
                          <div className="approval-info-item">
                            <span className="approval-info-label">實收賬戶充值合計</span>
                            <span className="approval-info-value approval-amount--orange">MOP {data.actualTotal?.toLocaleString()}</span>
                          </div>
                        </>
                      )}
                      <div className="approval-info-item">
                        <span className="approval-info-label">優惠金額</span>
                        <span className="approval-info-value approval-amount--green">MOP {(data.discountAmount ?? 0).toLocaleString()}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* 扣款門店（僅實收 & 混合支付/營業額支付時展示） */}
              {data.isActual && (data.payMethod === 'mixed' || data.payMethod === 'revenue') && data.deductStores && data.deductStores.length > 0 && (
                <div className="approval-section">
                  <div className="approval-section-title">扣款門店</div>
                  <table className="approval-repayment-table">
                    <thead>
                      <tr>
                        <th>門店ID</th>
                        <th>門店名稱</th>
                        <th>扣款金額</th>
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
                        <td colSpan={2} style={{ textAlign: 'right' }}>合計</td>
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
                <div className="approval-section-title approval-section-title--purple">基礎信息</div>
                <div className="approval-info-grid">
                  <div className="approval-info-item">
                    <span className="approval-info-label">集團ID</span>
                    <span className="approval-info-value">{data.groupId}</span>
                  </div>
                  <div className="approval-info-item">
                    <span className="approval-info-label">集團名稱</span>
                    <span className="approval-info-value">{data.groupName}</span>
                  </div>
                  <div className="approval-info-item">
                    <span className="approval-info-label">所屬品牌</span>
                    <span className="approval-info-value">{data.brand}</span>
                  </div>
                </div>
              </div>
              {/* 扣款方式 */}
              <div className="approval-section">
                <div className="approval-section-title approval-section-title--orange">扣款方式</div>
                <div className="approval-info-grid">
                  <div className="approval-info-item">
                    <span className="approval-info-label">扣款方式</span>
                    <span className="approval-info-value"><Tag color="orange">{data.deductMethod}</Tag></span>
                  </div>
                  <div className="approval-info-item">
                    <span className="approval-info-label">扣款金額</span>
                    <span className="approval-info-value approval-amount--red">MOP {data.deductAmount?.toLocaleString()}</span>
                  </div>
                  {/* 消费扣款特有字段 */}
                  {data.deductMethodType === 'consume' && (
                    <>
                      <div className="approval-info-item">
                        <span className="approval-info-label">業務頻道</span>
                        <span className="approval-info-value">{data.consumeChannel}</span>
                      </div>
                      <div className="approval-info-item">
                        <span className="approval-info-label">門店名稱</span>
                        <span className="approval-info-value">{data.consumeStore}</span>
                      </div>
                      <div className="approval-info-item">
                        <span className="approval-info-label">消費類型</span>
                        <span className="approval-info-value">{data.consumeType}</span>
                      </div>
                    </>
                  )}
                  {/* 充值批次扣款特有字段 */}
                  {data.deductMethodType === 'batch' && (
                    <>
                      <div className="approval-info-item">
                        <span className="approval-info-label">批次號</span>
                        <span className="approval-info-value"><Tag color="blue">{data.batchNo}</Tag></span>
                      </div>
                      <div className="approval-info-item">
                        <span className="approval-info-label">可扣金額</span>
                        <span className="approval-info-value approval-amount--blue">MOP {data.batchDeductible?.toLocaleString()}</span>
                      </div>
                      <div className="approval-info-item">
                        <span className="approval-info-label">結算方式</span>
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
                <div className="approval-section-title approval-section-title--purple">轉出集團</div>
                <div className="approval-info-grid">
                  <div className="approval-info-item">
                    <span className="approval-info-label">集團ID</span>
                    <span className="approval-info-value">{data.fromGroupId}</span>
                  </div>
                  <div className="approval-info-item">
                    <span className="approval-info-label">集團名稱</span>
                    <span className="approval-info-value">{data.fromGroupName}</span>
                  </div>
                  <div className="approval-info-item">
                    <span className="approval-info-label">所屬品牌</span>
                    <span className="approval-info-value">{data.fromBrand}</span>
                  </div>
                </div>
              </div>
              {/* 转入集团资讯 */}
              <div className="approval-section">
                <div className="approval-section-title approval-section-title--green">轉入集團</div>
                <div className="approval-info-grid">
                  <div className="approval-info-item">
                    <span className="approval-info-label">集團ID</span>
                    <span className="approval-info-value">{data.toGroupId}</span>
                  </div>
                  <div className="approval-info-item">
                    <span className="approval-info-label">集團名稱</span>
                    <span className="approval-info-value">{data.toGroupName}</span>
                  </div>
                  <div className="approval-info-item">
                    <span className="approval-info-label">所屬品牌</span>
                    <span className="approval-info-value">{data.toBrand}</span>
                  </div>
                </div>
              </div>
              {/* 转账金额 */}
              <div className="approval-section">
                <div className="approval-section-title approval-section-title--orange">轉賬金額</div>
                <div className="approval-info-grid">
                  <div className="approval-info-item">
                    <span className="approval-info-label">轉賬金額</span>
                    <span className="approval-info-value approval-amount--orange">MOP {data.transferAmount?.toLocaleString()}</span>
                  </div>
                  <div className="approval-info-item">
                    <span className="approval-info-label">轉出集團扣除</span>
                    <span className="approval-info-value approval-amount--red">-MOP {data.transferAmount?.toLocaleString()}</span>
                  </div>
                  <div className="approval-info-item">
                    <span className="approval-info-label">轉入集團增加</span>
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
                <div className="approval-section-title approval-section-title--purple">註銷集團 <Tag color="red" style={{ fontSize: 11, marginLeft: 4 }}>即將關閉</Tag></div>
                <div className="approval-info-grid">
                  <div className="approval-info-item">
                    <span className="approval-info-label">集團ID</span>
                    <span className="approval-info-value">{data.mergeGroupId}</span>
                  </div>
                  <div className="approval-info-item">
                    <span className="approval-info-label">集團名稱</span>
                    <span className="approval-info-value">{data.mergeGroupName}</span>
                  </div>
                  <div className="approval-info-item">
                    <span className="approval-info-label">所屬品牌</span>
                    <span className="approval-info-value">{data.mergeBrand}</span>
                  </div>
                  <div className="approval-info-item">
                    <span className="approval-info-label">虛擬賬戶餘額</span>
                    <span className="approval-info-value approval-amount--blue">MOP {data.mergeVirtualBalance?.toLocaleString()}</span>
                  </div>
                  <div className="approval-info-item">
                    <span className="approval-info-label">欠款金額</span>
                    <span className="approval-info-value approval-amount--red">MOP {data.mergeDebtAmount?.toLocaleString()}</span>
                  </div>
                </div>
              </div>
              {/* 被合并集团资讯 */}
              <div className="approval-section">
                <div className="approval-section-title approval-section-title--green">存續集團 <Tag color="green" style={{ fontSize: 11, marginLeft: 4 }}>接收資產</Tag></div>
                <div className="approval-info-grid">
                  <div className="approval-info-item">
                    <span className="approval-info-label">集團ID</span>
                    <span className="approval-info-value">{data.mergeToGroupId}</span>
                  </div>
                  <div className="approval-info-item">
                    <span className="approval-info-label">集團名稱</span>
                    <span className="approval-info-value">{data.mergeToGroupName}</span>
                  </div>
                  <div className="approval-info-item">
                    <span className="approval-info-label">所屬品牌</span>
                    <span className="approval-info-value">{data.mergeToBrand}</span>
                  </div>
                </div>
              </div>
              {/* 欠款偿还 */}
              {data.repayStores && data.repayStores.length > 0 && (
                <div className="approval-section">
                  <div className="approval-section-title" style={{ borderLeftColor: '#ff4d4f', color: '#ff4d4f' }}>欠款償還</div>
                  <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 12 }}>
                    註銷集團存在欠款 MOP {data.mergeDebtAmount?.toLocaleString()}，分配至存續集團下門店進行償還
                  </div>
                  <Table
                    size="small"
                    bordered
                    pagination={false}
                    dataSource={data.repayStores}
                    rowKey="storeId"
                    columns={[
                      {
                        title: '門店ID/名稱', dataIndex: 'storeName', width: 280,
                        render: (val: string) => <span>{val}</span>,
                      },
                      {
                        title: '歸屬BD', dataIndex: 'bd', width: 120, align: 'center' as const,
                        render: (val: string) => <Tag color="blue">{val}</Tag>,
                      },
                      {
                        title: '償還金額', dataIndex: 'amount', width: 160, align: 'center' as const,
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
                              <strong>已分配合計</strong>
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
                          尚有 MOP {(data.mergeDebtAmount! - data.repayStores.reduce((sum, r) => sum + r.amount, 0)).toLocaleString()} 未分配
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* 推广赠送类型 */}
          {type === 'gift' && (
            <div className="approval-section">
              <div className="approval-section-title approval-section-title--purple">贈送配置資訊</div>
              <div className="approval-info-grid">
                <div className="approval-info-item">
                  <span className="approval-info-label">集團ID</span>
                  <span className="approval-info-value">{data.giftGroupId}</span>
                </div>
                <div className="approval-info-item">
                  <span className="approval-info-label">集團名稱</span>
                  <span className="approval-info-value">{data.giftGroupName}</span>
                </div>
                <div className="approval-info-item">
                  <span className="approval-info-label">門店ID</span>
                  <span className="approval-info-value">{data.giftStoreId}</span>
                </div>
                <div className="approval-info-item">
                  <span className="approval-info-label">門店名稱</span>
                  <span className="approval-info-value">{data.giftStoreName}</span>
                </div>
                <div className="approval-info-item">
                  <span className="approval-info-label">所屬品牌</span>
                  <span className="approval-info-value">{data.giftBrand}</span>
                </div>
                <div className="approval-info-item">
                  <span className="approval-info-label">廣告類型</span>
                  <span className="approval-info-value approval-gift-highlight">{data.giftAdType}</span>
                </div>
                <div className="approval-info-item">
                  <span className="approval-info-label">贈送天數</span>
                  <span className="approval-info-value approval-gift-highlight">{data.giftDays} 天</span>
                </div>
              </div>
            </div>
          )}

          {/* 相关凭证 */}
          <div className="approval-section">
            <div className="approval-section-title">相關憑證</div>
            <div className="approval-documents">
              {data.documents?.map((doc, i) => renderDocument(doc, i))}
            </div>
          </div>

          {/* 备注信息 */}
          <div className="approval-section">
            <div className="approval-section-title">備註信息</div>
            <div className="approval-notes">{data.notes}</div>
          </div>

          {/* 审批意见 */}
          <div className="approval-section">
            <div className="approval-section-title">審批意見</div>
            <Input.TextArea
              rows={3}
              placeholder="可備註審核意見，限制200字！"
              maxLength={200}
              showCount
              value={approvalComment}
              onChange={(e) => setApprovalComment(e.target.value)}
            />
          </div>
        </div>

        {/* 右侧审批流 */}
        <div className="approval-detail-right">
          <div className="approval-timeline-title">審批流程</div>
          <div className="approval-timeline">
            {data.timeline.map((item, index) => (
              <div key={index} className={`approval-timeline-item approval-timeline-item--${item.status}`}>
                <div className="approval-timeline-dot" />
                <div className="approval-timeline-content">
                  <div className="approval-timeline-header">
                    <span className="approval-timeline-node">{item.node}</span>
                    <span className="approval-timeline-time">{item.time}</span>
                  </div>
                  <div className="approval-timeline-info">
                    {item.status === 'submitted' ? '申請人' : '審批人'}：{item.approver}
                  </div>
                  <div className="approval-timeline-status">
                    {renderStatusTag(item.status)}
                  </div>
                  {item.comment && (
                    <div className="approval-timeline-comment">
                      <span className="approval-timeline-comment-label">審批意見：</span>
                      {item.comment}
                    </div>
                  )}
                  {item.rejectReason && (
                    <div className="approval-timeline-reject">
                      <span className="approval-timeline-reject-label">駁回理由：</span>
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
        <Button onClick={() => navigate('/approval-center')}>返回</Button>
        {data.hasRevoke && (
          <Button icon={<UndoOutlined />} onClick={handleRevoke}>撤銷</Button>
        )}
        {isPending && (
          <>
            <Button type="primary" loading={submitting} onClick={handleApprove}>通過</Button>
            <Button danger loading={submitting} onClick={handleReject}>駁回</Button>
          </>
        )}
      </div>

      {/* 撤销确认弹窗 */}
      <Modal
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>撤銷確認</span>
            <Button type="link" size="small" onClick={() => setShowRevokeModal(false)} style={{ padding: 0 }}>關閉</Button>
          </div>
        }
        open={showRevokeModal}
        onCancel={() => setShowRevokeModal(false)}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
            <Button onClick={() => setShowRevokeModal(false)}>取消</Button>
            <Button type="primary" loading={submitting} onClick={handleRevokeConfirm}>確定撤銷</Button>
          </div>
        }
        width={440}
        centered
      >
        <div className="revoke-modal-content">
          <div className="revoke-modal-icon">
            <ExclamationCircleOutlined />
          </div>
          <div className="revoke-modal-question">您確定要撤銷本次申請嗎？</div>
          <div className="revoke-modal-warning">撤銷後，整個審批流程將立即終止，此操作不可恢復，請謹慎確認！</div>
        </div>
      </Modal>

      {/* 驳回弹窗 */}
      <Modal
        title="駁回審批"
        open={showRejectModal}
        onCancel={() => setShowRejectModal(false)}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
            <Button onClick={() => setShowRejectModal(false)}>取消</Button>
            <Button danger loading={submitting} onClick={handleRejectConfirm} disabled={!rejectReason.trim()}>確定駁回</Button>
          </div>
        }
        width={480}
      >
        <div style={{ padding: '16px 0' }}>
          <div style={{ marginBottom: 8, fontWeight: 500 }}>駁回理由 <span style={{ color: '#E53935' }}>*</span></div>
          <Input.TextArea
            rows={4}
            placeholder="請輸入駁回理由（必填）"
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
