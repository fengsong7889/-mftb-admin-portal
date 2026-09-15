import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Tag, Input, Modal, Table, message } from 'antd'
import {
  UndoOutlined,
  SendOutlined,
  ExclamationCircleOutlined,
  FileImageOutlined,
  FilePdfOutlined,
  EyeOutlined,
  FileTextOutlined,
  AccountBookOutlined,
  DollarOutlined,
  ShopOutlined,
  CreditCardOutlined,
  LogoutOutlined,
  LoginOutlined,
  SwapOutlined,
  CloseCircleOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  GiftOutlined,
  RobotOutlined,
  ShoppingCartOutlined,
} from '@ant-design/icons'
import DetailPageHeader from '../../components/DetailPageHeader'
import BrandTag from '../../components/BrandTag'
import './ApprovalDetail.css'
import {
  approveCurrentNode,
  rejectCurrentNode,
  getApprovalRecordByFlowNo,
  updateApprovalRecord,
  deleteApprovalRecord,
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
import type { FinApproval } from '../../api/finance'
import { fetchOaRequestDetail, approveOaRequest, rejectOaRequest, cancelOaRequest, submitDraftOaRequest, type OaRequestVO } from '../../api/oaRequest'
import { fetchCategoryList } from '../../api/eam'
import AiApprovalActionPanel from './AiApprovalActionPanel'
import {
  type AiGrantDraft,
  emptyGrantDraft,
  validateGrantDraft,
  buildApprovePayload,
} from './aiGrantDraft'
import { fetchModels } from '../../api/aiModel'
import { useTranslation } from 'react-i18next'
import type { EmployeeItem } from '../../api/employee'
import type { DepartmentItem } from '../../api/department'
import type { RoleItem } from '../../api/role'
import { mockDetails, toDetailData, buildAiAccessTimeline, str, num } from './approvalDetailUtils'
import type { ApprovalTimelineItem, ApprovalDetailData } from './approvalDetailUtils'

/** AI 申請詳情（從 biz_oa_request.formData 解析） */
interface AiRequestDetail {
  id: number
  applicantName: string
  applicantId: number
  requestType: string
  requestedModels: number[]
  usageDescription: string
  usageScenarios: string[]
  usageFrequency: string
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  approveRemark: string
  createdAt: string
  approvedModelConfigs?: Array<{
    modelId: number
    visionSupport: number
    functionCalling: number
    jsonMode: number
    streaming: number
    thinkingMode: number
    effectiveType: string
    expireAt: string | null
  }>
  approvedQuotaValue?: number | null
  approvedQuotaType?: string
  approvedQuotaPeriod?: string
  quotaEffectiveType?: string
  quotaExpireAt?: string
  approverName?: string
  approvedAt?: string
}

/** 標題映射（i18n key，value 為英文枚舉碼） */
const typeTitleMapKeys: Record<string, string> = {
  recharge: 'approvalDetail.typeTitleRecharge',
  deduct: 'approvalDetail.typeTitleDeduct',
  transfer: 'approvalDetail.typeTitleTransfer',
  merge: 'approvalDetail.typeTitleMerge',
  gift: 'approvalDetail.typeTitleGift',
  ai_access: 'approvalDetail.typeTitleAiAccess',
  oa_purchase: 'approvalDetail.typeTitlePurchase',
}

/** 流程狀態映射（i18n key，value 為英文枚舉碼） */
const flowStatusLabelMapKeys: Record<string, string> = {
  draft: 'approvalCenter.flowDraft',
  pending: 'approvalCenter.flowPending', approved: 'approvalCenter.flowApproved',
  rejected: 'approvalCenter.flowRejected', cancelled: 'approvalCenter.flowCancelled',
}
/** 流程狀態標籤顏色（與審批中心列表保持一致：草稿橙/審核中藍/通過綠/駁回紅/撤銷灰） */
const flowStatusColorMap: Record<string, string> = {
  draft: 'warning', pending: 'processing', approved: 'success', rejected: 'error', cancelled: 'default',
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

export default function ApprovalDetail() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const urlType = searchParams.get('type') || 'recharge'
  const flowNo = searchParams.get('flowNo') || ''
  /** 審批中心合併的後端 AI 申請攜帶 requestId（跨設備：本地無記錄，後端為唯一權威）；
   *  同時兼容「我的申請」頁跳轉使用的 id 参數（雙参數同值，避免修改調用方） */
  const urlRequestId = Number(searchParams.get('requestId') || searchParams.get('id')) || 0
  /** 僅有 flowNo 時的降級：AI000009 → 9，用於拉取後端詳情補齊申請人等信息 */
  const aiIdFromFlowNo = /^AI\d+$/.test(flowNo) ? Number(flowNo.slice(2)) || 0 : 0
  const aiRequestId = urlRequestId || aiIdFromFlowNo || undefined

  /* ====== 參考數據（員工、部門、角色）用於解析審批人 ====== */
  const employeesRef = useRef<EmployeeItem[]>([])
  const departmentsRef = useRef<DepartmentItem[]>([])
  const rolesRef = useRef<RoleItem[]>([])
  const [refReady, setRefReady] = useState(false)
  /** 参数键→中文标签映射（从分类参数模板构建） */
  const [paramLabelMap, setParamLabelMap] = useState<Record<string, string>>({})

  useEffect(() => {
    Promise.all([
      import('../../api/employee').then(m => m.fetchEmployees({ page: 1, size: 200, employmentStatus: 'active' })).catch(() => ({ records: [], total: 0 })),
      import('../../api/department').then(m => m.fetchDepartments()).catch(() => []),
      import('../../api/role').then(m => m.fetchRoles()).catch(() => []),
    ]).then(([empRes, depts, roles]) => {
      employeesRef.current = (empRes as { records: EmployeeItem[] }).records || []
      departmentsRef.current = (depts as DepartmentItem[]) || []
      rolesRef.current = (roles as RoleItem[]) || []
      setRefReady(true)
    })
    // 拉取分类参数模板，构建 paramKey→label 映射
    fetchCategoryList()
      .then((list) => {
        const map: Record<string, string> = {}
        list.forEach((c) => (c.paramTemplate || []).forEach((f) => { map[f.key] = f.label }))
        setParamLabelMap(map)
      })
      .catch(() => { /* 参数模板仅用于展示，失败不阻塞 */ })
  }, [])

  /** 後端不可用時的降級詳情：本地審批記錄優先，其次靜態演示數據 */
  const fallbackDetail = useCallback((): ApprovalDetailData => {
    const local = getApprovalRecordByFlowNo(flowNo)
    // AI 申請：使用流程配置構建時間軸
    if (urlType === 'ai_access' || (local && local.approvalType === 'ai_access')) {
      const aiLocal = local || undefined
      const localExtra = (aiLocal?.extra || {}) as Record<string, unknown>
      const localRequested = Array.isArray(localExtra.requestedModels)
        ? (localExtra.requestedModels as number[])
        : []
      const localScenarios = Array.isArray(localExtra.usageScenarios)
        ? (localExtra.usageScenarios as string[])
        : []
      const usageDesc = str(localExtra.usageDescription)
      return {
        approvalType: 'ai_access',
        applicant: aiLocal?.applicant || '--',
        applyDate: aiLocal?.applyTime || '',
        flowNo,
        flowStatus: aiLocal?.flowStatus || 'pending',
        brand: '--',
        department: str(localExtra.department) || undefined,
        position: str(localExtra.position) || undefined,
        company: str(localExtra.company) || undefined,
        aiRequestType: str(localExtra.requestType),
        aiApplyReason: usageDesc || undefined,
        aiRequestedModels: localRequested,
        aiUsageDescription: usageDesc || undefined,
        aiUsageScenarios: localScenarios.length > 0 ? localScenarios : undefined,
        aiUsageFrequency: str(localExtra.usageFrequency) || undefined,
        notes: usageDesc || undefined,
        aiRequestId,
        timeline: buildAiAccessTimeline(aiLocal || null, refReady ? employeesRef.current : undefined, refReady ? departmentsRef.current : undefined, refReady ? rolesRef.current : undefined),
        hasRevoke: (aiLocal?.flowStatus || 'pending') === 'pending',
      }
    }
    // 採購申請：從本地記錄構建詳情，避免降级到充值 mock 數據
    if (urlType === 'oa_purchase' || (local && local.approvalType === 'oa_purchase')) {
      const purchaseLocal = local || undefined
      const purchaseExtra = (purchaseLocal?.extra || {}) as Record<string, unknown>
      const purchaseItems = Array.isArray(purchaseExtra.items)
        ? (purchaseExtra.items as Array<{ modelName: string; qty: number; remark?: string; categoryName?: string; brandName?: string; params?: Record<string, string> }>)
        : []
      return {
        approvalType: 'oa_purchase' as const,
        applicant: purchaseLocal?.applicant || '--',
        applyDate: purchaseLocal?.applyTime || '',
        flowNo,
        flowStatus: purchaseLocal?.flowStatus || 'draft',
        brand: purchaseExtra.brand != null ? String(purchaseExtra.brand as number | string) : '--',
        notes: (purchaseExtra.reason as string) || '',
        applyDepartment: (purchaseExtra.department as string) || undefined,
        department: (purchaseExtra.serviceDepartment as string) || undefined,
        position: (purchaseExtra.position as string) || undefined,
        company: (purchaseExtra.company as string) || undefined,
        purchaseItems,
        hasRevoke: (purchaseLocal?.flowStatus || 'draft') === 'pending',
        timeline: [
          { node: 'created', time: purchaseLocal?.applyTime || '', approver: purchaseLocal?.applicant || '--', status: 'submitted' as const, comment: '' },
        ],
      }
    }
    if (local) return toDetailData(local as unknown as FinApproval, t)
    // 後端 AI 申請（跨設備）：URL 攜帶 requestId，詳情數據由後端接口拉取補齊
    if (urlType === 'ai_access' && aiRequestId) {
      return {
        approvalType: 'ai_access',
        applicant: '--',
        applyDate: '',
        flowNo,
        flowStatus: 'pending',
        brand: '--',
        timeline: buildAiAccessTimeline(null, refReady ? employeesRef.current : undefined, refReady ? departmentsRef.current : undefined, refReady ? rolesRef.current : undefined),
        hasRevoke: true,
        aiRequestId,
      }
    }
    return mockDetails[flowNo] || mockDetails[urlType] || mockDetails['CZ202601160000']
  }, [flowNo, urlType, aiRequestId, t, refReady])

  const [data, setData] = useState<ApprovalDetailData>(fallbackDetail)
  const [submitting, setSubmitting] = useState(false)
  const [approvalComment, setApprovalComment] = useState('')
  const [showRevokeModal, setShowRevokeModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  /** 查看節點全部審批人彈窗（多人審批時時間軸僅展示前 3 人） */
  const [viewApprovers, setViewApprovers] = useState<{ nodeName: string; approvers: NonNullable<ApprovalTimelineItem['approvers']> } | null>(null)

  /* ---- AI 申請：審批操作區狀態 ---- */
  /** 後端申請詳情（憑證、審批結果、跨設備狀態同步） */
  const [aiRequest, setAiRequest] = useState<AiRequestDetail | null>(null)
  /** 授權草稿：第二節點優先讀取第一節點保存的 draftGrant */
  const [grantDraft, setGrantDraft] = useState<AiGrantDraft | null>(null)

  /** 審批類型以記錄為準（未加載到時回退 URL 參數） */
  const type = data.approvalType || urlType
  /** 僅審批中的流程可通過/駁回 */
  const isPending = data.flowStatus === 'pending'
  /** 是否已有審批人通過（有則不允許撤銷） */
  const hasApprovedNode = data.timeline?.some((n) => n.status === 'approved') ?? false
  /** 當前登錄人是否為當前待審節點的審批人（或管理員），僅審批人可見通過/駁回按鈕 */
  const isCurrentApprover = useMemo(() => {
    try {
      const info = JSON.parse(localStorage.getItem('user_info') || '{}')
      if (info.role === 'admin') return true
      const signature = info.name && info.empId ? `${info.name}(${info.empId})` : (info.name || '')
      if (!signature) return false
      return data.timeline?.some((n) => n.status === 'pending' && (n.approver || '').includes(signature)) ?? false
    } catch { return false }
  }, [data.timeline])

  /** 當前登錄人是否為申請人（或管理員），用於判斷是否可撤銷 */
  const isApplicant = useMemo(() => {
    try {
      const info = JSON.parse(localStorage.getItem('user_info') || '{}')
      if (info.role === 'admin') return true
      const signature = info.name && info.empId ? `${info.name}(${info.empId})` : (info.name || '')
      if (!signature) return false
      return (data.applicant || '').includes(signature)
    } catch { return false }
  }, [data.applicant])

  /** 是否可撤銷：流程審批中 + 無已通過節點 + 當前用戶為申請人或管理員 */
  const canRevoke = isPending && !hasApprovedNode && isApplicant

  /** 加載審批詳情（AI 申請不走 biz_fin_approval，直接取本地記錄 + 後續 effect 拉後端 AI 詳情） */
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (!flowNo) return
      // AI 申請存在於 biz_oa_request 表，不在 biz_fin_approval 中，跳過財務審批查詢避免「審批流程不存在」報錯
      // 採購申請同樣不在 biz_fin_approval 中，跳過避免降级到充值 mock 數據
      if (type === 'ai_access' || type === 'oa_purchase') {
        if (!cancelled) setData(fallbackDetail())
        return
      }
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
    // type 在初次渲染後即穩定，不需加入依賴
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowNo, fallbackDetail, t])

  /**
   * AI 申請：拉取後端申請詳情（憑證 + 審批結果）。
   * 使用 OA 統一接口（biz_oa_request）查詢 AI 申請詳情。
   */
  useEffect(() => {
    if (type !== 'ai_access' || !flowNo) return
    // 本地草稿（未提交到後端）：跳過後端查詢，避免「流程不存在」報錯
    const localRecord = getApprovalRecordByFlowNo(flowNo)
    if (localRecord && localRecord.flowStatus === 'draft') return
    let cancelled = false
    // 優先使用 OA 統一接口按 flowNo 查詢
    fetchOaRequestDetail(flowNo)
      .then((oaVo) => {
        if (cancelled) return
        // 從 formData 中提取 AI 申請字段（兼容 camelCase 與 snake_case）
        const fd = oaVo.formData || {}
        const applicantText = oaVo.applicant || '--'
        setAiRequest({
          id: oaVo.id,
          applicantName: oaVo.applicant,
          applicantId: 0,
          requestType: (fd.requestType || fd.request_type || '') as string,
          requestedModels: (fd.approvedModels || fd.approved_models || fd.requestedModels || fd.requested_models || []) as number[],
          usageDescription: (fd.usageDescription || fd.usage_description || '') as string,
          usageScenarios: (fd.usageScenarios || fd.usage_scenarios || []) as string[],
          usageFrequency: (fd.usageFrequency || fd.usage_frequency || '') as string,
          status: oaVo.flowStatus as 'pending' | 'approved' | 'rejected' | 'cancelled',
          approveRemark: oaVo.rejectReason || '',
          createdAt: oaVo.applyTime || '',
        } as AiRequestDetail)
        // 跨設備：本地無記錄（applicant 為佔位），以後端詳情補齊展示信息
        if (data.applicant === '--') {
          setData((prev) => ({
            ...prev,
            applicant: applicantText,
            applyDate: oaVo.applyTime || prev.applyDate,
            flowStatus: oaVo.flowStatus,
            aiRequestType: (fd.requestType || fd.request_type || '') as string,
            aiApplyReason: (fd.usageDescription || fd.usage_description || '') as string || undefined,
            aiRequestedModels: (fd.approvedModels || fd.approved_models || fd.requestedModels || fd.requested_models || prev.aiRequestedModels) as number[] | undefined,
            aiUsageDescription: (fd.usageDescription || fd.usage_description || '') as string,
            aiUsageScenarios: (fd.usageScenarios || fd.usage_scenarios || []) as string[],
            aiUsageFrequency: (fd.usageFrequency || fd.usage_frequency || '') as string || undefined,
            notes: (fd.usageDescription || fd.usage_description || '') as string,
            timeline: prev.timeline.map((item) => item.node === 'created'
              ? { ...item, approver: applicantText, time: oaVo.applyTime || item.time }
              : item),
          }))
        } else if (oaVo.flowStatus === 'approved' || oaVo.flowStatus === 'rejected' || oaVo.flowStatus === 'cancelled') {
          const local = getApprovalRecordByFlowNo(flowNo)
          if (local && local.flowStatus === 'pending') {
            updateApprovalRecord(flowNo, {
              flowStatus: oaVo.flowStatus,
              rejectReason: oaVo.flowStatus === 'rejected' ? (oaVo.rejectReason || '') : local.rejectReason,
            })
          }
          setData((prev) => (prev.flowStatus === 'pending' ? { ...prev, flowStatus: oaVo.flowStatus } : prev))
        } else {
          setData((prev) => {
            const nextModels = (fd.approvedModels || fd.approved_models || fd.requestedModels || fd.requested_models) as number[] | undefined
            if (nextModels && JSON.stringify(nextModels) !== JSON.stringify(prev.aiRequestedModels)) {
              return { ...prev, aiRequestedModels: nextModels }
            }
            return prev
          })
        }
      })
      .catch(() => {
        // OA 接口不可用時，降級使用舊接口
        if (!aiRequestId) return
        fetchOaRequestDetail(flowNo)
          .then((oaVo) => {
            if (cancelled) return
            const fd = oaVo.formData || {}
            const aiDetail: AiRequestDetail = {
              id: oaVo.id,
              applicantName: oaVo.applicant,
              applicantId: 0,
              requestType: (fd.requestType || fd.request_type || '') as string,
              requestedModels: (fd.requestedModels || fd.requested_models || []) as number[],
              usageDescription: (fd.usageDescription || fd.usage_description || '') as string,
              usageScenarios: (fd.usageScenarios || fd.usage_scenarios || []) as string[],
              usageFrequency: (fd.usageFrequency || fd.usage_frequency || '') as string,
              status: oaVo.flowStatus as 'pending' | 'approved' | 'rejected' | 'cancelled',
              approveRemark: oaVo.rejectReason || '',
              createdAt: oaVo.applyTime || '',
              approvedModelConfigs: fd.approvedModelConfigs as AiRequestDetail['approvedModelConfigs'],
              approvedQuotaValue: fd.approvedQuotaValue as number | undefined,
              approvedQuotaType: fd.approvedQuotaType as string | undefined,
              approvedQuotaPeriod: fd.approvedQuotaPeriod as string | undefined,
              quotaEffectiveType: fd.quotaEffectiveType as string | undefined,
              quotaExpireAt: fd.quotaExpireAt as string | undefined,
              approverName: fd.approverName as string | undefined,
              approvedAt: fd.approvedAt as string | undefined,
            }
            setAiRequest(aiDetail)
            if (data.applicant === '--') {
              const applicantText2 = `${aiDetail.applicantName || oaVo.applicant}(MF${String(aiDetail.applicantId).padStart(5, '0')})`
              setData((prev) => ({
                ...prev,
                applicant: applicantText2,
                applyDate: aiDetail.createdAt || prev.applyDate,
                flowStatus: aiDetail.status,
                aiRequestType: aiDetail.requestType,
                aiApplyReason: fd.applyReason as string ?? undefined,
                aiRequestedModels: aiDetail.requestedModels ?? undefined,
                aiUsageDescription: aiDetail.usageDescription,
                aiUsageScenarios: aiDetail.usageScenarios ?? [],
                aiUsageFrequency: aiDetail.usageFrequency ?? undefined,
                notes: aiDetail.usageDescription,
                timeline: prev.timeline.map((item) => item.node === 'created'
                  ? { ...item, approver: applicantText2, time: aiDetail.createdAt || item.time }
                  : item),
              }))
            } else if (aiDetail.status === 'approved' || aiDetail.status === 'rejected' || aiDetail.status === 'cancelled') {
              const local = getApprovalRecordByFlowNo(flowNo)
              if (local && local.flowStatus === 'pending') {
                updateApprovalRecord(flowNo, {
                  flowStatus: aiDetail.status,
                  rejectReason: aiDetail.status === 'rejected' ? (aiDetail.approveRemark || '') : local.rejectReason,
                })
              }
              setData((prev) => (prev.flowStatus === 'pending' ? { ...prev, flowStatus: aiDetail.status } : prev))
            } else {
              setData((prev) => {
                const nextModels = aiDetail.requestedModels ?? prev.aiRequestedModels
                if (nextModels && JSON.stringify(nextModels) !== JSON.stringify(prev.aiRequestedModels)) {
                  return { ...prev, aiRequestedModels: nextModels }
                }
                return prev
              })
            }
          })
          .catch(() => { /* 後端不可用時保留 extra 展示 */ })
      })
    return () => { cancelled = true }
  }, [type, flowNo, aiRequestId, data.applicant])

  /** 採購申請：從後端拉取詳情數據（申請人、申請日期、採購明細等） */
  useEffect(() => {
    if (type !== 'oa_purchase' || !flowNo) return
    let cancelled = false
    fetchOaRequestDetail(flowNo)
      .then((oaVo: OaRequestVO) => {
        if (cancelled) return
        const fd = oaVo.formData || {}
        const applicantText = oaVo.applicant || '--'
        const purchaseItems = Array.isArray(fd.items)
          ? (fd.items as Array<{ modelName: string; qty: number; remark?: string; categoryName?: string; brandName?: string; params?: Record<string, string> }>)
          : []
        // 從審批任務構建時間軸
        const timeline: ApprovalTimelineItem[] = []
        // 流程創建節點
        timeline.push({
          node: 'created',
          time: oaVo.applyTime || '',
          approver: applicantText,
          status: 'submitted',
          comment: '',
        })
        // 審批任務節點
        if (oaVo.approvalTasks?.length) {
          oaVo.approvalTasks.forEach((task) => {
            let status: ApprovalTimelineItem['status'] = 'pending'
            if (task.taskStatus === 'approved') status = 'approved'
            else if (task.taskStatus === 'rejected') status = 'rejected'
            timeline.push({
              node: task.nodeName || '',
              time: task.approveTime || '',
              approver: task.approver || '--',
              status,
              comment: task.comment || '',
            })
          })
        }
        setData((prev) => ({
          ...prev,
          applicant: applicantText,
          applyDate: oaVo.applyTime || '',
          flowStatus: oaVo.flowStatus,
          brand: fd.brand != null ? String(fd.brand as number | string) : prev.brand,
          applyDepartment: (fd.department as string) || undefined,
          department: (fd.serviceDepartment as string) || undefined,
          position: (fd.position as string) || undefined,
          company: (fd.company as string) || undefined,
          notes: (fd.reason as string) || '',
          purchaseItems,
          hasRevoke: oaVo.flowStatus === 'pending',
          timeline,
        }))
      })
      .catch(() => { /* 後端不可用時保留 fallback 展示 */ })
    return () => { cancelled = true }
  }, [type, flowNo])

  /** AI 申請審批操作區草稿初始化：第二節點讀取第一節點保存的 draftGrant，否則按申請內容初始化 */
  useEffect(() => {
    if (type !== 'ai_access' || !isPending || grantDraft) return
    setGrantDraft(data.aiDraftGrant ?? emptyGrantDraft(data.aiRequestedModels))
  }, [type, isPending, grantDraft, data.aiDraftGrant, data.aiRequestedModels])

  /** 模型名稱映射（審批結果展示用） */
  const [modelNames, setModelNames] = useState<Record<number, string>>({})
  useEffect(() => {
    if (type !== 'ai_access') return
    let cancelled = false
    fetchModels({ status: 1 })
      .then((list) => {
        if (cancelled) return
        const map: Record<number, string> = {}
        list.forEach((m) => { map[m.id] = m.name || m.modelKey })
        setModelNames(map)
      })
      .catch(() => { /* 後端不可用時展示模型 ID */ })
    return () => { cancelled = true }
  }, [type])

  const handleApprove = () => {
    // 前端流程（贈送、AI 申請）需校驗當前人是否具備當前節點角色權限
    if (type === 'gift' || type === 'ai_access') {
      const localRecord = getApprovalRecordByFlowNo(flowNo)
      if (localRecord) {
        const check = hasNodeApprovalRole(localRecord)
        if (!check.ok) {
          message.error(`您沒有「${check.nodeName}」節點的角色權限，無法審批`)
          return
        }
      }
    }
    // AI 申請：審批操作區（授權範圍 + 額度設置）提交前校驗
    if (type === 'ai_access') {
      if (!grantDraft) return
      const grantError = validateGrantDraft(grantDraft, data.aiRequestType || 'model_and_quota', t)
      if (grantError) {
        message.warning(grantError)
        return
      }
    }
    Modal.confirm({
      title: t('approvalDetail.approveConfirm'),
      content: type === 'ai_access'
        ? t('approvalDetail.aiApproveContent')
        : t('approvalDetail.approveContent'),
      okText: t('approvalDetail.approveOk'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        setSubmitting(true)
        try {
          /**
           * AI 申請（審批即授權）：
           * - 最終節點（本地第二節點，或跨設備無本地記錄時後端為唯一權威）：調後端 approve API，
           *   單事務寫入審批結果 + 下發模型權限（ai_employee_auth）+ 個人額度（ai_quota_override）；
           * - 第一節點（業務主管）：將審批操作區配置保存為 draftGrant，供第二節點繼續調整。
           * 後端調用失敗時中止（保持 pending 可重試），不推進本地，避免兩端狀態不一致。
           */
          if (type === 'ai_access' && grantDraft) {
            const localRecord = getApprovalRecordByFlowNo(flowNo)
            const isFinalNode = !localRecord
              || (localRecord.bizApproveStatus === 'approved' && localRecord.opsApproveStatus === 'pending')
            if (isFinalNode) {
              const payload = JSON.stringify(buildApprovePayload(grantDraft, approvalComment))
              await approveOaRequest(flowNo, approvalComment, payload)
              message.success(t('approvalDetail.aiGrantDone'))
            } else if (localRecord) {
              updateApprovalRecord(flowNo, {
                extra: { ...(localRecord.extra || {}), draftGrant: grantDraft },
              })
            }
          }
          // 三級逐級推進（業務→運營→財務），財務節點通過同時寫入批次/明細/欠款單；前端流程（贈送/AI 申請）直接本地審批；OA 採購走 OA 審批 API
          const isFrontendFlow = type === 'gift' || type === 'ai_access'
          const result = type === 'oa_purchase'
            ? ((await approveOaRequest(flowNo, approvalComment)), null)
            : isFrontendFlow
              ? approveCurrentNode(flowNo)
              : await approveFinApproval(flowNo)
          if (result) {
            message.success(result.finished
              ? t('approvalDetail.approveFinished', {
                  nodeName: result.nodeName,
                  writtenDesc: type === 'gift' ? t('approvalDetail.giftWritten') : t('approvalDetail.dataWritten'),
                })
              : t('approvalDetail.approveNext', { nodeName: result.nodeName, nextNode: result.nextNode }))
          }
          const isOaFlow = type === 'oa_purchase' || type === 'ai_access'
          navigate(isOaFlow ? '/oa-requests' : '/approval-center')
        } catch (err) {
          // 無審批權限（403）或審批即授權事務失敗等業務校驗失敗，展示後端給出的具體原因
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
    // 前端流程（贈送、AI 申請）需校驗當前人是否具備當前節點角色權限
    if (type === 'gift' || type === 'ai_access') {
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
      /**
       * AI 申請駁回：同步寫後端（審批人可跨設備操作），失敗時中止保持 pending 可重試；
       * 駁回當前節點，流程結束（合併駁回時解凍雙方賬戶）；前端流程直接本地駁回；OA 採購走 OA 駁回 API
       */
      if (type === 'ai_access' && data.aiRequestId) {
        await rejectOaRequest(flowNo, rejectReason)
      } else if (type === 'oa_purchase') {
        await rejectOaRequest(flowNo, rejectReason)
      }
      const isFrontendFlow = type === 'gift' || type === 'ai_access'
      const rejectedNode = isFrontendFlow
        ? rejectCurrentNode(flowNo, rejectReason)
        : type === 'oa_purchase'
          ? null
          : (await rejectFinApproval(flowNo, rejectReason), null)
      message.success(rejectedNode
        ? t('approvalDetail.rejectDone', { nodeName: rejectedNode })
        : t('approvalCenter.rejectSuccess'))
      setShowRejectModal(false)
      const isOaFlow = type === 'oa_purchase' || type === 'ai_access'
      navigate(isOaFlow ? '/oa-requests' : '/approval-center')
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
      // 前端流程（贈送、AI 申請）為本地記錄，直接本地撤銷；OA 類流程同步撤銷後端申請
      if (type === 'ai_access' && data.aiRequestId) {
        await cancelOaRequest(flowNo)
        updateApprovalRecord(flowNo, { flowStatus: 'cancelled' })
      } else if (type === 'gift') {
        updateApprovalRecord(flowNo, { flowStatus: 'cancelled' })
      } else if (type === 'oa_purchase') {
        await cancelOaRequest(flowNo)
      } else {
        await cancelFinApproval(flowNo)
      }
      message.success(t('approvalDetail.revokeSuccess'))
      setShowRevokeModal(false)
      // 停留在當前頁面，更新本地狀態以反映已撤銷的流程
      setData((prev) => ({ ...prev, flowStatus: 'cancelled', hasRevoke: false }))
    } catch (err) {
      message.error((err as Error)?.message || t('approvalDetail.revokeFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  /** 刪除草稿（僅 draft 狀態可用） */
  const handleDelete = () => {
    setShowDeleteModal(true)
  }

  const handleDeleteConfirm = async () => {
    // 後端記錄：調用撤銷 API 刪除
    if ((type === 'oa_purchase' || type === 'ai_access') && flowNo) {
      try {
        await cancelOaRequest(flowNo)
      } catch { /* API 失敗仍刪除本地記錄 */ }
    }
    // 刪除本地審批記錄
    deleteApprovalRecord(flowNo)
    message.success('草稿已刪除')
    setShowDeleteModal(false)
    navigate('/oa-requests')
  }

  /** 提交草稿（draft → pending） */
  const handleSubmitDraft = async () => {
    if (!flowNo) return
    setSubmitting(true)
    try {
      await submitDraftOaRequest(flowNo)
      message.success('流程已提交')
      // 刷新詳情
      const oaVo = await fetchOaRequestDetail(flowNo)
      const fd = oaVo.formData || {}
      const purchaseItems = Array.isArray(fd.items)
        ? (fd.items as Array<{ modelName: string; qty: number; remark?: string; categoryName?: string; brandName?: string; params?: Record<string, string> }>)
        : []
      const timeline: ApprovalTimelineItem[] = []
      timeline.push({
        node: 'created',
        time: oaVo.applyTime || '',
        approver: oaVo.applicant || '--',
        status: 'submitted',
        comment: '',
      })
      if (oaVo.approvalTasks?.length) {
        oaVo.approvalTasks.forEach((task) => {
          let status: ApprovalTimelineItem['status'] = 'pending'
          if (task.taskStatus === 'approved') status = 'approved'
          else if (task.taskStatus === 'rejected') status = 'rejected'
          timeline.push({
            node: task.nodeName || '',
            time: task.approveTime || '',
            approver: task.approver || '--',
            status,
            comment: task.comment || '',
          })
        })
      }
      setData((prev) => ({
        ...prev,
        flowStatus: oaVo.flowStatus,
        purchaseItems,
        hasRevoke: oaVo.flowStatus === 'pending',
        timeline,
      }))
    } catch (err) {
      message.error((err as Error)?.message || '提交失敗，請重試')
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

  /** 模块标题行（设计规范：图标色块 + 标题 + 横杠） */
  const renderSectionTitle = (icon: React.ReactNode, title: React.ReactNode, variant: 'blue' | 'purple' | 'orange' | 'green' | 'red' | 'default' = 'default') => {
    const colorMap: Record<string, { bg: string; color: string }> = {
      blue:    { bg: '#e6f7ff', color: '#1890ff' },
      purple:  { bg: '#f9f0ff', color: '#722ed1' },
      orange:  { bg: '#fff7e6', color: '#fa8c16' },
      green:   { bg: '#f6ffed', color: '#52c41a' },
      red:     { bg: '#fff1f0', color: '#ff4d4f' },
      default: { bg: '#f5f5f5', color: '#8c8c8c' },
    }
    const c = colorMap[variant] || colorMap.default
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <div style={{ width: 28, height: 28, borderRadius: 6, background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {icon}
        </div>
        <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{title}</span>
        <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
      </div>
    )
  }

  return (
    <div className="approval-detail-page">
      {/* 顶部标题栏（全局詳情頁統一規範：紫色頂條 + 橙色返回；審批操作保留在右側，無編輯頁） */}
      <DetailPageHeader
        title={typeTitleMapKeys[type] ? t(typeTitleMapKeys[type]) : type}
        tags={
          <>
            {type === 'oa_purchase' || type === 'ai_access'
              ? <Tag color={type === 'oa_purchase' ? 'orange' : 'blue'} style={{ margin: 0 }}>{type === 'oa_purchase' ? '採購' : 'AI申請'}</Tag>
              : <Tag color="blue" style={{ margin: 0 }}>{data.brand}</Tag>}
            <span style={{ fontSize: 13, color: '#8C8C8C' }}>{data.applyDate.split(' ')[0]}</span>
            <span style={{ fontSize: 13, color: '#595959', fontWeight: 500 }}>{data.applicant}</span>
          </>
        }
        onBack={() => navigate(-1)}
        extra={
          <div style={{ display: 'flex', gap: 8 }}>
            {data.flowStatus === 'draft' && (
              <>
                <Button type="primary" icon={<SendOutlined />} loading={submitting} onClick={handleSubmitDraft}>提交</Button>
                <Button danger onClick={handleDelete}>刪除</Button>
              </>
            )}
            {isPending && !hasApprovedNode && (
              <Button icon={<UndoOutlined />} onClick={handleRevoke}>{t('approvalCenter.cancel')}</Button>
            )}
            {isPending && isCurrentApprover && (
              <>
                <Button type="primary" loading={submitting} onClick={handleApprove}>{t('approvalCenter.statusApproved')}</Button>
                <Button danger loading={submitting} onClick={handleReject}>{t('approvalCenter.statusRejected')}</Button>
              </>
            )}
          </div>
        }
      />

      {/* 主体内容 */}
      <div className="approval-detail-body">
        {/* 左侧信息 */}
        <div className="approval-detail-left">
          {/* 基本信息 */}
          <div className="approval-section">
            {renderSectionTitle(<FileTextOutlined style={{ fontSize: 14, color: '#1890ff' }} />, t('approvalDetail.baseInfo'), 'blue')}
            <div className="approval-info-grid">
              {/* 第一行：申請人、申請日期、流程編號 */}
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
              {/* 第二行：所屬公司、服務部門、職位 */}
              {type === 'ai_access' || type === 'oa_purchase' ? (
                <>
                  <div className="approval-info-item">
                    <span className="approval-info-label">{t('aiApply.company')}</span>
                    <span className="approval-info-value">{data.company || '--'}</span>
                  </div>
                  <div className="approval-info-item">
                    <span className="approval-info-label">{t('aiApply.department')}</span>
                    <span className="approval-info-value">{data.department || '--'}</span>
                  </div>
                  <div className="approval-info-item">
                    <span className="approval-info-label">{t('aiApply.position')}</span>
                    <span className="approval-info-value">{data.position || '--'}</span>
                  </div>
                  {type === 'oa_purchase' && (
                    <div className="approval-info-item">
                      <span className="approval-info-label">{t('common.colBrand')}</span>
                      <span className="approval-info-value">
                        {data.brand && data.brand !== '--' ? <BrandTag value={data.brand} /> : '--'}
                      </span>
                    </div>
                  )}
                  {type === 'oa_purchase' && data.applyDepartment && (
                    <div className="approval-info-item">
                      <span className="approval-info-label">{t('aiApply.applyDepartment')}</span>
                      <span className="approval-info-value">{data.applyDepartment}</span>
                    </div>
                  )}
                </>
              ) : null}
              {/* 第三行：流程狀態 */}
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
                {renderSectionTitle(<AccountBookOutlined style={{ fontSize: 14, color: '#722ed1' }} />, t('approvalDetail.rechargeAccountInfo'), 'purple')}
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
                {renderSectionTitle(<DollarOutlined style={{ fontSize: 14, color: '#fa8c16' }} />, t('approvalDetail.rechargeAmountDetail'), 'orange')}
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
                  {renderSectionTitle(<ShopOutlined style={{ fontSize: 14, color: '#8c8c8c' }} />, t('approvalDetail.deductStores'))}
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
                {renderSectionTitle(<FileTextOutlined style={{ fontSize: 14, color: '#722ed1' }} />, t('approvalDetail.baseInfo'), 'purple')}
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
                {renderSectionTitle(<CreditCardOutlined style={{ fontSize: 14, color: '#fa8c16' }} />, t('approvalDetail.deductMethodTitle'), 'orange')}
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
                {renderSectionTitle(<LogoutOutlined style={{ fontSize: 14, color: '#722ed1' }} />, t('approvalDetail.fromGroup'), 'purple')}
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
                {renderSectionTitle(<LoginOutlined style={{ fontSize: 14, color: '#52c41a' }} />, t('approvalDetail.toGroup'), 'green')}
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
                {renderSectionTitle(<SwapOutlined style={{ fontSize: 14, color: '#fa8c16' }} />, t('approvalDetail.transferAmountTitle'), 'orange')}
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
                {renderSectionTitle(<CloseCircleOutlined style={{ fontSize: 14, color: '#722ed1' }} />, <>{t('approvalDetail.cancelledGroup')} <Tag color="red" style={{ fontSize: 11, marginLeft: 4 }}>{t('approvalDetail.closingSoon')}</Tag></>, 'purple')}
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
                {renderSectionTitle(<CheckCircleOutlined style={{ fontSize: 14, color: '#52c41a' }} />, <>{t('approvalDetail.survivingGroup')} <Tag color="green" style={{ fontSize: 11, marginLeft: 4 }}>{t('approvalDetail.receivingAssets')}</Tag></>, 'green')}
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
                  {renderSectionTitle(<WarningOutlined style={{ fontSize: 14, color: '#ff4d4f' }} />, t('approvalDetail.debtRepayment'), 'red')}
                  <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 12 }}>
                    {t('approvalDetail.debtRepaymentDesc', { amount: data.mergeDebtAmount?.toLocaleString() })}
                  </div>
                  <Table
                    size="small"
                    bordered
                    pagination={false}
                    scroll={{ x: 'max-content' }}
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
              {renderSectionTitle(<GiftOutlined style={{ fontSize: 14, color: '#722ed1' }} />, t('approvalDetail.giftConfig'), 'purple')}
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

          {/* AI 申請類型 */}
          {type === 'ai_access' && (
            <div className="approval-section">
              {renderSectionTitle(<RobotOutlined style={{ fontSize: 14, color: '#722ed1' }} />, t('approvalDetail.aiAccessInfo'), 'purple')}
              <div className="approval-info-grid">
                <div className="approval-info-item">
                  <span className="approval-info-label">{t('approvalDetail.aiRequestType')}</span>
                  <span className="approval-info-value">
                    <Tag color={data.aiRequestType === 'model_only' ? 'blue' : data.aiRequestType === 'quota_only' ? 'orange' : 'green'}>
                      {t(`aiApply.type${data.aiRequestType === 'model_only' ? 'ModelOnly' : data.aiRequestType === 'quota_only' ? 'QuotaOnly' : 'ModelAndQuota'}`)}
                    </Tag>
                  </span>
                </div>
                {data.aiUsageFrequency && (
                  <div className="approval-info-item">
                    <span className="approval-info-label">{t('aiApply.usageFrequency')}</span>
                    <span className="approval-info-value">{t(`aiApply.freq${data.aiUsageFrequency === 'occasional' ? 'Occasional' : data.aiUsageFrequency === 'regular' ? 'Regular' : 'Heavy'}`)}</span>
                  </div>
                )}
                {data.aiUsageScenarios && data.aiUsageScenarios.length > 0 && (
                  <div className="approval-info-item" style={{ gridColumn: '1 / -1' }}>
                    <span className="approval-info-label">{t('aiApply.usageScenarios')}</span>
                    <span className="approval-info-value">
                      {data.aiUsageScenarios.map(s => (
                        <Tag key={s} color="geekblue" style={{ marginRight: 4, marginBottom: 4 }}>
                          {t(`aiApply.scenario${s === 'copywriting' ? 'Copywriting' : s === 'data_analysis' ? 'DataAnalysis' : s === 'image_understanding' ? 'Image' : s === 'code_assist' ? 'Code' : s === 'customer_service' ? 'CS' : s === 'translation' ? 'Translation' : 'Other'}`)}
                        </Tag>
                      ))}
                    </span>
                  </div>
                )}
                {data.aiRequestedModels && data.aiRequestedModels.length > 0 && (
                  <div className="approval-info-item" style={{ gridColumn: '1 / -1' }}>
                    <span className="approval-info-label">{t('aiApply.requestedModels')}</span>
                    <span className="approval-info-value">
                      {data.aiRequestedModels.map((id) => (
                        <Tag key={id} color="blue" style={{ marginRight: 4, marginBottom: 4 }}>
                          {modelNames[id] ?? id}
                        </Tag>
                      ))}
                    </span>
                  </div>
                )}
                {data.aiUsageDescription && (
                  <div className="approval-info-item" style={{ gridColumn: '1 / -1' }}>
                    <span className="approval-info-label">{t('aiApply.usageDescription')}</span>
                    <span className="approval-info-value">{data.aiUsageDescription}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* AI 申請：審批操作區（授權範圍 + 額度設置，審批即授權） */}
          {type === 'ai_access' && isPending && grantDraft && (
            <AiApprovalActionPanel
              requestType={data.aiRequestType || 'model_and_quota'}
              requestedModels={data.aiRequestedModels}
              draft={grantDraft}
              onChange={setGrantDraft}
            />
          )}

          {/* AI 申請：審批結果（審批即授權下發明細，供申請人與審批人回看） */}
          {type === 'ai_access' && !isPending && aiRequest && (
            <div className="approval-section">
              {renderSectionTitle(<CheckCircleOutlined style={{ fontSize: 14, color: '#52c41a' }} />, t('approvalDetail.aiResultTitle'), 'green')}
              <div className="approval-info-grid">
                {aiRequest.approvedModelConfigs && aiRequest.approvedModelConfigs.length > 0 && (
                  <div className="approval-info-item" style={{ gridColumn: '1 / -1' }}>
                    <span className="approval-info-label">{t('approvalDetail.aiResultModels')}</span>
                    <span className="approval-info-value">
                      {aiRequest.approvedModelConfigs.map((c) => (
                        <Tag key={c.modelId} color="green" style={{ marginRight: 4, marginBottom: 4 }}>
                          {modelNames[c.modelId] ?? c.modelId}
                        </Tag>
                      ))}
                    </span>
                  </div>
                )}
                {aiRequest.approvedQuotaValue != null && (
                  <>
                    <div className="approval-info-item">
                      <span className="approval-info-label">{t('approvalDetail.aiGrantQuotaValue')}</span>
                      <span className="approval-info-value approval-amount--orange">
                        {aiRequest.approvedQuotaValue.toLocaleString()}{aiRequest.approvedQuotaType === 'requests' ? ` ${t('approvalDetail.aiGrantQuotaTypeRequests')}` : ` ${t('approvalDetail.aiGrantQuotaTypeTokens')}`}
                      </span>
                    </div>
                    <div className="approval-info-item">
                      <span className="approval-info-label">{t('approvalDetail.aiGrantQuotaPeriod')}</span>
                      <span className="approval-info-value">
                        {aiRequest.approvedQuotaPeriod === 'daily'
                          ? t('approvalDetail.aiGrantQuotaPeriodDaily')
                          : t('approvalDetail.aiGrantQuotaPeriodMonthly')}
                      </span>
                    </div>
                    <div className="approval-info-item">
                      <span className="approval-info-label">{t('approvalDetail.aiGrantEffectiveType')}</span>
                      <span className="approval-info-value">
                        <Tag color={aiRequest.quotaEffectiveType === 'temporary' ? 'orange' : 'green'}>
                          {aiRequest.quotaEffectiveType === 'temporary'
                            ? t('approvalDetail.aiGrantEffectiveTemporary')
                            : t('approvalDetail.aiGrantEffectivePermanent')}
                        </Tag>
                      </span>
                    </div>
                    {aiRequest.quotaExpireAt && (
                      <div className="approval-info-item">
                        <span className="approval-info-label">{t('approvalDetail.aiGrantExpireAt')}</span>
                        <span className="approval-info-value">{aiRequest.quotaExpireAt}</span>
                      </div>
                    )}
                  </>
                )}
                {aiRequest.approverName && (
                  <div className="approval-info-item">
                    <span className="approval-info-label">{t('approvalCenter.colApprover')}</span>
                    <span className="approval-info-value">{aiRequest.approverName}</span>
                  </div>
                )}
                {aiRequest.approvedAt && (
                  <div className="approval-info-item">
                    <span className="approval-info-label">{t('approvalDetail.applyDate')}</span>
                    <span className="approval-info-value">{aiRequest.approvedAt}</span>
                  </div>
                )}
                {aiRequest.approveRemark && (
                  <div className="approval-info-item" style={{ gridColumn: '1 / -1' }}>
                    <span className="approval-info-label">{t('approvalDetail.commentTitle')}</span>
                    <span className="approval-info-value">{aiRequest.approveRemark}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 採購申請類型：採購明細表格 */}
          {type === 'oa_purchase' && data.purchaseItems && data.purchaseItems.length > 0 && (
            <div className="approval-section">
              {renderSectionTitle(<ShoppingCartOutlined style={{ fontSize: 14, color: '#8c8c8c' }} />, '採購明細')}
              <Table
                size="small"
                pagination={false}
                scroll={{ x: 'max-content' }}
                dataSource={data.purchaseItems.map((item, i) => ({ ...item, key: i }))}
                columns={[
                  { title: '序號', width: 60, render: (_: unknown, __: unknown, i: number) => i + 1 },
                  { title: '資產分類', dataIndex: 'categoryName', key: 'categoryName', width: 100, render: (v: string) => v || '--' },
                  { title: '资产品牌', dataIndex: 'brandName', key: 'brandName', width: 80, render: (v: string) => v || '--' },
                  { title: '資產名稱', dataIndex: 'modelName', key: 'modelName', width: 140, render: (v: string) => v || '--' },
                  { title: '參數信息', dataIndex: 'params', key: 'params', width: 260, render: (v: Record<string, string> | undefined) => {
                    if (!v || Object.keys(v).length === 0) return '--'
                    const entries = Object.entries(v).filter(([, val]) => val && val !== 'undefined')
                    if (entries.length === 0) return '--'
                    return <span style={{ fontSize: 12, color: '#595959' }}>{entries.map(([k, val]) => `${paramLabelMap[k] || k}: ${val}`).join(', ')}</span>
                  }},
                  { title: '數量', dataIndex: 'qty', key: 'qty', width: 70, align: 'right', render: (v: number) => v ?? '--' },
                  { title: '備註', dataIndex: 'remark', key: 'remark', width: 120, render: (v: string) => v || '--' },
                ]}
              />
            </div>
          )}

          {/* 相关凭证 */}
          <div className="approval-section">
            {renderSectionTitle(<FileImageOutlined style={{ fontSize: 14, color: '#8c8c8c' }} />, t('approvalDetail.documents'))}
            <div className="approval-documents">
              {data.documents?.map((doc, i) => renderDocument(doc, i))}
            </div>
          </div>

          {/* 备注信息 / 採購事由（AI 申請的用途說明已在 AI 申請資訊中展示，此處不重複） */}
          {type !== 'ai_access' && (
          <div className="approval-section">
            {renderSectionTitle(<FileTextOutlined style={{ fontSize: 14, color: '#8c8c8c' }} />, type === 'oa_purchase' ? '採購事由' : t('approvalDetail.notesTitle'))}
            <div className="approval-notes">{data.notes}</div>
          </div>
          )}

          {/* 审批意见 */}
          <div className="approval-section">
            {renderSectionTitle(<ExclamationCircleOutlined style={{ fontSize: 14, color: '#8c8c8c' }} />, t('approvalDetail.commentTitle'))}
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
                      {/* 多人審批：最多展示 3 人，超出顯示 +N 點擊查看 */}
                      {item.approvers.slice(0, 3).map((a, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span>{a.status === 'skipped' ? <s style={{ color: '#bbb' }}>{a.name}</s> : a.name}</span>
                          {renderStatusTag(a.status === 'skipped' ? 'pending' : a.status)}
                          <span style={{ color: '#999', fontSize: 11 }}>{a.time || '--'}</span>
                        </div>
                      ))}
                      {item.approvers.length > 3 && (
                        <Button
                          type="link"
                          size="small"
                          style={{ padding: 0, height: 22, fontSize: 12 }}
                          onClick={() => setViewApprovers({
                            nodeName: timelineNodeMapKeys[item.node] ? t(timelineNodeMapKeys[item.node]) : item.node,
                            approvers: item.approvers!,
                          })}
                        >
                          +{item.approvers.length - 3}
                        </Button>
                      )}
                      {/* 審批規則標識：會簽=需全部審批人通過 / 或簽=任一人通過即可 */}
                      {item.approvers.length > 1 && item.approvalRule && (
                        <div style={{ marginTop: 2 }}>
                          <Tag color={item.approvalRule === 'all' ? 'orange' : 'blue'} style={{ fontSize: 11 }}>
                            {item.approvalRule === 'all' ? t('approvalCenter.ruleAll') : t('approvalCenter.ruleAny')}
                          </Tag>
                        </div>
                      )}
                      <div className="approval-timeline-status" style={{ marginTop: 4 }}>
                        {renderStatusTag(item.status)}
                      </div>
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
        <Button onClick={() => navigate(-1)}>{t('common.back')}</Button>
        {canRevoke && (
          <Button icon={<UndoOutlined />} onClick={handleRevoke}>{t('approvalDetail.revoke')}</Button>
        )}
        {isPending && isCurrentApprover && (
          <>
            {/* 前端流程審批角色權限提示（贈送、AI 申請） */}
            {(type === 'gift' || type === 'ai_access') && (() => {
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

      {/* 刪除確認彈窗 */}
      <Modal
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>確認刪除</span>
            <Button type="link" size="small" onClick={() => setShowDeleteModal(false)} style={{ padding: 0 }}>{t('approvalDetail.close')}</Button>
          </div>
        }
        open={showDeleteModal}
        onCancel={() => setShowDeleteModal(false)}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
            <Button onClick={() => setShowDeleteModal(false)}>{t('common.cancel')}</Button>
            <Button danger onClick={handleDeleteConfirm}>確認刪除</Button>
          </div>
        }
        width={440}
        centered
      >
        <div className="revoke-modal-content">
          <div className="revoke-modal-icon">
            <ExclamationCircleOutlined />
          </div>
          <div className="revoke-modal-question">確認刪除此草稿？</div>
          <div className="revoke-modal-warning">刪除後將無法恢復，請謹慎操作！</div>
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

      {/* 查看全部審批人（多人審批時時間軸僅展示前 3 人） */}
      <Modal
        title={viewApprovers ? `${t('approvalCenter.approverListTitle')} - ${viewApprovers.nodeName}` : t('approvalCenter.approverListTitle')}
        open={!!viewApprovers}
        onCancel={() => setViewApprovers(null)}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button onClick={() => setViewApprovers(null)}>{t('common.cancel')}</Button>
          </div>
        }
        width={520}
        centered
      >
        {viewApprovers && (
          <div style={{ padding: '8px 0' }}>
            {viewApprovers.approvers.map((a, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '8px 0',
                  borderBottom: i < viewApprovers.approvers.length - 1 ? '1px solid #F0F0F0' : 'none',
                }}
              >
                <span style={{ flex: 1 }}>{a.status === 'skipped' ? <s style={{ color: '#bbb' }}>{a.name}</s> : a.name}</span>
                {renderStatusTag(a.status === 'skipped' ? 'pending' : a.status)}
                <span style={{ color: '#999', fontSize: 12, minWidth: 130, textAlign: 'right' }}>{a.time || '--'}</span>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  )
}
