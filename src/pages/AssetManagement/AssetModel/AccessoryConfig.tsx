/**
 * 分類配件配置（獨立頁面，資產品牌產品庫「配件配置」入口進入）
 *
 * - 按分類統一配置常用配件，同分類下所有產品共用（驗收時一鍵帶入）
 * - 列表展示：配件名稱 / 默認數量 / 狀態 / 最後更新人 / 最後更新時間
 * - 支持新增、修改、刪除、啟用停用（停用配件不出現在驗收彈窗選項中）
 */
import { useCallback, useEffect, useState } from 'react'
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
      message.error(e instanceof Error ? e.message : '加載配件列表失敗')
    } finally {
      setLoading(false)
    }
  }, [categoryCode])

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
        message.success('配件已更新')
      } else {
        await createCategoryAccessory(categoryCode, { name: values.name.trim(), defaultQty: values.defaultQty })
        message.success('配件已新增')
      }
      setAccModalOpen(false)
      loadList()
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '保存失敗')
    } finally {
      setSaving(false)
    }
  }

  /** 刪除（二次確認） */
  const handleDelete = (record: CategoryAccessory) => {
    Modal.confirm({
      title: '確認刪除配件',
      content: `刪除後該配件將從本分類的驗收選項中移除：${record.name}`,
      okText: '確認刪除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await deleteCategoryAccessory(record.id!)
          message.success('配件已刪除')
          loadList()
        } catch (e: unknown) {
          message.error(e instanceof Error ? e.message : '刪除失敗')
        }
      },
    })
  }

  /** 啟用/停用 */
  const handleToggleStatus = async (record: CategoryAccessory) => {
    const next = record.status === 0 ? 1 : 0
    try {
      await updateCategoryAccessoryStatus(record.id!, next)
      message.success(next === 1 ? '已啟用' : '已停用')
      loadList()
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '操作失敗')
    }
  }

  const columns: TableColumnsType<CategoryAccessory> = [
    {
      title: '配件名稱', dataIndex: 'name', key: 'name', width: 240,
      onCell: () => ({ style: { whiteSpace: 'nowrap' } }),
    },
    {
      // 不同分類配件的計量單位不一致（件/條/瓶等），默認數量僅展示純數字
      title: '默認數量', dataIndex: 'defaultQty', key: 'defaultQty', width: 120,
      onCell: () => ({ style: { whiteSpace: 'nowrap' } }),
    },
    {
      title: '狀態', dataIndex: 'status', key: 'status', width: 100,
      onCell: () => ({ style: { whiteSpace: 'nowrap' } }),
      render: (v?: number) => (v === 0 ? <Tag>停用</Tag> : <Tag color="success">啟用</Tag>),
    },
    {
      title: '最後更新人', dataIndex: 'updatedBy', key: 'updatedBy', width: 140,
      onCell: () => ({ style: { whiteSpace: 'nowrap' } }),
      render: (v?: string) => v || '-',
    },
    {
      title: '最後更新時間', dataIndex: 'updatedAt', key: 'updatedAt', width: 180,
      onCell: () => ({ style: { whiteSpace: 'nowrap' } }),
      render: (v?: string) => v || '-',
    },
    {
      title: '操作', key: 'action', width: 180, fixed: 'right',
      onCell: () => ({ style: { whiteSpace: 'nowrap' } }),
      render: (_: unknown, record: CategoryAccessory) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => openModal(record)}>修改</Button>
          <Button type="link" size="small" onClick={() => handleToggleStatus(record)}>
            {record.status === 0 ? '啟用' : '停用'}
          </Button>
          <Button type="link" size="small" danger onClick={() => handleDelete(record)}>刪除</Button>
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
              返回
            </Button>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>
              配件配置 - {categoryName}
            </h2>
          </div>
        </div>
      </div>

      {/* 說明文字 */}
      <div style={{
        padding: '8px 12px', background: '#FFF7E6', border: '1px solid #FFD591',
        borderRadius: 6, marginBottom: 12, fontSize: 13, color: '#D46B08', lineHeight: 1.7,
      }}>
        按分類統一配置常用配件：該分類下所有產品（如 iPhone 15 / 16 / 17 / Pro / Max）驗收時共用同一套配件清單並可一鍵帶入；停用狀態的配件不會出現在驗收彈窗的「帶入分類配件」選項中。
      </div>

      {/* 操作區 */}
      <div className="action-section">
        <div className="action-section-left">
          <Tag color="orange" style={{ margin: 0 }}>
            <AppstoreOutlined style={{ marginRight: 4 }} />
            分類：{categoryName}
          </Tag>
        </div>
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>
            新增配件
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
          showTotal: (tt) => `共 ${tt} 條`,
          onChange: (p, s) => { setPage(p); setSize(s) },
        }}
      />

      {/* 新增/編輯彈窗 */}
      <Modal
        title={editing ? '修改配件' : '新增配件'}
        open={accModalOpen}
        onCancel={() => setAccModalOpen(false)}
        onOk={handleSave}
        okText="保存"
        cancelText="取消"
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
            label="配件名稱"
            name="name"
            rules={[
              { required: true, whitespace: true, message: '請輸入配件名稱' },
              { max: 64, message: '名稱不能超過 64 字' },
            ]}
          >
            <Input placeholder="請輸入配件名稱（如：數據線、說明書）" allowClear maxLength={64} onPressEnter={handleSave} />
          </Form.Item>
          <Form.Item
            label="默認數量"
            name="defaultQty"
            rules={[{ required: true, message: '請輸入默認數量' }]}
          >
            <InputNumber min={1} precision={0} style={{ width: 160 }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
