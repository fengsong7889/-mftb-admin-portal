import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Alert, Button, Modal, Select, Space, Switch, Table, Tag, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { DeleteOutlined, EditOutlined, PlusOutlined, StarOutlined } from '@ant-design/icons'
import { useAuth } from '../../../contexts/AuthContext'
import {
  applyDailyReportTemplate,
  deleteDailyReportTemplate,
  fetchDailyReportConfig,
  fetchDailyReportTemplates,
  saveDailyReportTemplate,
  type DailyReportConfig,
  type DailyReportTemplate,
} from '../../../api/rdmDailyReport'
import '../index.css'

/**
 * 進度日報 > 模板配置。
 *
 * <p>两条不可放宽的口径：
 * 1. **預置模板不可刪**（is_preset），只能停用或另存为新模板——它是「恢復默認」的底线；
 *    删掉后用户把自建模板改坏就没有退路。预置模板不可删由后端拒绝，前端只是提前置灰。
 * 2. **模板编辑走独立页**（{@link DailyReportTemplateForm}）：按 AGENTS.md §9.1 表单不得用
 *    Modal/Drawer 承载；正文是 Markdown 多行文本 + 占位符说明表，抽屉里根本放不下。
 */
export default function DailyReportTemplates() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { hasPermission } = useAuth()
  const canEdit = hasPermission('rdm-daily-report-template:edit')

  const [rows, setRows] = useState<DailyReportTemplate[]>([])
  const [config, setConfig] = useState<DailyReportConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [channelFilter, setChannelFilter] = useState<string | undefined>()

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

  const data = useMemo(
    () => rows.filter(x => !channelFilter || x.channel === channelFilter),
    [rows, channelFilter])

  const handleToggle = async (row: DailyReportTemplate, enabled: boolean) => {
    try {
      await saveDailyReportTemplate({
        templateKey: row.templateKey, name: row.name, titleTpl: row.titleTpl,
        contentTpl: row.contentTpl, remark: row.remark ?? undefined, enabled,
      })
      message.success(enabled ? t('rdm.dailyTemplate.enabled') : t('rdm.dailyTemplate.disabled'))
      void load()
    } catch (e) {
      message.error(e instanceof Error && e.message ? e.message : t('rdm.dailyTemplate.toggleFailed'))
    }
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

  const columns: TableColumnsType<DailyReportTemplate> = [
    {
      title: t('rdm.dailyTemplate.colName'), dataIndex: 'name', key: 'name', width: 240,
      render: (v: string, r) => (
        <Space size={4} wrap>
          <span style={{ fontWeight: 600 }}>{v}</span>
          {defaultKeys.has(r.templateKey) && <Tag color="orange">{t('rdm.dailyTemplate.isDefault')}</Tag>}
          {r.preset && <Tag color="blue">{t('rdm.dailyTemplate.preset')}</Tag>}
        </Space>
      ),
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
      title: t('rdm.dailyTemplate.colEnabled'), dataIndex: 'enabled', key: 'enabled', width: 90,
      render: (v: boolean, r) => (
        <Switch size="small" checked={v} disabled={!canEdit} onChange={c => void handleToggle(r, c)} />
      ),
    },
    {
      title: t('rdm.dailyTemplate.colActions'), key: 'actions', width: 240, fixed: 'right',
      render: (_, r) => (
        <Space size={0} wrap>
          <Button type="link" size="small" icon={<EditOutlined />}
            onClick={() => navigate(`/rdm-daily-report-template-form?key=${encodeURIComponent(r.templateKey)}`)}>
            {canEdit ? t('rdm.dailyTemplate.edit') : t('rdm.dailyTemplate.view')}
          </Button>
          {canEdit && (
            <>
              <Button type="link" size="small" icon={<PlusOutlined />}
                onClick={() => navigate(`/rdm-daily-report-template-form?cloneFrom=${encodeURIComponent(r.templateKey)}`)}>
                {t('rdm.dailyTemplate.clone')}
              </Button>
              <Button type="link" size="small" icon={<StarOutlined />}
                disabled={defaultKeys.has(r.templateKey) || !r.enabled}
                onClick={() => void handleApply(r)}>
                {t('rdm.dailyTemplate.setDefault')}
              </Button>
              <Button type="link" size="small" danger icon={<DeleteOutlined />}
                disabled={r.preset || defaultKeys.has(r.templateKey)}
                onClick={() => handleDelete(r)}>
                {t('rdm.dailyTemplate.delete')}
              </Button>
            </>
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
      <div className="search-section" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: '#595959' }}>{t('rdm.dailyTemplate.filterChannel')}:</span>
        <Select allowClear style={{ width: 180 }} placeholder={t('rdm.dailyTemplate.all')}
          value={channelFilter} onChange={setChannelFilter}
          options={[
            { label: t('rdm.dailyTemplate.channelGroup'), value: 'group' },
            { label: t('rdm.dailyTemplate.channelPersonal'), value: 'personal' },
          ]} />
        {canEdit && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/rdm-daily-report-template-form')}>
            {t('rdm.dailyTemplate.newTemplate')}
          </Button>
        )}
      </div>
      <Table rowKey="templateKey" size="small" loading={loading} columns={columns} dataSource={data}
        pagination={false} scroll={{ x: 1000 }} />
    </div>
  )
}
