/**
 * 用车办理 — 待办列表（车管视角）
 *
 * 顶部 4 张待办统计卡遵循数据指标统计卡标准（hover 上浮 + 计数动画）。
 * 一期不做独立看板菜单，统计卡 + Tab 已足够支撑「今天该办什么」。
 *
 * 取数口径：列表分页、Tab 分组、统计卡与徽标全部由服务端算——
 * 前端不再把整表拉到内存里 filter/slice。原因有两层：
 * 1. 数据量涨起来之后，一次拉全量会把首屏拖死；
 * 2. 更致命的是口径，分页后前端只拿得到本页，数出来的「待办数」必然小于真实值，
 *    车管看到 8 条而实际 30 条时就会漏办——待办统计最不能错的就是这个数。
 */
import { useMemo, useState } from 'react'
import { Badge, Button, Empty, message, Select, Space, Table, Tabs, Tag } from 'antd'
import { CarOutlined, ReloadOutlined, ExportOutlined, FieldTimeOutlined, InboxOutlined, WarningOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useColumnConfig } from '../../../hooks/useColumnConfig'
import AnimatedNumber from '../../../components/AnimatedNumber'
import { exportToCSV } from '../../../utils/exportCSV'
import { fetchUses, type TodoStats, type UseQuery } from '../../../api/vehicle'
import { toOrders } from '../vehicleAdapter'
import {
  APPROVAL_COLOR, APPROVAL_LABEL, TRIP_STATUS_COLOR, TRIP_STATUS_LABEL,
  USE_SOURCE_COLOR, USE_SOURCE_LABEL, USE_STATUS_COLOR, USE_STATUS_LABEL,
} from '../vehicleMeta'
import { TRIP_STATUS, USE_STATUS, type VehicleUseOrder } from '../vehicleTypes'
import { formatWindow } from '../vehicleRules'

interface Props {
  /** 当前页数据：服务端已按 group + 筛选条件过滤并分页 */
  rows: VehicleUseOrder[]
  /** 当前分组在当前筛选条件下的总条数（服务端 count，不是本页条数） */
  total: number
  /** 统计卡与 Tab 徽标：与列表同条件的服务端口径 */
  stats?: TodoStats
  loading: boolean
  canManage: boolean
  canDirectRegister: boolean
  /** 当前 Tab（即服务端 group） */
  tab: string
  onTabChange: (tab: string) => void
  plateFilter?: string
  onPlateChange: (plateNo?: string) => void
  page: number
  size: number
  onPageChange: (page: number, size: number) => void
  /** 车辆下拉选项：来自车辆档案，不能从已加载列表里 dedupe，否则翻页后选项会缺 */
  plateOptions: string[]
  /** 导出用的查询条件（不含分页），由父级持有以保持一致 */
  exportQuery: Omit<UseQuery, 'page' | 'size'>
  onRefresh: () => void
}

/** 办理分组：一个 Tab 就是一组可执行动作的集合，key 必须与服务端 group 取值一致 */
interface DispatchGroup {
  key: string
  label: string
}

/** 待办统计卡（§B.7 三段式：图标 → 数值 → 标签） */
function TodoStatCard({ icon, color, bg, value, label }: {
  icon: React.ReactNode; color: string; bg: string; value: number; label: string
}) {
  return (
    <div
      style={{
        borderRadius: 12, padding: 16, background: bg, border: `1px solid ${color}22`,
        textAlign: 'center', position: 'relative', overflow: 'hidden', cursor: 'default',
        transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-4px)'
        e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.1)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = 'none'
      }}
    >
      <div style={{ fontSize: 20, color }}>{icon}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color, margin: '6px 0 2px' }}>
        <AnimatedNumber value={value} />
      </div>
      <div style={{ fontSize: 12, color: '#8C8C8C' }}>{label}</div>
    </div>
  )
}

/** 分组 key 与服务端 VehicleConstants.GROUP_* 一一对应 */
const GROUP_TO_CONFIRM = 'to_confirm'
const GROUP_BACKFILL = 'backfill'
const GROUP_ALL = 'all'

