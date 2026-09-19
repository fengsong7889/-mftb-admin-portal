/**
 * 分類配件配置（獨立頁面，品牌產品庫「配件配置」入口進入）
 *
 * - 按分類統一配置常用配件，同分類下所有產品共用（驗收時一鍵帶入）
 * - 列表展示：配件名稱 / 默認數量 / 狀態 / 最後更新人 / 最後更新時間
 * - 支持新增、修改、刪除、啟用停用（停用配件不出現在驗收彈窗選項中）
 */
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Form, Input, InputNumber, Modal, Table, Tag, message, Space } from 'antd'
import type { TableColumnsType } from 'antd'
import { ArrowLeftOutlined, PlusOutlined, AppstoreOutlined } from '@ant-design/icons'
import {
  fetchCategoryAccessories, createCategoryAccessory, updateCategoryAccessory,
  updateCategoryAccessoryStatus, deleteCategoryAccessory,
  type CategoryAccessory,
} from '../../../api/eam'

interface Props {
  categoryCode: string
  categoryName: string
  onBack: () => void
}

/** 新增/編輯彈窗表單值 */
interface AccFormValues {
  name: string
  defaultQty: number
}

export default function AccessoryConfig({ categoryCode, categoryName, onBack }: Props) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [list, setList] = useState<CategoryAccessory[]>([])

  // 分頁（接口一次返回全量，本地分頁）
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)

  // 新增/編輯彈窗（editing=null 時為新增）
  const [form] = Form.useForm<AccFormValues>()
  const [accModalOpen, setAccModalOpen] = useState(false)
  const [editing, setEditing] = useState<CategoryAccessory | null>(null)
  const [saving, setSaving] = useState(false)

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchCategoryAccessories(categoryCode)
      setList(data)
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : t('asset.loadAccFailed'))
    } finally {
      setLoading(false)
    }
  }, [categoryCode, t])

  useEffect(() => {
    loadList()
  }, [loadList])

  /** 打開新增/編輯彈窗 */
  const openModal = (record?: CategoryAccessory) => {
    setEditing(record || null)
    setAccModalOpen(true)
  }

  /** 保存（新增或修改） */
  const handleSave = async () => {
    let values: AccFormValues
    try {
      values = await form.validateFields()
    } catch {
      return // 表單校驗不通過，停留彈窗
    }
    setSaving(true)
    try {
      if (editing?.id != null) {
        await updateCategoryAccessory(editing.id, { name: values.name.trim(), defaultQty: values.defaultQty })
        message.success(t('asset.accessoryUpdated'))
      } else {
        await createCategoryAccessory(categoryCode, { name: values.name.trim(), defaultQty: values.defaultQty })
        message.success(t('asset.accessoryAdded'))
      }
      setAccModalOpen(false)
      loadList()
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : t('asset.saveOpFailed'))
    } finally {
      setSaving(false)
    }
  }

  /** 刪除（二次確認） */
  const handleDelete = (record: CategoryAccessory) => {
    Modal.confirm({
      title: t('asset.confirmDeleteAcc'),
      content: t('asset.deleteAccContent', { name: record.name }),
      okText: t('common.confirmDelete'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await deleteCategoryAccessory(record.id!)
          message.success(t('asset.accessoryDeleted'))
          loadList()
        } catch (e: unknown) {
          message.error(e instanceof Error ? e.message : t('asset.deleteFailed'))
        }
      },
    })
  }

  /** 啟用/停用（二次确认） */
  const handleToggleStatus = (record: CategoryAccessory) => {
    const next = record.status === 0 ? 1 : 0
    const actionText = next === 1 ? t('asset.enabledStatus') : t('asset.disabledStatus')
    Modal.confirm({
      title: `${actionText}「${record.name}」？`,
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await updateCategoryAccessoryStatus(record.id!, next)
          message.success(next === 1 ? t('asset.enabledStatus') : t('asset.disabledStatus'))
          loadList()
        } catch (e: unknown) {
          message.error(e instanceof Error ? e.message : t('asset.opFailed'))
        }
      },
    })
  }

  const columns: TableColumnsType<CategoryAccessory> = [
    {
      title: t('asset.accNameCol'), dataIndex: 'name', key: 'name', width: 240,
      onCell: () => ({ style: { whiteSpace: 'nowrap' } }),
    },
    {
      // 不同分類配件的計量單位不一致（件/條/瓶等），默認數量僅展示純數字
      title: t('asset.defaultQtyCol'), dataIndex: 'defaultQty', key: 'defaultQty', width: 120,
      onCell: () => ({ style: { whiteSpace: 'nowrap' } }),
    },
    {
      title: t('asset.colStatus'), dataIndex: 'status', key: 'status', width: 100,
      onCell: () => ({ style: { whiteSpace: 'nowrap' } }),
      render: (v?: number) => (v === 0 ? <Tag>{t('asset.disabledStatus')}</Tag> : <Tag color="success">{t('asset.enabledStatus')}</Tag>),
    },
    {
      title: t('asset.colUpdatedBy'), dataIndex: 'updatedBy', key: 'updatedBy', width: 140,
      onCell: () => ({ style: { whiteSpace: 'nowrap' } }),
      render: (v?: string) => v || '-',
    },
    {
      title: t('asset.colUpdatedAt'), dataIndex: 'updatedAt', key: 'updatedAt', width: 180,
      onCell: () => ({ style: { whiteSpace: 'nowrap' } }),
      render: (v?: string) => v || '-',
    },
    {
      title: t('asset.colAction'), key: 'action', width: 180, fixed: 'right',
      onCell: () => ({ style: { whiteSpace: 'nowrap' } }),
      render: (_: unknown, record: CategoryAccessory) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => openModal(record)}>{t('asset.btnEditLabel')}</Button>
          <Button type="link" size="small" onClick={() => handleToggleStatus(record)}>
            {record.status === 0 ? t('asset.enabledStatus') : t('asset.disabledStatus')}
          </Button>
          <Button type="link" size="small" danger onClick={() => handleDelete(record)}>{t('common.delete')}</Button>
        </Space>
      ),
    },
  ]

  return (
    <div className="content-area">
      {/* 頂部標題欄（橙色漸變頂條 + 返回按鈕） */}
      <div style={{
        position: 'relative', background: '#fff', marginBottom: 16,
        borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden',
      }}>
        <div style={{
          height: 3,
          background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
          backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite',
        }} />
        <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Button type="primary" icon={<ArrowLeftOutlined />} onClick={onBack}
              style={{
                backgroundColor: '#E8720C', borderColor: '#E8720C', borderRadius: 8,
                height: 36, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              }}>
              {t('common.back')}
            </Button>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>
              {t('asset.accConfigTitle', { name: categoryName })}
            </h2>
          </div>
        </div>
      </div>

      {/* 說明文字 */}
      <div style={{
        padding: '8px 12px', background: '#FFF7E6', border: '1px solid #FFD591',
        borderRadius: 6, marginBottom: 12, fontSize: 13, color: '#D46B08', lineHeight: 1.7,
      }}>
        {t('asset.accConfigHint')}
      </div>

      {/* 操作區 */}
      <div className="action-section">
        <div className="action-section-left">
          <Tag color="orange" style={{ margin: 0 }}>
            <AppstoreOutlined style={{ marginRight: 4 }} />
            {t('asset.categoryTag', { name: categoryName })}
          </Tag>
        </div>
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>
            {t('asset.addAccessoryBtn')}
          </Button>
        </div>
      </div>

      {/* 配件列表 */}
      <Table<CategoryAccessory>
        columns={columns}
        dataSource={list}
        rowKey="id"
        loading={loading}
        size="middle"
        scroll={{ x: 960 }}
        pagination={{
          current: page, pageSize: size, total: list.length,
          showSizeChanger: true, showQuickJumper: true,
          showTotal: (tt) => t('asset.totalItems', { total: tt }),
          onChange: (p, s) => { setPage(p); setSize(s) },
        }}
      />

      {/* 新增/編輯彈窗 */}
      <Modal
        title={editing ? t('asset.editAccTitle') : t('asset.addAccTitle')}
        open={accModalOpen}
        onCancel={() => setAccModalOpen(false)}
        onOk={handleSave}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        confirmLoading={saving}
        width={480}
        destroyOnClose
      >
        <Form
          key={editing?.id ?? 'new'}
          form={form}
          layout="vertical"
          initialValues={{ name: editing?.name, defaultQty: editing?.defaultQty ?? 1 }}
          style={{ marginTop: 8 }}
        >
          <Form.Item
            label={t('asset.accNameCol')}
            name="name"
            rules={[
              { required: true, whitespace: true, message: t('asset.accNameRequired') },
              { max: 64, message: t('asset.accNameMaxLen') },
            ]}
          >
            <Input placeholder={t('asset.accNamePh')} allowClear maxLength={64} onPressEnter={handleSave} />
          </Form.Item>
          <Form.Item
            label={t('asset.defaultQtyCol')}
            name="defaultQty"
            rules={[{ required: true, message: t('asset.defaultQtyRequired') }]}
          >
            <InputNumber min={1} precision={0} style={{ width: 160 }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
