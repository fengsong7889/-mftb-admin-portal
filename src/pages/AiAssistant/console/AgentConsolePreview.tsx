import { useMemo, useState, type ReactNode } from 'react'
import { Alert, AutoComplete, Button, Descriptions, Form, Input, InputNumber, Modal, Progress, Segmented, Select, Space, Steps, Table, Tabs, Tag, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  AppstoreOutlined, CloudServerOutlined, DashboardOutlined, DatabaseOutlined, ExperimentOutlined,
  PlayCircleOutlined, SafetyCertificateOutlined, ThunderboltOutlined,
} from '@ant-design/icons'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import i18n from '@/i18n'
import { useAuth } from '@/contexts/AuthContext'

/** 模組級翻譯：父層語言切換會重渲染，子元件重新計算即可。 */
const tr = (key: string, zh: string) => i18n.t(key, { defaultValue: zh })
import HelpPopover from '@/components/HelpPopover'
import StatCards from '@/components/StatCards'
import { useColumnConfig } from '@/hooks/useColumnConfig'
import AiAssistantPageShell from '../PageShell'
import {
  BLOCKING_LABELS, CONSOLE_PANES,
  readinessOf, usageRate,
  type ActionState, type ConsolePane, type DemoRun,
} from '@mftb/contracts/aiConsoleModel'
import { fetchActions, fetchApplications, fetchBudgetPools, fetchDataClasses, fetchEndpoints, fetchPlatformModels, fetchPlatformSystems, fetchRuns } from '@/api/agentPlatform'
import type { AgentActionRow, AgentApplicationRow, AgentBudgetPoolRow, AgentDataClassRow, AgentEndpointRow, AgentRunRow } from '@/api/agentPlatform'
import { approveAction, approveEndpoint, createApplicationVersion, executeAction, publishApplication, saveApplication, saveBudgetPool, saveDataClass, fetchEvalCases, fetchKnowledgeAcl, fetchReleases, fetchRunDetail, fetchReadiness, grantKnowledgeAcl, revokeKnowledgeAcl, runEval } from '@/api/agentPlatform'
import type { AgentAclRow, AgentEvalCaseRow, AgentReleaseRow } from '@/api/agentPlatform'
import { fetchKnowledgeDocs } from '@/api/aiKnowledge'
import { AI_MENU_ENTRY_COUNT, AI_MENU_MAP } from './aiMenuMap'
import { useConsoleRemote } from './useConsoleRemote'
import './console.css'

const PANE_ICONS: Record<ConsolePane, ReactNode> = {
  overview: <DashboardOutlined />, apps: <AppstoreOutlined />, budget: <ThunderboltOutlined />,
  actions: <SafetyCertificateOutlined />, knowledge: <DatabaseOutlined />, data: <CloudServerOutlined />,
  runs: <PlayCircleOutlined />, evaluation: <ExperimentOutlined />,
}

function actionTag(status: ActionState) {
  switch (status) {
    case 'pending': return { color: 'orange', text: tr('agentConsole.s30', '待審批') }
    case 'approved': return { color: 'blue', text: tr('agentConsole.s28', '已通過 · 待執行') }
    case 'executed': return { color: 'green', text: tr('agentConsole.s21', '已執行') }
    default: return { color: 'volcano', text: tr('agentConsole.s70', '結果待核實') }
  }
}

function runTag(status: DemoRun['status']) {
  switch (status) {
    case 'queued': return { color: 'default', text: tr('agentConsole.s39', '排隊中') }
    case 'running': return { color: 'processing', text: tr('agentConsole.s13', '執行中') }
    case 'succeeded': return { color: 'success', text: tr('agentConsole.s22', '已完成') }
    default: return { color: 'warning', text: tr('agentConsole.s70', '結果待核實') }
  }
}

/** 後端時間欄位是 epoch 毫秒，直接輸出不可讀；非數字原樣返回。 */
function fmtTs(value: unknown) {
  const raw = String(value ?? '')
  if (!/^\d{10,13}$/.test(raw)) return raw || '—'
  const ms = raw.length === 10 ? Number(raw) * 1000 : Number(raw)
  return new Date(ms).toLocaleString('zh-TW', { hour12: false })
}

function paginationConfig(total: number) {
  return {
    pageSize: 5,
    showSizeChanger: true,
    showQuickJumper: true,
    pageSizeOptions: ['5', '10', '20'],
    showTotal: (count: number) => `共 ${count} 條`,
    hideOnSinglePage: total <= 5,
  }
}

function ReadinessPanel() {
  const [demoEmpty, setDemoEmpty] = useState(false)
  const readiness = useConsoleRemote(() => fetchReadiness(), [])
  const blocking = demoEmpty
    ? readinessOf({ dataClasses: 0, approvedEndpoints: 0, acls: 0, publishedApps: 0 }).blocking
    : (readiness.data?.blocking ?? [])

  return <>
    <div className="agent-console__toolbar">
      <Segmented aria-label="就緒狀態模擬" value={demoEmpty ? 'empty' : 'real'} onChange={value => setDemoEmpty(value === 'empty')}
        options={[{ label: tr('agentConsole.s15', '實際配置'), value: 'real' }, { label: tr('agentConsole.s84', '預覽：全新環境'), value: 'empty' }]} />
      <HelpPopover title="就緒判斷口徑" ariaLabel="就緒判斷說明"
        content={tr('agentConsole.h10', '數據來自 GET /agent/platform/ops/readiness。\n缺任一項時，模型調用或知識檢索會被明確拒絕，而不是「靜默返回空結果」。')} />
    </div>
    {readiness.loading ? (
      <Alert type="info" showIcon message="正在讀取就緒狀態…" description="就緒未確認前不應視為放行。" />
    ) : readiness.error ? (
      <Alert type="error" showIcon message="就緒狀態加載失敗，視為未就緒" description={readiness.error} />
    ) : blocking.length === 0 ? (
      <Alert type="success" showIcon message="模型調用與知識檢索的就緒條件已滿足"
        description="仍需在每次執行時複查急停、授權、額度、出域與會話歸屬；就緒不等於放行。" />
    ) : (
      <Alert type="warning" showIcon message={`尚缺 ${blocking.length} 項配置，相關能力會被拒絕`}
        description={<ul className="agent-console__blocking">{blocking.map(key => <li key={key}>{BLOCKING_LABELS[key] ?? key}</li>)}</ul>} />
    )}
    <Descriptions className="agent-console__spaced" column={4} size="small" items={[
      { key: 'class', label: tr('agentConsole.s20', '已分級系統'), children: `${readiness.data?.counts.dataClasses ?? 0} 個` },
      { key: 'endpoint', label: tr('agentConsole.s23', '已批准端點'), children: `${readiness.data?.counts.approvedEndpoints ?? 0} 個` },
      { key: 'acl', label: tr('agentConsole.s64', '知識 ACL'), children: `${readiness.data?.counts.knowledgeAcls ?? 0} 份` },
      { key: 'app', label: tr('agentConsole.s25', '已發布應用'), children: `${readiness.data?.counts.publishedApplications ?? 0} 個` },
    ]} />
    <div className="agent-console__spaced">
      <h4>上線順序（不可跳步）</h4>
      <Steps size="small" current={readiness.data?.readyForModelCalls ? 3 : blocking.length === 0 ? 2 : 0} items={[
        { title: tr('agentConsole.s59', '登記資料分級'), description: '業務負責人確認每個系統的等級' },
        { title: tr('agentConsole.s34', '批准模型端點'), description: tr('agentConsole.h19', '等級 + 駐留 + 有效期，到期自動失效') },
        { title: tr('agentConsole.s61', '發布應用版本'), description: tr('agentConsole.s08', '凍結工具白名單與知識範圍') },
        { title: tr('agentConsole.s82', '開啟執行器'), description: tr('agentConsole.s09', '前端接線且前兩項就緒後再開') },
      ]} />
    </div>
  </>
}

