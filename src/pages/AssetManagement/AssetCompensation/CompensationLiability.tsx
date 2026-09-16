/**
 * 定责登记 — 接通真实后端 API
 */
import { useState, useEffect } from 'react'
import { Alert, Button, Form, Input, InputNumber, Select, Spin, TreeSelect, message } from 'antd'
import { SaveOutlined } from '@ant-design/icons'
import type { CompensationRow, LiabilityDTO } from '../../../api/eamCompensation'
import { fetchDepartments } from '../../../api/department'
import { fetchEmployees, type EmployeeItem } from '../../../api/employee'
import { ReturnHeader, ReturnSection } from '../AssetReturn/ReturnLayout'

const CAUSE_OPTIONS = [
  { value: 'human', label: '人为' },
  { value: 'natural', label: '自然' },
  { value: 'third_party', label: '第三方' },
  { value: 'quality', label: '质量' },
]
const PARTY_OPTIONS = [
  { value: 'employee', label: '员工' },
  { value: 'department', label: '部门' },
  { value: 'company', label: '公司' },
  { value: 'none', label: '未定' },
]

interface Values {
  party: 'employee' | 'department' | 'company' | 'none'
  responsibleId: number
  department: string
  cause: 'human' | 'natural' | 'third_party' | 'quality'
  amount: number
  basis: string
}

interface Props {
  record?: CompensationRow
  loading?: boolean
  canEdit?: boolean
  onSubmit: (dto: LiabilityDTO) => void
  onBack: () => void
}

export default function CompensationLiability({ record, loading = false, canEdit = true, onSubmit, onBack }: Props) {
  const [form] = Form.useForm<Values>()
  const [employees, setEmployees] = useState<EmployeeItem[]>([])
  const [departments, setDepartments] = useState<{ title: string; value: number }[]>([])

  useEffect(() => {
    fetchEmployees({ page: 1, size: 200, employmentStatus: 'active' })
      .then(res => setEmployees(res.records))
      .catch(() => {})
    fetchDepartments()
      .then(depts => setDepartments(depts.map(d => ({ title: d.name, value: d.id }))))
      .catch(() => {})
  }, [])

  if (!record) return <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
  if (!canEdit || record.status !== 'pending' || record.reviewRequired > 0) {
    return <Alert type="warning" showIcon message="当前记录不允许定责" />
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      if (values.amount <= 0) { message.error('金额必须大于零'); return }
      const emp = employees.find(e => e.id === values.responsibleId)
      onSubmit({
        party: values.party,
        responsibleId: values.responsibleId,
        responsibleName: emp?.name,
        department: values.department,
        cause: values.cause,
        amount: values.amount,
        basis: values.basis,
      })
    } catch { /* validation */ }
  }

  return <>
    <ReturnHeader title={`定责 · ${record.compNo}`} onBack={onBack} />
    <div className="return-summary">{record.assetName} · 原持有人 {record.holderName} · 损失类型 {record.damageType === 'damage' ? '损坏' : '遗失'}</div>
    <Spin spinning={loading}>
      <Form<Values> form={form} layout="vertical" disabled={loading}>
        <ReturnSection title="责任认定">
          <Alert className="claim-notice" showIcon type="info" message="不自动认定员工有责，不自动扣款。定责只确认责任对象和金额依据。" />
          <div className="return-grid">
            <Form.Item name="party" label="责任对象" rules={[{ required: true }]}>
              <Select options={PARTY_OPTIONS} placeholder="选择责任对象" />
            </Form.Item>
            <Form.Item name="responsibleId" label="责任人" rules={[{ required: true }]}>
              <Select showSearch allowClear placeholder="搜索员工"
                options={employees.map(e => ({ value: e.id, label: `${e.name}(${e.empId})` }))}
                filterOption={(input, option) => (option?.label as string)?.toLowerCase().includes(input.toLowerCase()) ?? false} />
            </Form.Item>
            <Form.Item name="department" label="责任部门" rules={[{ required: true }]}>
              <TreeSelect allowClear treeDefaultExpandAll showSearch treeNodeFilterProp="title" treeData={departments} placeholder="选择部门" />
            </Form.Item>
            <Form.Item name="cause" label="原因分类" rules={[{ required: true }]}>
              <Select options={CAUSE_OPTIONS} placeholder="选择原因" />
            </Form.Item>
            <Form.Item name="amount" label="应赔金额（分）" rules={[{ required: true }, { validator: (_, v) => v > 0 ? Promise.resolve() : Promise.reject(new Error('金额必须大于零')) }]}>
              <InputNumber min={1} step={10000} addonAfter="分" style={{ width: '100%' }} />
            </Form.Item>
          </div>
          <Form.Item name="basis" label="定责依据" rules={[{ required: true, whitespace: true }]}>
            <Input.TextArea rows={3} maxLength={500} />
          </Form.Item>
        </ReturnSection>
      </Form>
    </Spin>
    <div className="form-footer">
      <Button onClick={onBack}>取消</Button>
      <Button type="primary" icon={<SaveOutlined />} onClick={handleSubmit} loading={loading}>确认定责</Button>
    </div>
  </>
}
