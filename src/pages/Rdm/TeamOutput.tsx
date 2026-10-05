/**
 * 部門與人員產出 —— 吞吐与负载的复盘页（M4+ 从总看板拆出）
 *
 * 为什么独立成页：
 * 1. 总看板回答「这周整体怎么样」，一屏自上而下读完；这页回答
 *    「哪个部门吞吐低、哪位产品经理长期超载」，是要停下来逐行看的。
 * 2. 与「產出積分」分工明确：积分是**绩效结果**（可追溯、可申诉的分），
 *    这里是在途负载与交付事实（找瓶颈用），不进绩效口径。放同一页会被误读成打分依据。
 * 3. 分发时看「谁有空」已有更贴近动作的入口（需求池 → 分配页的候选人负载），
 *    本页定位是周期性复盘，不替代那个动作。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Progress, Space, Spin, Table, Tag, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { PieChartOutlined, ReloadOutlined, RiseOutlined, TeamOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import StatCards from '../../components/StatCards'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import { fetchDashboard, type RdmDashboardData } from '../../api/rdm'
import './index.css'

type DeptRow = RdmDashboardData['deptRank'][number]
type PmRow = RdmDashboardData['pmRank'][number]

/** 按时率配色：与看板一致，避免同一指标在两页给出不同颜色暗示 */
const rateColor = (v: number) => (v >= 0.8 ? '#52C41A' : v >= 0.6 ? '#FA8C16' : '#FF4D4F')

