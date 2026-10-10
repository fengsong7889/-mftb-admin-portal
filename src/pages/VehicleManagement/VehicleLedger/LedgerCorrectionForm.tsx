/**
 * 用车台账 — 授权更正（独立页面）
 *
 * 规则：已结束行程不提供普通编辑。具备更正权限的人填写理由后更正，
 * 系统保存修改前后值并追加审计事件；涉及驾驶人、时间、里程时重新校验相邻记录，
 * 与原记录冲突则进入争议核对，不覆盖旧单。
 */
import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, DatePicker, Descriptions, Form, Input, InputNumber, Modal, Result, Select, Spin, message } from 'antd'
import { EditOutlined, SaveOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import dayjs, { type Dayjs } from 'dayjs'
import { buildCorrectionDiff, checkMileage } from '../vehicleRules'
import { TRIP_STATUS, type VehicleUseOrder } from '../vehicleTypes'
import { correctTrip, fetchUseDetail, newRequestKey, toIso } from '../../../api/vehicle'
import { toOrder } from '../vehicleAdapter'
import { useDriverOptions } from '../vehicleOptions'
import { VehicleFormPageHeader, VehicleSection } from '../VehicleModuleLayout'

interface CorrectState {
  driverEmpId?: number
  departAt?: Dayjs
  returnAt?: Dayjs
  startOdometer?: number
  endOdometer?: number
  reason: string
}

interface Props {
  /** 由父级（VehicleLedger/index）解析并传入，组件不再自己读 URL 参数 */
  id?: number
  onBack: () => void
}

export default function LedgerCorrectionForm({ id, onBack }: Props) {
  const navigate = useNavigate()
  const [form] = Form.useForm<CorrectState>()
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const { options: driverOptions } = useDriverOptions()
  const [order, setOrder] = useState<VehicleUseOrder>()

  useEffect(() => {
    if (id == null) { setLoading(false); return }
    let alive = true
    setLoading(true)
    void fetchUseDetail(id)
      .then(vo => {
        if (!alive) return
        const next = toOrder(vo)
        setOrder(next)
        // 必须显式回写表单：antd 的 initialValues 只在首次挂载生效，而同一会话内
        // 从 A 单返回再进 B 单时组件不重新挂载，上一张单的里程与理由会残留，
        // 一点“确认更正”就把 A 单的读数写进 B 单（端到端测试实测到这个跨单串写）
        form.setFieldsValue({
          driverEmpId: undefined,
          departAt: next.trip?.depart.departAt ? dayjs(next.trip.depart.departAt) : undefined,
          returnAt: next.trip?.tripReturn.returnAt ? dayjs(next.trip.tripReturn.returnAt) : undefined,
          startOdometer: next.trip?.depart.startOdometer,
          endOdometer: next.trip?.tripReturn.endOdometer,
          reason: '',
        })
      })
      .catch(() => { if (alive) setOrder(undefined) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [id, form])

  const trip = order?.trip
  const back = onBack

  const watchedEnd = Form.useWatch('endOdometer', form)
  const watchedStart = Form.useWatch('startOdometer', form)

  const diff = useMemo(() => {
    if (!order || !trip) return []
    return buildCorrectionDiff([
      ['實際駕駛人', trip.driverName, driverOptions.find(d => d.value === (form.getFieldValue('driverEmpId') ?? trip.driverEmpId))?.qualification.empName ?? trip.driverName],
      ['實際出車', trip.depart.departAt ?? '', form.getFieldValue('departAt')?.format('YYYY-MM-DD HH:mm:ss') ?? trip.depart.departAt ?? ''],
      ['實際歸還', trip.tripReturn.returnAt ?? '', form.getFieldValue('returnAt')?.format('YYYY-MM-DD HH:mm:ss') ?? trip.tripReturn.returnAt ?? ''],
      ['起始里程', String(trip.depart.startOdometer ?? ''), String(watchedStart ?? trip.depart.startOdometer ?? '')],
      ['結束里程', String(trip.tripReturn.endOdometer ?? ''), String(watchedEnd ?? trip.tripReturn.endOdometer ?? '')],
    ])
  }, [order, trip, driverOptions, watchedStart, watchedEnd, form])

  /**
   * 更正前本地只做「里程不倒退」这类纯校验。
   *
   * 时段冲突不再由前端拿一份单据自己算：更正可能改动任意历史窗口，前端只看得见
   * 当前页，判断结果必然不完整，容易给出「没有冲突」的错误安心感。服务端在更正时
   * 按锁内当前读判定，冲突会以错误信息回到界面上。
   */
  const revalidation = useMemo(() => {
    if (!order || !trip) return [] as string[]
    const list: string[] = []
    const start = watchedStart ?? trip.depart.startOdometer
    const end = watchedEnd ?? trip.tripReturn.endOdometer
    if (start != null && end != null) {
      checkMileage(start, end).blockers.forEach(b => list.push(b.message))
    }
    return list
  }, [order, trip, watchedStart, watchedEnd])

  if (loading) return <div className="content-area"><Spin /></div>
  if (!order || !trip) {
    return (
      <div className="content-area">
        <Result status="404" title="未找到可更正的行車記錄" extra={<Button onClick={back}>返回用車台賬</Button>} />
      </div>
    )
  }

  if (trip.status === TRIP_STATUS.PENDING_CHECK || trip.status === TRIP_STATUS.DISPUTED) {
    return (
      <div className="content-area">
        <Result
          status="info"
          title="本單據尚未歸檔"
          subTitle="補錄待核對 / 爭議核對中的記錄由「歸還確認」流程處理，不進入更正流程。"
          extra={<Button onClick={() => navigate(`/vehicle-dispatch/detail?id=${order.id}`)}>查看詳情</Button>}
        />
      </div>
    )
  }

  /**
   * 提交更正：只把「改什么 + 为什么改」发给后端。
   *
   * 前端不再自己拼 next trip、推进里程基线、决定争议标识——那些是服务端的职责，
   * 复制一份到浏览器里就会出现"页面显示的口径与库里的口径不一致"。服务端负责：
   * 校验只有已归档单据可更正、重算里程与时段冲突、写 before/after 审计、
   * 仅在无冲突时推进车辆里程基线。
   */
  const doCorrect = async (values: CorrectState) => {
    await correctTrip({
      useId: order.id,
      driverId: values.driverEmpId ?? undefined,
      departAt: values.departAt ? toIso(values.departAt) : undefined,
      returnAt: values.returnAt ? toIso(values.returnAt) : undefined,
      startOdometer: values.startOdometer ?? undefined,
      endOdometer: values.endOdometer ?? undefined,
      reason: values.reason.trim(),
      requestKey: newRequestKey('correct'),
    })
  }

  const handleSubmit = async () => {
    let values: CorrectState
    try { values = await form.validateFields() } catch { return }
    if (!values.reason?.trim()) { message.warning('必須填寫更正理由'); return }

    Modal.confirm({
      title: '確認提交授權更正？',
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      okText: '確認更正', cancelText: '取消',
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>用車單：</span><b>{order.useNo}</b></div>
          <div className="confirm-info-row"><span>更正理由：</span><b>{values.reason}</b></div>
          {diff.length === 0 && <div className="confirm-info-row"><span>提示：</span><b>未檢測到任何字段變化</b></div>}
          {diff.map(d => (
            <div className="confirm-info-row" key={d.field}>
              <span>{d.field}：</span><b>{d.before} → {d.after}</b>
            </div>
          ))}
          {revalidation.length > 0 && (
            <div className="confirm-info-row"><span>重校验：</span><b style={{ color: '#FF4D4F' }}>{revalidation.join('；')}</b></div>
          )}
        </div>
      ),
      onOk: async () => {
        if (diff.length === 0) { message.warning('未選擇要更正的內容'); return }
        setSaving(true)
        try {
          await doCorrect(values)
          message.success('更正已提交，前後值已記入操作記錄')
          back()
        } catch (err) {
          // 失败时保持表单原样，让用户看到原因修正后重试；不静默回列表。
          // 这里不得再 message.error：request.ts 拦截器已统一弹一次，双弹违反规范 §G.4
          console.error(err)
          setSaving(false)
          return Promise.reject(err)
        }
      },
    })
  }

  return (
    <div className="content-area">
      <VehicleFormPageHeader
        title="用車記錄授權更正"
        onBack={back}
        meta={`${order.useNo} · ${trip.plateNo} · ${trip.driverName}`}
      />

      <VehicleSection icon={<EditOutlined />} title="當前記錄（原值只讀）">
        <Descriptions column={4} size="middle">
          <Descriptions.Item label="實際駕駛人">{trip.driverName}（{trip.driverEmpNo}）</Descriptions.Item>
          <Descriptions.Item label="實際出車">{trip.depart.departAt ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="實際歸還">{trip.tripReturn.returnAt ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="起始 / 結束里程">
            {trip.depart.startOdometer ?? '—'} / {trip.tripReturn.endOdometer ?? '—'} km
          </Descriptions.Item>
          <Descriptions.Item label="行駛里程">{trip.mileage != null ? `${trip.mileage} km` : '待核'}</Descriptions.Item>
          <Descriptions.Item label="記錄版本">{trip.version}</Descriptions.Item>
          <Descriptions.Item label="數據來源">{order.source}</Descriptions.Item>
          <Descriptions.Item label="系統登記時間">{trip.depart.registerAt ?? '—'}</Descriptions.Item>
        </Descriptions>
      </VehicleSection>

      <Form
        form={form}
        layout="vertical"
        initialValues={{
          driverEmpId: trip.driverEmpId,
          departAt: trip.depart.departAt ? dayjs(trip.depart.departAt) : undefined,
          returnAt: trip.tripReturn.returnAt ? dayjs(trip.tripReturn.returnAt) : undefined,
          startOdometer: trip.depart.startOdometer,
          endOdometer: trip.tripReturn.endOdometer,
        }}
      >
        <VehicleSection icon={<SaveOutlined />} tone="config" title="更正內容">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <Form.Item label="實際駕駛人" name="driverEmpId">
              <Select
                showSearch optionFilterProp="label"
                options={driverOptions.map(d => ({ value: d.value, label: d.label }))}
              />
            </Form.Item>
            <Form.Item label="實際出車時間" name="departAt">
              <DatePicker showTime format="YYYY-MM-DD HH:mm" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="實際歸還時間" name="returnAt">
              <DatePicker showTime format="YYYY-MM-DD HH:mm" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="起始里程（km）" name="startOdometer">
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              label="結束里程（km）" name="endOdometer"
              extra="里程倒退將標記為異常並進入核對"
            >
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              label="更正理由" name="reason"
              rules={[{ required: true, message: '請填寫更正理由' }, { min: 6, message: '理由不少於 6 個字' }]}
              style={{ gridColumn: 'span 3' }}
            >
              <Input.TextArea rows={2} maxLength={200} placeholder="如：臨時換班未事前登記，經車管確認後更正駕駛人" />
            </Form.Item>
          </div>

          {revalidation.length > 0 && (
            <Alert
              type="error" showIcon message="更正後存在冲突或校验问题"
              description={(
                <>
                  <ul style={{ margin: '8px 0 0', paddingLeft: 20, fontSize: 12 }}>{revalidation.map((m, i) => <li key={i}>{m}</li>)}</ul>
                  <div style={{ marginTop: 8, fontSize: 12 }}>
                    与既有记录冲突时本单会进入争议核对，不覆盖旧记录，也不能直接确认为正常。
                  </div>
                </>
              )}
            />
          )}

          {diff.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 13, color: '#595959', marginBottom: 6 }}>將提交的修改（前 → 後）</div>
              <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12, color: '#8C8C8C' }}>
                {diff.map(d => <li key={d.field}>{d.field}：{d.before} → {d.after}</li>)}
              </ul>
            </div>
          )}
        </VehicleSection>
      </Form>

      <div className="form-footer">
        <Button onClick={back}>取消</Button>
        <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSubmit}>提交更正</Button>
      </div>
    </div>
  )
}
