/**
 * 耗材出入庫流水明細頁（獨立頁面）
 *
 * 從耗材庫存列表「流水」按鈕跳轉而來，按耗材 × 倉庫維度展示完整出入庫流水記錄。
 * 支持按類型、操作人篩選，保留分頁功能。
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Button, Table, Input, Select, Tag, message, Form } from 'antd'
import type { TableColumnsType } from 'antd'
import { ArrowLeftOutlined, SearchOutlined, ReloadOutlined } from '@ant-design/icons'
import { useSearchParams, useNavigate } from 'react-router-dom'
import {
  fetchConsumableTxns,
  type ConsumableTxn,
} from '../../../api/consumable'
import { TXN_TYPE_LABEL, TXN_TYPE_COLOR } from '../Claim/constants'
import { useColumnConfig } from '../../../hooks/useColumnConfig'

/** 流水類型選項 */
const TXN_TYPE_OPTIONS = [
  { label: '採購入庫', value: 'in_purchase' },
  { label: '手工入庫', value: 'in_manual' },
  { label: '調整入庫', value: 'in_adjust' },
  { label: '領用出庫', value: 'out_claim' },
  { label: '調整出庫', value: 'out_adjust' },
]

export default function StockTxnDetail() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const itemId = Number(searchParams.get('itemId'))
  const locationId = Number(searchParams.get('locationId'))
  const itemName = searchParams.get('itemName') || ''

  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [allTxns, setAllTxns] = useState<ConsumableTxn[]>([])
  const [filteredTxns, setFilteredTxns] = useState<ConsumableTxn[]>([])

  const loadTxns = useCallback(async () => {
    if (!itemId) return
    setLoading(true)
    try {
      const data = await fetchConsumableTxns({ itemId, locationId, limit: 200 })
      setAllTxns(data)
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '加載流水失敗')
    } finally {
      setLoading(false)
    }
  }, [itemId, locationId])

  useEffect(() => { loadTxns() }, [loadTxns])

  /** 前端篩選 */
  const applyFilter = useCallback(() => {
    const values = form.getFieldsValue()
    let result = [...allTxns]
    if (values.txnType) {
      result = result.filter(t => t.txnType === values.txnType)
    }
    if (values.operator?.trim()) {
      const kw = values.operator.trim().toLowerCase()
      result = result.filter(t => (t.operator ?? '').toLowerCase().includes(kw))
    }
    setFilteredTxns(result)
  }, [allTxns, form])

  useEffect(() => { applyFilter() }, [applyFilter])

  const handleSearch = () => applyFilter()
  const handleReset = () => {
    form.resetFields()
    setFilteredTxns(allTxns)
  }

  const columns: TableColumnsType<ConsumableTxn> = useMemo(() => [
    { title: '流水號', dataIndex: 'txnNo', key: 'txnNo', width: 160, render: (v: string) => <span style={{ fontFamily: 'monospace' }}>{v}</span> },
    { title: '時間', dataIndex: 'createdAt', key: 'createdAt', width: 165, render: (v: string) => v || '-' },
    { title: '類型', dataIndex: 'txnType', key: 'txnType', width: 100, render: (v: string) => <Tag color={TXN_TYPE_COLOR[v]}>{TXN_TYPE_LABEL[v] ?? v}</Tag> },
    { title: '耗材編碼', dataIndex: 'itemCode', key: 'itemCode', width: 120, render: (v: string) => <span style={{ fontFamily: 'monospace' }}>{v}</span> },
    { title: '耗材名稱', dataIndex: 'itemName', key: 'itemName', width: 150, ellipsis: true },
    { title: '倉庫', dataIndex: 'locationName', key: 'locationName', width: 120, render: (v: string) => v || '-' },
    { title: '變動', dataIndex: 'qty', key: 'qty', width: 80, align: 'right', render: (v: number) => <span style={{ color: v >= 0 ? '#52C41A' : '#FF4D4F', fontWeight: 600 }}>{v > 0 ? `+${v}` : v}</span> },
    { title: '變動前', dataIndex: 'beforeQty', key: 'beforeQty', width: 80, align: 'right' },
    { title: '變動後', dataIndex: 'afterQty', key: 'afterQty', width: 80, align: 'right' },
    { title: '操作人', dataIndex: 'operator', key: 'operator', width: 100, render: (v: string) => v || '-' },
    { title: '備註', dataIndex: 'remark', key: 'remark', ellipsis: true, render: (v: string) => v || '-' },
  ], [])

  const columnMeta = useMemo(() => [
    { key: 'txnNo', title: '流水號' },
    { key: 'createdAt', title: '時間' },
    { key: 'txnType', title: '類型' },
    { key: 'itemCode', title: '耗材編碼' },
    { key: 'itemName', title: '耗材名稱' },
    { key: 'locationName', title: '倉庫' },
    { key: 'qty', title: '變動' },
    { key: 'beforeQty', title: '變動前' },
    { key: 'afterQty', title: '變動後' },
    { key: 'operator', title: '操作人' },
    { key: 'remark', title: '備註' },
  ], [])

  const { configComponent, applyConfig } = useColumnConfig('consumable-stock-txn', columnMeta)

  return (
    <div className="content-area">
      {/* 页面标题栏 */}
      <div style={{
        position: 'relative', background: '#fff', marginBottom: 16,
        borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden',
      }}>
        <div style={{
          height: 3, background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
          backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite',
        }} />
        <div style={{
          padding: '16px 24px', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', animation: 'headerFadeSlideIn 0.5s ease',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Button type="primary" icon={<ArrowLeftOutlined />}
              onClick={() => navigate('/consumable-stock')}
              style={{
                backgroundColor: '#E8720C', borderColor: '#E8720C', borderRadius: 8, height: 36, padding: '0 16px',
                display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: '0 2px 6px rgba(232,114,12,0.25)', transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              }}>返回</Button>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#E8720C' }}>出入庫流水</h2>
              {itemName && <Tag style={{ fontSize: 12 }}>{itemName}</Tag>}
            </div>
          </div>
        </div>
      </div>

      {/* 搜索区域 */}
      <div className="search-section">
        <Form form={form} layout="inline" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px 12px', width: '100%' }}>
          <Form.Item name="txnType" style={{ marginBottom: 0 }}>
            <Select placeholder="流水類型" allowClear style={{ width: '100%' }}
              options={TXN_TYPE_OPTIONS} onChange={handleSearch} />
          </Form.Item>
          <Form.Item name="operator" style={{ marginBottom: 0 }}>
            <Input placeholder="操作人" allowClear style={{ width: '100%' }} onPressEnter={handleSearch} />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0, justifySelf: 'start' }}>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>查詢</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>重置</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 操作区域 */}
      <div className="action-section">
        <div className="action-section-left" />
        <div className="action-section-right">
          {configComponent}
        </div>
      </div>

      {/* 数据列表 */}
      <Table<ConsumableTxn>
        columns={applyConfig(columns)}
        dataSource={filteredTxns}
        rowKey="id"
        loading={loading}
        scroll={{ x: 1300 }}
        pagination={{
          pageSize: 20,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (t) => `共 ${t} 條`,
        }}
      />
    </div>
  )
}
