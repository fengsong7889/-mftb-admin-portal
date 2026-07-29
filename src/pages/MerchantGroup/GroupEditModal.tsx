import { useEffect } from 'react'
import { Modal, Form, Input, message } from 'antd'
import type { MerchantGroupItem, MerchantGroupPayload } from '../../api/merchantGroup'
import { createMerchantGroup, updateMerchantGroup } from '../../api/merchantGroup'

interface GroupEditModalProps {
  open: boolean
  editingRecord: MerchantGroupItem | null
  onClose: () => void
  onSuccess: () => void
}

export default function GroupEditModal({ open, editingRecord, onClose, onSuccess }: GroupEditModalProps) {
  const [form] = Form.useForm<MerchantGroupPayload>()
  const isEdit = !!editingRecord

  useEffect(() => {
    if (open) {
      if (editingRecord) {
        form.setFieldsValue({
          groupName: editingRecord.groupName,
          loginAccount: editingRecord.loginAccount,
        })
      } else {
        form.resetFields()
      }
    }
  }, [open, editingRecord, form])

  const handleOk = async () => {
    try {
      const values = await form.validateFields()
      if (isEdit && editingRecord) {
        await updateMerchantGroup(editingRecord.id, values)
        message.success('編輯成功')
      } else {
        await createMerchantGroup(values)
        message.success('新增成功')
      }
      onSuccess()
    } catch (err: unknown) {
      // 表單校驗失敗不處理
      if (err && typeof err === 'object' && 'errorFields' in err) return
      message.error('操作失敗，請重試')
    }
  }

  return (
    <Modal
      title={isEdit ? '編輯集團' : '新增集團'}
      open={open}
      onOk={handleOk}
      onCancel={onClose}
      okText="確認"
      cancelText="取消"
      width={500}
      destroyOnClose
    >
      <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
        {/* 集團ID 由系統自增生成，不可自主命名 */}
        <Form.Item label="集團ID">
          <Input value={editingRecord?.groupCode} placeholder="系統自動生成（如 JT000001）" disabled />
        </Form.Item>
        <Form.Item
          name="groupName"
          label="集團名稱"
          rules={[
            { required: true, message: '請輸入集團名稱' },
            { max: 128, message: '最多128個字符' },
          ]}
        >
          <Input placeholder="請輸入集團名稱" />
        </Form.Item>
        <Form.Item
          name="loginAccount"
          label="登錄主賬號"
          rules={[{ max: 64, message: '最多64個字符' }]}
        >
          <Input placeholder="請輸入登錄主賬號" />
        </Form.Item>
      </Form>
    </Modal>
  )
}