function AppsPane() {
  const { data, loading, error, reload } = useConsoleRemote(() => fetchApplications(), [])
  const [appOpen, setAppOpen] = useState(false)
  const [verRow, setVerRow] = useState<AgentApplicationRow | null>(null)
  const [saving, setSaving] = useState(false)
  const [appForm] = Form.useForm()
  const [verForm] = Form.useForm()
  const createApp = async () => {
    const v = await appForm.validateFields()
    setSaving(true)
    try {
      await saveApplication({ appKey: v.appKey, name: v.name, systemCode: v.systemCode, ownerName: v.ownerName })
      message.success(tr('agentConsole.form.appSaved', '應用已登記'))
      setAppOpen(false); appForm.resetFields(); reload()
    } catch { /* request.ts 已统一提示 */ } finally { setSaving(false) }
  }
  const publishVersion = async () => {
    if (!verRow) return
    const v = await verForm.validateFields()
    setSaving(true)
    try {
      const tools = String(v.tools || '').split(',').map((x: string) => x.trim()).filter(Boolean)
      const created: Record<string, unknown> = await createApplicationVersion(verRow.key, { toolWhitelist: tools, knowledgeScope: [] })
      const versionNo = Number(created?.version_no ?? created?.versionNo ?? 1)
      await publishApplication(verRow.key, versionNo, v.note)
      message.success(`已發布 v${versionNo}`)
      setVerRow(null); verForm.resetFields(); reload()
    } catch { /* request.ts 已统一提示 */ } finally { setSaving(false) }
  }
  const rows = data ?? []
  const columns: ColumnsType<AgentApplicationRow> = [
    {
      key: 'name', title: tr('agentConsole.s32', '應用'),
      render: (_, row) => <>
        <b>{row.name}</b>
        <div className="agent-console__muted">{row.key} · {row.system}</div>
      </>,
    },
    { key: 'owner', title: tr('agentConsole.s78', tr('agentConsole.form.owner', '負責人')), dataIndex: 'owner', width: 180 },
    {
      key: 'version', title: tr('agentConsole.s55', '生產版本'), width: 120,
      render: (_, row) => row.publishedVersion > 0 ? <Tag color="green">v{row.publishedVersion}</Tag> : <Tag>未發布</Tag>,
    },
    {
      key: 'tools', title: tr('agentConsole.s18', '工具白名單'), width: 240,
      render: (_, row) => row.tools.length
        ? row.tools.map(tool => <Tag key={tool}>{tool}</Tag>)
        : <span className="agent-console__muted">—</span>,
    },
    {
      key: 'state', title: tr('agentConsole.s54', '狀態'), width: 120,
      render: (_, row) => row.state === 'published' ? <Tag color="green">已發布</Tag> : <Tag color="orange">草稿</Tag>,
    },
    {
      key: 'ops', title: tr('agentConsole.form.actions', '操作'), width: 140,
      render: (_, row) => <Button type="link" size="small" onClick={() => setVerRow(row)}>{tr('agentConsole.form.publishVersion', '發布新版本')}</Button>,
    },
  ]
  const meta = [
    { key: 'name', title: tr('agentConsole.s32', '應用') }, { key: 'owner', title: tr('agentConsole.s78', tr('agentConsole.form.owner', '負責人')) }, { key: 'version', title: tr('agentConsole.s55', '生產版本') },
    { key: 'tools', title: tr('agentConsole.s18', '工具白名單') }, { key: 'state', title: tr('agentConsole.s54', '狀態') },
    { key: 'ops', title: tr('agentConsole.form.actions', '操作') },
  ]
  const { applyConfig, configComponent } = useColumnConfig('ai-console-apps', meta, [
    { key: 'name', visible: true, locked: 'head' as const },
    { key: 'state', visible: true, locked: 'tail' as const },
  ])

  return <section className="agent-console__card">
    <h3>應用與版本<HelpPopover title="應用是授權主線" ariaLabel="應用與版本說明" content={[
      { tone: 'info', label: tr('agentConsole.s53', '版本凍結'), body: tr('agentConsole.h18', '發布後不再改版本內容；改工具或知識範圍請發新版本，回滾等於重新指向舊版本。') },
      { tone: 'warn', label: tr('agentConsole.s66', '空白名單'), body: tr('agentConsole.h12', '未發布或白名單為空的應用，不會下發任何業務工具。') },
    ]} /></h3>
    {error && <Alert type="error" showIcon message="應用列表加載失敗" description={error} />}
    <div className="action-section"><div className="action-section-left"><Tag>{tr('agentConsole.wired', '接口數據')}</Tag><Button type="primary" size="small" onClick={() => setAppOpen(true)}>{tr('agentConsole.form.addApp', '新增應用')}</Button></div><div className="action-section-right">{configComponent}</div></div>
    <Table rowKey="key" size="middle" loading={loading} columns={applyConfig(columns)} dataSource={rows} scroll={{ x: 'max-content' }}
      pagination={paginationConfig(rows.length)} />
    <Modal open={appOpen} title={tr('agentConsole.form.addAppTitle', '新增應用')} onCancel={() => setAppOpen(false)} onOk={createApp} confirmLoading={saving} okText={tr('agentConsole.form.save', '保存')} destroyOnClose>
      <Form form={appForm} layout="vertical" initialValues={{ systemCode: 'ai' }}>
        <Form.Item name="appKey" label={tr('agentConsole.form.appKey', '應用標識')} rules={[{ required: true, pattern: /^[a-z][a-z0-9-]{2,63}$/, message: tr('agentConsole.form.appKeyHint', '3-64 位小寫字母/數字/連字號，字母開頭') }]}>
          <Input placeholder={tr('agentConsole.form.phAppKey', '例如 order-assistant')} />
        </Form.Item>
        <Form.Item name="name" label={tr('agentConsole.form.appName', '應用名稱')} rules={[{ required: true, max: 128 }]}><Input /></Form.Item>
        <Form.Item name="systemCode" label={tr('agentConsole.form.systemCode', '歸屬系統')} rules={[{ required: true }]}><Input /></Form.Item>
        <Form.Item name="ownerName" label={tr('agentConsole.form.owner', '負責人')}><Input /></Form.Item>
      </Form>
    </Modal>
    <Modal open={!!verRow} title={`${tr('agentConsole.form.publishVersion', '發布新版本')} · ${verRow?.key ?? ''}`} onCancel={() => setVerRow(null)} onOk={publishVersion} confirmLoading={saving} okText={tr('agentConsole.form.publishNow', '建立並發布')} destroyOnClose>
      <Form form={verForm} layout="vertical">
        <Form.Item name="tools" label={tr('agentConsole.form.tools', '工具白名單（逗號分隔）')} extra={tr('agentConsole.form.toolsHint', '留空則該版本不下發任何業務工具')}>
          <Input placeholder={tr('agentConsole.form.phTools', 'rdm.project.summary, query_approvals')} />
        </Form.Item>
        <Form.Item name="note" label={tr('agentConsole.form.releaseNote', '發布說明')}><Input /></Form.Item>
      </Form>
    </Modal>
  </section>
}

