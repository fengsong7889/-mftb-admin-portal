/**
 * 业务 AI 场景管理面板（试点：会议 AI 整理纪要）。
 *
 * <p>职责边界：这里只管「场景开关 + 员工可用性诊断」。谁能用由授权中心统一授予，
 * 模型/额度/急停/数据准入仍由各服务端裁决；本面板只呈现后端返回的就绪判定，不自行放行。
 * <p>本页在受 i18n 棘轮豁免的管理域目录内，文案沿用繁中直写（与账号白名单/工具授权页一致）。
 */
import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Form, Input, Modal, Select, Switch, Table, Tag, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  ArrowRightOutlined, AuditOutlined, ControlOutlined, FileTextOutlined, LockOutlined,
  ReloadOutlined, SafetyCertificateOutlined, SaveOutlined,
} from '@ant-design/icons'
import { useAuth } from '@/contexts/AuthContext'
import CardTitle from '@/components/CardTitle'
import EmployeeSelect from '@/components/EmployeeSelect'
import HelpPopover from '@/components/HelpPopover'
import { formatDateTime } from '@/utils/datetime'
import {
  diagnoseMeetingAi, fetchMeetingAiDiagnoseEmployees, fetchMeetingAiSceneConfig, saveMeetingAiSceneConfig,
  type AiSceneConfig, type AiSceneDiagnosis,
} from '@/api/aiScene'
import './businessAiScene.css'

interface Props {
  /** 只有调用方确认拥有授权中心查看权限时才提供跳转；本组件不自行放宽路由权限。 */
  onOpenAuthorization?: () => void
}

const CHECK_LABELS: Record<string, string> = {
  account: '員工帳號', scene: '場景狀態', environment: '環境限制', 'kill-switch': '全局急停',
  permission: '功能權限', model: '模型與授權', quota: '額度與預算', 'data-policy': '資料准入',
  'booking-scope': '會議歸屬（執行時）', budget: '費用預占（執行時）',
}

/** 处理入口标识 → 站内路由白名单；后端只回标识，URL 由前端固定映射，避免任意跳转。 */
const ACTION_ROUTES: Record<string, string> = {
  'ai-operation-auth': '/ai-operation-auth', 'authorization-center': '/authorization-center',
  'ai-emp-model-auth': '/ai-emp-model-auth', 'ai-apply': '/ai-access-apply', 'ai-data-policy': '/ai-assistant',
}

