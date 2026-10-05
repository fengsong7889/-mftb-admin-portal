/**
 * 效能量趋势 —— 日快照取数（M4）
 *
 * 设计口径：趋势必须"按天冻结"而不是每次实时算。实时算有两个死穴：
 * 一是需求量大时看板越看越慢，二是历史数据被后续修订改写（上周看的按时率这周变了）。
 * 所以本页读 rdm_metric_snapshot（每日 job 落一次），并把快照状态如实告诉用户。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Select, Space, Spin, Table, Tag, message } from 'antd'
import type { TableColumnsType } from 'antd'
import {
  AlertOutlined,
  BarChartOutlined,
  ClockCircleOutlined,
  DatabaseOutlined,
  ReloadOutlined,
  RiseOutlined,
} from '@ant-design/icons'
import { Line } from '@ant-design/charts'
import StatCards from '../../components/StatCards'
import { fetchMetricTrend, type RdmMetricPoint } from '../../api/rdm'
import { RDM_METRIC_DIM, RDM_METRIC_DIM_LABEL, type RdmMetricDim } from '../../constants/rdm'
import './index.css'

/**
 * 可查维度：必须与快照 job 实际写入的维度一致。
 * 快照目前只算 公司/部門/產品經理，所以不提供「個人」选项 ——
 * 给了就是选了永远空，不如不出现。
 */
const DIM_OPTIONS = [
  { value: RDM_METRIC_DIM.COMPANY, label: RDM_METRIC_DIM_LABEL[RDM_METRIC_DIM.COMPANY] },
  { value: RDM_METRIC_DIM.DEPT, label: RDM_METRIC_DIM_LABEL[RDM_METRIC_DIM.DEPT] },
  { value: RDM_METRIC_DIM.PM, label: RDM_METRIC_DIM_LABEL[RDM_METRIC_DIM.PM] },
]

/** 可选统计窗口 */
const RANGE_OPTIONS = [
  { value: 7, label: '近 7 天' },
  { value: 30, label: '近 30 天' },
  { value: 90, label: '近 90 天' },
]

/** 折线图指标定义（一次只画 2~3 条，多了读不出来） */
type SeriesKey = 'released' | 'submitted' | 'onTimeRate' | 'firstPassRate' | 'avgDeliveryDays'

const SERIES_OPTIONS: { value: SeriesKey; label: string }[] = [
  { value: 'submitted', label: '新提交量' },
  { value: 'released', label: '上線量' },
  { value: 'onTimeRate', label: '按時交付率' },
  { value: 'firstPassRate', label: '驗收一次通過率' },
  { value: 'avgDeliveryDays', label: '平均交付天數' },
]

/** 比率类指标要按百分比画，其余按原值 */
const RATE_KEYS: SeriesKey[] = ['onTimeRate', 'firstPassRate']

