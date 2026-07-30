import { useEffect, useState } from 'react'
import { Modal, Form, Input, Select, message } from 'antd'
import type { StoreItem, StorePayload } from '../../api/store'
import { createStore, updateStore } from '../../api/store'
import type { MerchantGroupItem } from '../../api/merchantGroup'
import { fetchAllMerchantGroups } from '../../api/merchantGroup'
import { BIZ_CHANNEL_OPTIONS } from '../../constants/bizChannel'

/** 品牌选项 */
const BRAND_OPTIONS = [
  { label: '闪蜂', value: 'flashBee' },
  { label: 'mFood', value: 'mFood' },
]


interface StoreEditModalProps {
  open: boolean
  editingRecord: StoreItem | null
  /** 从集团管理跳过来时预选的集团ID */
  presetGroupId?: number | null
  onClose: () => void
  onSuccess: () => void
}

export default function StoreEditModal({
  open, editingRecord, presetGroupId, onClose, onSuccess,
}: StoreEditModalProps) {
  const [form] = Form.useForm<StorePayload>()
  const isEdit = !!editingRecord
  const [groups, setGroups] = useState<MerchantGroupItem[]>([])
  const [groupsLoading, setGroupsLoading] = useState(false)

  // 加载集团列表
  useEffect(() => {
    if (open) {
      setGroupsLoading(true)
      fetchAllMerchantGroups()
        .then(setGroups)
        .catch(() => message.error('加载集团列表失败'))
        .finally(() => setGroupsLoading(false))
    }
  }, [open])

  useEffect(() => {
    if (open) {
      if (editingRecord) {
        form.setFieldsValue({
          groupId: editingRecord.groupId,
          storeName: editingRecord.storeName,
          loginAccount: editingRecord.loginAccount,
        })
        // 品牌為單選，直接設置字符串值；業務頻道仍為多選
        form.setFieldValue('brand', editingRecord.brand ? editingRecord.brand.trim() : undefined)
        form.setFieldValue('bizChannel', editingRecord.bizChannel ? editingRecord.bizChannel.split(',').map(s => s.trim()).filter(Boolean) : [])
      } else {
        form.resetFields()
        if (presetGroupId) {
          form.setFieldValue('groupId', presetGroupId)
        }
      }
    }
  }, [open, editingRecord, presetGroupId, form])

  const handleOk = async () => {
    try {
      const values = await form.validateFields()
      const payload = {
        ...values,
        brand: values.brand,
        bizChannel: Array.isArray(values.bizChannel) ? values.bizChannel.join(',') : values.bizChannel,
      }
      if (isEdit && editingRecord) {
        await updateStore(editingRecord.id, payload)
        message.success('編輯成功')
      } else {
        await createStore(payload)
        message.success('新增成功')
      }
      onSuccess()
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      message.error('操作失敗，請重試')
    }
  }

  return (
    <Modal
      title={isEdit ? '編輯門店' : '新增門店'}
      open={open}
      onOk={handleOk}
      onCancel={onClose}
      okText="確認"
      cancelText="取消"
      width={560}
      destroyOnClose
    >
      <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
        <Form.Item
          name="groupId"
          label="所屬集團"
          rules={[{ required: true, message: '請選擇所屬集團' }]}
        >
          <Select
            placeholder="請選擇所屬集團"
            loading={groupsLoading}
            disabled={isEdit}
            showSearch
            optionFilterProp="label"
            options={groups.map(g => ({
              label: `${g.groupCode} - ${g.groupName}`,
              value: g.id,
            }))}
          />
        </Form.Item>
        {/* 門店ID 由系統自增生成，不可自主命名 */}
        <Form.Item label="門店ID">
          <Input value={editingRecord?.storeCode} placeholder="系統自動生成（如 MD00001）" disabled />
        </Form.Item>
        <Form.Item
          name="storeName"
          label="門店名稱"
          rules={[
            { required: true, message: '請輸入門店名稱' },
            { max: 128, message: '最多128個字符' },
          ]}
        >
          <Input placeholder="請輸入門店名稱" />
        </Form.Item>
        <Form.Item name="brand" label="所屬品牌" rules={[{ required: true, message: '請選擇所屬品牌' }]}>
          <Select
            placeholder="請選擇品牌"
            allowClear
            options={BRAND_OPTIONS}
          />
        </Form.Item>
        <Form.Item name="bizChannel" label="業務頻道">
          <Select
            placeholder="請選擇業務頻道（可多選）"
            mode="multiple"
            allowClear
            options={BIZ_CHANNEL_OPTIONS}
          />
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
