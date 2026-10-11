/**
 * 我的用车 — 列表页
 *
 * 两个 Tab：我的申請（我发起的） / 我駕駛的任務（指派我为实际驾驶人）
 * 口径：两个视角是同一批用车单的不同投影，不各自建数据。
 *
 * 搜索条件与分页全部由服务端算：两个视角各发一次同筛选条件的请求，
 * 前端不再「拉 100 条再 filter/slice」——否则搜索只命中已拉到的第一页数据，
 * Tab 上的条数也会少数。
 */
import { useMemo } from 'react'
import { Alert, Button, DatePicker, Empty, Form, Input, Select, Table, Tabs, Tag } from 'antd'
import type { Dayjs } from 'dayjs'
import { PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useColumnConfig } from '../../../hooks/useColumnConfig'
import { toIso } from '../../../api/vehicle'
import {
  APPROVAL_COLOR, APPROVAL_LABEL, TRIP_STATUS_COLOR, TRIP_STATUS_LABEL,
  USE_SOURCE_COLOR, USE_SOURCE_LABEL, USE_STATUS_COLOR, USE_STATUS_LABEL,
} from '../vehicleMeta'
import { DRIVING_MODE, type VehicleUseOrder } from '../vehicleTypes'
import { formatWindow } from '../vehicleRules'

/** 查询条件（界面态；空值统一用 undefined，避免把空串当筛选条件传给后端） */
export interface MyUseFilters {
  useNo?: string
  fromDate?: string
  toDate?: string
  driverName?: string
  status?: string
  tripStatus?: string
}

/** 搜索表单态：计划时段在表单里是 Dayjs 区间，提交时才转成 ISO 字符串 */
interface MyUseFormValues {
  useNo?: string
  plannedRange?: [Dayjs, Dayjs] | null
  driverName?: string
  status?: string
  tripStatus?: string
}

interface Props {
  /** 当前 Tab：我的申請 / 我駕駛的任務 */
  tab: string
  onTabChange: (tab: string) => void
  /** 我发起的当前页数据：服务端已按登录人 + 搜索条件过滤并分页 */
  applied: VehicleUseOrder[]
  /** 我驾驶的当前页数据（排除自己申请自己开的，避免同一张单在两个页签重复出现） */
  driving: VehicleUseOrder[]
  /** 两个 Tab 在当前筛选条件下的服务端计数（Tab 标签用；绝不用本页条数顶替，会少数） */
  appliedTotal: number
  drivingTotal: number
  loading: boolean
  error?: string
  onRetry: () => void
  onFiltersChange: (filters: MyUseFilters) => void
  page: number
  size: number
  onPageChange: (page: number, size: number) => void
}

export default function MyUseList({
  tab, onTabChange, applied, driving, appliedTotal, drivingTotal,
  loading, error, onRetry, onFiltersChange, page, size, onPageChange,
}: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [form] = Form.useForm<MyUseFormValues>()

  /**
   * 提交查询：先 trim 再判空，空值统一归一成 undefined（空串不能当筛选条件发给后端）。
   * 计划时段取整天边界：从当天 00:00:00 到当天 23:59:59，避免漏掉当天晚间的单。
   */
  const submitFilters = () => {
    const v = form.getFieldsValue()
    onFiltersChange({
      useNo: v.useNo?.trim() || undefined,
      driverName: v.driverName?.trim() || undefined,
      status: v.status || undefined,
      tripStatus: v.tripStatus || undefined,
      fromDate: toIso(v.plannedRange?.[0]?.startOf('day')),
      toDate: toIso(v.plannedRange?.[1]?.endOf('day')),
    })
  }

  const resetFilters = () => { form.resetFields(); onFiltersChange({}) }

  const rows = tab === 'applied' ? applied : driving
  const total = tab === 'applied' ? appliedTotal : drivingTotal

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

      <div className="search-section">
        <Form form={form} layout="inline" onFinish={submitFilters}>
          <Form.Item label="用車單號" name="useNo">
            <Input placeholder="單號模糊匹配" allowClear style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="計劃時段" name="plannedRange">
            <DatePicker.RangePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="實際駕駛人" name="driverName">
            <Input placeholder="姓名模糊匹配" allowClear style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="單據狀態" name="status">
            <Select
              allowClear placeholder={t('common.all')} style={{ width: '100%' }}
              options={Object.entries(USE_STATUS_LABEL).map(([value, label]) => ({ value, label }))}
            />
          </Form.Item>
          <Form.Item label="行程狀態" name="tripStatus">
            <Select
              allowClear placeholder={t('common.all')} style={{ width: '100%' }}
              options={Object.entries(TRIP_STATUS_LABEL).map(([value, label]) => ({ value, label }))}
            />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>{t('common.search')}</Button>
              <Button icon={<ReloadOutlined />} onClick={resetFilters}>{t('common.reset')}</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* Tab 是视角投影的切换器，不是查询条件，因此不放搜索区（规范 §E.1 搜索区只放查询字段） */}
      <Tabs
        activeKey={tab}
        onChange={onTabChange}
        style={{ marginBottom: 16 }}
        items={[
          { key: 'applied', label: `我的申請（${appliedTotal}）` },
          { key: 'driving', label: `我駕駛的任務（${drivingTotal}）` },
        ]}
      />

      <div className="action-section">
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/my-vehicle-use/apply')}>申請用車</Button>
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
        scroll={{ x: 1800 }}
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
