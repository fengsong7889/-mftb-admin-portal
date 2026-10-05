/**
 * 质量口径 —— 验收一次通过率 / 返工 / 缺陷 / 满意度
 *
 * 设计口径：质量数据不是为了给研发打分，而是回答「哪一环在漏」。
 * 因此把「一次通过率」放在最前（它直接决定返工与交付周期），
 * 再给返工 TOP 需求与部门对比，让项目经理能定位到具体单据去追因。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Progress, Space, Spin, Table, Tag, Tooltip, message } from 'antd'
import type { TableColumnsType } from 'antd'
import {
  AlertOutlined,
  BarChartOutlined,
  BugOutlined,
  CheckCircleOutlined,
  ReloadOutlined,
  RiseOutlined,
  SmileOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { Column, Pie } from '@ant-design/charts'
import StatCards from '../../components/StatCards'
import { fetchQualityData, type RdmQualityData } from '../../api/rdm'
import { RDM_DEFECT_SEVERITY_COLOR, RDM_DEFECT_SEVERITY_LABEL, type RdmDefectSeverity } from '../../constants/rdm'
import './index.css'

/** 比率格式化（后端给 0..1 小数） */
const pct = (v: number) => `${Math.round(v * 100)}%`

/** 一次通过率的阈值色：<60% 红、<80% 橙、其余绿 */
function rateColor(rate: number): string {
  if (rate >= 0.8) return '#52C41A'
  if (rate >= 0.6) return '#FA8C16'
  return '#FF4D4F'
}

