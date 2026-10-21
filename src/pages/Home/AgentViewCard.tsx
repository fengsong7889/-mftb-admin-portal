import { Button, Empty, Progress, Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { ArrowRightOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { AgentView, AgentViewColumn } from '../../api/agent'

/**
 * AI 助手结构化视图：指标卡 + 表格 + 口径备注。
 *
 * <p>为什么由服务端下发而不是前端解析 Markdown：列口径、状态标签、权限收敛
 * 都在服务端完成，前端只负责渲染，避免“模型再写一遍表格”带来的幻觉与口径漂移。
 * <p>安全：所有单元格按纯文本渲染，不注入 HTML；跳转仅接受站内以 "/" 开头的路径。
 */
export default function AgentViewCard({ view }: { view: AgentView }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const rows = view.rows ?? []
  const metrics = view.metrics ?? []
  const notes = view.notes ?? []

  const cell = (col: AgentViewColumn, raw: unknown) => {
    if (raw === null || raw === undefined || raw === '') return <span className="agent-view-empty-cell">--</span>
    const text = String(raw)
    if (col.type === 'tag') {
      const color = col.toneMap?.[text] ?? 'default'
      return <Tag color={color}>{text}</Tag>
    }
    if (col.type === 'progress') {
      const percent = Number(raw)
      if (Number.isFinite(percent)) {
        return (
          <span className="agent-view-progress">
            <Progress percent={Math.max(0, Math.min(100, percent))} size="small" showInfo={false} />
            <span>{text}</span>
          </span>
        )
      }
    }
    return <span>{text}</span>
  }

  const columns: ColumnsType<Record<string, unknown>> = (view.columns ?? []).map((col) => ({
    title: col.title,
    dataIndex: col.key,
    key: col.key,
    width: col.width,
    align: col.align,
    ellipsis: col.type === 'text',
    render: (raw: unknown) => cell(col, raw),
  }))

  const openLink = () => {
    const route = view.link?.route
    if (!route || !route.startsWith('/') || route.startsWith('//')) return
    navigate(route)
  }

  return (
    <section className="agent-view-card" aria-label={view.title}>
      <header className="agent-view-card__head">
        <div>
          <div className="agent-view-card__title">{view.title}</div>
          {view.subtitle && <div className="agent-view-card__subtitle">{view.subtitle}</div>}
        </div>
        {typeof view.total === 'number' && view.total > 0 && (
          <span className="agent-view-card__total">{t('home.agentView.total', { count: view.total })}</span>
        )}
      </header>

      {metrics.length > 0 && (
        <div className="agent-view-metrics">
          {metrics.map((m, i) => (
            <div key={`${m.label}-${i}`} className={`agent-view-metric agent-view-metric--${m.tone ?? 'default'}`}>
              <div className="agent-view-metric__label">{m.label}</div>
              <div className="agent-view-metric__value">
                {m.value}
                {m.unit && <span className="agent-view-metric__unit">{m.unit}</span>}
              </div>
              {m.hint && <div className="agent-view-metric__hint">{m.hint}</div>}
            </div>
          ))}
        </div>
      )}

      {rows.length > 0 ? (
        <Table<Record<string, unknown>>
          className="agent-view-table"
          size="small"
          bordered={false}
          columns={columns}
          dataSource={rows}
          pagination={false}
          rowKey={(_, index) => String(index ?? 0)}
          scroll={{ x: 'max-content' }}
        />
      ) : view.kind === 'table' ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('home.agentView.empty')} />
      ) : null}

      {notes.length > 0 && (
        <div className="agent-view-notes">
          {notes.map((n, i) => (
            <div key={i} className={`agent-view-note agent-view-note--${n.tone ?? 'info'}`}>
              {n.text}
            </div>
          ))}
        </div>
      )}

      {view.link && (
        <Button type="link" size="small" className="agent-view-link" onClick={openLink}>
          {view.link.label}
          <ArrowRightOutlined />
        </Button>
      )}
    </section>
  )
}
