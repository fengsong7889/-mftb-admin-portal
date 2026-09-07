import { useState, useMemo, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Space, Input, Select, Table, Tag, Form, DatePicker, Tabs } from 'antd'
import type { TableColumnsType } from 'antd'
import type { Dayjs } from 'dayjs'
import { useTranslation } from 'react-i18next'
import {
  SearchOutlined,
  ReloadOutlined,
  PlusOutlined,
} from '@ant-design/icons'
import {
  fetchMyAiAccessRequests,
  fetchAiAccessRequests,
  type AiAccessRequestVO,
  type AiRequestStatus,
} from '../../../api/aiAccessRequest'
import { WORKFLOW_STORAGE_KEY } from '../../WorkflowConfig/types'
import type { WorkflowDefinition } from '../../WorkflowConfig/types'

const { RangePicker } = DatePicker

/** 申請類型 i18n key */
const REQUEST_TYPE_I18N: Record<string, string> = {
  model_only: 'oaRequests.typeModelOnly',
  model_and_quota: 'oaRequests.typeModelQuota',
  quota_only: 'oaRequests.typeQuotaOnly',
}

/** 狀態標籤顏色 */
const STATUS_COLOR: Record<string, string> = {
  pending: 'processing',
  approved: 'success',
  rejected: 'error',
  cancelled: 'default',
}

/** 狀態 i18n key */
const STATUS_I18N: Record<string, string> = {
  pending: 'oaRequests.statusPending',
  approved: 'oaRequests.statusApproved',
  rejected: 'oaRequests.statusRejected',
  cancelled: 'oaRequests.statusCancelled',
}

/** 狀態選項 */
const STATUS_OPTIONS = [
  { label: '全部', value: 'all' },
  { label: '待審批', value: 'pending' },
  { label: '已審批', value: 'approved' },
  { label: '已駁回', value: 'rejected' },
  { label: '已撤銷', value: 'cancelled' },
]

/** 流程類型選項 */
const TYPE_OPTIONS = [
  { label: '全部', value: 'all' },
  { label: '模型權限申請', value: 'model_only' },
  { label: '模型+額度申請', value: 'model_and_quota' },
  { label: '額度申請', value: 'quota_only' },
]

/** 生成流程編號：AI + YYYYMMDD + 4位自增序號 */
function formatFlowNo(id: number, createdAt?: string | null) {
  const datePart = createdAt
    ? createdAt.slice(0, 10).replace(/-/g, '')
    : new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const seq = String(id % 10000).padStart(4, '0')
  return `AI${datePart}${seq}`
}

/** 生成工號（前端 mock，待後端提供） */
function formatEmpId(id: number) {
  return `MF${String(id).padStart(5, '0')}`
}

/** 前端分頁 */
function paginate<T>(list: T[], page: number, size: number) {
  const start = (page - 1) * size
  return list.slice(start, start + size)
}

/** 讀取流程配置中 AI 申請的審批節點名稱列表 */
function getAiWorkflowNodeNames(): string[] {
  try {
    const raw = localStorage.getItem(WORKFLOW_STORAGE_KEY)
    if (!raw) return ['業務主管審批', '運營主管審批']
    const workflows: WorkflowDefinition[] = JSON.parse(raw)
    const aiWf = workflows.find((wf) => wf.workflowKey === 'ai_access' || wf.approvalType === 'ai_access')
    if (!aiWf || aiWf.nodes.length === 0) return ['業務主管審批', '運營主管審批']
    return aiWf.nodes.sort((a, b) => a.sortOrder - b.sortOrder).map((n) => n.name)
  } catch {
    return ['業務主管審批', '運營主管審批']
  }
}

/** 根據流程配置推算當前審批節點（待後端接入） */
function getCurrentNode(record: AiAccessRequestVO): string {
  if (record.status === 'approved') return '已完成'
  if (record.status === 'rejected') return '已駁回'
  if (record.status === 'cancelled') return '已撤銷'
  // pending：根據 id 模擬停在第幾個節點
  const nodeNames = getAiWorkflowNodeNames()
  const nodeIndex = record.id % nodeNames.length
  return nodeNames[nodeIndex] || nodeNames[0]
}

/** 擴展記錄：附加模擬審批節點、當前審批人、流程名稱 */
type EnrichedVO = AiAccessRequestVO & {
  currentNode: string
  currentApproverName: string
  flowName: string
}

