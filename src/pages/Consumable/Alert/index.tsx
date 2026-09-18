/**
 * 库存预警（物資管理 - 耗材管理）
 *
 * 列出可用库存低于安全库存的耗材，给出建议补货量；「补货入库」跳转入库表单（预填该耗材）
 * 视图切换：预警清单 ⇄ 入库独立页
 */
import { useState, useEffect, useCallback } from 'react'
import { Button, Table, Tag, message, Empty } from 'antd'
import type { TableColumnsType } from 'antd'
import { AlertOutlined, ImportOutlined, ExportOutlined } from '@ant-design/icons'
import { fetchConsumableAlerts, type ConsumableItem } from '../../../api/consumable'
import InboundForm from '../components/InboundForm'

type View = { mode: 'list' } | { mode: 'inbound'; itemId: number }

/** 建议补货量：有上限补至上限，否则补至安全库存的 1.5 倍缺口 */
function suggestQty(it: ConsumableItem): number {
  if (it.maxStock > 0) return Math.max(1, it.maxStock - it.availableQty)
  return Math.max(1, Math.ceil(it.safetyStock * 1.5) - it.availableQty)
}

export default function ConsumableAlert() {
  const [view, setView] = useState<View>({ mode: 'list' })
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<ConsumableItem[]>([])
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await fetchConsumableAlerts())
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '查詢失敗')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (view.mode === 'list') loadData()
  }, [view.mode, loadData])

  const handleExport = () => {
    if (rows.length === 0) { message.warning('暫無數據可導出'); return }
    message.success('導出成功')
  }

  if (view.mode === 'inbound') {
    return (
      <div className="content-area">
        <InboundForm presetItemId={view.itemId} onBack={() => setView({ mode: 'list' })} />
      </div>
    )
  }

  const columns: TableColumnsType<ConsumableItem> = [
    { title: '耗材編碼', dataIndex: 'itemCode', key: 'itemCode', width: 120, render: (v: string) => <span style={{ fontFamily: 'monospace' }}>{v}</span> },
    { title: '名稱', dataIndex: 'name', key: 'name', width: 160, ellipsis: true },
    { title: '規格型號', dataIndex: 'spec', key: 'spec', width: 140, ellipsis: true, render: (v: string) => v || '-' },
    { title: '分類', dataIndex: 'categoryName', key: 'categoryName', width: 110, render: (v: string) => v || '-' },
    { title: '可用庫存', key: 'availableQty', width: 120, align: 'right',
      render: (_: unknown, r) => <b style={{ color: '#FF4D4F' }}>{r.availableQty} {r.unit}</b> },
    { title: '安全庫存', dataIndex: 'safetyStock', key: 'safetyStock', width: 100, align: 'right' },
    { title: '缺口', key: 'gap', width: 90, align: 'right',
      render: (_: unknown, r) => <Tag color="red">-{Math.max(0, r.safetyStock - r.availableQty)}</Tag> },
    { title: '建議補貨量', key: 'suggest', width: 110, align: 'right',
      render: (_: unknown, r) => <b style={{ color: '#E8720C' }}>{suggestQty(r)} {r.unit}</b> },
    { title: '操作', key: 'action', width: 120, fixed: 'right' as const,
      render: (_: unknown, record: ConsumableItem) => (
        <Button type="link" size="small" icon={<ImportOutlined />} onClick={() => setView({ mode: 'inbound', itemId: record.id })}>
          補貨入庫
        </Button>
      ) },
  ]

  return (
    <div className="content-area">
      {/* 页头提示条 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', marginBottom: 16, background: '#FFF7E6', border: '1px solid #FFE7D1', borderRadius: 8 }}>
        <AlertOutlined style={{ color: '#FA8C16', fontSize: 18 }} />
        <span style={{ fontSize: 13, color: '#595959' }}>
          以下耗材<b style={{ color: '#FF4D4F' }}> 可用库存 </b>已低于安全库存，建议及时补货。共 <b>{rows.length}</b> 项预警。
        </span>
      </div>

      <div className="action-section">
        <div className="action-section-left">
          <Button className="btn-export" icon={<ExportOutlined />} onClick={handleExport}>導出</Button>
        </div>
      </div>

      <Table<ConsumableItem>
        columns={columns}
        dataSource={rows}
        rowKey="id"
        rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys }}
        loading={loading}
        scroll={{ x: 1100 }}
        locale={{ emptyText: <Empty description="暫無庫存預警，庫存充足" /> }}
        pagination={{ showSizeChanger: true, showQuickJumper: true, showTotal: (t) => `共 ${t} 條` }}
      />
    </div>
  )
}
