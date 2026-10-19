import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Alert, Button, Form, Modal, Select, Space, Switch, Table, Tag, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { DeleteOutlined, EditOutlined, PlusOutlined, SaveOutlined, SettingOutlined } from '@ant-design/icons'
import { useAuth } from '../../../contexts/AuthContext'
import {
  deleteDailyReportRule,
  fetchDailyReportConfig,
  fetchDailyReportRules,
  fetchDailyReportTemplates,
  saveDailyReportConfig,
  saveDailyReportRule,
  type DailyReportConfig,
  type DailyReportRule,
  type DailyReportTemplate,
} from '../../../api/rdmDailyReport'
import '../index.css'

/**
 * 進度日報 > 推送配置。
 *
 * <p>两层结构：顶部是**全局开关与默认模板**（总闸，对所有规则生效），下方是**多条推送规则**。
 * 为什么规则是项目维度：实际用法是「A 產品盯 A 項目下的 B1 迭代、B 產品盯 B 項目下的 C1 迭代、
 * W 項目經理盯整個 W 項目」——目标、时间、模板都不同，单条全局配置无法表达。
 *
 * <p>规则的新增/编辑走独立页（{@link RuleForm}）：按 AGENTS.md §9.1，表单不得用 Modal 承载，
 * 且规则字段包含项目/迭代两级联动，窄弹窗里操作体验很差。
 */
