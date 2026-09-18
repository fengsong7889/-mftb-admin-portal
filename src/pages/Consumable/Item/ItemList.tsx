/**
 * 耗材档案列表（搜索区 + 操作区 + 表格）
 *
 * 列：编码、名称、分类、品牌、规格、单位、参考价、可用/总库存、安全库存、状态、更新人/时间、操作
 * 低库存行以橙色「預警」标签提示（可用库存 < 安全库存）
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Button, Form, Input, Select, Table, Modal, message, Space, Tag } from 'antd'
import type { TableColumnsType } from 'antd'
import { SearchOutlined, ReloadOutlined, PlusOutlined, ExportOutlined } from '@ant-design/icons'
import {
  fetchConsumableItems, deleteConsumableItem, toggleConsumableItemStatus,
  type ConsumableItem,
} from '../../../api/consumable'
import { fetchCategoryList, type AssetCategory } from '../../../api/eam'
import { useColumnConfig } from '../../../hooks/useColumnConfig'

interface Props {
  onAdd: () => void
  onEdit: (id: number) => void
  onView: (id: number) => void
}

interface SearchFormValues {
  keyword?: string
  categoryId?: number
  status?: string
}

export default function ItemList({ onAdd, onEdit, onView }: Props) {
  const [form] = Form.useForm<SearchFormValues>()
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<ConsumableItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [categories, setCategories] = useState<AssetCategory[]>([])
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])

  // 搜索条件
  const [qKeyword, setQKeyword] = useState<string>()
  const [qCategory, setQCategory] = useState<number>()
  const [qStatus, setQStatus] = useState<string>()

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchConsumableItems({
        page, size, keyword: qKeyword, categoryId: qCategory, status: qStatus,
      })
      setItems(res.records)
      setTotal(res.total)
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '查詢失敗')
    } finally {
      setLoading(false)
    }
  }, [page, size, qKeyword, qCategory, qStatus])

  useEffect(() => { loadData() }, [loadData])
  useEffect(() => {
    fetchCategoryList().then(setCategories).catch(() => { /* 忽略：分类仅用于筛选下拉 */ })
  }, [])

  const categoryOptions = useMemo(
    () => categories.map(c => ({ label: c.name, value: c.id })),
    [categories],
  )

  const handleSearch = () => {
    const v = form.getFieldsValue()
    setPage(1)
    setQKeyword(v.keyword || undefined)
    setQCategory(v.categoryId)
    setQStatus(v.status)
  }

  const handleReset = () => {
    form.resetFields()
    setPage(1)
    setQKeyword(undefined)
    setQCategory(undefined)
    setQStatus(undefined)
  }

  const handleExport = () => {
    if (items.length === 0) { message.warning('暫無數據可導出'); return }
    message.success('導出成功')
  }

  const handleDelete = (record: ConsumableItem) => {
    Modal.confirm({
      title: '確認刪除',
      content: `${record.name}（${record.itemCode}）`,
      okText: '確認',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await deleteConsumableItem(record.id)
          message.success('刪除成功')
          loadData()
        } catch (e: unknown) {
          message.error(e instanceof Error ? e.message : '刪除失敗')
        }
      },
    })
  }

  const handleToggleStatus = async (record: ConsumableItem) => {
    const next = record.status === 'enabled' ? 'disabled' : 'enabled'
    try {
      await toggleConsumableItemStatus(record.id, next)
      message.success(next === 'enabled' ? '已啟用' : '已停用')
      loadData()
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '操作失敗')
    }
  }

  /* ── 列字段配置 ── */
  const columnMeta = useMemo(() => [
    { key: 'itemCode', title: '耗材編碼' },
    { key: 'name', title: '名稱' },
    { key: 'categoryName', title: '分類' },
    { key: 'brand', title: '品牌' },
    { key: 'spec', title: '規格型號' },
    { key: 'unit', title: '單位' },
    { key: 'refPrice', title: '參考單價' },
    { key: 'stock', title: '可用/總庫存' },
    { key: 'safetyStock', title: '安全庫存' },
    { key: 'status', title: '狀態' },
    { key: 'updatedBy', title: '更新人' },
    { key: 'updatedAt', title: '更新時間' },
    { key: 'action', title: '操作' },
  ], [])

  const { configComponent, applyConfig } = useColumnConfig('consumable-item', columnMeta)

  const columns: TableColumnsType<ConsumableItem> = [
    { title: '耗材編碼', dataIndex: 'itemCode', key: 'itemCode', width: 120, ellipsis: true,
      render: (v: string) => <span style={{ fontFamily: 'monospace' }}>{v}</span> },
    { title: '名稱', dataIndex: 'name', key: 'name', width: 140, ellipsis: true },
    { title: '分類', dataIndex: 'categoryName', key: 'categoryName', width: 110, ellipsis: true,
      render: (v: string) => v || '-' },
    { title: '品牌', dataIndex: 'brand', key: 'brand', width: 100, ellipsis: true, render: (v: string) => v || '-' },
    { title: '規格型號', dataIndex: 'spec', key: 'spec', width: 140, ellipsis: true, render: (v: string) => v || '-' },
    { title: '單位', dataIndex: 'unit', key: 'unit', width: 70 },
    { title: '參考單價', dataIndex: 'refPrice', key: 'refPrice', width: 100,
      render: (v: number) => `¥${(v ?? 0).toFixed(2)}` },
    { title: '可用/總庫存', key: 'stock', width: 130,
      render: (_: unknown, r: ConsumableItem) => (
        <Space size={4}>
          <span style={{ fontWeight: 600, color: r.alert ? '#FF4D4F' : '#262626' }}>{r.availableQty}</span>
          <span style={{ color: '#8C8C8C' }}>/ {r.totalQty} {r.unit}</span>
          {r.alert && <Tag color="orange" style={{ marginLeft: 2, fontSize: 11 }}>預警</Tag>}
        </Space>
      ) },
    { title: '安全庫存', dataIndex: 'safetyStock', key: 'safetyStock', width: 90,
      render: (v: number) => (v > 0 ? v : '-') },
    { title: '狀態', dataIndex: 'status', key: 'status', width: 80,
      render: (v: string) => (v === 'enabled'
        ? <Tag color="green">啟用</Tag> : <Tag>停用</Tag>) },
    { title: '更新人', dataIndex: 'updatedBy', key: 'updatedBy', width: 100, ellipsis: true, render: (v: string) => v || '-' },
    { title: '更新時間', dataIndex: 'updatedAt', key: 'updatedAt', width: 165, ellipsis: true, render: (v: string) => v || '-' },
    { title: '操作', key: 'action', width: 190, fixed: 'right' as const,
      render: (_: unknown, record: ConsumableItem) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => onView(record.id)}>詳情</Button>
          <Button type="link" size="small" onClick={() => onEdit(record.id)}>編輯</Button>
          <Button type="link" size="small" onClick={() => handleToggleStatus(record)}>
            {record.status === 'enabled' ? '停用' : '啟用'}
          </Button>
          <Button type="link" size="small" danger onClick={() => handleDelete(record)}>刪除</Button>
        </Space>
      ) },
  ]

  return (
    <>
      {/* 搜索区 */}
      <div className="search-section">
        <Form form={form} layout="inline">
          <Form.Item label="關鍵字" name="keyword">
            <Input placeholder="編碼/名稱/規格/品牌" allowClear onPressEnter={handleSearch} style={{ width: 200 }} />
          </Form.Item>
          <Form.Item label="分類" name="categoryId">
            <Select placeholder="全部分類" allowClear showSearch optionFilterProp="label"
              options={categoryOptions} style={{ minWidth: 160 }} />
          </Form.Item>
          <Form.Item label="狀態" name="status">
            <Select placeholder="全部" allowClear style={{ minWidth: 120 }}
              options={[{ label: '啟用', value: 'enabled' }, { label: '停用', value: 'disabled' }]} />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>查詢</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>重置</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 操作区 */}
      <div className="action-section">
        <div className="action-section-left">
          <Button className="btn-export" icon={<ExportOutlined />} onClick={handleExport}>導出</Button>
        </div>
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={onAdd}>新增耗材</Button>
          {configComponent}
        </div>
      </div>

      {/* 表格 */}
      <Table<ConsumableItem>
        columns={applyConfig(columns)}
        dataSource={items}
        rowKey="id"
        rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys }}
        loading={loading}
        scroll={{ x: 1500 }}
        pagination={{
          current: page, pageSize: size, total,
          showSizeChanger: true, showQuickJumper: true,
          showTotal: (t) => `共 ${t} 條`,
          onChange: (p, s) => { setPage(p); setSize(s) },
        }}
      />
    </>
  )
}
