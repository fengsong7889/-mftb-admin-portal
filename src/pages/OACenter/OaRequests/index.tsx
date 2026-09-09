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
} from '@ant-design/icons'
import { useAuth } from '../../../contexts/AuthContext'
import { fetchOaRequests, type OaRequestVO, type OaFlowStatus } from '../../../api/oaRequest'
import { fetchEmployees, type EmployeeItem } from '../../../api/employee'
import { fetchDepartments, type DepartmentItem } from '../../../api/department'
import { fetchRoles, type RoleItem } from '../../../api/role'

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

/** 流程狀態 → Tag 顏色 */
const FLOW_STATUS_COLOR: Record<string, string> = {
  pending: 'processing',
  approved: 'success',
  rejected: 'error',
  cancelled: 'default',
}

/** 流程狀態 → i18n key */
const FLOW_STATUS_I18N: Record<string, string> = {
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
      fetchEmployees({ page: 1, size: 200, status: 1 }).catch(() => ({ records: [], total: 0 })),
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

  const handleTabChange = (key: string) => {
    setActiveTab(key)
  }

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

  /* ---- Tab 1：我的申請 ---- */
  const [myForm] = Form.useForm()
  const [myData, setMyData] = useState<FlowRow[]>([])
  const [myLoading, setMyLoading] = useState(false)
  const [myFilters, setMyFilters] = useState<Filters>({})

  const loadMyRequests = useCallback(async () => {
    if (!refReady) return
    setMyLoading(true)
    try {
      // 調用統一 OA 流程 API
      const params: Record<string, unknown> = {
        page: 1,
        size: 500,
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

      // 只保留當前用戶的申請
      const userName = user?.name || ''
      rows = rows.filter(r => r.applicant.includes(userName))

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

      // 按申請時間倒序
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
      // 調用統一 OA 流程 API，只查詢 pending 狀態
      const params: Record<string, unknown> = {
        page: 1,
        size: 500,
        flowStatus: 'pending',
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

      // 只顯示當前登錄用戶為審批人的記錄
      const userName = user?.name || ''
      if (userName) {
        rows = rows.filter(r => {
          if (!r.currentApprover) return false
          const approvers = r.currentApprover.split(',').map(a => a.trim())
          return approvers.some(a => a === userName)
        })
      }

      // 前端過濾
      if (pendingFilters.flowTag) {
        rows = rows.filter(r => r.approvalType === pendingFilters.flowTag)
      }
      if (pendingFilters.flowName) {
        const q = pendingFilters.flowName.trim().toLowerCase()
        rows = rows.filter(r => {
          const name = `${r.processCode} ${r.applicant} ${r.applyTime}`.toLowerCase()
          return name.includes(q)
        })
      }

      // 按申請時間倒序
      rows.sort((a, b) => (b.applyTime || '').localeCompare(a.applyTime || ''))
      setPendingData(rows)
    } catch {
      setPendingData([])
    } finally {
      setPendingLoading(false)
    }
  }, [pendingFilters, refReady])

  useEffect(() => { loadPendingRequests() }, [loadPendingRequests])

  const handlePendingSearch = () => {
    const values = pendingForm.getFieldsValue()
    setPendingFilters({
      flowNo: values.flowNo,
      flowName: values.flowName,
      flowTag: values.flowTag,
      applicant: values.applicant,
      dateRange: values.dateRange,
      flowStatus: values.flowStatus,
    })
  }
  const handlePendingReset = () => {
    pendingForm.resetFields()
    setPendingFilters({})
  }

  /* ==================== 導航 ==================== */
  const handleDetail = (record: FlowRow) => {
    navigate(`/approval-detail?flowNo=${encodeURIComponent(record.flowNo)}&type=${record.approvalType}`)
  }
  const handleApprove = (record: FlowRow) => {
    navigate(`/approval-detail?flowNo=${encodeURIComponent(record.flowNo)}&type=${record.approvalType}`)
  }

  /* ==================== 渲染工具 ==================== */
  const renderFlowStatus = (status: string) => (
    <Tag color={FLOW_STATUS_COLOR[status] || 'default'}>
      {FLOW_STATUS_I18N[status] ? t(FLOW_STATUS_I18N[status]) : status}
    </Tag>
  )

  const renderFlowTag = (type: string) => {
    const color = FLOW_TAG_COLOR[type]
    const label = APPROVAL_TYPE_I18N[type] ? t(APPROVAL_TYPE_I18N[type]) : type
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
  ], [t])

  const flowStatusOptions = useMemo(() => [
    { label: t('common.all'), value: 'all' },
    { label: t('approvalCenter.flowPending'), value: 'pending' },
    { label: t('approvalCenter.flowApproved'), value: 'approved' },
    { label: t('approvalCenter.flowRejected'), value: 'rejected' },
    { label: t('approvalCenter.flowCancelled'), value: 'cancelled' },
  ], [t])

  /* ==================== 列定義 ==================== */
  const sharedColumns: TableColumnsType<FlowRow> = [
    {
      title: t('common.colFlowNo'),
      dataIndex: 'flowNo',
      key: 'flowNo',
      width: 170,
      render: (v: string) => <span style={{ whiteSpace: 'nowrap' }}>{v}</span>,
    },
    {
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
    },
    {
      title: t('oaRequests.colRequestType'),
      dataIndex: 'approvalType',
      key: 'approvalType',
      width: 120,
      render: (v: string) => renderFlowTag(v),
    },
    {
      title: t('oaRequests.colApplicant'),
      dataIndex: 'applicant',
      key: 'applicant',
      width: 160,
      render: (_: string, r: FlowRow) => {
        // 優先使用 applicantId，若無則通過姓名查找
        const display = getApplicantWithEmpId(stripEmpId(r.applicant), r.applicantId)
        return <span style={{ whiteSpace: 'nowrap' }}>{display || '--'}</span>
      },
    },
    {
      title: t('oaRequests.colApplyTime'),
      dataIndex: 'applyTime',
      key: 'applyTime',
      width: 170,
      render: (v: string) => v ? <span style={{ whiteSpace: 'nowrap' }}>{v}</span> : '--',
    },
    {
      title: t('common.colStatus'),
      dataIndex: 'flowStatus',
      key: 'flowStatus',
      width: 100,
      render: (v: string) => renderFlowStatus(v),
    },
    {
      title: t('oaRequests.colCurrentNode'),
      dataIndex: 'currentNodeName',
      key: 'currentNodeName',
      width: 140,
      render: (v: string) => renderCurrentNode(v),
    },
    {
      title: t('oaRequests.colCurrentApprover'),
      dataIndex: 'currentApprover',
      key: 'currentApprover',
      width: 140,
      render: (v: string) => {
        // 「待我審批」tab：優先顯示當前登錄用戶的姓名+工號
        if (activeTab === 'pending' && user?.name) {
          const currentUserName = user.name
          const approvers = v ? v.split(',').map(a => a.trim()) : []
          if (approvers.some(a => a === currentUserName)) {
            const display = user.empId ? `${currentUserName}(${user.empId})` : currentUserName
            return <span style={{ whiteSpace: 'nowrap' }}>{display}</span>
          }
        }
        // 「我的申請」tab 或其他情況：按原有規則顯示所有審批人
        const display = v ? getApproverWithEmpIdByName(v) : '--'
        return <span style={{ whiteSpace: 'nowrap' }}>{display}</span>
      },
    },
  ]

  const myColumns: TableColumnsType<FlowRow> = [
    ...sharedColumns,
    {
      title: t('common.colAction'),
      key: 'action',
      width: 80,
      fixed: 'right',
      render: (_: unknown, record: FlowRow) => (
        <Button type="link" size="small" onClick={() => handleDetail(record)}>
          {t('common.detail')}
        </Button>
      ),
    },
  ]

  const pendingColumns: TableColumnsType<FlowRow> = [
    ...sharedColumns,
    {
      title: t('common.colAction'),
      key: 'action',
      width: 130,
      fixed: 'right',
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
    },
  ]

  /* ==================== 搜索表單 ==================== */
  const renderSearchForm = (
    form: ReturnType<typeof Form.useForm>[0],
    isPending: boolean,
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
      <Form.Item label={t('oaRequests.colApplicant')} name="applicant">
        <Input placeholder={t('oaRequests.applicantPlaceholder')} allowClear />
      </Form.Item>
      {!isPending && (
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
          <Button type="primary" icon={<SearchOutlined />} onClick={isPending ? handlePendingSearch : handleMySearch}>
            {t('common.search')}
          </Button>
          <Button icon={<ReloadOutlined />} onClick={isPending ? handlePendingReset : handleMyReset}>
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
      label: t('oaRequests.tabMy'),
      children: (
        <>
          <div className="search-section">
            {renderSearchForm(myForm, false)}
          </div>
          <div className="action-section">
            <div className="action-section-right">
              <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/process-center')}>
                {t('oaRequests.btnFlowApply')}
              </Button>
            </div>
          </div>
          <Table<FlowRow>
            columns={myColumns}
            dataSource={myData}
            rowKey="key"
            loading={myLoading}
            size="middle"
            scroll={{ x: 1400 }}
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
            {renderSearchForm(pendingForm, true)}
          </div>
          <Table<FlowRow>
            columns={pendingColumns}
            dataSource={pendingData}
            rowKey="key"
            loading={pendingLoading}
            size="middle"
            scroll={{ x: 1400 }}
          />
        </>
      ),
    },
  ]

  return (
    <div className="content-area">
      <Tabs activeKey={activeTab} onChange={handleTabChange} items={tabItems} />
    </div>
  )
}
