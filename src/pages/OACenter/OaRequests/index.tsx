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
  fetchOaRequests,
  type OaRequestVO,
  type OaFlowStatus,
  type OaApprovalTaskVO,
} from '../../../api/oaRequest'
import { useAuth } from '../../../contexts/AuthContext'

const { RangePicker } = DatePicker

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

/** 狀態選項（使用 i18n） */
function useStatusOptions() {
  const { t } = useTranslation()
  return [
    { label: t('common.all'), value: 'all' },
    { label: t('oaRequests.statusPending'), value: 'pending' },
    { label: t('oaRequests.statusApproved'), value: 'approved' },
    { label: t('oaRequests.statusRejected'), value: 'rejected' },
    { label: t('oaRequests.statusCancelled'), value: 'cancelled' },
  ]
}

/** 流程類型選項（對應 biz_oa_process.process_code） */
function useTypeOptions() {
  const { t } = useTranslation()
  return [
    { label: t('common.all'), value: 'all' },
    { label: t('oaRequests.typeLeave'), value: 'oa_leave' },
    { label: t('oaRequests.typeReimburse'), value: 'oa_reimburse' },
    { label: t('oaRequests.typePurchase'), value: 'oa_purchase' },
    { label: t('oaRequests.typeSeal'), value: 'oa_seal' },
    { label: t('oaRequests.typeGeneral'), value: 'oa_general' },
  ]
}

/** 從審批任務列表中提取當前待審節點的審批人 */
function getCurrentApprover(tasks: OaApprovalTaskVO[] | undefined): string {
  if (!tasks || tasks.length === 0) return '--'
  const pendingTask = tasks.find((t) => t.taskStatus === 'pending')
  if (!pendingTask || !pendingTask.approver) return '--'
  return pendingTask.approver
}

