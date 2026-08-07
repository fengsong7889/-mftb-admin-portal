import { useEffect } from 'react'
import { Modal, Form, Input, message } from 'antd'
import { useTranslation } from 'react-i18next'
import type { MerchantGroupItem, MerchantGroupPayload } from '../../api/merchantGroup'
import { createMerchantGroup, updateMerchantGroup } from '../../api/merchantGroup'

interface GroupEditModalProps {
  open: boolean
  editingRecord: MerchantGroupItem | null
  onClose: () => void
  onSuccess: () => void
}

export default function GroupEditModal({ open, editingRecord, onClose, onSuccess }: GroupEditModalProps) {
  const { t } = useTranslation('merchantGroup')
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
        message.success(t('common:editSuccess'))
      } else {
        await createMerchantGroup(values)
        message.success(t('common:addSuccess'))
      }
      onSuccess()
    } catch (err: unknown) {
      // 表單校驗失敗不處理
      if (err && typeof err === 'object' && 'errorFields' in err) return
      message.error(t('common:operationFailed'))
    }
  }

  return (
    <Modal
      title={isEdit ? t('editGroupTitle') : t('addGroupTitle')}
      open={open}
      onOk={handleOk}
      onCancel={onClose}
      okText={t('common:confirm')}
      cancelText={t('common:cancel')}
      width={500}
      destroyOnClose
    >
      <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
        {/* 集團ID 由系統自增生成，不可自主命名 */}
        <Form.Item label={t('groupIdLabel')}>
          <Input value={editingRecord?.groupCode} placeholder={t('groupIdAutoGen')} disabled />
        </Form.Item>
        <Form.Item
          name="groupName"
          label={t('groupNameLabel')}
          rules={[
            { required: true, message: t('groupNameRequired') },
            { max: 128, message: t('groupNameMax') },
          ]}
        >
          <Input placeholder={t('groupNamePlaceholder')} />
        </Form.Item>
        <Form.Item
          name="loginAccount"
          label={t('loginAccountLabel')}
          rules={[{ max: 64, message: t('loginAccountMax') }]}
        >
          <Input placeholder={t('loginAccountPlaceholder')} />
        </Form.Item>
      </Form>
    </Modal>
  )
}