export default function TeamOutput() {
  const navigate = useNavigate()
  const [data, setData] = useState<RdmDashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await fetchDashboard('month'))
    } catch (err) {
      // 该接口是静默请求，不在这里说就等于页面空白
      const text = err instanceof Error && err.message ? err.message : '產出數據載入失敗'
      setError(text)
      message.error(text)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const deptRank = data?.deptRank ?? []
  const pmRank = data?.pmRank ?? []

  const deptMeta = useMemo(() => ([
    { key: 'deptName', title: '部門' },
    { key: 'submitted', title: '提交需求' },
    { key: 'delivered', title: '已交付' },
    { key: 'onTimeRate', title: '按時交付率' },
    { key: 'avgDays', title: '平均交付天數' },
    { key: 'action', title: '操作' },
  ]), [])
  const pmMeta = useMemo(() => ([
    { key: 'pmName', title: '產品經理' },
    { key: 'active', title: '在途需求' },
    { key: 'delivered', title: '已交付' },
    { key: 'overdue', title: '逾期' },
    { key: 'avgDays', title: '平均交付天數' },
  ]), [])
  const deptCfg = useColumnConfig('rdm-output-dept', deptMeta, [
    { key: 'deptName', visible: true, locked: 'head' as const },
    { key: 'action', visible: true, locked: 'tail' as const },
  ])
  const pmCfg = useColumnConfig('rdm-output-pm', pmMeta, [
    { key: 'pmName', visible: true, locked: 'head' as const },
  ])

  const overloaded = pmRank.filter(p => p.active > 6)
  const slowDepts = deptRank.filter(d => d.avgDays > 20)

  const deptColumns: TableColumnsType<DeptRow> = [
    { title: '部門', dataIndex: 'deptName', key: 'deptName', width: 180 },
    {
      title: '提交需求', dataIndex: 'submitted', key: 'submitted', width: 110,
      sorter: (a, b) => a.submitted - b.submitted,
      render: (v: number) => <span style={{ fontWeight: 600 }}>{v}</span>,
    },
    { title: '已交付', dataIndex: 'delivered', key: 'delivered', width: 100 },
    {
      title: '按時交付率', key: 'onTimeRate', width: 200,
      render: (_, r) => (
        <Space size={8}>
          <Progress
            percent={Math.round(r.onTimeRate * 100)}
            size="small"
            style={{ width: 90 }}
            strokeColor={rateColor(r.onTimeRate)}
          />
          <span style={{ fontSize: 12, color: '#595959' }}>{Math.round(r.onTimeRate * 100)}%</span>
        </Space>
      ),
    },
    {
      title: '平均交付天數', dataIndex: 'avgDays', key: 'avgDays', width: 130,
      sorter: (a, b) => a.avgDays - b.avgDays,
      render: (v: number) => (
        <span style={{ color: v > 20 ? '#CF1322' : '#595959' }}>{v.toFixed(1)} 天</span>
      ),
    },
    {
      title: '操作', key: 'action', width: 90,
      // 命名不叫「詳情」：跳的是需求台账按部门筛出的清单，不是本行的详情页
      render: () => <Button type="link" size="small" onClick={() => navigate('/rdm-requirement?scope=all')}>明細</Button>,
    },
  ]

  const pmColumns: TableColumnsType<PmRow> = [
    { title: '產品經理', dataIndex: 'pmName', key: 'pmName', width: 140 },
    {
      title: '在途需求', dataIndex: 'active', key: 'active', width: 110,
      sorter: (a, b) => a.active - b.active,
      render: (v: number) => <Tag color={v > 6 ? 'orange' : 'blue'} style={{ margin: 0 }}>{v}</Tag>,
    },
    { title: '已交付', dataIndex: 'delivered', key: 'delivered', width: 100 },
    {
      title: '逾期', dataIndex: 'overdue', key: 'overdue', width: 90,
      render: (v: number) => <span style={{ color: v > 0 ? '#CF1322' : '#52C41A' }}>{v}</span>,
    },
    {
      title: '平均交付天數', dataIndex: 'avgDays', key: 'avgDays', width: 140,
      render: (v: number) => `${v.toFixed(1)} 天`,
    },
  ]

  if (loading && !data) {
    return (
      <div className="content-area" style={{ textAlign: 'center', padding: 80 }}>
        <Spin size="large" />
      </div>
    )
  }

  return (
    <div className="content-area">
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, flexWrap: 'wrap', marginBottom: 16,
      }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#262626', display: 'flex', alignItems: 'center', gap: 8 }}>
          <TeamOutlined style={{ color: '#1890FF' }} />
          部門與人員產出
          <span style={{ fontSize: 12, fontWeight: 400, color: '#8C8C8C' }}>
            吞吐 · 按時率 · 在途負載（復盤找瓶頸用，不是績效打分依據）
          </span>
        </div>
        <Space size={8} wrap>
          <Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>
          <Button onClick={() => navigate('/rdm-score')}>產出積分</Button>
          <Button onClick={() => navigate('/rdm-dashboard')}>交付看板</Button>
        </Space>
      </div>

      {error && !data && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message="產出數據載入失敗"
          description={`${error}。可點「刷新」重試。`}
        />
      )}

      <div style={{ marginBottom: 16 }}>
        <StatCards
          animationKey="team-output"
          items={[
            { key: 'dept', icon: <PieChartOutlined />, value: deptRank.length, label: '有需求的部門', color: 'info' },
            { key: 'pm', icon: <TeamOutlined />, value: pmRank.length, label: '在崗產品經理', color: 'brand' },
            { key: 'overload', icon: <RiseOutlined />, value: overloaded.length, label: '在途超 6 條的人', color: overloaded.length > 0 ? 'brand' : 'success' },
            { key: 'slow', icon: <RiseOutlined />, value: slowDepts.length, label: '平均交付超 20 天的部門', color: slowDepts.length > 0 ? 'system' : 'success' },
          ]}
        />
      </div>

      {(overloaded.length > 0 || slowDepts.length > 0) && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="負載與周期已偏出常態"
          description={(
            <span>
              {overloaded.length > 0 && `在途偏多：${overloaded.map(p => p.pmName).join('、')}。`}
              {slowDepts.length > 0 && `交付偏慢：${slowDepts.map(d => d.deptName).join('、')}。`}
              建議先在需求池調整分發，或與提出人對齊排期，而不是繼續接單。
            </span>
          )}
        />
      )}

      <div className="rdm-card" style={{ marginBottom: 16 }}>
        <div className="rdm-card-title">
          <span className="rdm-icon-block" style={{ background: '#E6F7FF', color: '#1890FF' }}><PieChartOutlined /></span>
          部門需求產出（{deptRank.length}）
          <span className="rdm-card-title-split" />
          {deptCfg.configComponent}
        </div>
        <Table<DeptRow>
          className="nowrap-table"
          rowKey="deptName"
          size="small"
          loading={loading}
          columns={deptCfg.applyConfig(deptColumns) as TableColumnsType<DeptRow>}
          dataSource={deptRank}
          scroll={{ x: 900 }}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showQuickJumper: true,
            pageSizeOptions: ['10', '20', '50', '100'],
            showTotal: t => `共 ${t} 條`,
          }}
        />
      </div>

      <div className="rdm-card">
        <div className="rdm-card-title">
          <span className="rdm-icon-block" style={{ background: '#F9F0FF', color: '#722ED1' }}><TeamOutlined /></span>
          產品經理負載（{pmRank.length}）
          <span className="rdm-card-title-split" />
          {pmCfg.configComponent}
        </div>
        <Table<PmRow>
          className="nowrap-table"
          rowKey="pmName"
          size="small"
          loading={loading}
          columns={pmCfg.applyConfig(pmColumns) as TableColumnsType<PmRow>}
          dataSource={pmRank}
          scroll={{ x: 700 }}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showQuickJumper: true,
            pageSizeOptions: ['10', '20', '50', '100'],
            showTotal: t => `共 ${t} 條`,
          }}
        />
      </div>
    </div>
  )
}
