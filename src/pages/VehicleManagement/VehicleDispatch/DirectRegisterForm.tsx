/**
 * 用车办理 — 授权直接登记（独立页面）
 *
 * 四个前置条件必须同时满足，缺一不可（前端只做可见性控制，后端 B1 重验）：
 *   1. 操作者具备独立的「直接登记」权限（不是普通的用车办理 edit 权限）
 *   2. 操作者在该车的授权管理人员范围内
 *   3. 该车辆已由配置管理员开启「允许直接登记」
 *   4. 填写直接登记原因
 * 与审批用车执行完全相同的冲突、资质与状态校验；结果标记为「授权直接登记」，
 * 不伪造为「审批通过」。OA 故障时不得自动切换到本路径。
 */
import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, DatePicker, Descriptions, Form, Input, InputNumber, Modal, Select, Tag, message, TreeSelect} from 'antd'
import { CarOutlined, SafetyCertificateOutlined, SendOutlined, TeamOutlined } from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import { useAuth } from '../../../contexts/AuthContext'
import { VEHICLE_STATUS_LABEL } from '../vehicleMeta'
import {
  type VehicleFile, type VehicleUseOrder,
  type DirectRegisterFormValues,
} from '../vehicleTypes'
import {
  deptAllowed, driverQualified, findScheduleConflicts, passengerWithinSeatLimit,
  plannedRangeValid, vehicleDispatchable,
} from '../vehicleRules'
import { useDriverOptions, useVehicleDeptTree, type DeptTreeNode } from '../vehicleOptions'
import { VehicleFormPageHeader, VehicleSection } from '../VehicleModuleLayout'
import { fetchUses, toIso } from '../../../api/vehicle'
import { toOrders } from '../vehicleAdapter'

interface FormState {
  vehicleId?: number
  actualUserName: string
  departmentId?: number
  driverEmpId?: number
  purpose: string
  origin: string
  destination: string
  plannedRange?: [Dayjs, Dayjs]
  passengerCount?: number
  directRegisterReason: string
  startOdometer?: number
}

/**
 * 把部门树裁剪到授权白名单：保留命中节点及其祖先路径，父节点仅作为层级容器。
 * 不做隐式子部门继承——一期口径是"只认显式授权部门"（与 vehicleRules 单测一致）。
 */
function filterDeptTree(nodes: DeptTreeNode[], allowed: number[]): DeptTreeNode[] {
  const keep = new Set(allowed)
  return nodes.reduce<DeptTreeNode[]>((acc, n) => {
    const children = filterDeptTree(n.children, allowed)
    if (keep.has(n.value) || children.length) {
      acc.push({ ...n, children })
    }
    return acc
  }, [])
}

interface Props {
  /** 车辆清单由父级统一加载（车队规模小，且详情页/表单/授权判定要用同一份） */
  vehicles: VehicleFile[]
  saving: boolean
  error?: string
  onSubmit: (values: DirectRegisterFormValues) => Promise<boolean>
  onBack: () => void
}

