/**
 * 耗材库存列表（耗材 × 仓库 维度）
 *
 * 列：编码、名称、规格、仓库、实际库存、占用、可用、安全库存、状态、操作
 * 行操作：入库（预填该耗材）、流水（只读抽屉）
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Button, Table, Input, Drawer, Tag, message, Space, Form } from 'antd'
import type { TableColumnsType } from 'antd'
import { ImportOutlined, SearchOutlined, ReloadOutlined, ExportOutlined } from '@ant-design/icons'
import {
  fetchConsumableStock, fetchConsumableTxns,
  type ConsumableStock, type ConsumableTxn,
} from '../../../api/consumable'
import { TXN_TYPE_LABEL, TXN_TYPE_COLOR } from '../Claim/constants'

interface Props {
  onInbound: (itemId?: number) => void
}

export default function StockList({ onInbound }: Props) {
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<ConsumableStock[]>([])
  const [keyword, setKeyword] = useState('')
  const [drawer, setDrawer] = useState<{ open: boolean; item?: ConsumableStock; txns: ConsumableTxn[]; loading: boolean }>({
    open: false, txns: [], loading: false,
  })
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await fetchConsumableStock())
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '查詢失敗')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const tableData = useMemo(() => {
    if (!keyword.trim()) return rows
    const kw = keyword.trim().toLowerCase()
    return rows.filter(r =>
      (r.itemName ?? '').toLowerCase().includes(kw) ||
      (r.itemCode ?? '').toLowerCase().includes(kw) ||
      (r.locationName ?? '').toLowerCase().includes(kw))
  }, [rows, keyword])

  const handleExport = () => {
    if (tableData.length === 0) { message.warning('暫無數據可導出'); return }
    message.success('導出成功')
  }

  const openTxns = async (record: ConsumableStock) => {
    setDrawer({ open: true, item: record, txns: [], loading: true })
    try {
      const txns = await fetchConsumableTxns({ itemId: record.itemId, locationId: record.locationId, limit: 100 })
      setDrawer(d => ({ ...d, txns, loading: false }))
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '加載流水失敗')
      setDrawer(d => ({ ...d, loading: false }))
    }
  }

  const columns: TableColumnsType<ConsumableStock> = [
    { title: '耗材編碼', dataIndex: 'itemCode', key: 'itemCode', width: 120, render: (v: string) => <span style={{ fontFamily: 'monospace' }}>{v}</span> },
    { title: '名稱', dataIndex: 'itemName', key: 'itemName', width: 150, ellipsis: true },
    { title: '規格型號', dataIndex: 'spec', key: 'spec', width: 140, ellipsis: true, render: (v: string) => v || '-' },
    { title: '倉庫', dataIndex: 'locationName', key: 'locationName', width: 130, render: (v: string) => v || '默認倉' },
    { title: '實際庫存', dataIndex: 'qty', key: 'qty', width: 100, align: 'right', render: (v: number, r) => `${v} ${r.unit ?? ''}` },
    { title: '審批佔用', dataIndex: 'lockedQty', key: 'lockedQty', width: 100, align: 'right', render: (v: number) => (v > 0 ? <span style={{ color: '#FA8C16' }}>{v}</span> : v) },
    { title: '可用庫存', dataIndex: 'availableQty', key: 'availableQty', width: 110, align: 'right',
      render: (v: number, r) => <b style={{ color: r.alert ? '#FF4D4F' : '#262626' }}>{v}</b> },
    { title: '安全庫存', dataIndex: 'safetyStock', key: 'safetyStock', width: 90, align: 'right', render: (v: number) => (v > 0 ? v : '-') },
    { title: '狀態', key: 'alert', width: 90, render: (_: unknown, r) => (r.alert ? <Tag color="orange">預警</Tag> : <Tag color="green">正常</Tag>) },
    { title: '操作', key: 'action', width: 140, fixed: 'right' as const,
      render: (_: unknown, record: ConsumableStock) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => onInbound(record.itemId)}>入庫</Button>
          <Button type="link" size="small" onClick={() => openTxns(record)}>流水</Button>
        </Space>
      ) },
  ]

  const txnColumns: TableColumnsType<ConsumableTxn> = [
    { title: '時間', dataIndex: 'createdAt', key: 'createdAt', width: 165, render: (v: string) => v || '-' },
    { title: '類型', dataIndex: 'txnType', key: 'txnType', width: 100, render: (v: string) => <Tag color={TXN_TYPE_COLOR[v]}>{TXN_TYPE_LABEL[v] ?? v}</Tag> },
    { title: '變動', dataIndex: 'qty', key: 'qty', width: 80, align: 'right', render: (v: number) => <span style={{ color: v >= 0 ? '#52C41A' : '#FF4D4F', fontWeight: 600 }}>{v > 0 ? `+${v}` : v}</span> },
    { title: '變動後', dataIndex: 'afterQty', key: 'afterQty', width: 80, align: 'right' },
    { title: '操作人', dataIndex: 'operator', key: 'operator', width: 100, render: (v: string) => v || '-' },
    { title: '備註', dataIndex: 'remark', key: 'remark', ellipsis: true, render: (v: string) => v || '-' },
  ]

  return (
    <>
      <div className="search-section">
        <Form layout="inline">
          <Form.Item>
            <Input placeholder="名稱/編碼/倉庫" allowClear style={{ width: 240 }}
              value={keyword} onChange={e => setKeyword(e.target.value)}
              onPressEnter={() => setKeyword(keyword.trim())} />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={() => setKeyword(keyword.trim())}>查詢</Button>
              <Button icon={<ReloadOutlined />} onClick={() => { setKeyword(''); }}>重置</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      <div className="action-section">
        <div className="action-section-left">
          <Button className="btn-export" icon={<ExportOutlined />} onClick={handleExport}>導出</Button>
        </div>
        <div className="action-section-right">
          <Button type="primary" icon={<ImportOutlined />} onClick={() => onInbound()}>手工入庫</Button>
        </div>
      </div>

      <Table<ConsumableStock>
        columns={columns}
        dataSource={tableData}
        rowKey="id"
        rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys }}
        loading={loading}
        scroll={{ x: 1200 }}
        pagination={{ showSizeChanger: true, showQuickJumper: true, showTotal: (t) => `共 ${t} 條` }}
      />

      <Drawer
        title={drawer.item ? `出入庫流水 · ${drawer.item.itemName}` : '出入庫流水'}
        open={drawer.open}
        onClose={() => setDrawer({ open: false, txns: [], loading: false })}
        width={720}
      >
        <Table<ConsumableTxn>
          columns={txnColumns}
          dataSource={drawer.txns}
          rowKey="id"
          loading={drawer.loading}
          size="small"
          pagination={{ pageSize: 10, showTotal: (t) => `共 ${t} 條` }}
        />
      </Drawer>
    </>
  )
}