export default function BusinessAiScenePanel({ onOpenAuthorization }: Props) {
  const { hasPermission } = useAuth()
  const [form] = Form.useForm<{ reason: string }>()
  const [modal, contextHolder] = Modal.useModal()
  const [config, setConfig] = useState<AiSceneConfig>()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  // 渲染期取权限（非 useState 初始化）：授权变更后即使未整页重载，也能随 AuthContext 刷新即时回应该置灰
  const canManage = hasPermission('ai-operation-auth:meeting_ai_manage')
  const canDiagnose = hasPermission('ai-operation-auth:meeting_ai_diagnose')
  const [target, setTarget] = useState<{ id: number; name: string; empId?: string }>()
  const [diagnosis, setDiagnosis] = useState<AiSceneDiagnosis>()
  const [diagnosing, setDiagnosing] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    fetchMeetingAiSceneConfig()
      .then(setConfig)
      .catch(() => message.error('載入場景配置失敗'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const persist = async (next: boolean, reason: string) => {
    if (!config) return
    setSaving(true)
    try {
      const saved = await saveMeetingAiSceneConfig({ enabled: next, expectedVersion: config.version, reason })
      setConfig(saved)
      form.resetFields()
      message.success(next ? '場景已啟用' : '場景已停用')
    } catch (error) {
      // request 层已统一弹错；409 版本冲突额外刷新，避免管理员继续基于旧版本操作
      if (error instanceof Error && /已被他人修改|409/.test(error.message)) load()
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async (next: boolean) => {
    if (!canManage || saving) return
    let values: { reason: string }
    try {
      values = await form.validateFields(['reason'])
    } catch {
      return
    }
    modal.confirm({
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      title: next ? '確定啟用會議 AI 整理紀要？' : '確定停用會議 AI 整理紀要？',
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>場景</span><b>會議 AI 整理紀要</b></div>
          <div className="confirm-info-row"><span>操作</span><b>{next ? '啟用' : '停用'}</b></div>
          <div className="confirm-info-row"><span>變更原因</span><b className="ai-scene__confirm-reason">{values.reason.trim()}</b></div>
          <p className="ai-scene__confirmation-note">開關只影響新的 AI 整理請求；自由筆記與手動紀要不受影響，也不會自動發布或發送紀要。</p>
          {next && <p className="ai-scene__confirmation-note">啟用後員工仍需具備會議編輯與 AI 整理權限，並通過模型、額度與資料安全校驗。</p>}
        </div>
      ),
      okText: '確認', cancelText: '取消',
      okButtonProps: next ? undefined : { danger: true },
      onOk: () => persist(next, values.reason.trim()),
    })
  }

  const runDiagnose = async () => {
    if (!canDiagnose || !target) return
    setDiagnosing(true)
    try {
      setDiagnosis(await diagnoseMeetingAi(target.id))
    } catch {
      setDiagnosis(undefined)
    } finally {
      setDiagnosing(false)
    }
  }

  const columns: ColumnsType<NonNullable<AiSceneDiagnosis>['checks'][number]> = [
    { title: '檢查項', dataIndex: 'key', width: 150, render: (key: string) => CHECK_LABELS[key] ?? key },
    {
      title: '結果', dataIndex: 'status', width: 96,
      render: (status: string) => (status === 'passed' ? <Tag color="success">通過</Tag>
        : status === 'blocked' ? <Tag color="error">阻斷</Tag> : <Tag>執行時</Tag>),
    },
    { title: '說明', dataIndex: 'message', render: (msg: string, row) => (
      <span>{msg}{row.reasonCode && row.status !== 'passed' && <span className="ai-scene__reason-code">（{row.reasonCode}）</span>}</span>) },
    {
      title: '處理', dataIndex: 'action', width: 90,
      render: (action?: string | null) => (action && ACTION_ROUTES[action]
        ? <Button type="link" size="small" onClick={() => window.location.hash = `#${ACTION_ROUTES[action]}`}>前往</Button>
        : <span className="ai-scene__muted">—</span>),
    },
  ]

  const envBlocked = config ? !config.environmentAllowed : false

  return (
    <section className="ai-scene" aria-label="業務 AI 場景">
      {contextHolder}
      {envBlocked && <Alert className="ai-scene__preview-notice" type="warning" showIcon
        message="後端環境已停用此場景"
        description="環境級開關（meeting.minutes.ai-enabled / 會議紀要總開關）為最高上限，管理台開關無法越權開啟，請聯繫運維。" />}

      <header className="ai-scene__header">
        <div className="ai-scene__header-accent" />
        <div className="ai-scene__header-body">
          <span className="ai-scene__scene-icon"><FileTextOutlined aria-hidden="true" /></span>
          <div className="ai-scene__heading">
            <div className="ai-scene__title-row">
              <h2>會議 AI 整理紀要</h2>
              <Tag color="purple">首期試點</Tag>
              <Tag color={config?.enabled ? 'success' : 'default'}>{config?.enabled ? '已啟用' : '已停用'}</Tag>
            </div>
            <p>將自由筆記整理為議題、結論與行動項，由記錄人核對後套用。</p>
          </div>
          <Tag color="blue">會議管理系統</Tag>
        </div>
        <ol className="ai-scene__steps" aria-label="場景開通流程">
          <li><span>1</span>開啟業務場景</li>
          <li><span>2</span>授予員工使用權限</li>
          <li><span>3</span>檢查模型與可用額度</li>
        </ol>
      </header>

      <div className="ai-scene__columns">
        <div className="ai-scene__settings">
          <section className="ai-scene__card" aria-label="場景配置">
            <CardTitle icon={<ControlOutlined />} tone="warn" title="場景配置"
              note={<HelpPopover title="開關的作用範圍" ariaLabel="開關的作用範圍" placement="bottomRight" content={[
                { tone: 'info', label: '開關不是員工授權', body: '啟用後員工仍須具備會議編輯與 AI 整理權限，並通過模型、額度和資料安全校驗。' },
                { tone: 'neutral', label: '不影響手動記錄', body: '停用僅阻止新的 AI 請求；已生成結果不刪除，自由筆記與手動紀要仍可使用。' },
                { tone: 'warn', label: '已發出的請求', body: '停用不保證撤銷已送往模型的請求，也不代表免計費。' },
              ]}>
                <Button type="text" size="small" aria-label="開關的作用範圍" icon={<LockOutlined aria-hidden="true" />} />
              </HelpPopover>} />
            <div className="ai-scene__toggle-row">
              <div>
                <span className="ai-scene__field-title">啟用此場景</span>
                <p className="ai-scene__muted">{canManage ? '改開關需「管理會議AI開關」權限' : '需要「管理會議AI開關」權限'}</p>
              </div>
              <Switch aria-label="會議 AI 場景開關" checked={!!config?.enabled} disabled={!canManage || saving || loading || envBlocked}
                checkedChildren="啟用" unCheckedChildren="停用" onChange={next => void handleToggle(next)} />
            </div>
            <Form form={form} layout="vertical" initialValues={{ reason: '' }} style={{ marginTop: 16 }}>
              <Form.Item name="reason" label="變更原因" rules={[
                { required: true, whitespace: true, message: '請填寫變更原因' },
                { max: 200, message: '變更原因最多 200 字' },
              ]}>
                <Input.TextArea rows={3} maxLength={200} showCount disabled={!canManage || saving}
                  placeholder="例如：安排會議紀要 AI 整理試點" className="ai-scene__reason" />
              </Form.Item>
            </Form>
            <dl className="ai-scene__metadata" aria-label="服務端配置資訊">
              <div><dt>真實啟用狀態</dt><dd>{loading ? '載入中…' : config ? (config.enabled ? '已啟用' : '已停用') : '未知'}</dd></div>
              <div><dt>配置版本</dt><dd>{config ? `v${config.version}` : '—'}</dd></div>
              <div><dt>最後修改人</dt><dd>{config?.updatedBy || '—'}</dd></div>
              <div><dt>最後修改時間</dt><dd>{config?.updatedAt ? formatDateTime(config.updatedAt) : '—'}</dd></div>
            </dl>
            <div className="ai-scene__card-actions">
              <Button icon={<ReloadOutlined aria-hidden="true" />} onClick={load} disabled={loading}>刷新</Button>
            </div>
          </section>

          <section className="ai-scene__card" aria-label="員工使用授權">
            <CardTitle icon={<SafetyCertificateOutlined />} tone="info" title="員工使用授權" />
            <p className="ai-scene__body-text">誰能使用，由權限管理系統統一授權；此處不維護第二份員工名單。</p>
            <div className="ai-scene__permission-path">
              <span>授權中心 · 會議管理</span>
              <strong>AI 整理紀要 <small>（與「編輯」成對授予）</small></strong>
              <p>能記筆記不等於能調 AI；不連帶授予發布或發送權限。</p>
            </div>
            <Button icon={<ArrowRightOutlined aria-hidden="true" />} disabled={!onOpenAuthorization} onClick={onOpenAuthorization}>前往授權中心</Button>
          </section>
        </div>

        <section className="ai-scene__card ai-scene__diagnostic" aria-label="員工可用性診斷">
          <CardTitle icon={<AuditOutlined />} tone="purple" title="員工可用性診斷"
            note={<HelpPopover title="診斷會檢查什麼" ariaLabel="診斷會檢查什麼" placement="bottomRight" content={[
              { tone: 'info', label: '按選定員工檢查', body: '以該員工的角色、部門、模型授權及額度判定，不套用管理員本人權限。' },
              { tone: 'neutral', label: '僅檢查，不執行', body: '不讀取個人會議筆記，不調用模型、不預占預算，也不代為開通授權。' },
              { tone: 'warn', label: '不是執行成功保證', body: '具體會議歸屬、筆記內容安全與實際費用預占，仍須在真正執行時校驗。' },
            ]}>
              <Button type="text" size="small" aria-label="診斷會檢查什麼" icon={<LockOutlined aria-hidden="true" />} />
            </HelpPopover>} />
          <div className="ai-scene__diagnostic-toolbar">
            <div className="ai-scene__employee-field" role="group" aria-label="診斷員工選擇">
              <span className="ai-scene__field-title">選擇員工</span>
              <EmployeeSelect single disabled={!canDiagnose} value={target ? [target.id] : []}
                seed={target ? [target] : []} placeholder="姓名或工號" style={{ width: '100%' }}
                searchSource={keyword => fetchMeetingAiDiagnoseEmployees({ keyword }).then(r => r.records)}
                onPick={picked => { const p = picked[0]; setTarget(p ? { id: p.id, name: p.name } : undefined); setDiagnosis(undefined) }} />
            </div>
            <Button type="primary" icon={<AuditOutlined aria-hidden="true" />} loading={diagnosing}
              disabled={!canDiagnose || !target} onClick={() => void runDiagnose()}>開始診斷</Button>
          </div>
          {!canDiagnose && <p className="ai-scene__diagnostic-notice"><LockOutlined aria-hidden="true" /> 需要「診斷會議AI可用性」權限。</p>}
          {canDiagnose && !diagnosis && <p className="ai-scene__diagnostic-notice"><LockOutlined aria-hidden="true" /> 尚未執行診斷，不會調用模型或產生費用。</p>}
          {diagnosis && (
            <>
              <Alert className="ai-scene__diagnose-summary" showIcon type={diagnosis.ready ? 'success' : 'warning'}
                message={`${diagnosis.name ?? ''}（${diagnosis.empId ?? ''}）：${diagnosis.ready ? '基礎條件就緒' : diagnosis.message ?? '暫不可用'}`}
                description={`檢查時間 ${formatDateTime(diagnosis.checkedAt)}${diagnosis.modelKey ? ` · 模型 ${diagnosis.modelKey}` : ''}`} />
              <Table size="small" rowKey="key" columns={columns} dataSource={diagnosis.checks} pagination={false} />
              {diagnosis.permissionSources.length > 0 && (
                <p className="ai-scene__execution-note">權限來源：{diagnosis.permissionSources
                  .map(s => `${s.menuKey}[${s.actions.join(',')}]←${s.sources.join('/') || '內置'}`).join('；')}</p>
              )}
            </>
          )}
          <p className="ai-scene__execution-note">會議歸屬、筆記內容安全、實際費用預占：執行時再校驗。</p>
        </section>
      </div>
    </section>
  )
}
