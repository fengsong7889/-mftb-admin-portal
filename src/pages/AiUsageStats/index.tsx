import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, DatePicker, Form, Select, Table } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import {
  SearchOutlined,
  ReloadOutlined,
  ApiOutlined,
  MessageOutlined,
  ImportOutlined,
  WalletOutlined,
} from '@ant-design/icons'
import { fetchUsageSummary } from '../../api/llmUsage'
import type { UsageSummary, UsageModelRow, UsageUserRow, CostEntry } from '../../api/llmUsage'
import AnimatedNumber from '../../components/AnimatedNumber'

const { RangePicker } = DatePicker

/** 幣種符號（金額按幣種分列展示：百煉 CNY、DeepSeek USD） */
const CURRENCY_SYMBOL: Record<string, string> = { CNY: '¥', USD: '$' }
const currencySymbol = (currency: string) => CURRENCY_SYMBOL[currency] ?? (currency ? `${currency} ` : '')

/** 格式化時間（後端 LocalDateTime 序列化為時間戳/字串均可解析） */
const formatTime = (value: string | number | null) => (value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '--')

/** 使用員工展示：姓名（工号），賬號無對應員工時回退登錄名 */
const employeeLabel = (row: { username: string; name?: string | null; empId?: string | null }) =>
  row.name ? `${row.name}（${row.empId || row.username}）` : row.username

/** 渲染費用列表（按幣種分行，無配置時顯示 --） */
const CostCells = ({ costs }: { costs: CostEntry[] }) => {
  if (costs.length === 0) return <span style={{ color: '#BFBFBF' }}>--</span>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {costs.map((entry) => (
        <span key={entry.currency || 'none'}>
          {currencySymbol(entry.currency)}{entry.cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
        </span>
      ))}
    </div>
  )
}

