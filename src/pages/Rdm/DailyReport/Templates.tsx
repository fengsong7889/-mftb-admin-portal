import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Alert, Button, DatePicker, Form, Input, Modal, Select, Space, Switch, Table, Tag, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import type { Dayjs } from 'dayjs'
import { useAuth } from '../../../contexts/AuthContext'
import { useColumnConfig } from '../../../hooks/useColumnConfig'
import RemoteSearchSelect from '../../../components/RemoteSearchSelect'
import {
  applyDailyReportTemplate,
  deleteDailyReportTemplate,
  fetchDailyReportConfig,
  fetchDailyReportEmployeeOptions,
  fetchDailyReportTemplates,
  saveDailyReportTemplate,
  type DailyReportConfig,
  type DailyReportTemplate,
} from '../../../api/rdmDailyReport'
import '../index.css'

/** 查询条件：全部为「不填即不过滤」，与后端返回的全量列表做本地过滤（模板数量少，无需分页请求） */
interface TemplateFilters {
  channel?: string
  name?: string
  reportType?: string
  enabled?: boolean
  updatedBy?: string
  /** 只按日期过滤（yyyy-MM-dd）；列表的 updatedAt 是 yyyy-MM-dd HH:mm:ss */
  updatedAt?: string
}

/** 表单值：DatePicker 的值是 Dayjs，提交时再格式化为日期字符串 */
type TemplateSearchValues = Omit<TemplateFilters, 'updatedAt' | 'updatedBy'> & { updatedAt?: Dayjs }

/**
 * 進度日報 > 模板配置。
 *
 * <p>两条不可放宽的口径：
 * 1. **預置模板不可刪**（is_preset），只能停用或另存为新模板——它是「恢復默認」的底线；
 *    删掉后用户把自建模板改坏就没有退路。预置模板不可删由后端拒绝，前端只是提前置灰。
 * 2. **模板编辑走独立页**（{@link DailyReportTemplateForm}）：按 AGENTS.md §9.1 表单不得用
 *    Modal/Drawer 承载；正文是 Markdown 多行文本 + 占位符条，抽屉里根本放不下。
 *
 * <p>列表页结构按 §E.7：搜索区 → 操作区（新建在右）→ 表格；列配置与状态开关按 §B.8/§E.3。
 */