function BudgetPane() {
  const { data, loading, error, reload } = useConsoleRemote(() => fetchBudgetPools(), [])
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm()
  const submit = async () => {
    const v = await form.validateFields()
    setSaving(true)
    try {
      await saveBudgetPool({ scopeType: v.scopeType, scopeKey: v.scopeKey, period: v.period, limitAmount: v.limitAmount })
      message.success(tr('agentConsole.form.poolSaved', '預算池已保存（同範圍同週期為覆蓋）'))
      setOpen(false); form.resetFields(); reload()
    } catch { /* request.ts 已统一提示 */ } finally { setSaving(false) }
  }
  const rows: AgentBudgetPoolRow[] = (data ?? []).map(item => ({ ...item, scopeLabel: item.scopeLabel }))
  const columns: ColumnsType<AgentBudgetPoolRow> = [
    { key: 'scope', title: tr('agentConsole.s67', '範圍'), render: (_, row) => <><b>{row.scopeLabel}</b><div className="agent-console__muted">{row.scopeType} · {row.period}</div></> },
    { key: 'limit', title: tr('agentConsole.s01', tr('agentConsole.form.limit', '上限')), width: 120, render: (_, row) => `${row.limit.toLocaleString()} ${row.currency}` },
    { key: 'reserved', title: tr('agentConsole.s29', '已預占'), width: 120, render: (_, row) => row.reserved.toLocaleString() },
    { key: 'used', title: tr('agentConsole.s26', '已結算'), width: 120, render: (_, row) => row.used.toLocaleString() },
    {
      key: 'rate', title: tr('agentConsole.s03', '使用率'), width: 220,
      render: (_, row) => {
        const rate = usageRate(row)
        return <Progress percent={rate} size="small" strokeColor={rate >= 90 ? '#FF4D4F' : '#E8720C'} />
      },
    },
    { key: 'gate', title: tr('agentConsole.s06', '准入'), width: 180, render: (_, row) => usageRate(row) >= 100 ? <Tag color="red">拒絕新預占</Tag> : <Tag color="green">可預占</Tag> },
  ]
  const meta = [
    { key: 'scope', title: tr('agentConsole.s67', '範圍') }, { key: 'limit', title: tr('agentConsole.s01', tr('agentConsole.form.limit', '上限')) }, { key: 'reserved', title: tr('agentConsole.s29', '已預占') },
    { key: 'used', title: tr('agentConsole.s26', '已結算') }, { key: 'rate', title: tr('agentConsole.s03', '使用率') }, { key: 'gate', title: tr('agentConsole.s06', '准入') },
  ]
  const { applyConfig, configComponent } = useColumnConfig('ai-console-pools', meta, [
    { key: 'scope', visible: true, locked: 'head' as const },
    { key: 'gate', visible: true, locked: 'tail' as const },
  ])

  return <section className="agent-console__card">
    <h3>預算池與原子准入<HelpPopover title="為什麼不是「先查再寫」" ariaLabel="預算原子性說明" content={[
      { tone: 'info', label: tr('agentConsole.s00', '一條 SQL 裁決'), body: tr('agentConsole.h05', '已結算 + 已預占 + 本次估算 ≤ 上限，由條件更新一次完成。') },
      { tone: 'warn', label: tr('agentConsole.s50', '未配置=沿用既有額度'), body: tr('agentConsole.h15', '沒有預算池時由既有部門/員工額度策略判定；配置後池即硬上限。') },
      { tone: 'danger', label: tr('agentConsole.s35', '拒絕即不調用'), body: tr('agentConsole.h22', '預占失敗直接返回，不先調模型再補記帳。') },
    ]} /></h3>
    {error && <Alert type="error" showIcon message="預算池加載失敗" description={error} />}
    {/* 用户反馈「配额管理」与「预算与配额」分不清：本页只讲金额预占/结算，并如实标出当前生效范围 */}
    <Alert type="warning" showIcon className="agent-console__spaced"
      message={tr('agentConsole.budgetScopeTitle', '當前生效範圍：員工 + 自然月')}
      description={tr('agentConsole.budgetScopeDesc', '金額預算只做「調用前預占、調用後結算」，不授予模型權限，也不替代員工/部門的 Tokens 與次數額度，兩者同時生效；未配置預算池時由既有額度策略判定。部門/應用範圍可先登記，但當前扣賬鏈路尚未按它們生效，不要把它當成已生效的部門總預算。')} />
    <div className="action-section"><div className="action-section-left"><Tag>{tr('agentConsole.wired', '接口數據')}</Tag><Button type="primary" size="small" onClick={() => setOpen(true)}>{tr('agentConsole.form.addPool', '新增預算池')}</Button></div><div className="action-section-right">{configComponent}</div></div>
    <Table rowKey="key" size="middle" loading={loading} columns={applyConfig(columns)} dataSource={rows} scroll={{ x: 'max-content' }}
      pagination={paginationConfig(rows.length)} />
    <Modal open={open} title={tr('agentConsole.form.poolTitle', '新增 / 調整預算池')} onCancel={() => setOpen(false)} onOk={submit} confirmLoading={saving} okText={tr('agentConsole.form.save', '保存')} destroyOnClose>
      <Form form={form} layout="vertical" initialValues={{ scopeType: 'USER', period: new Date().toISOString().slice(0, 7) }}>
        <Form.Item name="scopeType" label={tr('agentConsole.form.scopeType', '範圍類型')} rules={[{ required: true }]}>
          <Select options={[{ value: 'USER', label: 'USER ' + tr('agentConsole.form.scopeUser', '員工') }, { value: 'DEPT', label: 'DEPT ' + tr('agentConsole.form.scopeDept', '部門') }, { value: 'APP', label: 'APP ' + tr('agentConsole.form.scopeApp', '應用') }]} />
        </Form.Item>
        <Form.Item name="scopeKey" label={tr('agentConsole.form.scopeKey', '範圍標識')} rules={[{ required: true, max: 64 }]}><Input placeholder={tr('agentConsole.form.phScopeKey', '工號 / 部門碼 / appKey')} /></Form.Item>
        <Form.Item name="period" label={tr('agentConsole.form.period', '週期')} rules={[{ required: true, pattern: /^\d{4}-\d{2}$|^ALL$/, message: tr('agentConsole.form.periodHint', 'YYYY-MM 或 ALL') }]}><Input /></Form.Item>
        <Form.Item name="limitAmount" label={tr('agentConsole.form.limit', '上限')} rules={[{ required: true }]}><InputNumber min={0} precision={2} style={{ width: '100%' }} /></Form.Item>
      </Form>
    </Modal>
  </section>
}

