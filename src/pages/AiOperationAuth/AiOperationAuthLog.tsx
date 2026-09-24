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
import { fetchToolRegistry, fetchExecLogs, type ExecLogRow } from '../../api/aiOperationAuth'

/** 将后端 ExecLogRow 映射为展示行（保留旧 UI 字段命名，但内容真实） */
function toDisplayRow(row: ExecLogRow): Record<string, string> {
  const resultLabel = row.decision === 'reject' || row.decision === 'approval_required'
    ? '已拦截'
    : row.success === 1 ? '成功' : '失败'
  const actionLabel = row.decision === 'reject'
    ? `AI 调用→策略拒绝 (${row.rejectReason ?? ''})`
    : row.decision === 'approval_required'
      ? `AI 调用→需审批凭证`
      : row.success === 1
        ? `AI 直接執行 (${row.elapsedMs ?? 0}ms)`
        : `AI 直接執行失敗 (${row.rejectReason ?? ''})`
  return {
    time: row.createdAt,
    operator: row.caller ?? '--',
    action: actionLabel,
    result: resultLabel,
    id: String(row.id),
  }
}

export default function AiOperationAuthLog() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  // V0 §B.2：入口同时支持 toolKey（新）/ id（旧回退）
  const toolKey = searchParams.get('toolKey') || ''
  const toolId = searchParams.get('id') || toolKey

  const [tool, setTool] = useState<ToolDefinition | null>(null)
  const [logs, setLogs] = useState<Record<string, string>[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!toolId) return
    let cancelled = false
    setLoading(true)
    Promise.all([
      fetchToolRegistry().catch(() => fetchMockToolRegistry()),
      fetchExecLogs({ toolKey: toolId, size: 50 }).catch(() => ({ records: [], total: 0 })),
    ])
      .then(([rows, logResult]) => {
        if (cancelled) return
        const found = rows.find((t) => t.id === toolId || t.code === toolId)
        if (found) setTool(found as unknown as ToolDefinition)
        setLogs(logResult.records.map(toDisplayRow))
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
          rowKey={(row) => row.id ?? row.time}
          size="small"
          loading={loading}
          columns={logColumns}
          dataSource={logs}
          pagination={false}
        />

        <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <FileSearchOutlined />
          日志来源：ai_tool_exec_log（参数以 SHA-256 前 16 位落库，不落敏感原文）。
        </div>
      </div>
    </div>
  )
}
