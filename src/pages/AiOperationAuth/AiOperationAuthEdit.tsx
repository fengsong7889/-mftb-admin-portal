import { useState, useEffect } from 'react'
import {
  Button,
  Checkbox,
  Form,
  Input,
  Radio,
  Select,
  Table,
  Tag,
  message,
} from 'antd'
import {
  ArrowLeftOutlined,
  SaveOutlined,
  ToolOutlined,
} from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  fetchMockToolRegistry,
  TOOL_LEVEL_META,
} from '../../api/mock/aiPlatformMock'
import type { ToolDefinition, ToolLevel, ToolParam } from '../../api/mock/aiPlatformMock'

const TOOL_LEVELS: ToolLevel[] = ['L0', 'L1', 'L2', 'L3', 'L4']
const EMPTY_PARAM: ToolParam = { name: '', type: 'string', required: false, whitelist: [], desc: '' }

export default function AiOperationAuthEdit() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const toolId = searchParams.get('id') || ''
  const isEditMode = !!toolId
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [draftParams, setDraftParams] = useState<ToolParam[]>([])

  /* ── 加载编辑数据 ── */
  useEffect(() => {
    if (!toolId) return
    let cancelled = false
    setLoading(true)
    fetchMockToolRegistry()
      .then((data) => {
        if (cancelled) return
        const tool = data.find((t) => t.id === toolId)
        if (tool) {
          form.setFieldsValue({
            name: tool.name,
            code: tool.code,
            menuName: tool.menuName,
            level: tool.level,
            description: tool.description,
          })
          setDraftParams(tool.params.map((p) => ({ ...p })))
        }
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [toolId, form])

  const handleBack = () => navigate('/ai-operation-auth')

  const handleSave = () => {
    form.validateFields().then(() => {
      message.success('工具已保存，權限等級即時生效')
      navigate('/ai-operation-auth')
    })
  }

  const handleParamChange = (index: number, patch: Partial<ToolParam>) => {
    setDraftParams((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)))
  }

  const pageTitle = isEditMode ? '編輯工具權控' : '新增工具權控'

  return (
    <div className="content-area">
      {/* ── 页面头部 ── */}
      <div style={{
        position: 'relative', background: '#fff', marginBottom: 16,
        borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden',
      }}>
        <div style={{
          height: 3, background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
          backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite',
        }} />
        <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Button
              type="primary"
              icon={<ArrowLeftOutlined />}
              onClick={handleBack}
              style={{
                backgroundColor: '#E8720C', borderColor: '#E8720C',
                borderRadius: 8, height: 36, padding: '0 16px',
                display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            >返回</Button>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>{pageTitle}</h2>
          </div>
        </div>
      </div>

      {/* ── 基本信息模块 ── */}
      <Form form={form} layout="vertical" initialValues={{ level: 'L1' }}>
      <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: '#e6f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ToolOutlined style={{ fontSize: 14, color: '#1890ff' }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>基本信息</span>
          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
        </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Form.Item name="name" label="工具名稱" rules={[{ required: true, message: '請輸入工具名稱' }]}>
              <Input placeholder="如：訂單查詢" />
            </Form.Item>
            <Form.Item name="code" label="工具編碼" rules={[{ required: true, message: '請輸入工具編碼' }, { pattern: /^[a-z][a-z0-9_]*$/, message: '小寫字母開頭，僅含小寫字母/數字/下劃線' }]}>
              <Input placeholder="如：order_query" disabled={isEditMode} />
            </Form.Item>
          </div>
          <Form.Item name="menuName" label="對應業務菜單" rules={[{ required: true, message: '請輸入對應業務菜單' }]}>
            <Input placeholder="如：推廣訂單管理" />
          </Form.Item>
          <Form.Item name="description" label="工具描述（供 AI 理解何時調用）">
            <Input.TextArea rows={2} placeholder="描述該工具的能力與適用場景，將作為 Function Calling 的 description 下發給模型" />
          </Form.Item>
      </div>

      {/* ── 权限等级模块 ── */}
      <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: '#fff7e6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ToolOutlined style={{ fontSize: 14, color: '#fa8c16' }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>權限等級</span>
          <Tag color="orange" style={{ marginLeft: 4, fontSize: 11 }}>核心配置</Tag>
          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
        </div>

          <Form.Item name="level" label="權限等級" rules={[{ required: true, message: '請選擇權限等級' }]}>
            <Radio.Group>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
      </div>
      </Form>

      {/* ── 参数白名单模块 ── */}
      <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: '#f9f0ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ToolOutlined style={{ fontSize: 14, color: '#722ed1' }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>參數白名單</span>
          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
        </div>
        <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 16 }}>
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
            <Button size="small" type="dashed" block icon={<span>+</span>} onClick={() => setDraftParams((prev) => [...prev, { ...EMPTY_PARAM }])}>添加參數</Button>
          )}
        />
      </div>

      {/* ── 底部操作按钮 ── */}
      <div className="form-footer">
        <Button onClick={handleBack}>取消</Button>
        <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={loading}>
          保存
        </Button>
      </div>
    </div>
  )
}
