/**
 * 交付周报 —— 项目经理 / 技术负责人
 *
 * 设计口径：周报是「给老板看的一页纸」，所以先给结论（本周结果/效率/风险/质量），
 * 再给可下钻的明细表；导出内容与页面所见完全一致，避免两套数字。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, DatePicker, Select, Space, Spin, Table, Tag, message } from 'antd'
import type { TableColumnsType } from 'antd'
import {
  AlertOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  DownloadOutlined,
  FieldTimeOutlined,
  ReloadOutlined,
  RiseOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import RdmFormHeader from './components/RdmFormHeader'
import StatCards from '../../components/StatCards'
import { fetchIterations, fetchWeeklyReport, type RdmIterationItem, type RdmWeeklyReport } from '../../api/rdm'
import { exportWeeklyReport } from './weeklyReportExport'
import {
  RDM_RISK_COLOR,
  RDM_RISK_LABEL,
  RDM_STATUS_LABEL,
  type RdmRiskType,
  type RdmStatus,
} from '../../constants/rdm'
import './index.css'

const { RangePicker } = DatePicker

/** 快捷区间 */
/**
 * 快捷区间
 *
 * 每个预设直接给出起止日期（而不是“往前 N 天”）：上一周与本周的天数差相同，
 * 只比较天数会让两个标签同时高亮、而“近兩週”永远不高亮。
 */
const PRESETS: { label: string; range: () => [dayjs.Dayjs, dayjs.Dayjs] }[] = [
  { label: '本週', range: () => [dayjs().startOf('week'), dayjs()] },
  { label: '上週', range: () => [dayjs().subtract(1, 'week').startOf('week'), dayjs().subtract(1, 'week').endOf('week')] },
  { label: '近兩週', range: () => [dayjs().subtract(13, 'day'), dayjs()] },
]

/** 区间是否等于某个预设（按天比较，避开 Dayjs 实例引用差异） */
function sameRange(
  a: [dayjs.Dayjs, dayjs.Dayjs],
  b: [dayjs.Dayjs, dayjs.Dayjs],
): boolean {
  return a[0].isSame(b[0], 'day') && a[1].isSame(b[1], 'day')
}

