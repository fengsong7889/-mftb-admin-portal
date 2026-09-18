/**
 * 耗材品牌管理（物資管理 - 耗材管理 - 基礎配置）
 *
 * 独立于资产品牌（biz_eam_brand），含 category_type 标记 ASSET/CONSUMABLE/BOTH
 */
import { useState, useEffect, useCallback } from 'react'
import { Button, Form, Input, Table, Modal, message, Space, Tag, Select } from 'antd'
import type { TableColumnsType } from 'antd'
import { SearchOutlined, ReloadOutlined, PlusOutlined } from '@ant-design/icons'
import {
  fetchConsumableBrands, createConsumableBrand, updateConsumableBrand, deleteConsumableBrand,
  type ConsumableBrand,
} from '../../../api/consumable'

const CATEGORY_TYPE_OPTIONS = [
  { label: '僅耗材', value: 'CONSUMABLE' },
  { label: '資產+耗材', value: 'BOTH' },
  { label: '僅資產', value: 'ASSET' },
]
const CATEGORY_TYPE_COLOR: Record<string, string> = { CONSUMABLE: 'blue', BOTH: 'purple', ASSET: 'default' }
const CATEGORY_TYPE_LABEL: Record<string, string> = { CONSUMABLE: '僅耗材', BOTH: '資產+耗材', ASSET: '僅資產' }

type View = { mode: 'list' } | { mode: 'form'; id?: number }