export default function DispatchList({
  rows, total, stats, loading, canManage, canDirectRegister,
  tab, onTabChange, plateFilter, onPlateChange, page, size, onPageChange,
  plateOptions, exportQuery, onRefresh,
}: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [exporting, setExporting] = useState(false)

  const tabGroups: DispatchGroup[] = [
    { key: USE_STATUS.TO_ASSIGN, label: '待安排' },
    { key: USE_STATUS.TO_DEPART, label: '待出車' },
    { key: USE_STATUS.IN_USE, label: '使用中' },
    // 正常核对：已实际归还、等待确认的
    { key: GROUP_TO_CONFIRM, label: '待歸還確認' },
    // 补录待核对：含待核对与争议核对，不与正常归还混在一起
    { key: GROUP_BACKFILL, label: '補錄待核對' },
    { key: GROUP_ALL, label: '全部辦理中' },
  ]

  /** 徽标取服务端分组计数；缺失时不显示数字，绝不用本页条数顶替（会少数） */
  const badgeCount = (key: string) => stats?.groupCounts?.[key]

  /** 导出按当前条件向服务端要多页数据，不把首屏成本转嫁给列表 */
  const handleExport = async () => {
    setExporting(true)
    try {
      const res = await fetchUses({ ...exportQuery, page: 1, size: 500 })
      const all = toOrders(res.records ?? [])
      if (!all.length) {
        message.warning('暫無數據可導出')
        return
      }
      exportToCSV(`vehicle_dispatch_${new Date().toISOString().slice(0, 10)}`, [
        { title: '用車單號', dataIndex: 'useNo' },
        { title: '來源', dataIndex: ['source'], render: (v: string) => USE_SOURCE_LABEL[v] ?? v },
        { title: '單據狀態', dataIndex: 'status', render: (v: string) => USE_STATUS_LABEL[v] ?? v },
        { title: '車輛', dataIndex: ['assign', 'finalPlateNo'] },
        { title: '駕駛人', dataIndex: ['assign', 'driverName'] },
        { title: '用車人', dataIndex: ['apply', 'actualUserName'] },
        { title: '部門', dataIndex: ['apply', 'departmentName'] },
        { title: '事由', dataIndex: ['apply', 'purpose'] },
        { title: '計劃時段', dataIndex: ['apply', 'plannedStart'], render: (_: unknown, o: VehicleUseOrder) => formatWindow(o.apply.plannedStart, o.apply.plannedEnd) },
      ], all)
      message.success(t('common.exportSuccess'))
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '導出失敗')
    } finally {
      setExporting(false)
    }
  }

  /** 操作列按状态给出唯一正确的下一步动作，避免同时出现「安排+出车+确认」互相绕过 */
  const renderActions = (o: VehicleUseOrder) => {
    const acts: React.ReactNode[] = [
      <Button key="detail" type="link" size="small" onClick={() => navigate(`/vehicle-dispatch/detail?id=${o.id}`)}>詳情</Button>,
    ]
    if (!canManage) return acts
    if (o.status === USE_STATUS.TO_ASSIGN) {
      acts.push(<Button key="assign" type="link" size="small" onClick={() => navigate(`/vehicle-dispatch/assign?id=${o.id}`)}>安排車輛</Button>)
    }
    if (o.status === USE_STATUS.TO_DEPART) {
      acts.push(<Button key="depart" type="link" size="small" onClick={() => navigate(`/vehicle-dispatch/depart?id=${o.id}`)}>出車登記</Button>)
    }
    if (o.status === USE_STATUS.IN_USE) {
      acts.push(<Button key="return" type="link" size="small" onClick={() => navigate(`/vehicle-dispatch/return?id=${o.id}`)}>歸還登記</Button>)
    }
    if (o.status === USE_STATUS.TO_CONFIRM && (o.trip?.status === TRIP_STATUS.RETURNED || o.trip?.status === TRIP_STATUS.PENDING_CHECK || o.trip?.status === TRIP_STATUS.DISPUTED)) {
      acts.push(<Button key="confirm" type="link" size="small" onClick={() => navigate(`/vehicle-dispatch/confirm?id=${o.id}`)}>歸還確認</Button>)
    }
    return (
      <Space size={0} split={<span className="action-split">|</span>}>{acts}</Space>
    )
  }

  const allColumns = [
    { key: 'useNo', title: '用車單號', dataIndex: 'useNo', width: 165, fixed: 'left' as const },
    {
      key: 'source', title: '來源', width: 130,
      render: (_: unknown, o: VehicleUseOrder) => <Tag color={USE_SOURCE_COLOR[o.source]}>{USE_SOURCE_LABEL[o.source]}</Tag>,
    },
    {
      key: 'approval', title: '審批結論', width: 130,
      render: (_: unknown, o: VehicleUseOrder) => <Tag color={APPROVAL_COLOR[o.approval]}>{APPROVAL_LABEL[o.approval]}</Tag>,
    },
    {
      key: 'status', title: '單據狀態', width: 125,
      render: (_: unknown, o: VehicleUseOrder) => <Tag color={USE_STATUS_COLOR[o.status]}>{USE_STATUS_LABEL[o.status] ?? o.status}</Tag>,
    },
    {
      key: 'vehicle', title: '車輛', width: 120,
      render: (_: unknown, o: VehicleUseOrder) => o.assign.finalPlateNo ?? <span style={{ color: '#FA8C16' }}>{o.apply.intentPlateNo ?? '未指定'}</span>,
    },
    {
      key: 'driver', title: '實際駕駛人', width: 120,
      render: (_: unknown, o: VehicleUseOrder) => o.assign.driverName ?? <span style={{ color: '#8C8C8C' }}>未安排</span>,
    },
    { key: 'user', title: '用車人', width: 110, render: (_: unknown, o: VehicleUseOrder) => o.apply.actualUserName },
    { key: 'dept', title: '部門', dataIndex: ['apply', 'departmentName'], width: 130 },
    { key: 'purpose', title: '事由', dataIndex: ['apply', 'purpose'], width: 170, ellipsis: true },
    {
      key: 'window', title: '計劃時段', width: 230,
      render: (_: unknown, o: VehicleUseOrder) => formatWindow(o.apply.plannedStart, o.apply.plannedEnd),
    },
    {
      key: 'actual', title: '實際出 / 還', width: 230,
      render: (_: unknown, o: VehicleUseOrder) => o.trip
        ? formatWindow(o.trip.depart.departAt, o.trip.tripReturn.returnAt)
        : <span style={{ color: '#8C8C8C' }}>未出車</span>,
    },
    {
      key: 'trip', title: '行程狀態', width: 125,
      render: (_: unknown, o: VehicleUseOrder) => o.trip
        ? <Tag color={TRIP_STATUS_COLOR[o.trip.status]}>{TRIP_STATUS_LABEL[o.trip.status]}</Tag>
        : <span style={{ color: '#8C8C8C' }}>—</span>,
    },
    {
      key: 'conflict', title: '安排備註', dataIndex: ['assign', 'conflictNote'], width: 200, ellipsis: true,
      render: (v: string) => v ? <span style={{ color: '#FA8C16' }}>{v}</span> : '—',
    },
    { key: 'action', title: t('common.colAction'), width: 210, fixed: 'right' as const, render: (_: unknown, o: VehicleUseOrder) => renderActions(o) },
  ]

  const columnMeta = useMemo(() => [
    { key: 'useNo', title: '用車單號' },
    { key: 'source', title: '來源' },
    { key: 'status', title: '單據狀態' },
    { key: 'vehicle', title: '車輛' },
    { key: 'driver', title: '實際駕駛人' },
    { key: 'user', title: '用車人' },
    { key: 'dept', title: '部門' },
    { key: 'purpose', title: '事由' },
    { key: 'window', title: '計劃時段' },
    { key: 'actual', title: '實際出 / 還' },
    { key: 'trip', title: '行程狀態' },
    { key: 'conflict', title: '安排備註' },
    { key: 'action', title: t('common.colAction') },
  ], [t])

  const { configComponent, applyConfig } = useColumnConfig('vehicle-dispatch', columnMeta, [
    { key: 'useNo', locked: 'head' }, { key: 'action', locked: 'tail' },
  ])

  return (
    <div className="content-area">

      <div className="search-section">
        <Tabs
          activeKey={tab}
          onChange={onTabChange}
          style={{ gridColumn: 'span 3' }}
          items={tabGroups.map(g => ({
            key: g.key,
            label: (
              <Badge
                count={badgeCount(g.key)}
                size="small"
                offset={[10, -6]}
              >
                <span style={{ paddingRight: 6 }}>{g.label}</span>
              </Badge>
            ),
          }))}
        />
        <Select
          allowClear placeholder="全部車輛" value={plateFilter}
          onChange={onPlateChange}
          options={plateOptions.map(p => ({ value: p, label: p }))}
        />
      </div>

      {/* 待办统计（按 UI 规范置于搜索区之后，与列表同条件；口径不是独立指标体系） */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 16 }}
        key={`${plateFilter ?? 'all'}-${stats?.toAssign ?? 0}-${stats?.inUse ?? 0}`}>
        <TodoStatCard icon={<InboxOutlined />} color="#1890FF" bg="#E6F7FF" value={stats?.toAssign ?? 0} label="待安排車輛" />
        <TodoStatCard icon={<CarOutlined />} color="#E8720C" bg="#FFF7E6" value={stats?.inUse ?? 0} label="使用中行程" />
        <TodoStatCard icon={<FieldTimeOutlined />} color="#722ED1" bg="#F9F0FF" value={stats?.toConfirm ?? 0} label="待歸還確認" />
        <TodoStatCard icon={<WarningOutlined />} color="#FF4D4F" bg="#FFF1F0" value={stats?.overdue ?? 0} label="超時未歸還" />
      </div>

      <div className="action-section">
        <div className="action-section-left">
          <Button className="btn-export" icon={<ExportOutlined />} loading={exporting} disabled={!total} onClick={() => void handleExport()}>
            {t('common.export')}
          </Button>
        </div>
        <div className="action-section-right">
          <Button icon={<ReloadOutlined />} onClick={onRefresh}>刷新</Button>
          {canDirectRegister && (
            <Button type="primary" icon={<CarOutlined />} onClick={() => navigate('/vehicle-dispatch/direct')}>
              授權直接登記
            </Button>
          )}
          {configComponent}
        </div>
      </div>

      <Table<VehicleUseOrder>
        rowKey="id"
        columns={applyConfig(allColumns) as typeof allColumns}
        dataSource={rows}
        loading={loading}
        locale={{ emptyText: <Empty description={t('common.noData')} /> }}
        size="middle"
        scroll={{ x: 2200 }}
        onChange={p => onPageChange(p.current || 1, p.pageSize || 10)}
        pagination={{
          current: page, pageSize: size, total,
          showSizeChanger: true, showQuickJumper: true,
          pageSizeOptions: ['10', '20', '50', '100'],
          showTotal: (count) => t('common.total', { count }),
        }}
      />
    </div>
  )
}
