/**
 * 耗材档案列表（搜索区 + 操作区 + 表格）
 *
 * 列：编码、耗材名称、耗材分类、耗材品牌、规格、单位、参考价、可用/总库存、安全库存、状态、最后更新人/时间、操作
 * 低库存行以橙色「預警」标签提示（可用库存 < 安全库存）
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Button, Form, Input, Select, Table, Modal, message, Space, Tag, Switch, DatePicker } from 'antd'
import type { TableColumnsType } from 'antd'
import type { Dayjs } from 'dayjs'
import { SearchOutlined, ReloadOutlined, PlusOutlined, ExportOutlined } from '@ant-design/icons'
import {
  fetchConsumableItems, deleteConsumableItem, toggleConsumableItemStatus,
  fetchConsumableCategoryOptions, fetchConsumableBrandOptions,
  type ConsumableItem, type ConsumableCategory, type ConsumableBrand,
} from '../../../api/consumable'
import { useColumnConfig } from '../../../hooks/useColumnConfig'

const { RangePicker } = DatePicker

interface Props {
  onAdd: () => void
  onEdit: (id: number) => void
  onView: (id: number) => void
}

interface SearchFormValues {
  itemCode?: string
  name?: string
  categoryId?: number
  brand?: string
  unit?: string
  status?: string
  updatedBy?: string
  updatedAtRange?: [Dayjs, Dayjs] | null
}

export default function ItemList({ onAdd, onEdit, onView }: Props) {
  const [form] = Form.useForm<SearchFormValues>()
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<ConsumableItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [categories, setCategories] = useState<ConsumableCategory[]>([])
  const [brands, setBrands] = useState<ConsumableBrand[]>([])
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])

  // 搜索条件
  const [qItemCode, setQItemCode] = useState<string>()
  const [qName, setQName] = useState<string>()
  const [qCategory, setQCategory] = useState<number>()
  const [qBrand, setQBrand] = useState<string>()
  const [qUnit, setQUnit] = useState<string>()
  const [qStatus, setQStatus] = useState<string>()
  const [qUpdatedBy, setQUpdatedBy] = useState<string>()
  const [qTimeStart, setQTimeStart] = useState<string>()
  const [qTimeEnd, setQTimeEnd] = useState<string>()

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchConsumableItems({
        page, size, itemCode: qItemCode, name: qName, categoryId: qCategory,
        brand: qBrand, unit: qUnit, status: qStatus, updatedBy: qUpdatedBy,
        updateTimeStart: qTimeStart, updateTimeEnd: qTimeEnd,
      })
      setItems(res.records)
      setTotal(res.total)
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '查詢失敗')
    } finally {
      setLoading(false)
    }
  }, [page, size, qItemCode, qName, qCategory, qBrand, qUnit, qStatus, qUpdatedBy, qTimeStart, qTimeEnd])

  useEffect(() => { loadData() }, [loadData])
  useEffect(() => {
    fetchConsumableCategoryOptions().then(setCategories).catch(() => { /* 忽略：分类仅用于筛选下拉 */ })
    fetchConsumableBrandOptions().then(setBrands).catch(() => { /* 忽略 */ })
  }, [])

  const categoryOptions = useMemo(
    () => categories.map(c => ({ label: c.name, value: c.id })),
    [categories],
  )
  const brandOptions = useMemo(
    () => brands.map(b => ({ label: b.name, value: b.name })),
    [brands],
  )

  const handleSearch = () => {
    const v = form.getFieldsValue()
    setPage(1)
    setQItemCode(v.itemCode?.trim() || undefined)
    setQName(v.name?.trim() || undefined)
    setQCategory(v.categoryId)
    setQBrand(v.brand?.trim() || undefined)
    setQUnit(v.unit?.trim() || undefined)
    setQStatus(v.status)
    setQUpdatedBy(v.updatedBy?.trim() || undefined)
    setQTimeStart(v.updatedAtRange?.[0]?.format('YYYY-MM-DD'))
    setQTimeEnd(v.updatedAtRange?.[1]?.format('YYYY-MM-DD'))
  }

  const handleReset = () => {
    form.resetFields()
    setPage(1)
    setQItemCode(undefined); setQName(undefined); setQCategory(undefined)
    setQBrand(undefined); setQUnit(undefined); setQStatus(undefined)
    setQUpdatedBy(undefined); setQTimeStart(undefined); setQTimeEnd(undefined)
  }

  const handleExport = () => {
    if (items.length === 0) { message.warning('暫無數據可導出'); return }
    message.success('導出成功')
  }

  const handleDelete = (record: ConsumableItem) => {
    Modal.confirm({
      title: '確認刪除',
      className: 'custom-confirm-modal',
      icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
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

  const handleToggleStatus = (record: ConsumableItem) => {
    const next = record.status === 'enabled' ? 'disabled' : 'enabled'
    const actionText = next === 'enabled' ? '啟用' : '停用'
    Modal.confirm({
      title: `確定要${actionText}該配置嗎？`,
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      okText: '確認',
      cancelText: '取消',
      onOk: async () => {
        try {
          await toggleConsumableItemStatus(record.id, next)
          message.success(next === 'enabled' ? '已啟用' : '已停用')
          loadData()
        } catch (e: unknown) {
          message.error(e instanceof Error ? e.message : '操作失敗')
        }
      },
    })
  }

  /* ── 列字段配置（title 同步列表显示；key 保持不变，避免影响已保存的列配置） ── */
  const columnMeta = useMemo(() => [
    { key: 'itemCode', title: '耗材編碼' },
    { key: 'name', title: '耗材名稱' },
    { key: 'categoryName', title: '耗材分類' },
    { key: 'brand', title: '耗材品牌' },
    { key: 'spec', title: '規格型號' },
    { key: 'unit', title: '單位' },
    { key: 'refPrice', title: '參考單價' },
    { key: 'stock', title: '可用/總庫存' },
    { key: 'safetyStock', title: '安全庫存' },
    { key: 'status', title: '狀態' },
    { key: 'updatedBy', title: '最後更新人' },
    { key: 'updatedAt', title: '最後更新時間' },
    { key: 'action', title: '操作' },
  ], [])

  const { configComponent, applyConfig } = useColumnConfig('consumable-item', columnMeta)

  const columns: TableColumnsType<ConsumableItem> = [
    { title: '耗材編碼', dataIndex: 'itemCode', key: 'itemCode', width: 120, ellipsis: true,
      render: (v: string) => <span style={{ fontFamily: 'monospace' }}>{v}</span> },
    { title: '耗材名稱', dataIndex: 'name', key: 'name', width: 140, ellipsis: true },
    { title: '耗材分類', dataIndex: 'categoryName', key: 'categoryName', width: 110, ellipsis: true,
      render: (v: string) => v || '-' },
    { title: '耗材品牌', dataIndex: 'brand', key: 'brand', width: 100, ellipsis: true, render: (v: string) => v || '-' },
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
    { title: '狀態', dataIndex: 'status', key: 'status', width: 100,
      render: (v: string, record: ConsumableItem) => (
        <Switch
          checked={v === 'enabled'}
          checkedChildren="啟用"
          unCheckedChildren="停用"
          onChange={() => handleToggleStatus(record)}
        />
      ) },
    { title: '最後更新人', dataIndex: 'updatedBy', key: 'updatedBy', width: 100, ellipsis: true, render: (v: string) => v || '-' },
    { title: '最後更新時間', dataIndex: 'updatedAt', key: 'updatedAt', width: 165, ellipsis: true, render: (v: string) => v || '-' },
    { title: '操作', key: 'action', width: 140, fixed: 'right' as const,
      render: (_: unknown, record: ConsumableItem) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => onView(record.id)}>詳情</Button>
          <Button type="link" size="small" onClick={() => onEdit(record.id)}>編輯</Button>
          <Button type="link" size="small" danger onClick={() => handleDelete(record)}>刪除</Button>
        </Space>
      ) },
  ]

  return (
    <>
      {/* 搜索区（8 字段精确筛选） */}
      <div className="search-section">
        <Form form={form} layout="inline">
          <Form.Item label="耗材編碼" name="itemCode">
            <Input placeholder="編碼" allowClear onPressEnter={handleSearch} />
          </Form.Item>
          <Form.Item label="耗材名稱" name="name">
            <Input placeholder="名稱" allowClear onPressEnter={handleSearch} />
          </Form.Item>
          <Form.Item label="耗材分類" name="categoryId">
            <Select placeholder="全部分類" allowClear showSearch optionFilterProp="label" options={categoryOptions} />
          </Form.Item>
          <Form.Item label="耗材品牌" name="brand">
            <Select placeholder="全部品牌" allowClear showSearch optionFilterProp="label" options={brandOptions} />
          </Form.Item>
          <Form.Item label="單位" name="unit">
            {/* 单位已不再是字典表，改为文本模糊匹配 */}
            <Input placeholder="全部單位" allowClear />
          </Form.Item>
          <Form.Item label="狀態" name="status">
            <Select placeholder="全部" allowClear
              options={[{ label: '啟用', value: 'enabled' }, { label: '停用', value: 'disabled' }]} />
          </Form.Item>
          <Form.Item label="最後更新人" name="updatedBy">
            <Input placeholder="更新人" allowClear onPressEnter={handleSearch} />
          </Form.Item>
          <Form.Item label="最後更新時間" name="updatedAtRange">
            <RangePicker format="YYYY-MM-DD" style={{ width: '100%' }} />
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
        className="nowrap-table"
        columns={applyConfig(columns)}
        dataSource={items}
        rowKey="id"
        rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys }}
        loading={loading}
        scroll={{ x: 1505 }}
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
