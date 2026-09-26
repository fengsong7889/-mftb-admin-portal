import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Form, Input, Select, Space, Table, Tabs, Tag, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { ExportOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useColumnConfig } from '../../../hooks/useColumnConfig'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import { useAuth } from '../../../contexts/AuthContext'
import {
  CONTRACT_EXPIRY_BUCKET,
  fetchContractExpirySummary,
  fetchContractLedger,
  type ContractExpiryBucket,
  type ContractExpirySummary,
  type ContractLedgerItem,
  type ContractLedgerQuery,
} from '../../../api/employee'
import { fetchHrDictOptions, HR_DICT_TYPE, type HrDictOption } from '../../../api/hrDict'
import { exportToCSV } from '../../../utils/exportCSV'
import LifecycleList from '../HrLifecycle/LifecycleList'

/** 合同类型回退选项（HR 字典 CONTRACT_TYPE 不可用时） */
const CONTRACT_TYPE_KEYS: Record<string, string> = {
  '劳动合同': 'contractLedger.labor', '劳务合同': 'contractLedger.service',
  '实习协议': 'contractLedger.internship', '竞业协议': 'contractLedger.nonCompete',
}
/** 合同状态选项 */
const CONTRACT_STATUS_KEYS: Record<string, string> = {
  '生效中': 'contractLedger.active', '已终止': 'contractLedger.terminated', '已过期': 'contractLedger.expired',
}
/** 到期分桶 Tab（P0 合同到期预警），i18n key 与数量字段 */
const EXPIRY_TABS: Array<{ key: ContractExpiryBucket; labelKey: string; countKey?: keyof ContractExpirySummary }> = [
  { key: CONTRACT_EXPIRY_BUCKET.ALL, labelKey: 'contractLedger.tabAll', countKey: 'total' },
  { key: CONTRACT_EXPIRY_BUCKET.EXPIRED, labelKey: 'contractLedger.tabExpired', countKey: 'expired' },
  { key: CONTRACT_EXPIRY_BUCKET.DUE_30, labelKey: 'contractLedger.tabDue30', countKey: 'due30' },
  { key: CONTRACT_EXPIRY_BUCKET.DUE_60, labelKey: 'contractLedger.tabDue60', countKey: 'due60' },
  { key: CONTRACT_EXPIRY_BUCKET.DUE_90, labelKey: 'contractLedger.tabDue90', countKey: 'due90' },
]

/** 距到期剩余天数（负数=已过期天数；无结束日期返回 null） */
const remainingDays = (endDate?: string | null): number | null => {
  if (!endDate) return null
  return dayjs(endDate).startOf('day').diff(dayjs().startOf('day'), 'day')
}

