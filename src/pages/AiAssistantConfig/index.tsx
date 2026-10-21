import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert, Button, Checkbox, Collapse, Form, Input, InputNumber, Modal, Select, Space, Spin, Statistic, Switch, Table, Tag, message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined, ReloadOutlined, UndoOutlined, SearchOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { Navigate } from 'react-router-dom'
import { formatDateTime } from '../../utils/datetime'
import { confirmDelete } from '../../utils/confirmDelete'
import AiScopeSwitch from '../../components/AiScopeSwitch'
import { AI_SCOPE_OPTIONS, aiScopeLabel, useAiScope } from '../../constants/aiScope'
import { fetchFeedback, fetchFeedbackStats, type AiFeedbackRow, type AiFeedbackStats } from '../../api/aiFeedback'
import {
  deleteKnowledgeDoc,
  fetchKnowledgeDoc,
  fetchKnowledgeDocs,
  KNOWLEDGE_SYSTEMS,
  rebuildKnowledge,
  saveKnowledgeDoc,
  searchKnowledge,
  setKnowledgeStatus,
  type AiKnowledgeDoc,
  type KnowledgeHit,
} from '../../api/aiKnowledge'
import {
  deleteGuardRule,
  fetchGuardRules,
  saveGuardRule,
  type AiGuardRule,
} from '../../api/aiGuardrail'
import {
  deleteGlossary,
  fetchCapabilities,
  fetchGlossary,
  fetchProfiles,
  publishProfile,
  rollbackProfile,
  saveCapability,
  saveGlossary,
  saveProfileDraft,
  testRunPrompt,
  type AiCapability,
  type AiGlossary,
  type AiPromptProfile,
  type AiPromptTestRunResult,
} from '../../api/aiPromptConfig'

const DOMAIN_OPTIONS = [
  { value: 'common', label: '通用' },
  { value: 'rdm', label: '產研交付' },
  { value: 'finance', label: '財務推廣金' },
  { value: 'eam', label: '物資管理' },
  { value: 'hr', label: '人事' },
]

/**
 * AI 助手配置中心：拆分为独立页面后，本组件只负责旧地址重定向。
 *
 * <p>各面板仍在此文件维护，由 ../AiAssistant/*Page.tsx 通过命名导出复用；
 * 避免一次性搬移 1000+ 行代码引入无关回归，后续可再逐个物理拆分。
 */
export default function AiAssistantConfig() {
  return <Navigate to="/ai-assistant" replace />
}

/* ────────────────── 能力清单 ────────────────── */

