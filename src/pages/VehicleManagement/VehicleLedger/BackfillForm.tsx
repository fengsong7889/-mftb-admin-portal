/**
 * 事后补录（用車台賬下的独立页，受 vehicle-ledger:create 权限控制）
 *
 * 场景：车已经用出去了但当时没登记（司机忘登记、临时换班、通讯中断）。
 *
 * 与普通登记的关键差别——补录**不直接计入正式台账**：
 * 后端会把行程置为 pending_check（待核對），只有经「歸還確認」核对无误后才进台账；
 * 若补录的时段与既有行程冲突，后端转 disputed（争议核对）而不覆盖旧单。
 * 这个设计是为了让"事后补写"和"当时登记"在台账里可区分，问责时看得出差在哪。
 *
 * 路由：/vehicle-ledger/backfill（阶段 B1 前端接线时补上；此前台账按钮指向
 * ?tab=backfill 而办理页不解析该参数，是一条死链）。
 */
import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, DatePicker, Form, Input, InputNumber, Modal, Select, TreeSelect, message } from 'antd'
import { SafetyCertificateOutlined, SendOutlined, TeamOutlined, TruckOutlined } from '@ant-design/icons'
import type { Dayjs } from 'dayjs'
import { backfillTrip, fetchVehicles, newRequestKey, toIso } from '../../../api/vehicle'
import { toVehicleFiles } from '../vehicleAdapter'
import {
  passengerWithinSeatLimit, plannedRangeValid, vehicleDispatchable,
} from '../vehicleRules'
import { VEHICLE_STATUS_LABEL } from '../vehicleMeta'
import type { VehicleFile } from '../vehicleTypes'
import { useDriverOptions, useVehicleDeptTree, type DeptTreeNode } from '../vehicleOptions'
import {
  VehicleFormPageHeader, VehicleSection,
} from '../VehicleModuleLayout'

interface FormState {
  vehicleId?: number
  departmentId?: number
  driverId?: number
  actualUserName: string
  purpose: string
  origin: string
  destination: string
  departAt?: Dayjs
  startOdometer?: number
  returnAt?: Dayjs
  endOdometer?: number
  returnPlace?: string
  passengerCount?: number
  reason: string
}

/**
 * 把部门树裁剪到授权白名单：保留命中节点及其祖先路径，父节点只作层级容器。
 * 不做隐式子部门继承 —— 一期口径是"只认显式授权部门"。
 */
function filterDeptTree(nodes: DeptTreeNode[], allowed: number[]): DeptTreeNode[] {
  const keep = new Set(allowed)
  return nodes.reduce<DeptTreeNode[]>((acc, n) => {
    const children = filterDeptTree(n.children, allowed)
    if (keep.has(n.value) || children.length) acc.push({ ...n, children })
    return acc
  }, [])
}

interface Props {
  /** 从台账某单进入时可预填车牌上下文；纯补录新行程时为空 */
  defaultVehicleId?: number
  onBack: () => void
}

