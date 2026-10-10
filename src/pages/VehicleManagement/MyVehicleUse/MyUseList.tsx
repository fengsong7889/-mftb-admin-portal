/**
 * 我的用车 — 列表页
 *
 * 两个 Tab：我的申請（我发起的） / 我駕駛的任務（指派我为实际驾驶人）
 * 口径：两个视角是同一批用车单的不同投影，不各自建数据。
 */
import { useMemo, useState } from 'react'
import { Alert, Button, Empty, Segmented, Select, Table, Tabs, Tag } from 'antd'
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useColumnConfig } from '../../../hooks/useColumnConfig'
import {
  APPROVAL_COLOR, APPROVAL_LABEL, TRIP_STATUS_COLOR, TRIP_STATUS_LABEL,
  USE_SOURCE_COLOR, USE_SOURCE_LABEL, USE_STATUS_COLOR, USE_STATUS_LABEL,
} from '../vehicleMeta'
import { DRIVING_MODE, type VehicleUseOrder } from '../vehicleTypes'
import { formatWindow } from '../vehicleRules'

interface Props {
  /** 我发起的：服务端按登录人过滤后返回，前端不再自行判断"我是谁" */
  applied: VehicleUseOrder[]
  /** 指派我驾驶的（排除自己申请自己开的，避免同一张单在两个页签重复出现） */
  driving: VehicleUseOrder[]
  loading: boolean
  error?: string
  onRetry: () => void
}