export function CapabilityTab() {
  const { t } = useTranslation()
  const [rows, setRows] = useState<AiCapability[]>([])
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState<AiCapability | null>(null)
  const [saving, setSaving] = useState(false)
  const [scope, setScope] = useAiScope('ai-capability', 'all')
  const [form] = Form.useForm<AiCapability>()

  const scopedRows = useMemo(
    () => (scope === 'all' ? rows : rows.filter((r) => (r.domain || 'common') === scope)),
    [rows, scope],
  )

  const load = useCallback(() => {
    setLoading(true)
    fetchCapabilities()
      .then(setRows)
      .catch(() => message.error(t('aiAssistantConfig.loadFailed', { defaultValue: '加載失敗' })))
      .finally(() => setLoading(false))
  }, [t])

  useEffect(() => { load() }, [load])

  const openEdit = (row: AiCapability) => {
    setEditing(row)
    form.setFieldsValue(row)
  }

  const submit = async () => {
    if (!editing) return
    const values = await form.validateFields()
    setSaving(true)
    try {
      await saveCapability(editing.toolKey, { ...editing, ...values })
      message.success(t('aiAssistantConfig.saved', { defaultValue: '已保存，30 秒內生效' }))
      setEditing(null)
      load()
    } catch {
      message.error(t('aiAssistantConfig.saveFailed', { defaultValue: '保存失敗' }))
    } finally {
      setSaving(false)
    }
  }

  const columns: ColumnsType<AiCapability> = [
    { title: 'Tool Key', dataIndex: 'toolKey', key: 'toolKey', width: 210, ellipsis: true },
    { title: t('aiAssistantConfig.colName', { defaultValue: '名稱' }), dataIndex: 'displayName', key: 'displayName', width: 130 },
    {
      title: t('aiAssistantConfig.colDomain', { defaultValue: '領域' }), dataIndex: 'domain', key: 'domain', width: 100,
      render: (v: string) => <Tag>{DOMAIN_OPTIONS.find((d) => d.value === v)?.label ?? v}</Tag>,
    },
    {
      title: t('aiAssistantConfig.colDescription', { defaultValue: '模型看到的描述' }), dataIndex: 'promptDescription', key: 'promptDescription',
      ellipsis: true,
    },
    {
      title: t('aiAssistantConfig.colUseWhen', { defaultValue: '何時用' }), dataIndex: 'useWhen', key: 'useWhen', width: 240, ellipsis: true,
    },
    { title: t('common.updatedAt', { defaultValue: '更新時間' }), dataIndex: 'updatedAt', key: 'updatedAt', width: 160,
      render: (v?: string | number) => formatDateTime(v) },
    {
      title: t('common.action', { defaultValue: '操作' }), key: 'action', width: 90,
      render: (_, row) => <Button type="link" onClick={() => openEdit(row)}>{t('common.edit', { defaultValue: '編輯' })}</Button>,
    },
  ]

  return (
    <>
      <div className="action-section" style={{ marginBottom: 8 }}>
        <div className="action-section-left">
          <AiScopeSwitch value={scope} onChange={setScope} includeAll />
        </div>
        <div className="action-section-right">
          <Button icon={<ReloadOutlined />} onClick={load}>{t('common.refresh', { defaultValue: '刷新' })}</Button>
        </div>
      </div>
      <Table<AiCapability>
        rowKey="toolKey"
        size="small"
        loading={loading}
        columns={columns}
        dataSource={scopedRows}
        pagination={{
          pageSize: 20,
          showSizeChanger: true,
          showQuickJumper: true,
          pageSizeOptions: ['10', '20', '50', '100'],
          showTotal: (total) => t('common.total', { count: total, defaultValue: '共 {{count}} 條' }),
        }}
        scroll={{ x: 'max-content' }}
        locale={{ emptyText: t('aiAssistantConfig.capabilityEmpty', { defaultValue: '暫無能力配置' }) }}
      />
      <Modal
        open={!!editing}
        title={t('aiAssistantConfig.editCapability', { defaultValue: '編輯能力說明' })}
        onCancel={() => setEditing(null)}
        onOk={submit}
        confirmLoading={saving}
        width={720}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Form.Item name="toolKey" label="Tool Key">
            <Input disabled />
          </Form.Item>
          <Form.Item name="displayName" label={t('aiAssistantConfig.colName', { defaultValue: '名稱' })} rules={[{ required: true }]}>
            <Input maxLength={64} />
          </Form.Item>
          <Form.Item name="domain" label={t('aiAssistantConfig.colDomain', { defaultValue: '領域' })} rules={[{ required: true }]}>
            <Select options={DOMAIN_OPTIONS} />
          </Form.Item>
          <Form.Item name="promptDescription" label={t('aiAssistantConfig.colDescription', { defaultValue: '模型看到的描述' })} rules={[{ required: true }]}>
            <Input.TextArea rows={4} maxLength={500} showCount />
          </Form.Item>
          <Form.Item name="useWhen" label={t('aiAssistantConfig.colUseWhen', { defaultValue: '何時用' })}>
            <Input.TextArea rows={2} maxLength={300} showCount />
          </Form.Item>
          <Form.Item name="avoidWhen" label={t('aiAssistantConfig.colAvoidWhen', { defaultValue: '不要用' })}>
            <Input.TextArea rows={2} maxLength={300} showCount />
          </Form.Item>
          <Form.Item name="sort" label={t('aiAssistantConfig.colSort', { defaultValue: '排序' })}>
            <InputNumber min={0} max={9999} style={{ width: 160 }} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}

/* ────────────────── 回答骨架 ────────────────── */

export function ProfileTab() {
  const { t } = useTranslation()
  const [rows, setRows] = useState<AiPromptProfile[]>([])
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState<AiPromptProfile | null>(null)
  const [saving, setSaving] = useState(false)
  const [versionsKey, setVersionsKey] = useState<string | null>(null)
  const [testRunKey, setTestRunKey] = useState<string | null>(null)
  const [scope, setScope] = useAiScope('ai-profile', 'all')
  const [form] = Form.useForm<AiPromptProfile>()

  const load = useCallback(() => {
    setLoading(true)
    fetchProfiles()
      .then(setRows)
      .catch(() => message.error(t('aiAssistantConfig.loadFailed', { defaultValue: '加載失敗' })))
      .finally(() => setLoading(false))
  }, [t])

  useEffect(() => { load() }, [load])

  const grouped = useMemo(() => {
    const map = new Map<string, { active?: AiPromptProfile; draft?: AiPromptProfile; all: AiPromptProfile[] }>()
    const scoped = scope === 'all'
      ? rows
      : rows.filter((p) => p.profileKey === scope || p.domain === scope)
    for (const p of scoped) {
      const entry = map.get(p.profileKey) ?? { all: [] }
      entry.all.push(p)
      if (p.status === 'active') entry.active = p
      if (p.status === 'draft') entry.draft = p
      map.set(p.profileKey, entry)
    }
    return Array.from(map.entries()).map(([key, value]) => ({ key, ...value }))
  }, [rows, scope])

  /** 为当前选中的系统建立一套骨架（已有则进入草稿编辑） */
  const openCreateForScope = () => {
    if (scope === 'all') return
    const value: AiPromptProfile = {
      profileKey: scope,
      name: aiScopeLabel(scope),
      domain: scope,
      responseSkeleton: '',
      extraRules: '',
      status: 'draft',
      version: 1,
    }
    setEditing(value)
    form.setFieldsValue(value)
  }

  const openEdit = (row: { key: string; active?: AiPromptProfile; draft?: AiPromptProfile }) => {
    const source = row.draft ?? row.active
    const value: AiPromptProfile = {
      profileKey: row.key,
      name: source?.name ?? row.key,
      domain: source?.domain ?? 'global',
      responseSkeleton: source?.responseSkeleton ?? '',
      extraRules: source?.extraRules ?? '',
      status: 'draft',
      version: source?.version ?? 1,
    }
    setEditing(value)
    form.setFieldsValue(value)
  }

  const submit = async () => {
    if (!editing) return
    const values = await form.validateFields()
    setSaving(true)
    try {
      await saveProfileDraft({ ...editing, ...values })
      message.success(t('aiAssistantConfig.draftSaved', { defaultValue: '草稿已保存；發布後才生效' }))
      setEditing(null)
      load()
    } catch {
      message.error(t('aiAssistantConfig.saveFailed', { defaultValue: '保存失敗' }))
    } finally {
      setSaving(false)
    }
  }

  const publish = (key: string) => {
    Modal.confirm({
      title: t('aiAssistantConfig.publishConfirm', { defaultValue: '確認發布？' }),
      content: t('aiAssistantConfig.publishConfirmContent', {
        defaultValue: '發布後下一次提問即生效，可在版本歷史中回滾。',
      }),
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      okText: t('aiAssistantConfig.publish', { defaultValue: '發布' }),
      onOk: async () => {
        try {
          await publishProfile(key)
          message.success(t('aiAssistantConfig.published', { defaultValue: '已發布' }))
          load()
        } catch {
          message.error(t('aiAssistantConfig.publishFailed', { defaultValue: '發布失敗' }))
        }
      },
    })
  }

  const columns: ColumnsType<{ key: string; active?: AiPromptProfile; draft?: AiPromptProfile; all: AiPromptProfile[] }> = [
    { title: 'Profile', dataIndex: 'key', key: 'key', width: 140 },
    { title: t('aiAssistantConfig.colName', { defaultValue: '名稱' }), key: 'name', width: 140, render: (_, r) => r.active?.name ?? r.draft?.name ?? '--' },
    {
      title: t('aiAssistantConfig.colDomain', { defaultValue: '領域' }), key: 'domain', width: 110,
      render: (_, r) => <Tag>{DOMAIN_OPTIONS.find((d) => d.value === (r.active?.domain ?? r.draft?.domain))?.label ?? (r.active?.domain ?? r.draft?.domain ?? '--')}</Tag>,
    },
    {
      title: t('aiAssistantConfig.colActiveVersion', { defaultValue: '生效版本' }), key: 'version', width: 110,
      render: (_, r) => r.active ? <Tag color="success">v{r.active.version}</Tag> : <Tag color="warning">未發布</Tag>,
    },
    {
      title: t('aiAssistantConfig.colDraft', { defaultValue: '草稿' }), key: 'draft', width: 100,
      render: (_, r) => r.draft ? <Tag color="processing">v{r.draft.version}</Tag> : '--',
    },
    { title: t('aiAssistantConfig.colPublishedAt', { defaultValue: '發布時間' }), key: 'publishedAt', width: 170,
      render: (_, r) => formatDateTime(r.active?.publishedAt) },
    {
      title: t('common.action', { defaultValue: '操作' }), key: 'action', width: 260, fixed: 'right',
      render: (_, r) => (
        <Space>
          <Button type="link" size="small" onClick={() => openEdit(r)}>{t('common.edit', { defaultValue: '編輯' })}</Button>
          <Button type="link" size="small" disabled={!r.draft} onClick={() => publish(r.key)}>
            {t('aiAssistantConfig.publish', { defaultValue: '發布' })}
          </Button>
          <Button type="link" size="small" onClick={() => setTestRunKey(r.key)}>
            {t('aiAssistantConfig.testRun', { defaultValue: '試跑' })}
          </Button>
          <Button type="link" size="small" onClick={() => setVersionsKey(r.key)}>{t('aiAssistantConfig.versions', { defaultValue: '版本歷史' })}</Button>
        </Space>
      ),
    },
  ]

  const versionRows = rows.filter((r) => r.profileKey === versionsKey)
    .sort((a, b) => b.version - a.version)

  return (
    <>
      <div className="action-section" style={{ marginBottom: 8 }}>
        <div className="action-section-left">
          <AiScopeSwitch value={scope} onChange={setScope} includeAll />
        </div>
        <div className="action-section-right">
          <Button icon={<ReloadOutlined />} onClick={load}>{t('common.refresh', { defaultValue: '刷新' })}</Button>
          {scope !== 'all' && (
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreateForScope}>
              新增本系統骨架
            </Button>
          )}
        </div>
      </div>
      <Table
        rowKey="key"
        size="small"
        loading={loading}
        columns={columns}
        dataSource={grouped}
        pagination={false}
        scroll={{ x: 'max-content' }}
        locale={{ emptyText: t('aiAssistantConfig.profileEmpty', { defaultValue: '暫無回答骨架' }) }}
      />
      <Modal
        open={!!editing}
        title={t('aiAssistantConfig.editProfile', { defaultValue: '編輯回答骨架' })}
        onCancel={() => setEditing(null)}
        onOk={submit}
        confirmLoading={saving}
        width={860}
        destroyOnHidden
        okText={t('aiAssistantConfig.saveDraft', { defaultValue: '保存草稿' })}
      >
        <Form form={form} layout="vertical">
          <Space size="large" style={{ display: 'flex' }}>
            <Form.Item name="profileKey" label="Profile" rules={[{ required: true }]}>
              <Input disabled style={{ width: 180 }} />
            </Form.Item>
            <Form.Item name="name" label={t('aiAssistantConfig.colName', { defaultValue: '名稱' })} rules={[{ required: true }]}>
              <Input style={{ width: 220 }} maxLength={64} />
            </Form.Item>
            <Form.Item name="domain" label={t('aiAssistantConfig.colDomain', { defaultValue: '領域' })} rules={[{ required: true }]}>
              <Select options={DOMAIN_OPTIONS} style={{ width: 180 }} />
            </Form.Item>
          </Space>
          <Form.Item name="responseSkeleton" label={t('aiAssistantConfig.skeleton', { defaultValue: '回答骨架（Markdown 指令）' })} rules={[{ required: true }]}>
            <Input.TextArea rows={14} maxLength={8000} showCount />
          </Form.Item>
          <Form.Item name="extraRules" label={t('aiAssistantConfig.extraRules', { defaultValue: '領域規則' })}>
            <Input.TextArea rows={6} maxLength={4000} showCount />
          </Form.Item>
          <Alert
            type="warning"
            showIcon
            message={t('aiAssistantConfig.safetyNote', {
              defaultValue: '安全不變量（不編造、不越權、不洩露、推送必須確認）由代碼保留，配置無法覆蓋。',
            })}
          />
        </Form>
      </Modal>
      <Modal
        open={!!versionsKey}
        title={t('aiAssistantConfig.versions', { defaultValue: '版本歷史' })}
        footer={null}
        onCancel={() => setVersionsKey(null)}
        width={720}
      >
        <Table
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={versionRows}
          columns={[
            { title: 'Version', dataIndex: 'version', key: 'version', width: 90, render: (v) => `v${v}` },
            { title: 'Status', dataIndex: 'status', key: 'status', width: 110, render: (v) => <Tag color={v === 'active' ? 'success' : 'default'}>{v}</Tag> },
            { title: t('aiAssistantConfig.colPublishedAt', { defaultValue: '發布時間' }), dataIndex: 'publishedAt', key: 'publishedAt',
              render: (v?: string | number) => formatDateTime(v) },
            { title: t('aiAssistantConfig.colUpdatedBy', { defaultValue: '更新人' }), dataIndex: 'updatedBy', key: 'updatedBy', width: 120 },
            {
              title: t('common.action', { defaultValue: '操作' }), key: 'action', width: 110,
              render: (_, r) => (
                <Button
                  type="link"
                  size="small"
                  icon={<UndoOutlined />}
                  disabled={r.status === 'active'}
                  onClick={async () => {
                    try {
                      await rollbackProfile(r.profileKey, r.version)
                      message.success(t('aiAssistantConfig.rolledBack', { defaultValue: '已回滾' }))
                      setVersionsKey(null)
                      load()
                    } catch {
                      message.error(t('aiAssistantConfig.rollbackFailed', { defaultValue: '回滾失敗' }))
                    }
                  }}
                >
                  {t('aiAssistantConfig.rollback', { defaultValue: '回滾' })}
                </Button>
              ),
            },
          ]}
        />
      </Modal>
      <Modal
        open={!!testRunKey}
        title={`${t('aiAssistantConfig.testRun', { defaultValue: '試跑' })} · ${testRunKey ?? ''}`}
        footer={null}
        onCancel={() => setTestRunKey(null)}
        width={900}
        destroyOnHidden
      >
        {testRunKey && <TestRunPanel profileKey={testRunKey} />}
      </Modal>
    </>
  )
}

