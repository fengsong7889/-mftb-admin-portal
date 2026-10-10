/**
 * 驾驶资格核验记录 — 新增页（独立页面，禁止 Modal）
 *
 * 一期只保存最小核验字段：员工、适用地区、准驾范围、有效期、核验人。
 * 明确不收集：完整驾驶证号、证件照片。需要影像凭证时另立需求评估脱敏方案，
 * 不在本页顺手加字段。
 *
 * 提交由父级（VehicleFiles/index）走真实接口，本组件只负责收集与校验，
 * 失败时不伪装成功——后端返回什么错就提示什么错。
 */
import { useState } from 'react'
import { Alert, Button, DatePicker, Form, Input, Select, message } from 'antd'
import { FileProtectOutlined, SaveOutlined } from '@ant-design/icons'
import type { Dayjs } from 'dayjs'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../../contexts/AuthContext'
import { LICENSE_CLASS_OPTIONS, LICENSE_REGION_OPTIONS } from '../vehicleMeta'
import { newRequestKey, type QualificationSave } from '../../../api/vehicle'
import { useVehicleEmployees } from '../vehicleOptions'
import {
  VehicleFormPageHeader, VehicleSection,
} from '../VehicleModuleLayout'

interface FormState {
  empId?: number
  region: string
  licenseClass: string
  validUntil?: Dayjs
  verifiedBy: string
  remark?: string
}

interface Props {
  vehicleId?: number
  saving: boolean
  /** 由父级调用真实接口；返回 false 表示失败，表单保持打开让用户修正 */
  onSubmit: (payload: QualificationSave) => Promise<boolean>
  onBack: () => void
}

export default function QualificationForm({ vehicleId, saving, onSubmit, onBack }: Props) {
  const { user } = useAuth()
  const { employees, loading } = useVehicleEmployees()
  const [form] = Form.useForm<FormState>()
  const [submitting, setSubmitting] = useState(false)

  // 直接刷 URL 且没带 vehicleId 时，返回目标会退到列表，避免跳到 id=空 的详情
  const navigate = useNavigate()
  const back = onBack
  const busy = saving || submitting

  const handleSubmit = async () => {
    let raw: FormState
    try {
      raw = await form.validateFields()
    } catch {
      return // antd 已在字段下方提示，不双弹
    }
    const emp = employees.find(e => e.empId === raw.empId)
    if (!emp) {
      // 驾驶人必须能落到稳定员工 ID，否则后续权限判定与任务指派会错位
      message.warning('未找到該員工記錄，請從下拉列表中選擇在職員工')
      return
    }
    if (!raw.validUntil) {
      form.setFields([{ name: 'validUntil', errors: ['請選擇有效期'] }])
      return
    }
    setSubmitting(true)
    const ok = await onSubmit({
      userId: emp.empId,
      region: raw.region,
      licenseClass: raw.licenseClass,
      validUntil: raw.validUntil.format('YYYY-MM-DD'),
      remark: raw.remark,
      requestKey: newRequestKey('qual'),
    })
    setSubmitting(false)
    if (ok) {
      // 成功才离开页面；失败留在原地让用户看到原因并重试
      if (vehicleId) back()
      else navigate('/vehicle-files')
    }
  }

  return (
    <div className="content-area">
      <VehicleFormPageHeader
        title="新增駕駛資格核驗"
        onBack={back}
        meta="核驗結果直接影響該員工能否被安排出車"
      />

      {!employees.length && !loading && (
        <Alert
          type="warning" showIcon style={{ marginBottom: 16 }}
          message="未取到在職員工名單"
          description="可能是後端暫不可用或你沒有員工查詢權限。此時不要重複提交，先刷新或聯繫管理員。"
        />
      )}

      <Form
        form={form}
        layout="vertical"
        initialValues={{
          region: '澳門',
          licenseClass: 'C1',
          verifiedBy: user ? `${user.name}（${user.empId ?? '—'}）` : undefined,
        }}
      >
        <VehicleSection icon={<FileProtectOutlined />} tone="success" title="核驗信息">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <Form.Item
              label="駕駛人（內部員工）" name="empId"
              rules={[{ required: true, message: '請選擇員工' }]}
              extra="按穩定員工 ID 關聯，姓名只作展示"
            >
              <Select
                showSearch optionFilterProp="label" loading={loading}
                placeholder="請選擇員工"
                options={employees.map(e => ({ value: e.empId, label: `${e.empName}（${e.empNo}） · ${e.department ?? '—'}` }))}
              />
            </Form.Item>
            <Form.Item label="駕照適用地區" name="region" rules={[{ required: true, message: '請選擇適用地區' }]}>
              <Select options={LICENSE_REGION_OPTIONS} />
            </Form.Item>
            <Form.Item label="準駕範圍" name="licenseClass" rules={[{ required: true, message: '請選擇準駕範圍' }]}>
              <Select options={LICENSE_CLASS_OPTIONS} />
            </Form.Item>
            <Form.Item
              label="有效期至" name="validUntil"
              rules={[{ required: true, message: '請選擇有效期' }]}
              extra="過期後按失效處理，不可安排新出車"
            >
              <DatePicker style={{ width: '100%' }} placeholder="選擇日期" />
            </Form.Item>
            <Form.Item label="核驗人" name="verifiedBy" rules={[{ required: true, message: '請填寫核驗人' }]}>
              <Input placeholder="承辦核驗的人員" maxLength={40} />
            </Form.Item>
            <Form.Item label="備註" name="remark" style={{ gridColumn: 'span 3' }}>
              <Input placeholder="選填" maxLength={200} />
            </Form.Item>
          </div>
          <div style={{ fontSize: 12, color: '#8C8C8C' }}>
            隱私邊界：本頁不收集完整駕駛證號與證件照片。若後續需要影像憑證，
            需單獨評估存儲與脫敏方案，不在此頁順手加字段。
          </div>
        </VehicleSection>

        <div className="form-footer">
          <Button onClick={back}>取消</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={busy} onClick={handleSubmit}>保存</Button>
        </div>
      </Form>
    </div>
  )
}