export default function DailyReportTemplates() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { hasPermission } = useAuth()
  const canEdit = hasPermission('rdm-daily-report-template:edit')
  const [searchForm] = Form.useForm()

  const [rows, setRows] = useState<DailyReportTemplate[]>([])
  const [config, setConfig] = useState<DailyReportConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<TemplateFilters>({})
  /**
   * 最后更新人：模板表只存姓名快照（updated_by），没有 user_id。
   * 下拉选项值是 sys_user.id（仅用于控件回显），真正参与过滤的是选项 label 里的姓名。
   * 选人走日报专用 /employee-options，避免依赖 employee-management 菜单而 403。
   */
  const [updatedByUserId, setUpdatedByUserId] = useState<string | undefined>()
  const [updatedByName, setUpdatedByName] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [tpls, cfg] = await Promise.all([fetchDailyReportTemplates(), fetchDailyReportConfig()])
      setRows(tpls)
      setConfig(cfg)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  /** 当前全局默认的模板键集合（列表上打「默認」标记） */
  const defaultKeys = useMemo(() => new Set([
    config?.morningTemplateKey, config?.eveningTemplateKey, config?.personalTemplateKey,
  ].filter(Boolean) as string[]), [config])

  /**
   * 本地过滤：模板总量只有几十条（7 套预置 + 自建），一次拉全量再过滤比每次查询都打接口更快。
   * 名称用大小写不敏感包含匹配；档位/状态/通道为精确匹配。
   */
  const data = useMemo(() => rows.filter(x => {
    if (filters.channel && x.channel !== filters.channel) return false
    if (filters.reportType && x.reportType !== filters.reportType) return false
    if (filters.enabled !== undefined && x.enabled !== filters.enabled) return false
    if (filters.name) {
      const kw = filters.name.trim().toLowerCase()
      if (kw && !x.name.toLowerCase().includes(kw)) return false
    }
    if (filters.updatedBy) {
      const kw = filters.updatedBy.trim().toLowerCase()
      if (kw && !(x.updatedBy ?? '').toLowerCase().includes(kw)) return false
    }
    if (filters.updatedAt && !(x.updatedAt ?? '').startsWith(filters.updatedAt)) return false
    return true
  }), [rows, filters])

  const handleSearch = (values: TemplateSearchValues) => {
    setFilters({
      channel: values.channel || undefined,
      name: values.name?.trim() || undefined,
      reportType: values.reportType || undefined,
      enabled: values.enabled,
      updatedBy: updatedByName.trim() || undefined,
      updatedAt: values.updatedAt ? values.updatedAt.format('YYYY-MM-DD') : undefined,
    })
  }

  const handleReset = () => {
    searchForm.resetFields()
    setUpdatedByUserId(undefined)
    setUpdatedByName('')
    setFilters({})
  }

  /** 应用停用/启用：列表页状态开关必须先二次确认，不能直接打接口（§B.8） */
  const handleToggle = (row: DailyReportTemplate) => {
    const next = !row.enabled
    Modal.confirm({
      className: 'custom-confirm-modal',
      icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
      title: next
        ? t('rdm.dailyTemplate.toggleEnableTitle', { name: row.name })
        : t('rdm.dailyTemplate.toggleDisableTitle', { name: row.name }),
      content: next ? t('rdm.dailyTemplate.toggleEnableContent') : t('rdm.dailyTemplate.toggleDisableContent'),
      okText: t('rdm.dailyTemplate.confirmOk'),
      cancelText: t('rdm.dailyTemplate.confirmCancel'),
      onOk: async () => {
        try {
          await saveDailyReportTemplate({
            templateKey: row.templateKey, name: row.name, titleTpl: row.titleTpl,
            contentTpl: row.contentTpl, remark: row.remark ?? undefined, enabled: next,
          })
          message.success(next ? t('rdm.dailyTemplate.enabled') : t('rdm.dailyTemplate.disabled'))
          void load()
        } catch (e) {
          message.error(e instanceof Error && e.message ? e.message : t('rdm.dailyTemplate.toggleFailed'))
        }
      },
    })
  }

  const handleApply = async (row: DailyReportTemplate) => {
    try {
      await applyDailyReportTemplate(row.templateKey)
      message.success(t('rdm.dailyTemplate.applied'))
      void load()
    } catch (e) {
      message.error(e instanceof Error && e.message ? e.message : t('rdm.dailyTemplate.applyFailed'))
    }
  }

  const handleDelete = (row: DailyReportTemplate) => {
    Modal.confirm({
      className: 'custom-confirm-modal',
      icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
      title: t('rdm.dailyTemplate.deleteTitle'),
      content: t('rdm.dailyTemplate.deleteContent', { name: row.name }),
      okText: t('rdm.dailyTemplate.confirmOk'),
      cancelText: t('rdm.dailyTemplate.confirmCancel'),
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteDailyReportTemplate(row.id)
          message.success(t('rdm.dailyTemplate.deleted'))
          void load()
        } catch (e) {
          message.error(e instanceof Error && e.message ? e.message : t('rdm.dailyTemplate.deleteFailed'))
        }
      },
    })
  }

  /** 列配置元数据：key 必须与 columns 的 key 一一对应（§E.3） */
  const columnMeta = useMemo(() => [
    { key: 'name', title: t('rdm.dailyTemplate.colName'), locked: 'head' as const },
    { key: 'templateKey', title: t('rdm.dailyTemplate.colTemplateKey') },
    { key: 'flags', title: t('rdm.dailyTemplate.colFlags') },
    { key: 'channel', title: t('rdm.dailyTemplate.colChannel') },
    { key: 'reportType', title: t('rdm.dailyTemplate.colReportType') },
    { key: 'remark', title: t('rdm.dailyTemplate.colRemark') },
    { key: 'updatedBy', title: t('rdm.dailyTemplate.colUpdatedBy') },
    { key: 'updatedAt', title: t('rdm.dailyTemplate.colUpdatedAt') },
    { key: 'enabled', title: t('rdm.dailyTemplate.colEnabled') },
    { key: 'actions', title: t('rdm.dailyTemplate.colActions'), locked: 'tail' as const },
  ], [t])
  const { configComponent, applyConfig } = useColumnConfig('rdm-daily-report-templates', columnMeta)

  const columns: TableColumnsType<DailyReportTemplate> = [
    {
      // 名称列只放名称：默认/预置是状态属性，混在名称后面会让名称列宽忽长忽短，也不利于按列筛选
      title: t('rdm.dailyTemplate.colName'), dataIndex: 'name', key: 'name', width: 200,
      render: (v: string) => <span style={{ fontWeight: 600 }}>{v}</span>,
    },
    {
      title: t('rdm.dailyTemplate.colTemplateKey'), dataIndex: 'templateKey', key: 'templateKey', width: 190,
      ellipsis: true,
      render: (v: string) => (
        <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: 12 }}>
          {v}
        </span>
      ),
    },
    {
      title: t('rdm.dailyTemplate.colFlags'), key: 'flags', width: 130,
      render: (_, r) => {
        const flags: ReactNode[] = []
        if (defaultKeys.has(r.templateKey)) {
          flags.push(<Tag key="default" color="orange">{t('rdm.dailyTemplate.isDefault')}</Tag>)
        }
        if (r.preset) {
          flags.push(<Tag key="preset" color="blue">{t('rdm.dailyTemplate.preset')}</Tag>)
        }
        return flags.length > 0
          ? <Space size={4} wrap>{flags}</Space>
          : <span style={{ color: '#bfbfbf' }}>—</span>
      },
    },
    {
      title: t('rdm.dailyTemplate.colChannel'), dataIndex: 'channel', key: 'channel', width: 110,
      render: (c: string) => <Tag color={c === 'group' ? 'geekblue' : 'purple'}>
        {c === 'group' ? t('rdm.dailyTemplate.channelGroup') : t('rdm.dailyTemplate.channelPersonal')}
      </Tag>,
    },
    {
      title: t('rdm.dailyTemplate.colReportType'), dataIndex: 'reportType', key: 'reportType', width: 100,
      render: (v: string) => v === 'any' ? t('rdm.dailyTemplate.typeAny')
        : v === 'evening' ? t('rdm.dailyTemplate.typeEvening') : t('rdm.dailyTemplate.typeMorning'),
    },
    { title: t('rdm.dailyTemplate.colRemark'), dataIndex: 'remark', key: 'remark', ellipsis: true },
    {
      title: t('rdm.dailyTemplate.colUpdatedBy'), dataIndex: 'updatedBy', key: 'updatedBy', width: 110,
      render: (v: string | null | undefined) => v || <span style={{ color: '#bfbfbf' }}>—</span>,
    },
    {
      title: t('rdm.dailyTemplate.colUpdatedAt'), dataIndex: 'updatedAt', key: 'updatedAt', width: 160,
      render: (v: string | null | undefined) => v || <span style={{ color: '#bfbfbf' }}>—</span>,
    },
    {
      title: t('rdm.dailyTemplate.colEnabled'), dataIndex: 'enabled', key: 'enabled', width: 100,
      render: (v: boolean, r) => (
        <Switch
          checked={v}
          checkedChildren={t('rdm.dailyRule.on')}
          unCheckedChildren={t('rdm.dailyRule.off')}
          disabled={!canEdit}
          onChange={() => handleToggle(r)}
        />
      ),
    },
    {
      title: t('rdm.dailyTemplate.colActions'), key: 'actions', width: 300, fixed: 'right',
      render: (_, r) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small"
            onClick={() => navigate(`/rdm-daily-report-template-form?key=${encodeURIComponent(r.templateKey)}`)}>
            {canEdit ? t('rdm.dailyTemplate.edit') : t('rdm.dailyTemplate.view')}
          </Button>
          {canEdit && (
            <Button type="link" size="small"
              onClick={() => navigate(`/rdm-daily-report-template-form?cloneFrom=${encodeURIComponent(r.templateKey)}`)}>
              {t('rdm.dailyTemplate.clone')}
            </Button>
          )}
          {canEdit && (
            defaultKeys.has(r.templateKey)
              // 已经是默认模板：按钮改叫「默認中」，避免用户看到「設為默認」却点不动
              ? <Button type="link" size="small" disabled>{t('rdm.dailyTemplate.defaultNow')}</Button>
              : (
                <Button type="link" size="small" disabled={!r.enabled} onClick={() => void handleApply(r)}>
                  {t('rdm.dailyTemplate.setDefault')}
                </Button>
              )
          )}
          {canEdit && (
            <Button type="link" size="small" danger
              disabled={r.preset || defaultKeys.has(r.templateKey)}
              onClick={() => handleDelete(r)}>
              {t('rdm.dailyTemplate.delete')}
            </Button>
          )}
        </Space>
      ),
    },
  ]

  return (
    <div className="content-area">
      <Alert type="info" showIcon style={{ marginBottom: 12 }} message={t('rdm.dailyTemplate.hint')} />
      {error && (
        <Alert type="error" showIcon style={{ marginBottom: 12 }} message={t('rdm.dailyTemplate.loadFailed')}
          description={error} action={<Button size="small" onClick={() => void load()}>{t('rdm.dailyTemplate.retry')}</Button>} />
      )}

      {/* 搜索区：投放通道 / 模板名称 / 使用档位 / 状态 / 最后更新人 / 最后更新时间 */}
      <div className="search-section">
        <Form form={searchForm} layout="inline" onFinish={handleSearch}>
          <Form.Item label={t('rdm.dailyTemplate.filterChannel')} name="channel">
            <Select allowClear placeholder={t('rdm.dailyTemplate.all')}
              options={[
                { label: t('rdm.dailyTemplate.channelGroup'), value: 'group' },
                { label: t('rdm.dailyTemplate.channelPersonal'), value: 'personal' },
              ]} />
          </Form.Item>
          <Form.Item label={t('rdm.dailyTemplate.filterName')} name="name">
            <Input allowClear placeholder={t('rdm.dailyTemplate.filterNamePh')} />
          </Form.Item>
          <Form.Item label={t('rdm.dailyTemplate.filterReportType')} name="reportType">
            <Select allowClear placeholder={t('rdm.dailyTemplate.all')}
              options={[
                { label: t('rdm.dailyTemplate.typeMorning'), value: 'morning' },
                { label: t('rdm.dailyTemplate.typeEvening'), value: 'evening' },
                { label: t('rdm.dailyTemplate.typeAny'), value: 'any' },
              ]} />
          </Form.Item>
          <Form.Item label={t('rdm.dailyTemplate.filterEnabled')} name="enabled">
            <Select allowClear placeholder={t('rdm.dailyTemplate.all')}
              options={[
                { label: t('rdm.dailyRule.on'), value: true },
                { label: t('rdm.dailyRule.off'), value: false },
              ]} />
          </Form.Item>
          <Form.Item label={t('rdm.dailyTemplate.filterUpdatedBy')}>
            {/* 下拉选项 label = 姓名(工号)，支持工号/姓名远程搜索；过滤取 label 里的姓名快照 */}
            <RemoteSearchSelect
              value={updatedByUserId}
              onChange={(value, label) => {
                setUpdatedByUserId(value)
                setUpdatedByName(label?.split('(')[0]?.trim() ?? '')
              }}
              fetchOptions={fetchDailyReportEmployeeOptions}
              placeholder={t('rdm.dailyTemplate.filterUpdatedByPh')}
            />
          </Form.Item>
          <Form.Item label={t('rdm.dailyTemplate.filterUpdatedAt')} name="updatedAt">
            <DatePicker style={{ width: '100%' }} placeholder={t('rdm.dailyTemplate.filterUpdatedAt')} />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>{t('common.search')}</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>{t('common.reset')}</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 操作区：新建在右（§E.2），列配置紧随其后 */}
      <div className="action-section">
        <div className="action-section-left" />
        <div className="action-section-right">
          {canEdit && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/rdm-daily-report-template-form')}>
              {t('rdm.dailyTemplate.newTemplate')}
            </Button>
          )}
          {configComponent}
        </div>
      </div>

      <Table rowKey="templateKey" size="small" loading={loading} columns={applyConfig(columns)} dataSource={data}
        pagination={false} scroll={{ x: 1600 }} />
    </div>
  )
}