export default function DirectRegisterForm({ vehicles, saving, error, onSubmit, onBack }: Props) {
  const { user, hasPermission } = useAuth()
  const [form] = Form.useForm<FormState>()
  const { options: driverOptions } = useDriverOptions()
  const deptTree = useVehicleDeptTree()
  const [submitting, setSubmitting] = useState(false)
  /** 候选冲突单：按"所选车辆 + 所选时段"向服务端要重叠单据，而不是拿前端缓存的全量列表猜 */
  const [conflictCandidates, setConflictCandidates] = useState<VehicleUseOrder[]>([])

  const watchedVehicleId = Form.useWatch('vehicleId', form)
  const watchedDeptId = Form.useWatch('departmentId', form)
  const watchedRange = Form.useWatch('plannedRange', form)
  const watchedPassenger = Form.useWatch('passengerCount', form)
  const watchedDriverId = Form.useWatch('driverEmpId', form)

  /**
   * 直接登记复用 vehicle-dispatch:edit 动作（后端就是这么实现的）。
   *
   * 曾经这里判的是 'vehicle-dispatch:direct' —— 一个后端并不存在的动作名，
   * 后果是：非管理员即使有办理权限，这个页面也永远提示无权限，而接口其实允许调用。
   * "按钮不显示但接口能调"和"按钮显示但接口 403"是同一种错的两个方向。
   */
  const canDirectRegister = user?.role === 'admin' || hasPermission('vehicle-dispatch:edit')

  /** 权限维度 2+3：该车在本人管理范围内，且配置上开启了直接登记（服务端会再判一次） */
  const manageableDirectVehicles = useMemo(() => vehicles.filter(v => {
    if (!v.allowDirectRegister) return false
    if (user?.role === 'admin') return true
    const empNo = user?.empId ?? ''
    // 后端列表接口若未带 managers，这里必须兜成空数组：直接 .some() 会让非超管整页白屏
    return (v.managers ?? []).some(m => m.level === 'manage' && m.empNo === empNo)
  }), [vehicles, user])

  const selectedVehicle: VehicleFile | undefined = vehicles.find(v => v.id === watchedVehicleId)

  const rangeValid = !!watchedRange && watchedRange.length === 2
    && plannedRangeValid(watchedRange[0], watchedRange[1])

  useEffect(() => {
    if (!watchedVehicleId || !rangeValid) { setConflictCandidates([]); return }
    let alive = true
    void fetchUses({
      page: 1, size: 50, scope: 'dispatch', vehicleId: watchedVehicleId,
      fromDate: toIso(watchedRange[0]), toDate: toIso(watchedRange[1]),
    })
      .then(res => { if (alive) setConflictCandidates(toOrders(res.records ?? [])) })
      .catch(() => { if (alive) setConflictCandidates([]) })
    return () => { alive = false }
  }, [watchedVehicleId, rangeValid, watchedRange])

  const blockers = useMemo(() => {
    const list: string[] = []
    if (!canDirectRegister) list.push('當前賬號沒有「授權直接登記」權限，請改走審批用車或聯繫管理員授權')
    if (!selectedVehicle) list.push('未選擇車輛')
    else {
      if (!manageableDirectVehicles.some(v => v.id === selectedVehicle.id)) {
        list.push(`車輛 ${selectedVehicle.plateNo} 未開啟直接登記，或不在你的管理範圍內`)
      }
      vehicleDispatchable(selectedVehicle).forEach(b => list.push(b.message))
      if (!deptAllowed(selectedVehicle, watchedDeptId)) {
        list.push(`用車部門不在 ${selectedVehicle.plateNo} 的顯式授權範圍內`)
      }
      if (watchedPassenger != null && !passengerWithinSeatLimit(watchedPassenger, selectedVehicle.seatCount)) {
        list.push(`人數 ${watchedPassenger} 超過核定載客 ${selectedVehicle.seatCount}（含駕駛人）`)
      }
    }
    const driver = driverOptions.find(d => d.value === watchedDriverId)
    if (!driver) list.push('未選擇實際駕駛人')
    else driverQualified(driver.qualification).forEach(b => list.push(b.message))

    if (rangeValid) {
      findScheduleConflicts(conflictCandidates, {
        vehicleId: watchedVehicleId,
        driverEmpId: watchedDriverId,
        start: watchedRange[0], end: watchedRange[1],
      }).forEach(c => list.push(
        `${c.resource === 'vehicle' ? '車輛' : '駕駛人'} ${c.target} 在 ${c.conflictWindow} 已被 ${c.conflictUseNo} 占用`,
      ))
    } else {
      list.push('請填寫完整且合法的用車時段')
    }
    return list
  }, [canDirectRegister, selectedVehicle, manageableDirectVehicles, watchedDeptId, watchedPassenger,
      watchedVehicleId, watchedDriverId, watchedRange, rangeValid, driverOptions, conflictCandidates])

  const doRegister = async (values: FormState) => {
    // 申请人不再由前端反查/传入：服务端从登录态取 sys_user.id，杜绝代他人登记
    return onSubmit({
      vehicleId: values.vehicleId,
      driverEmpId: values.driverEmpId,
      actualUserName: values.actualUserName,
      departmentId: values.departmentId,
      purpose: values.purpose,
      origin: values.origin,
      destination: values.destination,
      plannedStart: values.plannedRange![0].format('YYYY-MM-DD HH:mm:ss'),
      plannedEnd: values.plannedRange![1].format('YYYY-MM-DD HH:mm:ss'),
      directRegisterReason: values.directRegisterReason,
      startOdometer: values.startOdometer,
      passengerCount: values.passengerCount,
    })
  }

  const runSubmit = async (values: FormState) => {
    setSubmitting(true)
    const ok = await doRegister(values)
    setSubmitting(false)
    if (ok) message.success('已直接登記並建立出車單據')
  }

  const handleSubmit = async () => {
    let values: FormState
    try {
      values = await form.validateFields()
    } catch {
      return // antd 已在字段下方提示
    }
    if (blockers.length) {
      Modal.confirm({
        title: '存在阻斷項，仍要提交？',
        className: 'custom-confirm-modal',
        icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
        okText: '仍然提交', cancelText: '返回修改',
        content: (
          <div className="confirm-info-card">
            {blockers.map(b => (
              <div className="confirm-info-row" key={b}><span>阻斷：</span><b style={{ color: '#FF4D4F' }}>{b}</b></div>
            ))}
            <div className="confirm-info-row"><span>說明：</span><b>最終是否放行由後端判定，此處僅提示。</b></div>
          </div>
        ),
        onOk: () => runSubmit(values),
      })
      return
    }
    await runSubmit(values)
  }


  return (
    <div className="content-area">
      {error && (
        <Alert
          type="error" showIcon style={{ marginBottom: 16 }}
          message={`操作未生效：${error}`}
          description="提交結果以服務端為準；此處顯示失敗原因，避免讓用戶以為已寫入台賬。"
        />
      )}
      <VehicleFormPageHeader
        title="授權直接登記"
        onBack={onBack}
        meta="用于明確授權的臨時安排、固定配車或緊急任務，不是繞過審批的通用入口"
      />

      {!canDirectRegister && (
        <Alert
          type="error" showIcon style={{ marginBottom: 16 }}
          message="當前賬號不具備「授權直接登記」權限"
          description="該權限獨立於普通的用車辦理操作權限，需由權限中心單獨授予；審批用車不受影響。"
        />
      )}

      <VehicleSection icon={<SafetyCertificateOutlined />} tone="special" title="可登記車輛" hint={`共 ${manageableDirectVehicles.length} 台`}>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, color: '#595959', marginBottom: 4 }}>選擇車輛</div>
          <Select
            style={{ width: '100%' }} placeholder={manageableDirectVehicles.length ? '請選擇車輛' : '無可登記車輛：需車管開啟直接登記且你在管理範圍內'}
            value={watchedVehicleId}
            onChange={v => {
              const vehicle = vehicles.find(x => x.id === v)
              form.setFieldsValue({
                vehicleId: v,
                departmentId: vehicle?.allowedDepts[0]?.deptId,
                startOdometer: vehicle?.currentOdometer,
              })
            }}
            options={manageableDirectVehicles.map(v => ({
              value: v.id,
              label: `${v.plateNo} · ${v.vehicleType} · ${VEHICLE_STATUS_LABEL[v.status]} · ${v.allowedDepts.map(d => d.deptName).join('/')}`,
            }))}
          />
        </div>
        {selectedVehicle && (
          <Descriptions column={4} size="small">
            <Descriptions.Item label="核定載客">{selectedVehicle.seatCount} 人</Descriptions.Item>
            <Descriptions.Item label="當前里程">{selectedVehicle.currentOdometer.toLocaleString()} km</Descriptions.Item>
            <Descriptions.Item label="保險有效期">{selectedVehicle.insuranceValidUntil ?? '未錄入'}</Descriptions.Item>
            <Descriptions.Item label="檢驗有效期">{selectedVehicle.inspectionValidUntil ?? '未錄入'}</Descriptions.Item>
          </Descriptions>
        )}
      </VehicleSection>

      <Form
        form={form}
        layout="vertical"
        initialValues={{
          actualUserName: '',
          purpose: '',
          plannedRange: [dayjs().hour(dayjs().hour() + 1).minute(0), dayjs().add(3, 'hour').minute(0)],
          passengerCount: 1,
        }}
      >
        <VehicleSection icon={<CarOutlined />} title="用車信息">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <Form.Item label="hidden vehicle id" name="vehicleId" hidden>
              <Input />
            </Form.Item>
            <Form.Item label="實際用車人" name="actualUserName" rules={[{ required: true, message: '請填寫實際用車人' }]}>
              <Input placeholder="代登記時必須如實填寫" maxLength={40} />
            </Form.Item>
            <Form.Item label="用車部門" name="departmentId" rules={[{ required: true, message: '請選擇用車部門' }]}>
              <TreeSelect
                showSearch treeNodeFilterProp="title" treeDefaultExpandAll
                placeholder="請選擇部門"
                style={{ width: '100%' }}
                treeData={filterDeptTree(deptTree.treeData, (selectedVehicle?.allowedDepts ?? []).map(d => d.deptId))}
              />
            </Form.Item>
            <Form.Item label="用車事由" name="purpose" rules={[{ required: true, message: '請填寫用車事由' }]} style={{ gridColumn: 'span 2' }}>
              <Input placeholder="如：緊急客戶接待" maxLength={200} />
            </Form.Item>
            <Form.Item label="出發地" name="origin" rules={[{ required: true, message: '請填寫出發地' }]}>
              <Input placeholder="如：公司" maxLength={60} />
            </Form.Item>
            <Form.Item label="目的地" name="destination" rules={[{ required: true, message: '請填寫目的地' }]}>
              <Input placeholder="如：氹仔酒店" maxLength={60} />
            </Form.Item>
            <Form.Item label="人數（含駕駛人）" name="passengerCount" rules={[{ required: true, message: '請填寫人數' }]}>
              <InputNumber min={1} max={60} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="計劃時段" name="plannedRange" rules={[{ required: true, message: '請選擇起止時間' }]} style={{ gridColumn: 'span 2' }}>
              <DatePicker.RangePicker
                showTime={{ format: 'HH:mm' }} format="YYYY-MM-DD HH:mm"
                style={{ width: '100%' }} placeholder={['開始時間', '結束時間']}
              />
            </Form.Item>
          </div>
        </VehicleSection>

        <VehicleSection icon={<TeamOutlined />} tone="config" title="駕駛人與起始里程">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <Form.Item label="實際駕駛人" name="driverEmpId" rules={[{ required: true, message: '請選擇駕駛人' }]}>
              <Select
                style={{ width: '100%' }} placeholder="請選擇駕駛人" showSearch optionFilterProp="label"
                options={driverOptions.map(d => ({ value: d.value, label: d.label }))}
              />
            </Form.Item>
            <Form.Item
              label="起始里程（km）" name="startOdometer"
              rules={[{ required: true, message: '請填寫起始里程' }]}
              extra="默認帶出上次確認值，有差異需在歸還時說明"
            >
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              label="直接登記原因" name="directRegisterReason"
              rules={[{ required: true, message: '請填寫直接登記原因' }, { min: 6, message: '原因不少於 6 個字' }]}
              style={{ gridColumn: 'span 3' }}
            >
              <Input.TextArea rows={2} maxLength={200} placeholder="如：客戶臨時改約，用車人無法操作系統，經電話確認授權" />
            </Form.Item>
          </div>
        </VehicleSection>

        <VehicleSection
          icon={<SafetyCertificateOutlined />}
          tone={blockers.length ? 'info' : 'success'}
          title="登記前校驗"
          hint={blockers.length === 0 ? '可提交登記' : undefined}
        >
          {blockers.length === 0 ? (
            <span>
              <Tag color="success">權限校驗通過</Tag>
              <Tag color="success">車輛可用</Tag>
              <Tag color="success">駕駛資格有效</Tag>
              <Tag color="success">時段無衝突</Tag>
            </span>
          ) : (
            <Alert
              type="error" showIcon message={`存在 ${blockers.length} 項阻斷`}
              description={<ul style={{ margin: '8px 0 0', paddingLeft: 20, fontSize: 12 }}>{blockers.map((b, i) => <li key={i}>{b}</li>)}</ul>}
            />
          )}
        </VehicleSection>

        <div className="form-footer">
          <Button onClick={onBack}>取消</Button>
          <Button type="primary" icon={<SendOutlined />} loading={saving || submitting} disabled={blockers.length > 0} onClick={handleSubmit}>
            確認登記
          </Button>
        </div>
      </Form>
    </div>
  )
}
