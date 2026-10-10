/**
 * 用车台账（物资管理（EAM）「車輛管理」分组成员）
 *
 * 台账是"实际发生过行程"的问责记录：谁、什么时候、哪辆车、起止里程、谁登记谁确认。
 *
 * 阶段 B1 起改为**服务端查询**：台账是唯一会随年份线性膨胀到数万行的页面，
 * 把全量拉回前端过滤会让分页、统计口径和导出三者互相不一致（看到的总数、
 * 筛出的条数、导出的条数各不相同）。现在筛选、分页、统计都走同一套条件，
 * 导出额外按同一条件取满页数据，保证"导出的就是查到的"。
 *
 *   /vehicle-ledger            → 台账列表
 *   /vehicle-ledger/detail?id= → 单据详情（只读）
 *   /vehicle-ledger/correct?id=→ 授权更正（保留前后值）
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert, Button, DatePicker, Empty, Form, Input, Select, Space, Spin, Table, Tag, Tooltip, message,
} from 'antd'
import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'
import {
  CarOutlined, DashboardOutlined, ExportOutlined, FileDoneOutlined, PlusOutlined, ReloadOutlined,
  SearchOutlined, WarningOutlined,
} from '@ant-design/icons'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import AnimatedNumber from '../../../components/AnimatedNumber'
import BrandTag from '../../../components/BrandTag'
import { useColumnConfig } from '../../../hooks/useColumnConfig'
import { useAuth } from '../../../contexts/AuthContext'
import { exportToCSV } from '../../../utils/exportCSV'
import { fetchLedger, fetchLedgerStats, fetchUseDetail, fetchVehicles, toIso, type UseQuery } from '../../../api/vehicle'
import { toOrders, toVehicleFiles } from '../vehicleAdapter'
import VehicleUseDetail from '../VehicleUseDetail'
import LedgerCorrectionForm from './LedgerCorrectionForm'
import BackfillForm from './BackfillForm'
import {
  APPROVAL_COLOR, APPROVAL_LABEL, TRIP_STATUS_COLOR, TRIP_STATUS_LABEL, USE_SOURCE_COLOR,
  USE_SOURCE_LABEL, USE_STATUS_COLOR, USE_STATUS_LABEL,
} from '../vehicleMeta'
import { TRIP_STATUS, type TripStatus, type VehicleFile, type VehicleTrip, type VehicleUseOrder } from '../vehicleTypes'
import { VehicleFlagTags } from '../VehicleModuleLayout'
import { useVehicleDeptTree } from '../vehicleOptions'

interface Filters {
  keyword?: string
  plateNo?: string
  driverName?: string
  departmentId?: number
  source?: string
  tripStatus?: string
  dateRange?: [Dayjs, Dayjs]
}

/** 外部传入的 ID 必须严格校验，非法值返回 undefined 走空态而不是拿 NaN 请求 */
function parseId(raw: string | null): number | undefined {
  return raw && /^[1-9]\d*$/.test(raw) ? Number(raw) : undefined
}

/** 把界面筛选条件翻成后端查询参数（时间的唯一出口，避免各处手拼格式） */
function toQuery(filters: Filters, page: number, size: number): UseQuery {
  return {
    page, size, scope: 'ledger',
    keyword: filters.keyword,
    plateNo: filters.plateNo,
    driverName: filters.driverName,
    departmentId: filters.departmentId,
    source: filters.source,
    tripStatus: filters.tripStatus,
    fromDate: filters.dateRange?.[0] ? toIso(filters.dateRange[0].startOf('day')) : undefined,
    toDate: filters.dateRange?.[1] ? toIso(filters.dateRange[1].endOf('day')) : undefined,
  }
}