/** 草稿配置 sandbox 试跑：看回答、工具轨迹与完整 Prompt。 */
function TestRunPanel({ profileKey }: { profileKey: string }) {
  const { t } = useTranslation()
  const [question, setQuestion] = useState('現在有哪些進行中的項目？')
  const [useTools, setUseTools] = useState(true)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AiPromptTestRunResult | null>(null)

  const run = async () => {
    if (!question.trim()) {
      message.warning(t('aiAssistantConfig.testRunQuestionRequired', { defaultValue: '請輸入示例問題' }))
      return
    }
    setLoading(true)
    try {
      setResult(await testRunPrompt({ profileKey, question: question.trim(), useTools }))
    } catch (e) {
      message.error(e instanceof Error ? e.message : t('aiAssistantConfig.testRunFailed', { defaultValue: '試跑失敗' }))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <Input.TextArea
        rows={3}
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder={t('aiAssistantConfig.testRunPlaceholder', {
          defaultValue: '例如：現在有哪些進行中的項目？',
        })}
      />
      <Space style={{ marginTop: 10 }} wrap>
        <Checkbox checked={useTools} onChange={(e) => setUseTools(e.target.checked)}>
          {t('aiAssistantConfig.testRunUseTools', { defaultValue: '允許調用工具' })}
        </Checkbox>
        <Button type="primary" loading={loading} onClick={run}>
          {t('aiAssistantConfig.testRunStart', { defaultValue: '開始試跑' })}
        </Button>
        <span style={{ color: '#8c8c8c', fontSize: 12 }}>
          {t('aiAssistantConfig.testRunHint', {
            defaultValue: '沙箱：不寫會話、不推送、不調外部工具；每人每小時最多 10 次。',
          })}
        </span>
      </Space>

      {loading && <div style={{ marginTop: 16, textAlign: 'center' }}><Spin /></div>}

      {result && !loading && (
        <div style={{ marginTop: 16 }}>
          {result.errorKind && <Alert type="warning" showIcon message={result.errorKind} style={{ marginBottom: 8 }} />}
          <Space wrap style={{ marginBottom: 8 }}>
            <Tag color="processing">{result.model ?? '--'}</Tag>
            <Tag>{result.tokens} tokens</Tag>
            {result.traces.map((tr, i) => (
              <Tag key={`${tr.toolKey}-${i}`} color={tr.success ? 'success' : 'error'}>
                {tr.toolKey} · {tr.elapsedMs}ms
              </Tag>
            ))}
          </Space>
          <div style={{
            whiteSpace: 'pre-wrap', background: '#FAFAFA', border: '1px solid #f0f0f0',
            borderRadius: 8, padding: 12, fontSize: 13, lineHeight: 1.7, minHeight: 80,
          }}>
            {result.text || '--'}
          </div>
          <Collapse
            ghost
            style={{ marginTop: 12 }}
            items={[{
              key: 'prompt',
              label: t('aiAssistantConfig.testRunPrompt', { defaultValue: '查看完整 Prompt' }),
              children: (
                <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 320, overflow: 'auto', fontSize: 12 }}>
                  {result.prompt}
                </pre>
              ),
            }]}
          />
        </div>
      )}
    </div>
  )
}

