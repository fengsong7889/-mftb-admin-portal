/**
 * 耗材分类管理（物資管理 - 耗材管理 - 基礎配置）
 *
 * 独立于资产分类（biz_eam_category），耗材档案从本模块获取分类数据源
 * 列表页：搜索区 + 操作区 + 表格 + Modal 新增/编辑
 */
import { useState, useEffect, useCallback } from 'react'
import { Button, Form, Input, Table, Modal, message, Space, Tag, Select } from 'antd'
import type { TableColumnsType } from 'antd'
import { SearchOutlined, ReloadOutlined, PlusOutlined } from '@ant-design/icons'
import {
  fetchConsumableCategories, createConsumableCategory, updateConsumableCategory, deleteConsumableCategory,
  type ConsumableCategory,
} from '../../../api/consumable'

type View = { mode: 'list' } | { mode: 'form'; id?: number }

export default function ConsumableCategory() {
  const [view, setView] = useState<View>({ mode: 'list' })
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<ConsumableCategory[]>([])
  const [keyword, setKeyword] = useState<string>()
  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)
  const [editId, setEditId] = useState<number>()

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await fetchConsumableCategories(keyword))
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '查詢失敗')
    } finally {
      setLoading(false)
    }
  }, [keyword])

  useEffect(() => { loadData() }, [loadData])

  const handleDelete = (record: ConsumableCategory) => {
    Modal.confirm({
      title: '確認刪除',
      content: `${record.name}（${record.code}）`,
      okText: '確認',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await deleteConsumableCategory(record.id)
          message.success('刪除成功')
          loadData()
        } catch (e: unknown) {
          message.error(e instanceof Error ? e.message : '刪除失敗')
        }
      },
    })
  }

  const handleEdit = (record: ConsumableCategory) => {
    setEditId(record.id)
    form.setFieldsValue({
      code: record.code,
      name: record.name,
      sortOrder: record.sortOrder,
      status: record.status,
      remark: record.remark,
    })
    setView({ mode: 'form' })
  }

  const handleAdd = () => {
    setEditId(undefined)
    form.resetFields()
    form.setFieldsValue({ status: 'enabled', sortOrder: 0 })
    setView({ mode: 'form' })
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      setSubmitting(true)
      if (editId) {
        await updateConsumableCategory(editId, values)
        message.success('修改成功')
      } else {
        await createConsumableCategory(values)
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

  const columns: TableColumnsType<ConsumableCategory> = [
    { title: '分類編碼', dataIndex: 'code', key: 'code', width: 120,
      render: (v: string) => <span style={{ fontFamily: 'monospace' }}>{v}</span> },
    { title: '分類名稱', dataIndex: 'name', key: 'name', width: 160 },
    { title: '排序', dataIndex: 'sortOrder', key: 'sortOrder', width: 80, align: 'right' },
    { title: '狀態', dataIndex: 'status', key: 'status', width: 80,
      render: (v: string) => <Tag color={v === 'enabled' ? 'green' : 'default'}>{v === 'enabled' ? '啟用' : '停用'}</Tag> },
    { title: '備註', dataIndex: 'remark', key: 'remark', width: 200, ellipsis: true, render: (v: string) => v || '-' },
    { title: '最後更新人', dataIndex: 'updatedBy', key: 'updatedBy', width: 100, ellipsis: true, render: (v: string) => v || '-' },
    { title: '最後更新時間', dataIndex: 'updatedAt', key: 'updatedAt', width: 165, render: (v: string) => v || '-' },
    { title: '操作', key: 'action', width: 120, fixed: 'right' as const,
      render: (_: unknown, record: ConsumableCategory) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => handleEdit(record)}>編輯</Button>
          <Button type="link" size="small" danger onClick={() => handleDelete(record)}>刪除</Button>
        </Space>
      ) },
  ]

  if (view.mode === 'form') {
    return (
      <div className="content-area">
        <div style={{
          position: 'relative', background: '#fff', marginBottom: 16, borderRadius: 12,
          boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden',
        }}>
          <div style={{ height: 3, background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)', backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite' }} />
          <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
            <Button type="primary" onClick={() => setView({ mode: 'list' })}
              style={{ backgroundColor: '#E8720C', borderColor: '#E8720C', borderRadius: 8, height: 36, padding: '0 16px' }}
            >返回</Button>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>{editId ? '編輯耗材分類' : '新增耗材分類'}</h2>
          </div>
        </div>
        <Form form={form} layout="vertical">
          <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
              <Form.Item label="分類編碼" name="code" rules={[{ required: true, message: '請填寫分類編碼' }]}>
                <Input placeholder="如：HC01" maxLength={64} />
              </Form.Item>
              <Form.Item label="分類名稱" name="name" rules={[{ required: true, message: '請填寫分類名稱' }]}>
                <Input placeholder="如：辦公文具" maxLength={100} />
              </Form.Item>
              <Form.Item label="排序" name="sortOrder">
                <Input type="number" placeholder="0" />
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
          <Form.Item label="關鍵字">
            <Input placeholder="編碼/名稱" allowClear value={keyword} onChange={e => setKeyword(e.target.value)} onPressEnter={() => loadData()} />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={() => loadData()}>查詢</Button>
              <Button icon={<ReloadOutlined />} onClick={() => { setKeyword(undefined); setTimeout(() => loadData(), 0) }}>重置</Button>
            </div>
          </Form.Item>
        </Form>
      </div>
      <div className="action-section">
        <div className="action-section-left" />
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新增分類</Button>
        </div>
      </div>
      <Table<ConsumableCategory>
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
