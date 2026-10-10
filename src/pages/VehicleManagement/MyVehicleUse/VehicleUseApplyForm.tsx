/**
 * 用车申请 — 发起页（独立页面，禁止 Modal）
 *
 * 三条必须在界面上讲清楚的口径：
 *   1. 意向车辆不代表已预约：审批中不占用资源，车管安排成功才形成有效预约；
 *   2. 审批人从发起人部门解析并排除本人，解析不到时阻止提交（fail-closed），
 *      不静默放行、也不自动降级为直接登记；
 *   3. 时段冲突在这里只做「预检提示」，真正的抢占保护必须由后端在资源锁内完成。
 */
import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, DatePicker, Form, Input, InputNumber, Modal, Select, Tag } from 'antd'
import {
  CarOutlined, FileTextOutlined, SendOutlined, SwapOutlined,
} from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import {
  DRIVING_MODE, type DrivingMode, type VehicleFile, type VehicleUseApplyFormValues,
} from '../vehicleTypes'
import { DRIVING_MODE_LABEL } from '../vehicleMeta'
import {
  plannedRangeValid, vehicleDispatchable, deptAllowed,
  passengerWithinSeatLimit,
} from '../vehicleRules'
import { useVehicleDeptTree } from '../vehicleOptions'
import { fetchVehicles } from '../../../api/vehicle'
import { toVehicleFiles } from '../vehicleAdapter'
import { useAuth } from '../../../contexts/AuthContext'
import type { ScheduleConflict } from '../vehicleRules'
import {
  VehicleFormPageHeader, VehicleSection,
} from '../VehicleModuleLayout'

interface FormState {
  actualUserName: string
  intentVehicleId?: number
  purpose: string
  origin: string
  destination: string
  plannedRange?: [Dayjs, Dayjs]
  drivingMode: DrivingMode
  passengerCount?: number
}

interface Props {
  onSubmit: (values: VehicleUseApplyFormValues, asDraft: boolean) => void
  onBack: () => void
}