export default function AiUsageStats() {
  const navigate = useNavigate()

  /* ── 查詢條件（點「查詢」才生效） ── */
  const [dates, setDates] = useState<[Dayjs, Dayjs]>([dayjs().startOf('month'), dayjs()])
  const [username, setUsername] = useState<string | undefined>(undefined)
  const [tick, setTick] = useState(0)

  /* ── 數據 ── */
  const [summary, setSummary] = useState<UsageSummary | null>(null)
  const [loading, setLoading] = useState(false)

  /** 當前查詢範圍 */
  const rangeParams = useCallback(() => ({
    startDate: dates[0].format('YYYY-MM-DD'),
    endDate: dates[1].format('YYYY-MM-DD'),
    username,
  }), [dates, username])

  /** 加載模型 / 用戶消耗匯總 */
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchUsageSummary(rangeParams()).then((summaryData) => {
      if (!cancelled) setSummary(summaryData)
    }).catch(() => { /* 請求層已統一提示 */ }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [tick, rangeParams])

  const handleSearch = () => setTick((prev) => prev + 1)

  const handleReset = () => {
    setDates([dayjs().startOf('month'), dayjs()])
    setUsername(undefined)
    setTick((prev) => prev + 1)
  }

  /** 進入能耗明細：帶入當前日期範圍 + 模型 */
  const goModelDetail = (row: UsageModelRow) => {
    const params = new URLSearchParams({
      startDate: dates[0].format('YYYY-MM-DD'),
      endDate: dates[1].format('YYYY-MM-DD'),
      model: row.model,
    })
    navigate(`/ai-energy-detail?${params.toString()}`)
  }

  /** 進入能耗明細：帶入當前日期範圍 + 賬號 */
  const goUserDetail = (row: UsageUserRow) => {
    const params = new URLSearchParams({
      startDate: dates[0].format('YYYY-MM-DD'),
      endDate: dates[1].format('YYYY-MM-DD'),
      username: row.username,
    })
    navigate(`/ai-energy-detail?${params.toString()}`)
  }

  /* ── 表格列定義（統計列表均帶「明細」操作列，各列寬度適中） ── */
  const modelColumns: ColumnsType<UsageModelRow> = [
    { title: '模型', dataIndex: 'model', width: 180 },
    { title: '請求數', dataIndex: 'requests', width: 100, align: 'right', render: (v: number) => v.toLocaleString() },
    { title: '輸入 tokens', dataIndex: 'promptTokens', width: 120, align: 'right', render: (v: number) => v.toLocaleString() },
    { title: '輸出 tokens', dataIndex: 'completionTokens', width: 120, align: 'right', render: (v: number) => v.toLocaleString() },
    { title: '費用', key: 'costs', width: 140, align: 'right', render: (_, row) => <CostCells costs={row.costs} /> },
    {
      title: '操作', key: 'action', width: 90, align: 'center',
      render: (_, row) => <Button type="link" onClick={() => goModelDetail(row)}>明細</Button>,
    },
  ]

  const userColumns: ColumnsType<UsageUserRow> = [
    { title: '排名', key: 'rank', width: 70, align: 'center', render: (_v, _row, index) => index + 1 },
    { title: '使用員工', key: 'employee', width: 160, render: (_, row) => employeeLabel(row) },
    { title: '請求數', dataIndex: 'requests', width: 100, align: 'right', render: (v: number) => v.toLocaleString() },
    { title: '輸入 tokens', dataIndex: 'promptTokens', width: 120, align: 'right', render: (v: number) => v.toLocaleString() },
    { title: '輸出 tokens', dataIndex: 'completionTokens', width: 120, align: 'right', render: (v: number) => v.toLocaleString() },
    { title: '費用', key: 'costs', width: 150, align: 'right', render: (_, row) => <CostCells costs={row.costs} /> },
    { title: '最近使用', dataIndex: 'lastUsedAt', width: 170, render: formatTime },
    {
      title: '操作', key: 'action', width: 90, align: 'center',
      render: (_, row) => <Button type="link" onClick={() => goUserDetail(row)}>明細</Button>,
    },
  ]

  /* ── 數據指標卡（12.1 標準：圖標→數值→標籤，計數動畫 + 懸停上浮） ── */
  const totalCosts = summary?.costByCurrency ?? []
  const stats = [
    { label: '總請求數', value: <AnimatedNumber value={summary?.totalRequests ?? 0} />, icon: <MessageOutlined />, color: '#1890FF', bg: '#E6F7FF' },
    { label: '輸入 Tokens', value: <AnimatedNumber value={summary?.totalPromptTokens ?? 0} />, icon: <ImportOutlined />, color: '#722ED1', bg: '#F9F0FF' },
    { label: '輸出 Tokens', value: <AnimatedNumber value={summary?.totalCompletionTokens ?? 0} />, icon: <ApiOutlined />, color: '#E8720C', bg: '#FFF7E6' },
    {
      label: '總費用（分幣種）',
      value: totalCosts.length === 0
        ? <AnimatedNumber value={0} decimals={2} />
        : (
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {totalCosts.map((entry) => (
              <AnimatedNumber key={entry.currency || 'none'} value={entry.cost} prefix={currencySymbol(entry.currency)} decimals={2} />
            ))}
          </span>
        ),
      icon: <WalletOutlined />, color: '#52C41A', bg: '#F6FFED',
    },
  ]

  return (
    <div className="content-area">
      {/* 查詢區域 */}
      <div className="search-section">
        <Form layout="inline">
          <Form.Item label="日期範圍">
            <RangePicker
              value={dates}
              allowClear={false}
              onChange={(values) => {
                if (values && values[0] && values[1]) setDates([values[0], values[1]])
              }}
            />
          </Form.Item>
          <Form.Item label="員工">
            <Select
              value={username}
              placeholder="全部"
              allowClear
              showSearch
              optionFilterProp="label"
              options={(summary?.byUser ?? []).map((row) => ({ value: row.username, label: employeeLabel(row) }))}
              onChange={(value) => setUsername(value)}
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

      {/* 數據指標統計卡（切換查詢條件時重新觸發計數動畫） */}
      <div
        key={`${tick}-${username ?? 'all'}`}
        style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 16 }}
      >
        {stats.map((stat, i) => (
          <div key={i} style={{
            padding: '16px', borderRadius: 12, background: stat.bg,
            border: `1px solid ${stat.color}22`, textAlign: 'center',
            transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)', cursor: 'default',
            position: 'relative', overflow: 'hidden',
          }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'translateY(-4px)'
              e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.1)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = 'none'
            }}
          >
            <div style={{ fontSize: 20, color: stat.color, marginBottom: 6 }}>{stat.icon}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: stat.color }}>{stat.value}</div>
            <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 2 }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* 按模型消耗匯總 */}
      <div style={{ fontSize: 15, fontWeight: 600, color: '#262626', margin: '4px 0 12px' }}>按模型消耗匯總</div>
      <Table
        rowKey="model"
        size="middle"
        loading={loading}
        columns={modelColumns}
        dataSource={summary?.byModel ?? []}
        pagination={false}
      />

      {/* 按員工消耗匯總 */}
      <div style={{ fontSize: 15, fontWeight: 600, color: '#262626', margin: '24px 0 12px' }}>按員工消耗匯總</div>
      <Table
        rowKey="username"
        size="middle"
        loading={loading}
        columns={userColumns}
        dataSource={summary?.byUser ?? []}
        pagination={false}
      />
    </div>
  )
}