export default function QualityBoard() {
  const navigate = useNavigate()
  const [data, setData] = useState<RdmQualityData | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await fetchQualityData())
    } catch {
      message.error('質量數據載入失敗')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const reworkColumns: TableColumnsType<RdmQualityData['reworkRank'][number]> = useMemo(() => [
    {
      title: '需求', dataIndex: 'title', key: 'title',
      render: (v: string, r) => (
        <div style={{ lineHeight: 1.4 }}>
          <a style={{ color: '#E8720C' }} onClick={() => navigate(`/rdm-detail?id=${r.reqId}`)}>{v}</a>
          <div style={{ fontSize: 12, color: '#8C8C8C' }}>{r.reqNo}</div>
        </div>
      ),
    },
    { title: '提出部門', dataIndex: 'submitDeptName', key: 'submitDeptName', width: 130, render: (v?: string | null) => v ?? '-' },
    { title: '產品經理', dataIndex: 'pmName', key: 'pmName', width: 110, render: (v?: string | null) => v ?? '-' },
    {
      title: '返工次數', dataIndex: 'reworkCount', key: 'reworkCount', width: 110,
      sorter: (a, b) => a.reworkCount - b.reworkCount,
      render: (v: number) => <Tag color={v >= 2 ? 'error' : 'warning'} style={{ margin: 0 }}>{v} 次</Tag>,
    },
    {
      title: '最近退回原因', dataIndex: 'lastRejectReason', key: 'lastRejectReason', width: 240,
      render: (v?: string | null) => <span style={{ color: '#8C8C8C', fontSize: 12 }}>{v ?? '-'}</span>,
    },
    {
      title: '操作', key: 'action', width: 90,
      render: (_, r) => <Button type="link" size="small" onClick={() => navigate(`/rdm-detail?id=${r.reqId}`)}>查看驗收</Button>,
    },
  ], [navigate])

  const deptColumns: TableColumnsType<RdmQualityData['deptQuality'][number]> = useMemo(() => [
    { title: '部門', dataIndex: 'deptName', key: 'deptName', width: 150 },
    { title: '已驗收', dataIndex: 'accepted', key: 'accepted', width: 90 },
    {
      title: '一次通過率', key: 'firstPassRate', width: 190,
      sorter: (a, b) => a.firstPassRate - b.firstPassRate,
      render: (_, r) => (
        <Space size={8}>
          <Progress percent={Math.round(r.firstPassRate * 100)} size="small" style={{ width: 92 }} strokeColor={rateColor(r.firstPassRate)} />
          <span style={{ fontSize: 12, color: '#595959' }}>{pct(r.firstPassRate)}</span>
        </Space>
      ),
    },
    {
      title: '滿意度', dataIndex: 'avgScore', key: 'avgScore', width: 100,
      render: (v: number) => <span style={{ color: v >= 4.5 ? '#52C41A' : v >= 4 ? '#FA8C16' : '#FF4D4F' }}>{v.toFixed(1)} / 5</span>,
    },
    { title: '缺陷數', dataIndex: 'defectCount', key: 'defectCount', width: 90, render: (v: number) => <span style={{ color: v > 3 ? '#CF1322' : '#595959' }}>{v}</span> },
  ], [])

  if (loading || !data) {
    return <div className="content-area" style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
  }

  const { summary } = data
  const majorRate = summary.defectTotal > 0 ? summary.majorDefectCount / summary.defectTotal : 0

  return (
    <div className="content-area">
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, flexWrap: 'wrap', marginBottom: 16,
      }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#262626', display: 'flex', alignItems: 'center', gap: 8 }}>
          <BarChartOutlined style={{ color: '#722ED1' }} />
          交付質量口徑
          <span style={{ fontSize: 12, fontWeight: 400, color: '#8C8C8C' }}>
            一次通過率 · 返工 · 缺陷 · 滿意度（口徑來自驗收單與狀態流水）
          </span>
        </div>
        <Space size={8}>
          <Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>
          <Button onClick={() => navigate('/rdm-dashboard')}>交付看板</Button>
          <Button onClick={() => navigate('/rdm-weekly-report')}>週報</Button>
        </Space>
      </div>

      <div style={{ marginBottom: 16 }}>
        <StatCards
          animationKey="quality"
          items={[
            { key: 'accepted', icon: <CheckCircleOutlined />, value: summary.acceptedTotal, label: '已驗收需求', color: 'info' },
            { key: 'firstPass', icon: <RiseOutlined />, value: Math.round(summary.firstPassRate * 100), suffix: ' %', label: '驗收一次通過率', color: summary.firstPassRate >= 0.8 ? 'success' : 'brand' },
            { key: 'rework', icon: <AlertOutlined />, value: summary.reworkTotal, label: '返工次數', color: 'system' },
            { key: 'defect', icon: <BugOutlined />, value: summary.defectTotal, label: '缺陷（用例不通過）', color: 'system' },
            { key: 'major', icon: <BugOutlined />, value: summary.majorDefectCount, label: '致命/嚴重缺陷', color: 'brand' },
            { key: 'score', icon: <SmileOutlined />, value: Number(summary.avgScore.toFixed(1)), decimals: 1, suffix: ' / 5', label: '平均滿意度', color: 'success' },
          ]}
        />
      </div>

      {summary.firstPassRate < 0.7 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message={`驗收一次通過率 ${pct(summary.firstPassRate)}，返工 ${summary.reworkTotal} 次`}
          description="一次通過率低於 70% 通常說明提測前置檢查缺失（自測用例/數據口徑未對齊），建議查看下方返工 TOP 需求的退回原因並補齊提測準入。"
        />
      )}

      <div className="rdm-quality-grid">
        <div className="rdm-card">
          <div className="rdm-card-title">
            <span className="rdm-icon-block" style={{ background: '#FFF1F0', color: '#FF4D4F' }}><BugOutlined /></span>
            缺陷嚴重度分佈
            <span className="rdm-card-title-split" />
            <Tooltip title="致命/嚴重缺陷佔比過高時，即使按期上線也會帶來返工與客訴">
              <span style={{ fontSize: 12, color: majorRate > 0.25 ? '#CF1322' : '#8C8C8C', fontWeight: 400 }}>
                嚴重佔比 {pct(majorRate)}
              </span>
            </Tooltip>
          </div>
          <div style={{ height: 240 }}>
            <Pie
              data={data.defectBySeverity}
              angleField="value"
              colorField="name"
              radius={0.86}
              innerRadius={0.5}
              label={{ text: 'value', style: { fontWeight: 600 } }}
              legend={{ color: { position: 'right', itemMarker: 'circle' } }}
              scale={{ color: { range: Object.values(RDM_DEFECT_SEVERITY_COLOR) as string[] } }}
            />
          </div>
          <Space size={6} wrap style={{ marginTop: 8 }}>
            {data.defectBySeverity.map(d => {
              const key = Object.keys(RDM_DEFECT_SEVERITY_LABEL).find(k => RDM_DEFECT_SEVERITY_LABEL[k as RdmDefectSeverity] === d.name) as RdmDefectSeverity | undefined
              const color = key ? RDM_DEFECT_SEVERITY_COLOR[key] : '#8C8C8C'
              return <Tag key={d.name} style={{ margin: 0, color, borderColor: `${color}66`, background: `${color}12` }}>{d.name} {d.value}</Tag>
            })}
          </Space>
        </div>

        <div className="rdm-card">
          <div className="rdm-card-title">
            <span className="rdm-icon-block" style={{ background: '#F6FFED', color: '#52C41A' }}><SmileOutlined /></span>
            滿意度評分分佈
            <span className="rdm-card-title-split" />
          </div>
          <div style={{ height: 240 }}>
            <Column
              data={data.scoreDist}
              xField="name"
              yField="value"
              colorField="name"
              legend={false}
              axis={{ y: { title: '需求數' }, x: { title: false } }}
              scale={{ color: { range: ['#52C41A', '#95DE64', '#FAAD14', '#FF7A45', '#FF4D4F'] } }}
            />
          </div>
        </div>
      </div>

      <div className="rdm-card">
        <div className="rdm-card-title">
          <span className="rdm-icon-block" style={{ background: '#FFF7E6', color: '#E8720C' }}><AlertOutlined /></span>
          返工 TOP 需求
          <span className="rdm-card-title-split" />
          <span style={{ fontSize: 12, color: '#8C8C8C', fontWeight: 400 }}>返工次數來自驗收退回（uat_rejected）累計，點需求看退回原因</span>
        </div>
        <Table
          rowKey="reqId"
          size="small"
          columns={reworkColumns}
          dataSource={data.reworkRank}
          pagination={false}
          locale={{ emptyText: '本期沒有驗收退回，全部一次通過' }}
        />
      </div>

      <div className="rdm-card">
        <div className="rdm-card-title">
          <span className="rdm-icon-block" style={{ background: '#E6F7FF', color: '#1890FF' }}><BarChartOutlined /></span>
          部門質量對比
          <span className="rdm-card-title-split" />
        </div>
        <Table
          rowKey="deptName"
          size="small"
          columns={deptColumns}
          dataSource={data.deptQuality}
          pagination={false}
          scroll={{ x: 760 }}
        />
      </div>

      <div className="rdm-tip-card" style={{ marginTop: 4 }}>
        口徑說明：一次通過率 = 首次驗收即 pass 的需求數 / 已驗收需求數；缺陷數 = 驗收用例中 result 為 fail 的條數；
        有條件通過計入通過但保留遺留事項（可轉後續需求）。數據全部來自驗收單與 rdm_status_log，不做事後補算。
      </div>
    </div>
  )
}