export default function OaRequests() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user } = useAuth()
  const statusOptions = useStatusOptions()
  const typeOptions = useTypeOptions()

  const initialTab = searchParams.get('tab') === 'pending' ? 'pending' : 'my'
  const [activeTab, setActiveTab] = useState(initialTab)

  /* ====== Tab 1：我的申請 ====== */
  const [myForm] = Form.useForm()
  const [myData, setMyData] = useState<OaRequestVO[]>([])
  const [myTotal, setMyTotal] = useState(0)
  const [myLoading, setMyLoading] = useState(false)
  const [myFilters, setMyFilters] = useState<{
    flowNo?: string; processCode?: string; dateRange?: [Dayjs, Dayjs]; status?: string
  }>({})
  const [myPage, setMyPage] = useState({ page: 1, size: 10 })

  const loadMyRequests = useCallback(async () => {
    setMyLoading(true)
    try {
      const params: Record<string, unknown> = {
        page: myPage.page,
        size: myPage.size,
        applicant: user?.name || '',
      }
      if (myFilters.flowNo) params.flowNo = myFilters.flowNo
      if (myFilters.processCode && myFilters.processCode !== 'all') params.processCode = myFilters.processCode
      if (myFilters.status && myFilters.status !== 'all') params.flowStatus = myFilters.status
      if (myFilters.dateRange) {
        params.applyFrom = myFilters.dateRange[0].format('YYYY-MM-DD')
        params.applyTo = myFilters.dateRange[1].format('YYYY-MM-DD')
      }
      const result = await fetchOaRequests(params as never)
      setMyData(result.records)
      setMyTotal(result.total)
    } catch {
      setMyData([])
      setMyTotal(0)
    } finally {
      setMyLoading(false)
    }
  }, [myPage, myFilters, user])

  useEffect(() => { loadMyRequests() }, [loadMyRequests])

  const handleMySearch = () => {
    const values = myForm.getFieldsValue()
    setMyFilters({
      flowNo: values.flowNo,
      processCode: values.processCode,
      dateRange: values.dateRange,
      status: values.status,
    })
    setMyPage({ page: 1, size: myPage.size })
  }
  const handleMyReset = () => {
    myForm.resetFields()
    setMyFilters({})
    setMyPage({ page: 1, size: 10 })
  }

  /* ====== Tab 2：待我審批 ====== */
  const [pendingForm] = Form.useForm()
  const [pendingData, setPendingData] = useState<OaRequestVO[]>([])
  const [pendingTotal, setPendingTotal] = useState(0)
  const [pendingLoading, setPendingLoading] = useState(false)
  const [pendingFilters, setPendingFilters] = useState<{
    flowNo?: string; processCode?: string; applicant?: string; dateRange?: [Dayjs, Dayjs]; status?: string
  }>({})
  const [pendingPage, setPendingPage] = useState({ page: 1, size: 10 })

  const loadPendingRequests = useCallback(async () => {
    setPendingLoading(true)
    try {
      const params: Record<string, unknown> = {
        page: pendingPage.page,
        size: pendingPage.size,
        flowStatus: 'pending' as OaFlowStatus,
      }
      if (pendingFilters.flowNo) params.flowNo = pendingFilters.flowNo
      if (pendingFilters.processCode && pendingFilters.processCode !== 'all') params.processCode = pendingFilters.processCode
      if (pendingFilters.applicant) params.applicant = pendingFilters.applicant
      if (pendingFilters.dateRange) {
        params.applyFrom = pendingFilters.dateRange[0].format('YYYY-MM-DD')
        params.applyTo = pendingFilters.dateRange[1].format('YYYY-MM-DD')
      }
      const result = await fetchOaRequests(params as never)
      setPendingData(result.records)
      setPendingTotal(result.total)
    } catch {
      setPendingData([])
      setPendingTotal(0)
    } finally {
      setPendingLoading(false)
    }
  }, [pendingPage, pendingFilters])

  useEffect(() => { loadPendingRequests() }, [loadPendingRequests])

  const handlePendingSearch = () => {
    const values = pendingForm.getFieldsValue()
    setPendingFilters({
      flowNo: values.flowNo,
      processCode: values.processCode,
      applicant: values.applicant,
      dateRange: values.dateRange,
      status: values.status,
    })
    setPendingPage({ page: 1, size: pendingPage.size })
  }
  const handlePendingReset = () => {
    pendingForm.resetFields()
    setPendingFilters({})
    setPendingPage({ page: 1, size: 10 })
  }

  /* ====== 導航 ====== */
  const handleDetail = (record: OaRequestVO) => {
    navigate(`/approval-detail?flowNo=${record.flowNo}&type=${record.processCode}`)
  }
  const handleApprove = (record: OaRequestVO) => {
    navigate(`/approval-detail?flowNo=${record.flowNo}&type=${record.processCode}`)
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

  /* ====== 共用列定義 ====== */
  const sharedColumns: TableColumnsType<OaRequestVO> = [
    {
      title: t('common.colFlowNo'), dataIndex: 'flowNo', key: 'flowNo', width: 170,
      render: (v: string) => <span style={{ whiteSpace: 'nowrap' }}>{v}</span>,
    },
    {
      title: t('oaRequests.colFlowName'), dataIndex: 'title', key: 'title', width: 200, ellipsis: true,
    },
    {
      title: t('oaRequests.colRequestType'), dataIndex: 'processName', key: 'processName', width: 140,
      render: (v: string | null) => v || '--',
    },
    {
      title: t('oaRequests.colApplicant'), dataIndex: 'applicant', key: 'applicant', width: 160,
      render: (v: string) => <span style={{ whiteSpace: 'nowrap' }}>{v || '--'}</span>,
    },
    {
      title: t('oaRequests.colApplyTime'), dataIndex: 'applyTime', key: 'applyTime', width: 170,
      render: (v: string | null) => v ? <span style={{ whiteSpace: 'nowrap' }}>{v}</span> : '--',
    },
    {
      title: t('common.colStatus'), dataIndex: 'flowStatus', key: 'flowStatus', width: 100,
      render: (v: string) => renderStatus(v),
    },
    {
      title: t('oaRequests.colCurrentNode'), dataIndex: 'currentNodeName', key: 'currentNodeName', width: 140,
      render: (v: string | null) => v || '--',
    },
    {
      title: t('oaRequests.colCurrentApprover'), key: 'currentApprover', width: 160,
      render: (_: unknown, r: OaRequestVO) => {
        const approver = getCurrentApprover(r.approvalTasks)
        return <span style={{ whiteSpace: 'nowrap' }}>{approver}</span>
      },
    },
  ]

  /* ====== Tab 1 列定義 ====== */
  const myColumns: TableColumnsType<OaRequestVO> = [
    ...sharedColumns,
    {
      title: t('common.colAction'), key: 'action', width: 80, fixed: 'right',
      render: (_: unknown, record: OaRequestVO) => (
        <Button type="link" size="small" onClick={() => handleDetail(record)}>
          {t('common.detail')}
        </Button>
      ),
    },
  ]

  /* ====== Tab 2 列定義 ====== */
  const pendingColumns: TableColumnsType<OaRequestVO> = [
    ...sharedColumns,
    {
      title: t('common.colAction'), key: 'action', width: 130, fixed: 'right',
      render: (_: unknown, record: OaRequestVO) => (
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
    total: myTotal,
    showTotal: (total: number) => t('common.total', { count: total }),
    showSizeChanger: true,
    pageSizeOptions: ['10', '20', '50'],
    showQuickJumper: true,
    onChange: (page: number, size: number) => setMyPage({ page, size: size || 10 }),
  }), [myPage, myTotal, t])

  const pendingPagination = useMemo(() => ({
    current: pendingPage.page,
    pageSize: pendingPage.size,
    total: pendingTotal,
    showTotal: (total: number) => t('common.total', { count: total }),
    showSizeChanger: true,
    pageSizeOptions: ['10', '20', '50'],
    showQuickJumper: true,
    onChange: (page: number, size: number) => setPendingPage({ page, size: size || 10 }),
  }), [pendingPage, pendingTotal, t])

  /* ====== 共用搜索表單 ====== */
  const renderSearchForm = (
    form: ReturnType<typeof Form.useForm>[0],
    showApplicant: boolean,
  ) => (
    <Form form={form} layout="inline">
      <Form.Item label={t('common.colFlowNo')} name="flowNo">
        <Input placeholder={t('common.flowNoPlaceholder')} allowClear />
      </Form.Item>
      <Form.Item label={t('oaRequests.colRequestType')} name="processCode" initialValue="all">
        <Select placeholder={t('common.all')} allowClear options={typeOptions} />
      </Form.Item>
      {showApplicant && (
        <Form.Item label={t('oaRequests.colApplicant')} name="applicant">
          <Input placeholder={t('oaRequests.applicantPlaceholder')} allowClear />
        </Form.Item>
      )}
      <Form.Item label={t('oaRequests.colApplyTime')} name="dateRange">
        <RangePicker placeholder={[t('common.startTime'), t('common.endTime')]} />
      </Form.Item>
      <Form.Item label={t('common.colStatus')} name="status" initialValue="all">
        <Select placeholder={t('common.all')} allowClear options={statusOptions} />
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
              <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/process-center')}>
                {t('oaRequests.btnFlowApply')}
              </Button>
            </div>
          </div>
          <Table<OaRequestVO>
            columns={myColumns}
            dataSource={myData}
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
          <Table<OaRequestVO>
            columns={pendingColumns}
            dataSource={pendingData}
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