function ActionsPane() {
  const [status, setStatus] = useState<'all' | ActionState>('all')
  const { data, loading, error, reload } = useConsoleRemote(() => fetchActions(), [])
  const [busy, setBusy] = useState<string | null>(null)
  const approve = async (row: AgentActionRow) => {
    setBusy(row.key)
    try { await approveAction(row.key, `ui-${Date.now()}`); message.success(tr('agentConsole.form.approved', '已通過審批')); reload() }
    catch { /* request.ts 已统一提示 */ } finally { setBusy(null) }
  }
  const execute = async (row: AgentActionRow) => {
    setBusy(row.key)
    try {
      const result: Record<string, unknown> = await executeAction(row.key)
      message.success(result?.success === false ? tr('agentConsole.form.executedFailed', '工具返回錯誤，已寫回執') : tr('agentConsole.form.executedReceipt', '已執行並寫回執'))
      reload()
    } catch { /* request.ts 已统一提示 */ } finally { setBusy(null) }
  }
  const rows: AgentActionRow[] = (data ?? []).filter(item => status === 'all' || item.status === status)
  const columns: ColumnsType<AgentActionRow> = [
    { key: 'no', title: tr('agentConsole.s41', '提案號'), width: 190, render: (_, row) => <><b>{row.key}</b><div className="agent-console__muted">{row.tool}</div></> },
    { key: 'target', title: tr('agentConsole.s63', '目標與影響'), render: (_, row) => <><div>{row.target}</div><div className="agent-console__muted">{row.impact}</div></> },
    { key: 'requester', title: tr('agentConsole.s57', '申請人'), dataIndex: 'requester', width: 150 },
    { key: 'status', title: tr('agentConsole.s54', '狀態'), width: 160, render: (_, row) => <Tag color={actionTag(row.status).color}>{actionTag(row.status).text}</Tag> },
    { key: 'approval', title: tr('agentConsole.s16', '審批引用'), width: 170, render: (_, row) => row.approvalRef ?? <span className="agent-console__muted">—</span> },
    { key: 'expires', title: tr('agentConsole.s48', '有效期至'), width: 170, render: (_, row) => fmtTs(row.expiresAt) },
    {
      key: 'ops', title: tr('agentConsole.form.actions', '操作'), width: 160,
      render: (_, row) => row.status === 'pending'
        ? <Button type="link" size="small" loading={busy === row.key} onClick={() => approve(row)}>{tr('agentConsole.form.approve', '通過')}</Button>
        : row.status === 'approved'
          ? <Button type="link" size="small" loading={busy === row.key} onClick={() => execute(row)}>{tr('agentConsole.form.execute', '執行')}</Button>
          : <span className="agent-console__muted">—</span>,
    },
  ]
  const meta = [
    { key: 'no', title: tr('agentConsole.s41', '提案號') }, { key: 'target', title: tr('agentConsole.s63', '目標與影響') }, { key: 'requester', title: tr('agentConsole.s57', '申請人') },
    { key: 'status', title: tr('agentConsole.s54', '狀態') }, { key: 'approval', title: tr('agentConsole.s16', '審批引用') },
    { key: 'expires', title: tr('agentConsole.s48', '有效期至') }, { key: 'ops', title: tr('agentConsole.form.actions', '操作') },
  ]
  const { applyConfig, configComponent } = useColumnConfig('ai-console-actions', meta, [
    { key: 'no', visible: true, locked: 'head' as const },
    { key: 'ops', visible: true, locked: 'tail' as const },
  ])

  return <section className="agent-console__card">
    <h3>動作提案與一次性消費<HelpPopover title="審批綁定的是這一份參數" ariaLabel="動作提案說明" content={[
      { tone: 'info', label: tr('agentConsole.s07', '凍結內容'), body: tr('agentConsole.h17', '申請人、工具與版本、參數哈希、目標資源版本、影響範圍、到期時間、冪等鍵。') },
      { tone: 'warn', label: tr('agentConsole.s10', '參數變了就要重批'), body: tr('agentConsole.h04', '執行前比對參數哈希與資源版本；不一致、過期、已消費或非本人一律拒絕。') },
      { tone: 'danger', label: tr('agentConsole.s71', '結果未知不重發'), body: tr('agentConsole.h16', '渠道超時可能已送達，標記「待核實」，人工對賬後才能改終態。') },
    ]} /></h3>
    {error && <Alert type="error" showIcon message="提案列表加載失敗" description={error} />}
    <div className="search-section">
      <Segmented aria-label="提案狀態篩選" value={status} onChange={value => setStatus(value as typeof status)}
        options={[
          { label: tr('agentConsole.s05', '全部'), value: 'all' }, { label: tr('agentConsole.s30', tr('agentConsole.form.pending', '待審批')), value: 'pending' },
          { label: tr('agentConsole.s27', '已通過'), value: 'approved' }, { label: tr('agentConsole.form.executed', '已執行'), value: 'executed' },
          { label: tr('agentConsole.s31', '待核實'), value: 'unknown' },
        ]} />
    </div>
    <div className="action-section"><div className="action-section-left"><Tag>{tr('agentConsole.wired', '接口數據')}</Tag></div><div className="action-section-right">{configComponent}</div></div>
    <Table rowKey="key" size="middle" loading={loading} columns={applyConfig(columns)} dataSource={rows} scroll={{ x: 'max-content' }}
      pagination={paginationConfig(rows.length)} />
  </section>
}

function KnowledgeAclPane() {
  const docs = useConsoleRemote(() => fetchKnowledgeDocs(), [])
  const [docId, setDocId] = useState<number | null>(null)
  const [subjectType, setSubjectType] = useState('ROLE_CODE')
  const [subjectId, setSubjectId] = useState('user')
  const [granting, setGranting] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const acl = useConsoleRemote(() => docId === null ? Promise.resolve([] as AgentAclRow[]) : fetchKnowledgeAcl(docId), [docId])

  const docOptions = (docs.data ?? []).map(doc => ({ label: `${doc.title}（${doc.systemCode}）`, value: doc.id }))
  const grant = () => {
    if (docId === null) { setNotice(tr('agentConsole.s77', '請先選擇文檔')); return }
    setGranting(true)
    grantKnowledgeAcl(docId, subjectType, subjectId)
      .then(() => { setNotice(tr('agentConsole.s38', '授權已提交')); acl.reload() })
      .catch((cause: unknown) => setNotice(cause instanceof Error ? cause.message : tr('agentConsole.s37', '授權失敗')))
      .finally(() => setGranting(false))
  }
  const revoke = (subject: string) => {
    if (docId === null) return
    const [type, id] = subject.split(':')
    revokeKnowledgeAcl(docId, type, id)
      .then(() => { setNotice(tr('agentConsole.s24', '已撤銷')); acl.reload() })
      .catch((cause: unknown) => setNotice(cause instanceof Error ? cause.message : tr('agentConsole.s43', '撤銷失敗')))
  }

  const aclColumns: ColumnsType<AgentAclRow> = [
    { key: 'doc', title: tr('agentConsole.s47', '文檔'), width: 240, render: (_, row) => <><b>{row.title}</b><div className="agent-console__muted">{row.doc}</div></> },
    { key: 'subjects', title: tr('agentConsole.s36', '授權主體'), dataIndex: 'subjects' },
    { key: 'state', title: tr('agentConsole.s54', '狀態'), width: 110, render: (_, row) => <Tag color="green">{row.state}</Tag> },
    { key: 'action', title: tr('agentConsole.s45', tr('agentConsole.form.actions', '操作')), width: 130, render: (_, row) => <Button type="link" size="small" onClick={() => revoke(row.subjects)}>撤銷</Button> },
  ]

  return <section className="agent-console__card">
    <h3>知識文檔授權（ACL）<HelpPopover title="沒有 ACL 就不能檢索" ariaLabel="知識 ACL 說明" content={[
      { tone: 'info', label: 'fail-closed', body: tr('agentConsole.h11', '文檔沒有匹配的授權行時不參與檢索、不返回標題、片段、計數或排名。') },
      { tone: 'warn', label: tr('agentConsole.s69', '系統標籤不是授權'), body: tr('agentConsole.h00', 'systemCode、啟用狀態、上傳人、管理員身份都不能代替 ACL。') },
      { tone: 'danger', label: tr('agentConsole.s42', '撤權立即生效'), body: tr('agentConsole.h07', '撤權後下一次檢索即不可見，不依賴重新索引。') },
    ]} /></h3>
    <div className="search-section">
      <label>選擇文檔
        <Select aria-label="選擇知識文檔" style={{ minWidth: 280 }} placeholder="選擇後查看授權"
          loading={docs.loading} value={docId ?? undefined} onChange={value => setDocId(value)}
          options={docOptions} showSearch optionFilterProp="label" />
      </label>
      <label>主體類型
        <Select aria-label="授權主體類型" style={{ width: 150 }} value={subjectType} onChange={setSubjectType}
          options={['USER', 'DEPT', 'ROLE', 'ROLE_CODE'].map(value => ({ label: value, value }))} />
      </label>
      <label>主體標識
        <Input aria-label="授權主體標識" style={{ width: 160 }} value={subjectId} onChange={event => setSubjectId(event.target.value)} />
      </label>
      <Button type="primary" loading={granting} disabled={docId === null} onClick={grant}>授予 read</Button>
    </div>
    {notice && <Alert className="agent-console__spaced" type="info" showIcon message={notice} />}
    {acl.error && <Alert type="error" showIcon message="ACL 加載失敗" description={acl.error} />}
    {docId === null
      ? <Alert className="agent-console__spaced" type="info" showIcon message="請選擇一份文檔查看或維護授權" />
      : <Table className="agent-console__spaced" rowKey="subjects" size="middle" loading={acl.loading}
          columns={aclColumns} dataSource={acl.data ?? []} pagination={paginationConfig((acl.data ?? []).length)} />}
    <Descriptions className="agent-console__spaced" column={1} size="small" items={[
      { key: 'subject', label: tr('agentConsole.s36', '授權主體'), children: tr('agentConsole.h09', '支援 USER（員工）、DEPT（部門）、ROLE（功能角色）、ROLE_CODE（如 user / admin）。') },
      { key: 'scope', label: tr('agentConsole.s73', '與檢索的關係'), children: tr('agentConsole.h14', '檢索 SQL 以 EXISTS 注入授權集合；無授權時直接返回空，不掃描正文。') },
    ]} />
  </section>
}

