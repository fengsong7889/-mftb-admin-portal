/**
 * 迭代排期 —— 项目经理 / 技术负责人的容量视图
 *
 * 设计口径：排期不是把需求塞进某个日期，而是「产能 vs 已排工时」的对比。
 * 因此每行直接给出产能、已排任务工时与负载率，超载标红，避免拍脑袋承诺。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Progress, Space, Table, Tag, Tooltip, message } from 'antd'
import type { TableColumnsType } from 'antd'
import {
  AlertOutlined,
  FieldTimeOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import dayjs from 'dayjs'
import StatCards from '../../components/StatCards'
import { useAuth } from '../../contexts/AuthContext'
import { fetchIterations, type RdmIterationItem } from '../../api/rdm'
import {
  RDM_ITERATION_STATUS,
  RDM_ITERATION_STATUS_COLOR,
  RDM_ITERATION_STATUS_LABEL,
  RDM_ITERATION_TYPE,
  RDM_ITERATION_TYPE_COLOR,
  RDM_ITERATION_TYPE_LABEL,
  type RdmIterationStatus,
  type RdmIterationType,
} from '../../constants/rdm'
import './index.css'

/** 负载率：已排工时 / 产能，无产能时视为 0（不参与超载判断） */
function loadRate(row: RdmIterationItem): number {
  if (!row.capacityHours || row.capacityHours <= 0) return 0
  return Math.round(((row.taskHours ?? 0) / row.capacityHours) * 100)
}

