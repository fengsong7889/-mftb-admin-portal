/**
 * 系统方案库：归档仓库里的 MD 方案，供后续改造追溯。
 *
 * <p>正文与元数据都存在数据库（doc_system_plan），不依赖本地文件是否还在；
 * 「同步」按钮的数据源是 git 提交树，因此**未提交的 md 不会入库**。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, DatePicker, Empty, Form, Input, Modal, Select, Switch, Table, Tag, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { FileTextOutlined, ReloadOutlined, SearchOutlined, SyncOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { Dayjs } from 'dayjs'
import { useAuth } from '@/contexts/AuthContext'
import { useColumnConfig } from '@/hooks/useColumnConfig'
import {
  fetchDocSystemPlanSystems, fetchDocSystemPlanTypes, fetchDocSystemPlans,
  scanDocSystemPlans, updateDocSystemPlanStatus,
  type DocSystemPlan, type DocSystemPlanQuery,
} from '@/api/docCatalog'
import { formatDocKnowledgeTime } from '@/api/docKnowledge'

const { RangePicker } = DatePicker

/** 状态值与数据库 status 一致；不引入新枚举，避免为了一个开关去动结构契约。 */
const STATUS_ACTIVE = 1
const STATUS_DEPRECATED = 0

/** 表单值 → 查询参数。日期只选一端也要能查，故拆成 from/to 两个可空字段。 */
interface FilterForm {
  title?: string
  systemName?: string
  planType?: string
  status?: number
  generatedRange?: [Dayjs, Dayjs] | null
  updatedRange?: [Dayjs, Dayjs] | null
}

function toQuery(values: FilterForm, page: number, size: number): DocSystemPlanQuery {
  return {
    title: values.title,
    systemName: values.systemName,
    planType: values.planType,
    status: values.status,
    generatedFrom: values.generatedRange?.[0]?.format('YYYY-MM-DD'),
    generatedTo: values.generatedRange?.[1]?.format('YYYY-MM-DD'),
    updatedFrom: values.updatedRange?.[0]?.format('YYYY-MM-DD'),
    updatedTo: values.updatedRange?.[1]?.format('YYYY-MM-DD'),
    page,
    size,
  }
}