/** 数据等级固定枚举与中文名：中文界面优先显示中文，括号内保留枚举值以便与文档/日志对照。 */
const DATA_CLASS_LEVELS = ['PUBLIC', 'INTERNAL', 'SENSITIVE', 'RESTRICTED'] as const
const DATA_CLASS_LABELS: Record<AgentDataClassRow['level'], string> = {
  PUBLIC: '公開', INTERNAL: '企業內部', SENSITIVE: '敏感', RESTRICTED: '嚴格受限',
}
const dataClassLabel = (level: AgentDataClassRow['level']) => `${DATA_CLASS_LABELS[level]}（${level}）`

/**
 * 系统类型 → 建议数据等级：仅用作登记弹窗的预填值，必须由业务负责人确认后才保存。
 * 口径：含薪资/资金明细 → RESTRICTED；含个人身份或经营数据 → SENSITIVE；内部流程数据 → INTERNAL。
 */
const SUGGESTED_CLASS: Record<string, AgentDataClassRow['level']> = {
  payroll: 'RESTRICTED', finance: 'RESTRICTED',
  hr: 'SENSITIVE', organization: 'SENSITIVE', eam: 'SENSITIVE', merchant: 'SENSITIVE', attendance: 'SENSITIVE',
  common: 'INTERNAL',
}

const suggestedClassOf = (code: string): AgentDataClassRow['level'] => SUGGESTED_CLASS[code] ?? 'INTERNAL'

/** 已登记与未登记合并后的行：level 为 null 表示该业务系统尚未登记分级。 */
type ClassRow = { key: string; system: string; level: AgentDataClassRow['level'] | null; note: string }

