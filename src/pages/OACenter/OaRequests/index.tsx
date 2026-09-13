/**
 * 流程事項頁面
 *
 * 展示所有審批類型（充值、轉賬、扣款、合併、贈送、AI申請）的統一列表，
 * 數據源與審批中心一致，但列字段更簡潔。
 * 點擊詳情/審批跳轉至 ApprovalDetail 頁面。
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Space, Input, Select, Table, Tag, Form, DatePicker, Tabs, message } from 'antd'
import type { TableColumnsType } from 'antd'
import type { Dayjs } from 'dayjs'
import { useTranslation } from 'react-i18next'
import {
  SearchOutlined,
  ReloadOutlined,
  PlusOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import { useAuth } from '../../../contexts/AuthContext'
import { fetchOaRequests, checkIsDeptLeader, cancelOaRequest, type OaRequestVO, type OaFlowStatus } from '../../../api/oaRequest'
import { getApprovalRecords, type ApprovalRecord } from '../../../utils/approvalStore'
import { fetchEmployees, type EmployeeItem } from '../../../api/employee'
import { fetchDepartments, type DepartmentItem } from '../../../api/department'
import { fetchRoles, type RoleItem } from '../../../api/role'
import { useColumnConfig } from '../../../hooks/useColumnConfig'

const { RangePicker } = DatePicker

/* ==================== 常量 ==================== */

/** 審批類型 → i18n key（與 ApprovalCenter 一致） */
const APPROVAL_TYPE_I18N: Record<string, string> = {
  recharge: 'approvalCenter.typeRecharge',
  deduct: 'approvalCenter.typeDeduct',
  transfer: 'approvalCenter.typeTransfer',
  merge: 'approvalCenter.typeMerge',
  gift: 'approvalCenter.typeGift',
  ai_access: 'oaRequests.aiAccessType',
  oa_purchase: 'oaRequests.typePurchase',
}

/** 審批類型 → 標籤顏色（與 WorkflowConfig 保持一致） */
const FLOW_TAG_COLOR: Record<string, string> = {
  recharge: '#52C41A',
  transfer: '#13C2C2',
  deduct: '#FF4D4F',
  merge: '#FA8C16',
  gift: '#722ED1',
  ai_access: '#1677FF',
  oa_purchase: '#FA8C16',
}

/** 流程類型 → 流程名稱前綴（用於「流程名稱」列） */
const FLOW_NAME_PREFIX: Record<string, string> = {
  recharge: '充值申請',
  transfer: '轉賬申請',
  deduct: '扣款申請',
  merge: '合併申請',
  gift: '贈送申請',
  ai_access: 'AI申請',
  oa_leave: '請假申請',
  oa_reimburse: '報銷申請',
  oa_purchase: '採購申請',
  oa_seal: '用章申請',
  oa_general: '通用審批',
}

/** 流程標籤短標籤（列表 Tag 用，與表單頁 FLOW_TAG_LABEL 保持一致） */
const FLOW_TAG_LABEL: Record<string, string> = {
  oa_purchase: '採購',
}

/** 流程狀態 → Tag 顏色 */
const FLOW_STATUS_COLOR: Record<string, string> = {
  draft: 'warning',
  pending: 'processing',
  approved: 'success',
  rejected: 'error',
  cancelled: 'default',
}

/** 流程狀態 → i18n key */
const FLOW_STATUS_I18N: Record<string, string> = {
  draft: 'approvalCenter.flowDraft',
  pending: 'approvalCenter.flowPending',
  approved: 'approvalCenter.flowApproved',
  rejected: 'approvalCenter.flowRejected',
  cancelled: 'approvalCenter.flowCancelled',
}

/** 當前節點 → i18n key */
const NODE_I18N: Record<string, string> = {
  business: 'approvalCenter.nodeBusiness',
  operation: 'approvalCenter.nodeOperation',
  finance: 'approvalCenter.nodeFinance',
}

/** processCode → approvalType 映射 */
const PROCESS_TO_TYPE: Record<string, string> = {
  recharge: 'recharge',
  transfer: 'transfer',
  deduct: 'deduct',
  merge: 'merge',
  gift: 'gift',
  ai_access: 'ai_access',
  oa_leave: 'oa_leave',
  oa_reimburse: 'oa_reimburse',
  oa_purchase: 'oa_purchase',
  oa_seal: 'oa_seal',
  oa_general: 'oa_general',
}

/* ==================== 類型 ==================== */

