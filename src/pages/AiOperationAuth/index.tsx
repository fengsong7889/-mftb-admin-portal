import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Alert,
  Button,
  Modal,
  Select,
  Switch,
  Table,
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
} from '@ant-design/icons'
import {
  fetchMockToolRegistry,
  TOOL_LEVEL_META,
} from '../../api/mock/aiPlatformMock'
import type { ToolDefinition, ToolLevel } from '../../api/mock/aiPlatformMock'
import { useColumnConfig } from '../../hooks/useColumnConfig'

/* ────────────────── 展示常量 ────────────────── */

/** 全部權限等級（有序） */
const TOOL_LEVELS: ToolLevel[] = ['L0', 'L1', 'L2', 'L3', 'L4']

export default function AiOperationAuth() {
  const navigate = useNavigate()
  /* ── 數據 ── */
  const [tools, setTools] = useState<ToolDefinition[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchMockToolRegistry().then((data) => { if (!cancelled) setTools(data) }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
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
    { key: 'name', title: '工具名稱' },
    { key: 'code', title: '工具編碼' },
    { key: 'menuName', title: '對應菜單' },
    { key: 'level', title: '權限等級' },
    { key: 'description', title: '描述' },
    { key: 'callCount30d', title: '近30天調用次數' },
    { key: 'lastCalledAt', title: '最近調用時間' },
    { key: 'status', title: '狀態' },
    { key: 'updatedBy', title: '最後更新人' },
    { key: 'updatedAt', title: '最後更新時間' },
    { key: 'action', title: '操作' },
  ]

  const { configComponent, applyConfig } = useColumnConfig('ai-operation-auth', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  /* ── 工具啟停（二次確認） ── */
  const handleToggleStatus = (row: ToolDefinition) => {
    const toDisable = row.status === 1
    const actionText = toDisable ? '停用' : '啟用'
    Modal.confirm({
      title: `確認${actionText}該工具？`,
      content: `${actionText}後「${row.name}」將${toDisable ? '不再' : '恢復'}在 AI 對話中${toDisable ? '提供' : '提供'}該能力`,
      okText: '確認',
      cancelText: '取消',
      onOk: () => {
        setTools((prev) => prev.map((t) => (t.id === row.id ? { ...t, status: toDisable ? 0 : 1 } : t)))
        message.success(`${row.name} 已${actionText}`)
      },
    })
  }

  /* ── 表格列 ── */
  const toolColumns: ColumnsType<ToolDefinition> = [
    {
      title: '工具名稱', dataIndex: 'name', width: 130,
      render: (_, row) => (
        <div>
          <div>{row.name}</div>
          <div style={{ fontSize: 11, color: '#8C8C8C' }}>{row.code}</div>
        </div>
      ),
    },
    { title: '對應業務菜單', dataIndex: 'menuName', width: 140 },
    {
      title: '權限等級', dataIndex: 'level', width: 130, align: 'center',
      render: (v: ToolLevel) => (
        <Tag color={TOOL_LEVEL_META[v].tagColor} style={{ borderRadius: 4 }}>
          {v} · {TOOL_LEVEL_META[v].name}
        </Tag>
      ),
    },
    {
      title: '參數白名單', key: 'params', width: 100, align: 'center',
      render: (_, row) => (row.params.length ? `${row.params.length} 個` : <span style={{ color: '#BFBFBF' }}>--</span>),
    },
    { title: '近 30 天調用', dataIndex: 'callCount30d', width: 110, align: 'right', render: (v: number) => v.toLocaleString() },
    { title: '最近調用', dataIndex: 'lastCalledAt', width: 160, render: (v: string | null) => v ?? <span style={{ color: '#BFBFBF' }}>--</span> },
    {
      title: '狀態', dataIndex: 'status', width: 80, align: 'center',
      render: (_: unknown, row: ToolDefinition) => (
        <Switch
          checked={row.status === 1}
          checkedChildren="啟用"
          unCheckedChildren="停用"
          onChange={() => handleToggleStatus(row)}
        />
      ),
    },
    { title: '最後更新人', dataIndex: 'updatedBy', width: 100, render: (v: string) => v || '-' },
    { title: '最後更新時間', dataIndex: 'updatedAt', width: 160, render: (v: string) => v || '-' },
    {
      title: '操作', key: 'action', width: 140, align: 'center',
      render: (_, row) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" onClick={() => navigate(`/ai-operation-auth-edit?id=${row.id}`)}>編輯</Button>
          <Button type="link" onClick={() => navigate(`/ai-operation-auth-log?id=${row.id}`)}>調用日誌</Button>
        </Space>
      ),
    },
  ]

  return (
    <div className="content-area">
      {/* 智能中心 (AI) 菜單界面頂部沒有菜單名稱 */}

      {/* 查詢區域 */}
      <div className="search-section">
        <Form layout="inline">
          <Form.Item label="工具名稱">
            <Input value={queryName} placeholder="請輸入工具名稱" allowClear onChange={(e) => setQueryName(e.target.value)} />
          </Form.Item>
          <Form.Item label="對應菜單">
            <Input value={queryMenu} placeholder="請輸入業務菜單名稱" allowClear onChange={(e) => setQueryMenu(e.target.value)} />
          </Form.Item>
          <Form.Item label="權限等級">
            <Select
              value={queryLevel}
              placeholder="全部"
              allowClear
              options={TOOL_LEVELS.map((l) => ({ value: l, label: `${l} · ${TOOL_LEVEL_META[l].name}` }))}
              onChange={(v) => setQueryLevel(v)}
            />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>查詢</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>重置</Button>
            </div>
          </Form.Item>
        </Form>
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
                <span style={{ fontWeight: 600, fontSize: 13 }}>{meta.name}</span>
              </div>
              <div style={{ fontSize: 11, color: '#8C8C8C', lineHeight: 1.5 }}>{meta.desc}</div>
              <div style={{ fontSize: 11, color: meta.color, marginTop: 4 }}>人工介入：{meta.human}</div>
            </div>
          )
        })}
      </div>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="人工干預策略"
        description="L2 操作 AI 生成內容後需用戶在界面點擊「確認提交」才真正執行；L3 操作自動進入審批流；L0 操作 AI 僅提示前往對應菜單人工處理；涉及金額超過風控閾值的操作自動升級為 L0。"
      />

      {/* 操作區：右側新增 + 列配置 */}
      <div className="action-section">
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/ai-operation-auth-edit')}>新增</Button>
          {configComponent}
        </div>
      </div>

      <Table
        rowKey="id"
        size="middle"
        loading={loading}
        columns={toolColumns}
        dataSource={filteredTools}
        pagination={false}
      />

    </div>
  )
}
