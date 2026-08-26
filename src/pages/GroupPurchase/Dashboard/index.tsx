import { useState, useEffect, useRef, useCallback } from 'react'
import { Table, Select, Button, Space, message } from 'antd'
import type { TableColumnsType } from 'antd'
import {
  ImportOutlined,
  DollarOutlined,
  ShoppingCartOutlined,
  RiseOutlined,
  TeamOutlined,
  FireOutlined,
  AccountBookOutlined,
} from '@ant-design/icons'
import { Line } from '@ant-design/charts'
import { useTranslation } from 'react-i18next'
import FlashSaleImportModal from '../../../components/FlashSaleImportModal'
import { fetchFlashSalePeriods, fetchFlashSaleOverview, importFlashSaleSummary } from '../../../api/flashSale'
import type { FlashSalePeriod, FlashSaleOverviewVO, FlashSaleSummaryDayVO } from '../../../api/flashSale'
import type { ParsedFlashSaleExcel } from '../../../utils/flashSaleImport'

/** 数字加载动画 Hook（1200ms 缓动） */
function useCountUp(target: number, duration = 1200) {
  const [value, setValue] = useState(0)
  const rafRef = useRef(0)
  useEffect(() => {
    const start = performance.now()
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(2, -10 * progress)
      setValue(target * (progress === 1 ? 1 : eased))
      if (progress < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [target, duration])
  return value
}

/** 动效数字 */
function AnimatedNumber({ value, decimals = 0, prefix = '', suffix = '' }: {
  value: number; decimals?: number; prefix?: string; suffix?: string
}) {
  const animated = useCountUp(value)
  return <span>{prefix}{animated.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{suffix}</span>
}

/** 环比箭头 */
function ChangeTag({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined) return <span style={{ fontSize: 11, color: '#BFBFBF' }}>環比 -</span>
  const up = value > 0
  const color = up ? '#52C41A' : value < 0 ? '#FF4D4F' : '#8C8C8C'
  return (
    <span style={{ fontSize: 11, color, fontWeight: 600 }}>
      環比 {up ? '↑' : value < 0 ? '↓' : ''}{Math.abs(value * 100).toFixed(1)}%
    </span>
  )
}

const fmtMoney = (v: number | null | undefined) =>
  v === null || v === undefined ? '-' : `MOP ${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtPct = (v: number | null | undefined) =>
  v === null || v === undefined ? '-' : `${(Number(v) * 100).toFixed(1)}%`

/** 团购管理 - 秒杀数据总览 */
export default function GroupPurchaseDashboard() {
  const { t } = useTranslation()
  const [periods, setPeriods] = useState<FlashSalePeriod[]>([])
  const [periodNo, setPeriodNo] = useState<number | undefined>(undefined)
  const [overview, setOverview] = useState<FlashSaleOverviewVO | null>(null)
  const [loading, setLoading] = useState(false)
  const [importVisible, setImportVisible] = useState(false)

  /** 加载总览 */
  const fetchOverview = useCallback(async (no?: number) => {
    setLoading(true)
    try {
      const data = await fetchFlashSaleOverview(no)
      setOverview(data)
    } catch (err) {
      message.error(err instanceof Error && err.message ? err.message : t('common.loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    fetchFlashSalePeriods().then(list => {
      setPeriods(list)
      const latest = list[0]?.periodNo
      setPeriodNo(latest)
      fetchOverview(latest)
    }).catch(() => { /* 静默 */ })
  }, [fetchOverview])

  /** 期数切换 */
  const handlePeriodChange = (value: number) => {
    setPeriodNo(value)
    fetchOverview(value)
  }

  /** 导入解析完成（按期数逐组导入） */
  const handleImportParsed = async (parsed: ParsedFlashSaleExcel) => {
    if (parsed.summaryByPeriod.length === 0) {
      message.warning('文件中未解析到匯總數據（sheet 名需包含「匯總」）')
      return
    }
    let success = 0
    let failed = 0
    for (const group of parsed.summaryByPeriod) {
      const result = await importFlashSaleSummary(group.periodNo, group.rows)
      success += result.successCount
      failed += result.errors.length
    }
    if (failed > 0) {
      message.warning(`導入完成：成功 ${success} 條，失敗 ${failed} 條`)
    } else {
      message.success(`導入成功 ${success} 條（含 ${parsed.summaryByPeriod.length} 個期數）`)
    }
    fetchOverview(periodNo)
  }

  const totals = overview?.totals ?? null
  const daily = overview?.daily ?? []

  /** 统计卡配置 */
  interface StatCard {
    label: string
    icon: React.ReactNode
    color: string
    bg: string
    value: number
    decimals: number
    prefix?: string
    suffix?: string
    multiplier?: number
    change: number | null | undefined
  }
  const statCards: StatCard[] = [
    { label: '總實付金額', icon: <DollarOutlined />, color: '#E8720C', bg: '#FFF7E6', value: totals?.totalActual ?? 0, decimals: 2, prefix: 'MOP ', change: totals?.actualChange },
    { label: '訂單總數', icon: <ShoppingCartOutlined />, color: '#1890FF', bg: '#E6F7FF', value: totals?.totalOrders ?? 0, decimals: 0, change: totals?.ordersChange },
    { label: '商品總銷量', icon: <RiseOutlined />, color: '#52C41A', bg: '#F6FFED', value: totals?.totalSales ?? 0, decimals: 0, change: totals?.salesChange },
    { label: '購買人數', icon: <TeamOutlined />, color: '#722ED1', bg: '#F9F0FF', value: totals?.buyers ?? 0, decimals: 0, change: totals?.buyersChange },
    { label: '動銷率', icon: <FireOutlined />, color: '#13C2C2', bg: '#E6FFFB', value: totals?.soldRate ?? 0, decimals: 1, suffix: '%', multiplier: 100, change: null },
    { label: '人均客單價', icon: <AccountBookOutlined />, color: '#EB2F96', bg: '#FFF0F6', value: totals?.avgOrderValue ?? 0, decimals: 2, prefix: 'MOP ', change: null },
  ]

  /** 每日明细（含合计行） */
  const tableData: FlashSaleSummaryDayVO[] = totals ? [...daily, totals] : daily

  /** 趋势图数据 */
  const chartData = daily.flatMap(d => [
    { date: d.statDate ?? '', metric: '總實付金額', value: Number(d.totalActual ?? 0) },
    { date: d.statDate ?? '', metric: '訂單總數', value: Number(d.totalOrders ?? 0) },
  ])

  const columns: TableColumnsType<FlashSaleSummaryDayVO> = [
    {
      title: '時間',
      dataIndex: 'statDate',
      key: 'statDate',
      width: 110,
      fixed: 'left',
      render: (val: string | null, record) =>
        record.totals
          ? <span style={{ fontWeight: 700, color: '#E8720C' }}>合計</span>
          : val,
    },
    { title: '總應付金額', dataIndex: 'totalPayable', key: 'totalPayable', width: 120, align: 'right', render: fmtMoney },
    { title: '總實付金額', dataIndex: 'totalActual', key: 'totalActual', width: 120, align: 'right', render: fmtMoney },
    { title: '訂單總數', dataIndex: 'totalOrders', key: 'totalOrders', width: 90, align: 'right' },
    { title: '商品總銷量', dataIndex: 'totalSales', key: 'totalSales', width: 100, align: 'right' },
    { title: '總商品數', dataIndex: 'totalProducts', key: 'totalProducts', width: 90, align: 'right' },
    { title: '動銷商品數', dataIndex: 'soldProducts', key: 'soldProducts', width: 100, align: 'right' },
    { title: '動銷率', dataIndex: 'soldRate', key: 'soldRate', width: 90, align: 'right', render: fmtPct },
    { title: '購買人數', dataIndex: 'buyers', key: 'buyers', width: 90, align: 'right' },
    { title: '復購人數', dataIndex: 'repurchaseBuyers', key: 'repurchaseBuyers', width: 90, align: 'right' },
    { title: '復購率', dataIndex: 'repurchaseRate', key: 'repurchaseRate', width: 90, align: 'right', render: fmtPct },
    { title: '人均客單價', dataIndex: 'avgOrderValue', key: 'avgOrderValue', width: 110, align: 'right', render: fmtMoney },
    { title: '應付環比', dataIndex: 'payableChange', key: 'payableChange', width: 90, align: 'right', render: (v: number | null) => <ChangeTag value={v} /> },
    { title: '實付環比', dataIndex: 'actualChange', key: 'actualChange', width: 90, align: 'right', render: (v: number | null) => <ChangeTag value={v} /> },
    { title: '訂單環比', dataIndex: 'ordersChange', key: 'ordersChange', width: 90, align: 'right', render: (v: number | null) => <ChangeTag value={v} /> },
    { title: '銷量環比', dataIndex: 'salesChange', key: 'salesChange', width: 90, align: 'right', render: (v: number | null) => <ChangeTag value={v} /> },
    { title: '人數環比', dataIndex: 'buyersChange', key: 'buyersChange', width: 90, align: 'right', render: (v: number | null) => <ChangeTag value={v} /> },
  ]

  return (
    <div className="content-area">
      {/* 顶部: 期数选择 + 导入 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#262626' }}>秒殺數據總覽</span>
        <Select
          style={{ width: 140 }}
          value={periodNo}
          onChange={handlePeriodChange}
          options={periods.map(p => ({ label: `第${p.periodNo}期`, value: p.periodNo }))}
        />
        <div style={{ marginLeft: 'auto' }}>
          <Space>
            <Button className="btn-import" icon={<ImportOutlined />} onClick={() => setImportVisible(true)}>
              批量導入
            </Button>
          </Space>
        </div>
      </div>

      {/* 统计卡 */}
      <div key={`${periodNo}-${totals?.totalActual ?? 0}`} style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 16, marginBottom: 20 }}>
        {statCards.map(card => (
          <div key={card.label} style={{
            borderRadius: 12, padding: 16, background: card.bg, border: `1px solid ${card.color}22`,
            textAlign: 'center', position: 'relative', overflow: 'hidden', cursor: 'default',
            transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.1)' }}
            onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' }}
          >
            <div style={{ fontSize: 20, color: card.color, marginBottom: 6 }}>{card.icon}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: card.color }}>
              <AnimatedNumber
                value={(card.value ?? 0) * (card.multiplier ?? 1)}
                decimals={card.decimals ?? 0}
                prefix={card.prefix ?? ''}
                suffix={card.suffix ?? ''}
              />
            </div>
            <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 4 }}>{card.label}</div>
            <div style={{ marginTop: 4 }}><ChangeTag value={card.change} /></div>
          </div>
        ))}
      </div>

      {/* 趋势图 */}
      {daily.length > 0 && (
        <div style={{ background: '#fff', borderRadius: 12, padding: '16px 20px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#262626', marginBottom: 12 }}>每日趨勢</div>
          <Line
            data={chartData}
            xField="date"
            yField="value"
            colorField="metric"
            height={260}
          />
        </div>
      )}

      {/* 每日明细 */}
      <Table
        columns={columns}
        dataSource={tableData}
        rowKey={r => r.statDate ?? 'totals'}
        loading={loading}
        pagination={false}
        scroll={{ x: 1800 }}
        size="middle"
      />

      {/* 批量导入弹窗 */}
      <FlashSaleImportModal
        open={importVisible}
        onClose={() => setImportVisible(false)}
        hint="支持秒殺數據分析 Excel（.xlsx / .xls），自動解析「匯總」sheet 的每日數據與合計（多期數一次導入）"
        onParsed={handleImportParsed}
      />
    </div>
  )
}
