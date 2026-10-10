/**
 * 用车办理（物资管理（EAM）「車輛管理」分组成员）
 *
 *   /vehicle-dispatch              → 待办列表（按办理分组 + 统计卡）
 *   /vehicle-dispatch/assign?id=   → 车辆安排（审批通过后派车派司机）
 *   /vehicle-dispatch/direct       → 授权直接登记（免审批通道）
 *   /vehicle-dispatch/depart?id=   → 出车登记
 *   /vehicle-dispatch/return?id=   → 归还登记
 *   /vehicle-dispatch/confirm?id=  → 归还确认（归档进台账）
 *   /vehicle-dispatch/detail?id=   → 单据详情（含主操作按钮）
 *
 * 数据流：本文件持有列表查询与所有写操作提交，子组件只收集与校验表单值——
 * 与项目内资产领用/借用等模块一致，避免每个表单各自拼请求、各自处理错误。
 *
 * 权限口径：办理范围（能看哪些车、能办哪些单）由服务端按「车辆×管理人员」收敛，
 * 前端不再自己用 empNo 过滤一遍——前端那份过滤依赖 managers 快照，一旦授权变更
 * 就会出现"页面说你能办、后端说不能"或反之的不一致。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Alert, Button, Result, Spin } from 'antd'
import { useAuth } from '../../../contexts/AuthContext'
import {
  assignVehicle, confirmTrip, departTrip, directRegister, fetchTodoStats, fetchUseDetail,
  fetchUses, fetchVehicles, returnTrip, toIso,
  type TodoStats,
} from '../../../api/vehicle'
import { toOrder, toOrders, toVehicleFiles } from '../vehicleAdapter'
import {
  USE_STATUS,
  type DirectRegisterFormValues, type VehicleFile, type VehicleUseOrder,
} from '../vehicleTypes'
import VehicleUseDetail from '../VehicleUseDetail'
import DispatchList from './DispatchList'
import DispatchAssignForm from './DispatchAssignForm'
import DirectRegisterForm from './DirectRegisterForm'
import TripRegisterForm from './TripRegisterForm'

type View = 'list' | 'assign' | 'direct' | 'depart' | 'return' | 'confirm' | 'detail'

const parseId = (raw: string | null) => (raw && /^[1-9]\d*$/.test(raw) ? Number(raw) : undefined)

/** 状态 → 详情页主操作，保证同一状态只有一个正确下一步 */
const PRIMARY_ACTION: Record<string, { label: string; path: string }> = {
  [USE_STATUS.TO_ASSIGN]: { label: '安排車輛', path: 'assign' },
  [USE_STATUS.TO_DEPART]: { label: '出車登記', path: 'depart' },
  [USE_STATUS.IN_USE]: { label: '歸還登記', path: 'return' },
  [USE_STATUS.TO_CONFIRM]: { label: '歸還確認', path: 'confirm' },
}