export default function VehicleLedger() {
  const { pathname } = useLocation()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const mode = pathname.split('/')[2] || 'list'
  const rawId = searchParams.get('id')
  const recordId = rawId && /^[1-9]\d*$/.test(rawId) ? Number(rawId) : undefined

  if (mode === 'detail') {
    return <LedgerDetail id={recordId} onBack={() => navigate('/vehicle-ledger')} />
  }
  if (mode === 'correct') {
    return <LedgerCorrectionForm id={recordId} onBack={() => navigate('/vehicle-ledger')} />
  }
  if (mode === 'backfill') {
    return <BackfillForm defaultVehicleId={parseId(searchParams.get('vehicleId'))} onBack={() => navigate('/vehicle-ledger')} />
  }
  return <LedgerTable />
}

/** 详情：直接刷 URL 时按 id 取真实单据，取不到就明确说取不到 */
function LedgerDetail({ id, onBack }: { id?: number; onBack: () => void }) {
  const [order, setOrder] = useState<VehicleUseOrder>()
  const [vehicle, setVehicle] = useState<VehicleFile>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()

  useEffect(() => {
    if (id == null) { setLoading(false); return }
    let alive = true
    setLoading(true)
    void fetchUseDetail(id)
      .then(vo => {
        if (!alive) return
        setOrder(toOrders([vo])[0])
        if (vo.finalVehicleId) {
          void fetchVehicles({ page: 1, size: 200 })
            .then(res => {
              if (!alive) return
              const hit = toVehicleFiles(res.records ?? []).find(v => v.id === vo.finalVehicleId)
              setVehicle(hit)
            })
            .catch(() => {})
        }
      })
      .catch(e => { if (alive) setError(e instanceof Error ? e.message : '加載失敗') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [id])

  if (!id) return <MissingId onBack={onBack} text="缺少有效的用車單 ID。" />
  if (loading) return <div className="content-area"><Spin /></div>
  if (error) return <MissingId onBack={onBack} text={`加載失敗：${error}`} />
  if (!order) return <MissingId onBack={onBack} text="查無此用車單（可能已被刪除或無權限）。" />
  return <VehicleUseDetail order={order} vehicle={vehicle} onBack={onBack} />
}

function MissingId({ text, onBack }: { text: string; onBack: () => void }) {
  return (
    <div className="content-area">
      {text}
      <a onClick={onBack} style={{ marginLeft: 8 }}>返回用車台賬</a>
    </div>
  )
}

function LedgerTable() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user, hasPermission } = useAuth()
  const dept = useVehicleDeptTree()

  const [filters, setFilters] = useState<Filters>({})
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [rows, setRows] = useState<VehicleUseOrder[]>([])
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState<{
    tripCount: number; vehicleCount: number; totalMileage: number; totalHours: number;
    overdueCount: number; pendingCount: number
  }>({ tripCount: 0, vehicleCount: 0, totalMileage: 0, totalHours: 0, overdueCount: 0, pendingCount: 0 })
  const [vehicles, setVehicles] = useState<VehicleFile[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()

  // 更正动作在后端与"编辑"同权限（不自定义 correct 这个动作名），这里必须判 edit
  const canExport = user?.role === 'admin' || hasPermission('vehicle-ledger:export')
  const canCorrect = user?.role === 'admin' || hasPermission('vehicle-ledger:edit')

  useEffect(() => {
    void fetchVehicles({ page: 1, size: 200 })
      .then(res => setVehicles(toVehicleFiles(res.records ?? [])))
      .catch(() => {})
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(undefined)
    const query = toQuery(filters, page, size)
    // 列表与统计各自降级：放同一个 Promise.all 会让“列表挂了”连带把统计卡在 0，
    // 而统计接口其实成功了（端到端测试里实测到后端返回 2 次/750km，四张卡却全显示 0）
    try {
      const res = await fetchLedger(query)
      setRows(toOrders(res.records ?? []))
      setTotal(res.total ?? 0)
    } catch (e) {
      setError(e instanceof Error ? e.message : '加載失敗')
      setRows([])
      setTotal(0)
    }
    try {
      const stat = await fetchLedgerStats(toQuery(filters, 1, size))
      setStats({
        tripCount: Number(stat.tripCount ?? 0),
        vehicleCount: Number(stat.vehicleCount ?? 0),
        totalMileage: Number(stat.totalMileage ?? 0),
        totalHours: Number(stat.totalHours ?? 0),
        overdueCount: Number(stat.overdueCount ?? 0),
        pendingCount: Number(stat.pendingCount ?? 0),
      })
    } catch {
      // 统计失败不清列表，只把卡片归零，避免旧数字被当成当前筛选结果
      setStats({ tripCount: 0, vehicleCount: 0, totalMileage: 0, totalHours: 0, overdueCount: 0, pendingCount: 0 })
    } finally {
      setLoading(false)
    }
  }, [filters, page, size])

  useEffect(() => { void load() }, [load])

  const pendingRows = useMemo(() => rows.filter(o => hasPendingFlag(o.trip)), [rows])

  const handleExport = async () => {
    try {
      // 导出按当前筛选条件取满页，而不是只导当前这 10 条：
      // 否则"导出"与"查询结果"是两个不同的东西，审计时会被当成隐瞒
      const res = await fetchLedger({ ...toQuery(filters, 1, 200) })
      const data = toOrders(res.records ?? [])
      exportToCSV(`vehicle_ledger_${dayjs().format('YYYY-MM-DD')}`, [
        { title: '用車單號', dataIndex: 'useNo' },
        { title: '來源', dataIndex: 'source', render: (v: string) => USE_SOURCE_LABEL[v] ?? v },
        { title: '審批結論', dataIndex: 'approval', render: (v: string) => APPROVAL_LABEL[v] ?? v },
        { title: '單據狀態', dataIndex: 'status', render: (v: string) => USE_STATUS_LABEL[v] ?? v },
        { title: '車牌（發生時快照）', dataIndex: ['trip', 'plateNo'] },
        { title: '實際駕駛人', dataIndex: ['trip', 'driverName'] },
        { title: '駕駛人工號', dataIndex: ['trip', 'driverEmpNo'] },
        { title: '用車人', dataIndex: ['apply', 'actualUserName'] },
        { title: '部門', dataIndex: ['apply', 'departmentName'] },
        { title: '事由', dataIndex: ['apply', 'purpose'] },
        { title: '實際出車', dataIndex: ['trip', 'depart', 'departAt'] },
        { title: '實際歸還', dataIndex: ['trip', 'tripReturn', 'returnAt'] },
        { title: '起始里程', dataIndex: ['trip', 'depart', 'startOdometer'] },
        { title: '結束里程', dataIndex: ['trip', 'tripReturn', 'endOdometer'] },
        { title: '行駛里程', dataIndex: ['trip', 'mileage'] },
        { title: '用車時長', dataIndex: ['trip', 'durationHours'] },
        { title: '行程狀態', dataIndex: ['trip', 'status'], render: (v: string) => TRIP_STATUS_LABEL[v] ?? v },
        { title: '附加標識', dataIndex: ['trip', 'flags'], render: (v: string[]) => (v ?? []).map(flagText).join('、') },
        { title: '系統登記時間', dataIndex: ['trip', 'depart', 'registerAt'] },
        { title: '確認人', dataIndex: ['trip', 'tripReturn', 'confirmBy'] },
      ], data)
      message.success(t('common.exportSuccess'))
    } catch (e) {
      // 拦截器已统一弹错，这里只兜状态，不再二次弹（规范 §G.4 禁止双弹）
      console.error(e)
    }
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
      key: 'plate', title: '車牌（發生時）', width: 130,
      render: (_: unknown, o: VehicleUseOrder) => (o.trip as VehicleTrip).plateNo,
    },
    {
      key: 'brand', title: '公司品牌', width: 100,
      render: (_: unknown, o: VehicleUseOrder) => {
        const v = vehicles.find(x => x.id === o.trip?.vehicleId)
        return v ? <BrandTag value={v.companyBrand} /> : '—'
      },
    },
    {
      key: 'driver', title: '實際駕駛人', width: 150,
      render: (_: unknown, o: VehicleUseOrder) => {
        const trip = o.trip as VehicleTrip
        return <>{trip.driverName}<div style={{ fontSize: 12, color: '#8C8C8C' }}>{trip.driverEmpNo}</div></>
      },
    },
    {
      key: 'user', title: '用車人 / 部門', width: 170,
      render: (_: unknown, o: VehicleUseOrder) => (
        <>{o.apply.actualUserName}<div style={{ fontSize: 12, color: '#8C8C8C' }}>{o.apply.departmentName}</div></>
      ),
    },
    { key: 'purpose', title: '事由', dataIndex: ['apply', 'purpose'], width: 170, ellipsis: true },
    {
      key: 'depart', title: '實際出車', width: 160,
      render: (_: unknown, o: VehicleUseOrder) => (o.trip as VehicleTrip).depart.departAt ?? '—',
    },
    {
      key: 'ret', title: '實際歸還', width: 160,
      render: (_: unknown, o: VehicleUseOrder) => (o.trip as VehicleTrip).tripReturn.returnAt ?? '—',
    },
    {
      key: 'mileage', title: '行駛里程', width: 110, align: 'right' as const,
      render: (_: unknown, o: VehicleUseOrder) => {
        const trip = o.trip as VehicleTrip
        return trip.mileage != null ? `${trip.mileage} km`
          : <Tooltip title="里程不完整或倒退，需先經授權更正"><span style={{ color: '#FF4D4F' }}>待核</span></Tooltip>
      },
    },
    {
      key: 'hours', title: '用車時長', width: 100, align: 'right' as const,
      render: (_: unknown, o: VehicleUseOrder) => {
        const trip = o.trip as VehicleTrip
        return trip.durationHours != null ? `${trip.durationHours} h` : '—'
      },
    },
    {
      key: 'tripStatus', title: '行程狀態', width: 130,
      render: (_: unknown, o: VehicleUseOrder) => {
        const trip = o.trip as VehicleTrip
        return <Tag color={TRIP_STATUS_COLOR[trip.status]}>{TRIP_STATUS_LABEL[trip.status]}</Tag>
      },
    },
    {
      key: 'orderStatus', title: '單據狀態', width: 125,
      render: (_: unknown, o: VehicleUseOrder) => <Tag color={USE_STATUS_COLOR[o.status]}>{USE_STATUS_LABEL[o.status] ?? o.status}</Tag>,
    },
    {
      key: 'flags', title: '附加標識', width: 220,
      render: (_: unknown, o: VehicleUseOrder) => <VehicleFlagTags flags={(o.trip as VehicleTrip).flags} />,
    },
    {
      key: 'register', title: '系統登記時間', width: 165,
      render: (_: unknown, o: VehicleUseOrder) => (o.trip as VehicleTrip).depart.registerAt ?? '—',
    },
    {
      key: 'confirm', title: '確認人', width: 130,
      render: (_: unknown, o: VehicleUseOrder) => (o.trip as VehicleTrip).tripReturn.confirmBy ?? '待確認',
    },
    {
      key: 'action', title: t('common.colAction'), width: 150, fixed: 'right' as const,
      render: (_: unknown, o: VehicleUseOrder) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => navigate(`/vehicle-ledger/detail?id=${o.id}`)}>詳情</Button>
          {canCorrect && <Button type="link" size="small" onClick={() => navigate(`/vehicle-ledger/correct?id=${o.id}`)}>更正</Button>}
        </Space>
      ),
    },
  ]

  const columnMeta = useMemo(() => [
    { key: 'useNo', title: '用車單號' }, { key: 'source', title: '來源' },
    { key: 'approval', title: '審批結論' }, { key: 'plate', title: '車牌（發生時）' },
    { key: 'brand', title: '公司品牌' }, { key: 'driver', title: '實際駕駛人' },
    { key: 'user', title: '用車人 / 部門' }, { key: 'purpose', title: '事由' },
    { key: 'depart', title: '實際出車' }, { key: 'ret', title: '實際歸還' },
    { key: 'mileage', title: '行駛里程' }, { key: 'hours', title: '用車時長' },
    { key: 'tripStatus', title: '行程狀態' }, { key: 'orderStatus', title: '單據狀態' },
    { key: 'flags', title: '附加標識' }, { key: 'register', title: '系統登記時間' },
    { key: 'confirm', title: '確認人' }, { key: 'action', title: t('common.colAction') },
  ], [t])

  const { configComponent, applyConfig } = useColumnConfig('vehicle-ledger', columnMeta, [
    { key: 'useNo', locked: 'head' }, { key: 'action', locked: 'tail' },
  ])

  return (
    <div className="content-area">
      <div className="search-section">
        <TableSearchForm
          plates={vehicles.map(v => v.plateNo)}
          brandOptions={[]}
          deptTree={dept.treeData}
          onSearch={v => { setFilters(v); setPage(1) }}
          onReset={() => { setFilters({}); setPage(1) }}
        />
      </div>

      {/* 统计卡（按 UI 规范置于搜索区之后，与搜索条件影响的数据保持一致） */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 16 }}>
        <LedgerStatCard icon={<FileDoneOutlined />} color="#1890FF" bg="#E6F7FF" value={stats.tripCount} label="有效行車次數（已確認）" />
        <LedgerStatCard icon={<CarOutlined />} color="#E8720C" bg="#FFF7E6" value={stats.vehicleCount} label="涉及車輛數" />
        <LedgerStatCard icon={<DashboardOutlined />} color="#52C41A" bg="#F6FFED" value={stats.totalMileage} label="累計行駛里程（km）" />
        <LedgerStatCard icon={<WarningOutlined />} color="#722ED1" bg="#F9F0FF" value={stats.pendingCount} label="補錄／爭議待核對" />
      </div>

      {stats.overdueCount > 0 && (
        <Alert
          type="warning" showIcon style={{ marginBottom: 16 }}
          message={`已確認行程中有 ${stats.overdueCount} 次超出批准時段歸還`}
          description="超時只作標識與統計，不倒改批准時段；如需認定責任需另有依據（一期不含 GPS 軌跡，不聲稱可證明精確路徑）。"
        />
      )}

      <div className="action-section">
        <div className="action-section-left">
          <Button className="btn-export" icon={<ExportOutlined />} disabled={!canExport || !total} onClick={() => void handleExport()}>
            {t('common.export')}
          </Button>
          {pendingRows.length > 0 && (
            <span style={{ fontSize: 12, color: '#FA8C16', marginLeft: 12 }}>
              本頁含 {pendingRows.length} 條補錄／爭議記錄，未計入上方「有效行車次數」
            </span>
          )}
          {error && <span style={{ fontSize: 12, color: '#C62828', marginLeft: 12 }}>加載失敗：{error}<a onClick={() => void load()} style={{ marginLeft: 6 }}>重試</a></span>}
        </div>
        <div className="action-section-right">
          {canCorrect && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/vehicle-ledger/backfill')}>事後補錄</Button>
          )}
          {configComponent}
        </div>
      </div>

      <Table<VehicleUseOrder>
        rowKey="id"
        columns={applyConfig(allColumns) as typeof allColumns}
        dataSource={rows}
        locale={{ emptyText: <Empty description={t('common.noData')} /> }}
        loading={loading}
        size="middle"
        scroll={{ x: 2400 }}
        onChange={p => {
          const nextSize = p.pageSize || 10
          setPage(nextSize === size ? p.current || 1 : 1)
          setSize(nextSize)
        }}
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