/* ────────────────── 术语与口径 ────────────────── */

export function GlossaryTab() {
  const { t } = useTranslation()
  const [rows, setRows] = useState<AiGlossary[]>([])
  const [loading, setLoading] = useState(false)
  const [scope, setScope] = useAiScope('ai-glossary', 'all')
  const [keyword, setKeyword] = useState('')
  const [editing, setEditing] = useState<AiGlossary | null>(null)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm<AiGlossary>()
  const [searchForm] = Form.useForm<{ keyword?: string }>()

  const load = useCallback(() => {
    setLoading(true)
    fetchGlossary({ domain: scope === 'all' ? undefined : scope, keyword: keyword || undefined })
      .then(setRows)
      .catch(() => message.error(t('aiAssistantConfig.loadFailed', { defaultValue: '加載失敗' })))
      .finally(() => setLoading(false))
  }, [scope, keyword, t])

  useEffect(() => { load() }, [load])

  const handleSearch = () => {
    setKeyword((searchForm.getFieldValue('keyword') ?? '').trim())
  }

  const handleReset = () => {
    searchForm.resetFields()
    setKeyword('')
  }

  const openCreate = () => {
    const value: AiGlossary = { domain: scope === 'all' ? 'common' : scope, term: '', definition: '', promptVisible: 1, sort: 0 }
    setEditing(value)
    form.setFieldsValue(value)
  }

  const openEdit = (row: AiGlossary) => {
    setEditing(row)
    form.setFieldsValue({ ...row })
  }

  const submit = async () => {
    if (!editing) return
    const values = await form.validateFields()
    setSaving(true)
    try {
      await saveGlossary({ ...editing, ...values })
      message.success(t('aiAssistantConfig.saved', { defaultValue: '已保存，30 秒內生效' }))
      setEditing(null)
      load()
    } catch {
      message.error(t('aiAssistantConfig.saveFailed', { defaultValue: '保存失敗' }))
    } finally {
      setSaving(false)
    }
  }

  const columns: ColumnsType<AiGlossary> = [
    {
      title: t('aiAssistantConfig.colDomain', { defaultValue: '領域' }), dataIndex: 'domain', key: 'domain', width: 100,
      render: (v: string) => <Tag>{DOMAIN_OPTIONS.find((d) => d.value === v)?.label ?? v}</Tag>,
    },
    { title: t('aiAssistantConfig.colTerm', { defaultValue: '術語' }), dataIndex: 'term', key: 'term', width: 140 },
    { title: t('aiAssistantConfig.colDefinition', { defaultValue: '定義' }), dataIndex: 'definition', key: 'definition', ellipsis: true },
    { title: t('aiAssistantConfig.colFormula', { defaultValue: '口徑/公式' }), dataIndex: 'formula', key: 'formula', width: 220, ellipsis: true },
    {
      title: t('aiAssistantConfig.colPromptVisible', { defaultValue: '注入 Prompt' }), dataIndex: 'promptVisible', key: 'promptVisible', width: 110,
      render: (v: number) => v === 1 ? <Tag color="processing">是</Tag> : <Tag>否</Tag>,
    },
    { title: t('aiAssistantConfig.colSource', { defaultValue: '來源' }), dataIndex: 'source', key: 'source', width: 90 },
    {
      title: t('common.action', { defaultValue: '操作' }), key: 'action', width: 130,
      render: (_, row) => (
        <Space>
          <Button type="link" size="small" onClick={() => openEdit(row)}>{t('common.edit', { defaultValue: '編輯' })}</Button>
          <Button type="link" size="small" danger
            onClick={() => confirmDelete({
              title: t('aiAssistantConfig.deleteConfirm', { defaultValue: '確認刪除？' }),
              content: '刪除後助手不再引用該術語；已生成的回答不受影響。',
              onOk: async () => {
                if (row.id == null) return
                try {
                  await deleteGlossary(row.id)
                  message.success(t('common.deleted', { defaultValue: '已刪除' }))
                  load()
                } catch {
                  message.error(t('common.deleteFailed', { defaultValue: '刪除失敗' }))
                }
              },
            })}>
            {t('common.delete', { defaultValue: '刪除' })}
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <>
      <div className="search-section">
        <Form form={searchForm} layout="inline" onFinish={handleSearch}>
          <Form.Item label={t('aiAssistantConfig.colTerm', { defaultValue: '術語' })} name="keyword">
            <Input allowClear placeholder={t('aiAssistantConfig.searchTerm', { defaultValue: '搜尋術語/定義' })}
              onPressEnter={handleSearch} />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
                {t('common.search', { defaultValue: '查詢' })}
              </Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>
                {t('common.reset', { defaultValue: '重置' })}
              </Button>
            </div>
          </Form.Item>
        </Form>
      </div>
      <div className="action-section" style={{ marginBottom: 8 }}>
        <div className="action-section-left">
          <AiScopeSwitch value={scope} onChange={setScope} includeAll />
        </div>
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>{t('common.add', { defaultValue: '新增' })}</Button>
        </div>
      </div>
      <Table<AiGlossary>
        rowKey={(r) => String(r.id ?? `${r.domain}:${r.term}`)}
        size="small"
        loading={loading}
        columns={columns}
        dataSource={rows}
        scroll={{ x: 'max-content' }}
        pagination={{
          pageSize: 20,
          showSizeChanger: true,
          showQuickJumper: true,
          pageSizeOptions: ['10', '20', '50', '100'],
          showTotal: (total) => t('common.total', { count: total, defaultValue: '共 {{count}} 條' }),
        }}
        locale={{ emptyText: t('aiAssistantConfig.glossaryEmpty', { defaultValue: '暫無術語' }) }}
      />
      <Modal
        open={!!editing}
        title={t('aiAssistantConfig.editGlossary', { defaultValue: '編輯術語/口徑' })}
        onCancel={() => setEditing(null)}
        onOk={submit}
        confirmLoading={saving}
        width={720}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Space size="large" style={{ display: 'flex' }}>
            <Form.Item name="domain" label={t('aiAssistantConfig.colDomain', { defaultValue: '領域' })} rules={[{ required: true }]}>
              <Select options={DOMAIN_OPTIONS} style={{ width: 180 }} />
            </Form.Item>
            <Form.Item name="term" label={t('aiAssistantConfig.colTerm', { defaultValue: '術語' })} rules={[{ required: true }]}>
              <Input style={{ width: 260 }} maxLength={128} />
            </Form.Item>
            <Form.Item name="sort" label={t('aiAssistantConfig.colSort', { defaultValue: '排序' })}>
              <InputNumber min={0} max={9999} style={{ width: 120 }} />
            </Form.Item>
          </Space>
          <Form.Item name="aliases" label={t('aiAssistantConfig.colAliases', { defaultValue: '別名（逗號分隔）' })}>
            <Input maxLength={512} />
          </Form.Item>
          <Form.Item name="definition" label={t('aiAssistantConfig.colDefinition', { defaultValue: '定義' })} rules={[{ required: true }]}>
            <Input.TextArea rows={4} maxLength={1000} showCount />
          </Form.Item>
          <Form.Item name="formula" label={t('aiAssistantConfig.colFormula', { defaultValue: '口徑/公式' })}>
            <Input.TextArea rows={2} maxLength={512} showCount />
          </Form.Item>
          <Form.Item name="example" label={t('aiAssistantConfig.colExample', { defaultValue: '示例' })}>
            <Input.TextArea rows={2} maxLength={512} showCount />
          </Form.Item>
          <Form.Item name="promptVisible" label={t('aiAssistantConfig.colPromptVisible', { defaultValue: '注入 Prompt' })}>
            <Select
              options={[
                { value: 1, label: t('common.yes', { defaultValue: '是' }) },
                { value: 0, label: t('common.no', { defaultValue: '否' }) },
              ]}
              style={{ width: 160 }}
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}

/* ────────────────── 回答反馈（低分看板） ────────────────── */

export function FeedbackTab() {
  const { t } = useTranslation()
  const [rows, setRows] = useState<AiFeedbackRow[]>([])
  const [loading, setLoading] = useState(false)
  const [rating, setRating] = useState<'all' | 'up' | 'down'>('down')
  const [scope, setScope] = useAiScope('ai-feedback', 'all')
  const [stats, setStats] = useState<AiFeedbackStats | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    const value = rating === 'all' ? undefined : rating === 'up' ? 1 : -1
    fetchFeedback({ rating: value, limit: 100, systemCode: scope === 'all' ? undefined : scope })
      .then(setRows)
      .catch(() => message.error(t('aiAssistantConfig.loadFailed', { defaultValue: '加載失敗' })))
      .finally(() => setLoading(false))
  }, [rating, scope, t])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    fetchFeedbackStats(30, scope === 'all' ? undefined : scope)
      .then(setStats)
      .catch(() => setStats(null))
  }, [scope])

  const columns: ColumnsType<AiFeedbackRow> = [
    { title: t('aiAssistantConfig.colFeedbackTime', { defaultValue: '時間' }), dataIndex: 'createdAt', key: 'createdAt', width: 170,
      render: (v?: string | number) => formatDateTime(v) },
    {
      title: t('aiAssistantConfig.colRating', { defaultValue: '評分' }), dataIndex: 'rating', key: 'rating', width: 90,
      render: (v: number) => v === 1 ? <Tag color="success">讚</Tag> : <Tag color="error">踩</Tag>,
    },
    {
      title: t('aiAssistantConfig.colReason', { defaultValue: '原因' }), dataIndex: 'reason', key: 'reason', width: 130,
      render: (v: string | null) => v || '--',
    },
    {
      title: t('aiAssistantConfig.colAnswerPreview', { defaultValue: '回答摘要' }), dataIndex: 'answerPreview', key: 'answerPreview',
      ellipsis: true, render: (v: string | null) => v || '--',
    },
    {
      title: t('aiAssistantConfig.colToolKeys', { defaultValue: '工具' }), dataIndex: 'toolKeys', key: 'toolKeys',
      width: 220, ellipsis: true, render: (v: string | null) => v || '--',
    },
  ]

  return (
    <>
      <div className="search-section" style={{ marginBottom: 8 }}>
        <Space wrap>
          <Select
            aria-label="評分篩選"
            style={{ width: 160 }}
            value={rating}
            onChange={setRating}
            options={[
              { value: 'down', label: t('aiAssistantConfig.feedbackDown', { defaultValue: '只看踩' }) },
              { value: 'up', label: t('aiAssistantConfig.feedbackUp', { defaultValue: '只看讚' }) },
              { value: 'all', label: t('aiAssistantConfig.feedbackAll', { defaultValue: '全部' }) },
            ]}
          />
          <AiScopeSwitch value={scope} onChange={setScope} includeAll />
          <Button icon={<ReloadOutlined />} onClick={load}>{t('common.refresh', { defaultValue: '刷新' })}</Button>
        </Space>
      </div>
      <div className="action-section" style={{ marginBottom: 12 }}>
        <Space size={32} wrap>
          <Statistic title={t('aiAssistantConfig.statFeedbackTotal', { defaultValue: '近 30 天反饋' })} value={stats?.total ?? 0} />
          <Statistic title={t('aiAssistantConfig.statFeedbackUp', { defaultValue: '讚' })} value={stats?.up ?? 0} valueStyle={{ color: '#3f8600' }} />
          <Statistic title={t('aiAssistantConfig.statFeedbackDown', { defaultValue: '踩' })} value={stats?.down ?? 0} valueStyle={{ color: '#cf1322' }} />
          <Statistic title={t('aiAssistantConfig.statFeedbackRate', { defaultValue: '差評率' })} value={stats?.downRate ?? 0} suffix="%" />
        </Space>
        {((stats?.byTool?.length ?? 0) > 0 || (stats?.topReasons?.length ?? 0) > 0) && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
            <Table
              size="small"
              rowKey="toolKey"
              pagination={false}
              dataSource={stats?.byTool ?? []}
              columns={[
                { title: t('aiAssistantConfig.colLowTool', { defaultValue: '低分工具' }), dataIndex: 'toolKey' },
                { title: t('aiAssistantConfig.colCount', { defaultValue: '次數' }), dataIndex: 'count', width: 70 },
              ]}
            />
            <Table
              size="small"
              rowKey="reason"
              pagination={false}
              dataSource={stats?.topReasons ?? []}
              columns={[
                { title: t('aiAssistantConfig.colLowReason', { defaultValue: '低分原因' }), dataIndex: 'reason' },
                { title: t('aiAssistantConfig.colCount', { defaultValue: '次數' }), dataIndex: 'count', width: 70 },
              ]}
            />
          </div>
        )}
      </div>
      <Table
        rowKey="id"
        size="small"
        loading={loading}
        columns={columns}
        dataSource={rows}
        pagination={{ pageSize: 20, showSizeChanger: false }}
        scroll={{ x: 'max-content' }}
        locale={{ emptyText: t('aiAssistantConfig.feedbackEmpty', { defaultValue: '暫無反饋' }) }}
      />
    </>
  )
}