/** 流程名稱：取自流程配置（AI申請審批） */
const FLOW_NAME = 'AI申請審批'

function enrichRecord(r: AiAccessRequestVO): EnrichedVO {
  return {
    ...r,
    currentNode: getCurrentNode(r),
    currentApproverName: r.status === 'pending'
      ? (r.approverName || (r.id % 2 === 0 ? '張經理' : '李主管'))
      : (r.approverName || '--'),
    flowName: FLOW_NAME,
  }
}

export default function OaRequests() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const initialTab = searchParams.get('tab') === 'pending' ? 'pending' : 'my'
  const [activeTab, setActiveTab] = useState(initialTab)

  /* ====== Tab 1：我的申請 ====== */
  const [myForm] = Form.useForm()
  const [myData, setMyData] = useState<EnrichedVO[]>([])
  const [myLoading, setMyLoading] = useState(false)
  const [myFilters, setMyFilters] = useState<{
    flowNo?: string; requestType?: string; dateRange?: [Dayjs, Dayjs]; status?: string; approver?: string
  }>({})
  const [myPage, setMyPage] = useState({ page: 1, size: 10 })

  const loadMyRequests = useCallback(async () => {
    setMyLoading(true)
    try {
      const params: { status?: AiRequestStatus } = {}
      if (myFilters.status && myFilters.status !== 'all') {
        params.status = myFilters.status as AiRequestStatus
      }
      const data = await fetchMyAiAccessRequests(params)
      let filtered: EnrichedVO[] = data.map(enrichRecord)
      // 流程編號
      if (myFilters.flowNo) {
        filtered = filtered.filter((r) => formatFlowNo(r.id, r.createdAt).includes(myFilters.flowNo!))
      }
      // 流程類型
      if (myFilters.requestType && myFilters.requestType !== 'all') {
        filtered = filtered.filter((r) => r.requestType === myFilters.requestType)
      }
      // 申請時間
      if (myFilters.dateRange) {
        const from = myFilters.dateRange[0].format('YYYY-MM-DD')
        const to = myFilters.dateRange[1].format('YYYY-MM-DD')
        filtered = filtered.filter((r) => {
          const d = (r.createdAt || '').slice(0, 10)
          return d >= from && d <= to
        })
      }
      // 審批人
      if (myFilters.approver) {
        filtered = filtered.filter((r) =>
          r.currentApproverName?.includes(myFilters.approver!)
        )
      }
      filtered.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      setMyData(filtered)
    } catch {
      setMyData([])
    } finally {
      setMyLoading(false)
    }
  }, [myFilters])

  useEffect(() => { loadMyRequests() }, [loadMyRequests])

  const handleMySearch = () => {
    const values = myForm.getFieldsValue()
    setMyFilters({
      flowNo: values.flowNo,
      requestType: values.requestType,
      dateRange: values.dateRange,
      status: values.status,
      approver: values.approver,
    })
    setMyPage({ page: 1, size: 10 })
  }
  const handleMyReset = () => {
    myForm.resetFields()
    setMyFilters({})
    setMyPage({ page: 1, size: 10 })
  }

  /* ====== Tab 2：待我審批 ====== */
  const [pendingForm] = Form.useForm()
  const [pendingData, setPendingData] = useState<EnrichedVO[]>([])
  const [pendingLoading, setPendingLoading] = useState(false)
  const [pendingFilters, setPendingFilters] = useState<{
    flowNo?: string; requestType?: string; applicantName?: string; dateRange?: [Dayjs, Dayjs]; status?: string; approver?: string
  }>({})
  const [pendingPage, setPendingPage] = useState({ page: 1, size: 10 })

  const loadPendingRequests = useCallback(async () => {
    setPendingLoading(true)
    try {
      const data = await fetchAiAccessRequests({ status: 'pending' })
      let filtered: EnrichedVO[] = data.map(enrichRecord)
      // 流程編號
      if (pendingFilters.flowNo) {
        filtered = filtered.filter((r) => formatFlowNo(r.id, r.createdAt).includes(pendingFilters.flowNo!))
      }
      // 流程類型
      if (pendingFilters.requestType && pendingFilters.requestType !== 'all') {
        filtered = filtered.filter((r) => r.requestType === pendingFilters.requestType)
      }
      // 申請人
      if (pendingFilters.applicantName) {
        filtered = filtered.filter((r) =>
          r.applicantName?.includes(pendingFilters.applicantName!)
        )
      }
      // 申請時間
      if (pendingFilters.dateRange) {
        const from = pendingFilters.dateRange[0].format('YYYY-MM-DD')
        const to = pendingFilters.dateRange[1].format('YYYY-MM-DD')
        filtered = filtered.filter((r) => {
          const d = (r.createdAt || '').slice(0, 10)
          return d >= from && d <= to
        })
      }
      // 審批人
      if (pendingFilters.approver) {
        filtered = filtered.filter((r) =>
          r.currentApproverName?.includes(pendingFilters.approver!)
        )
      }
      filtered.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      setPendingData(filtered)
    } catch {
      setPendingData([])
    } finally {
      setPendingLoading(false)
    }
  }, [pendingFilters])

  useEffect(() => { loadPendingRequests() }, [loadPendingRequests])

  const handlePendingSearch = () => {
    const values = pendingForm.getFieldsValue()
    setPendingFilters({
      flowNo: values.flowNo,
      requestType: values.requestType,
      applicantName: values.applicantName,
      dateRange: values.dateRange,
      status: values.status,
      approver: values.approver,
    })
    setPendingPage({ page: 1, size: 10 })
  }
  const handlePendingReset = () => {
    pendingForm.resetFields()
    setPendingFilters({})
    setPendingPage({ page: 1, size: 10 })
  }

  /* ====== 導航 ====== */
  const handleDetail = (record: EnrichedVO) => {
    navigate(`/approval-detail?flowNo=${formatFlowNo(record.id, record.createdAt)}&type=ai_access&requestId=${record.id}`)
  }
  const handleApprove = (record: EnrichedVO) => {
    navigate(`/approval-detail?flowNo=${formatFlowNo(record.id, record.createdAt)}&type=ai_access&requestId=${record.id}`)
  }

  /* ====== Tab 切換 ====== */
  const handleTabChange = (key: string) => {
    setActiveTab(key)
    setSearchParams({ tab: key }, { replace: true })
  }

  /* ====== 渲染工具 ====== */
  const renderStatus = (status: string) => (
    <Tag color={STATUS_COLOR[status] || 'default'}>
      {STATUS_I18N[status] ? t(STATUS_I18N[status]) : status}
    </Tag>
  )
  const renderRequestType = (type: string) => (
    <Tag>{REQUEST_TYPE_I18N[type] ? t(REQUEST_TYPE_I18N[type]) : type}</Tag>
  )

  /* ====== 共用列定義 ====== */
  const sharedColumns: TableColumnsType<EnrichedVO> = [
    {
      title: t('common.colFlowNo'), key: 'flowNo', width: 170,
      render: (_: unknown, r: EnrichedVO) => <span style={{ whiteSpace: 'nowrap' }}>{formatFlowNo(r.id, r.createdAt)}</span>,
    },
    {
      title: t('oaRequests.colFlowName'), dataIndex: 'flowName', key: 'flowName', width: 200, ellipsis: true,
    },
    {
      title: t('oaRequests.colRequestType'), dataIndex: 'requestType', key: 'requestType', width: 150,
      render: renderRequestType,
    },
    {
      title: t('oaRequests.colApplicant'), key: 'applicant', width: 160,
      render: (_: unknown, r: EnrichedVO) => (
        <span style={{ whiteSpace: 'nowrap' }}>
          {r.applicantName}({formatEmpId(r.applicantId)})
        </span>
      ),
    },
    {
      title: t('oaRequests.colApplyTime'), dataIndex: 'createdAt', key: 'createdAt', width: 170,
      render: (v: string) => v ? <span style={{ whiteSpace: 'nowrap' }}>{v}</span> : '-',
    },
    {
      title: t('common.colStatus'), dataIndex: 'status', key: 'status', width: 100,
      render: renderStatus,
    },
    {
      title: t('oaRequests.colCurrentNode'), dataIndex: 'currentNode', key: 'currentNode', width: 140,
      render: (v: string) => v || '--',
    },
    {
      title: t('oaRequests.colCurrentApprover'), key: 'currentApprover', width: 160,
      render: (_: unknown, r: EnrichedVO) => (
        <span style={{ whiteSpace: 'nowrap' }}>
          {r.currentApproverName && r.currentApproverName !== '--'
            ? `${r.currentApproverName}(${formatEmpId(r.approverId || r.id)})`
            : '--'}
        </span>
      ),
    },
  ]

  /* ====== Tab 1 列定義 ====== */
  const myColumns: TableColumnsType<EnrichedVO> = [
    ...sharedColumns,
    {
      title: t('common.colAction'), key: 'action', width: 80, fixed: 'right',
      render: (_: unknown, record: EnrichedVO) => (
        <Button type="link" size="small" onClick={() => handleDetail(record)}>
          {t('common.detail')}
        </Button>
      ),
    },
  ]

  /* ====== Tab 2 列定義 ====== */
  const pendingColumns: TableColumnsType<EnrichedVO> = [
    ...sharedColumns,
    {
      title: t('common.colAction'), key: 'action', width: 130, fixed: 'right',
      render: (_: unknown, record: EnrichedVO) => (
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

  /* ====== 分頁配置 ====== */
  const myPagination = useMemo(() => ({
    current: myPage.page,
    pageSize: myPage.size,
    total: myData.length,
    showTotal: (total: number) => t('common.total', { count: total }),
    showSizeChanger: true,
    pageSizeOptions: ['10', '20', '50'],
    showQuickJumper: true,
    onChange: (page: number, size: number) => setMyPage({ page, size: size || 10 }),
  }), [myPage, myData.length, t])

  const pendingPagination = useMemo(() => ({
    current: pendingPage.page,
    pageSize: pendingPage.size,
    total: pendingData.length,
    showTotal: (total: number) => t('common.total', { count: total }),
    showSizeChanger: true,
    pageSizeOptions: ['10', '20', '50'],
    showQuickJumper: true,
    onChange: (page: number, size: number) => setPendingPage({ page, size: size || 10 }),
  }), [pendingPage, pendingData.length, t])

  /* ====== 共用搜索表單 ====== */
  const renderSearchForm = (
    form: ReturnType<typeof Form.useForm>[0],
    showApplicant: boolean,
  ) => (
    <Form form={form} layout="inline">
      <Form.Item label={t('common.colFlowNo')} name="flowNo">
        <Input placeholder={t('common.flowNoPlaceholder')} allowClear />
      </Form.Item>
      <Form.Item label={t('oaRequests.colRequestType')} name="requestType" initialValue="all">
        <Select placeholder={t('common.all')} allowClear options={TYPE_OPTIONS} />
      </Form.Item>
      {showApplicant && (
        <Form.Item label={t('oaRequests.colApplicant')} name="applicantName">
          <Input placeholder={t('oaRequests.applicantPlaceholder')} allowClear />
        </Form.Item>
      )}
      <Form.Item label={t('oaRequests.colApplyTime')} name="dateRange">
        <RangePicker placeholder={[t('common.startTime'), t('common.endTime')]} />
      </Form.Item>
      <Form.Item label={t('common.colStatus')} name="status" initialValue="all">
        <Select placeholder={t('common.all')} allowClear options={STATUS_OPTIONS} />
      </Form.Item>
      <Form.Item label={t('oaRequests.colApprover')} name="approver">
        <Input placeholder={t('oaRequests.approverPlaceholder')} allowClear />
      </Form.Item>
      <Form.Item>
        <div className="search-actions">
          <Button type="primary" icon={<SearchOutlined />} onClick={showApplicant ? handlePendingSearch : handleMySearch}>{t('common.search')}</Button>
          <Button icon={<ReloadOutlined />} onClick={showApplicant ? handlePendingReset : handleMyReset}>{t('common.reset')}</Button>
        </div>
      </Form.Item>
    </Form>
  )

  /* ====== Tab 項 ====== */
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
              <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/ai-access-apply')}>
                {t('oaRequests.btnFlowApply')}
              </Button>
            </div>
          </div>
          <Table<EnrichedVO>
            columns={myColumns}
            dataSource={paginate(myData, myPage.page, myPage.size)}
            rowKey="id"
            loading={myLoading}
            pagination={myPagination}
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
          <Table<EnrichedVO>
            columns={pendingColumns}
            dataSource={paginate(pendingData, pendingPage.page, pendingPage.size)}
            rowKey="id"
            loading={pendingLoading}
            pagination={pendingPagination}
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