/* ==================== 搜索表单（拆出以免主组件过长） ==================== */

interface SearchProps {
  plates: string[]
  brandOptions: Array<{ value: number; label: string }>
  deptTree: Array<{ value: number; title: string; children: unknown[] }>
  onSearch: (f: Filters) => void
  onReset: () => void
}

function TableSearchForm({ plates, deptTree, onSearch, onReset }: SearchProps) {
  const { t } = useTranslation()
  const [form] = Form.useForm<Filters>()

  const submit = () => {
    const v = form.getFieldsValue()
    onSearch({
      keyword: v.keyword?.trim() || undefined,
      plateNo: v.plateNo || undefined,
      driverName: v.driverName?.trim() || undefined,
      departmentId: v.departmentId || undefined,
      source: v.source || undefined,
      tripStatus: v.tripStatus || undefined,
      dateRange: v.dateRange && v.dateRange.length === 2 ? v.dateRange : undefined,
    })
  }

  return (
    <Form form={form} layout="inline" onFinish={submit}>
      <Form.Item label="關鍵詞" name="keyword">
        <Input placeholder="單號 / 車牌 / 事由" allowClear style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item label="車牌" name="plateNo">
        <Select allowClear showSearch placeholder={t('common.all')} options={plates.map(p => ({ value: p, label: p }))} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item label="駕駛人" name="driverName">
        <Input placeholder="姓名關鍵字" allowClear style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item label="用車部門" name="departmentId">
        <Select
          allowClear showSearch optionFilterProp="label" placeholder={t('common.all')}
          options={flatten(deptTree).map(d => ({ value: d.value, label: d.title }))}
          style={{ width: '100%' }}
        />
      </Form.Item>
      <Form.Item label="來源" name="source">
        <Select
          allowClear placeholder={t('common.all')}
          options={Object.entries(USE_SOURCE_LABEL).map(([value, label]) => ({ value, label }))}
          style={{ width: '100%' }}
        />
      </Form.Item>
      <Form.Item label="行程狀態" name="tripStatus">
        <Select
          allowClear placeholder={t('common.all')}
          options={Object.values(TRIP_STATUS).map(s => ({ value: s as TripStatus, label: TRIP_STATUS_LABEL[s] ?? s }))}
          style={{ width: '100%' }}
        />
      </Form.Item>
      <Form.Item label="出車日期" name="dateRange" style={{ gridColumn: 'span 2' }}>
        <DatePicker.RangePicker style={{ width: '100%' }} placeholder={['開始日期', '結束日期']} />
      </Form.Item>
      <Form.Item>
        <div className="search-actions">
          <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>{t('common.search')}</Button>
          <Button icon={<ReloadOutlined />} onClick={() => { form.resetFields(); onReset() }}>{t('common.reset')}</Button>
        </div>
      </Form.Item>
    </Form>
  )
}

