/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Button, Form, Modal, Segmented, Select, Space, Table, Tag, message } from 'antd'
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { useColumnConfig } from '@/hooks/useColumnConfig'
import AnimatedNumber from '@/components/AnimatedNumber'
import { useAuth } from '@/contexts/AuthContext'
import {
  fetchCpmTeamBoard, remindCpmMember,
  type CpmTeamRow, type CpmTeamVO,
} from '@/api/cpm'
import { CPM_PERIOD_LABELS, CpmPeriod, type CpmPeriodValue } from './meta'
import { cpmPeriodRange } from './cpmPeriod'
import './cpm.css'

/**
 * P4 團隊匯報（cpm-team，治理侧）。
 *
 * 顺序铁律（§E.8 门禁）：搜索区 → 统计卡 → 操作区 → 表格；
 * 统计口径=当前筛选后的行集合，前端只做展示性换算（提交率等由服务端 stats 给出，
 * 不在前端重新定义「已提交」——两处定义必漂移）。
 * 催缴按钮只对 cpm-rule:trigger 授权者显示；提醒永远只发给未交者本人。
 */

export default function TeamReport() {
  const navigate = useNavigate()
  const { hasPermission } = useAuth()
  const canRemind = hasPermission('cpm-rule:trigger')

  const [form] = Form.useForm()
  const [periodType, setPeriodType] = useState<CpmPeriodValue>(CpmPeriod.WEEK)
  const [filters, setFilters] = useState<{ owner?: string; status?: string }>({})

  const [board, setBoard] = useState<CpmTeamVO | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const range = cpmPeriodRange(periodType, 0)
      setBoard(await fetchCpmTeamBoard(periodType, range.start.format('YYYY-MM-DD')))
      setLoadError(null)
    } catch (err) {
      setBoard(null)
      setLoadError(err instanceof Error ? err.message : '載入失敗')
    } finally {
      setLoading(false)
    }
  }, [periodType])

  useEffect(() => { void reload() }, [reload])

  const allRows = board?.rows ?? []
  const rows = allRows.filter(r =>
    (!filters.owner || r.name === filters.owner)
    && (!filters.status || (filters.status === 'published' ? r.submitStatus === 'published' : r.submitStatus !== 'published')),
  )
  const stats = board?.stats

  const handleQuery = () => {
    const v = form.getFieldsValue()
    setFilters({ owner: v.owner, status: v.status })
  }

  const handleReset = () => {
    form.resetFields()
    setFilters({})
  }

  const handleRemind = (row: CpmTeamRow) => {
    const range = cpmPeriodRange(periodType, 0)
    Modal.confirm({
      title: '確定發送提醒？',
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>成員：</span><b>{row.name}</b></div>
          <div className="confirm-info-row"><span>週期：</span><b>{CPM_PERIOD_LABELS[periodType]} {range.start.format('MM-DD')}</b></div>
          <div className="confirm-info-row"><span>通道：</span><b>站內 + 釘釘（dry-run 時僅登記 skipped）</b></div>
        </div>
      ),
      okText: '確認提醒',
      cancelText: '取消',
      onOk: async () => {
        await remindCpmMember(row.userId, periodType, range.start.format('YYYY-MM-DD'))
        message.success('提醒已登記')
        await reload()
      },
    })
  }

  const rawColumns = [
    { key: 'member', title: '成員', render: (_: unknown, r: CpmTeamRow) => (
      <Space direction="vertical" size={0}>
        <span style={{ fontWeight: 500 }}>{r.name}</span>
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{r.empId} · {r.department}</span>
      </Space>
    ) },
    { key: 'status', title: '提交狀態', render: (_: unknown, r: CpmTeamRow) => (
      r.submitStatus === 'published'
        ? <Tag color="green">已發布 {r.publishedAt ? String(r.publishedAt).slice(5, 16) : ''}</Tag>
        : <Tag color="orange">未提交</Tag>
    ) },
    { key: 'workload', title: '期間條目', render: (_: unknown, r: CpmTeamRow) => (
      r.submitStatus === 'published'
        ? <span>{r.totalItems ?? 0} 項 · 完成 {r.doneItems ?? 0}</span>
        : <span style={{ color: 'var(--text-3)' }}>—</span>
    ) },
    { key: 'delivered', title: '已讀/送達', render: (_: unknown, r: CpmTeamRow) => (
      r.submitStatus === 'published' ? <span>{r.readCount ?? 0} / {r.receiverCount ?? 0}</span> : <span style={{ color: 'var(--text-3)' }}>—</span>
    ) },
    { key: 'feedback', title: '評論/點讚', render: (_: unknown, r: CpmTeamRow) => (
      r.submitStatus === 'published' ? <span>{r.commentCount ?? 0} / {r.likeCount ?? 0}</span> : <span style={{ color: 'var(--text-3)' }}>—</span>
    ) },
    { key: 'recognized', title: '本期我認定', render: (_: unknown, r: CpmTeamRow) => (
      (r.recognizedByMe ?? 0) > 0
        ? <Tag color="purple">本期已認定 {r.recognizedByMe} 次</Tag>
        : <span style={{ color: 'var(--text-3)' }}>—</span>
    ) },
    { key: 'action', title: '操作', render: (_: unknown, r: CpmTeamRow) => (
      <Space size={0} split={<span className="action-split">|</span>}>
        {r.submitStatus === 'published' && r.reportId ? (
          <Button type="link" size="small" onClick={() => navigate(`/cpm-report-detail?id=${r.reportId}`)}>查看反饋</Button>
        ) : canRemind ? (
          <Button type="link" size="small" onClick={() => handleRemind(r)}>催繳提醒</Button>
        ) : (
          <span style={{ color: 'var(--text-3)', fontSize: 12 }}>未提交</span>
        )}
      </Space>
    ) },
  ]

  const { applyConfig, configComponent } = useColumnConfig(
    'cpm-team',
    rawColumns.map(c => ({ key: c.key as string, title: c.title as string })),
    [
      { key: 'member', visible: true, locked: 'head' as const },
      { key: 'action', visible: true, locked: 'tail' as const },
    ],
  )

  return (
    <div className="content-area">
      {loadError && (
        <Alert type="error" showIcon style={{ marginBottom: 14 }} message="團隊匯報載入失敗" description={loadError}
          action={<Button size="small" onClick={() => void reload()}>重試</Button>} />
      )}

      {/* 1. 搜索区（§E.1 四列 grid） */}
      <div className="search-section">
        <Form form={form} layout="inline" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px 12px' }}>
          <Form.Item name="owner" label="人員">
            <Select
              allowClear
              placeholder="全部成員"
              style={{ width: '100%' }}
              options={[...new Set(allRows.map(r => r.name))].map(name => ({ value: name, label: name }))}
            />
          </Form.Item>
          <Form.Item label="週期">
            <Segmented
              value={periodType}
              onChange={v => setPeriodType(v as CpmPeriodValue)}
              options={Object.values(CpmPeriod).map(p => ({ label: CPM_PERIOD_LABELS[p], value: p }))}
            />
          </Form.Item>
          <Form.Item name="status" label="狀態">
            <Select
              allowClear
              placeholder="全部"
              style={{ width: '100%' }}
              options={[{ value: 'published', label: '已發布' }, { value: 'missing', label: '未提交' }]}
            />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={handleQuery}>查詢</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>重置</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 2. 统计卡（搜索区下方，§E.8；数字口径来自服务端 stats，条件变化重触发动画） */}
      {stats && (
        <div className="cpm-stat-grid" key={`${filters.owner ?? 'all'}-${periodType}-${filters.status ?? 'all'}-${board?.periodStart}`}>
          <StatCard color="var(--info)" value={stats.submitRate} suffix="%" label={`本期提交 ${stats.publishedCount}/${stats.memberCount}`} />
          <StatCard color="var(--success)" value={stats.doneItemsTotal} suffix="" label={`期間完成（共 ${stats.itemsTotal} 項）`} />
          <StatCard color="var(--purple)" value={stats.recognitionSentCount} suffix="" label="本期我發出認定" />
          <StatCard color="var(--warning)" value={stats.pendingFeedbackCount} suffix="" label="已發布待反饋" />
        </div>
      )}

      {/* 3. 操作区（治理侧无新增，仅列配置） */}
      <div className="action-section">
        <div className="action-section-right">
          {configComponent}
        </div>
      </div>

      {/* 4. 表格 */}
      <Table
        rowKey={r => r.userId}
        columns={applyConfig(rawColumns)}
        dataSource={rows}
        loading={loading}
        pagination={{
          showSizeChanger: true,
          showQuickJumper: true,
          pageSizeOptions: ['10', '20', '50', '100'],
          showTotal: (total) => `共 ${total} 筆`,
        }}
        scroll={{ x: 'max-content' }}
      />
    </div>
  )
}

/* ==================== 统计卡（§B.7 动效标准） ==================== */

function StatCard({ color, value, suffix, label }: { color: string; value: number; suffix: string; label: string }) {
  return (
    <div className="cpm-stat-card" style={{ background: 'var(--surface-2)', border: `1px solid ${color}` }}>
      <div style={{ fontSize: 20, marginBottom: 2 }}>
        <span style={{ width: 10, height: 10, borderRadius: 5, background: color, display: 'inline-block' }} />
      </div>
      <div className="cpm-stat-card__value" style={{ color }}>
        <AnimatedNumber value={value} />{suffix}
      </div>
      <div className="cpm-stat-card__label">{label}</div>
    </div>
  )
}