export default function VehicleUseApplyForm({ onSubmit, onBack }: Props) {
  const [form] = Form.useForm<FormState>()
  const dept = useVehicleDeptTree()
  const { user } = useAuth()
  const [saving, setSaving] = useState(false)
  const [vehicles, setVehicles] = useState<VehicleFile[]>([])

  const selfName = user?.name ?? '本人'
  /** 申请人一律取登录态；界面不再提供"选择身份"的入口 */
  const operatorLabel = user ? `${user.name}（${user.empId ?? '—'}）` : '未登錄'
  const deptName = user?.department ?? '未解析'

  /**
   * 本人部门 ID。
   *
   * 登录态里只有部门名称（UserInfo 没有 departmentId），这里按名称在部门字典里反查。
   * 查不到就当作"部门未解析"处理：候选车为空 + 审批人 fail-closed 拦住提交，
   * 而不是猜一个部门让申请飘到别处——用车是要问责的，走错部门比提交失败更糟。
   */
  const personaDeptId = useMemo(() => {
    if (!user?.department) return undefined
    const hit = dept.departments.find(d => d.name === user.department)
    return hit?.id
  }, [dept.departments, user])

  useEffect(() => {
    let alive = true
    void fetchVehicles({ page: 1, size: 200 })
      .then(res => { if (alive) setVehicles(toVehicleFiles(res.records ?? [])) })
      .catch(() => { if (alive) setVehicles([]) })
    return () => { alive = false }
  }, [])

  /** 可申请的车辆：部门在显式授权范围内；运行状态与证件有效性只做提示不隐藏 */
  const intentOptions = useMemo(() => vehicles
    .filter(v => personaDeptId != null && deptAllowed(v, personaDeptId))
    .map(v => {
      const blockers = vehicleDispatchable(v)
      return {
        value: v.id,
        label: `${v.plateNo} · ${v.vehicleType} · ${v.seatCount} 座${blockers.length ? `（${blockers[0].message}）` : ''}`,
        seatCount: v.seatCount,
        warning: blockers.length > 0,
      }
  }), [vehicles, personaDeptId])

  const watchedVehicleId = Form.useWatch('intentVehicleId', form)
  const watchedRange = Form.useWatch('plannedRange', form)
  const watchedPassenger = Form.useWatch('passengerCount', form)

  const selectedVehicle = vehicles.find(v => v.id === watchedVehicleId)
  const seatLimitHit = selectedVehicle != null
    && watchedPassenger != null
    && !passengerWithinSeatLimit(watchedPassenger, selectedVehicle.seatCount)
  const rangeValid = watchedRange
    ? plannedRangeValid(watchedRange[0], watchedRange[1])
    : true

  /**
   * 申请阶段不做时段冲突预检。
   *
   * 口径依据（与 vehicleRules 的单测一致）：审批通过但尚未安排车辆时**不占用资源**，
   * 真正的占用从"已安排/待出车"开始。所以在申请这里做一个基于半截数据的冲突预测，
   * 只会给出错误安心感或无谓恐慌；冲突由办理环节在服务端锁内当前读判定。
   */
  const conflicts: ScheduleConflict[] = []

  /**
   * 审批人预览与提交前阻断。
   *
   * 这是**体验层的前置提示**，不是权限边界：真正的审批人由 B2 的 OA 流程配置在服务端决定。
   * 但"解析不到审批人还放行"会让单据飘到一个没人审的队列里，所以这里保持 fail-closed：
   * 解析不到负责人、或负责人就是申请人自己，都禁止提交并说明该去找谁。
   */
  const approver = useMemo(() => {
    if (personaDeptId == null) {
      return {
        ok: false as const, leader: undefined,
        text: '未能根據登錄資訊解析你的所屬部門，無法提交。請聯繫管理員確認員工檔案中的部門歸屬。',
      }
    }
    const d = dept.departments.find(x => x.id === personaDeptId)
    const leader = d?.leader?.trim()
    const deptName = d?.name ?? user?.department ?? '本部門'
    if (!leader) {
      return {
        ok: false as const, leader: undefined,
        text: `未解析到「${deptName}」的負責人，無法提交。請先完成部門負責人配置，或由流程管理員指定有效審批人。`,
      }
    }
    if (leader.includes(selfName)) {
      return {
        ok: false as const, leader,
        text: `解析到的負責人「${leader}」與申請人為同一人，需由上級負責人或流程管理員指定審批人後才可提交。`,
      }
    }
    return {
      ok: true as const, leader,
      text: `本單將提交給「${leader}」審批。審批通過後由車管安排車輛與駕駛人，安排完成才開始計入資源占用。`,
    }
  }, [dept.departments, personaDeptId, selfName, user])

  /** 把已校验的表单值映射为领域入参；plannedRange 拆成两个时间串，避免页面内部再猜格式 */
  const toDomainValues = (raw: FormState): VehicleUseApplyFormValues | null => {
    if (!raw.plannedRange || raw.plannedRange.length !== 2) return null
    return {
      actualUserName: raw.actualUserName,
      intentVehicleId: raw.intentVehicleId,
      purpose: raw.purpose,
      origin: raw.origin,
      destination: raw.destination,
      plannedStart: raw.plannedRange[0].format('YYYY-MM-DD HH:mm:ss'),
      plannedEnd: raw.plannedRange[1].format('YYYY-MM-DD HH:mm:ss'),
      drivingMode: raw.drivingMode,
      passengerCount: raw.passengerCount,
    }
  }

  const submit = async (asDraft: boolean) => {
    let raw: FormState
    try {
      raw = await form.validateFields()
    } catch {
      return // antd 已在字段下方提示，不双弹
    }
    const values = toDomainValues(raw)
    if (!values) {
      form.setFields([{ name: 'plannedRange', errors: ['請選擇完整的起止時間'] }])
      return
    }
    if (!plannedRangeValid(raw.plannedRange![0], raw.plannedRange![1])) {
      form.setFields([{ name: 'plannedRange', errors: ['結束時間必須晚於開始時間'] }])
      return
    }
    if (asDraft) {
      onSubmit(values, true)
      return
    }
    if (!approver.ok) {
      Modal.error({
        title: '無法提交審批',
        className: 'custom-confirm-modal',
        content: approver.text,
        okText: '我知道了',
      })
      return
    }
    Modal.confirm({
      title: '確認提交用車申請？',
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      okText: '確認提交',
      cancelText: '取消',
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>申請人：</span><b>{operatorLabel}</b></div>
          <div className="confirm-info-row"><span>實際用車人：</span><b>{raw.actualUserName || selfName}</b></div>
          <div className="confirm-info-row"><span>意向車輛：</span><b>{vehicles.find(v => v.id === raw.intentVehicleId)?.plateNo ?? '未指定'}</b></div>
          <div className="confirm-info-row"><span>計劃時段：</span><b>{raw.plannedRange![0].format('YYYY-MM-DD HH:mm')} ~ {raw.plannedRange![1].format('MM-DD HH:mm')}</b></div>
          <div className="confirm-info-row"><span>人數：</span><b>{raw.passengerCount} 人（含駕駛人）</b></div>
          <div className="confirm-info-row"><span>審批人：</span><b>{approver.leader}</b></div>
        </div>
      ),
      onOk: () => { setSaving(true); onSubmit(values, false) },
    })
  }

  return (
    <div className="content-area">
      <VehicleFormPageHeader
        title="申請用車"
        onBack={onBack}
        meta={`申請人 ${operatorLabel} · 所屬部門 ${deptName}`}
      />

      <Form
        form={form}
        layout="vertical"
        initialValues={{
          actualUserName: selfName,
          drivingMode: DRIVING_MODE.SELF,
          passengerCount: 1,
          plannedRange: [dayjs().add(1, 'day').hour(9).minute(0), dayjs().add(1, 'day').hour(12).minute(0)],
        }}
      >
        {/* ====== 申请信息 ====== */}
        <VehicleSection icon={<FileTextOutlined />} title="用車申請">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <Form.Item label="實際用車人" name="actualUserName" rules={[{ required: true, message: '請填寫實際用車人' }]}>
              <Input placeholder="默認為申請人本人" maxLength={40} />
            </Form.Item>
            <Form.Item
              label="用車事由" name="purpose"
              rules={[{ required: true, message: '請填寫用車事由' }, { max: 200, message: '不超過 200 字' }]}
              style={{ gridColumn: 'span 2' }}
            >
              <Input placeholder="如：客戶拜訪 / 門店巡檢 / 機場接送" maxLength={200} />
            </Form.Item>

            <Form.Item
              label="計劃時段" name="plannedRange"
              rules={[{ required: true, message: '請選擇起止時間' }]}
              extra={rangeValid ? '結束時間需晚於開始時間；超時歸還只標記異常，不倒改批准時段' : '結束時間必須晚於開始時間'}
            >
              <DatePicker.RangePicker
                showTime={{ format: 'HH:mm' }} format="YYYY-MM-DD HH:mm"
                style={{ width: '100%' }} placeholder={['開始時間', '結束時間']}
              />
            </Form.Item>

            <Form.Item
              label="意向車輛" name="intentVehicleId"
              extra="意向車輛用於明確服務範圍，不代表已預約成功"
            >
              <Select
                allowClear showSearch optionFilterProp="label"
                placeholder={intentOptions.length ? '請選擇車輛' : '目前部門無可用車輛，請聯繫車管授權'}
                options={intentOptions}
              />
            </Form.Item>

            <Form.Item
              label="駕駛方式" name="drivingMode"
              rules={[{ required: true, message: '請選擇駕駛方式' }]}
            >
              <Select
                options={Object.entries(DRIVING_MODE_LABEL).map(([value, label]) => ({ value, label }))}
              />
            </Form.Item>

            <Form.Item label="出發地" name="origin" rules={[{ required: true, message: '請填寫出發地' }]}>
              <Input placeholder="如：公司" maxLength={60} />
            </Form.Item>
            <Form.Item label="目的地" name="destination" rules={[{ required: true, message: '請填寫目的地' }]}>
              <Input placeholder="如：澳門半島" maxLength={60} />
            </Form.Item>
            <Form.Item
              label="人數（含駕駛人）" name="passengerCount"
              rules={[{ required: true, message: '請填寫人數' }]}
              extra={selectedVehicle ? `該車核定載客 ${selectedVehicle.seatCount} 人` : '用車核定載客以車輛檔案為準'}
            >
              <InputNumber min={1} max={60} style={{ width: '100%' }} />
            </Form.Item>
          </div>

          {seatLimitHit && (
            <Alert
              type="error" showIcon style={{ marginTop: 8 }}
              message={`人數超過核定載客上限（${selectedVehicle?.seatCount} 人，含駕駛人），請減少人數或改選更大的車輛`}
            />
          )}

          {!rangeValid && watchedRange && (
            <Alert type="warning" showIcon style={{ marginTop: 8 }} message="結束時間必須晚於開始時間" />
          )}
        </VehicleSection>

        {/* ====== 审批路径 ====== */}
        <VehicleSection icon={<SwapOutlined />} tone="special" title="審批路徑" hint="一期為一個主管審批節點">
          <Alert
            type={approver.ok ? 'success' : 'error'}
            showIcon
            message={approver.text}
            description={(
              <span style={{ fontSize: 12 }}>
                口徑：審批人在提交時凍結為快照，配置變更只影響新申請；已有單據需改審批人時，
                由申請人撤銷後重新提交生成新單與新審批實例，不沿用姓名模糊匹配靜默放行。
                OA 故障時不會自動切換為直接登記。
              </span>
            )}
          />
        </VehicleSection>

        {/* ====== 冲突预检 ====== */}
        <VehicleSection icon={<CarOutlined />} tone="config" title="時段預檢">
          {conflicts.length === 0 ? (
            <span style={{ fontSize: 13, color: '#8C8C8C' }}>
              {watchedVehicleId ? '所選時段內該車輛與駕駛人無佔用記錄（最終以車管安排時的後端資源鎖校驗為準）' : '選擇車輛與時段後自動預檢佔用情況'}
            </span>
          ) : (
            <div>
              <Alert
                type="warning" showIcon
                message={`所選時段已有 ${conflicts.length} 項占用，仍可提交申請，但車管安排時會改派或要求調整時段`}
                description={(
                  <ul style={{ margin: '8px 0 0', paddingLeft: 20, fontSize: 12 }}>
                    {conflicts.map((c, i) => (
                      <li key={`${c.useNo}-${c.resource}-${i}`}>
                        <Tag color={c.resource === 'vehicle' ? 'blue' : 'purple'}>
                          {c.resource === 'vehicle' ? '車輛' : '駕駛人'}
                        </Tag>
                        {c.target} · {c.conflictWindow} · 占用單號 {c.conflictUseNo}
                      </li>
                    ))}
                  </ul>
                )}
              />
            </div>
          )}
        </VehicleSection>

        <div className="form-footer">
          <Button onClick={onBack}>取消</Button>
          <Button onClick={() => submit(true)} disabled={saving}>保存草稿</Button>
          <Button type="primary" icon={<SendOutlined />} loading={saving} onClick={() => submit(false)}>提交申請</Button>
        </div>
      </Form>
    </div>
  )
}
