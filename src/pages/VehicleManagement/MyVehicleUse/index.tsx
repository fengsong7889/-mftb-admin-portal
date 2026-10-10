/**
 * 我的用车（物资管理（EAM）「車輛管理」分组成员，方案 A：与耗材領用同层）
 *
 *   /my-vehicle-use            → 我的用车列表（我發起的 / 我駕駛的）
 *   /my-vehicle-use/apply      → 发起用车申请
 *   /my-vehicle-use/detail?id= → 单据详情
 *
 * 阶段 B1 起的关键变化：**没有"演示身份切换"了**。申请人一律由服务端从登录态取，
 * 前端不传 applicantId——能切换身份就等于能替别人申请，这在台账问责制下不可接受。
 * 两个视角（我發起的 / 我駕駛的）的数据都由各自接口给出，本人范围在服务端收敛。
 */
import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { message } from 'antd'
import { useAuth } from '../../../contexts/AuthContext'
import { createDraft, fetchMyDrivingTasks, fetchMyUses, fetchUseDetail, newRequestKey, toIso } from '../../../api/vehicle'
import { toOrder, toOrders } from '../vehicleAdapter'
import type { VehicleUseApplyFormValues, VehicleUseOrder } from '../vehicleTypes'
import MyUseList from './MyUseList'
import VehicleUseApplyForm from './VehicleUseApplyForm'
import VehicleUseDetail from '../VehicleUseDetail'

type View = 'list' | 'apply' | 'detail'

function parseId(raw: string | null): number | undefined {
  if (!raw || !/^[1-9]\d*$/.test(raw)) return undefined
  return Number(raw)
}

export default function MyVehicleUse() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [searchParams] = useSearchParams()
  const { user } = useAuth()

  const mode = pathname.split('/')[2] || 'list'
  const view: View = mode === 'apply' ? 'apply' : mode === 'detail' ? 'detail' : 'list'
  const recordId = parseId(searchParams.get('id'))

  const [applied, setApplied] = useState<VehicleUseOrder[]>([])
  const [driving, setDriving] = useState<VehicleUseOrder[]>([])
  const [current, setCurrent] = useState<VehicleUseOrder>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const [reload, setReload] = useState(0)

  const back = useCallback(() => navigate('/my-vehicle-use'), [navigate])
  const refresh = useCallback(() => setReload(n => n + 1), [])

  useEffect(() => {
    if (view !== 'list') return
    let alive = true
    setLoading(true)
    setError(undefined)
    // 两个视角各一次请求：接口本身就只返回与本人相关的数据，不在前端做归属过滤
    void Promise.all([
      fetchMyUses({ page: 1, size: 100 }),
      fetchMyDrivingTasks({ page: 1, size: 100 }),
    ])
      .then(([a, d]) => {
        if (!alive) return
        setApplied(toOrders(a.records ?? []))
        setDriving(toOrders(d.records ?? []))
      })
      .catch(e => { if (alive) setError(e instanceof Error ? e.message : '加載失敗') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [view, reload])

  useEffect(() => {
    if (view !== 'detail' || recordId == null) return
    let alive = true
    setLoading(true)
    setError(undefined)
    // 详情走通用单据接口（服务端会校验“只能看自己的单或自己驾驶的单”），
    // 越权与不存在统一按“查不到”处理，不泄露单号是否存在
    void fetchUseDetail(recordId)
      .then(vo => { if (alive) setCurrent(toOrder(vo)) })
      .catch(e => {
        if (!alive) return
        setCurrent(undefined)
        setError(e instanceof Error ? e.message : '加載失敗')
      })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [view, recordId])

  const handleSubmit = useCallback(async (values: VehicleUseApplyFormValues, asDraft: boolean) => {
    try {
      const id = await createDraft({
        intentVehicleId: values.intentVehicleId,
        // 用车人可代填（替他人申请），但申请人本体由服务端从登录态确定
        actualUserName: values.actualUserName || (user?.name ?? ''),
        purpose: values.purpose,
        origin: values.origin,
        destination: values.destination,
        plannedStart: toIso(values.plannedStart) ?? '',
        plannedEnd: toIso(values.plannedEnd) ?? '',
        drivingMode: values.drivingMode,
        passengerCount: values.passengerCount ?? 1,
        requestKey: newRequestKey('draft'),
      })
      message.success(asDraft ? '草稿已保存' : '申請已提交，等待主管審批')
      navigate(`/my-vehicle-use/detail?id=${id}`)
      refresh()
    } catch (err) {
      // 失败留在页面：request.ts 已提示具体原因，这里只兜住不让按钮卡在 loading
      console.error(err)
      throw err
    }
  }, [user, navigate, refresh])

  return (
    <>
      {view === 'list' && (
        <MyUseList
          applied={applied}
          driving={driving}
          loading={loading}
          error={error}
          onRetry={refresh}
        />
      )}

      {view === 'apply' && (
        <VehicleUseApplyForm
          onSubmit={handleSubmit}
          onBack={back}
        />
      )}

      {view === 'detail' && (
        current ? (
          <VehicleUseDetail
            order={current}
            onBack={back}
            showAudit={false}
          />
        ) : (
          <div className="content-area">
            {loading ? '加載中…' : (error ?? `未找到本人相關的用車單（ID：${recordId ?? '未提供'}），或你無權查看。`)}
            <a onClick={back} style={{ marginLeft: 8 }}>返回我的用車</a>
          </div>
        )
      )}
    </>
  )
}
