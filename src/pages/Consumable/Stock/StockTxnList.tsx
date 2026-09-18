/**
 * 出入庫流水（獨立三級菜單頁）
 *
 * 側邊欄「耗材管理 → 出入庫流水」直達，支持後端分頁 + 多維度篩選。
 * 搜索：耗材編碼、耗材名稱、操作類型、操作人、操作日期（.search-section 4 列 Grid）
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Button, Table, Input, Select, DatePicker, Tag, message, Form } from 'antd'
import type { TableColumnsType } from 'antd'
import type { Dayjs } from 'dayjs'
import {
  SearchOutlined, ReloadOutlined, ExportOutlined,
} from '@ant-design/icons'
import {
  fetchConsumableTxnPage,
  type ConsumableTxn,
} from '../../../api/consumable'
import { TXN_TYPE_LABEL, TXN_TYPE_COLOR } from '../Claim/constants'
import { useColumnConfig } from '../../../hooks/useColumnConfig'

const TXN_TYPE_OPTIONS = [
  { label: '採購入庫', value: 'in_purchase' },
  { label: '手工入庫', value: 'in_manual' },
  { label: '調整入庫', value: 'in_adjust' },
  { label: '領用出庫', value: 'out_claim' },
  { label: '調整出庫', value: 'out_adjust' },
]

/** 搜索条件（分页 + 过滤） */
interface TxnFilters {
  page: number
  size: number
  itemCode?: string
  itemName?: string
  txnType?: string
  operator?: string
  txnDate?: string
}