export default function DailyReportRules() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { hasPermission } = useAuth()
  const canEdit = hasPermission('rdm-daily-report-rule:edit')

  const [rows, setRows] = useState<DailyReportRule[]>([])
  const [templates, setTemplates] = useState<DailyReportTemplate[]>([])
  const [config, setConfig] = useState<DailyReportConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingCfg, setSavingCfg] = useState(false)
  const [cfgDirty, setCfgDirty] = useState(false)
  const [form] = Form.useForm()

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [rules, tpls, cfg] = await Promise.all([
        fetchDailyReportRules(),
        fetchDailyReportTemplates(),
        fetchDailyReportConfig(),
      ])
      setRows(rules)
      setTemplates(tpls)
      setConfig(cfg)
      form.setFieldsValue({
        enabled: cfg.enabled,
        groupEnabled: cfg.groupEnabled,
        personalEnabled: cfg.personalEnabled,
        morningTemplateKey: cfg.morningTemplateKey ?? undefined,
        eveningTemplateKey: cfg.eveningTemplateKey ?? undefined,
        personalTemplateKey: cfg.personalTemplateKey ?? undefined,
      })
      setCfgDirty(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [form])

  useEffect(() => {
    void load()
  }, [load])

  const groupMorning = useMemo(
    () => templates.filter(x => x.channel === 'group' && x.reportType === 'morning' && x.enabled)
      .map(x => ({ label: x.name, value: x.templateKey })), [templates])
  const groupEvening = useMemo(
    () => templates.filter(x => x.channel === 'group' && x.reportType === 'evening' && x.enabled)
      .map(x => ({ label: x.name, value: x.templateKey })), [templates])
  const personalOptions = useMemo(
    () => templates.filter(x => x.channel === 'personal' && x.enabled)
      .map(x => ({ label: x.name, value: x.templateKey })), [templates])

  const handleSaveConfig = async () => {
    const v = await form.validateFields()
    setSavingCfg(true)
    try {
      const next = await saveDailyReportConfig({
        enabled: v.enabled,
        groupEnabled: v.groupEnabled,
        personalEnabled: v.personalEnabled,
        morningTemplateKey: v.morningTemplateKey ?? null,
        eveningTemplateKey: v.eveningTemplateKey ?? null,
        personalTemplateKey: v.personalTemplateKey ?? null,
      })
      setConfig(next)
      setCfgDirty(false)
      message.success(t('rdm.dailyRule.globalSaved'))
    } catch (e) {
      message.error(e instanceof Error && e.message ? e.message : t('rdm.dailyRule.saveFailed'))
    } finally {
      setSavingCfg(false)
    }
  }

  const handleToggle = async (row: DailyReportRule, enabled: boolean) => {
    try {
      await saveDailyReportRule({
        id: row.id, name: row.name, projectId: row.projectId, iterationCode: row.iterationCode,
        pushTime: row.pushTime, contentType: row.contentType, groupTemplateKey: row.groupTemplateKey,
        personalTemplateKey: row.personalTemplateKey, enabled, remark: row.remark ?? undefined,
      })
      message.success(enabled ? t('rdm.dailyRule.ruleEnabled') : t('rdm.dailyRule.ruleDisabled'))
      void load()
    } catch (e) {
      message.error(e instanceof Error && e.message ? e.message : t('rdm.dailyRule.toggleFailed'))
    }
  }

  const handleDelete = (row: DailyReportRule) => {
    Modal.confirm({
      className: 'custom-confirm-modal',
      icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
      title: t('rdm.dailyRule.deleteTitle'),
      content: t('rdm.dailyRule.deleteContent', { name: row.name }),
      okText: t('rdm.dailyRule.confirmOk'),
      cancelText: t('rdm.dailyRule.confirmCancel'),
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteDailyReportRule(row.id)
          message.success(t('rdm.dailyRule.deleted'))
          void load()
        } catch (e) {
          message.error(e instanceof Error && e.message ? e.message : t('rdm.dailyRule.deleteFailed'))
        }
      },
    })
  }

  const columns: TableColumnsType<DailyReportRule> = [
    {
      title: t('rdm.dailyRule.colName'), dataIndex: 'name', key: 'name', width: 200,
      render: (v: string, r) => (
        <Space size={4} wrap>
          <span style={{ fontWeight: 600 }}>{v}</span>
          {!r.enabled && <Tag>{t('rdm.dailyRule.disabledTag')}</Tag>}
        </Space>
      ),
    },
    {
      title: t('rdm.dailyRule.colTarget'), key: 'target', width: 260,
      render: (_, r) => (
        <Space size={4} wrap>
          <span>{r.projectNo ? `${r.projectNo} ` : ''}{r.projectName ?? `#${r.projectId}`}</span>
          <Tag color={r.iterationCode ? 'blue' : 'default'}>
            {r.iterationCode ? (r.iterationName || r.iterationCode) : t('rdm.dailyRule.allIterations')}
          </Tag>
        </Space>
      ),
    },
    { title: t('rdm.dailyRule.colTime'), dataIndex: 'pushTime', key: 'pushTime', width: 100 },
    {
      title: t('rdm.dailyRule.colContentType'), dataIndex: 'contentType', key: 'contentType', width: 110,
      render: (v: string) => <Tag color={v === 'evening' ? 'purple' : 'gold'}>
        {v === 'evening' ? t('rdm.dailyRule.typeEvening') : t('rdm.dailyRule.typeMorning')}
      </Tag>,
    },
    {
      title: t('rdm.dailyRule.colTemplate'), key: 'tpl', width: 220,
      render: (_, r) => (
        <span style={{ fontSize: 12, color: '#595959' }}>
          {(r.groupTemplateKey || t('rdm.dailyRule.useDefault'))} / {(r.personalTemplateKey || t('rdm.dailyRule.useDefault'))}
        </span>
      ),
    },
    {
      title: t('rdm.dailyRule.colEnabled'), dataIndex: 'enabled', key: 'enabled', width: 90,
      render: (v: boolean, r) => (
        <Switch size="small" checked={v} disabled={!canEdit} onChange={c => void handleToggle(r, c)} />
      ),
    },
    {
      title: t('rdm.dailyRule.colActions'), key: 'actions', width: 160, fixed: 'right',
      render: (_, r) => (
        <Space size={0}>
          <Button type="link" size="small" icon={<EditOutlined />}
            onClick={() => navigate(`/rdm-daily-report-rule-form?id=${r.id}`)}>
            {canEdit ? t('rdm.dailyRule.edit') : t('rdm.dailyRule.view')}
          </Button>
          {canEdit && (
            <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(r)}>
              {t('rdm.dailyRule.delete')}
            </Button>
          )}
        </Space>
      ),
    },
  ]

  return (
    <div className="content-area">
      <Alert type="info" showIcon style={{ marginBottom: 12 }} message={t('rdm.dailyRule.hint')} />

      {error && (
        <Alert type="error" showIcon style={{ marginBottom: 12 }} message={t('rdm.dailyRule.loadFailed')}
          description={error} action={<Button size="small" onClick={() => void load()}>{t('rdm.dailyRule.retry')}</Button>} />
      )}

      {/* 全局开关与默认模板：对所有规则生效的总闸 */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: '#fff7e6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <SettingOutlined style={{ fontSize: 14, color: '#fa8c16' }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('rdm.dailyRule.globalTitle')}</span>
          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          <span style={{ fontSize: 12, color: '#8c8c8c' }}>{t('rdm.dailyRule.globalHint')}</span>
        </div>
        <Form form={form} layout="vertical" disabled={!canEdit} onValuesChange={() => setCfgDirty(true)}>
          <Space size={24} wrap>
            <Form.Item name="enabled" label={t('rdm.dailyRule.masterSwitch')} valuePropName="checked" style={{ marginBottom: 0 }}>
              <Switch checkedChildren={t('rdm.dailyRule.on')} unCheckedChildren={t('rdm.dailyRule.off')} />
            </Form.Item>
            <Form.Item name="groupEnabled" label={t('rdm.dailyRule.groupSwitch')} valuePropName="checked" style={{ marginBottom: 0 }}>
              <Switch checkedChildren={t('rdm.dailyRule.on')} unCheckedChildren={t('rdm.dailyRule.off')} />
            </Form.Item>
            <Form.Item name="personalEnabled" label={t('rdm.dailyRule.personalSwitch')} valuePropName="checked" style={{ marginBottom: 0 }}>
              <Switch checkedChildren={t('rdm.dailyRule.on')} unCheckedChildren={t('rdm.dailyRule.off')} />
            </Form.Item>
          </Space>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16, marginTop: 16 }}>
            <Form.Item name="morningTemplateKey" label={t('rdm.dailyRule.defaultMorningTpl')}>
              <Select allowClear options={groupMorning} placeholder={t('rdm.dailyRule.useDefault')} />
            </Form.Item>
            <Form.Item name="eveningTemplateKey" label={t('rdm.dailyRule.defaultEveningTpl')}>
              <Select allowClear options={groupEvening} placeholder={t('rdm.dailyRule.useDefault')} />
            </Form.Item>
            <Form.Item name="personalTemplateKey" label={t('rdm.dailyRule.defaultPersonalTpl')}>
              <Select allowClear options={personalOptions} placeholder={t('rdm.dailyRule.useDefault')} />
            </Form.Item>
          </div>
        </Form>
        {canEdit && (
          <div style={{ textAlign: 'right' }}>
            <Button type="primary" icon={<SaveOutlined />} loading={savingCfg} disabled={!cfgDirty}
              onClick={() => void handleSaveConfig()}>
              {t('rdm.dailyRule.saveGlobal')}
            </Button>
          </div>
        )}
        {config && !config.enabled && (
          <Alert type="warning" showIcon style={{ marginTop: 12 }} message={t('rdm.dailyRule.masterOffHint')} />
        )}
      </div>

      {/* 规则列表 */}
      <div style={{ ...cardStyle, padding: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px' }}>
          <span style={{ fontSize: 15, fontWeight: 600 }}>
            {t('rdm.dailyRule.rulesTitle')}
            <span style={{ fontSize: 12, color: '#8c8c8c', fontWeight: 400, marginLeft: 8 }}>
              {t('rdm.dailyRule.rulesCount', { count: rows.length })}
            </span>
          </span>
          {canEdit && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/rdm-daily-report-rule-form')}>
              {t('rdm.dailyRule.newRule')}
            </Button>
          )}
        </div>
        <Table rowKey="id" size="small" loading={loading} columns={columns} dataSource={rows}
          pagination={false} scroll={{ x: 1100 }} />
      </div>
    </div>
  )
}

const cardStyle: React.CSSProperties = {
  border: '1px solid #e8eaed', borderRadius: 8, background: '#fff',
  padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
}
