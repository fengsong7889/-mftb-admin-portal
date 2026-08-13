import { useState, useEffect } from 'react'
import { Modal, Form, Input, Select, Radio, Divider } from 'antd'
import {
  UserOutlined,
  TeamOutlined,
  ApartmentOutlined,
  CrownOutlined,
} from '@ant-design/icons'
import { APPROVER_TYPE_LABELS, APPROVAL_RULE_LABELS } from './types'
import type { WorkflowNode, ApproverType, ApprovalRule } from './types'
import { getApproverOptions } from './options'

interface Props {
  open: boolean
  /** 編輯時傳入已有節點，新增時為 null */
  node: WorkflowNode | null
  /** 新增時的節點排序號 */
  nextSortOrder: number
  onOk: (values: {
    name: string
    approverType: ApproverType
    approverIds: string[]
    approvalRule: ApprovalRule
    ccUserIds: string[]
  }) => void
  onCancel: () => void
}

/** 審批人類型圖標 */
const approverTypeIcons: Record<ApproverType, React.ReactNode> = {
  person: <UserOutlined />,
  role: <TeamOutlined />,
  department_leader: <ApartmentOutlined />,
  initiator_leader: <CrownOutlined />,
}

/** 審批人配置彈窗：僅配置節點名稱與審批人相關字段（條件獨立於「條件設置」彈窗） */
export default function ApproverConfigModal({ open, node, nextSortOrder, onOk, onCancel }: Props) {
  const [form] = Form.useForm()
  const [approverType, setApproverType] = useState<ApproverType>('role')

  /* 打開時初始化表單 */
  useEffect(() => {
    if (open) {
      if (node) {
        form.setFieldsValue({
          name: node.name,
          sortOrder: node.sortOrder,
          approverType: node.approverType,
          approverIds: node.approverIds,
          approvalRule: node.approvalRule,
          ccUserIds: node.ccUserIds,
        })
        setApproverType(node.approverType)
      } else {
        form.resetFields()
        form.setFieldsValue({ sortOrder: nextSortOrder, approverType: 'role', approvalRule: 'any' })
        setApproverType('role')
      }
    }
  }, [open, node, nextSortOrder, form])

  const handleOk = async () => {
    try {
      const values = await form.validateFields()
      onOk({
        name: values.name,
        approverType: values.approverType as ApproverType,
        approverIds: values.approverIds || [],
        approvalRule: values.approvalRule as ApprovalRule,
        ccUserIds: values.ccUserIds || [],
      })
    } catch { /* 表單校驗失敗 */ }
  }

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <TeamOutlined style={{ color: '#E8720C' }} />
          <span>{node ? `審批人設置：${node.name}` : '新增審批節點'}</span>
        </div>
      }
      open={open}
      onOk={handleOk}
      onCancel={onCancel}
      okText="確認"
      cancelText="取消"
      width={600}
      destroyOnClose
      styles={{ body: { maxHeight: '65vh', overflowY: 'auto', padding: '16px 24px' } }}
    >
      <Form form={form} layout="vertical" requiredMark={false}>
        <Form.Item name="name" label="節點名稱" rules={[{ required: true, message: '請輸入節點名稱' }]}>
          <Input placeholder="如：業務主管審批" maxLength={30} />
        </Form.Item>

        <Divider style={{ margin: '12px 0' }} />

        <Form.Item name="approverType" label="審批人類型">
          <Radio.Group onChange={e => setApproverType(e.target.value)}>
            {(Object.entries(APPROVER_TYPE_LABELS) as [ApproverType, string][]).map(([key, label]) => (
              <Radio.Button key={key} value={key} style={{ marginBottom: 4 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  {approverTypeIcons[key]}{label}
                </span>
              </Radio.Button>
            ))}
          </Radio.Group>
        </Form.Item>

        {approverType === 'person' && (
          <Form.Item name="approverIds" label="選擇人員" rules={[{ required: true, message: '請選擇審批人員' }]}>
            <Select mode="multiple" placeholder="選擇審批人員" options={getApproverOptions('person')} />
          </Form.Item>
        )}

        {approverType === 'role' && (
          <Form.Item name="approverIds" label="選擇角色" rules={[{ required: true, message: '請選擇審批角色' }]}>
            <Select mode="multiple" placeholder="選擇審批角色" options={getApproverOptions('role')} />
          </Form.Item>
        )}

        {approverType === 'department_leader' && (
          <Form.Item name="approverIds" label="選擇部門" rules={[{ required: true, message: '請選擇部門' }]}>
            <Select mode="multiple" placeholder="選擇部門（取該部門主管為審批人）" options={getApproverOptions('department_leader')} />
          </Form.Item>
        )}

        {approverType === 'initiator_leader' && (
          <div style={{ padding: '8px 12px', background: '#F6FFED', borderRadius: 6, fontSize: 12, color: '#52C41A', marginBottom: 16 }}>
            <CrownOutlined style={{ marginRight: 4 }} />
            自動取發起人的直屬主管作為審批人，無需手動配置
          </div>
        )}

        <Form.Item name="approvalRule" label="審批規則">
          <Radio.Group>
            {(Object.entries(APPROVAL_RULE_LABELS) as [ApprovalRule, string][]).map(([key, label]) => (
              <Radio key={key} value={key}>{label}</Radio>
            ))}
          </Radio.Group>
        </Form.Item>

        <Divider style={{ margin: '12px 0' }} />

        {/* 抄送 */}
        <Form.Item name="ccUserIds" label="抄送人員">
          <Select mode="multiple" placeholder="選擇抄送人員（可選）" options={getApproverOptions('person')} allowClear />
        </Form.Item>
      </Form>
    </Modal>
  )
}