export default function ContractLedger() {
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const { hasPermission } = useAuth()
  const canEdit = hasPermission('employee-management:edit')
  const canViewEmployee = hasPermission('employee-management:view')
  /** 续签单据授权归合同台账菜单（与后端 TYPE_TO_MENU_KEY 一致） */
  const canRenew = hasPermission('contract-ledger:create')
  /** 台账视图：合同列表 / 续签单据 */
  const [viewTab, setViewTab] = useState<'contracts' | 'renews'>('contracts')

  const [dataSource, setDataSource] = useState<ContractLedgerItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  // 已生效查询条件
  const [keyword, setKeyword] = useState<string>()
  const [company, setCompany] = useState<string>()
  const [contractType, setContractType] = useState<string>()
  const [status, setStatus] = useState<string>()
  /** 到期分桶（P0 预警）：默认全部 */
  const [expiryBucket, setExpiryBucket] = useState<ContractExpiryBucket>(CONTRACT_EXPIRY_BUCKET.ALL)
  const [summary, setSummary] = useState<ContractExpirySummary | null>(null)
  const [searchForm] = Form.useForm<{ keyword?: string; company?: string; contractType?: string; status?: string }>()

  // 签约主体 / 合同类型 下拉（HR 字典，值=名称，与存储一致）
  const [companies, setCompanies] = useState<HrDictOption[]>([])
  const [contractTypes, setContractTypes] = useState<HrDictOption[]>([])
  const isZh = i18n.language.startsWith('zh')
  const companyOptions = companies.map(item => ({ value: item.name, label: isZh ? item.name : (item.nameEn || item.name) }))
  const contractTypeLabel = (value: string) => {
    const item = contractTypes.find(item => item.name === value)
    if (!isZh && item?.nameEn) return item.nameEn
    return CONTRACT_TYPE_KEYS[value] ? t(CONTRACT_TYPE_KEYS[value]) : value
  }
  const contractTypeOptions = (contractTypes.length ? contractTypes.map(item => item.name) : Object.keys(CONTRACT_TYPE_KEYS))
    .map(value => ({ value, label: contractTypeLabel(value) }))
  const statusOptions = Object.entries(CONTRACT_STATUS_KEYS).map(([value, key]) => ({ value, label: t(key) }))
  useEffect(() => {
    fetchHrDictOptions(HR_DICT_TYPE.EMPLOYER_COMPANY)
      .then(setCompanies)
      .catch(() => setCompanies([]))
    fetchHrDictOptions(HR_DICT_TYPE.CONTRACT_TYPE)
      .then(setContractTypes)
      .catch(() => setContractTypes([]))
  }, [])

  const baseQuery = useMemo<Omit<ContractLedgerQuery, 'page' | 'size'>>(
    () => ({
      keyword, company, contractType, status,
      // 「全部」不传分桶参数，避免后端多做一次日期条件
      expiryBucket: expiryBucket === CONTRACT_EXPIRY_BUCKET.ALL ? undefined : expiryBucket,
    }),
    [keyword, company, contractType, status, expiryBucket],
  )

  const fetchList = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchContractLedger({ page, size, ...baseQuery })
      setDataSource(res.records)
      setTotal(res.total)
    } catch {
      // 错误提示由请求层统一处理
    } finally {
      setLoading(false)
    }
  }, [page, size, baseQuery])

  useEffect(() => {
    fetchList()
  }, [fetchList])

  /** 到期预警汇总：进页时拉一次；失败静默（台账浏览不受阻断） */
  const loadSummary = useCallback(async () => {
    try {
      setSummary(await fetchContractExpirySummary(90))
    } catch {
      setSummary(null)
    }
  }, [])

  useEffect(() => {
    loadSummary()
  }, [loadSummary])

  const handleSearch = () => {
    const v = searchForm.getFieldsValue()
    setKeyword(v.keyword?.trim() || undefined)
    setCompany(v.company || undefined)
    setContractType(v.contractType || undefined)
    setStatus(v.status || undefined)
    setPage(1)
  }

  const handleReset = () => {
    searchForm.resetFields()
    setKeyword(undefined)
    setCompany(undefined)
    setContractType(undefined)
    setStatus(undefined)
    setExpiryBucket(CONTRACT_EXPIRY_BUCKET.ALL)
    setPage(1)
  }

  /** 导出全部符合筛选条件的记录（逐页拉取） */
  const handleExport = async () => {
    setLoading(true)
    let all: ContractLedgerItem[] = []
    try {
      let p = 1
      for (;;) {
        const res = await fetchContractLedger({ page: p, size: 200, ...baseQuery })
        all = all.concat(res.records)
        if (res.records.length === 0 || all.length >= res.total || p >= 50) break
        p += 1
      }
    } catch {
      // 请求层已显示错误，避免重复提示。
      return
    } finally {
      setLoading(false)
    }
    if (all.length === 0) {
      message.warning(t('common.noDataToExport'))
      return
    }
    const exportColumns = [
      { title: t('employee.colEmpId'), dataIndex: 'empId' },
      { title: t('employee.colName'), dataIndex: 'employeeName' },
      { title: t('employee.colDepartment'), dataIndex: 'department' },
      { title: t('contractLedger.contractNo'), dataIndex: 'contractNo' },
      { title: t('hrDict.types.CONTRACT_TYPE'), dataIndex: 'contractType' },
      { title: t('contractLedger.company'), dataIndex: 'company' },
      { title: t('common.startDate'), dataIndex: 'startDate' },
      { title: t('common.endDate'), dataIndex: 'endDate' },
      { title: t('contractLedger.signDate'), dataIndex: 'signDate' },
      { title: t('common.colStatus'), dataIndex: 'status' },
      { title: t('common.colUpdater'), dataIndex: 'updatedBy' },
    ]
    exportToCSV(t('contractLedger.title'), exportColumns, all)
  }

  const columns: TableColumnsType<ContractLedgerItem> = [
    {
      title: t('contractLedger.employee'), key: 'employee', width: 160, fixed: 'left',
      render: (_, r) => (
        <Space size={4}>
          <span>{r.employeeName || '-'}</span>
          <span style={{ color: '#8C8C8C' }}>({r.empId || '-'})</span>
        </Space>
      ),
    },
    { title: t('employee.colDepartment'), dataIndex: 'department', key: 'department', width: 140, render: (v: string) => v || '-' },
    { title: t('contractLedger.contractNo'), dataIndex: 'contractNo', key: 'contractNo', width: 160 },
    { title: t('hrDict.types.CONTRACT_TYPE'), dataIndex: 'contractType', key: 'contractType', width: 120, render: (v: string) => contractTypeLabel(v) || '-' },
    { title: t('contractLedger.company'), dataIndex: 'company', key: 'company', width: 200, render: (v: string) => v || '-' },
    { title: t('common.startDate'), dataIndex: 'startDate', key: 'startDate', width: 120, render: (v: string) => v || '-' },
    { title: t('common.endDate'), dataIndex: 'endDate', key: 'endDate', width: 120, render: (v: string) => v || '-' },
    {
      // 到期剩余天数（P0 预警）：已过期红色、30/60 天内橙黄、其余常规；无结束日期显示 -
      title: t('contractLedger.remainingDays'), key: 'remainingDays', width: 120,
      render: (_, r) => {
        const days = remainingDays(r.endDate)
        if (days === null) return '-'
        if (days < 0) return <Tag color="error">{t('contractLedger.expiredDays', { days: -days })}</Tag>
        if (days === 0) return <Tag color="error">{t('contractLedger.dueToday')}</Tag>
        if (days <= 30) return <Tag color="warning">{t('contractLedger.daysLeft', { days })}</Tag>
        if (days <= 60) return <Tag color="orange">{t('contractLedger.daysLeft', { days })}</Tag>
        return <span style={{ color: '#8C8C8C' }}>{t('contractLedger.daysLeft', { days })}</span>
      },
    },
    { title: t('contractLedger.signDate'), dataIndex: 'signDate', key: 'signDate', width: 120, render: (v: string) => v || '-' },
    {
      title: t('common.colStatus'), dataIndex: 'status', key: 'status', width: 100,
      render: (v: string) => <Tag color={v === '生效中' ? 'green' : 'default'}>{CONTRACT_STATUS_KEYS[v] ? t(CONTRACT_STATUS_KEYS[v]) : (v || '-')}</Tag>,
    },
    { title: t('common.colUpdater'), dataIndex: 'updatedBy', key: 'updatedBy', width: 130, render: (v: string) => v || '-' },
    {
      title: t('common.colUpdateTime'), dataIndex: 'updatedAt', key: 'updatedAt', width: 180,
      render: (v: string) => (v ? <span style={{ whiteSpace: 'nowrap' }}>{dayjs(v).format('YYYY-MM-DD HH:mm:ss')}</span> : '-'),
    },
    {
      title: t('common.colAction'), key: 'action', width: 170, fixed: 'right',
      render: (_, r) => (
        <Space size={0}>
          {canViewEmployee && (
            <Button type="link" size="small" onClick={() => navigate(`/employee-detail?id=${r.userId}`)}>
              {t('common.detail')}
            </Button>
          )}
          {/* 发起续签：仅生效中合同可发起，走 OA 审批，通过后自动写新合同并终止原合同 */}
          {canRenew && r.status === '生效中' && (
            <>
              <span className="action-split">|</span>
              <Button type="link" size="small"
                onClick={() => navigate(`/hr-contract-renew-form?contractId=${r.id}&contractNo=${encodeURIComponent(r.contractNo)}`)}>
                {t('contractLedger.renew')}
              </Button>
            </>
          )}
        </Space>
      ),
    },
  ]

  const { configComponent, applyConfig } = useColumnConfig('contract-ledger', columns.map(col => ({ key: String(col.key), title: String(col.title) })), [
    { key: 'action', visible: true, locked: 'tail' },
  ])

  /** 视图切换：合同台账 / 续签单据（续签复用入转调离引擎，授权归 contract-ledger） */
  const viewToggle = (
    <Tabs
      activeKey={viewTab}
      items={[
        { key: 'contracts', label: t('contractLedger.viewContracts') },
        { key: 'renews', label: t('contractLedger.viewRenews') },
      ]}
      onChange={key => setViewTab(key as 'contracts' | 'renews')}
      style={{ marginBottom: 12 }}
    />
  )

  if (viewTab === 'renews') {
    return (
      <div className="content-area">
        {viewToggle}
        <LifecycleList type="renew" />
      </div>
    )
  }

  return (
    <div className="content-area">
      {viewToggle}
      {/* 搜索区 */}
      <div className="search-section">
        <Form form={searchForm} layout="inline">
          <Form.Item label={t('hrDict.keyword')} name="keyword">
            <Input placeholder={t('contractLedger.keywordPlaceholder')} allowClear onPressEnter={handleSearch} />
          </Form.Item>
          <Form.Item label={t('contractLedger.company')} name="company">
            <Select placeholder={t('common.all')} allowClear options={companyOptions} showSearch optionFilterProp="label" />
          </Form.Item>
          <Form.Item label={t('hrDict.types.CONTRACT_TYPE')} name="contractType">
            <Select placeholder={t('common.all')} allowClear options={contractTypeOptions} />
          </Form.Item>
          <Form.Item label={t('common.colStatus')} name="status">
            <Select placeholder={t('common.all')} allowClear options={statusOptions} />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>{t('common.search')}</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>{t('common.reset')}</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 操作区 */}
      <div className="action-section">
        <div className="action-section-left">
          {hasPermission('contract-ledger:export') && <Button className="btn-export" icon={<ExportOutlined />} onClick={handleExport}>{t('common.export')}</Button>}
          {canEdit && (
            <Button onClick={() => navigate('/employee-management')}>
              {t('contractLedger.maintain')}
            </Button>
          )}
        </div>
        <div className="action-section-right">{configComponent}</div>
      </div>

      {/* 到期预警（P0）：已过期优先提示，其次 30 天内到期 */}
      {summary && (summary.expired > 0 || summary.due30 > 0) && (
        <Alert
          type={summary.expired > 0 ? 'error' : 'warning'}
          showIcon
          style={{ marginBottom: 12 }}
          message={summary.expired > 0
            ? t('contractLedger.alertExpired', { count: summary.expired })
            : t('contractLedger.alertDue30', { count: summary.due30 })}
          description={summary.noEndDate > 0 ? t('contractLedger.alertNoEndDate', { count: summary.noEndDate }) : undefined}
          action={(
            <Button
              size="small"
              type={summary.expired > 0 ? 'primary' : 'default'}
              danger={summary.expired > 0}
              onClick={() => {
                setExpiryBucket(summary.expired > 0 ? CONTRACT_EXPIRY_BUCKET.EXPIRED : CONTRACT_EXPIRY_BUCKET.DUE_30)
                setPage(1)
              }}
            >
              {summary.expired > 0 ? t('contractLedger.viewExpired') : t('contractLedger.viewDue30')}
            </Button>
          )}
        />
      )}

      {/* 到期分桶 Tab */}
      <Tabs
        activeKey={expiryBucket}
        items={EXPIRY_TABS.map(tab => ({
          key: tab.key,
          label: tab.countKey && summary
            ? `${t(tab.labelKey)} (${summary[tab.countKey] ?? 0})`
            : t(tab.labelKey),
        }))}
        onChange={key => { setExpiryBucket(key as ContractExpiryBucket); setPage(1) }}
        style={{ marginBottom: 0 }}
      />

      <Table<ContractLedgerItem>
        className="nowrap-table"
        columns={applyConfig(columns)}
        dataSource={dataSource}
        rowKey="id"
        loading={loading}
        scroll={{ x: 'max-content' }}
        pagination={{
          current: page,
          pageSize: size,
          total,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (count) => t('common.total', { count }),
          onChange: (p, s) => {
            setPage(s !== size ? 1 : p)
            setSize(s)
          },
        }}
      />
    </div>
  )
}