export default function MyUseList({ applied, driving, loading, error, onRetry }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [tab, setTab] = useState('applied')
  const [status, setStatus] = useState<string | undefined>()
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)


  const source = tab === 'applied' ? applied : driving
  const dataSource = useMemo(
    () => (status ? source.filter(o => o.status === status) : source),
    [source, status],
  )

  const statusOptions = useMemo(() => {
    const seen = new Set(source.map(o => o.status))
    return Array.from(seen).map(v => ({ value: v, label: USE_STATUS_LABEL[v] ?? v }))
  }, [source])

  const allColumns = [
    { key: 'useNo', title: '用車單號', dataIndex: 'useNo', width: 165, fixed: 'left' as const },
    {
      key: 'purpose', title: '用車事由', dataIndex: ['apply', 'purpose'], width: 190, ellipsis: true,
    },
    {
      key: 'window', title: '計劃時段', width: 230,
      render: (_: unknown, o: VehicleUseOrder) => formatWindow(o.apply.plannedStart, o.apply.plannedEnd),
    },
    {
      key: 'route', title: '出發 → 目的', width: 200, ellipsis: true,
      render: (_: unknown, o: VehicleUseOrder) => `${o.apply.origin} → ${o.apply.destination}`,
    },
    {
      key: 'vehicle', title: '意向 / 最終車輛', width: 160,
      render: (_: unknown, o: VehicleUseOrder) => (
        <>{o.assign.finalPlateNo ?? o.apply.intentPlateNo ?? '未指定'}
          {o.assign.finalPlateNo && o.apply.intentPlateNo && o.assign.finalPlateNo !== o.apply.intentPlateNo && (
            <div style={{ fontSize: 12, color: '#FA8C16' }}>已改派（原 {o.apply.intentPlateNo}）</div>
          )}
        </>
      ),
    },
    {
      key: 'driver', title: '實際駕駛人', width: 130,
      render: (_: unknown, o: VehicleUseOrder) => o.assign.driverName
        ?? (o.apply.drivingMode === DRIVING_MODE.SELF ? '本人（待安排確認）' : '尚未安排'),
    },
    {
      key: 'source', title: '來源', width: 130,
      render: (_: unknown, o: VehicleUseOrder) => (
        <Tag color={USE_SOURCE_COLOR[o.source]}>{USE_SOURCE_LABEL[o.source]}</Tag>
      ),
    },
    {
      key: 'approval', title: '審批結論', width: 130,
      render: (_: unknown, o: VehicleUseOrder) => (
        <Tag color={APPROVAL_COLOR[o.approval]}>{APPROVAL_LABEL[o.approval]}</Tag>
      ),
    },
    {
      key: 'status', title: '單據狀態', width: 130,
      render: (_: unknown, o: VehicleUseOrder) => (
        <Tag color={USE_STATUS_COLOR[o.status]}>{USE_STATUS_LABEL[o.status] ?? o.status}</Tag>
      ),
    },
    {
      key: 'trip', title: '行程狀態', width: 130,
      render: (_: unknown, o: VehicleUseOrder) => o.trip
        ? <Tag color={TRIP_STATUS_COLOR[o.trip.status]}>{TRIP_STATUS_LABEL[o.trip.status]}</Tag>
        : <span style={{ fontSize: 12, color: '#8C8C8C' }}>未出車</span>,
    },
    {
      key: 'flowNo', title: 'OA 流程編號', dataIndex: 'flowNo', width: 150,
      render: (v: string) => v ?? '—',
    },
    {
      key: 'action', title: t('common.colAction'), width: 90, fixed: 'right' as const,
      render: (_: unknown, o: VehicleUseOrder) => (
        <Button type="link" size="small" onClick={() => navigate(`/my-vehicle-use/detail?id=${o.id}`)}>詳情</Button>
      ),
    },
  ]

  const columnMeta = useMemo(() => [
    { key: 'useNo', title: '用車單號' },
    { key: 'purpose', title: '用車事由' },
    { key: 'window', title: '計劃時段' },
    { key: 'route', title: '出發 → 目的' },
    { key: 'vehicle', title: '意向 / 最終車輛' },
    { key: 'driver', title: '實際駕駛人' },
    { key: 'source', title: '來源' },
    { key: 'approval', title: '審批結論' },
    { key: 'status', title: '單據狀態' },
    { key: 'trip', title: '行程狀態' },
    { key: 'flowNo', title: 'OA 流程編號' },
    { key: 'action', title: t('common.colAction') },
  ], [t])

  const { configComponent, applyConfig } = useColumnConfig('my-vehicle-use', columnMeta, [
    { key: 'useNo', locked: 'head' }, { key: 'action', locked: 'tail' },
  ])

  return (
    <div className="content-area">
      {error && (
        <Alert
          type="error" showIcon style={{ marginBottom: 16 }}
          message={`加載失敗：${error}`}
          description="列表為空有兩種可能：確實還沒有記錄，或後端暫不可用。此處明確區分，避免把故障看成空數據。"
          action={<a onClick={onRetry}>重試</a>}
        />
      )}

      <div className="search-section" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <Tabs
          activeKey={tab}
          onChange={k => { setTab(k); setPage(1); setStatus(undefined) }}
          style={{ gridColumn: 'span 2' }}
          items={[
            { key: 'applied', label: `我的申請（${applied.length}）` },
            { key: 'driving', label: `我駕駛的任務（${driving.length}）` },
          ]}
        />
        <Select
          allowClear placeholder="全部狀態" value={status}
          onChange={v => { setStatus(v); setPage(1) }}
          options={statusOptions}
        />
        <div className="search-actions">
          <Button icon={<ReloadOutlined />} onClick={() => { setStatus(undefined); setPage(1) }}>{t('common.reset')}</Button>
        </div>
      </div>

      <div className="action-section">
        <div className="action-section-left">
          <Segmented
            options={[{ label: '全部', value: 'all' }]}
            value="all"
            disabled
            style={{ display: 'none' }}
          />
        </div>
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/my-vehicle-use/apply')}>申請用車</Button>
          {configComponent}
        </div>
      </div>

      <Table<VehicleUseOrder>
        rowKey="id"
        columns={applyConfig(allColumns) as typeof allColumns}
        dataSource={dataSource}
        loading={loading}
        locale={{ emptyText: <Empty description={t('common.noData')} /> }}
        size="middle"
        scroll={{ x: 1800 }}
        onChange={p => {
          const nextSize = p.pageSize || 10
          setPage(nextSize === size ? p.current || 1 : 1)
          setSize(nextSize)
        }}
        pagination={{
          current: page, pageSize: size, total: dataSource.length,
          showSizeChanger: true, showQuickJumper: true,
          pageSizeOptions: ['10', '20', '50', '100'],
          showTotal: (count) => t('common.total', { count }),
        }}
      />
    </div>
  )
}