export default function WeeklyReport() {
  const navigate = useNavigate()
  // 默认区间就是「本週」预设，避免进页面后三个快捷标签都不高亮
  const [range, setRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>(() => PRESETS[0].range())
  const [iterationCode, setIterationCode] = useState<string>()
  const [iterations, setIterations] = useState<RdmIterationItem[]>([])
  const [report, setReport] = useState<RdmWeeklyReport | null>(null)
  const [loading, setLoading] = useState(true)
  /** 加载失败原因：必须与「加载中」分开显示，否则错误态会被伪装成转圈假象永远不动 */
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    fetchIterations().then(setIterations).catch(() => setIterations([]))
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setReport(await fetchWeeklyReport({
        startDate: range[0]?.format('YYYY-MM-DD'),
        endDate: range[1]?.format('YYYY-MM-DD'),
        iterationCode,
      }))
    } catch (err) {
      // 该接口是静默请求（不走全局 message），所以这里必须自己说清为什么没数据
      const text = err instanceof Error && err.message ? err.message : '週報載入失敗'
      setError(text)
      message.error(text)
    } finally {
      setLoading(false)
    }
  }, [range, iterationCode])

  useEffect(() => { void load() }, [load])

  const handleExport = async () => {
    if (!report) {
      // 没数据时不能静默返回：用户点了没反应只会反复点或认为导出功能坏了
      message.warning(error ? '週報尚未載入成功，請先點「重試」載入完成後再導出' : '週報尚未載入完成，請稍後再試')
      return
    }
    setExporting(true)
    try {
      await exportWeeklyReport(report)
      message.success('週報已導出（含 6 個工作表）')
    } catch {
      message.error('導出失敗，請重試')
    } finally {
      setExporting(false)
    }
  }

  const releasedColumns: TableColumnsType<RdmWeeklyReport['released'][number]> = useMemo(() => [
    { title: '需求編號', dataIndex: 'reqNo', key: 'reqNo', width: 150 },
    {
      title: '標題', dataIndex: 'title', key: 'title',
      render: (v: string, r) => <a style={{ color: '#E8720C' }} onClick={() => navigate(`/rdm-detail?id=${r.reqId}`)}>{v}</a>,
    },
    { title: '關聯版本', dataIndex: 'versionNo', key: 'versionNo', width: 110, render: (v?: string | null) => v ?? '-' },
    { title: '產品經理', dataIndex: 'pmName', key: 'pmName', width: 110, render: (v?: string | null) => v ?? '-' },
    { title: '上線日期', dataIndex: 'actualReleaseDate', key: 'actualReleaseDate', width: 120, render: (v?: string | null) => v ?? '-' },
    {
      title: '滿意度', dataIndex: 'acceptanceScore', key: 'acceptanceScore', width: 100,
      render: (v?: number | null) => (v ? <span style={{ color: '#52C41A', fontWeight: 600 }}>{v} / 5</span> : '-'),
    },
  ], [navigate])

  const riskColumns: TableColumnsType<RdmWeeklyReport['risks'][number]> = useMemo(() => [
    { title: '需求編號', dataIndex: 'reqNo', key: 'reqNo', width: 150 },
    {
      title: '標題', dataIndex: 'title', key: 'title',
      render: (v: string, r) => <a style={{ color: '#E8720C' }} onClick={() => navigate(`/rdm-detail?id=${r.reqId}`)}>{v}</a>,
    },
    {
      title: '狀態', dataIndex: 'status', key: 'status', width: 130,
      render: (v: string) => <Tag style={{ margin: 0 }}>{RDM_STATUS_LABEL[v as RdmStatus] ?? v}</Tag>,
    },
    { title: '當前處理人', dataIndex: 'handler', key: 'handler', width: 120, render: (v?: string | null) => v ?? '-' },
    {
      title: '停留天數', dataIndex: 'days', key: 'days', width: 110,
      sorter: (a, b) => a.days - b.days,
      render: (v: number) => <span style={{ color: v > 7 ? '#CF1322' : '#595959' }}>{v} 天</span>,
    },
    {
      title: '風險', dataIndex: 'riskType', key: 'riskType', width: 130,
      render: (v: string) => {
        // 风险色是十六进制主题色，用描边标签承载，避免与 antd 预设色语义混淆
        const color = RDM_RISK_COLOR[v as RdmRiskType] ?? '#8C8C8C'
        return (
          <Tag style={{ margin: 0, color, borderColor: `${color}66`, background: `${color}12` }}>
            {RDM_RISK_LABEL[v as RdmRiskType] ?? v}
          </Tag>
        )
      },
    },
  ], [navigate])

  const deptColumns: TableColumnsType<RdmWeeklyReport['byDept'][number]> = useMemo(() => [
    { title: '部門', dataIndex: 'deptName', key: 'deptName', width: 160 },
    { title: '本週提交', dataIndex: 'submitted', key: 'submitted', width: 100 },
    { title: '已交付', dataIndex: 'delivered', key: 'delivered', width: 100 },
    { title: '逾期', dataIndex: 'overdue', key: 'overdue', width: 90, render: (v: number) => <span style={{ color: v > 0 ? '#CF1322' : '#52C41A' }}>{v}</span> },
    { title: '平均交付天數', dataIndex: 'avgDays', key: 'avgDays', width: 130, render: (v: number) => `${v.toFixed(1)} 天` },
  ], [])

  const nextColumns: TableColumnsType<RdmWeeklyReport['nextWeek'][number]> = useMemo(() => [
    { title: '需求編號', dataIndex: 'reqNo', key: 'reqNo', width: 150 },
    {
      title: '標題', dataIndex: 'title', key: 'title',
      render: (v: string, r) => <a style={{ color: '#E8720C' }} onClick={() => navigate(`/rdm-detail?id=${r.reqId}`)}>{v}</a>,
    },
    { title: '計劃上線', dataIndex: 'planReleaseDate', key: 'planReleaseDate', width: 120, render: (v?: string | null) => v ?? '-' },
    {
      title: '當前狀態', dataIndex: 'status', key: 'status', width: 130,
      render: (v: string) => <Tag style={{ margin: 0 }}>{RDM_STATUS_LABEL[v as RdmStatus] ?? v}</Tag>,
    },
  ], [navigate])

  if (loading && !report) {
    return <div className="content-area" style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
  }

  const s = report?.summary

  return (
    <div className="content-area">
      <RdmFormHeader
        title="交付週報"
        backText="返回看板"
        onBack={() => navigate('/rdm-dashboard')}
        badge={(
          <span style={{ fontSize: 12, fontWeight: 400, color: '#8C8C8C' }}>
            {report ? `${report.range.startDate} ~ ${report.range.endDate}` : error ? '載入失敗' : '載入中…'}
          </span>
        )}
        meta="先看結論再下鑽明細；導出的 Excel 與頁面同一份數據，不會出現兩套數字"
        right={(
          <Space size={8} wrap>
            <RangePicker
              value={range}
              allowClear={false}
              onChange={v => { if (v?.[0] && v[1]) setRange([v[0], v[1]]) }}
            />
            <Select
              style={{ width: 200 }}
              allowClear
              placeholder="按迭代統計（可選）"
              value={iterationCode}
              onChange={setIterationCode}
              options={iterations.map(i => ({ value: i.code, label: i.name }))}
            />
          </Space>
        )}
      />

      {/* 刷新与导出属于操作区（§E.2），不放页面头部右侧 */}
      <div className="action-section">
        <div className="action-section-left">
          <Button icon={<ReloadOutlined />} onClick={() => void load()}>刷新</Button>
          <Button className="btn-export" icon={<DownloadOutlined />} loading={exporting} onClick={handleExport}>導出週報</Button>
        </div>
      </div>

      <Space size={8} wrap style={{ marginBottom: 16 }}>
        {PRESETS.map(p => {
          const presetRange = p.range()
          const active = sameRange(range, presetRange)
          return (
            <Tag
              key={p.label}
              color={active ? 'orange' : 'default'}
              style={{ cursor: 'pointer', padding: '2px 10px', height: 26, display: 'inline-flex', alignItems: 'center' }}
              onClick={() => setRange(presetRange)}
            >
              {p.label}
            </Tag>
          )
        })}
        <Button type="link" size="small" onClick={() => navigate('/rdm-quality')}>看質量口徑</Button>
        <Button type="link" size="small" onClick={() => navigate('/rdm-version-trace')}>看版本追溯</Button>
      </Space>

      {/* 加载失败要给可见原因与重试入口，不能只留一个转圈或一句 toast 过后就什么都不说 */}
      {error && !report && (
        <Alert
          type="error"
          showIcon
          message="週報載入失敗"
          description={`${error}。可以點「重試」重新拉取，或換個時間區間試一下。`}
          style={{ marginBottom: 16 }}
          action={(
            <Button size="small" loading={loading} onClick={() => void load()}>重試</Button>
          )}
        />
      )}

      {s && (
        <>
          <div style={{ marginBottom: 16 }}>
            <StatCards
              animationKey={`${report?.range.startDate}-${report?.range.endDate}`}
              items={[
                { key: 'submitted', icon: <RiseOutlined />, value: s.submitted, label: '本週新提交', color: 'info' },
                { key: 'accepted', icon: <CheckCircleOutlined />, value: s.accepted, label: '產品受理', color: 'brand' },
                { key: 'released', icon: <CheckCircleOutlined />, value: s.released, label: '已上線', color: 'success' },
                { key: 'ontime', icon: <FieldTimeOutlined />, value: Math.round(s.onTimeRate * 100), suffix: ' %', label: '按時上線率', color: s.onTimeRate >= 0.8 ? 'success' : 'brand' },
                { key: 'firstpass', icon: <CheckCircleOutlined />, value: Math.round(s.firstPassRate * 100), suffix: ' %', label: '驗收一次通過率', color: s.firstPassRate >= 0.8 ? 'success' : 'system' },
                { key: 'overdue', icon: <AlertOutlined />, value: s.overdue, label: '逾期需求', color: 'system' },
              ]}
            />
          </div>

          {s.rework > 0 && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
              message={`本週驗收返工 ${s.rework} 次、需求變更 ${s.changes} 次`}
              description="返工與變更同時偏高，通常是 PRD 驗收標準寫不清或排期被壓縮；建議在下週計劃前先對齊口徑。"
            />
          )}

          <div className="rdm-card">
            <div className="rdm-card-title">
              <span className="rdm-icon-block" style={{ background: '#F6FFED', color: '#52C41A' }}><CheckCircleOutlined /></span>
              本期上線清單（{report?.released.length ?? 0}）
              <span className="rdm-card-title-split" />
              <span style={{ fontSize: 12, color: '#8C8C8C', fontWeight: 400 }}>每條都可點進需求看驗收結論與所屬版本</span>
            </div>
            <Table
              rowKey="reqId"
              size="small"
              columns={releasedColumns}
              dataSource={report?.released ?? []}
              pagination={false}
              locale={{ emptyText: '本期無上線需求' }}
            />
          </div>

          <div className="rdm-card">
            <div className="rdm-card-title">
              <span className="rdm-icon-block" style={{ background: '#FFF1F0', color: '#FF4D4F' }}><AlertOutlined /></span>
              風險清單（{report?.risks.length ?? 0}）
              <span className="rdm-card-title-split" />
            </div>
            <Table
              rowKey="reqId"
              size="small"
              columns={riskColumns}
              dataSource={report?.risks ?? []}
              pagination={false}
              scroll={{ x: 900 }}
              locale={{ emptyText: '當前沒有逾期或阻塞需求' }}
            />
          </div>

          <div className="rdm-quality-grid">
            <div className="rdm-card">
              <div className="rdm-card-title">
                <span className="rdm-icon-block" style={{ background: '#E6F7FF', color: '#1890FF' }}><RiseOutlined /></span>
                部門產出
                <span className="rdm-card-title-split" />
              </div>
              <Table
                rowKey="deptName"
                size="small"
                columns={deptColumns}
                dataSource={report?.byDept ?? []}
                pagination={false}
                scroll={{ x: 620 }}
              />
            </div>
            <div className="rdm-card">
              <div className="rdm-card-title">
                <span className="rdm-icon-block" style={{ background: '#F9F0FF', color: '#722ED1' }}><CalendarOutlined /></span>
                下週預計上線（{report?.nextWeek.length ?? 0}）
                <span className="rdm-card-title-split" />
              </div>
              <Table
                rowKey="reqId"
                size="small"
                columns={nextColumns}
                dataSource={report?.nextWeek ?? []}
                pagination={false}
                locale={{ emptyText: '下週暫無計劃上線的需求' }}
              />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