function DataEndpointsPane() {
  const classes = useConsoleRemote(() => fetchDataClasses(), [])
  const endpoints = useConsoleRemote(() => fetchEndpoints(), [])
  /** 下拉选项与「系统目录 / 模型管理」同源：不让人手填系统编码与 model_key。 */
  const systems = useConsoleRemote(() => fetchPlatformSystems(), [])
  const models = useConsoleRemote(() => fetchPlatformModels(), [])
  const isZh = i18n.language?.startsWith('zh')
  const systemLabel = (s: { code: string; name: string; nameEn: string | null }) =>
    `${isZh ? s.name : (s.nameEn || s.name)}（${s.code}）`
  const modelLabel = (m: { modelKey: string; name: string; status: number }) =>
    `${m.name}（${m.modelKey}）${m.status === 1 ? '' : ' · 已停用'}`
  const systemNameOf = (code: string) => {
    const hit = (systems.data ?? []).find(s => s.code === code)
    return hit ? systemLabel(hit) : code
  }
  const modelNameOf = (key: string) => {
    const hit = (models.data ?? []).find(m => m.modelKey === key)
    return hit ? modelLabel(hit) : key
  }
  const [classOpen, setClassOpen] = useState(false)
  const [epOpen, setEpOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [classForm] = Form.useForm()
  const [epForm] = Form.useForm()
  const { hasPermission } = useAuth()
  /** 登记分级（edit）与批准端点（approve）拆开授权：同一人不再默认兼做两件事。 */
  const canEdit = hasPermission('agent-data:edit')
  const canApprove = hasPermission('agent-data:approve')

  /** 已登记 + 未登记合成一张表：未登记置顶，避免漏配系统被埋在列表底部。 */
  const classRows = useMemo<ClassRow[]>(() => {
    const registered = new Map((classes.data ?? []).map(row => [row.system, row]))
    const fromCatalog = (systems.data ?? []).map(s => {
      const hit = registered.get(s.code)
      return { key: s.code, system: s.code, level: hit?.level ?? null, note: hit?.note ?? '' }
    })
    const orphans = (classes.data ?? [])
      .filter(row => !(systems.data ?? []).some(s => s.code === row.system))
      .map(row => ({ key: row.system, system: row.system, level: row.level, note: row.note }))
    return [...fromCatalog, ...orphans].sort((a, b) => (a.level ? 1 : 0) - (b.level ? 1 : 0))
  }, [classes.data, systems.data])
  const saveClass = async () => {
    const v = await classForm.validateFields()
    setSaving(true)
    try {
      await saveDataClass({ systemCode: v.systemCode, dataClass: v.dataClass, note: v.note })
      message.success(tr('agentConsole.form.classSaved', '分級已登記'))
      setClassOpen(false); classForm.resetFields(); classes.reload()
    } catch { /* request.ts 已统一提示 */ } finally { setSaving(false) }
  }
  const saveEndpoint = async () => {
    const v = await epForm.validateFields()
    setSaving(true)
    try {
      await approveEndpoint({ modelKey: v.modelKey, maxDataClass: v.maxDataClass, residency: v.residency, days: v.days, note: v.note })
      message.success(tr('agentConsole.form.endpointApproved', '端點已批准'))
      setEpOpen(false); epForm.resetFields(); endpoints.reload()
    } catch { /* request.ts 已统一提示 */ } finally { setSaving(false) }
  }
  const classColumns: ColumnsType<ClassRow> = [
    {
      key: 'system', title: tr('agentConsole.s68', '系統'), width: 300,
      render: (_, row) => (
        <span>
          {systemNameOf(row.system)}
          {!row.level && <Tag color="red" style={{ marginLeft: 8 }}>{tr('agentConsole.s86', '未登記')}</Tag>}
        </span>
      ),
    },
    {
      key: 'level', title: tr('agentConsole.s79', tr('agentConsole.form.dataClass', '資料等級')), width: 180,
      render: (_, row) => row.level
        ? <Tag color={row.level === 'RESTRICTED' ? 'red' : row.level === 'SENSITIVE' ? 'volcano' : row.level === 'INTERNAL' ? 'blue' : 'green'}>{isZh ? dataClassLabel(row.level) : row.level}</Tag>
        : <Tag>—</Tag>,
    },
    { key: 'note', title: tr('agentConsole.s76', tr('agentConsole.form.note', '說明')), render: (_, row) => row.note || '—' },
  ]
  const endpointColumns: ColumnsType<AgentEndpointRow> = [
    { key: 'model', title: tr('agentConsole.s51', '模型端點'), width: 260, render: (_, row) => modelNameOf(row.model) },
    { key: 'level', title: tr('agentConsole.s11', '可接收等級'), dataIndex: 'maxLevel', width: 180, render: (value: string) => <Tag color="purple">{isZh ? dataClassLabel(value as AgentDataClassRow['level']) : value}</Tag> },
    { key: 'residency', title: tr('agentConsole.s85', tr('agentConsole.form.residency', '駐留')), width: 120, render: (_, row) => row.residency === 'private' ? <Tag color="green">內網</Tag> : <Tag>外部</Tag> },
    { key: 'expires', title: tr('agentConsole.s33', '批准有效期'), width: 170, render: (_, row) => fmtTs(row.expiresAt) },
    { key: 'note', title: tr('agentConsole.s04', tr('agentConsole.form.remark', '備註')), dataIndex: 'note' },
  ]

  return <>
    <section className="agent-console__card">
      <h3>系統資料分級<HelpPopover title="未分級=禁止外發" ariaLabel="資料分級說明" content="PUBLIC < INTERNAL < SENSITIVE < RESTRICTED。未登記分級的系統不允許發送模型；敏感與嚴格受限內容只能走已批准的私域端點。" /></h3>
      <Alert type="info" showIcon message="分級是業務決策，不由代碼推導" description="系統負責人確認等級後登記；調整等級會影響所有使用該系統的應用，需重新試算與回歸。" />
      {classes.error && <Alert type="error" showIcon message="資料分級加載失敗" description={classes.error} />}
      <div className="agent-console__toolbar">{canEdit && <Button type="primary" size="small" onClick={() => setClassOpen(true)}>{tr('agentConsole.form.addClass', '登記分級')}</Button>}</div>
      <Table className="agent-console__spaced" rowKey="key" size="middle" loading={classes.loading || systems.loading} columns={classColumns}
        dataSource={classRows} pagination={paginationConfig(classRows.length)} />
    </section>
    <section className="agent-console__card">
      <h3>模型端點批准<HelpPopover title="private 標籤不等於批准" ariaLabel="端點批准說明" content="必須由人明確登記可接收的最高資料等級與有效期；到期自動失效。內網地址或私有部署標籤本身不能作為放行依據。" /></h3>
      {endpoints.error && <Alert type="error" showIcon message="端點批准加載失敗" description={endpoints.error} />}
      <div className="agent-console__toolbar">{canApprove && <Button type="primary" size="small" onClick={() => setEpOpen(true)}>{tr('agentConsole.form.approveEndpoint', '批准端點')}</Button>}</div>
      <Table rowKey="model" size="middle" loading={endpoints.loading} columns={endpointColumns}
        dataSource={endpoints.data ?? []} pagination={paginationConfig((endpoints.data ?? []).length)} />
      <Descriptions className="agent-console__spaced" column={1} size="small" items={[
        { key: 'match', label: tr('agentConsole.s46', '放行條件'), children: tr('agentConsole.h20', '系統分級 ≤ 端點批准等級；未分級、未批准、已撤銷或已過期一律拒絕。') },
        { key: 'revoke', label: tr('agentConsole.s44', '撤銷與到期'), children: tr('agentConsole.h08', '撤銷立即生效；到期後下一次調用即被拒，不會沿用舊批准。') },
      ]} />
    </section>
    <Modal open={classOpen} title={tr('agentConsole.form.addClassTitle', '登記系統資料分級')} onCancel={() => setClassOpen(false)} onOk={saveClass} confirmLoading={saving} okText={tr('agentConsole.form.save', '保存')} destroyOnClose>
        <Form form={classForm} layout="vertical" initialValues={{ dataClass: 'INTERNAL' }}>
          <Form.Item name="systemCode" label={tr('agentConsole.form.systemKey', '系統標識')} rules={[{ required: true }]}
            extra={tr('agentConsole.form.classHint', '資料等級依系統類型預填建議值，請由業務負責人確認後保存')}>
            <Select showSearch optionFilterProp="label" loading={systems.loading}
              placeholder={tr('agentConsole.form.phSystem', '請選擇業務系統')}
              notFoundContent={tr('agentConsole.form.noSystem', '系統目錄為空或加載失敗')}
              onChange={(code: string) => classForm.setFieldValue('dataClass', suggestedClassOf(code))}
              options={(systems.data ?? []).map(s => ({ value: s.code, label: systemLabel(s) }))} />
          </Form.Item>
          <Form.Item name="dataClass" label={tr('agentConsole.form.dataClass', '資料等級')} rules={[{ required: true }]}>
            <Select options={DATA_CLASS_LEVELS.map(v => ({ value: v, label: isZh ? dataClassLabel(v) : v }))} />
          </Form.Item>
          <Form.Item name="note" label={tr('agentConsole.form.note', '說明')}><Input /></Form.Item>
        </Form>
      </Modal>
      <Modal open={epOpen} title={tr('agentConsole.form.approveEndpointTitle', '批准模型端點')} onCancel={() => setEpOpen(false)} onOk={saveEndpoint} confirmLoading={saving} okText={tr('agentConsole.form.approveOk', '批准')} destroyOnClose>
        <Form form={epForm} layout="vertical" initialValues={{ maxDataClass: 'INTERNAL', residency: 'external', days: 90 }}>
          <Form.Item name="modelKey" label={tr('agentConsole.form.modelKey', '模型標識')} rules={[{ required: true, max: 128 }]}
            extra={tr('agentConsole.form.modelKeyHint', '選項來自「模型管理」；未登記的模型可直接輸入 model_key')}>
            <AutoComplete placeholder={tr('agentConsole.form.phModel', 'qwen3.7-flash')}
              options={(models.data ?? []).map(m => ({ value: m.modelKey, label: modelLabel(m) }))}
              filterOption={(input, option) => String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())} />
          </Form.Item>
          <Form.Item name="maxDataClass" label={tr('agentConsole.form.maxDataClass', '可接收最高等級')} rules={[{ required: true }]}>
            <Select options={DATA_CLASS_LEVELS.map(v => ({ value: v, label: isZh ? dataClassLabel(v) : v }))} />
          </Form.Item>
          <Form.Item name="residency" label={tr('agentConsole.form.residency', '駐留')} rules={[{ required: true }]} extra={tr('agentConsole.form.residencyHint', '僅接受 private / external，其他值後端直接拒絕')}>
            <Select options={[{ value: 'private', label: 'private 內網' }, { value: 'external', label: 'external 外部' }]} />
          </Form.Item>
          <Form.Item name="days" label={tr('agentConsole.form.days', '有效天數（1-365，預設 90）')}><InputNumber min={1} max={365} style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="note" label={tr('agentConsole.form.remark', '備註')}><Input /></Form.Item>
        </Form>
      </Modal>
    </>
}

