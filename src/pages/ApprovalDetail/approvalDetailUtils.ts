import type { FinApproval } from '../../api/finance'
import type { AiGrantDraft } from './aiGrantDraft'
import type { EmployeeItem } from '../../api/employee'
import type { DepartmentItem } from '../../api/department'
import type { RoleItem } from '../../api/role'
import { resolveCurrentApprovers } from '../../utils/resolveCurrentApprover'
import { WORKFLOW_STORAGE_KEY, getApproverSettingForBrand } from '../WorkflowConfig/types'
import type { WorkflowDefinition } from '../WorkflowConfig/types'

/** 审批历史记录 */
export interface ApprovalTimelineItem {
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
export interface ApprovalDetailData {
  approvalType: 'recharge' | 'deduct' | 'transfer' | 'merge' | 'gift' | 'ai_access' | 'oa_purchase'
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
  // AI 申请
  aiRequestId?: number
  aiApplyReason?: string
  aiRequestedModels?: number[]
  /** 第一节点（业务主管）保存的授权草稿，供最终节点继续调整后提交 */
  aiDraftGrant?: AiGrantDraft
  aiRequestType?: string
  aiUsageDescription?: string
  aiUsageScenarios?: string[]
  aiUsageFrequency?: string
  // 采购申请
  purchaseItems?: { modelName: string; qty: number; remark?: string; categoryName?: string; brandName?: string; params?: Record<string, string> }[]
  // 通用
  groupId?: string
  groupName?: string
  department?: string
  applyDepartment?: string
  position?: string
  company?: string
  documents?: { type: 'image' | 'pdf' | 'view'; name?: string }[]
  notes?: string
  timeline: ApprovalTimelineItem[]
  hasRevoke?: boolean
}

/** 模拟数据 */
export const mockDetails: Record<string, ApprovalDetailData> = {
  // 充值 — 对公转账
  'CZ202601160000': {
    approvalType: 'recharge',
    applicant: '朱棣(002)',
    applyDate: '2026-01-16 09:16:21',
    flowNo: 'CZ202601160000',
    flowStatus: 'pending',
    brand: '闪蜂',
    groupId: '20261298121911',
    groupName: '亞述集团',
    isActual: true,
    payMethod: 'corporate' as const,
    businessType: '外卖到家',
    businessChannel: '美食外卖',
    bdPerson: '关山月(001)',
    rechargeAmount: 100000,
    actualTotal: 100000,
    bankTransfer: 100000,
    discountAmount: 0,
    settlementMethod: '对公转账',
    documents: [
      { type: 'image' }, { type: 'image' },
      { type: 'pdf', name: '银行转账凭证.pdf' },
      { type: 'view' },
    ],
    notes: '已通过银行对公转账完成汇款，请审批。',
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
    brand: '闪蜂',
    groupId: '20261298121911',
    groupName: '亞述集团',
    isActual: true,
    payMethod: 'mixed' as const,
    businessType: '外卖到家',
    businessChannel: '美食外卖',
    bdPerson: '关山月(001)',
    rechargeAmount: 100000,
    actualTotal: 85000,
    bankTransfer: 50000,
    revenueDeduction: 35000,
    discountAmount: 15000,
    deductStores: [
      { storeId: '1234567890', storeName: '广州酒店天河广场1號店', amount: 20000 },
      { storeId: '2345678910', storeName: '广州酒店越秀领展2號店', amount: 15000 },
    ],
    settlementMethod: '混合支付',
    documents: [
      { type: 'image' }, { type: 'image' }, { type: 'image' },
      { type: 'pdf', name: '合同文件1.pdf' }, { type: 'pdf', name: '合同文件2.pdf' },
      { type: 'view' },
    ],
    notes: '请领导迅速审批，老闆等着推广金到账，消费一波，谢谢！',
    hasRevoke: true,
    timeline: [
      { node: 'finance', time: '--', approver: '--', status: 'pending', comment: '' },
      { node: 'operation', time: '--', approver: '--', status: 'pending', comment: '' },
      { node: 'business', time: '--', approver: '--', status: 'pending', comment: '' },
      { node: 'created', time: '2026-01-16 09:16:21', approver: '朱棣(002)', status: 'submitted', comment: '' },
    ],
  },
  // 充值 — 营业额支付
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
    businessType: '团购到店',
    businessChannel: '团购到店',
    bdPerson: '浩源(002)',
    rechargeAmount: 80000,
    actualTotal: 80000,
    revenueDeduction: 80000,
    discountAmount: 0,
    deductStores: [
      { storeId: '3456789012', storeName: '漢堡王澳门官也街店', amount: 40000 },
      { storeId: '4567890123', storeName: '漢堡王澳门議事亭店', amount: 25000 },
      { storeId: '5678901234', storeName: '漢堡王珠海拱北店', amount: 15000 },
    ],
    settlementMethod: '营业额支付',
    documents: [
      { type: 'image' }, { type: 'image' },
      { type: 'pdf', name: '营业额扣款协議.pdf' },
      { type: 'view' },
    ],
    notes: '商家委托进行营业额扣款充值，请审批。',
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
    groupName: '亞述集团',
    virtualBalance: 128560.50,
    deductMethodType: 'consume' as const,
    deductMethod: 'consume',
    deductAmount: 30000,
    consumeChannel: '美食外卖',
    consumeStore: '广州酒店天河广场1號店(1234567890)',
    consumeType: '基礎套餐',
    documents: [
      { type: 'image' }, { type: 'image' },
      { type: 'pdf', name: '扣款凭证.pdf' },
    ],
    notes: '商家需要在巴士进行打广告，委托我們进行操作，与商家達成协議，扣取推广金30,000元。',
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
    fromGroupName: '亞述集团',
    fromBrand: 'mFood',
    fromVirtualBalance: 128560.50,
    toGroupId: '20261298121912',
    toGroupName: '广州酒家',
    toBrand: 'mFood',
    transferAmount: 50000,
    documents: [
      { type: 'image' }, { type: 'image' }, { type: 'image' },
      { type: 'pdf', name: '转账协議.pdf' },
      { type: 'view' },
    ],
    notes: '商戶A和商戶B已完成合併协議簽订，現在申请將商戶A账戶推广金余额转入商戶B。',
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
    mergeGroupName: '亞述集团',
    mergeBrand: 'mFood',
    mergeVirtualBalance: 128560.50,
    mergeDebtAmount: 15800.00,
    mergeToGroupId: '20261298121912',
    mergeToGroupName: '广州酒家',
    mergeToBrand: 'mFood',
    repayStores: [
      { storeId: '1234567890', storeName: '广州酒店天河广场1號店(1234567890)', bd: '关山月(001)', amount: 8000 },
      { storeId: '2345678910', storeName: '广州酒店越秀领展2號店(2345678910)', bd: '古月(002)', amount: 5000 },
      { storeId: '3456789012', storeName: '广州酒店琶洲保利3號店(3456789012)', bd: '浩遠(003)', amount: 2800 },
    ],
    documents: [
      { type: 'image' }, { type: 'image' }, { type: 'image' },
      { type: 'pdf', name: '合併协議.pdf' },
    ],
    notes: '亞述集团和广州酒家已完成合併协議簽订，現在申请將亞述集团账戶推广金余额全部转入广州酒家。',
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
    brand: '闪蜂',
    giftGroupId: 'G001',
    giftGroupName: '广州酒家',
    giftStoreId: 'S1001',
    giftStoreName: '澳门總店',
    giftBrand: '闪蜂',
    giftAdType: 'new_store',
    giftDays: 30,
    giftValidDays: 90,
    documents: [
      { type: 'image' }, { type: 'image' },
    ],
    notes: '商家需要推广支持，申请赠送推广金。',
    hasRevoke: true,
    timeline: [
      { node: 'finance', time: '--', approver: '--', status: 'pending', comment: '' },
      { node: 'operation', time: '2026-07-17 14:30:00', approver: '劉邦(000)', status: 'approved', comment: '同意赠送，商家推广需求屬实。' },
      { node: 'business', time: '2026-07-17 11:20:00', approver: '朱元璋(001)', status: 'approved', comment: '已核实商家資質，同意赠送。' },
      { node: 'created', time: '2026-07-17 10:00:00', approver: '朱棣(002)', status: 'submitted', comment: '' },
    ],
  },
}