export default function MetricTrend() {
  const [dim, setDim] = useState<RdmMetricDim>(RDM_METRIC_DIM.COMPANY)
  const [days, setDays] = useState(30)
  const [series, setSeries] = useState<SeriesKey[]>(['released', 'onTimeRate', 'firstPassRate'])
  const [points, setPoints] = useState<RdmMetricPoint[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = await fetchMetricTrend({ dim, days })
      // 快照按日累积，展示时按日期正序（后端已排序，这里只兜底防御）
      setPoints([...list].sort((a, b) => a.statDate.localeCompare(b.statDate)))
    } catch {
      message.error('趨勢數據載入失敗')
    } finally {
      setLoading(false)
    }
  }, [dim, days])

  useEffect(() => { void load() }, [load])

  /** 图表数据：把选中的指标摊平成 {日期, 指标, 值} */
  const chartData = useMemo(() => {
    const rows: { date: string; type: string; value: number }[] = []
    points.forEach(p => series.forEach(key => {
      const raw = p[key] ?? 0
      rows.push({
        date: p.statDate.slice(5),
        type: SERIES_OPTIONS.find(s => s.value === key)?.label ?? key,
        value: RATE_KEYS.includes(key) ? Math.round(raw * 1000) / 10 : Math.round(raw * 10) / 10,
      })
    }))
    return rows
  }, [points, series])

  const latest = points[points.length - 1]

  const columns: TableColumnsType<RdmMetricPoint> = useMemo(() => [
    { title: '快照日期', dataIndex: 'statDate', key: 'statDate', width: 120 },
    { title: '存量需求', dataIndex: 'reqTotal', key: 'reqTotal', width: 100 },
    { title: '新提交', dataIndex: 'submitted', key: 'submitted', width: 90 },
    { title: '已受理', dataIndex: 'accepted', key: 'accepted', width: 90 },
    {
      title: '上線', dataIndex: 'released', key: 'released', width: 80,
      render: (v: number) => <span style={{ color: v > 0 ? '#52C41A' : '#8C8C8C' }}>{v}</span>,
    },
    {
      title: '逾期', dataIndex: 'overdue', key: 'overdue', width: 80,
      render: (v: number) => <span style={{ color: v > 0 ? '#CF1322' : '#8C8C8C' }}>{v}</span>,
    },
    {
      title: '響應時長', dataIndex: 'avgResponseHours', key: 'avgResponseHours', width: 110,
      render: (v: number) => `${v.toFixed(1)} h`,
    },
    {
      title: '交付週期', dataIndex: 'avgDeliveryDays', key: 'avgDeliveryDays', width: 110,
      render: (v: number) => `${v.toFixed(1)} 天`,
    },
    {
      title: '按時率', dataIndex: 'onTimeRate', key: 'onTimeRate', width: 100,
      render: (v: number) => <Tag color={v >= 0.8 ? 'success' : v >= 0.6 ? 'warning' : 'error'} style={{ margin: 0 }}>{Math.round(v * 100)}%</Tag>,
    },
    {
      title: '一次通過率', dataIndex: 'firstPassRate', key: 'firstPassRate', width: 120,
      render: (v: number) => `${Math.round(v * 100)}%`,
    },
    {
      title: '駁回率', dataIndex: 'rejectRate', key: 'rejectRate', width: 100,
      render: (v: number) => `${Math.round(v * 100)}%`,
    },
    { title: '返工', dataIndex: 'reworkCount', key: 'reworkCount', width: 80 },
    { title: '變更', dataIndex: 'changeCount', key: 'changeCount', width: 80 },
  ], [])

  return (
    <div className="content-area">
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, flexWrap: 'wrap', marginBottom: 16,
      }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#262626', display: 'flex', alignItems: 'center', gap: 8 }}>
          <BarChartOutlined style={{ color: '#1890FF' }} />
          效能量趨勢
          <span style={{ fontSize: 12, fontWeight: 400, color: '#8C8C8C' }}>
            按日快照取數，歷史數字不會因為後續修訂而變
          </span>
        </div>
        <Space size={8} wrap>
          <Select
            style={{ width: 130 }}
            value={dim}
            onChange={v => setDim(v as RdmMetricDim)}
            options={DIM_OPTIONS}
          />
          <Select
            style={{ width: 120 }}
            value={days}
            onChange={setDays}
            options={RANGE_OPTIONS}
          />
          <Select
            mode="multiple"
            style={{ minWidth: 220 }}
            placeholder="曲線指標"
            value={series}
            maxTagCount="responsive"
            onChange={v => setSeries(v as SeriesKey[])}
            options={SERIES_OPTIONS}
          />
          <Button icon={<ReloadOutlined />} onClick={() => void load()}>刷新</Button>
        </Space>
      </div>

      {points.length === 0 && !loading && (
        <Alert
          type="info"
          showIcon
          icon={<DatabaseOutlined />}
          style={{ marginBottom: 16 }}
          message="尚無效能量快照數據"
          description="快照由每日 job 彙總寫入（M4 後端）。看板此時顯示空態，是為了避免用實時算出的數字冒充歷史快照。"
        />
      )}

      {latest && (
        <div style={{ marginBottom: 16 }}>
          <StatCards
            animationKey={`${dim}-${days}-${latest.statDate}`}
            items={[
              { key: 'total', icon: <BarChartOutlined />, value: latest.reqTotal, label: '存量需求', color: 'info' },
              { key: 'released', icon: <RiseOutlined />, value: latest.released, label: '昨日上線', color: 'success' },
              { key: 'ontime', icon: <ClockCircleOutlined />, value: Math.round(latest.onTimeRate * 100), suffix: ' %', label: '按時交付率', color: latest.onTimeRate >= 0.8 ? 'success' : 'brand' },
              { key: 'pass', icon: <ClockCircleOutlined />, value: Math.round(latest.firstPassRate * 100), suffix: ' %', label: '驗收一次通過率', color: 'brand' },
              { key: 'cycle', icon: <ClockCircleOutlined />, value: Number(latest.avgDeliveryDays.toFixed(1)), decimals: 1, suffix: ' 天', label: '平均交付週期', color: 'system' },
              { key: 'overdue', icon: <AlertOutlined />, value: latest.overdue, label: '當日逾期', color: 'system' },
            ]}
          />
        </div>
      )}

      <div className="rdm-card">
        <div className="rdm-card-title">
          <span className="rdm-icon-block" style={{ background: '#E6F7FF', color: '#1890FF' }}><RiseOutlined /></span>
          {RDM_METRIC_DIM_LABEL[dim]} · 近 {days} 天走勢
          <span className="rdm-card-title-split" />
          <span style={{ fontSize: 12, color: '#8C8C8C', fontWeight: 400 }}>比率類右軸讀法為百分比</span>
        </div>
        <div style={{ height: 300 }}>
          {loading
            ? <div style={{ textAlign: 'center', padding: 90 }}><Spin /></div>
            : (
              <Line
                data={chartData}
                xField="date"
                yField="value"
                colorField="type"
                height={300}
                shapeField="smooth"
                scale={{ color: { range: ['#E8720C', '#1890FF', '#52C41A', '#722ED1', '#FA8C16'] } }}
                legend={{ color: { position: 'top', itemMarker: 'circle' } }}
                axis={{ x: { title: false }, y: { title: false } }}
              />
            )}
        </div>
      </div>

      <div className="rdm-card">
        <div className="rdm-card-title">
          <span className="rdm-icon-block" style={{ background: '#FFF7E6', color: '#E8720C' }}><DatabaseOutlined /></span>
          快照明細
          <span className="rdm-card-title-split" />
          <span style={{ fontSize: 12, color: '#8C8C8C', fontWeight: 400 }}>最新一天排在最前</span>
        </div>
        <Table<RdmMetricPoint>
          rowKey="statDate"
          size="small"
          loading={loading}
          columns={columns}
          dataSource={[...points].reverse()}
          scroll={{ x: 1400 }}
          pagination={{ pageSize: 10, showTotal: t => `共 ${t} 天` }}
        />
      </div>
    </div>
  )
}