function RunsPane() {
  const runs = useConsoleRemote(() => fetchRuns(), [])
  const [detail, setDetail] = useState<AgentRunRow | null>(null)
  const openRun = (runNo: string) => {
    fetchRunDetail(runNo).then(setDetail).catch(() => setDetail(null))
  }
  const columns: ColumnsType<AgentRunRow> = [
    { key: 'no', title: tr('agentConsole.s81', '運行'), width: 220, render: (_, row) => <Button type="link" size="small" onClick={() => openRun(row.runNo)}>{row.runNo}</Button> },
    { key: 'app', title: tr('agentConsole.s32', '應用'), dataIndex: 'appName', width: 180 },
    { key: 'requester', title: tr('agentConsole.s57', '申請人'), dataIndex: 'requester', width: 170 },
    { key: 'status', title: tr('agentConsole.s54', '狀態'), width: 140, render: (_, row) => <Tag color={runTag(row.status).color}>{runTag(row.status).text}</Tag> },
    { key: 'started', title: tr('agentConsole.s83', '開始時間'), width: 170, render: (_, row) => fmtTs(row.startedAt) },
  ]
  const { applyConfig, configComponent } = useColumnConfig('ai-console-runs', [
    { key: 'no', title: tr('agentConsole.s81', '運行') }, { key: 'app', title: tr('agentConsole.s32', '應用') }, { key: 'requester', title: tr('agentConsole.s57', '申請人') },
    { key: 'status', title: tr('agentConsole.s54', '狀態') }, { key: 'started', title: tr('agentConsole.s83', '開始時間') },
  ], [{ key: 'no', visible: true, locked: 'head' as const }, { key: 'status', visible: true, locked: 'tail' as const }])

  return <section className="agent-console__card">
    <h3>運行中心<HelpPopover title="可靠的邊界" ariaLabel="運行中心說明" content={[
      { tone: 'success', label: tr('agentConsole.s19', '已具備'), body: tr('agentConsole.h03', '受理即落庫、冪等鍵、步驟檢查點、取消標記、租約過期轉「待核實」。') },
      { tone: 'warn', label: tr('agentConsole.s17', '尚未具備'), body: tr('agentConsole.h21', '跨實例定時觸發、宕機自動續跑、外部動作撤回；取消只保證未開始的步驟不再啟動。') },
    ]} /></h3>
    <div className="action-section"><div className="action-section-left"><Tag color="green">{tr('agentConsole.wired', '接口數據')}</Tag></div><div className="action-section-right">{configComponent}</div></div>
    {runs.error && <Alert type="error" showIcon message="運行列表加載失敗" description={runs.error} />}
    <Table rowKey="key" size="middle" loading={runs.loading} columns={applyConfig(columns)} dataSource={runs.data ?? []}
      scroll={{ x: 'max-content' }} pagination={paginationConfig((runs.data ?? []).length)} />
    {detail && <div className="agent-console__spaced">
      <h4>{detail.runNo} · 步驟</h4>
      <Steps direction="vertical" size="small" current={detail.steps.findIndex(step => step.state === 'process')}
        status={detail.status === 'unknown' ? 'error' : undefined}
        items={detail.steps.map(step => ({
          title: step.title,
          status: step.state === 'finish' ? 'finish' : step.state === 'process' ? 'process' : step.state === 'error' ? 'error' : 'wait',
          description: step.detail,
        }))} />
    </div>}
  </section>
}

function EvaluationPane() {
  const cases = useConsoleRemote(() => fetchEvalCases(), [])
  const releases = useConsoleRemote(() => fetchReleases(), [])
  const [datasetKey, setDatasetKey] = useState('safety')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<{ total: number; passed: number; failed: number; blocking: boolean } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const rows: AgentEvalCaseRow[] = cases.data ?? []
  const blocking = result?.blocking ?? false

  const start = () => {
    setRunning(true); setNotice(null)
    runEval(datasetKey)
      .then(setResult)
      .catch((cause: unknown) => setNotice(cause instanceof Error ? cause.message : tr('agentConsole.s75', '評測啟動失敗')))
      .finally(() => setRunning(false))
  }

  const caseColumns: ColumnsType<AgentEvalCaseRow> = [
    { key: 'no', title: tr('agentConsole.s56', '用例'), dataIndex: 'caseNo', width: 110 },
    { key: 'title', title: tr('agentConsole.s80', '輸入摘要'), dataIndex: 'title' },
    { key: 'mustPass', title: tr('agentConsole.s14', '安全類'), width: 100, render: (_, row) => row.passed ? <Tag color="red">必須通過</Tag> : <Tag>一般</Tag> },
  ]
  const releaseColumns: ColumnsType<AgentReleaseRow> = [
    { key: 'app', title: tr('agentConsole.s32', '應用'), dataIndex: 'app', width: 200 },
    { key: 'version', title: tr('agentConsole.s52', '版本'), dataIndex: 'version', width: 100 },
    { key: 'by', title: tr('agentConsole.s60', '發布人'), dataIndex: 'releasedBy', width: 120 },
    { key: 'at', title: tr('agentConsole.s62', '發布時間'), width: 180, render: (_, row) => fmtTs(row.releasedAt) },
    { key: 'state', title: tr('agentConsole.s54', '狀態'), width: 110, render: (_, row) => row.state === 'active'
      ? <Tag color="green">{tr('agentConsole.state.active', '生效')}</Tag>
      : <Tag color="orange">{tr('agentConsole.state.rolledBack', '已回滾')}</Tag> },
  ]

  return <>
    <section className="agent-console__card">
      <h3>安全回歸門禁<HelpPopover title="安全類必須零失敗" ariaLabel="回歸門禁說明" content="高風險用例失敗即阻斷發布，不能用總體通過率抵銷越權或未審批寫入；模型評分只能輔助，不作為放行依據。" /></h3>
      <div className="search-section">
        <Input aria-label="評測數據集" addonBefore="數據集" style={{ maxWidth: 320 }} value={datasetKey}
          onChange={event => setDatasetKey(event.target.value)} />
        <Button type="primary" loading={running} onClick={start}>運行策略回歸</Button>
        <Tag>不調用模型、不產生費用</Tag>
      </div>
      {notice && <Alert className="agent-console__spaced" type="warning" showIcon message={notice} />}
      {result && (blocking
        ? <Alert className="agent-console__spaced" type="error" showIcon message={`${result.failed} 條失敗，發布被阻斷`}
            description={`共 ${result.total} 條，通過 ${result.passed} 條。`} />
        : <Alert className="agent-console__spaced" type="success" showIcon message={`${result.passed}/${result.total} 通過`}
            description="仍不代表生產驗收通過；試點驗收需真實環境與業務負責人。" />)}
      {cases.error && <Alert type="error" showIcon message="評測用例加載失敗" description={cases.error} />}
      <Table className="agent-console__spaced" rowKey="caseNo" size="middle" loading={cases.loading}
        columns={caseColumns} dataSource={rows} pagination={paginationConfig(rows.length)} />
    </section>
    <section className="agent-console__card">
      <h3>發布快照與回滾<HelpPopover title="快照不可變" ariaLabel="發布快照說明" content="每次發布凍結應用、Prompt、工具、知識與策略版本；回滾是重新指向舊版本並留新記錄，不會刪除已執行任務的歷史。" /></h3>
      {releases.error && <Alert type="error" showIcon message="發布記錄加載失敗" description={releases.error} />}
      <Table rowKey="key" size="middle" loading={releases.loading} columns={releaseColumns}
        dataSource={releases.data ?? []} pagination={paginationConfig((releases.data ?? []).length)} />
    </section>
  </>
}

function labelOf(pane: ConsolePane) {
  return CONSOLE_PANES.find(item => item.key === pane)?.label ?? ''
}

function descriptionOf(pane: ConsolePane) {
  return CONSOLE_PANES.find(item => item.key === pane)?.description ?? ''
}

/**
 * 功能地图：菜单树只能表达层级，表达不了「管什么、谁来用、对谁生效」。
 * 数据与后端 AiMenuLayout 同源，纯展示，不参与鉴权。
 */