/* ────────────────── 知识库（RAG） ────────────────── */

export function KnowledgeTab() {
  const { t } = useTranslation()
  const [rows, setRows] = useState<AiKnowledgeDoc[]>([])
  const [loading, setLoading] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [scope, setScope] = useAiScope('ai-knowledge', 'all')
  const [editing, setEditing] = useState<AiKnowledgeDoc | null>(null)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm<AiKnowledgeDoc>()
  const [testQuery, setTestQuery] = useState('')
  const [testing, setTesting] = useState(false)
  const [hits, setHits] = useState<KnowledgeHit[] | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    fetchKnowledgeDocs({ keyword: keyword || undefined, systemCode: scope === 'all' ? undefined : scope })
      .then(setRows)
      .catch(() => message.error(t('aiAssistantConfig.loadFailed', { defaultValue: '加載失敗' })))
      .finally(() => setLoading(false))
  }, [keyword, scope, t])

  useEffect(() => { load() }, [load])

  const openEditor = async (row?: AiKnowledgeDoc) => {
    if (row?.id) {
      try {
        const detail = await fetchKnowledgeDoc(row.id)
        setEditing(detail)
        form.setFieldsValue(detail)
      } catch {
        message.error(t('aiAssistantConfig.loadFailed', { defaultValue: '加載失敗' }))
      }
      return
    }
    const blank: AiKnowledgeDoc = { title: '', systemCode: 'common', status: 'active', content: '' }
    setEditing(blank)
    form.setFieldsValue(blank)
  }

  const submit = async () => {
    const values = await form.validateFields()
    setSaving(true)
    try {
      await saveKnowledgeDoc({ ...editing, ...values })
      message.success(t('aiAssistantConfig.knowledgeSaved', { defaultValue: '已保存並重建分塊，30 秒內生效' }))
      setEditing(null)
      load()
    } catch (e) {
      message.error(e instanceof Error ? e.message : t('aiAssistantConfig.saveFailed', { defaultValue: '保存失敗' }))
    } finally {
      setSaving(false)
    }
  }

  const toggle = async (row: AiKnowledgeDoc) => {
    if (!row.id) return
    try {
      await setKnowledgeStatus(row.id, row.status === 'active' ? 'disabled' : 'active')
      load()
    } catch (e) {
      message.error(e instanceof Error ? e.message : t('aiAssistantConfig.saveFailed', { defaultValue: '保存失敗' }))
    }
  }

  const rebuild = async (row: AiKnowledgeDoc) => {
    if (!row.id) return
    try {
      const res = await rebuildKnowledge(row.id)
      message.success(t('aiAssistantConfig.knowledgeRebuilt', { defaultValue: '已重建 {{count}} 個分塊', count: res.chunks }))
      load()
    } catch (e) {
      message.error(e instanceof Error ? e.message : t('aiAssistantConfig.saveFailed', { defaultValue: '保存失敗' }))
    }
  }

  const remove = async (row: AiKnowledgeDoc) => {
    if (!row.id) return
    try {
      await deleteKnowledgeDoc(row.id)
      message.success(t('aiAssistantConfig.deleted', { defaultValue: '已刪除' }))
      load()
    } catch (e) {
      message.error(e instanceof Error ? e.message : t('aiAssistantConfig.saveFailed', { defaultValue: '保存失敗' }))
    }
  }

  const runSearch = async () => {
    const query = testQuery.trim()
    if (!query) return
    setTesting(true)
    try {
      setHits(await searchKnowledge({ query, systemCode: scope === 'all' ? undefined : scope, limit: 5 }))
    } catch (e) {
      message.error(e instanceof Error ? e.message : t('aiAssistantConfig.loadFailed', { defaultValue: '加載失敗' }))
    } finally {
      setTesting(false)
    }
  }

  const columns: ColumnsType<AiKnowledgeDoc> = [
    { title: t('aiAssistantConfig.colTitle', { defaultValue: '標題' }), dataIndex: 'title', key: 'title', width: 220, ellipsis: true },
    {
      title: t('aiAssistantConfig.colSystem', { defaultValue: '系統' }), dataIndex: 'systemCode', key: 'systemCode', width: 100,
      render: (v: string) => <Tag>{v}</Tag>,
    },
    {
      title: t('aiAssistantConfig.colStatus', { defaultValue: '狀態' }), dataIndex: 'status', key: 'status', width: 90,
      render: (v: string) => v === 'active' ? <Tag color="success">啟用</Tag> : <Tag>停用</Tag>,
    },
    { title: t('aiAssistantConfig.colChunks', { defaultValue: '分塊' }), dataIndex: 'chunkCount', key: 'chunkCount', width: 70 },
    {
      title: t('aiAssistantConfig.colUpdatedAt', { defaultValue: '更新時間' }), dataIndex: 'updatedAt', key: 'updatedAt', width: 170,
      render: (v?: string | number) => formatDateTime(v),
    },
    {
      title: t('common.action', { defaultValue: '操作' }), key: 'action', width: 250,
      render: (_: unknown, row: AiKnowledgeDoc) => (
        <Space size={0} wrap>
          <Button type="link" size="small" onClick={() => openEditor(row)}>{t('common.edit', { defaultValue: '編輯' })}</Button>
          <Button type="link" size="small" onClick={() => toggle(row)}>
            {row.status === 'active' ? t('common.disable', { defaultValue: '停用' }) : t('common.enable', { defaultValue: '啟用' })}
          </Button>
          <Button type="link" size="small" onClick={() => rebuild(row)}>{t('aiAssistantConfig.knowledgeRebuild', { defaultValue: '重建分塊' })}</Button>
          <Button type="link" size="small" danger
            onClick={() => confirmDelete({
              title: t('aiAssistantConfig.knowledgeDeleteConfirm', { defaultValue: '確認刪除這篇文檔？' }),
              content: '刪除後文檔及其分塊一併移除，助手將檢索不到該內容；不可恢復。',
              onOk: () => remove(row),
            })}>
            {t('common.delete', { defaultValue: '刪除' })}
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <>
      <div className="search-section" style={{ marginBottom: 8 }}>
        <Space wrap>
          <Input.Search
            allowClear
            style={{ width: 240 }}
            placeholder={t('aiAssistantConfig.knowledgeSearchPlaceholder', { defaultValue: '按標題搜索' })}
            onSearch={setKeyword}
          />
        </Space>
      </div>
      <div className="action-section" style={{ marginBottom: 12 }}>
        <div className="action-section-left">
          <AiScopeSwitch value={scope} onChange={setScope} includeAll />
        </div>
        <div className="action-section-right">
          <Button icon={<ReloadOutlined />} onClick={load}>{t('common.refresh', { defaultValue: '刷新' })}</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openEditor()}>{t('aiAssistantConfig.knowledgeAdd', { defaultValue: '新增文檔' })}</Button>
        </div>
      </div>
      <div className="action-section" style={{ marginBottom: 12 }}>
        <Space.Compact style={{ width: '100%' }}>
          <Input
            value={testQuery}
            onChange={(e) => setTestQuery(e.target.value)}
            onPressEnter={runSearch}
            placeholder={t('aiAssistantConfig.knowledgeTestPlaceholder', { defaultValue: '試搜：輸入用戶可能問的問題，檢查檢索命中' })}
          />
          <Button type="primary" icon={<SearchOutlined />} loading={testing} onClick={runSearch}>
            {t('aiAssistantConfig.knowledgeTest', { defaultValue: '試搜' })}
          </Button>
        </Space.Compact>
        {hits && (
          <div style={{ marginTop: 8 }}>
            {hits.length === 0 && <Alert type="warning" showIcon message={t('aiAssistantConfig.knowledgeTestEmpty', { defaultValue: '沒有命中；助手會如實說未收錄' })} />}
            {hits.map((hit) => (
              <div key={`${hit.docId}-${hit.chunkNo}`} style={{ padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
                <Space>
                  <Tag color="blue">{hit.systemCode}</Tag>
                  <b>{hit.title}</b>
                  <span style={{ color: '#8c8c8c' }}>{hit.score.toFixed(2)}</span>
                </Space>
                <div style={{ color: '#595959' }}>{hit.snippet}</div>
              </div>
            ))}
          </div>
        )}
      </div>
      <Table
        rowKey="id"
        size="small"
        loading={loading}
        columns={columns}
        dataSource={rows}
        pagination={{ pageSize: 20, showSizeChanger: false }}
        locale={{ emptyText: t('aiAssistantConfig.knowledgeEmpty', { defaultValue: '暫無知識庫文檔' }) }}
      />
      <Modal
        open={!!editing}
        title={editing?.id ? t('aiAssistantConfig.knowledgeEdit', { defaultValue: '編輯知識庫文檔' }) : t('aiAssistantConfig.knowledgeAdd', { defaultValue: '新增文檔' })}
        onCancel={() => setEditing(null)}
        onOk={submit}
        confirmLoading={saving}
        width={760}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Form.Item name="title" label={t('aiAssistantConfig.colTitle', { defaultValue: '標題' })} rules={[{ required: true, message: '請填寫標題' }]}>
            <Input maxLength={200} />
          </Form.Item>
          <Form.Item name="systemCode" label={t('aiAssistantConfig.colSystem', { defaultValue: '系統' })}>
            <Select options={KNOWLEDGE_SYSTEMS.map((s) => ({ value: s, label: s }))} />
          </Form.Item>
          <Form.Item name="content" label={t('aiAssistantConfig.knowledgeContent', { defaultValue: '正文' })} rules={[{ required: true, message: '請填寫正文' }]}>
            <Input.TextArea rows={12} maxLength={60000} showCount placeholder={t('aiAssistantConfig.knowledgeContentPlaceholder', { defaultValue: '粘貼規範/說明原文；保存時會自動切分為檢索分塊' })} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}

/* ────────────────── 合规护栏 ────────────────── */

export function GuardrailTab() {
  const { t } = useTranslation()
  const [rows, setRows] = useState<AiGuardRule[]>([])
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState<AiGuardRule | null>(null)
  const [saving, setSaving] = useState(false)
  const [scope, setScope] = useAiScope('ai-guardrail', 'all')
  const [form] = Form.useForm<AiGuardRule>()
  const action = Form.useWatch('action', form)

  const load = useCallback(() => {
    setLoading(true)
    fetchGuardRules(scope === 'all' ? undefined : scope)
      .then(setRows)
      .catch(() => message.error(t('aiAssistantConfig.loadFailed', { defaultValue: '加載失敗' })))
      .finally(() => setLoading(false))
  }, [scope, t])

  useEffect(() => { load() }, [load])

  const openEditor = (row?: AiGuardRule) => {
    const model: AiGuardRule = row ?? {
      ruleType: 'keyword', pattern: '', action: 'warn', scope: 'both', enabled: 1, replacement: '', remark: '',
      systemCode: scope === 'all' ? 'common' : scope,
    }
    setEditing(model)
    form.setFieldsValue(model)
  }

  const submit = async () => {
    const values = await form.validateFields()
    setSaving(true)
    try {
      await saveGuardRule({ ...editing, ...values })
      message.success(t('aiAssistantConfig.guardrailSaved', { defaultValue: '已保存，下一輪對話生效' }))
      setEditing(null)
      load()
    } catch (e) {
      message.error(e instanceof Error ? e.message : t('aiAssistantConfig.saveFailed', { defaultValue: '保存失敗' }))
    } finally {
      setSaving(false)
    }
  }

  const remove = async (row: AiGuardRule) => {
    if (!row.id) return
    try {
      await deleteGuardRule(row.id)
      message.success(t('aiAssistantConfig.deleted', { defaultValue: '已刪除' }))
      load()
    } catch (e) {
      message.error(e instanceof Error ? e.message : t('aiAssistantConfig.saveFailed', { defaultValue: '保存失敗' }))
    }
  }

  const ACTION_LABEL: Record<string, string> = { block: '攔截', warn: '提醒', replace: '替換' }
  const SCOPE_LABEL: Record<string, string> = { input: '輸入', output: '輸出', both: '輸入+輸出' }

  const columns: ColumnsType<AiGuardRule> = [
    { title: t('aiAssistantConfig.colRuleType', { defaultValue: '類型' }), dataIndex: 'ruleType', key: 'ruleType', width: 90 },
    {
      title: '所屬系統', dataIndex: 'systemCode', key: 'systemCode', width: 110,
      render: (v?: string) => <Tag>{v && v !== 'common' ? AI_SCOPE_OPTIONS.find(o => o.value === v)?.label ?? v : '共用'}</Tag>,
    },
    { title: t('aiAssistantConfig.colPattern', { defaultValue: '規則' }), dataIndex: 'pattern', key: 'pattern', width: 260, ellipsis: true },
    {
      title: t('aiAssistantConfig.colRuleAction', { defaultValue: '動作' }), dataIndex: 'action', key: 'action', width: 90,
      render: (v: string) => <Tag color={v === 'block' ? 'error' : v === 'replace' ? 'processing' : 'warning'}>{ACTION_LABEL[v] ?? v}</Tag>,
    },
    {
      title: t('aiAssistantConfig.colScope', { defaultValue: '範圍' }), dataIndex: 'scope', key: 'scope', width: 100,
      render: (v: string) => SCOPE_LABEL[v] ?? v,
    },
    {
      title: t('aiAssistantConfig.colStatus', { defaultValue: '狀態' }), dataIndex: 'enabled', key: 'enabled', width: 90,
      render: (v: number) => v === 1 ? <Tag color="success">啟用</Tag> : <Tag>停用</Tag>,
    },
    { title: t('aiAssistantConfig.colRemark', { defaultValue: '備註' }), dataIndex: 'remark', key: 'remark', width: 160, ellipsis: true },
    {
      title: t('common.action', { defaultValue: '操作' }), key: 'action2', width: 130,
      render: (_: unknown, row: AiGuardRule) => (
        <Space size={0}>
          <Button type="link" size="small" onClick={() => openEditor(row)}>{t('common.edit', { defaultValue: '編輯' })}</Button>
          <Button type="link" size="small" danger
            onClick={() => confirmDelete({
              title: t('aiAssistantConfig.guardrailDeleteConfirm', { defaultValue: '確認刪除這條規則？' }),
              content: '刪除後該規則立即失效，後續對話不再被它攔截；不可恢復。',
              onOk: () => remove(row),
            })}>
            {t('common.delete', { defaultValue: '刪除' })}
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 8 }}
        message={t('aiAssistantConfig.guardrailHint', {
          defaultValue: '輸入命中「攔截」時不調模型；「替換」會改寫後繼續；輸出命中「攔截」時用安全話術替換整段回答。',
        })}
      />
      <div className="action-section" style={{ marginBottom: 12 }}>
        <div className="action-section-left">
          <AiScopeSwitch value={scope} onChange={setScope} includeAll />
        </div>
        <div className="action-section-right">
          <Button icon={<ReloadOutlined />} onClick={load}>{t('common.refresh', { defaultValue: '刷新' })}</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openEditor()}>{t('aiAssistantConfig.guardrailAdd', { defaultValue: '新增規則' })}</Button>
        </div>
      </div>
      <Table
        rowKey="id"
        size="small"
        loading={loading}
        columns={columns}
        dataSource={rows}
        pagination={{ pageSize: 20, showSizeChanger: false }}
        locale={{ emptyText: t('aiAssistantConfig.guardrailEmpty', { defaultValue: '暫無護欄規則（未配置時不攔截任何內容）' }) }}
      />
      <Modal
        open={!!editing}
        title={editing?.id ? t('aiAssistantConfig.guardrailEdit', { defaultValue: '編輯護欄規則' }) : t('aiAssistantConfig.guardrailAdd', { defaultValue: '新增規則' })}
        onCancel={() => setEditing(null)}
        onOk={submit}
        confirmLoading={saving}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Form.Item name="ruleType" label={t('aiAssistantConfig.colRuleType', { defaultValue: '類型' })}>
            <Select options={[{ value: 'keyword', label: '關鍵詞' }, { value: 'regex', label: '正則' }]} />
          </Form.Item>
          <Form.Item name="pattern" label={t('aiAssistantConfig.colPattern', { defaultValue: '規則' })} rules={[{ required: true, message: '請填寫關鍵詞或正則' }]}>
            <Input maxLength={500} placeholder="例如：競品名 / 1[3-9]\\d{9}" />
          </Form.Item>
          <Form.Item name="action" label={t('aiAssistantConfig.colRuleAction', { defaultValue: '動作' })}>
            <Select options={[{ value: 'warn', label: '提醒' }, { value: 'block', label: '攔截' }, { value: 'replace', label: '替換' }]} />
          </Form.Item>
          <Form.Item name="scope" label={t('aiAssistantConfig.colScope', { defaultValue: '範圍' })}>
            <Select options={[{ value: 'both', label: '輸入+輸出' }, { value: 'input', label: '僅輸入' }, { value: 'output', label: '僅輸出' }]} />
          </Form.Item>
          <Form.Item name="systemCode" label="所屬系統" extra="共用規則對所有系統生效；系統規則只攔截該系統的對話">
            <Select options={AI_SCOPE_OPTIONS.map(o => ({ value: o.value, label: o.label }))} />
          </Form.Item>
          {action === 'replace' && (
            <Form.Item name="replacement" label={t('aiAssistantConfig.colReplacement', { defaultValue: '替換為' })}>
              <Input maxLength={200} placeholder={t('aiAssistantConfig.replacementPlaceholder', { defaultValue: '留空則替換為 ***' })} />
            </Form.Item>
          )}
          <Form.Item name="enabled" label={t('aiAssistantConfig.colStatus', { defaultValue: '狀態' })} valuePropName="checked" getValueFromEvent={(checked: boolean) => (checked ? 1 : 0)}>
            <Switch checkedChildren="啟用" unCheckedChildren="停用" />
          </Form.Item>
          <Form.Item name="remark" label={t('aiAssistantConfig.colRemark', { defaultValue: '備註' })}>
            <Input maxLength={200} placeholder={t('aiAssistantConfig.remarkPlaceholder', { defaultValue: '給業務看的說明，例如“競品名稱不得出現在回答中”' })} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}