export default function BackfillForm({ defaultVehicleId, onBack }: Props) {
  const [form] = Form.useForm<FormState>()
  const [vehicles, setVehicles] = useState<VehicleFile[]>([])
  const [submitting, setSubmitting] = useState(false)
  const { options: driverOptions } = useDriverOptions()
  const deptTree = useVehicleDeptTree()

  useEffect(() => {
    let alive = true
    void fetchVehicles({ page: 1, size: 200 })
      .then(res => { if (alive) setVehicles(toVehicleFiles(res.records ?? [])) })
      .catch(() => { if (alive) setVehicles([]) })
    return () => { alive = false }
  }, [])

  const watchedVehicleId = Form.useWatch('vehicleId', form)
  const watchedPassenger = Form.useWatch('passengerCount', form)
  const vehicle = vehicles.find(v => v.id === watchedVehicleId)

  /** 部门候选：该车显式授权的部门（补录也必须落在授权范围内，不能借补录绕过） */
  const deptOptions = useMemo(
    () => (vehicle?.allowedDepts ?? []).map(d => ({ value: d.deptId, label: d.deptName })),
    [vehicle],
  )

  const blockers = useMemo(() => {
    const list: string[] = []
    if (!vehicle) list.push('未選擇車輛')
    else {
      // 补录走的是真实车辆约束：维修中/证件过期等仍不可补，避免把不存在的行程挂到不能用上的车上
      vehicleDispatchable(vehicle).forEach(b => list.push(b.message))
      if (watchedPassenger != null && !passengerWithinSeatLimit(watchedPassenger, vehicle.seatCount)) {
        list.push(`人數 ${watchedPassenger} 超過核定載客 ${vehicle.seatCount}（含駕駛人）`)
      }
    }
    const range = form.getFieldValue('departAt') as Dayjs | undefined
    const back = form.getFieldValue('returnAt') as Dayjs | undefined
    if (!range || !back) list.push('請填寫實際出車與歸還時間')
    else if (!plannedRangeValid(range, back)) list.push('歸還時間需晚於出車時間')
    if (!form.getFieldValue('driverId')) list.push('未選擇實際駕駛人')
    if (!String(form.getFieldValue('reason') ?? '').trim()) list.push('補錄原因為必填')
    return list
  }, [vehicle, watchedPassenger, form])

  const runSubmit = async (values: FormState) => {
    setSubmitting(true)
    try {
      await backfillTrip({
        vehicleId: values.vehicleId!,
        actualUserName: values.actualUserName,
        departmentId: values.departmentId!,
        driverId: values.driverId!,
        purpose: values.purpose,
        origin: values.origin,
        destination: values.destination,
        departAt: toIso(values.departAt) ?? '',
        startOdometer: values.startOdometer,
        returnAt: toIso(values.returnAt) ?? '',
        endOdometer: values.endOdometer,
        returnPlace: values.returnPlace,
        passengerCount: values.passengerCount ?? 1,
        reason: values.reason.trim(),
        requestKey: newRequestKey('backfill'),
      })
      message.success('補錄已提交，進入待核對（尚未計入正式台賬）')
      onBack()
      return true
    } catch (e) {
      // 拦截器已统一弹错；这里只把用户留在表单上修正，不静默离开页面
      console.error(e)
      return false
    } finally {
      // 失败也必须复位：否则「確認補錄」永久转圈，用户既无法重试也改不了数据
      setSubmitting(false)
    }
  }

  const handleSubmit = async () => {
    let values: FormState
    try {
      values = await form.validateFields()
    } catch {
      return // 字段下方已有红字，不双弹
    }
    if (blockers.length) {
      message.warning('存在阻斷項，無法提交補錄')
      return
    }
    Modal.confirm({
      title: '確認提交事後補錄？',
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      okText: '確認補錄', cancelText: '取消',
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>車輛：</span><b>{vehicle?.plateNo ?? '—'}</b></div>
          <div className="confirm-info-row"><span>駕駛人：</span><b>{driverOptions.find(d => d.value === values.driverId)?.qualification.empName ?? '—'}</b></div>
          <div className="confirm-info-row"><span>用車人：</span><b>{values.actualUserName}</b></div>
          <div className="confirm-info-row"><span>實際時段：</span><b>{values.departAt?.format('YYYY-MM-DD HH:mm')} ~ {values.returnAt?.format('MM-DD HH:mm')}</b></div>
          <div className="confirm-info-row"><span>里程：</span><b>{values.startOdometer ?? '—'} → {values.endOdometer ?? '—'}</b></div>
          <div className="confirm-info-row"><span>補錄原因：</span><b>{values.reason}</b></div>
          <div className="confirm-info-row"><span>結果：</span><b>單據將進入「待核對」，經歸還確認後才計入正式台賬</b></div>
        </div>
      ),
      onOk: () => runSubmit(values),
    })
  }

  return (
    <div className="content-area">
      <VehicleFormPageHeader
        title="事後補錄用車行程"
        onBack={onBack}
        meta="補錄單據先進入待核對，不直接計入正式台賬"
      />

      <Alert
        type="warning" showIcon style={{ marginBottom: 16 }}
        message="補錄不是繞過登記的正規路徑"
        description="僅用於確實發生過但當時未登記的情況（如臨時換班、司機未登記）。系統會保留「補錄」標識與錄入時間，與當時登記的數據可區分；若與其他人數行程時段衝突，將轉入爭議核對而不是覆蓋舊單。"
      />

      <Form
        form={form}
        layout="vertical"
        initialValues={{ vehicleId: defaultVehicleId, passengerCount: 1 }}
      >
        <VehicleSection icon={<TruckOutlined />} tone="config" title="基礎信息">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <Form.Item label="車輛" name="vehicleId" rules={[{ required: true, message: '請選擇車輛' }]}>
              <Select
                showSearch optionFilterProp="label" placeholder="請選擇車輛"
                options={vehicles.map(v => ({
                  value: v.id,
                  label: `${v.plateNo} · ${v.vehicleType} · ${VEHICLE_STATUS_LABEL[v.status] ?? v.status}`,
                }))}
              />
            </Form.Item>
            <Form.Item
              label="用車部門" name="departmentId"
              rules={[{ required: true, message: '請選擇用車部門' }]}
              extra={vehicle ? `該車顯式授權 ${(vehicle.allowedDepts ?? []).length} 個部門可用` : '先選車輛'}
            >
              {/* 规范 §B.6：部门选择一律用 TreeSelect；候选仍按该车授权白名单裁剪 */}
              <TreeSelect
                showSearch treeNodeFilterProp="title" treeDefaultExpandAll
                placeholder="請選擇部門" style={{ width: '100%' }}
                disabled={!vehicle}
                treeData={filterDeptTree(deptTree.treeData, deptOptions.map(d => d.value))}
              />
            </Form.Item>
            <Form.Item
              label="實際駕駛人" name="driverId"
              rules={[{ required: true, message: '請選擇駕駛人' }]}
              extra="按穩定員工 ID 關聯，姓名只作展示"
            >
              <Select
                showSearch optionFilterProp="label" placeholder="請選擇駕駛人"
                options={driverOptions.map(d => ({ value: d.value, label: d.label }))}
              />
            </Form.Item>
            <Form.Item label="實際用車人" name="actualUserName" rules={[{ required: true, message: '請填寫實際用車人' }]}>
              <Input placeholder="誰實際用了這輛車" maxLength={40} />
            </Form.Item>
            <Form.Item label="用車事由" name="purpose" rules={[{ required: true, message: '請填寫用車事由' }]} style={{ gridColumn: 'span 2' }}>
              <Input placeholder="如：客戶拜訪 / 門店巡檢 / 機場接送" maxLength={120} />
            </Form.Item>
            <Form.Item label="人數（含駕駛人）" name="passengerCount" rules={[{ required: true, message: '請填寫人數' }]}>
              <InputNumber min={1} max={vehicle?.seatCount ?? 60} style={{ width: '100%' }} />
            </Form.Item>
          </div>
        </VehicleSection>

        <VehicleSection icon={<SafetyCertificateOutlined />} tone="special" title="實際發生時間與里程">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <Form.Item label="實際出車時間" name="departAt" rules={[{ required: true, message: '請選擇出車時間' }]}>
              <DatePicker showTime format="YYYY-MM-DD HH:mm" style={{ width: '100%' }} placeholder="據實填寫" />
            </Form.Item>
            <Form.Item
              label="起始里程（km）" name="startOdometer"
              rules={[{ required: true, message: '請填寫起始里程' }]}
              extra={vehicle ? `建議不低於 ${Math.max(Number(vehicle.currentOdometer ?? 0), Number(vehicle.suggestStartOdometer ?? 0)).toLocaleString()} km` : undefined}
            >
              <InputNumber min={0} style={{ width: '100%' }} placeholder="實際出車時表顯讀數" />
            </Form.Item>
            <Form.Item label="實際歸還時間" name="returnAt" rules={[{ required: true, message: '請選擇歸還時間' }]}>
              <DatePicker showTime format="YYYY-MM-DD HH:mm" style={{ width: '100%' }} placeholder="據實填寫" />
            </Form.Item>
            <Form.Item
              label="結束里程（km）" name="endOdometer"
              rules={[{ required: true, message: '請填寫結束里程' }]}
              extra="行駛里程由後端計算，不由本頁填寫"
            >
              <InputNumber min={0} style={{ width: '100%' }} placeholder="實際歸還時表顯讀數" />
            </Form.Item>
            <Form.Item label="歸還地點" name="returnPlace" style={{ gridColumn: 'span 2' }}>
              <Input placeholder="如：公司車位 / 門店" maxLength={60} />
            </Form.Item>
          </div>
        </VehicleSection>

        <VehicleSection icon={<TeamOutlined />} tone="info" title="補錄原因">
          <Form.Item
            name="reason"
            label="為什麼要事後補錄（必填，寫入操作記錄）"
            rules={[{ required: true, message: '請填寫補錄原因' }]}
          >
            <Input.TextArea rows={3} maxLength={200} showCount placeholder="如：當晚行程結束後未及時登記，次日由車管據實補錄" />
          </Form.Item>
          {vehicle && (
            <div style={{ fontSize: 12, color: '#8C8C8C' }}>
              當前車輛：{vehicle.plateNo} · {VEHICLE_STATUS_LABEL[vehicle.status] ?? vehicle.status} · 檔案里程 {Number(vehicle.currentOdometer ?? 0).toLocaleString()} km
            </div>
          )}
          {blockers.length > 0 && (
            <Alert
              type="error" showIcon style={{ marginTop: 8 }}
              message={`存在 ${blockers.length} 項提示`}
              description={<ul style={{ margin: '8px 0 0', paddingLeft: 20, fontSize: 12 }}>{blockers.map(b => <li key={b}>{b}</li>)}</ul>}
            />
          )}
        </VehicleSection>

        <div className="form-footer">
          <Button onClick={onBack}>取消</Button>
          <Button type="primary" icon={<SendOutlined />} loading={submitting} onClick={handleSubmit}>確認補錄</Button>
        </div>
      </Form>
    </div>
  )
}