export default function ConsumableBrand() {
  const [view, setView] = useState<View>({ mode: 'list' })
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<ConsumableBrand[]>([])
  const [keyword, setKeyword] = useState<string>()
  const [filterType, setFilterType] = useState<string>()
  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)
  const [editId, setEditId] = useState<number>()

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await fetchConsumableBrands(filterType, keyword))
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '查詢失敗')
    } finally {
      setLoading(false)
    }
  }, [keyword, filterType])

  useEffect(() => { loadData() }, [loadData])

  const handleDelete = (record: ConsumableBrand) => {
    Modal.confirm({
      title: '確認刪除',
      content: `${record.name}`,
      okText: '確認',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await deleteConsumableBrand(record.id)
          message.success('刪除成功')
          loadData()
        } catch (e: unknown) {
          message.error(e instanceof Error ? e.message : '刪除失敗')
        }
      },
    })
  }

  const handleEdit = (record: ConsumableBrand) => {
    setEditId(record.id)
    form.setFieldsValue({
      name: record.name, nameEn: record.nameEn, categoryType: record.categoryType,
      status: record.status, remark: record.remark,
    })
    setView({ mode: 'form' })
  }

  const handleAdd = () => {
    setEditId(undefined)
    form.resetFields()
    form.setFieldsValue({ status: 'enabled', categoryType: 'CONSUMABLE' })
    setView({ mode: 'form' })
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      setSubmitting(true)
      if (editId) {
        await updateConsumableBrand(editId, values)
        message.success('修改成功')
      } else {
        await createConsumableBrand(values)
        message.success('新增成功')
      }
      setView({ mode: 'list' })
      loadData()
    } catch (e: unknown) {
      if (e instanceof Error && e.message) message.error(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  const columns: TableColumnsType<ConsumableBrand> = [
    { title: '品牌名稱', dataIndex: 'name', key: 'name', width: 140 },
    { title: '英文名', dataIndex: 'nameEn', key: 'nameEn', width: 120, render: (v: string) => v || '-' },
    { title: '適用範圍', dataIndex: 'categoryType', key: 'categoryType', width: 110,
      render: (v: string) => <Tag color={CATEGORY_TYPE_COLOR[v]}>{CATEGORY_TYPE_LABEL[v] ?? v}</Tag> },
    { title: '狀態', dataIndex: 'status', key: 'status', width: 80,
      render: (v: string) => <Tag color={v === 'enabled' ? 'green' : 'default'}>{v === 'enabled' ? '啟用' : '停用'}</Tag> },
    { title: '備註', dataIndex: 'remark', key: 'remark', width: 200, ellipsis: true, render: (v: string) => v || '-' },
    { title: '最後更新人', dataIndex: 'updatedBy', key: 'updatedBy', width: 100, ellipsis: true, render: (v: string) => v || '-' },
    { title: '最後更新時間', dataIndex: 'updatedAt', key: 'updatedAt', width: 165, render: (v: string) => v || '-' },
    { title: '操作', key: 'action', width: 120, fixed: 'right' as const,
      render: (_: unknown, record: ConsumableBrand) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => handleEdit(record)}>編輯</Button>
          <Button type="link" size="small" danger onClick={() => handleDelete(record)}>刪除</Button>
        </Space>
      ) },
  ]

  if (view.mode === 'form') {
    return (
      <div className="content-area">
        <div style={{ position: 'relative', background: '#fff', marginBottom: 16, borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
          <div style={{ height: 3, background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)', backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite' }} />
          <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
            <Button type="primary" onClick={() => setView({ mode: 'list' })}
              style={{ backgroundColor: '#E8720C', borderColor: '#E8720C', borderRadius: 8, height: 36, padding: '0 16px' }}
            >返回</Button>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>{editId ? '編輯耗材品牌' : '新增耗材品牌'}</h2>
          </div>
        </div>
        <Form form={form} layout="vertical">
          <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
              <Form.Item label="品牌名稱" name="name" rules={[{ required: true, message: '請填寫品牌名稱' }]}>
                <Input placeholder="如：得力" maxLength={100} />
              </Form.Item>
              <Form.Item label="英文名" name="nameEn">
                <Input placeholder="如：Deli" maxLength={100} />
              </Form.Item>
              <Form.Item label="適用範圍" name="categoryType" rules={[{ required: true }]}>
                <Select options={CATEGORY_TYPE_OPTIONS} />
              </Form.Item>
              <Form.Item label="狀態" name="status">
                <Select options={[{ label: '啟用', value: 'enabled' }, { label: '停用', value: 'disabled' }]} />
              </Form.Item>
              <Form.Item label="備註" name="remark" style={{ gridColumn: '1 / -1' }}>
                <Input.TextArea placeholder="選填" maxLength={500} showCount rows={2} />
              </Form.Item>
            </div>
          </div>
        </Form>
        <div className="form-footer">
          <Space>
            <Button onClick={() => setView({ mode: 'list' })}>取消</Button>
            <Button type="primary" loading={submitting} onClick={handleSubmit}>保存</Button>
          </Space>
        </div>
      </div>
    )
  }

  return (
    <div className="content-area">
      <div className="search-section">
        <Form layout="inline">
          <Form.Item label="適用範圍">
            <Select placeholder="全部" allowClear style={{ width: 130 }} value={filterType} onChange={setFilterType}
              options={CATEGORY_TYPE_OPTIONS} />
          </Form.Item>
          <Form.Item label="關鍵字">
            <Input placeholder="品牌名稱/英文" allowClear value={keyword} onChange={e => setKeyword(e.target.value)} onPressEnter={() => loadData()} />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={() => loadData()}>查詢</Button>
              <Button icon={<ReloadOutlined />} onClick={() => { setKeyword(undefined); setFilterType(undefined); setTimeout(() => loadData(), 0) }}>重置</Button>
            </div>
          </Form.Item>
        </Form>
      </div>
      <div className="action-section">
        <div className="action-section-left" />
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新增品牌</Button>
        </div>
      </div>
      <Table<ConsumableBrand>
        columns={columns}
        dataSource={rows}
        rowKey="id"
        loading={loading}
        scroll={{ x: 1000 }}
        pagination={{ showSizeChanger: true, showQuickJumper: true, showTotal: (t) => `共 ${t} 條` }}
      />
    </div>
  )
}