function MenuMap() {
  return <Table
    size="small"
    rowKey="groupKey"
    pagination={false}
    dataSource={AI_MENU_MAP}
    columns={[
      {
        key: 'group', title: '分組', width: 200,
        render: (_, row) => <div>
          <b>{row.group}</b>
          <div className="agent-console__muted">{row.purpose}</div>
          <div className="agent-console__muted">誰來用：{row.audience}</div>
        </div>,
      },
      {
        key: 'entries', title: '功能入口 · 管什麼 · 對誰生效',
        render: (_, row) => <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {row.entries.map(entry => <div key={entry.key} style={{ lineHeight: 1.6 }}>
            <Tag style={{ marginInlineEnd: 6 }}>{entry.name}</Tag>
            <span>{entry.duty}</span>
            <span className="agent-console__muted">（{entry.scope}）</span>
          </div>)}
        </div>,
      },
    ]}
  />
}

/** 單一面板內容：預覽（頁籤）與正式路由共用，避免兩份 UI 漂移。 */
/** 總覽四張卡：讀真實就緒統計；接口失敗時顯示 0 並由就緒面板提示錯誤。 */
function OverviewCards() {
  const { t } = useTranslation()
  const readiness = useConsoleRemote(() => fetchReadiness(), [])
  const counts = readiness.data?.counts
  return <StatCards columns={4} items={[
    { key: 'apps', label: t('agentConsole.card.apps', { defaultValue: tr('agentConsole.s25', '已發布應用') }), value: counts?.publishedApplications ?? 0, icon: <AppstoreOutlined />, color: 'brand' },
    { key: 'endpoints', label: t('agentConsole.card.endpoints', { defaultValue: tr('agentConsole.s23', '已批准端點') }), value: counts?.approvedEndpoints ?? 0, icon: <CloudServerOutlined />, color: 'info' },
    { key: 'acl', label: t('agentConsole.card.acl', { defaultValue: tr('agentConsole.s49', '有效知識 ACL') }), value: counts?.knowledgeAcls ?? 0, icon: <DatabaseOutlined />, color: 'success' },
    { key: 'classes', label: t('agentConsole.card.classes', { defaultValue: tr('agentConsole.s20', '已分級系統') }), value: counts?.dataClasses ?? 0, icon: <ThunderboltOutlined />, color: 'system' },
  ]} />
}

function PaneContent({ pane }: { pane: ConsolePane }) {
  return <>
          {pane === 'overview' && <>
            <OverviewCards />
            <div className="agent-console__spaced"><ReadinessPanel /></div>
            <div className="agent-console__spaced">
              <h4>功能地圖：{AI_MENU_MAP.length} 個分組 · {AI_MENU_ENTRY_COUNT} 個功能入口</h4>
              <p className="agent-console__muted">
                按「先看總覽 → 建應用 → 選模型工具 → 管知識 → 配授權額度 → 看運行質量 → 管安全審計」排列。
                看不到的入口代表當前帳號沒有該權限；括號內是生效範圍，選錯範圍是 AI 配置最常見的錯誤。
              </p>
              <MenuMap />
              <Alert className="agent-console__spaced" type="info" showIcon message="三個最容易混的概念"
                description="模型授權決定「能用哪個模型」；用量額度按週期限定 Tokens/次數；費用預算只做金額預占與結算，不授予任何模型權限。三者互不替代，也不相加成一個總額度。" />
            </div>
          </>}
          {pane === 'apps' && <AppsPane />}
          {pane === 'budget' && <BudgetPane />}
          {pane === 'actions' && <ActionsPane />}
          {pane === 'knowledge' && <KnowledgeAclPane />}
          {pane === 'data' && <DataEndpointsPane />}
          {pane === 'runs' && <RunsPane />}
          {pane === 'evaluation' && <EvaluationPane />}
  </>
}

/** 預覽：頁籤切換版（`#/ai-assistant?preview=console`）。全部為模擬資料，不調用任何接口。 */
export default function AgentConsolePreview() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const active = CONSOLE_PANES.find(item => item.key === params.get('pane')) ?? CONSOLE_PANES[0]
  const handlePane = (key: string) => setParams(previous => {
    const next = new URLSearchParams(previous)
    next.set('preview', 'console')
    next.set('pane', key)
    return next
  })

  return <AiAssistantPageShell title={t('agentConsole.previewTitle', { defaultValue: '企業 Agent 控制台 · 界面預覽' })} backTo="/ai-assistant">
    <div className="agent-console">
      <Alert type="warning" showIcon message="第一階段界面預覽｜全部為模擬資料，刷新即重置"
        description="不調用模型、不讀取生產資料、不發送通知、不建立真實申請。控制台接口已在後端就緒，但按兩階段交付，確認界面後再接入。" />
      <div className="agent-console__topbar">
        <Space wrap>
          <Tag color="purple">環境：隔離預覽</Tag>
          <Tag>頁籤：{CONSOLE_PANES.length} 個</Tag>
          <Tag>資料：示例</Tag>
        </Space>
        <HelpPopover title="怎麼看這一頁" ariaLabel="控制台預覽使用說明" content={[
          { tone: 'info', label: '1. 先看總覽', body: tr('agentConsole.h02', '切換「已完成配置 / 全新環境」，看阻斷項如何呈現。') },
          { tone: 'info', label: '2. 再看四條主線', body: tr('agentConsole.h06', '應用版本、預算池、動作提案、知識 ACL 各一頁籤。') },
          { tone: 'success', label: '3. 確認後再接線', body: tr('agentConsole.h13', '本次不做真實請求；確認後第二階段再接接口、補 i18n 與權限。') },
        ]} />
      </div>

      <Tabs activeKey={active.key} onChange={handlePane} items={CONSOLE_PANES.map(pane => ({
        key: pane.key,
        label: <span className="agent-console__tab">{PANE_ICONS[pane.key]}{t(`agentConsole.pane.${pane.key}`, { defaultValue: pane.label })}</span>,
        children: <div className="agent-console__pane">
          <div className="agent-console__heading">
            <div><h2>{t(`agentConsole.pane.${pane.key}`, { defaultValue: pane.label })}</h2><p>{t(`agentConsole.desc.${pane.key}`, { defaultValue: pane.description })}</p></div>
            <Tag color="orange">{t('agentConsole.notWired', { defaultValue: tr('agentConsole.s65', '示例') })}</Tag>
          </div>
          <PaneContent pane={pane.key} />
        </div>,
      }))} />
    </div>
  </AiAssistantPageShell>
}

/** 正式路由頁：二級菜單直達，單面板渲染。資料仍為示例，接線前不得對外宣稱可用。 */
export function AgentConsole({ pane }: { pane: ConsolePane }) {
  const { t } = useTranslation()
  return <AiAssistantPageShell title={t('agentConsole.title', { defaultValue: '企業 Agent 控制台' })} backTo="/">
    <div className="agent-console">
      <Alert type="info" showIcon message={t('agentConsole.bannerTitle', { defaultValue: tr('agentConsole.s58', '界面已接線') })}
        description={t('agentConsole.bannerDesc', { defaultValue: '' })} />
      <div className="agent-console__heading">
        <div>
          <h2>{t(`agentConsole.pane.${pane}`, { defaultValue: labelOf(pane) })}</h2>
          <p>{t(`agentConsole.desc.${pane}`, { defaultValue: descriptionOf(pane) })}</p>
        </div>
        <Tag color="green">{t('agentConsole.wired', { defaultValue: tr('agentConsole.s40', '接口數據') })}</Tag>
      </div>
      <PaneContent pane={pane} />
    </div>
  </AiAssistantPageShell>
}
