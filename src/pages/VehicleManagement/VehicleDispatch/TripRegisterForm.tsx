/**
 * 用车办理 — 出车登记 / 归还登记 / 归还确认（同一行程记录的三个动作）
 *
 * 三条动作写同一张行程记录，避免出现「出车表 / 还车表」两份事实：
 *   depart  — 登记实际出车（起始里程、钥匙领取、车况）
 *   return  — 登记实际归还（结束里程、归还地点、钥匙交还、车况）
 *   confirm — 车管核对归还结果，确认后方计入正式台账
 *
 * 关键口径：
 *   - 车辆未确认归还，即使预计时间已过也不能再次派出；
 *   - 晚归可据实登记，只标记异常，不倒改批准时间；
 *   - 钥匙未交还或车况异常时车辆仍不可派出，但上一行程可据实结案。
 *
 * 注意：本组件所有 Hook 必须在任何提前 return 之前调用，否则违反 Hook 调用顺序规则。
 */
import { useEffect, useMemo, useState } from 'react'
import {
  Alert, Button, Checkbox, DatePicker, Descriptions, Form, Input, InputNumber,
  Modal, Result, Select, Tag, message,
} from 'antd'
import { CarOutlined, CheckCircleOutlined, LoginOutlined, LogoutOutlined, SaveOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import dayjs, { type Dayjs } from 'dayjs'
import {
  TRIP_FLAG_LABEL, TRIP_STATUS_COLOR, TRIP_STATUS_LABEL, USE_STATUS_COLOR, USE_STATUS_LABEL,
  VEHICLE_STATUS_COLOR, VEHICLE_STATUS_LABEL,
} from '../vehicleMeta'
import {
  USE_STATUS,
  type TripFlag, type VehicleFile, type VehicleUseOrder,
} from '../vehicleTypes'
import {
  checkMileage, driverQualified, isOverdue, vehicleDispatchable,
} from '../vehicleRules'
import { useDriverOptions } from '../vehicleOptions'
import { fetchVehicleDetail, toIso } from '../../../api/vehicle'
import { toVehicleFile } from '../vehicleAdapter'
import { VehicleFormPageHeader, VehicleSection } from '../VehicleModuleLayout'

export type TripRegisterMode = 'depart' | 'return' | 'confirm'

interface TripFormState {
  departAt?: Dayjs
  startOdometer?: number
  returnAt?: Dayjs
  endOdometer?: number
  returnPlace: string
  keyReceived: boolean
  keyReturned: boolean
  conditionOk: boolean
  condition: 'normal' | 'abnormal'
  exceptionNote?: string
}

const MODE_META: Record<TripRegisterMode, { title: string; button: string; expect: string }> = {
  depart: { title: '出車登記', button: '確認出車', expect: USE_STATUS.TO_DEPART },
  return: { title: '歸還登記', button: '確認歸還', expect: USE_STATUS.IN_USE },
  confirm: { title: '歸還確認', button: '確認無誤並歸檔', expect: USE_STATUS.TO_CONFIRM },
}

const CONDITION_OPTIONS = [
  { value: 'normal', label: '正常' },
  { value: 'abnormal', label: '異常' },
]

interface Props {
  mode: TripRegisterMode
  /** 单据由父级加载下传；本组件不再自己按 URL 取数据 */
  order: VehicleUseOrder
  saving: boolean
  /** 三个动作各自一个回调，写操作与状态推进全在服务端 */
  onDepart: (values: { useId: number; departAt: string; startOdometer: number; keyReceived: boolean; conditionOk: boolean }) => Promise<boolean>
  onReturn: (values: { useId: number; returnAt: string; endOdometer: number; returnPlace: string; keyReturned: boolean; vehicleCondition: 'normal' | 'abnormal'; exceptionNote?: string }) => Promise<boolean>
  onConfirm: (values: { useId: number; reason?: string }) => Promise<boolean>
  onBack: () => void
}

export default function TripRegisterForm({
  mode, order, saving, onDepart, onReturn, onConfirm, onBack,
}: Props) {
  const navigate = useNavigate()
  const [form] = Form.useForm<TripFormState>()
  const [submitting, setSubmitting] = useState(false)

  const meta = MODE_META[mode]
  const back = onBack

  // ---- 以下 Hook 必须全部在提前 return 之前执行 ----
  const { options: driverOptions } = useDriverOptions()
  /** 车辆快照用于展示建议里程；列表不包含时退回单据上的车牌 */
  const [vehicle, setVehicle] = useState<VehicleFile>()

  useEffect(() => {
    if (order.assign.finalVehicleId == null) return
    let alive = true
    void fetchVehicleDetail(order.assign.finalVehicleId)
      .then(vo => { if (alive) setVehicle(toVehicleFile(vo)) })
      .catch(() => { if (alive) setVehicle(undefined) })
    return () => { alive = false }
  }, [order.assign.finalVehicleId])

  const watchedReturnAt = Form.useWatch('returnAt', form)
  const watchedEnd = Form.useWatch('endOdometer', form)
  const watchedCondition = Form.useWatch('condition', form)

  const trip = order?.trip

  /** 出车起始里程默认带出上次确认值 */
  // 建议起始里程取后端算好的口径：档案值可能低于最近已确认行程，用它当默认值会让用户照填后被拒
  const suggestedStart = vehicle?.suggestStartOdometer ?? vehicle?.currentOdometer

  const mileage = useMemo(
    () => (mode === 'return' && trip
      ? checkMileage(trip.depart.startOdometer, watchedEnd, suggestedStart)
      : null),
    [mode, trip, watchedEnd, suggestedStart],
  )

  const departBlockers = useMemo(() => {
    if (mode !== 'depart' || !order) return [] as string[]
    const list: string[] = []
    if (vehicle) vehicleDispatchable(vehicle).forEach(b => list.push(b.message))
    else list.push('未找到安排的最終車輛')
    driverQualified(driverOptions.find(d => d.value === order.assign.driverEmpId)?.qualification)
      .forEach(b => list.push(b.message))
    // 已过期但未出车的预约不能直接补点出车，需重新办理
    if (isOverdue(order.apply.plannedStart, new Date())) {
      list.push('該預約已超過批准開始時間，不可直接補點出車，請撤銷後重新申請')
    }
    return list
  }, [mode, order, vehicle, driverOptions])

  const confirmBlockers = useMemo(() => {
    if (mode !== 'confirm' || !trip) return [] as string[]
    const list: string[] = []
    if (!trip.tripReturn.returnAt) list.push('尚未登記實際歸還時間，無法確認歸檔')
    if (trip.tripReturn.keyReturned === false) list.push('鑰匙未交還：可先完成歸還登記，但本單不得歸檔，車輛也不可派出')
    if (trip.tripReturn.condition === 'abnormal' && !trip.tripReturn.exceptionNote) list.push('車況異常必須填寫異常說明')
    if (trip.mileage == null) list.push('里程數據不完整或存在倒退，需先經授權更正')
    return list
  }, [mode, trip])

  const returnOverdue = mode === 'return' && isOverdue(order?.apply.plannedEnd, watchedReturnAt)

  /* ==================== 动作实现（只提交事实，不算口径） ==================== */

  /**
   * 三个 run* 只负责把表单值交给父级回调。
   *
   * 阶段 A 这里会自己拼 trip、自己加 flags、自己推进里程基线——那等于在浏览器里
   * 养了第二套台账口径。服务端才是唯一真值：超时标识、里程/时长重算、
   * 基线推进、审计事件均由后端完成。
   */
  const runDepart = (values: TripFormState) => onDepart({
    useId: order.id,
    departAt: toIso(values.departAt) ?? '',
    startOdometer: values.startOdometer ?? 0,
    keyReceived: !!values.keyReceived,
    conditionOk: !!values.conditionOk,
  })

  const runReturn = (values: TripFormState) => onReturn({
    useId: order.id,
    returnAt: toIso(values.returnAt) ?? '',
    endOdometer: values.endOdometer ?? 0,
    returnPlace: values.returnPlace,
    keyReturned: !!values.keyReturned,
    vehicleCondition: values.condition,
    exceptionNote: values.exceptionNote,
  })

  const runConfirm = () => onConfirm({ useId: order.id, reason: '歸還信息無誤' })

  /* ==================== 提交编排 ==================== */

  const withBusy = async (fn: () => Promise<boolean>, okText: string) => {
    setSubmitting(true)
    const ok = await fn()
    setSubmitting(false)
    if (ok) message.success(okText)
  }

  const handleSubmit = async () => {
    if (!order) return

    if (mode === 'confirm') {
      if (confirmBlockers.length) { message.warning('存在阻斷項，無法確認歸檔'); return }
      Modal.confirm({
        title: '確認歸還結果無誤並歸檔？',
        className: 'custom-confirm-modal',
        icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
        okText: '確認歸檔', cancelText: '取消',
        content: (
          <div className="confirm-info-card">
            <div className="confirm-info-row"><span>用車單：</span><b>{order.useNo}</b></div>
            <div className="confirm-info-row"><span>實際出還：</span><b>{trip?.depart.departAt} ~ {trip?.tripReturn.returnAt}</b></div>
            <div className="confirm-info-row"><span>行駛里程：</span><b>{trip?.mileage ?? '—'} km</b></div>
            <div className="confirm-info-row"><span>歸檔後：</span><b>單據不可普通編輯，如需修改走授權更正</b></div>
          </div>
        ),
        onOk: () => withBusy(runConfirm, '已歸檔'),
      })
      return
    }

    let values: TripFormState
    try { values = await form.validateFields() } catch { return }

    if (mode === 'depart') {
      if (departBlockers.length) { message.warning('存在阻斷項，無法出車'); return }
      Modal.confirm({
        title: '確認登記本次出車？',
        className: 'custom-confirm-modal',
        icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
        okText: '確認出車', cancelText: '取消',
        content: (
          <div className="confirm-info-card">
            <div className="confirm-info-row"><span>車輛 / 駕駛人：</span><b>{order.assign.finalPlateNo} / {order.assign.driverName}</b></div>
            <div className="confirm-info-row"><span>實際出車：</span><b>{values.departAt?.format('YYYY-MM-DD HH:mm')}</b></div>
            <div className="confirm-info-row"><span>起始里程：</span><b>{values.startOdometer} km</b></div>
            <div className="confirm-info-row"><span>鑰匙 / 車況：</span><b>{values.keyReceived ? '已領取' : '未領取'} / {values.conditionOk ? '已確認' : '有異常'}</b></div>
            <div className="confirm-info-row"><span>生效：</span><b>出車後車輛與駕駛人進入實際占用</b></div>
          </div>
        ),
        onOk: () => withBusy(() => runDepart(values), '出車已登記'),
      })
      return
    }

    // mode === 'return'
    if (mileage && mileage.blockers.length) {
      Modal.error({
        title: '里程校驗未通過', className: 'custom-confirm-modal', okText: '我知道了',
        content: <div>{mileage.blockers.map((b, i) => <div key={i}>{b.message}</div>)}</div>,
      })
      return
    }
    Modal.confirm({
      title: '確認登記本次歸還？',
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      okText: '確認歸還', cancelText: '取消',
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>實際歸還：</span><b>{values.returnAt?.format('YYYY-MM-DD HH:mm')}</b></div>
          <div className="confirm-info-row"><span>結束里程：</span><b>{values.endOdometer} km</b></div>
          <div className="confirm-info-row"><span>歸還地點：</span><b>{values.returnPlace}</b></div>
          <div className="confirm-info-row"><span>鑰匙交還：</span><b>{values.keyReturned ? '已交還' : '未交還（車輛仍不可派出）'}</b></div>
          {isOverdue(order.apply.plannedEnd, values.returnAt) && (
            <div className="confirm-info-row"><span>注意：</span><b>超出批准時段，將標記異常但不倒改批准時間</b></div>
          )}
        </div>
      ),
      onOk: () => withBusy(() => runReturn(values), '歸還已登記，等待車管確認'),
    })
  }

  /* ==================== 提前 return（必须在所有 Hook 之后） ==================== */

  if (!order) {
    return (
      <div className="content-area">
        <Result status="404" title="未找到用車單" extra={<Button onClick={back}>返回用車辦理</Button>} />
      </div>
    )
  }

  if (order.status !== meta.expect) {
    return (
      <div className="content-area">
        <Result
          status="warning"
          title={`當前狀態不可「${meta.title}」`}
          subTitle={`單據狀態為「${USE_STATUS_LABEL[order.status] ?? order.status}」，本頁面僅處理「${USE_STATUS_LABEL[meta.expect]}」的單據。`}
          extra={<Button onClick={() => navigate(`/vehicle-dispatch/detail?id=${order.id}`)}>查看詳情</Button>}
        />
      </div>
    )
  }

  const disabledSave = mode === 'depart'
    ? departBlockers.length > 0
    : mode === 'confirm' ? confirmBlockers.length > 0 : false

  return (
    <div className="content-area">
      <VehicleFormPageHeader
        title={meta.title}
        onBack={back}
        meta={`${order.useNo} · ${order.assign.finalPlateNo ?? '—'} · 駕駛人 ${order.assign.driverName ?? '—'}`}
      />

      <VehicleSection icon={<CarOutlined />} title="單據概要">
        <Descriptions column={4} size="middle">
          <Descriptions.Item label="單據狀態"><Tag color={USE_STATUS_COLOR[order.status]}>{USE_STATUS_LABEL[order.status]}</Tag></Descriptions.Item>
          <Descriptions.Item label="用車人">{order.apply.actualUserName}</Descriptions.Item>
          <Descriptions.Item label="事由">{order.apply.purpose}</Descriptions.Item>
          <Descriptions.Item label="批准時段">{order.apply.plannedStart.slice(0, 16)} ~ {order.apply.plannedEnd.slice(11, 16)}</Descriptions.Item>
          <Descriptions.Item label="車輛狀態">
            {vehicle ? <Tag color={VEHICLE_STATUS_COLOR[vehicle.status]}>{VEHICLE_STATUS_LABEL[vehicle.status]}</Tag> : '—'}
          </Descriptions.Item>
          <Descriptions.Item label="上次確認里程">{vehicle ? `${vehicle.currentOdometer.toLocaleString()} km` : '—'}</Descriptions.Item>
          <Descriptions.Item label="行程狀態">
            {trip ? <Tag color={TRIP_STATUS_COLOR[trip.status]}>{TRIP_STATUS_LABEL[trip.status]}</Tag> : '未出車'}
          </Descriptions.Item>
          <Descriptions.Item label="附加標識">
            {trip?.flags.length ? trip.flags.map((f: TripFlag) => <Tag key={f} color="orange">{TRIP_FLAG_LABEL[f] ?? f}</Tag>) : '—'}
          </Descriptions.Item>
        </Descriptions>
      </VehicleSection>

      {mode === 'depart' && (
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            departAt: dayjs(), startOdometer: suggestedStart, keyReceived: true, conditionOk: true,
          }}
        >
          <VehicleSection icon={<LoginOutlined />} tone="success" title="出車信息">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              <Form.Item label="實際出車時間" name="departAt" rules={[{ required: true, message: '請選擇出車時間' }]}>
                <DatePicker showTime format="YYYY-MM-DD HH:mm" style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item
                label="起始里程（km）" name="startOdometer"
                rules={[{ required: true, message: '請填寫起始里程' }]}
                extra={`默認帶出上次確認值 ${suggestedStart?.toLocaleString() ?? '—'} km；低於該值需說明差異`}
              >
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item label="車況確認" name="conditionOk" valuePropName="checked">
                <Checkbox>出發前車況已確認無異常</Checkbox>
              </Form.Item>
              <Form.Item label="鑰匙領取" name="keyReceived" valuePropName="checked" style={{ gridColumn: 'span 3' }}>
                <Checkbox>已領取車輛鑰匙（未領取時不得出車）</Checkbox>
              </Form.Item>
            </div>
            {departBlockers.length > 0 && (
              <Alert
                type="error" showIcon message={`存在 ${departBlockers.length} 項阻斷，無法出車`}
                description={<ul style={{ margin: '8px 0 0', paddingLeft: 20, fontSize: 12 }}>{departBlockers.map((b, i) => <li key={i}>{b}</li>)}</ul>}
              />
            )}
          </VehicleSection>
        </Form>
      )}

      {mode === 'return' && trip && (
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            returnAt: dayjs(), returnPlace: '公司車位', keyReturned: true, condition: 'normal',
          }}
        >
          <VehicleSection icon={<LogoutOutlined />} tone="success" title="歸還信息">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              <Form.Item label="實際歸還時間" name="returnAt" rules={[{ required: true, message: '請選擇歸還時間' }]}>
                <DatePicker showTime format="YYYY-MM-DD HH:mm" style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item
                label="結束里程（km）" name="endOdometer"
                rules={[{ required: true, message: '請填寫結束里程' }]}
                extra={`起始 ${trip.depart.startOdometer ?? '—'} km；行駛里程由後端計算，前端只做 UX 校驗`}
              >
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item label="歸還地點" name="returnPlace" rules={[{ required: true, message: '請填寫歸還地點' }]}>
                <Input placeholder="如：公司車位 / 一樓前台" maxLength={60} />
              </Form.Item>
              <Form.Item label="歸還車況" name="condition" rules={[{ required: true, message: '請選擇車況' }]}>
                <Select options={CONDITION_OPTIONS} />
              </Form.Item>
              <Form.Item
                label="異常說明" name="exceptionNote"
                rules={[{
                  validator: () => (watchedCondition === 'abnormal'
                    ? (form.getFieldValue('exceptionNote')
                      ? Promise.resolve()
                      : Promise.reject(new Error('車況異常必須填寫說明')))
                    : Promise.resolve()),
                }]}
              >
                <Input placeholder="如：右前胎壓偏低" maxLength={200} />
              </Form.Item>
              <Form.Item label="鑰匙交還" name="keyReturned" valuePropName="checked">
                <Checkbox>已交還鑰匙（未交還時車輛不可派出，但不阻斷本單據實登記）</Checkbox>
              </Form.Item>
            </div>

            {returnOverdue && (
              <Alert type="warning" showIcon style={{ marginTop: 8 }} message="歸還時間已超出批准時段：可據實登記，系統只標記異常，不倒改批准時間。" />
            )}
            {mileage?.blockers.length ? (
              <Alert type="error" showIcon style={{ marginTop: 8 }} message={mileage.blockers.map(b => b.message).join('；')} />
            ) : null}
          </VehicleSection>
        </Form>
      )}

      {mode === 'confirm' && trip && (
        <VehicleSection icon={<CheckCircleOutlined />} tone="special" title="歸還核對">
          <Descriptions column={4} size="middle">
            <Descriptions.Item label="實際出車">{trip.depart.departAt ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="實際歸還">{trip.tripReturn.returnAt ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="起始 / 結束里程">
              {trip.depart.startOdometer ?? '—'} / {trip.tripReturn.endOdometer ?? '—'} km
            </Descriptions.Item>
            <Descriptions.Item label="行駛里程">{trip.mileage != null ? `${trip.mileage} km` : '異常待核'}</Descriptions.Item>
            <Descriptions.Item label="用車時長">{trip.durationHours != null ? `${trip.durationHours} 小時` : '—'}</Descriptions.Item>
            <Descriptions.Item label="歸還地點">{trip.tripReturn.returnPlace ?? '—'}</Descriptions.Item>
            <Descriptions.Item label="鑰匙交還">{trip.tripReturn.keyReturned ? '已交還' : '未交還'}</Descriptions.Item>
            <Descriptions.Item label="車況">{trip.tripReturn.condition === 'abnormal' ? '異常' : '正常'}</Descriptions.Item>
            <Descriptions.Item label="異常說明" span={4}>{trip.tripReturn.exceptionNote ?? '—'}</Descriptions.Item>
          </Descriptions>
          {confirmBlockers.length > 0 && (
            <Alert
              type="error" showIcon style={{ marginTop: 12 }}
              message={`存在 ${confirmBlockers.length} 項阻斷，無法歸檔`}
              description={<ul style={{ margin: '8px 0 0', paddingLeft: 20, fontSize: 12 }}>{confirmBlockers.map((b, i) => <li key={i}>{b}</li>)}</ul>}
            />
          )}
        </VehicleSection>
      )}

      <div className="form-footer">
        <Button onClick={back}>取消</Button>
        <Button
          type="primary"
          icon={mode === 'confirm' ? <CheckCircleOutlined /> : <SaveOutlined />}
          loading={saving || submitting}
          disabled={disabledSave}
          onClick={handleSubmit}
        >
          {meta.button}
        </Button>
      </div>
    </div>
  )
}
