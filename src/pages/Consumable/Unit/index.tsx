/**
 * 计量单位管理（物資管理 - 耗材管理 - 基礎配置）
 *
 * 替代前端硬编码的 UNIT_OPTIONS，支持后台动态管理
 */
import { useState, useEffect, useCallback } from 'react'
import { Button, Form, Input, Table, Modal, message, Space, Tag } from 'antd'
import type { TableColumnsType } from 'antd'
import { SearchOutlined, ReloadOutlined, PlusOutlined } from '@ant-design/icons'
import {
  fetchConsumableUnits, createConsumableUnit, updateConsumableUnit, deleteConsumableUnit,
  type ConsumableUnit,
} from '../../../api/consumable'

type View = { mode: 'list' } | { mode: 'form'; id?: number }

export default function ConsumableUnit() {
  const [view, setView] = useState<View>({ mode: 'list' })
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<ConsumableUnit[]>([])
  const [keyword, setKeyword] = useState<string>()
  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)
  const [editId, setEditId] = useState<number>()

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await fetchConsumableUnits(keyword))
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '查詢失敗')
    } finally {
      setLoading(false)
    }
  }, [keyword])

  useEffect(() => { loadData() }, [loadData])

  const handleDelete = (record: ConsumableUnit) => {
    Modal.confirm({
      title: '確認刪除',
      content: `${record.name}`,
      okText: '確認',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await deleteConsumableUnit(record.id)
          message.success('刪除成功')
          loadData()
        } catch (e: unknown) {
          message.error(e instanceof Error ? e.message : '刪除失敗')
        }
      },
    })
  }

  const handleEdit = (record: ConsumableUnit) => {
    setEditId(record.id)
    form.setFieldsValue({
      name: record.name, abbr: record.abbr, sortOrder: record.sortOrder, status: record.status,
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
        await updateConsumableUnit(editId, values)
        message.success('修改成功')
      } else {
        await createConsumableUnit(values)
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

  const columns: TableColumnsType<ConsumableUnit> = [
    { title: '單位名稱', dataIndex: 'name', key: 'name', width: 120 },
    { title: '縮寫', dataIndex: 'abbr', key: 'abbr', width: 100, render: (v: string) => v || '-' },
    { title: '排序', dataIndex: 'sortOrder', key: 'sortOrder', width: 80, align: 'right' },
    { title: '狀態', dataIndex: 'status', key: 'status', width: 80,
      render: (v: string) => <Tag color={v === 'enabled' ? 'green' : 'default'}>{v === 'enabled' ? '啟用' : '停用'}</Tag> },
    { title: '最後更新人', dataIndex: 'updatedBy', key: 'updatedBy', width: 100, ellipsis: true, render: (v: string) => v || '-' },
    { title: '最後更新時間', dataIndex: 'updatedAt', key: 'updatedAt', width: 165, render: (v: string) => v || '-' },
    { title: '操作', key: 'action', width: 120, fixed: 'right' as const,
      render: (_: unknown, record: ConsumableUnit) => (
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
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>{editId ? '編輯計量單位' : '新增計量單位'}</h2>
          </div>
        </div>
        <Form form={form} layout="vertical">
          <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
              <Form.Item label="單位名稱" name="name" rules={[{ required: true, message: '請填寫單位名稱' }]}>
                <Input placeholder="如：個、盒、包" maxLength={32} />
              </Form.Item>
              <Form.Item label="縮寫" name="abbr">
                <Input placeholder="如：pcs、box" maxLength={16} />
              </Form.Item>
              <Form.Item label="排序" name="sortOrder">
                <Input type="number" placeholder="0" />
              </Form.Item>
              <Form.Item label="狀態" name="status">
                <Tag color="green">啟用</Tag>
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
            <Input placeholder="名稱/縮寫" allowClear value={keyword} onChange={e => setKeyword(e.target.value)} onPressEnter={() => loadData()} />
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
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新增單位</Button>
        </div>
      </div>
      <Table<ConsumableUnit>
        columns={columns}
        dataSource={rows}
        rowKey="id"
        loading={loading}
        scroll={{ x: 700 }}
        pagination={{ showSizeChanger: true, showQuickJumper: true, showTotal: (t) => `共 ${t} 條` }}
      />
    </div>
  )
}
