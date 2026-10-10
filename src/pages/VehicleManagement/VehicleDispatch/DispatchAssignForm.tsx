/**
 * 车辆安排（审批通过后派车派司机 / 车辆改派）
 *
 * 职责：只做"收集选择 + 本地预校验 + 二次确认"，写操作交给父级（VehicleDispatch/index）。
 * 与阶段 A 的差别：不再自己按 URL 取单、不再自己改本地快照——单据真值在服务端。
 *
 * 注意 Hooks 顺序：所有 Hook 必须在状态守卫之前，否则不同状态下 Hook 数量变化会报错。
 */
import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Descriptions, Modal, Result, Select, Space, Tag, message } from 'antd'
import {
  CarOutlined, SaveOutlined, SwapOutlined, TeamOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../../contexts/AuthContext'
import { fetchUses, toIso } from '../../../api/vehicle'
import { toOrders } from '../vehicleAdapter'
import {
  APPROVAL_COLOR, APPROVAL_LABEL, DRIVING_MODE_LABEL, USE_SOURCE_COLOR, USE_SOURCE_LABEL,
  USE_STATUS_COLOR, USE_STATUS_LABEL, VEHICLE_STATUS_COLOR, VEHICLE_STATUS_LABEL,
} from '../vehicleMeta'
import {
  USE_STATUS, type VehicleFile, type VehicleUseOrder,
} from '../vehicleTypes'
import {
  deptAllowed, driverQualified, findScheduleConflicts, formatWindow, passengerWithinSeatLimit,
  vehicleDispatchable,
} from '../vehicleRules'
import { useDriverOptions } from '../vehicleOptions'
import { VehicleFormPageHeader, VehicleSection } from '../VehicleModuleLayout'

export interface AssignSubmit {
  useId: number
  vehicleId: number
  driverId: number
  conflictNote?: string
  reason?: string
}

interface Props {
  /** 待安排的用车单由父级加载并下传 */
  order: VehicleUseOrder
  /** 车辆清单由父级统一加载，避免每个表单各拉一次造成口径不一致 */
  vehicles: VehicleFile[]
  saving: boolean
  onSubmit: (values: AssignSubmit) => Promise<boolean>
  onBack: () => void
}

export default function DispatchAssignForm({ order, vehicles, saving, onSubmit, onBack }: Props) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [submitting, setSubmitting] = useState(false)
  const [vehicleId, setVehicleId] = useState<number | undefined>(
    order.assign.finalVehicleId ?? order.apply.intentVehicleId)
  const [driverEmpId, setDriverEmpId] = useState<number | undefined>(order.assign.driverEmpId)
  const { options: driverOptions } = useDriverOptions()
  /** 冲突候选：向服务端要"这辆车在批准时段内"的其他单据，而不是拿前端缓存全量列表猜 */
  const [candidates, setCandidates] = useState<VehicleUseOrder[]>([])

  const operator = user ? `${user.name}（${user.empId ?? '—'}）` : '未知操作人'

  useEffect(() => {
    if (vehicleId == null) { setCandidates([]); return }
    let alive = true
    void fetchUses({
      page: 1, size: 50, scope: 'dispatch', vehicleId,
      fromDate: toIso(order.apply.plannedStart), toDate: toIso(order.apply.plannedEnd),
    })
      .then(res => { if (alive) setCandidates(toOrders(res.records ?? [])) })
      .catch(() => { if (alive) setCandidates([]) })
    return () => { alive = false }
  }, [vehicleId, order.apply.plannedStart, order.apply.plannedEnd])

  const vehicle = vehicles.find(v => v.id === vehicleId)
  const driver = driverOptions.find(d => d.value === driverEmpId)
  const changedVehicle = order.assign.finalVehicleId != null && order.assign.finalVehicleId !== vehicleId
  const busy = saving || submitting

  const blockers = useMemo(() => {
    const list: string[] = []
    if (!vehicle) list.push('未選擇最終車輛')
    else {
      vehicleDispatchable(vehicle).forEach(b => list.push(b.message))
      if (!deptAllowed(vehicle, order.apply.departmentId)) {
        list.push(`用車部門「${order.apply.departmentName}」不在該車顯式授權範圍內`)
      }
      if (!passengerWithinSeatLimit(order.apply.passengerCount, vehicle.seatCount)) {
        list.push(`人數 ${order.apply.passengerCount} 超過核定載客 ${vehicle.seatCount}（含駕駛人）`)
      }
    }
    if (!driver) list.push('未選擇實際駕駛人')
    else driverQualified(driver.qualification).forEach(b => list.push(b.message))

    // 排除自己：改派/重派时本单已在候选里，否则永远报冲突
    findScheduleConflicts(candidates.filter(c => c.id !== order.id), {
      vehicleId, driverEmpId, start: order.apply.plannedStart, end: order.apply.plannedEnd,
      excludeUseId: order.id,
    }).forEach(c => list.push(
      `${c.resource === 'vehicle' ? '車輛' : '駕駛人'} ${c.target} 在 ${c.conflictWindow} 已被 ${c.conflictUseNo} 占用`,
    ))
    return list
  }, [order, vehicleId, driverEmpId, vehicle, driver, candidates])

  const runSubmit = async () => {
    if (vehicleId == null || driverEmpId == null) {
      message.warning('請選擇最終車輛與實際駕駛人')
      return
    }
    setSubmitting(true)
    const ok = await onSubmit({
      useId: order.id,
      vehicleId,
      driverId: driverEmpId,
      // 换车说明：改派需同时具备新旧车辆管理权限，且不改变用车部门范围（最终由后端校验）
      conflictNote: changedVehicle
        ? `由 ${order.assign.finalPlateNo ?? '—'} 改派為 ${vehicle?.plateNo ?? '—'}；改派需同時具備新舊車輛管理權限，且不改變用車部門範圍`
        : order.assign.conflictNote,
      reason: order.assign.directRegisterReason ?? undefined,
    })
    setSubmitting(false)
    if (ok) message.success('已安排並形成有效預約')
  }

  const handleAssign = () => {
    if (blockers.length) {
      message.warning('存在阻斷項，無法完成安排')
      return
    }
    Modal.confirm({
      title: changedVehicle ? '確認改派車輛並安排駕駛人？' : '確認完成車輛安排？',
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      okText: '確認安排',
      cancelText: '取消',
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>用車單：</span><b>{order.useNo}</b></div>
          <div className="confirm-info-row"><span>用車人：</span><b>{order.apply.actualUserName} · {order.apply.departmentName}</b></div>
          <div className="confirm-info-row"><span>最終車輛：</span><b>{vehicle?.plateNo ?? '—'}</b></div>
          <div className="confirm-info-row"><span>實際駕駛人：</span><b>{driver?.qualification.empName ?? '—'}</b></div>
          <div className="confirm-info-row"><span>占用時段：</span><b>{formatWindow(order.apply.plannedStart, order.apply.plannedEnd)}</b></div>
          {changedVehicle && <div className="confirm-info-row"><span>注意：</span><b>改派會釋放原車占用並占用新車時段</b></div>}
          <div className="confirm-info-row"><span>操作人：</span><b>{operator}</b></div>
        </div>
      ),
      onOk: runSubmit,
    })
  }

  /* ---------- 状态守卫放在所有 Hook 之后 ---------- */

  if (order.status !== USE_STATUS.TO_ASSIGN && order.status !== USE_STATUS.TO_DEPART) {
    return (
      <div className="content-area">
        <Result
          status="warning"
          title="當前狀態不可安排"
          subTitle={`單據狀態為「${USE_STATUS_LABEL[order.status] ?? order.status}」。已出車不可重新派車，只能據實歸還登記。`}
          extra={<Button onClick={() => navigate(`/vehicle-dispatch/detail?id=${order.id}`)}>查看詳情</Button>}
        />
      </div>
    )
  }

  return (
    <div className="content-area">
      <VehicleFormPageHeader
        title={changedVehicle ? '車輛改派與安排' : '安排車輛與駕駛人'}
        onBack={onBack}
        meta={`${order.useNo} · 安排成功才形成有效預約`}
      />

      <VehicleSection icon={<CarOutlined />} title="申請信息（只讀）">
        <Descriptions column={4} size="middle">
          <Descriptions.Item label="來源"><Tag color={USE_SOURCE_COLOR[order.source]}>{USE_SOURCE_LABEL[order.source]}</Tag></Descriptions.Item>
          <Descriptions.Item label="審批結論"><Tag color={APPROVAL_COLOR[order.approval]}>{APPROVAL_LABEL[order.approval]}</Tag></Descriptions.Item>
          <Descriptions.Item label="單據狀態"><Tag color={USE_STATUS_COLOR[order.status]}>{USE_STATUS_LABEL[order.status]}</Tag></Descriptions.Item>
          <Descriptions.Item label="意向車輛">{order.apply.intentPlateNo ?? '未指定'}</Descriptions.Item>
          <Descriptions.Item label="申請人">{order.apply.applicantName}（{order.apply.applicantEmpNo}）</Descriptions.Item>
          <Descriptions.Item label="用車部門">{order.apply.departmentName}</Descriptions.Item>
          <Descriptions.Item label="實際用車人">{order.apply.actualUserName}</Descriptions.Item>
          <Descriptions.Item label="用車事由">{order.apply.purpose}</Descriptions.Item>
          <Descriptions.Item label="計劃時段" span={2}>{formatWindow(order.apply.plannedStart, order.apply.plannedEnd)}</Descriptions.Item>
          <Descriptions.Item label="人數（含駕駛人）">{order.apply.passengerCount}</Descriptions.Item>
          <Descriptions.Item label="駕駛方式">{DRIVING_MODE_LABEL[order.apply.drivingMode]}</Descriptions.Item>
          <Descriptions.Item label="出發 → 目的地" span={4}>{order.apply.origin} → {order.apply.destination}</Descriptions.Item>
        </Descriptions>
        <Alert
          type="info" showIcon style={{ marginTop: 8 }}
          message="申請時段與用車人在本頁不可修改；如需調整，由申請人撤銷/取消後重新申請，系統保留原單與關聯關係。"
        />
      </VehicleSection>

      <VehicleSection icon={<SwapOutlined />} tone="config" title="最終車輛">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          <div>
            <div style={{ fontSize: 13, color: '#595959', marginBottom: 4 }}>選擇車輛</div>
            <Select
              style={{ width: '100%' }} value={vehicleId} placeholder="請選擇車輛"
              showSearch optionFilterProp="label"
              onChange={v => setVehicleId(v)}
              options={vehicles.filter(v => deptAllowed(v, order.apply.departmentId)).map(v => ({
                value: v.id,
                label: `${v.plateNo} · ${v.vehicleType} · ${v.seatCount} 座 · ${VEHICLE_STATUS_LABEL[v.status]}`,
              }))}
            />
            <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 4 }}>
              只列出用車部門在顯式授權範圍內的車輛；運行狀態異常的車輛保留可見並標明原因，便於查明而不是静默隐藏。
            </div>
          </div>
          {vehicle && (
            <Descriptions column={1} size="small" style={{ gridColumn: 'span 2' }}>
              <Descriptions.Item label="運行狀態">
                <Tag color={VEHICLE_STATUS_COLOR[vehicle.status]}>{VEHICLE_STATUS_LABEL[vehicle.status]}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="保險 / 檢驗有效期">
                {vehicle.insuranceValidUntil ?? '未錄入'} / {vehicle.inspectionValidUntil ?? '未錄入'}
              </Descriptions.Item>
              <Descriptions.Item label="當前里程（出車默認起始值）">{vehicle.currentOdometer.toLocaleString()} km</Descriptions.Item>
            </Descriptions>
          )}
        </div>
      </VehicleSection>

      <VehicleSection icon={<TeamOutlined />} tone="special" title="實際駕駛人">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          <div>
            <div style={{ fontSize: 13, color: '#595959', marginBottom: 4 }}>駕駛人</div>
            <Select
              style={{ width: '100%' }} value={driverEmpId} placeholder="請選擇駕駛人"
              showSearch optionFilterProp="label"
              onChange={v => setDriverEmpId(v)}
              options={driverOptions.map(d => ({ value: d.value, label: d.label }))}
            />
            <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 4 }}>
              駕駛人與申請人、用車人分别记录；自驾场景默认本人，公司司机场景必须显式指派。
            </div>
          </div>
          {driver && (
            <Descriptions column={1} size="small" style={{ gridColumn: 'span 2' }}>
              <Descriptions.Item label="駕照適用地區 / 準駕範圍">
                {driver.qualification.region} / {driver.qualification.licenseClass}
              </Descriptions.Item>
              <Descriptions.Item label="有效期至">{driver.qualification.validUntil}</Descriptions.Item>
            </Descriptions>
          )}
        </div>
      </VehicleSection>

      {order.assign.conflictNote && !changedVehicle && (
        <Alert type="warning" showIcon style={{ marginBottom: 16 }} message={order.assign.conflictNote} />
      )}

      <VehicleSection
        icon={<SwapOutlined />}
        tone={blockers.length ? 'info' : 'success'}
        title="安排前校驗"
        hint={blockers.length === 0 ? '可提交安排' : undefined}
      >
        {blockers.length === 0 ? (
          <Space size={4}>
            <Tag color="success">車輛可用</Tag>
            <Tag color="success">駕駛資格有效</Tag>
            <Tag color="success">時段無占用衝突</Tag>
            <Tag color="success">部門授權範圍內</Tag>
          </Space>
        ) : (
          <Alert
            type="error" showIcon message={`存在 ${blockers.length} 項阻斷，無法完成安排`}
            description={<ul style={{ margin: '8px 0 0', paddingLeft: 20, fontSize: 12 }}>{blockers.map((b, i) => <li key={i}>{b}</li>)}</ul>}
          />
        )}
      </VehicleSection>

      <div className="form-footer">
        <Button onClick={onBack}>取消</Button>
        <Button type="primary" icon={<SaveOutlined />} loading={busy} disabled={blockers.length > 0} onClick={handleAssign}>
          確認安排
        </Button>
      </div>
    </div>
  )
}
