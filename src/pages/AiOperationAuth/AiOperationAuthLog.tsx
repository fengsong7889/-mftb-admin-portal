import { useState, useEffect } from 'react'
import {
  Alert,
  Table,
  Tag,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  FileSearchOutlined,
  ToolOutlined,
  HistoryOutlined,
} from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import DetailPageHeader from '../../components/DetailPageHeader'
import {
  fetchMockToolRegistry,
  TOOL_LEVEL_META,
} from '../../api/mock/aiPlatformMock'
import type { ToolDefinition, ToolLevel } from '../../api/mock/aiPlatformMock'

/** mock 調用日誌明細 */
function getMockLogs(tool: ToolDefinition): Array<Record<string, string>> {
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

export default function AiOperationAuthLog() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const toolId = searchParams.get('id') || ''

  const [tool, setTool] = useState<ToolDefinition | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!toolId) return
    let cancelled = false
    setLoading(true)
    fetchMockToolRegistry()
      .then((data) => {
        if (cancelled) return
        const found = data.find((t) => t.id === toolId)
        if (found) setTool(found)
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [toolId])

  const handleBack = () => navigate('/ai-operation-auth')

  const logColumns: ColumnsType<Record<string, string>> = [
    { title: '時間', dataIndex: 'time', width: 180 },
    { title: '操作人', dataIndex: 'operator', width: 120 },
    { title: '等級動作', dataIndex: 'action', width: 220 },
    {
      title: '結果', key: 'result',
      render: (_, row) => (
        <span style={{ color: row.result === '成功' ? '#52C41A' : '#FF4D4F' }}>{row.result}</span>
      ),
    },
  ]

  const meta = tool ? TOOL_LEVEL_META[tool.level as ToolLevel] : null

  return (
    <div className="content-area">
      {/* ── 页面头部 ── */}
      <DetailPageHeader
        title={tool ? `工具權控日誌 - ${tool.name}` : '工具權控日誌'}
        onBack={handleBack}
        tags={tool && meta ? (
          <Tag color={meta.tagColor} style={{ borderRadius: 4 }}>
            {tool.level} · {meta.name}
          </Tag>
        ) : undefined}
        meta={tool ? `${tool.code} · 近 30 天調用 ${tool.callCount30d.toLocaleString()} 次 · 最近：${tool.lastCalledAt ?? '--'}` : undefined}
      />

      {/* ── 工具概览卡片 ── */}
      {tool && meta && (
        <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#e6f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ToolOutlined style={{ fontSize: 14, color: '#1890ff' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>工具概覽</span>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            <div>
              <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 4 }}>工具名稱</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#262626' }}>{tool.name}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 4 }}>工具編碼</div>
              <div style={{ fontSize: 14, color: '#262626', fontFamily: 'monospace' }}>{tool.code}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 4 }}>對應業務菜單</div>
              <div style={{ fontSize: 14, color: '#262626' }}>{tool.menuName}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 4 }}>權限等級</div>
              <Tag color={meta.tagColor} style={{ borderRadius: 4 }}>{tool.level} · {meta.name}</Tag>
            </div>
          </div>
        </div>
      )}

      {/* ── 调用日志表格卡片 ── */}
      <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: '#f6ffed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <HistoryOutlined style={{ fontSize: 14, color: '#52c41a' }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>調用記錄</span>
          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
        </div>

        {tool && (
          <Alert
            type={tool.level === 'L0' ? 'warning' : 'success'}
            showIcon
            style={{ marginBottom: 16 }}
            message={`${tool.level} 等級工具`}
            description={`當前等級：${meta!.name}（${meta!.desc}）。所有 AI 調用、人工確認、審批記錄均留痕，供審計追溯。`}
          />
        )}

        <Table
          rowKey={(row) => row.time}
          size="small"
          loading={loading}
          columns={logColumns}
          dataSource={tool ? getMockLogs(tool) : []}
          pagination={false}
        />

        <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <FileSearchOutlined />
          演示數據；後端網關落地後將記錄完整調用鏈（請求 ID、參數摘要、執行結果、耗時）。
        </div>
      </div>
    </div>
  )
}
