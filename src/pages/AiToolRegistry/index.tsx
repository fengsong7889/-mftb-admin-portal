import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Checkbox,
  Drawer,
  Form,
  Input,
  Modal,
  Radio,
  Select,
  Switch,
  Table,
  Tag,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  SearchOutlined,
  ReloadOutlined,
  PlusOutlined,
  FileSearchOutlined,
  ToolOutlined,
} from '@ant-design/icons'
import {
  fetchMockToolRegistry,
  TOOL_LEVEL_META,
} from '../../api/mock/aiPlatformMock'
import type { ToolDefinition, ToolLevel, ToolParam } from '../../api/mock/aiPlatformMock'
import { useColumnConfig } from '../../hooks/useColumnConfig'

/* ────────────────── 展示常量 ────────────────── */

/** 全部權限等級（有序） */
const TOOL_LEVELS: ToolLevel[] = ['L0', 'L1', 'L2', 'L3', 'L4']

/** 參數白名單示意（新增行模板） */
const EMPTY_PARAM: ToolParam = { name: '', type: 'string', required: false, whitelist: [], desc: '' }

export default function AiToolRegistry() {
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

  const { configComponent, applyConfig } = useColumnConfig('ai-tool-registry', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  /* ── 編輯抽屜 ── */
  const [editingTool, setEditingTool] = useState<ToolDefinition | 'new' | null>(null)
  const [toolForm] = Form.useForm()
  const [draftParams, setDraftParams] = useState<ToolParam[]>([])

  const openToolForm = (tool: ToolDefinition | 'new') => {
    setEditingTool(tool)
    if (tool === 'new') {
      toolForm.resetFields()
      setDraftParams([])
    } else {
      toolForm.setFieldsValue({ name: tool.name, code: tool.code, menuName: tool.menuName, level: tool.level, description: tool.description })
      setDraftParams(tool.params.map((p) => ({ ...p })))
    }
  }

  const handleToolSave = () => {
    toolForm.validateFields().then((values) => {
      const params = draftParams.filter((p) => p.name.trim() !== '')
      if (editingTool === 'new') {
        setTools((prev) => [...prev, { id: `t${Date.now()}`, status: 1, callCount30d: 0, lastCalledAt: null, ...values, params, updatedBy: 'admin', updatedAt: new Date().toISOString() } as ToolDefinition])
      } else if (editingTool) {
        setTools((prev) => prev.map((t) => (t.id === editingTool.id ? { ...t, ...values, params, updatedBy: 'admin', updatedAt: new Date().toISOString() } : t)))
      }
      setEditingTool(null)
      message.success('工具已保存，權限等級即時生效')
    })
  }

  const handleParamChange = (index: number, patch: Partial<ToolParam>) => {
    setDraftParams((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)))
  }

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

  /* ── 調用日誌抽屜 ── */
  const [logTool, setLogTool] = useState<ToolDefinition | null>(null)

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
        <>
          <Button type="link" onClick={() => openToolForm(row)}>編輯</Button>
          <Button type="link" onClick={() => setLogTool(row)}>調用日誌</Button>
        </>
      ),
    },
  ]

  /* ── 調用日誌列（mock 明細） ── */
  const logColumns: ColumnsType<Record<string, string>> = [
    { title: '時間', dataIndex: 'time', width: 160 },
    { title: '操作人', dataIndex: 'operator', width: 100 },
    { title: '等級動作', dataIndex: 'action', width: 130 },
    { title: '結果', key: 'result', render: (_, row) => <span style={{ color: row.result === '成功' ? '#52C41A' : '#FF4D4F' }}>{row.result}</span> },
  ]

  const mockLogs = (tool: ToolDefinition): Array<Record<string, string>> => {
    if (tool.level === 'L0') {
      return [
        { time: '2026-09-01 15:32:08', operator: 'chenwei', action: 'AI 請求調用（攔截）', result: '已攔截並提示人工處理' },
      ]
    }
    if (tool.level === 'L1') {
      return [
        { time: '2026-09-02 10:24:18', operator: 'liuyang', action: 'AI 直接調用', result: '成功' },
        { time: '2026-09-02 09:11:52', operator: 'zhaomin', action: 'AI 直接調用', result: '成功' },
      ]
    }
    if (tool.level === 'L2') {
      return [
        { time: '2026-08-31 09:12:44', operator: 'zhaomin', action: 'AI 生成草稿 → 用戶確認', result: '成功' },
        { time: '2026-08-30 16:05:31', operator: 'chenwei', action: 'AI 生成草稿 → 用戶確認', result: '成功' },
      ]
    }
    return [
      { time: '2026-08-30 11:05:56', operator: 'zhaomin', action: 'AI 發起 → 主管審批通過', result: '成功' },
    ]
  }

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
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openToolForm('new')}>新增</Button>
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

      {/* 新增/編輯工具抽屜 */}
      <Drawer
        title={editingTool === 'new' ? '新增工具' : `編輯工具 - ${editingTool?.name ?? ''}`}
        open={editingTool !== null}
        onClose={() => setEditingTool(null)}
        width={640}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
            <Button onClick={() => setEditingTool(null)}>取消</Button>
            <Button type="primary" onClick={handleToolSave}>保存</Button>
          </div>
        }
      >
        <Form form={toolForm} layout="vertical">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="name" label="工具名稱" rules={[{ required: true, message: '請輸入工具名稱' }]}>
              <Input placeholder="如：訂單查詢" />
            </Form.Item>
            <Form.Item name="code" label="工具編碼" rules={[{ required: true, message: '請輸入工具編碼' }, { pattern: /^[a-z][a-z0-9_]*$/, message: '小寫字母開頭，僅含小寫字母/數字/下劃線' }]}>
              <Input placeholder="如：order_query" disabled={editingTool !== 'new'} />
            </Form.Item>
          </div>
          <Form.Item name="menuName" label="對應業務菜單" rules={[{ required: true, message: '請輸入對應業務菜單' }]}>
            <Input placeholder="如：推廣訂單管理" />
          </Form.Item>
          <Form.Item name="level" label="權限等級" rules={[{ required: true, message: '請選擇權限等級' }]}>
            <Radio.Group>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {TOOL_LEVELS.map((level) => {
                  const meta = TOOL_LEVEL_META[level]
                  return (
                    <Radio key={level} value={level}>
                      <span style={{ color: meta.color, fontWeight: 600 }}>{level} · {meta.name}</span>
                      <span style={{ fontSize: 12, color: '#8C8C8C', marginLeft: 8 }}>{meta.desc}（{meta.human}）</span>
                    </Radio>
                  )
                })}
              </div>
            </Radio.Group>
          </Form.Item>
          <Form.Item name="description" label="工具描述（供 AI 理解何時調用）">
            <Input.TextArea rows={2} placeholder="描述該工具的能力與適用場景，將作為 Function Calling 的 description 下發給模型" />
          </Form.Item>

          {/* 參數白名單 */}
          <div style={{ fontSize: 14, fontWeight: 600, margin: '16px 0 8px' }}>
            <ToolOutlined style={{ marginRight: 6, color: '#E8720C' }} />參數白名單
          </div>
          <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 12 }}>
            AI 只能使用預定義的參數；「白名單取值」留空表示允許自由輸入，填寫後僅可從列舉值中選擇，防止構造越權參數。
          </div>
          <Table
            rowKey={(row) => row.name || `new-${draftParams.indexOf(row)}`}
            size="small"
            columns={[
              { title: '參數名', dataIndex: 'name', width: 120, render: (_, row) => <Input size="small" value={row.name} onChange={(e) => handleParamChange(draftParams.indexOf(row), { name: e.target.value })} placeholder="參數名" /> },
              {
                title: '類型', dataIndex: 'type', width: 100, render: (_, row) => (
                  <Select
                    size="small"
                    style={{ width: '100%' }}
                    value={row.type}
                    onChange={(v) => handleParamChange(draftParams.indexOf(row), { type: v })}
                    options={[{ value: 'string', label: 'string' }, { value: 'number', label: 'number' }, { value: 'boolean', label: 'boolean' }]}
                  />
                ),
              },
              {
                title: '必填', dataIndex: 'required', width: 60, align: 'center', render: (_, row) => (
                  <Checkbox checked={row.required} onChange={(e) => handleParamChange(draftParams.indexOf(row), { required: e.target.checked })} />
                ),
              },
              {
                title: '白名單取值（逗號分隔，留空=自由輸入）', dataIndex: 'whitelist', render: (_, row) => (
                  <Input size="small" value={row.whitelist.join(', ')} onChange={(e) => handleParamChange(draftParams.indexOf(row), { whitelist: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} placeholder="如：pending, paid, refunded" />
                ),
              },
              {
                title: '操作', key: 'op', width: 60, align: 'center', render: (_, row) => (
                  <Button type="link" danger size="small" onClick={() => setDraftParams((prev) => prev.filter((p) => p !== row))}>刪除</Button>
                ),
              },
            ]}
            dataSource={draftParams}
            pagination={false}
            footer={() => (
              <Button size="small" type="dashed" block icon={<PlusOutlined />} onClick={() => setDraftParams((prev) => [...prev, { ...EMPTY_PARAM }])}>添加參數</Button>
            )}
          />
        </Form>
      </Drawer>

      {/* 調用日誌抽屜 */}
      <Drawer
        title={`調用日誌 - ${logTool?.name ?? ''}`}
        open={logTool !== null}
        onClose={() => setLogTool(null)}
        width={620}
      >
        {logTool && (
          <>
            <Alert
              type={logTool.level === 'L0' ? 'warning' : 'success'}
              showIcon
              style={{ marginBottom: 16 }}
              message={`${logTool.level} 等級工具`}
              description={`當前等級：${TOOL_LEVEL_META[logTool.level].name}（${TOOL_LEVEL_META[logTool.level].desc}）。所有 AI 調用、人工確認、審批記錄均留痕，供審計追溯。`}
            />
            <Table
              rowKey={(row) => row.time}
              size="small"
              columns={logColumns}
              dataSource={mockLogs(logTool)}
              pagination={false}
            />
            <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <FileSearchOutlined />演示數據；後端網關落地後將記錄完整調用鏈（請求 ID、參數摘要、執行結果、耗時）。
            </div>
          </>
        )}
      </Drawer>
    </div>
  )
}