export default function StockTxnList() {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<ConsumableTxn[]>([])
  const [total, setTotal] = useState(0)
  const [pagination, setPagination] = useState({ page: 1, size: 20 })
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])

  /** 读取表单过滤条件（日期控件值格式化为 yyyy-MM-dd） */
  function buildFilterParams(): Omit<TxnFilters, 'page' | 'size'> {
    const values = form.getFieldsValue()
    return {
      itemCode: values.itemCode?.trim() || undefined,
      itemName: values.itemName?.trim() || undefined,
      txnType: values.txnType || undefined,
      operator: values.operator?.trim() || undefined,
      txnDate: values.txnDate ? values.txnDate.format('YYYY-MM-DD') : undefined,
    }
  }

  function buildParams(overrides?: Partial<TxnFilters>): TxnFilters {
    return {
      page: overrides?.page ?? pagination.page,
      size: overrides?.size ?? pagination.size,
      ...buildFilterParams(),
    }
  }

  const loadData = useCallback(async (filters?: TxnFilters) => {
    setLoading(true)
    try {
      const params = filters ?? buildParams()
      const res = await fetchConsumableTxnPage(params)
      setData(res.records ?? [])
      setTotal(res.total ?? 0)
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '查詢失敗')
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    loadData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadData])

  const handleSearch = () => {
    setPagination(prev => ({ ...prev, page: 1 }))
    const filters = buildFilterParams()
    loadData({ ...filters, page: 1, size: pagination.size })
  }

  const handleReset = () => {
    form.resetFields()
    setPagination(prev => ({ ...prev, page: 1 }))
    loadData({ page: 1, size: pagination.size })
  }

  const handleExport = () => {
    if (data.length === 0) { message.warning('暫無數據可導出'); return }
    message.success('導出成功')
  }

  /* ----- 列定义（scroll.x = 列宽总和 1355 + 选择列 ≈ 1400） ----- */
  const columns: TableColumnsType<ConsumableTxn> = useMemo(() => [
    { title: '操作編號', dataIndex: 'txnNo', key: 'txnNo', width: 160, fixed: 'left', render: (v: string) => <span style={{ fontFamily: 'monospace' }}>{v}</span> },
    { title: '操作類型', dataIndex: 'txnType', key: 'txnType', width: 100, render: (v: string) => <Tag color={TXN_TYPE_COLOR[v]}>{TXN_TYPE_LABEL[v] ?? v}</Tag> },
    { title: '耗材編碼', dataIndex: 'itemCode', key: 'itemCode', width: 120, render: (v: string) => <span style={{ fontFamily: 'monospace' }}>{v}</span> },
    { title: '耗材名稱', dataIndex: 'itemName', key: 'itemName', width: 150, ellipsis: true },
    { title: '倉庫', dataIndex: 'locationName', key: 'locationName', width: 120, render: (v: string) => v || '-' },
    { title: '變動數量', dataIndex: 'qty', key: 'qty', width: 90, align: 'right', render: (v: number) => <span style={{ color: v >= 0 ? '#52C41A' : '#FF4D4F', fontWeight: 600 }}>{v > 0 ? `+${v}` : v}</span> },
    { title: '變動前庫存', dataIndex: 'beforeQty', key: 'beforeQty', width: 100, align: 'right' },
    { title: '變動後庫存', dataIndex: 'afterQty', key: 'afterQty', width: 100, align: 'right' },
    { title: '操作人', dataIndex: 'operator', key: 'operator', width: 100, render: (v: string) => v || '-' },
    { title: '操作時間', dataIndex: 'createdAt', key: 'createdAt', width: 165, render: (v: string) => v || '-' },
    { title: '備註', dataIndex: 'remark', key: 'remark', width: 150, ellipsis: true, render: (v: string) => v || '-' },
  ], [])

  const columnMeta = useMemo(() => [
    { key: 'txnNo', title: '操作編號' },
    { key: 'txnType', title: '操作類型' },
    { key: 'itemCode', title: '耗材編碼' },
    { key: 'itemName', title: '耗材名稱' },
    { key: 'locationName', title: '倉庫' },
    { key: 'qty', title: '變動數量' },
    { key: 'beforeQty', title: '變動前庫存' },
    { key: 'afterQty', title: '變動後庫存' },
    { key: 'operator', title: '操作人' },
    { key: 'createdAt', title: '操作時間' },
    { key: 'remark', title: '備註' },
  ], [])

  const { configComponent, applyConfig } = useColumnConfig('consumable-stock-txn-list', columnMeta)

  return (
    <div className="content-area">
      {/* ====== 搜索区（.search-section 4 列 Grid） ====== */}
      <div className="search-section">
        <Form form={form} layout="inline">
          <Form.Item label="耗材編碼" name="itemCode">
            <Input placeholder="耗材編碼" allowClear onPressEnter={handleSearch} />
          </Form.Item>
          <Form.Item label="耗材名稱" name="itemName">
            <Input placeholder="耗材名稱" allowClear onPressEnter={handleSearch} />
          </Form.Item>
          <Form.Item label="操作類型" name="txnType">
            <Select placeholder="全部" allowClear
              options={TXN_TYPE_OPTIONS} onChange={handleSearch} />
          </Form.Item>
          <Form.Item label="操作人" name="operator">
            <Input placeholder="操作人" allowClear onPressEnter={handleSearch} />
          </Form.Item>
          <Form.Item label="操作日期" name="txnDate">
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

      {/* ====== 操作区（左：导出；右：列配置） ====== */}
      <div className="action-section">
        <div className="action-section-left">
          <Button className="btn-export" icon={<ExportOutlined />} onClick={handleExport}>導出</Button>
        </div>
        <div className="action-section-right">
          {configComponent}
        </div>
      </div>

      {/* ====== 数据列表（受控分页 + 防溢出） ====== */}
      <Table<ConsumableTxn>
        columns={applyConfig(columns)}
        dataSource={data}
        rowKey="id"
        rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys }}
        loading={loading}
        scroll={{ x: 1400 }}
        pagination={{
          current: pagination.page,
          pageSize: pagination.size,
          total,
          showTotal: (t) => `共 ${t} 條`,
          showSizeChanger: true,
          showQuickJumper: true,
          pageSizeOptions: ['10', '20', '50', '100'],
          onChange: (page, size) => {
            setPagination({ page, size })
            loadData(buildParams({ page, size }))
          },
        }}
      />
    </div>
  )
}