/** 統一流程行 VO */
interface FlowRow {
  key: string
  flowNo: string
  approvalType: string
  processCode: string
  applicant: string
  applicantId?: number
  applyTime: string
  flowStatus: string
  /** 當前審批節點名稱 */
  currentNodeName: string
  /** 當前審批人姓名 */
  currentApprover: string
  /** 當前用戶審批時間（待我審批 tab 用） */
  myApprovalTime: string
}

/* ==================== 工具函數 ==================== */

/** 「全部」等價於不篩選 */
function pickValue(v?: string) {
  return !v || v === 'all' ? undefined : v
}

/** 將 OaRequestVO 映射為 FlowRow */
function oaToRow(r: OaRequestVO): FlowRow {
  const processCode = r.processCode || ''
  const approvalType = PROCESS_TO_TYPE[processCode] || processCode
  return {
    key: r.flowNo,
    flowNo: r.flowNo,
    approvalType,
    processCode,
    applicant: r.applicant || '--',
    applyTime: r.applyTime || '',
    flowStatus: r.flowStatus || 'pending',
    currentNodeName: r.currentNodeName || '',
    currentApprover: r.currentApprover || '--',
    myApprovalTime: r.myApprovalTime || '',
  }
}

/** 將 localStorage 審批記錄映射為 FlowRow（AI 申請/採購草稿） */
function localRecordToRow(r: ApprovalRecord): FlowRow {
  return {
    key: r.flowNo,
    flowNo: r.flowNo,
    approvalType: r.approvalType,
    processCode: r.approvalType,
    applicant: r.applicant || '--',
    applyTime: r.applyTime || '',
    flowStatus: r.flowStatus || 'draft',
    currentNodeName: '',
    currentApprover: '--',
    myApprovalTime: '',
  }
}

/* ==================== 組件 ==================== */