export default function IterationPlan() {
  const navigate = useNavigate()
  const { hasPermission } = useAuth()
  const [rows, setRows] = useState<RdmIterationItem[]>([])
  const [loading, setLoading] = useState(true)
  // 菜单收敛后「產品需求處理」已退役，它的 edit 平移到需求清单；仍查退役 key 会让有编辑权的人也按不动
  const canEdit = hasPermission('rdm-delivery-iteration:edit') || hasPermission('rdm-requirement:edit')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = await fetchIterations()
      // 进行中的迭代优先，其次按开始日期倒序（最近的排期先看）
      setRows([...list].sort((a, b) => {
        const rank = (i: RdmIterationItem) => (i.status === RDM_ITERATION_STATUS.ACTIVE ? 0 : i.status === RDM_ITERATION_STATUS.PLANNING ? 1 : 2)
        const diff = rank(a) - rank(b)
        return diff !== 0 ? diff : (b.startDate ?? '').localeCompare(a.startDate ?? '')
      }))
    } catch {
      message.error('迭代載入失敗')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const stats = useMemo(() => ({
    total: rows.length,
    active: rows.filter(r => r.status === RDM_ITERATION_STATUS.ACTIVE).length,
    planning: rows.filter(r => r.status === RDM_ITERATION_STATUS.PLANNING).length,
    overloaded: rows.filter(r => loadRate(r) > 100).length,
    reqs: rows.reduce((s, r) => s + (r.reqCount ?? 0), 0),
    hours: rows.reduce((s, r) => s + (r.taskHours ?? 0), 0),
  }), [rows])

  const columns: TableColumnsType<RdmIterationItem> = [
    {
      title: '迭代', dataIndex: 'name', key: 'name', width: 220,
      render: (v: string, r) => (
        <div style={{ lineHeight: 1.4 }}>
          <div style={{ color: '#262626', fontWeight: 500 }}>{v}</div>
          <div style={{ fontSize: 12, color: '#8C8C8C' }}>{r.code}</div>
        </div>
      ),
    },
    {
      title: '類型', dataIndex: 'iterationType', key: 'iterationType', width: 100,
      render: (v?: string) => {
        // 历史数据可能没有类型，统一按常规迭代展示
        const key = (v ?? RDM_ITERATION_TYPE.SPRINT) as RdmIterationType
        const color = RDM_ITERATION_TYPE_COLOR[key] ?? '#8C8C8C'
        return <Tag style={{ margin: 0, color, borderColor: `${color}66`, background: `${color}12` }}>{RDM_ITERATION_TYPE_LABEL[key] ?? v ?? '-'}</Tag>
      },
    },
    {
      title: '起止', key: 'range', width: 190,
      render: (_, r) => {
        const days = r.startDate && r.endDate ? dayjs(r.endDate).diff(dayjs(r.startDate), 'day') + 1 : 0
        return (
          <span>
            {r.startDate ?? '-'} ~ {r.endDate ?? '-'}
            {days > 0 && <span style={{ color: '#8C8C8C', fontSize: 12, marginLeft: 6 }}>{days} 天</span>}
          </span>
        )
      },
    },
    {
      title: '狀態', dataIndex: 'status', key: 'status', width: 100,
      render: (v?: string) => (
        <Tag color={RDM_ITERATION_STATUS_COLOR[(v ?? RDM_ITERATION_STATUS.PLANNING) as RdmIterationStatus] ?? 'default'} style={{ margin: 0 }}>
          {RDM_ITERATION_STATUS_LABEL[(v ?? RDM_ITERATION_STATUS.PLANNING) as RdmIterationStatus] ?? v}
        </Tag>
      ),
    },
    { title: '負責人', dataIndex: 'ownerName', key: 'ownerName', width: 110, render: (v?: string | null) => v ?? '-' },
    { title: '需求數', dataIndex: 'reqCount', key: 'reqCount', width: 90, render: (v?: number) => v ?? 0 },
    { title: '任務數', dataIndex: 'taskCount', key: 'taskCount', width: 90, render: (v?: number) => v ?? 0 },
    {
      title: '產能 / 已排工時', key: 'capacity', width: 220,
      render: (_, r) => {
        const rate = loadRate(r)
        const over = rate > 100
        return (
          <Space size={8}>
            <Progress
              percent={Math.min(rate, 100)}
              size="small"
              status={over ? 'exception' : rate >= 85 ? 'active' : 'normal'}
              strokeColor={over ? '#FF4D4F' : rate >= 85 ? '#FA8C16' : '#52C41A'}
              style={{ width: 96 }}
            />
            <span style={{ fontSize: 12, color: over ? '#CF1322' : '#595959' }}>
              {(r.taskHours ?? 0).toFixed(0)} / {r.capacityHours ?? 0} h
            </span>
            {over && (
              <Tooltip title={`已排工時超出產能 ${rate - 100}%，建議順延低優需求或補充人力`}>
                <Tag color="error" icon={<AlertOutlined />} style={{ margin: 0 }}>超載</Tag>
              </Tooltip>
            )}
          </Space>
        )
      },
    },
    {
      title: '說明', dataIndex: 'remark', key: 'remark', ellipsis: true, render: (v?: string | null) => v ?? '-'
    },
    {
      title: '操作', key: 'action', width: 90, fixed: 'right',
      render: (_, r) => (
        canEdit
          ? <Button type="link" size="small" onClick={() => navigate(`/rdm-iteration-form?id=${r.id}`)}>編輯</Button>
          : <span style={{ color: '#8C8C8C', fontSize: 12 }}>僅查看</span>
      ),
    },
  ]

  /**
   * 列配置（§E.3）。
   * <p>注意 locked 只能写在第三个参数（defaultConfig）：hook 从 allColumns 里不读 locked，
   * 写在第二参数会既报错又静默失效。
   */
  const { configComponent, applyConfig } = useColumnConfig('rdm-iteration-plan', [
    { key: 'name', title: '迭代' },
    { key: 'iterationType', title: '類型' },
    { key: 'range', title: '起止' },
    { key: 'status', title: '狀態' },
    { key: 'ownerName', title: '負責人' },
    { key: 'reqCount', title: '需求數' },
    { key: 'taskCount', title: '任務數' },
    { key: 'capacity', title: '產能 / 已排工時' },
    { key: 'remark', title: '說明' },
    { key: 'action', title: '操作' },
  ], [
    { key: 'name', visible: true, locked: 'head' as const },
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  return (
    <div className="content-area">
      <div className="action-section">
        <div className="action-section-left">
          <Tag icon={<FieldTimeOutlined />} color="orange" style={{ height: 32, display: 'inline-flex', alignItems: 'center', padding: '0 12px', borderRadius: 6 }}>
            迭代產能用於「需求排期 → 任務工時」對賬，超載行請在排期前先處理
          </Tag>
          <Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>
          <Button onClick={() => navigate('/rdm-delivery')}>返回交付工作台</Button>
        </div>
        <div className="action-section-right">
          {canEdit && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/rdm-iteration-form')}>新增迭代</Button>
          )}
          {configComponent}
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <StatCards
          animationKey="iteration"
          items={[
            { key: 'total', icon: <FieldTimeOutlined />, value: stats.total, label: '迭代總數', color: 'info' },
            { key: 'active', icon: <FieldTimeOutlined />, value: stats.active, label: '進行中', color: 'brand' },
            { key: 'planning', icon: <FieldTimeOutlined />, value: stats.planning, label: '規劃中', color: 'system' },
            { key: 'over', icon: <AlertOutlined />, value: stats.overloaded, label: '超載迭代', color: 'system' },
            { key: 'req', icon: <FieldTimeOutlined />, value: stats.reqs, label: '已排需求', color: 'success' },
            { key: 'hours', icon: <FieldTimeOutlined />, value: Number(stats.hours.toFixed(1)), decimals: 1, suffix: ' h', label: '已排工時', color: 'info' },
          ]}
        />
      </div>

      <Table<RdmIterationItem>
        className="nowrap-table"
        rowKey="id"
        loading={loading}
        columns={applyConfig(columns) as TableColumnsType<RdmIterationItem>}
        dataSource={rows}
        scroll={{ x: 1500 }}
        pagination={{
          pageSize: 10,
          showSizeChanger: true,
          showQuickJumper: true,
          pageSizeOptions: ['10', '20', '50', '100'],
          showTotal: t => `共 ${t} 條`,
        }}
      />
    </div>
  )
}
