/**
 * 耗材库存列表（耗材 × 仓库 维度）
 *
 * 搜索：耗材编码、耗材名称、存放仓库、最后更新人、最后更新时间
 * 列：编码、名称、规格、仓库、实际库存、占用、可用、安全库存、状态、最后更新人、最后更新时间、操作
 * 行操作：入库（预填该耗材）、流水（跳转独立明细页）
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Button, Table, Input, Select, DatePicker, Tag, message, Space, Form } from 'antd'
import type { TableColumnsType } from 'antd'
import { ImportOutlined, SearchOutlined, ReloadOutlined, ExportOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import type { Dayjs } from 'dayjs'

interface Props {
  onInbound: (itemId?: number) => void
}

/** 搜索条件 */
interface StockFilters {
  itemCode?: string
  itemName?: string
  locationId?: number
  updatedBy?: string
  updateTimeStart?: string
  updateTimeEnd?: string
  /** 日期控件值（查詢時格式化為 start/end） */
  updateTime?: Dayjs | null
}

export default function StockList({ onInbound }: Props) {
  const navigate = useNavigate()
  const [form] = Form.useForm<StockFilters>()
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<ConsumableStock[]>([])
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [locationOptions, setLocationOptions] = useState<AssetLocation[]>([])

  const loadData = useCallback(async (filters?: StockFilters) => {
    setLoading(true)
    try {
      setRows(await fetchConsumableStock(filters))
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '查詢失敗')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  useEffect(() => {
    fetchLocationList().then(setLocationOptions).catch(() => setLocationOptions([]))
  }, [])

  const handleSearch = () => {
    const values = form.getFieldsValue()
    const params: StockFilters = {}
    if (values.itemCode?.trim()) params.itemCode = values.itemCode.trim()
    if (values.itemName?.trim()) params.itemName = values.itemName.trim()
    if (values.locationId != null) params.locationId = values.locationId
    if (values.updatedBy?.trim()) params.updatedBy = values.updatedBy.trim()
    if (values.updateTime) params.updateTimeStart = values.updateTime.format('YYYY-MM-DD')
    loadData(params)
  }

  const handleReset = () => {
    form.resetFields()
    loadData()
  }

  const handleExport = () => {
    if (rows.length === 0) { message.warning('暫無數據可導出'); return }
    message.success('導出成功')
  }

  const columns: TableColumnsType<ConsumableStock> = [
    { title: '耗材編碼', dataIndex: 'itemCode', key: 'itemCode', width: 120, render: (v: string) => <span style={{ fontFamily: 'monospace' }}>{v}</span> },
    { title: '名稱', dataIndex: 'itemName', key: 'itemName', width: 150, ellipsis: true },
    { title: '規格型號', dataIndex: 'spec', key: 'spec', width: 140, ellipsis: true, render: (v: string) => v || '-' },
    { title: '倉庫', dataIndex: 'locationName', key: 'locationName', width: 130, render: (v: string) => v || '-' },
    { title: '實際庫存', dataIndex: 'qty', key: 'qty', width: 100, align: 'right', render: (v: number, r) => `${v} ${r.unit ?? ''}` },
    { title: '審批佔用', dataIndex: 'lockedQty', key: 'lockedQty', width: 100, align: 'right', render: (v: number) => (v > 0 ? <span style={{ color: '#FA8C16' }}>{v}</span> : v) },
    { title: '可用庫存', dataIndex: 'availableQty', key: 'availableQty', width: 110, align: 'right',
      render: (v: number, r) => <b style={{ color: r.alert ? '#FF4D4F' : '#262626' }}>{v}</b> },
    { title: '安全庫存', dataIndex: 'safetyStock', key: 'safetyStock', width: 90, align: 'right', render: (v: number) => (v > 0 ? v : '-') },
    { title: '狀態', key: 'alert', width: 90, render: (_: unknown, r) => (r.alert ? <Tag color="orange">預警</Tag> : <Tag color="green">正常</Tag>) },
    { title: '最後更新人', dataIndex: 'updatedBy', key: 'updatedBy', width: 110, ellipsis: true, render: (v: string) => v || '-' },
    { title: '最後更新時間', dataIndex: 'updatedAt', key: 'updatedAt', width: 165, render: (v: string) => v || '-' },
    { title: '操作', key: 'action', width: 140, fixed: 'right' as const,
      render: (_: unknown, record: ConsumableStock) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => onInbound(record.itemId)}>入庫</Button>
          <Button type="link" size="small" onClick={() => navigate(`/consumable-stock/txn?itemId=${record.itemId}&locationId=${record.locationId}&itemName=${encodeURIComponent(record.itemName ?? '')}`)}>流水</Button>
        </Space>
      ) },
  ]

  const columnMeta = useMemo(() => [
    { key: 'itemCode', title: '耗材編碼' },
    { key: 'itemName', title: '名稱' },
    { key: 'spec', title: '規格型號' },
    { key: 'locationName', title: '倉庫' },
    { key: 'qty', title: '實際庫存' },
    { key: 'lockedQty', title: '審批佔用' },
    { key: 'availableQty', title: '可用庫存' },
    { key: 'safetyStock', title: '安全庫存' },
    { key: 'alert', title: '狀態' },
    { key: 'updatedBy', title: '最後更新人' },
    { key: 'updatedAt', title: '最後更新時間' },
    { key: 'action', title: '操作' },
  ], [])

  const { configComponent, applyConfig } = useColumnConfig('consumable-stock', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' },
  ])

  return (
    <>
      <div className="search-section">
        <Form form={form} layout="inline">
          <Form.Item label="耗材編碼" name="itemCode">
            <Input placeholder="耗材編碼" allowClear onPressEnter={handleSearch} />
          </Form.Item>
          <Form.Item label="耗材名稱" name="itemName">
            <Input placeholder="耗材名稱" allowClear onPressEnter={handleSearch} />
          </Form.Item>
          <Form.Item label="存放倉庫" name="locationId">
            <Select placeholder="全部" allowClear showSearch optionFilterProp="label"
              options={locationOptions.map(loc => ({ label: loc.name, value: loc.id }))} />
          </Form.Item>
          <Form.Item label="最後更新人" name="updatedBy">
            <Input placeholder="最後更新人" allowClear onPressEnter={handleSearch} />
          </Form.Item>
          <Form.Item label="最後更新時間" name="updateTime">
            <DatePicker style={{ width: '100%' }} placeholder="選擇日期" />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>查詢</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>重置</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      <div className="action-section">
        <div className="action-section-left">
          <Button className="btn-export" icon={<ExportOutlined />} onClick={handleExport}>導出</Button>
        </div>
        <div className="action-section-right">
          <Space>
            <Button type="primary" icon={<ImportOutlined />} onClick={() => onInbound()}>手工入庫</Button>
            {configComponent}
          </Space>
        </div>
      </div>

      <Table<ConsumableStock>
        columns={applyConfig(columns)}
        dataSource={rows}
        rowKey="id"
        rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys }}
        loading={loading}
        scroll={{ x: 1500 }}
        pagination={{ showSizeChanger: true, showQuickJumper: true, showTotal: (t) => `共 ${t} 條` }}
      />
    </>
  )
}