export default function OaRequests() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [searchParams] = useSearchParams()

  /* ---- 參考數據 ---- */
  const employeesRef = useRef<EmployeeItem[]>([])
  const departmentsRef = useRef<DepartmentItem[]>([])
  const rolesRef = useRef<RoleItem[]>([])
  const [refReady, setRefReady] = useState(false)

  useEffect(() => {
    Promise.all([
      fetchEmployees({ page: 1, size: 200, employmentStatus: 'active' }).catch(() => ({ records: [], total: 0 })),
      fetchDepartments().catch(() => []),
      fetchRoles().catch(() => []),
    ]).then(([empRes, depts, roles]) => {
      employeesRef.current = (empRes as { records: EmployeeItem[] }).records || []
      departmentsRef.current = (depts as DepartmentItem[]) || []
      rolesRef.current = (roles as RoleItem[]) || []
      setRefReady(true)
    })
  }, [])

  /** 根據 applicantId 查找員工，返回「姓名(工號)」格式 */
  const getApplicantWithEmpId = (applicantName: string, applicantId?: number): string => {
    if (!applicantId) {
      // 沒有 applicantId 時，通過姓名查找員工
      const emp = employeesRef.current.find(e => e.name === applicantName)
      if (emp?.empId) return `${applicantName}(${emp.empId})`
      return applicantName
    }
    const emp = employeesRef.current.find(e => e.id === applicantId)
    if (emp?.empId) return `${applicantName}(${emp.empId})`
    return applicantName
  }

  /** 從申請人字符串中去掉工號部分，只保留姓名 */
  const stripEmpId = (applicant: string): string => {
    return applicant.replace(/\([^)]*\)/, '').trim()
  }

  /** 通過姓名查找員工，返回「姓名(工號)」格式（用於當前審批人顯示） */
  const getApproverWithEmpIdByName = (approverName: string): string => {
    if (!approverName || approverName === '--') return approverName
    const emp = employeesRef.current.find(e => e.name === approverName)
    if (emp?.empId) return `${approverName}(${emp.empId})`
    return approverName
  }

  /* ---- Tab 狀態 ---- */
  const [activeTab, setActiveTab] = useState(() => searchParams.get('tab') || 'my')
  const [isDeptLeader, setIsDeptLeader] = useState(false)

  const handleTabChange = (key: string) => {
    setActiveTab(key)
  }

  /* ---- 部門 leader 檢測 ---- */
  useEffect(() => {
    if (!refReady) return
    checkIsDeptLeader().then(res => {
      setIsDeptLeader(!!res?.isLeader)
    }).catch(() => setIsDeptLeader(false))
  }, [refReady])

  /* ==================== 篩選條件 ==================== */
  interface Filters {
    flowNo?: string
    flowName?: string
    flowTag?: string
    applicant?: string
    currentApprover?: string
    dateRange?: [Dayjs, Dayjs]
    flowStatus?: string
  }

  /* ---- Tab 1：我發起的 ---- */
  const [myForm] = Form.useForm()
  const [myData, setMyData] = useState<FlowRow[]>([])
  const [myLoading, setMyLoading] = useState(false)
  const [myFilters, setMyFilters] = useState<Filters>({})

  const loadMyRequests = useCallback(async () => {
    if (!refReady) return
    setMyLoading(true)
    try {
      const params: Record<string, unknown> = {
        page: 1,
        size: 500,
        scope: 'my_applied',
      }
      if (myFilters.flowStatus && myFilters.flowStatus !== 'all') {
        params.flowStatus = myFilters.flowStatus
      }
      if (myFilters.applicant?.trim()) {
        params.applicant = myFilters.applicant.trim()
      }
      if (myFilters.flowNo?.trim()) {
        params.flowNo = myFilters.flowNo.trim()
      }
      if (myFilters.dateRange?.[0]) {
        params.applyFrom = myFilters.dateRange[0].format('YYYY-MM-DD')
      }
      if (myFilters.dateRange?.[1]) {
        params.applyTo = myFilters.dateRange[1].format('YYYY-MM-DD')
      }

      const res = await fetchOaRequests(params as Parameters<typeof fetchOaRequests>[0]).catch(() => null)
      let rows: FlowRow[] = (res?.records || []).map(oaToRow)

      // 合併 localStorage 中的 AI 申請和採購草稿（這些草稿未提交到後端）
      const userName = user?.name || ''
      const localRecords = getApprovalRecords()
        .filter(r => (r.approvalType === 'ai_access' || r.approvalType === 'oa_purchase') && r.applicant.includes(userName))
        .map(localRecordToRow)
      const apiFlowNos = new Set(rows.map(r => r.flowNo))
      const uniqueLocalRows = localRecords.filter(r => !apiFlowNos.has(r.flowNo))
      rows = [...rows, ...uniqueLocalRows]

      // 前端過濾
      if (myFilters.flowTag) {
        rows = rows.filter(r => r.approvalType === myFilters.flowTag)
      }
      if (myFilters.flowName) {
        const q = myFilters.flowName.trim().toLowerCase()
        rows = rows.filter(r => {
          const name = `${r.processCode} ${r.applicant} ${r.applyTime}`.toLowerCase()
          return name.includes(q)
        })
      }
      if (myFilters.currentApprover) {
        const q = myFilters.currentApprover.trim().toLowerCase()
        rows = rows.filter(r => r.currentApprover.toLowerCase().includes(q))
      }

      rows.sort((a, b) => (b.applyTime || '').localeCompare(a.applyTime || ''))
      setMyData(rows)
    } catch {
      setMyData([])
    } finally {
      setMyLoading(false)
    }
  }, [myFilters, refReady, user])

  useEffect(() => { loadMyRequests() }, [loadMyRequests])

  const handleMySearch = () => {
    const values = myForm.getFieldsValue()
    setMyFilters({
      flowNo: values.flowNo,
      flowName: values.flowName,
      flowTag: values.flowTag,
      applicant: values.applicant,
      currentApprover: values.currentApprover,
      dateRange: values.dateRange,
      flowStatus: values.flowStatus,
    })
  }
  const handleMyReset = () => {
    myForm.resetFields()
    setMyFilters({})
  }

  /* ---- Tab 2：待我審批 ---- */
  const [pendingForm] = Form.useForm()
  const [pendingData, setPendingData] = useState<FlowRow[]>([])
  const [pendingLoading, setPendingLoading] = useState(false)
  const [pendingFilters, setPendingFilters] = useState<Filters>({})

  const loadPendingRequests = useCallback(async () => {
    if (!refReady) return
    setPendingLoading(true)
    try {
      const params: Record<string, unknown> = {
        page: 1,
        size: 500,
        scope: 'pending_my_approval',
      }
      if (pendingFilters.flowNo?.trim()) {
        params.flowNo = pendingFilters.flowNo.trim()
      }
      if (pendingFilters.applicant?.trim()) {
        params.applicant = pendingFilters.applicant.trim()
      }
      if (pendingFilters.dateRange?.[0]) {
        params.applyFrom = pendingFilters.dateRange[0].format('YYYY-MM-DD')
      }
      if (pendingFilters.dateRange?.[1]) {
        params.applyTo = pendingFilters.dateRange[1].format('YYYY-MM-DD')
      }

      const res = await fetchOaRequests(params as Parameters<typeof fetchOaRequests>[0]).catch(() => null)
      let rows: FlowRow[] = (res?.records || []).map(oaToRow)

      if (pendingFilters.flowTag) {
        rows = rows.filter(r => r.approvalType === pendingFilters.flowTag)
      }
      if (pendingFilters.currentApprover) {
        const q = pendingFilters.currentApprover.trim().toLowerCase()
        rows = rows.filter(r => r.currentApprover.toLowerCase().includes(q))
      }

      rows.sort((a, b) => (b.applyTime || '').localeCompare(a.applyTime || ''))
      setPendingData(rows)
    } catch {
      setPendingData([])
    } finally {
      setPendingLoading(false)
    }
  }, [pendingFilters, refReady, user])

  useEffect(() => { loadPendingRequests() }, [loadPendingRequests])

  const handlePendingSearch = () => {
    const values = pendingForm.getFieldsValue()
    setPendingFilters({
      flowNo: values.flowNo,
      flowName: values.flowName,
      flowTag: values.flowTag,
      currentApprover: values.currentApprover,
      dateRange: values.dateRange,
      flowStatus: values.flowStatus,
    })
  }
  const handlePendingReset = () => {
    pendingForm.resetFields()
    setPendingFilters({})
  }

  /* ---- Tab 3：我已審批的 ---- */
  const [approvedForm] = Form.useForm()
  const [approvedData, setApprovedData] = useState<FlowRow[]>([])
  const [approvedLoading, setApprovedLoading] = useState(false)
  const [approvedFilters, setApprovedFilters] = useState<Filters>({})

  const loadApprovedRequests = useCallback(async () => {
    if (!refReady) return
    setApprovedLoading(true)
    try {
      const params: Record<string, unknown> = {
        page: 1,
        size: 500,
        scope: 'my_approved',
      }
      if (approvedFilters.flowNo?.trim()) {
        params.flowNo = approvedFilters.flowNo.trim()
      }
      if (approvedFilters.applicant?.trim()) {
        params.applicant = approvedFilters.applicant.trim()
      }
      if (approvedFilters.dateRange?.[0]) {
        params.applyFrom = approvedFilters.dateRange[0].format('YYYY-MM-DD')
      }
      if (approvedFilters.dateRange?.[1]) {
        params.applyTo = approvedFilters.dateRange[1].format('YYYY-MM-DD')
      }

      const res = await fetchOaRequests(params as Parameters<typeof fetchOaRequests>[0]).catch(() => null)
      let rows: FlowRow[] = (res?.records || []).map(oaToRow)

      if (approvedFilters.flowTag) {
        rows = rows.filter(r => r.approvalType === approvedFilters.flowTag)
      }
      if (approvedFilters.flowName) {
        const q = approvedFilters.flowName.trim().toLowerCase()
        rows = rows.filter(r => {
          const name = `${r.processCode} ${r.applicant} ${r.applyTime}`.toLowerCase()
          return name.includes(q)
        })
      }

      rows.sort((a, b) => (b.applyTime || '').localeCompare(a.applyTime || ''))
      setApprovedData(rows)
    } catch {
      setApprovedData([])
    } finally {
      setApprovedLoading(false)
    }
  }, [approvedFilters, refReady, user])

  useEffect(() => { loadApprovedRequests() }, [loadApprovedRequests])

  const handleApprovedSearch = () => {
    const values = approvedForm.getFieldsValue()
    setApprovedFilters({
      flowNo: values.flowNo,
      flowName: values.flowName,
      flowTag: values.flowTag,
      applicant: values.applicant,
      dateRange: values.dateRange,
      flowStatus: values.flowStatus,
    })
  }
  const handleApprovedReset = () => {
    approvedForm.resetFields()
    setApprovedFilters({})
  }

  /* ---- Tab 4：全部流程 ---- */
  const [allForm] = Form.useForm()
  const [allData, setAllData] = useState<FlowRow[]>([])
  const [allLoading, setAllLoading] = useState(false)
  const [allFilters, setAllFilters] = useState<Filters>({})

  const loadAllFlows = useCallback(async () => {
    if (!refReady || !isDeptLeader) return
    setAllLoading(true)
    try {
      const params: Record<string, unknown> = {
        page: 1,
        size: 500,
        scope: 'department_all',
      }
      if (allFilters.flowNo?.trim()) {
        params.flowNo = allFilters.flowNo.trim()
      }
      if (allFilters.applicant?.trim()) {
        params.applicant = allFilters.applicant.trim()
      }
      if (allFilters.dateRange?.[0]) {
        params.applyFrom = allFilters.dateRange[0].format('YYYY-MM-DD')
      }
      if (allFilters.dateRange?.[1]) {
        params.applyTo = allFilters.dateRange[1].format('YYYY-MM-DD')
      }
      if (allFilters.flowStatus && allFilters.flowStatus !== 'all') {
        params.flowStatus = allFilters.flowStatus
      }

      const res = await fetchOaRequests(params as Parameters<typeof fetchOaRequests>[0]).catch(() => null)
      let rows: FlowRow[] = (res?.records || []).map(oaToRow)

      if (allFilters.flowTag) {
        rows = rows.filter(r => r.approvalType === allFilters.flowTag)
      }
      if (allFilters.flowName) {
        const q = allFilters.flowName.trim().toLowerCase()
        rows = rows.filter(r => {
          const name = `${r.processCode} ${r.applicant} ${r.applyTime}`.toLowerCase()
          return name.includes(q)
        })
      }
      if (allFilters.currentApprover) {
        const q = allFilters.currentApprover.trim().toLowerCase()
        rows = rows.filter(r => r.currentApprover.toLowerCase().includes(q))
      }

      rows.sort((a, b) => (b.applyTime || '').localeCompare(a.applyTime || ''))
      setAllData(rows)
    } catch {
      setAllData([])
    } finally {
      setAllLoading(false)
    }
  }, [allFilters, refReady, isDeptLeader])

  useEffect(() => { loadAllFlows() }, [loadAllFlows])

  const handleAllSearch = () => {
    const values = allForm.getFieldsValue()
    setAllFilters({
      flowNo: values.flowNo,
      flowName: values.flowName,
      flowTag: values.flowTag,
      applicant: values.applicant,
      currentApprover: values.currentApprover,
      dateRange: values.dateRange,
      flowStatus: values.flowStatus,
    })
  }
  const handleAllReset = () => {
    allForm.resetFields()
    setAllFilters({})
  }

  /* ==================== 導航 ==================== */
  const handleDetail = (record: FlowRow) => {
    navigate(`/approval-detail?flowNo=${encodeURIComponent(record.flowNo)}&type=${record.approvalType}`)
  }
  const handleApprove = (record: FlowRow) => {
    navigate(`/approval-detail?flowNo=${encodeURIComponent(record.flowNo)}&type=${record.approvalType}`)
  }
  const handleCancel = async (record: FlowRow) => {
    try {
      await cancelOaRequest(record.flowNo)
      message.success(t('common.cancelSuccess'))
      loadMyRequests()
    } catch {
      // error handled by request interceptor
    }
  }

  /* ==================== 渲染工具 ==================== */
  const renderFlowStatus = (status: string) => (
    <Tag color={FLOW_STATUS_COLOR[status] || 'default'}>
      {FLOW_STATUS_I18N[status] ? t(FLOW_STATUS_I18N[status]) : status}
    </Tag>
  )

  const renderFlowTag = (type: string) => {
    const color = FLOW_TAG_COLOR[type]
    const label = FLOW_TAG_LABEL[type] || (APPROVAL_TYPE_I18N[type] ? t(APPROVAL_TYPE_I18N[type]) : type)
    return <Tag color={color}>{label}</Tag>
  }

  const renderCurrentNode = (nodeName: string) => {
    if (!nodeName) return <span>--</span>
    const i18nKey = NODE_I18N[nodeName]
    return <span>{i18nKey ? t(i18nKey) : nodeName}</span>
  }

  /* ==================== 搜索選項 ==================== */
  const flowTagOptions = useMemo(() => [
    { label: t('approvalCenter.typeRecharge'), value: 'recharge' },
    { label: t('approvalCenter.typeTransfer'), value: 'transfer' },
    { label: t('approvalCenter.typeDeduct'), value: 'deduct' },
    { label: t('approvalCenter.typeMerge'), value: 'merge' },
    { label: t('approvalCenter.typeGift'), value: 'gift' },
    { label: t('oaRequests.aiAccessType'), value: 'ai_access' },
    { label: t('oaRequests.typePurchase'), value: 'oa_purchase' },
  ], [t])

  const flowStatusOptions = useMemo(() => [
    { label: t('common.all'), value: 'all' },
    { label: t('approvalCenter.flowDraft'), value: 'draft' },
    { label: t('approvalCenter.flowPending'), value: 'pending' },
    { label: t('approvalCenter.flowApproved'), value: 'approved' },
    { label: t('approvalCenter.flowRejected'), value: 'rejected' },
    { label: t('approvalCenter.flowCancelled'), value: 'cancelled' },
  ], [t])

  /* ==================== 列配置元數據 ==================== */
  const columnMeta = useMemo(() => [
    { key: 'flowNo', title: t('common.colFlowNo') },
    { key: 'flowName', title: t('oaRequests.colFlowName') },
    { key: 'approvalType', title: t('oaRequests.colRequestType') },
    { key: 'applicant', title: t('oaRequests.colApplicant') },
    { key: 'applyTime', title: t('oaRequests.colApplyTime') },
    { key: 'flowStatus', title: t('common.colStatus') },
    { key: 'currentNodeName', title: t('oaRequests.colCurrentNode') },
    { key: 'currentApprover', title: t('oaRequests.colCurrentApprover') },
    { key: 'pendingApprover', title: t('oaRequests.colCurrentApprover') },
    { key: 'reviewer', title: t('oaRequests.colReviewer') },
    { key: 'approvalTime', title: t('oaRequests.colApprovalTime') },
    { key: 'action', title: t('common.colAction') },
  ], [t])

  const { configComponent, applyConfig } = useColumnConfig('oa-requests', columnMeta, [
    { key: 'flowNo', visible: true, locked: 'head' as const },
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  /* ==================== 列定義（每個 Tab 獨立） ==================== */
  const flowNoColumn: TableColumnsType<FlowRow>[0] = {
    title: t('common.colFlowNo'),
    dataIndex: 'flowNo',
    key: 'flowNo',
    width: 170,
    render: (v: string) => <span style={{ whiteSpace: 'nowrap' }}>{v}</span>,
  }
  const flowNameColumn: TableColumnsType<FlowRow>[0] = {
    title: t('oaRequests.colFlowName'),
    key: 'flowName',
    width: 280,
    ellipsis: true,
    render: (_: unknown, r: FlowRow) => {
      const prefix = FLOW_NAME_PREFIX[r.processCode] || FLOW_NAME_PREFIX[r.approvalType] || r.processCode
      const date = r.applyTime ? r.applyTime.slice(0, 10) : ''
      const name = stripEmpId(r.applicant)
      return `${prefix} ${name} ${date}`
    },
  }
  const flowTagColumn: TableColumnsType<FlowRow>[0] = {
    title: t('oaRequests.colRequestType'),
    dataIndex: 'approvalType',
    key: 'approvalType',
    width: 120,
    render: (v: string) => renderFlowTag(v),
  }
  const applicantColumn: TableColumnsType<FlowRow>[0] = {
    title: t('oaRequests.colApplicant'),
    dataIndex: 'applicant',
    key: 'applicant',
    width: 160,
    render: (_: string, r: FlowRow) => {
      const display = getApplicantWithEmpId(stripEmpId(r.applicant), r.applicantId)
      return <span style={{ whiteSpace: 'nowrap' }}>{display || '--'}</span>
    },
  }
  const applyTimeColumn: TableColumnsType<FlowRow>[0] = {
    title: t('oaRequests.colApplyTime'),
    dataIndex: 'applyTime',
    key: 'applyTime',
    width: 170,
    render: (v: string) => v ? <span style={{ whiteSpace: 'nowrap' }}>{v}</span> : '--',
  }
  const statusColumn: TableColumnsType<FlowRow>[0] = {
    title: t('common.colStatus'),
    dataIndex: 'flowStatus',
    key: 'flowStatus',
    width: 100,
    render: (v: string) => renderFlowStatus(v),
  }
  const currentNodeColumn: TableColumnsType<FlowRow>[0] = {
    title: t('oaRequests.colCurrentNode'),
    dataIndex: 'currentNodeName',
    key: 'currentNodeName',
    width: 140,
    render: (v: string) => renderCurrentNode(v),
  }
  const currentApproverColumn: TableColumnsType<FlowRow>[0] = {
    title: t('oaRequests.colCurrentApprover'),
    dataIndex: 'currentApprover',
    key: 'currentApprover',
    width: 140,
    render: (v: string) => {
      const display = v ? getApproverWithEmpIdByName(v) : '--'
      return <span style={{ whiteSpace: 'nowrap' }}>{display}</span>
    },
  }
  const reviewerColumn: TableColumnsType<FlowRow>[0] = {
    title: t('oaRequests.colReviewer'),
    dataIndex: 'currentApprover',
    key: 'reviewer',
    width: 140,
    render: (_: string) => {
      const display = user?.empId ? `${user.name}(${user.empId})` : (user?.name || '--')
      return <span style={{ whiteSpace: 'nowrap' }}>{display}</span>
    },
  }
  const approvalTimeColumn: TableColumnsType<FlowRow>[0] = {
    title: t('oaRequests.colApprovalTime'),
    dataIndex: 'myApprovalTime',
    key: 'approvalTime',
    width: 170,
    render: (v: string) => v
      ? <span style={{ whiteSpace: 'nowrap' }}>{v}</span>
      : <span style={{ color: '#999' }}>--</span>,
  }

  /** Tab 1：我發起的 — 詳情 / 撤銷(draft/pending) */
  const myActionColumn: TableColumnsType<FlowRow>[0] = {
    title: t('common.colAction'),
    key: 'action',
    width: 130,
    fixed: 'right' as const,
    render: (_: unknown, record: FlowRow) => {
      if (record.flowStatus === 'draft' || record.flowStatus === 'pending') {
        return (
          <Space size={0} split={<span className="action-split">|</span>}>
            <Button type="link" size="small" onClick={() => handleDetail(record)}>
              {t('common.detail')}
            </Button>
            <Button type="link" size="small" danger onClick={() => handleCancel(record)}>
              {t('common.cancel')}
            </Button>
          </Space>
        )
      }
      return (
        <Button type="link" size="small" onClick={() => handleDetail(record)}>
          {t('common.detail')}
        </Button>
      )
    },
  }

  /** Tab 2：待我審批 — 審批 + 詳情 */
  const pendingActionColumn: TableColumnsType<FlowRow>[0] = {
    title: t('common.colAction'),
    key: 'action',
    width: 130,
    fixed: 'right' as const,
    render: (_: unknown, record: FlowRow) => (
      <Space size={0} split={<span className="action-split">|</span>}>
        <Button type="link" size="small" onClick={() => handleApprove(record)}>
          {t('approvalCenter.approve')}
        </Button>
        <Button type="link" size="small" onClick={() => handleDetail(record)}>
          {t('common.detail')}
        </Button>
      </Space>
    ),
  }

  /** Tab 3/4：詳情 */
  const detailActionColumn: TableColumnsType<FlowRow>[0] = {
    title: t('common.colAction'),
    key: 'action',
    width: 80,
    fixed: 'right' as const,
    render: (_: unknown, record: FlowRow) => (
      <Button type="link" size="small" onClick={() => handleDetail(record)}>
        {t('common.detail')}
      </Button>
    ),
  }

  const myColumns = useMemo(
    () => applyConfig([flowNoColumn, flowNameColumn, flowTagColumn, applyTimeColumn, statusColumn, currentNodeColumn, currentApproverColumn, myActionColumn]) as TableColumnsType<FlowRow>,
    [applyConfig, activeTab, myData],
  )

  /** 「待我審批」專屬：當前審批人列，多審批人時高亮當前用戶 */
  const pendingApproverColumn: TableColumnsType<FlowRow>[0] = {
    title: t('oaRequests.colCurrentApprover'),
    dataIndex: 'currentApprover',
    key: 'pendingApprover',
    width: 180,
    render: (v: string) => {
      if (!v || v === '--') return <span>--</span>
      const currentName = user?.name || ''
      // 多人審批時，分割顯示並高亮當前用戶
      const names = v.split(/[,，]/).map(n => n.trim()).filter(Boolean)
      if (names.length > 1 && currentName) {
        return (
          <span style={{ whiteSpace: 'nowrap' }}>
            {names.map((name, i) => {
              const isMe = name === currentName
              const base = getApproverWithEmpIdByName(name)
              return (
                <span key={i}>
                  {i > 0 && ', '}
                  {isMe
                    ? <span style={{ color: '#1677ff', fontWeight: 600 }}>{base}</span>
                    : <span style={{ color: '#999' }}>{base}</span>
                  }
                </span>
              )
            })}
          </span>
        )
      }
      const display = getApproverWithEmpIdByName(v)
      return <span style={{ whiteSpace: 'nowrap' }}>{display}</span>
    },
  }

  const pendingColumns = useMemo(
    () => applyConfig([flowNoColumn, flowNameColumn, flowTagColumn, applyTimeColumn, statusColumn, currentNodeColumn, pendingApproverColumn, pendingActionColumn]) as TableColumnsType<FlowRow>,
    [applyConfig, activeTab, pendingData],
  )

  const approvedColumns = useMemo(
    () => applyConfig([flowNoColumn, flowNameColumn, flowTagColumn, applicantColumn, applyTimeColumn, statusColumn, reviewerColumn, approvalTimeColumn, detailActionColumn]) as TableColumnsType<FlowRow>,
    [applyConfig, activeTab, approvedData],
  )

  const allColumns = useMemo(
    () => applyConfig([flowNoColumn, flowNameColumn, flowTagColumn, applicantColumn, applyTimeColumn, statusColumn, currentNodeColumn, currentApproverColumn, detailActionColumn]) as TableColumnsType<FlowRow>,
    [applyConfig, activeTab, allData],
  )

  /* ==================== 搜索表單 ==================== */
  const renderSearchForm = (
    form: ReturnType<typeof Form.useForm>[0],
    fields: { applicant?: boolean; currentApprover?: boolean },
    onSearch: () => void,
    onReset: () => void,
  ) => (
    <Form form={form} layout="inline">
      <Form.Item label={t('common.colFlowNo')} name="flowNo">
        <Input placeholder={t('common.flowNoPlaceholder')} allowClear />
      </Form.Item>
      <Form.Item label={t('oaRequests.colFlowName')} name="flowName">
        <Input placeholder={t('oaRequests.flowNamePlaceholder')} allowClear />
      </Form.Item>
      <Form.Item label={t('oaRequests.colRequestType')} name="flowTag">
        <Select placeholder={t('common.all')} allowClear options={flowTagOptions} />
      </Form.Item>
      {fields.applicant && (
        <Form.Item label={t('oaRequests.colApplicant')} name="applicant">
          <Input placeholder={t('oaRequests.applicantPlaceholder')} allowClear />
        </Form.Item>
      )}
      {fields.currentApprover && (
        <Form.Item label={t('oaRequests.colCurrentApprover')} name="currentApprover">
          <Input placeholder={t('oaRequests.currentApproverPlaceholder')} allowClear />
        </Form.Item>
      )}
      <Form.Item label={t('oaRequests.colApplyTime')} name="dateRange">
        <RangePicker placeholder={[t('common.startTime'), t('common.endTime')]} />
      </Form.Item>
      <Form.Item label={t('common.colStatus')} name="flowStatus" initialValue="all">
        <Select placeholder={t('common.all')} allowClear options={flowStatusOptions} />
      </Form.Item>
      <Form.Item>
        <div className="search-actions">
          <Button type="primary" icon={<SearchOutlined />} onClick={onSearch}>
            {t('common.search')}
          </Button>
          <Button icon={<ReloadOutlined />} onClick={onReset}>
            {t('common.reset')}
          </Button>
        </div>
      </Form.Item>
    </Form>
  )

  /* ==================== Tab 項 ==================== */
  const tabItems = [
    {
      key: 'my',
      label: t('oaRequests.tabMyApplied'),
      children: (
        <>
          <div className="search-section">
            {renderSearchForm(myForm, { applicant: true, currentApprover: true }, handleMySearch, handleMyReset)}
          </div>
          <div className="action-section">
            <div className="action-section-right">
              <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/process-center')}>
                {t('oaRequests.btnFlowApply')}
              </Button>
              {configComponent}
            </div>
          </div>
          <Table<FlowRow>
            columns={myColumns}
            dataSource={myData}
            rowKey="key"
            loading={myLoading}
            size="middle"
            scroll={{ x: 1400 }}
            pagination={{
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (total) => t('common.total', { count: total }),
            }}
          />
        </>
      ),
    },
    {
      key: 'pending',
      label: t('oaRequests.tabPending'),
      children: (
        <>
          <div className="search-section">
            {renderSearchForm(pendingForm, { currentApprover: true }, handlePendingSearch, handlePendingReset)}
          </div>
          <Table<FlowRow>
            columns={pendingColumns}
            dataSource={pendingData}
            rowKey="key"
            loading={pendingLoading}
            size="middle"
            scroll={{ x: 1400 }}
            pagination={{
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (total) => t('common.total', { count: total }),
            }}
          />
        </>
      ),
    },
    {
      key: 'approved',
      label: t('oaRequests.tabMyApproved'),
      children: (
        <>
          <div className="search-section">
            {renderSearchForm(approvedForm, { applicant: true }, handleApprovedSearch, handleApprovedReset)}
          </div>
          <Table<FlowRow>
            columns={approvedColumns}
            dataSource={approvedData}
            rowKey="key"
            loading={approvedLoading}
            size="middle"
            scroll={{ x: 1400 }}
            pagination={{
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (total) => t('common.total', { count: total }),
            }}
          />
        </>
      ),
    },
    ...(isDeptLeader ? [{
      key: 'all',
      label: t('oaRequests.tabAll'),
      children: (
        <>
          <div className="search-section">
            {renderSearchForm(allForm, { applicant: true, currentApprover: true }, handleAllSearch, handleAllReset)}
          </div>
          <Table<FlowRow>
            columns={allColumns}
            dataSource={allData}
            rowKey="key"
            loading={allLoading}
            size="middle"
            scroll={{ x: 1400 }}
            pagination={{
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (total) => t('common.total', { count: total }),
            }}
          />
        </>
      ),
    }] : []),
  ]

  return (
    <div className="content-area">
      <Tabs activeKey={activeTab} onChange={handleTabChange} items={tabItems} />
    </div>
  )
}