export default function VehicleDispatch() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [searchParams] = useSearchParams()
  const { user, hasPermission } = useAuth()

  const mode = pathname.split('/')[2] || 'list'
  const VIEWS: View[] = ['list', 'assign', 'direct', 'depart', 'return', 'confirm', 'detail']
  const view: View = VIEWS.includes(mode as View) ? (mode as View) : 'list'

  // 后端对「直接登记」用的就是 vehicle-dispatch:edit（不自定义动作名），
  // 这里必须判同一个动作，否则会出现"后端允许、按钮却不显示"的错觉
  const canManage = user?.role === 'admin' || hasPermission('vehicle-dispatch:edit')
  const canDirectRegister = user?.role === 'admin' || hasPermission('vehicle-dispatch:edit')

  const [orders, setOrders] = useState<VehicleUseOrder[]>([])
  /** 当前分组在当前筛选下的总条数（服务端 count），分页器用 */
  const [total, setTotal] = useState(0)
  /** 车辆清单：详情页要展示所属法人/品牌，表单要选车，车辆下拉也要用（车队规模本就很小） */
  const [vehicles, setVehicles] = useState<VehicleFile[]>([])
  const [stats, setStats] = useState<TodoStats>()
  const [current, setCurrent] = useState<VehicleUseOrder>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const [reload, setReload] = useState(0)

  /* 列表查询状态全部交给服务端：Tab=group、车辆=plateNo、分页=page/size */
  const [tab, setTab] = useState<string>(USE_STATUS.TO_ASSIGN)
  const [plateFilter, setPlateFilter] = useState<string | undefined>()
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)

  /** 统计卡与列表共用的筛选条件（不含 group/分页）：卡片必须是「当前筛选下」的待办数 */
  const statFilters = useMemo(() => ({ scope: 'dispatch', plateNo: plateFilter }), [plateFilter])

  const recordId = parseId(searchParams.get('id'))
  const back = useCallback(() => navigate('/vehicle-dispatch'), [navigate])
  const refresh = useCallback(() => setReload(n => n + 1), [])

  useEffect(() => {
    if (view !== 'list') return
    const alive = true
    setLoading(true)
    setError(undefined)
    // 只拉当前页：以前一次拉 200 条再在前端分 Tab/分页，数据一多首屏就垮，
    // 而且 Tab 徽标会只数已加载部分，造成「看到 8 条、实际 30 条」的漏办
    void Promise.all([
      fetchUses({ ...statFilters, group: tab, page, size }),
      fetchTodoStats(statFilters),
    ])
      .then(([res, s]) => {
        if (!alive) return
        setOrders(toOrders(res.records ?? []))
        setTotal(res.total ?? 0)
        setStats(s)
      })
      .catch(e => { if (alive) setError(e instanceof Error ? e.message : '加載失敗') })
      .finally(() => { if (alive) setLoading(false) })
  }, [view, reload, tab, plateFilter, page, size, statFilters])

  useEffect(() => {
    let alive = true
    void fetchVehicles({ page: 1, size: 200 })
      .then(res => { if (alive) setVehicles(toVehicleFiles(res.records ?? [])) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (view === 'list' || recordId == null) return
    let alive = true
    setLoading(true)
    void fetchUseDetail(recordId)
      .then(vo => { if (alive) setCurrent(toOrder(vo)) })
      .catch(e => { if (alive) setError(e instanceof Error ? e.message : '加載失敗') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [view, recordId])

  /** 提交类动作统一走这里：成功后回列表并刷新，失败保持原样并提示 */
  const submit = useCallback(async (action: () => Promise<unknown>, okText: string): Promise<boolean> => {
    try {
      await action()
      void navigate('/vehicle-dispatch', { replace: true })
      refresh()
      return okText !== ''
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作未生效')
      return false
    }
  }, [navigate, refresh])

  const handleAssign = useCallback(
    (values: { useId: number; vehicleId: number; driverId: number; conflictNote?: string; reason?: string }) =>
      submit(() => assignVehicle({
        useId: values.useId, vehicleId: values.vehicleId, driverId: values.driverId,
        conflictNote: values.conflictNote, reason: values.reason, requestKey: `${Date.now()}`,
      }), '車輛已安排'),
    [submit])

  const handleDirectRegister = useCallback(
    (values: DirectRegisterFormValues) => submit(() => directRegister({
      vehicleId: values.vehicleId!,
      actualUserName: values.actualUserName,
      departmentId: values.departmentId!,
      driverId: values.driverEmpId!,
      purpose: values.purpose,
      origin: values.origin,
      destination: values.destination,
      plannedStart: toIso(values.plannedStart) ?? '',
      plannedEnd: toIso(values.plannedEnd) ?? '',
      passengerCount: values.passengerCount ?? 1,
      directReason: values.directRegisterReason,
      startOdometer: values.startOdometer,
      requestKey: `${Date.now()}`,
    }), '已直接登記並出車'),
    [submit])

  const handleDepart = useCallback(
    (values: { useId: number; departAt: string; startOdometer: number; keyReceived: boolean; conditionOk: boolean }) =>
      submit(() => departTrip({ ...values, requestKey: `${Date.now()}` }), '出車已登記'),
    [submit])

  const handleReturn = useCallback(
    (values: { useId: number; returnAt: string; endOdometer: number; returnPlace: string; keyReturned: boolean; vehicleCondition: 'normal' | 'abnormal'; exceptionNote?: string }) =>
      submit(() => returnTrip({ ...values, requestKey: `${Date.now()}` }), '歸還已登記'),
    [submit])

  const handleConfirm = useCallback(
    (values: { useId: number; reason?: string }) =>
      submit(() => confirmTrip({ ...values, requestKey: `${Date.now()}` }), '行程已歸檔進入台賬'),
    [submit])

  const primaryAction = useMemo(() => {
    if (!current) return undefined
    const next = PRIMARY_ACTION[current.status]
    if (!next || !canManage) return undefined
    return {
      label: next.label,
      onClick: () => navigate(`/vehicle-dispatch/${next.path}?id=${current.id}`),
    }
  }, [current, canManage, navigate])

  if (!canManage && view !== 'list') {
    return (
      <div className="content-area">
        <Result
          status="403" title="無辦理權限"
          subTitle="你沒有可辦理的車輛任務，請聯繫管理員按車輛分配管理範圍。"
          extra={<Button onClick={back}>返回待办</Button>}
        />
      </div>
    )
  }

  if (view === 'direct') {
    return (
      <DirectRegisterForm
        vehicles={vehicles}
        saving={loading}
        error={error}
        onSubmit={handleDirectRegister}
        onBack={back}
      />
    )
  }

  if (view !== 'list' && loading && !current) {
    return <div className="content-area"><Spin /></div>
  }

  if (view === 'assign') {
    return current
      ? (
          <DispatchAssignForm
            order={current}
            vehicles={vehicles}
            saving={loading}
            onSubmit={handleAssign}
            onBack={back}
          />
        )
      : <Missing id={recordId} error={error} onBack={back} />
  }

  if (view === 'depart' || view === 'return' || view === 'confirm') {
    return current
      ? (
          <TripRegisterForm
            mode={view}
            order={current}
            saving={loading}
            onDepart={handleDepart}
            onReturn={handleReturn}
            onConfirm={handleConfirm}
            onBack={back}
          />
        )
      : <Missing id={recordId} error={error} onBack={back} />
  }

  if (view === 'detail') {
    return current
      ? (
          <VehicleUseDetail
            order={current}
            vehicle={vehicles.find(v => v.id === current.assign.finalVehicleId)}
            onBack={back}
            primaryAction={primaryAction}
          />
        )
      : <Missing id={recordId} error={error} onBack={back} />
  }

  return (
    <>
      {error && (
        <div className="content-area" style={{ paddingBottom: 0 }}>
          <Alert
            type="error" showIcon
            message={`加載失敗：${error}`}
            description="列表為空有兩種可能：確實沒有待辦，或後端暫不可用。此處明確區分，避免把故障當成「今天沒車要用」。"
            action={<a onClick={refresh}>重試</a>}
          />
        </div>
      )}
      <DispatchList
        rows={orders}
        total={total}
        stats={stats}
        loading={loading}
        canManage={canManage}
        canDirectRegister={canDirectRegister}
        tab={tab}
        onTabChange={next => { setTab(next); setPage(1) }}
        plateFilter={plateFilter}
        onPlateChange={next => { setPlateFilter(next); setPage(1) }}
        page={page}
        size={size}
        onPageChange={(nextPage, nextSize) => {
          setPage(nextSize === size ? nextPage : 1)
          setSize(nextSize)
        }}
        plateOptions={vehicles.map(v => v.plateNo).filter((p): p is string => !!p)}
        exportQuery={{ ...statFilters, group: tab }}
        onRefresh={refresh}
      />
    </>
  )
}

function Missing({ id, error, onBack }: { id?: number; error?: string; onBack: () => void }) {
  return (
    <div className="content-area">
      {error
        ? `加載失敗：${error}`
        : `未找到可辦理的用車單（ID：${id ?? '未提供'}）。可能已被他人辦理後流轉，或你無該車管理權限。`}
      <div style={{ marginTop: 8 }}>
        <a onClick={onBack}>返回待辦</a>
      </div>
    </div>
  )
}