export default function DocSystemPlans() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { hasPermission } = useAuth()
  const canEdit = hasPermission('doc-system-plans:edit')
  const [form] = Form.useForm<FilterForm>()
  const [rows, setRows] = useState<DocSystemPlan[]>([])
  const [total, setTotal] = useState(0)
  const [systems, setSystems] = useState<string[]>([])
  const [planTypes, setPlanTypes] = useState<string[]>([])
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(20)
  const [loading, setLoading] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  /** 已停用项默认不展示，靠状态筛选查看；这里记录当前口径供提示条措辞使用。 */
  const [showingDeprecated, setShowingDeprecated] = useState(false)

  const load = useCallback(async (targetPage = page, targetSize = size) => {
    setLoading(true)
    setFailed(null)
    try {
      const values = form.getFieldsValue()
      setShowingDeprecated(values.status === STATUS_DEPRECATED)
      const result = await fetchDocSystemPlans(toQuery(values, targetPage, targetSize))
      setRows(result.records)
      setTotal(result.total)
      setPage(result.page)
      setSize(result.size)
    } catch (error) {
      setFailed(error instanceof Error ? error.message : t('docKnowledge.loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [form, page, size, t])

  /** 下拉候选与列表分开取：候选跨全部状态，否则筛「已停用」时系统/类型会缺项。 */
  const loadOptions = useCallback(async () => {
    try {
      const [systemList, typeList] = await Promise.all([fetchDocSystemPlanSystems(), fetchDocSystemPlanTypes()])
      setSystems(systemList ?? [])
      setPlanTypes(typeList ?? [])
    } catch {
      // 候选取不到不阻断列表：下拉退化为空，后端仍会按条件过滤
    }
  }, [])

  useEffect(() => { void load(1); void loadOptions() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = () => { void load(1) }

  const handleReset = () => {
    form.resetFields()
    void load(1)
  }

  const handleScan = async () => {
    setScanning(true)
    try {
      const result = await scanDocSystemPlans()
      Modal.success({
        title: t('docKnowledge.systemPlanScanDone'),
        content: t('docKnowledge.systemPlanScanSummary', {
          found: Number(result.found ?? 0), inserted: Number(result.inserted ?? 0),
          updated: Number(result.updated ?? 0), unchanged: Number(result.unchanged ?? 0),
          skipped: Number(result.skipped ?? 0), conflicted: Number(result.conflicted ?? 0),
        }),
      })
      await Promise.all([load(1), loadOptions()])
    } catch (error) {
      // request.ts 已统一弹错，这里不再重复 message.error
      void error
    } finally {
      setScanning(false)
    }
  }

  /** 停用/启用必须二次确认（规范 §B.8），且不得直接调 API。 */
  const handleToggleStatus = (row: DocSystemPlan) => {
    const nextStatus = row.status === STATUS_ACTIVE ? STATUS_DEPRECATED : STATUS_ACTIVE
    const disabling = nextStatus === STATUS_DEPRECATED
    Modal.confirm({
      title: disabling ? t('docKnowledge.systemPlanDisableTitle') : t('docKnowledge.systemPlanEnableTitle'),
      className: 'custom-confirm-modal',
      icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>{t('docKnowledge.colTitle')}：</span><b>{row.title}</b></div>
          <div className="confirm-info-row"><span>{t('docKnowledge.systemPlanSystem')}：</span><b>{row.systemName}</b></div>
          <div className="confirm-info-row"><span>{t('docKnowledge.systemPlanType')}：</span><b>{row.planType}</b></div>
          <p style={{ margin: '8px 0 0', color: '#595959' }}>
            {disabling ? t('docKnowledge.systemPlanDisableHint') : t('docKnowledge.systemPlanEnableHint')}
          </p>
        </div>
      ),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        await updateDocSystemPlanStatus(row.id, nextStatus)
        message.success(disabling ? t('docKnowledge.systemPlanDisabled') : t('docKnowledge.systemPlanEnabled'))
        await load()
      },
    })
  }

  const columns: ColumnsType<DocSystemPlan> = useMemo(() => [
    {
      key: 'title', title: t('docKnowledge.colTitle'), dataIndex: 'title', ellipsis: true,
      render: (value: string, row) => (
        <a onClick={() => navigate(`/doc-system-plans/detail?id=${row.id}`)}>
          <FileTextOutlined style={{ marginRight: 6, color: '#1890ff' }} />{value}
        </a>
      ),
    },
    { key: 'system', title: t('docKnowledge.systemPlanSystem'), dataIndex: 'systemName', width: 140 },
    { key: 'type', title: t('docKnowledge.systemPlanType'), dataIndex: 'planType', width: 110, render: (value: string) => <Tag color="blue">{value}</Tag> },
    { key: 'generated', title: t('docKnowledge.systemPlanGeneratedAt'), dataIndex: 'generatedAt', width: 170, render: (value: string | number) => formatDocKnowledgeTime(value) },
    { key: 'updated', title: t('docKnowledge.colUpdated'), dataIndex: 'updatedAt', width: 170, render: (value: string | number) => formatDocKnowledgeTime(value) },
    { key: 'source', title: t('docKnowledge.systemPlanSource'), dataIndex: 'sourcePath', ellipsis: true, width: 260 },
    { key: 'size', title: t('docKnowledge.fileSize'), dataIndex: 'fileSize', width: 100, render: (value: number) => `${(value / 1024).toFixed(1)} KB` },
    { key: 'hash', title: t('docKnowledge.systemPlanHash'), dataIndex: 'contentHash', width: 110, render: (value: string) => value.slice(0, 8) },
    {
      key: 'status', title: t('docKnowledge.colStatus'), dataIndex: 'status', width: 120,
      render: (value: number, row) => (
        <Switch
          checked={value === STATUS_ACTIVE}
          checkedChildren={t('docKnowledge.systemPlanStatusActive')}
          unCheckedChildren={t('docKnowledge.systemPlanStatusDeprecated')}
          disabled={!canEdit}
          onChange={() => handleToggleStatus(row)}
        />
      ),
    },
    {
      key: 'action', title: t('docKnowledge.colAction'), width: 100,
      render: (_, row) => (
        <Button type="link" size="small" onClick={() => navigate(`/doc-system-plans/detail?id=${row.id}`)}>
          {t('common.detail')}
        </Button>
      ),
    },
  ], [t, navigate, canEdit]) // eslint-disable-line react-hooks/exhaustive-deps

  const columnMeta = useMemo(() => [
    { key: 'title', title: t('docKnowledge.colTitle') },
    { key: 'system', title: t('docKnowledge.systemPlanSystem') },
    { key: 'type', title: t('docKnowledge.systemPlanType') },
    { key: 'generated', title: t('docKnowledge.systemPlanGeneratedAt') },
    { key: 'updated', title: t('docKnowledge.colUpdated') },
    { key: 'source', title: t('docKnowledge.systemPlanSource') },
    { key: 'size', title: t('docKnowledge.fileSize') },
    { key: 'hash', title: t('docKnowledge.systemPlanHash') },
    { key: 'status', title: t('docKnowledge.colStatus') },
    { key: 'action', title: t('docKnowledge.colAction') },
  ], [t])

  const { applyConfig, configComponent } = useColumnConfig('doc-system-plans', columnMeta, [
    { key: 'title', visible: true, locked: 'head' as const },
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  return (
    <div className="content-area">
      <Alert type="info" showIcon style={{ marginBottom: 16 }}
        message={t('docKnowledge.systemPlansTitle')} description={t('docKnowledge.systemPlansHint')} />
      {/* 同步语义必须在页面上说清：数据源是 git 提交树，未提交的 md 扫不到。 */}
      <Alert type="warning" showIcon style={{ marginBottom: 16 }}
        message={t('docKnowledge.systemPlanGitSource')} description={t('docKnowledge.systemPlanGitHint')} />
      {failed && (
        <Alert type="error" showIcon style={{ marginBottom: 16 }} message={failed}
          action={<Button size="small" onClick={() => void load()}>{t('docKnowledge.reload')}</Button>} />
      )}

      <div className="search-section">
        <Form form={form} layout="inline" initialValues={{ status: STATUS_ACTIVE }}>
          <Form.Item label={t('docKnowledge.colTitle')} name="title">
            <Input allowClear style={{ width: '100%' }} placeholder={t('docKnowledge.systemPlanSearchPlaceholder')} onPressEnter={handleSearch} />
          </Form.Item>
          <Form.Item label={t('docKnowledge.systemPlanSystem')} name="systemName">
            <Select allowClear showSearch optionFilterProp="label" style={{ width: '100%' }} placeholder={t('common.all')}
              options={systems.map(item => ({ value: item, label: item }))} />
          </Form.Item>
          <Form.Item label={t('docKnowledge.systemPlanType')} name="planType">
            <Select allowClear style={{ width: '100%' }} placeholder={t('common.all')}
              options={planTypes.map(item => ({ value: item, label: item }))} />
          </Form.Item>
          <Form.Item label={t('docKnowledge.colStatus')} name="status">
            <Select style={{ width: '100%' }} allowClear placeholder={t('common.all')}
              options={[
                { value: STATUS_ACTIVE, label: t('docKnowledge.systemPlanStatusActive') },
                { value: STATUS_DEPRECATED, label: t('docKnowledge.systemPlanStatusDeprecated') },
              ]} />
          </Form.Item>
          <Form.Item label={t('docKnowledge.systemPlanGeneratedAt')} name="generatedRange">
            <RangePicker style={{ width: '100%' }} allowClear />
          </Form.Item>
          <Form.Item label={t('docKnowledge.colUpdated')} name="updatedRange">
            <RangePicker style={{ width: '100%' }} allowClear />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>{t('common.search')}</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>{t('common.reset')}</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      <div className="action-section">
        <div className="action-section-left">
          <Button type="primary" icon={<SyncOutlined />} onClick={handleScan} loading={scanning} disabled={!canEdit}>
            {t('docKnowledge.systemPlanScan')}
          </Button>
        </div>
        <div className="action-section-right">{configComponent}</div>
      </div>

      {showingDeprecated && (
        <Alert type="warning" showIcon style={{ marginBottom: 12 }} message={t('docKnowledge.systemPlanDeprecatedListHint')} />
      )}

      <Table rowKey="id" size="middle" dataSource={rows} loading={loading} columns={applyConfig(columns)}
        scroll={{ x: 1500 }}
        pagination={{
          current: page, pageSize: size, total, showSizeChanger: true, showQuickJumper: true,
          pageSizeOptions: ['10', '20', '50', '100'],
          showTotal: count => t('common.total', { count }),
          onChange: (nextPage, nextSize) => {
            const targetPage = nextSize !== size ? 1 : nextPage
            setPage(targetPage)
            setSize(nextSize)
            void load(targetPage, nextSize)
          },
        }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('docKnowledge.systemPlansEmpty')} /> }} />
    </div>
  )
}
