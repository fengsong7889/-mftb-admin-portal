import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
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
import DetailPageHeader from '@/components/DetailPageHeader'
import {
  TOOL_LEVEL_META,
} from '@/api/mock/aiPlatformMock'
import type { ToolDefinition, ToolLevel } from '@/api/mock/aiPlatformMock'
import {
  fetchToolRegistry,
  fetchExecLogs,
  aggregateCallStats,
  type ExecLogRow,
} from '@/api/aiOperationAuth'
import { tablePagination, formatEpochOrDash } from '@/utils/tableDisplay'

/** 将后端 ExecLogRow 映射为展示行（保留旧 UI 字段命名，但内容真实） */
function toDisplayRow(row: ExecLogRow, t: TFunction): Record<string, string> {
  const resultLabel = row.decision === 'reject' || row.decision === 'approval_required'
    ? t('aiOperationAuth.resultRejected')
    : row.success === 1 ? t('aiOperationAuth.resultSuccess') : t('aiOperationAuth.resultFailed')
  const actionLabel = row.decision === 'reject'
    ? t('aiOperationAuth.actionRejected', { reason: row.rejectReason ?? '' })
    : row.decision === 'approval_required'
      ? t('aiOperationAuth.actionApprovalRequired')
      : row.success === 1
        ? t('aiOperationAuth.actionExecuted', { ms: row.elapsedMs ?? 0 })
        : t('aiOperationAuth.actionExecFailed', { reason: row.rejectReason ?? '' })
  return {
    // createdAt 是后端序列化的 Unix 毫秒，不格式化会把 1792368280000 直接印到页面上
    time: formatEpochOrDash(row.createdAt),
    tool: row.toolKey,
    operator: row.callerName ?? row.caller ?? '--',
    action: actionLabel,
    result: resultLabel,
    id: String(row.id),
  }
}

export default function AiOperationAuthLog() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  // V0 §B.2：入口同时支持 toolKey（新）/ id（旧回退）
  const toolKey = searchParams.get('toolKey') || ''
  const toolId = searchParams.get('id') || toolKey

  const [tool, setTool] = useState<ToolDefinition | null>(null)
  const [logs, setLogs] = useState<Record<string, string>[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    // 不带 toolKey 直接进来时不再白屏：该页本来就是审计台账，无参数就展示全部调用记录
    Promise.all([
      // 页头“近 30 天調用 / 最近”必须走日志聚合：不聚合时永远是 0 次，
      // 与下方列表实际条数直接矛盾（实测报出）
      fetchToolRegistry().then((rows) => aggregateCallStats(rows).catch(() => rows)),
      fetchExecLogs({ size: 50, ...(toolId ? { toolKey: toolId } : {}) }).catch(() => ({ records: [], total: 0 })),
    ])
      .then(([rows, logResult]) => {
        if (cancelled) return
        // 找不到就必须清空：SPA 内从 ?toolKey=xxx 改到无参数时，旧页头会仍挂着「工具權控日誌 - 賬戶餘額查詢 / 近 30 天 5 次」
        // 注意：变量名不能叫 t，会把 i18n 的 t 遮蔽掉（toDisplayRow 需要真正的翻译函数）
        const found = rows.find((item) => item.id === toolId || item.code === toolId)
        setTool((found as unknown as ToolDefinition | undefined) ?? null)
        setLogs(logResult.records.map((row) => toDisplayRow(row, t)))
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [toolId])

  const handleBack = () => navigate('/ai-operation-auth')

  const logColumns: ColumnsType<Record<string, string>> = [
    { title: t('aiOperationAuth.colTime'), dataIndex: 'time', width: 180 },
    // 不带 toolKey 看全部日志时，“哪个工具”是唯一区分维度，缺列只能逐行猜
    ...(toolId ? [] : [{ title: t('aiOperationAuth.colTool'), dataIndex: 'tool', width: 180 }]),
    { title: t('aiOperationAuth.colOperator'), dataIndex: 'operator', width: 160 },
    { title: t('aiOperationAuth.colAction'), dataIndex: 'action', width: 220 },
    {
      title: t('aiOperationAuth.colResult'), key: 'result',
      render: (_, row) => (
        <span style={{ color: row.result === t('aiOperationAuth.resultSuccess') ? '#52C41A' : '#FF4D4F' }}>{row.result}</span>
      ),
    },
  ]

  const meta = tool ? TOOL_LEVEL_META[tool.level as ToolLevel] : null

  return (
    <div className="content-area">
      {/* ── 页面头部 ── */}
      <DetailPageHeader
        title={tool
          ? t('aiOperationAuth.logTitleWithTool', { name: tool.name })
          : t('aiOperationAuth.logTitle')}
        onBack={handleBack}
        tags={tool && meta ? (
          <Tag color={meta.tagColor} style={{ borderRadius: 4 }}>
            {tool.level} · {t(`aiOperationAuth.levelName.${tool.level}`)}
          </Tag>
        ) : undefined}
        meta={tool
          ? t('aiOperationAuth.logHeaderMeta', {
            code: tool.code,
            count: tool.callCount30d.toLocaleString(),
            time: tool.lastCalledAt ?? '--',
          })
          : undefined}
      />

      {/* ── 工具概览卡片 ── */}
      {tool && meta && (
        <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#e6f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ToolOutlined style={{ fontSize: 14, color: '#1890ff' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('aiOperationAuth.overviewTitle')}</span>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            <div>
              <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 4 }}>{t('aiOperationAuth.colToolName')}</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#262626' }}>{tool.name}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 4 }}>{t('aiOperationAuth.colToolCode')}</div>
              <div style={{ fontSize: 14, color: '#262626', fontFamily: 'monospace' }}>{tool.code}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 4 }}>{t('aiOperationAuth.colMenuName')}</div>
              <div style={{ fontSize: 14, color: '#262626' }}>{tool.menuName}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 4 }}>{t('aiOperationAuth.colLevel')}</div>
              <Tag color={meta.tagColor} style={{ borderRadius: 4 }}>{tool.level} · {t(`aiOperationAuth.levelName.${tool.level}`)}</Tag>
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
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('aiOperationAuth.logSectionTitle')}</span>
          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
        </div>

        {tool && (
          <Alert
            type={tool.level === 'L0' ? 'warning' : 'success'}
            showIcon
            style={{ marginBottom: 16 }}
            message={t('aiOperationAuth.levelToolAlert', { level: tool.level })}
            description={t('aiOperationAuth.levelToolAlertDesc', {
              name: t(`aiOperationAuth.levelName.${tool.level}`),
              desc: t(`aiOperationAuth.levelDesc.${tool.level}`),
            })}
          />
        )}

        <Table
          rowKey={(row) => row.id ?? row.time}
          size="small"
          loading={loading}
          columns={logColumns}
          dataSource={logs}
          pagination={tablePagination(t)}
        />

        <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <FileSearchOutlined />
          {t('aiOperationAuth.logSource')}
        </div>
      </div>
    </div>
  )
}