export const brandLabelMap: Record<string, string> = { flashBee: '闪蜂', mFood: 'mFood' }

export function num(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export function str(v: unknown): string {
  return v == null ? '' : String(v)
}

/** extra 中的门店金额行（storeLabel 对應展示用的 storeName） */
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

/** 单个审批节点 → 时间轴项 */
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

/** 从流程配置 + 本地审批记录构建 AI 申请时间轴（懒展示：draft 仅流程创建；审批中仅展示已完成 + 当前待审节点） */
export function buildAiAccessTimeline(
  local: { bizApprover?: string; bizApproveTime?: string; bizApproveStatus?: string; opsApprover?: string; opsApproveTime?: string; opsApproveStatus?: string; applyTime?: string; applicant?: string; rejectReason?: string; flowStatus?: string } | null,
  employees?: EmployeeItem[],
  departments?: DepartmentItem[],
  roles?: RoleItem[],
): ApprovalTimelineItem[] {
  // 提交节点
  const createdNode: ApprovalTimelineItem = {
    node: 'created',
    time: local?.applyTime || '--',
    approver: local?.applicant || '--',
    status: 'submitted',
    comment: '',
  }
  // 待提交状态：仅展示流程创建节点，不暴露后续审批节点
  if (local?.flowStatus === 'draft') {
    return [createdNode]
  }
  // 读取流程配置获取节点名称与审批规则
  let nodeMetas = [
    { name: '业务主管审批', approvalRule: 'any' },
    { name: '運营主管审批', approvalRule: 'any' },
  ]
  try {
    const raw = localStorage.getItem(WORKFLOW_STORAGE_KEY)
    if (raw) {
      const workflows: WorkflowDefinition[] = JSON.parse(raw)
      const aiWf = workflows.find((wf) => wf.workflowKey === 'ai_access' || wf.approvalType === 'ai_access')
      if (aiWf && aiWf.nodes.length > 0) {
        nodeMetas = aiWf.nodes.sort((a, b) => a.sortOrder - b.sortOrder).map((n) => ({
          name: n.name,
          approvalRule: getApproverSettingForBrand(n).approvalRule,
        }))
      }
    }
  } catch { /* ignore */ }

  const timeline: ApprovalTimelineItem[] = []
  // 懒展示：仅展示已完成节点与当前待审节点，后续未到的节点不提前暴露
  let currentPendingShown = false
  // 按流程配置节点順序添加
  nodeMetas.forEach(({ name: nodeName, approvalRule }) => {
    let approver = '--'
    let time = '--'
    let status: ApprovalTimelineItem['status'] = 'pending'
    if (nodeName.includes('业务')) {
      approver = local?.bizApprover || '--'
      time = local?.bizApproveTime || '--'
      status = nodeItem('', '', '', local?.bizApproveStatus || '').status
    } else if (nodeName.includes('運营')) {
      approver = local?.opsApprover || '--'
      time = local?.opsApproveTime || '--'
      status = nodeItem('', '', '', local?.opsApproveStatus || '').status
    }
    // 当前待审节点已展示过，后续 pending 节点跳过
    if (status === 'pending' && currentPendingShown) return
    if (status === 'pending') currentPendingShown = true
    const item = nodeItem(nodeName, approver, time, status, local?.rejectReason)
    item.approvalRule = approvalRule
    // pending 节点且有参考数据时，从流程配置解析全部候选审批人
    if (status === 'pending' && employees && departments && roles) {
      const { selected, candidates } = resolveCurrentApprovers('ai_access', nodeName, employees, departments, roles)
      if (selected) item.approver = selected
      if (candidates.length > 0) {
        item.approvers = candidates.map((c) => ({ name: `${c.name}(${c.empId})`, status: 'pending', time: null }))
      }
    }
    timeline.push(item)
  })
  timeline.push(createdNode)
  return timeline
}

/**
 * 审批记录 → 审批詳情展示结构
 * 后端 FinApprovalVO.extra 与 approvalStore 寫入的 extra 同构，因此真实数据与降級数据共用本映射。
 */
export function toDetailData(record: FinApproval, t?: (key: string) => string): ApprovalDetailData {
  const extra = (record.extra || {}) as Record<string, unknown>
  const brand = brandLabelMap[record.brand] || record.brand
  /** 业务類型代碼 → 翻譯标签 */
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
  if (record.approvalType === 'ai_access') {
    const scenarios = Array.isArray(extra.usageScenarios) ? (extra.usageScenarios as string[]) : []
    const requestedModels = Array.isArray(extra.requestedModels)
      ? (extra.requestedModels as number[])
      : []
    const draftGrant = (extra.draftGrant || null) as AiGrantDraft | null
    return {
      ...base,
      aiRequestId: num(extra.requestId) || undefined,
      aiApplyReason: str(extra.applyReason),
      aiRequestedModels: requestedModels,
      aiDraftGrant: draftGrant ?? undefined,
      aiRequestType: str(extra.requestType),
      aiUsageDescription: str(extra.usageDescription),
      aiUsageScenarios: scenarios,
      aiUsageFrequency: str(extra.usageFrequency),
      notes: str(extra.usageDescription),
      department: str(extra.department) || undefined,
      position: str(extra.position) || undefined,
      company: str(extra.company) || undefined,
    }
  }
  if (record.approvalType === 'oa_purchase') {
    const purchaseItems = Array.isArray(extra.items) ? (extra.items as Array<{ modelName: string; qty: number; remark?: string; categoryName?: string; brandName?: string; params?: Record<string, string> }>) : []
    return {
      ...base,
      notes: str(extra.reason),
      applyDepartment: str(extra.department) || undefined,
      department: str(extra.serviceDepartment) || undefined,
      purchaseItems,
      position: str(extra.position) || undefined,
      company: str(extra.company) || undefined,
    }
  }
  return base
}
