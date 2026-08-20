import { useEffect, useState } from 'react'
import { Modal, Form, Input, Select, message, TreeSelect } from 'antd'
import { useTranslation } from 'react-i18next'
import type { StoreItem, StorePayload } from '../../api/store'
import { createStore, updateStore } from '../../api/store'
import type { MerchantGroupItem } from '../../api/merchantGroup'
import { fetchAllMerchantGroups } from '../../api/merchantGroup'
import { BIZ_CHANNEL_OPTIONS } from '../../constants/bizChannel'
import { REGION_TREE_DATA } from '../Recommend/constants'

/** 所在区域树：在组件内翻译 titleKey */

/** 品牌选项（品牌名不翻译，由 BrandTag 组件处理） */
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
  const { t } = useTranslation('store')

  /** 翻譯後的區域樹 */
  const STORE_REGION_TREE = REGION_TREE_DATA.map(node => ({
    ...node,
    title: t(`translation:${node.titleKey}`),
    selectable: false,
    children: (node.children ?? []).map((c: any) => ({ ...c, title: t(`translation:${c.titleKey}`) })),
  }))
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
        .catch(() => message.error(t('loadGroupFailed')))
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
          region: editingRecord.region ?? undefined,
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
        message.success(t('common:editSuccess'))
      } else {
        await createStore(payload)
        message.success(t('common:addSuccess'))
      }
      onSuccess()
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      message.error(t('common:operationFailed'))
    }
  }

  return (
    <Modal
      title={isEdit ? t('editStoreTitle') : t('addStoreTitle')}
      open={open}
      onOk={handleOk}
      onCancel={onClose}
      okText={t('common:save')}
      cancelText={t('common:cancel')}
      width={560}
      destroyOnClose
    >
      <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
        <Form.Item
          name="groupId"
          label={t('groupLabel')}
          rules={[{ required: true, message: t('groupRequired') }]}
        >
          <Select
            placeholder={t('groupPlaceholder')}
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
        <Form.Item label={t('storeIdLabel')}>
          <Input value={editingRecord?.storeCode} placeholder={t('storeIdAutoGen')} disabled />
        </Form.Item>
        <Form.Item
          name="storeName"
          label={t('storeNameLabel')}
          rules={[
            { required: true, message: t('storeNameRequired') },
            { max: 128, message: t('storeNameMax') },
          ]}
        >
          <Input placeholder={t('storeNamePlaceholder')} />
        </Form.Item>
        <Form.Item name="brand" label={t('common:brand')} rules={[{ required: true, message: t('brandRequired') }]}>
          <Select
            placeholder={t('brandPlaceholder')}
            allowClear
            options={BRAND_OPTIONS}
          />
        </Form.Item>
        <Form.Item name="bizChannel" label={t('bizChannelLabel')}>
          <Select
            placeholder={t('bizChannelPlaceholder')}
            mode="multiple"
            allowClear
            options={BIZ_CHANNEL_OPTIONS}
          />
        </Form.Item>
        {/* 所在區域=商圈：按澳門區域/氹仔區域树形分组展示，購買按商圈定價的廣告時跟隨門店 */}
        <Form.Item name="region" label={t('regionLabel')} tooltip={t('regionTooltip')}>
          <TreeSelect
            placeholder={t('regionPlaceholder')}
            allowClear
            showSearch
            treeNodeFilterProp="title"
            treeDefaultExpandAll
            treeData={STORE_REGION_TREE}
          />
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
