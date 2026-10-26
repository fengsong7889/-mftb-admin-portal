import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Alert,
  Button,
  Modal,
  Select,
  Switch,
  Table,
  Tabs,
  Tag,
  Space,
  Form,
  Input,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  SearchOutlined,
  ReloadOutlined,
  PlusOutlined,
  PoweroffOutlined,
} from '@ant-design/icons'
import {
  TOOL_LEVEL_META,
} from '@/api/mock/aiPlatformMock'
import type { ToolLevel } from '@/api/mock/aiPlatformMock'
import {
  fetchToolRegistry,
  toggleToolStatus,
  aggregateCallStats,
  fetchKillSwitch,
  toggleKillSwitch,
  type KillSwitchStatus,
  type ToolPolicyRow,
} from '@/api/aiOperationAuth'
import { useColumnConfig } from '@/hooks/useColumnConfig'
import { tablePagination, formatEpochOrDash } from '@/utils/tableDisplay'
import AccountWhitelistPanel from './AccountWhitelistPanel'

/* ────────────────── 展示常量 ────────────────── */

/** 全部權限等級（有序） */
const TOOL_LEVELS: ToolLevel[] = ['L0', 'L1', 'L2', 'L3', 'L4']

export default function AiOperationAuth() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  /* ── 數據 ── */
  const [tools, setTools] = useState<ToolPolicyRow[]>([])
  const [loading, setLoading] = useState(false)
  const [killSwitch, setKillSwitch] = useState<KillSwitchStatus | null>(null)
  const [killSwitchSaving, setKillSwitchSaving] = useState(false)
  /**
   * 急停原因用 ref 而不是 useState：`Modal.confirm` 的 `onOk` 是在弹窗创建那一刻固定的闭包，
   * 读 state 只能拿到当时的快照（实测：填了原因仍永远报“必须填写原因”，导致开关根本开不了）。
   */
  const killSwitchReasonRef = useRef('')

  const loadTools = () => {
    setLoading(true)
    // 拉策略列表后再用执行日志聚合真实调用量；失败就如实报错，
    // 不象以前那样静默回退 mock 假数据（管理员会把假数据当真实授权状态）
    fetchToolRegistry()
      .then((rows) => aggregateCallStats(rows).catch(() => rows))
      .then(setTools)
      .catch(() => {
        setTools([])
        message.error(t('aiOperationAuth.loadFailed'))
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadTools()
    fetchKillSwitch().then(setKillSwitch).catch(() => setKillSwitch(null))
  }, [])

  /* ── 查詢條件 ── */
  const [queryName, setQueryName] = useState('')
  const [queryMenu, setQueryMenu] = useState('')
  const [queryLevel, setQueryLevel] = useState<string | undefined>(undefined)
  const [applied, setApplied] = useState({ name: '', menu: '', level: undefined as string | undefined })

  const handleSearch = () => setApplied({ name: queryName.trim(), menu: queryMenu.trim(), level: queryLevel })
  const handleReset = () => {
    setQueryName('')
    setQueryMenu('')
    setQueryLevel(undefined)
    setApplied({ name: '', menu: '', level: undefined })
  }

  const filteredTools = useMemo(() => tools.filter((t) => {
    if (applied.name && !t.name.toLowerCase().includes(applied.name.toLowerCase())) return false
    if (applied.menu && !t.menuName.toLowerCase().includes(applied.menu.toLowerCase())) return false
    if (applied.level && t.level !== applied.level) return false
    return true
  }), [tools, applied])

  /* ── 列字段配置 ── */
  const columnMeta = [
    { key: 'name', title: t('aiOperationAuth.colToolName') },
    { key: 'code', title: t('aiOperationAuth.colToolCode') },
    { key: 'menuName', title: t('aiOperationAuth.colMenuName') },
    { key: 'level', title: t('aiOperationAuth.colLevel') },
    { key: 'description', title: t('aiOperationAuth.colDescription') },
    { key: 'callCount30d', title: t('aiOperationAuth.colCallCount30d') },
    { key: 'lastCalledAt', title: t('aiOperationAuth.colLastCalledAt') },
    { key: 'status', title: t('aiOperationAuth.colStatus') },
    { key: 'updatedBy', title: t('aiOperationAuth.colUpdatedBy') },
    { key: 'updatedAt', title: t('aiOperationAuth.colUpdatedAt') },
    { key: 'action', title: t('common.action') },
  ]

  const { configComponent, applyConfig } = useColumnConfig('ai-operation-auth', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  /* ── 工具啟停（二次確認 + 真实后端） ── */
  const handleToggleStatus = (row: ToolPolicyRow) => {
    const toDisable = row.status === 1
    const actionText = toDisable ? t('aiOperationAuth.disableAction') : t('aiOperationAuth.enableAction')
    Modal.confirm({
      className: 'custom-confirm-modal',
      icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
      title: t('aiOperationAuth.confirmToggleTool', { action: actionText }),
      content: t('aiOperationAuth.confirmToggleToolContent', {
        verb: toDisable ? t('aiOperationAuth.disablingVerb') : t('aiOperationAuth.enablingVerb'),
        name: row.name,
        effect: toDisable ? t('aiOperationAuth.toggleEffectDisable') : t('aiOperationAuth.toggleEffectEnable'),
      }),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      // 停用是削减可用能力的危险操作，按 §B.1 必须红色按钮（以前只有「刪除」上了 danger）
      okButtonProps: toDisable ? { danger: true } : undefined,
      onOk: async () => {
        try {
          await toggleToolStatus(row.code, toDisable ? 0 : 1)
          setTools((prev) => prev.map((t) => (t.id === row.id ? { ...t, status: toDisable ? 0 : 1 } : t)))
          message.success(t('aiOperationAuth.toolToggled', { name: row.name, action: actionText }))
        } catch {
          message.error(t('aiOperationAuth.toolToggleFailed', { action: actionText }))
        }
      },
    })
  }

  /** 应急急停开关切换（后端 GET/POST /api/agent/kill-switch） */
  const applyKillSwitch = async (engaged: boolean, reason: string) => {
    setKillSwitchSaving(true)
    try {
      const status = await toggleKillSwitch(engaged, reason)
      setKillSwitch(status)
      message.success(t('aiOperationAuth.killSwitchSuccess'))
    } catch {
      message.error(t('aiOperationAuth.killSwitchFailed'))
      throw new Error('kill switch failed')
    } finally {
      setKillSwitchSaving(false)
    }
  }

  /**
   * 开启急停必须填原因：没有原因的急停事后无法回溯、也无法向业务方解释为什么 AI 突然不可用。
   * 解除则沿用当前已记录的原因，不强制再填一次。
   */
  const handleKillSwitchToggle = (next: boolean) => {
    if (!next) {
      Modal.confirm({
        className: 'custom-confirm-modal',
        icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
        title: t('aiOperationAuth.killSwitchConfirmOff'),
        content: `${t('aiOperationAuth.killSwitchTitle')}：${killSwitch?.reason || '-'}`,
        okText: t('common.confirm'),
        cancelText: t('common.cancel'),
        onOk: () => applyKillSwitch(false, killSwitch?.reason ?? ''),
      })
      return
    }
    Modal.confirm({
      className: 'custom-confirm-modal',
      icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
      title: t('aiOperationAuth.killSwitchConfirmTitle'),
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>{t('aiOperationAuth.killSwitchOnWarn')}</span></div>
          <div style={{ marginTop: 8 }}>
            <Input.TextArea
              rows={2}
              maxLength={200}
              showCount
              placeholder={t('aiOperationAuth.killSwitchReasonLabel')}
              onChange={(e) => { killSwitchReasonRef.current = e.target.value }}
            />
          </div>
        </div>
      ),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      okButtonProps: { danger: true },
      onOk: async () => {
        const reason = killSwitchReasonRef.current.trim()
        if (!reason) {
          message.warning(t('aiOperationAuth.killSwitchReasonRequired'))
          // 返回 rejected 让确认框保持打开，避免用户填了原因却被静默关掉
          return Promise.reject(new Error('reason required'))
        }
        await applyKillSwitch(true, reason)
        killSwitchReasonRef.current = ''
      },
    })
  }

  /* ── 表格列 ── */
  const toolColumns: ColumnsType<ToolPolicyRow> = [
    {
      title: t('aiOperationAuth.colToolName'), dataIndex: 'name', width: 130,
      render: (_, row) => (
        <div>
          <div>{row.name}</div>
          <div style={{ fontSize: 11, color: '#8C8C8C' }}>{row.code}</div>
        </div>
      ),
    },
    { title: t('aiOperationAuth.colMenuName'), dataIndex: 'menuName', width: 140 },
    {
      title: t('aiOperationAuth.colLevel'), dataIndex: 'level', width: 130, align: 'center',
      render: (v: ToolLevel) => (
        <Tag color={TOOL_LEVEL_META[v].tagColor} style={{ borderRadius: 4 }}>
          {v} · {t(`aiOperationAuth.levelName.${v}`)}
        </Tag>
      ),
    },
    {
      title: t('aiOperationAuth.colParams'), key: 'params', width: 100, align: 'center',
      render: (_, row) => (row.params.length
        ? t('aiOperationAuth.paramCount', { count: row.params.length })
        : <span style={{ color: '#BFBFBF' }}>--</span>),
    },
    { title: t('aiOperationAuth.colCallCount30d'), dataIndex: 'callCount30d', width: 110, align: 'right', render: (v: number) => (v ? v.toLocaleString() : <span style={{ color: '#BFBFBF' }}>0</span>) },
    { title: t('aiOperationAuth.colLastCalledAt'), dataIndex: 'lastCalledAt', width: 160, render: (v: string | null) => v ?? <span style={{ color: '#BFBFBF' }}>--</span> },
    {
      title: t('aiOperationAuth.colStatus'), dataIndex: 'status', width: 80, align: 'center',
      render: (_: unknown, row: ToolPolicyRow) => (
        <Switch
          checked={row.status === 1}
          checkedChildren={t('aiOperationAuth.enableAction')}
          unCheckedChildren={t('aiOperationAuth.disableAction')}
          onChange={() => handleToggleStatus(row)}
        />
      ),
    },
    { title: t('aiOperationAuth.colUpdatedBy'), dataIndex: 'updatedBy', width: 100, render: (v: string) => v || '-' },
    // 後端 LocalDateTime 序列化成 Unix 毫秒，直接渲染会把 1790183892000 印到页面上
    { title: t('aiOperationAuth.colUpdatedAt'), dataIndex: 'updatedAt', width: 160, render: (v: string) => formatEpochOrDash(v) },
    {
      title: t('common.action'), key: 'action', width: 140, align: 'center',
      render: (_, row) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" onClick={() => navigate(`/ai-operation-auth-edit?toolKey=${encodeURIComponent(row.code)}`)}>{t('common.edit')}</Button>
          <Button type="link" onClick={() => navigate(`/ai-operation-auth-log?toolKey=${encodeURIComponent(row.code)}`)}>{t('aiOperationAuth.toolCallLog')}</Button>
        </Space>
      ),
    },
  ]

  /** 工具授權主體：包進 Tab，與同屬「AI 操作授權」的賬號白名單並列 */
  const toolContent = (
    <>
      {/* 查詢區域 */}
      <div className="search-section">
        <Form layout="inline">
          <Form.Item label={t('aiOperationAuth.colToolName')}>
            <Input value={queryName} placeholder={t('aiOperationAuth.searchToolNamePh')} allowClear onChange={(e) => setQueryName(e.target.value)} />
          </Form.Item>
          <Form.Item label={t('aiOperationAuth.colMenuName')}>
            <Input value={queryMenu} placeholder={t('aiOperationAuth.searchMenuNamePh')} allowClear onChange={(e) => setQueryMenu(e.target.value)} />
          </Form.Item>
          <Form.Item label={t('aiOperationAuth.colLevel')}>
            <Select
              value={queryLevel}
              placeholder={t('aiOperationAuth.allOption')}
              allowClear
              options={TOOL_LEVELS.map((l) => ({ value: l, label: `${l} · ${t(`aiOperationAuth.levelName.${l}`)}` }))}
              onChange={(v) => setQueryLevel(v)}
            />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>{t('common.search')}</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>{t('common.reset')}</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 紧急熍断：后端能力早就有了，但全站没有任何入口，出事时管理员无法急停（深度测试实锤） */}
      <div
        style={{
          border: `1px solid ${killSwitch?.engaged ? '#FFCCC7' : '#f0f0f0'}`,
          background: killSwitch?.engaged ? '#FFF1F0' : '#fff',
          borderRadius: 8, padding: '16px 20px', marginBottom: 16,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <PoweroffOutlined style={{ color: killSwitch?.engaged ? '#FF4D4F' : '#8C8C8C' }} />
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('aiOperationAuth.killSwitchTitle')}</span>
            <Tag color={killSwitch?.engaged ? 'error' : 'success'} style={{ borderRadius: 4 }}>
              {killSwitch?.engaged ? t('aiOperationAuth.killSwitchOn') : t('aiOperationAuth.killSwitchOff')}
            </Tag>
          </div>
          <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 4 }}>{t('aiOperationAuth.killSwitchDesc')}</div>
          {killSwitch?.engaged && (
            <div style={{ fontSize: 12, color: '#595959', marginTop: 4 }}>
              {t('aiOperationAuth.killSwitchOperator')}：{killSwitch.operator}｜{t('aiOperationAuth.killSwitchReasonLabel')}
              ：{killSwitch.reason || '-'}｜{t('aiOperationAuth.killSwitchUpdatedAt')}：{formatEpochOrDash(killSwitch.updatedAt)}
            </div>
          )}
        </div>
        <Space>
          <Switch
            checked={!!killSwitch?.engaged}
            checkedChildren={t('aiOperationAuth.killSwitchOn')}
            unCheckedChildren={t('aiOperationAuth.killSwitchOff')}
            loading={killSwitchSaving}
            onChange={(next) => handleKillSwitchToggle(next)}
          />
        </Space>
      </div>

      {/* 權限等級圖例 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 16 }}>
        {TOOL_LEVELS.map((level) => {
          const meta = TOOL_LEVEL_META[level]
          return (
            <div
              key={level}
              style={{
                border: `1px solid ${meta.color}33`, background: `${meta.color}0D`, borderRadius: 10, padding: '12px 14px',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)', cursor: 'default',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-4px)'
                e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.1)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = 'none'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ fontWeight: 700, color: meta.color }}>{level}</span>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{t(`aiOperationAuth.levelName.${level}`)}</span>
              </div>
              <div style={{ fontSize: 11, color: '#8C8C8C', lineHeight: 1.5 }}>{t(`aiOperationAuth.levelDesc.${level}`)}</div>
              <div style={{ fontSize: 11, color: meta.color, marginTop: 4 }}>{t('aiOperationAuth.humanIntervention')}{t(`aiOperationAuth.levelHuman.${level}`)}</div>
            </div>
          )
        })}
      </div>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message={t('aiOperationAuth.manualPolicyTitle')}
        description={t('aiOperationAuth.manualPolicyDesc')}
      />

      {/* 操作區：右側新增 + 列配置 */}
      <div className="action-section">
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/ai-operation-auth-edit')}>{t('common.add')}</Button>
          {configComponent}
        </div>
      </div>

      <Table
        rowKey="id"
        size="middle"
        loading={loading}
        columns={toolColumns}
        dataSource={filteredTools}
        pagination={tablePagination(t)}
      />
    </>
  )

  return (
    <div className="content-area">
      {/* 賬號白名單按決策口徑歸屬本菜單：此前它只存在於無菜單入口的 /ai-quota-auth，管理員無處可改 */}
      <Tabs
        defaultActiveKey="tools"
        items={[
          { key: 'tools', label: t('aiOperationAuth.toolAuthTab'), children: toolContent },
          { key: 'whitelist', label: t('aiOperationAuth.whitelistTab'), children: <AccountWhitelistPanel /> },
        ]}
      />
    </div>
  )
}