/** 部门树扁平化（供 Select 使用；部门选择主控件在表单页仍用 TreeSelect） */
function flatten(tree: Array<{ value: number; title: string; children: unknown[] }>): Array<{ value: number; title: string }> {
  const out: Array<{ value: number; title: string }> = []
  const walk = (nodes: Array<{ value: number; title: string; children: unknown[] }>) => {
    for (const n of nodes) {
      out.push({ value: n.value, title: n.title })
      if (n.children?.length) walk(n.children as Array<{ value: number; title: string; children: unknown[] }>)
    }
  }
  walk(tree)
  return out
}

/** 补录/争议这类未归档记录不计入"有效行車次數"，口径与后端 ledgerStats 一致 */
function hasPendingFlag(trip?: VehicleTrip): boolean {
  if (!trip) return false
  return trip.status !== TRIP_STATUS.CONFIRMED
}

/** 标识 code 转文案（导出与页面共用同一份映射） */
function flagText(code: string): string {
  const map: Record<string, string> = {
    overdue: '超出批准時段', backfill: '事後補錄', corrected: '已授權更正',
    mileage_anomaly: '里程異常待核', key_pending: '鑰匙未交還',
    condition_abnormal: '車況異常', affected_by_late_return: '受前車晚歸影響',
  }
  return map[code] ?? code
}

/** 统计卡：数值口径全部来自后端 ledgerStats，前端不再自行汇总当页数据 */
function LedgerStatCard(props: {
  icon: React.ReactNode
  color: string
  bg: string
  value: number
  label: string
}) {
  return (
    <div className="stat-card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{
        width: 40, height: 40, borderRadius: 8, display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: props.bg, color: props.color, fontSize: 18,
      }}>{props.icon}</div>
      <div>
        <div style={{ fontSize: 20, fontWeight: 600 }}><AnimatedNumber value={props.value} /></div>
        <div style={{ fontSize: 12, color: '#8C8C8C' }}>{props.label}</div>
      </div>
    </div>
  )
}

