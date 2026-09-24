/**
 * 耗材看板（物資管理 - 耗材管理）
 *
 * 遵循 §B.7 数据指标统计卡标准：4 格指标卡（图标→数值→标签，AnimatedNumber 计数动画 + hover 动效）
 * 下方：库存预警清单（左）+ 最近出入库流水（右）
 */
import { useState, useEffect, useCallback } from 'react'
import { Button, Table, Tag, message, Empty, Space } from 'antd'
import type { TableColumnsType } from 'antd'
import {
  AppstoreOutlined, DatabaseOutlined, DollarOutlined, AlertOutlined, ReloadOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import AnimatedNumber from '../../../components/AnimatedNumber'
import { fetchConsumableDashboard, type ConsumableDashboard, type ConsumableItem, type ConsumableTxn } from '../../../api/consumable'
import { TXN_TYPE_LABEL, TXN_TYPE_COLOR } from '../Claim/constants'

export default function ConsumableDashboardPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<ConsumableDashboard | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const d = await fetchConsumableDashboard()
      setData(d)
      setReloadKey(k => k + 1) // 切换/刷新时通过 key 重新触发计数动画
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '加載失敗')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const cards = data ? [
    { label: '耗材品類', value: <AnimatedNumber value={data.itemKinds} />, icon: <AppstoreOutlined />, color: '#1890FF', bg: '#E6F7FF' },
    { label: '庫存總量', value: <AnimatedNumber value={data.totalStockQty} />, icon: <DatabaseOutlined />, color: '#52C41A', bg: '#F6FFED' },
    { label: '庫存總值', value: <AnimatedNumber value={data.totalStockValue} decimals={2} prefix="MOP " />, icon: <DollarOutlined />, color: '#E8720C', bg: '#FFF7E6' },
    { label: '庫存預警', value: <AnimatedNumber value={data.alertCount} />, icon: <AlertOutlined />, color: '#722ED1', bg: '#F9F0FF' },
  ] : []

  const alertColumns: TableColumnsType<ConsumableItem> = [
    { title: '耗材', dataIndex: 'name', key: 'name', ellipsis: true, render: (v: string, r) => `${v}${r.spec ? ' / ' + r.spec : ''}` },
    { title: '可用', key: 'availableQty', width: 90, align: 'right', render: (_: unknown, r) => <b style={{ color: '#FF4D4F' }}>{r.availableQty}</b> },
    { title: '安全庫存', dataIndex: 'safetyStock', key: 'safetyStock', width: 90, align: 'right' },
    { title: '操作', key: 'action', width: 90, render: () => <Button type="link" size="small" onClick={() => navigate('/consumable-alert')}>補貨</Button> },
  ]

  const txnColumns: TableColumnsType<ConsumableTxn> = [
    { title: '時間', dataIndex: 'createdAt', key: 'createdAt', width: 160, render: (v: string) => v || '-' },
    { title: '耗材', dataIndex: 'itemName', key: 'itemName', ellipsis: true },
    { title: '類型', dataIndex: 'txnType', key: 'txnType', width: 96, render: (v: string) => <Tag color={TXN_TYPE_COLOR[v]}>{TXN_TYPE_LABEL[v] ?? v}</Tag> },
    { title: '變動', dataIndex: 'qty', key: 'qty', width: 76, align: 'right', render: (v: number) => <span style={{ color: v >= 0 ? '#52C41A' : '#FF4D4F', fontWeight: 600 }}>{v > 0 ? `+${v}` : v}</span> },
  ]

  return (
    <div className="content-area">
      {/* 头部：标题 + 待审批/本月领用 + 刷新 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <Space size={12}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: '#262626' }}>耗材看板</h2>
          {data && (
            <>
              <Tag color="orange" style={{ fontSize: 12 }}>本月領用 {data.monthClaimCount}</Tag>
              <Tag color="volcano" style={{ fontSize: 12 }}>本月消耗 MOP {(data.monthConsumeAmount ?? 0).toFixed(2)}</Tag>
              <Tag color="processing" style={{ fontSize: 12, cursor: 'pointer' }} onClick={() => navigate('/consumable-report')}>消耗統計 →</Tag>
              <Tag color="processing" style={{ fontSize: 12, cursor: 'pointer' }} onClick={() => navigate('/consumable-claim')}>領用記錄 →</Tag>
            </>
          )}
        </Space>
        <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>刷新</Button>
      </div>

      {/* 4 格数据指标卡（§B.7 标准） */}
      <div key={reloadKey} style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 16 }}>
        {cards.map((stat, i) => (
          <div key={i} style={{
            padding: 16, borderRadius: 12, background: stat.bg, border: `1px solid ${stat.color}22`,
            textAlign: 'center', transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
            cursor: 'default', position: 'relative', overflow: 'hidden',
          }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.1)' }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none' }}
          >
            <div style={{ fontSize: 20, color: stat.color, marginBottom: 6 }}>{stat.icon}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: stat.color }}>{stat.value}</div>
            <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 2 }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* 预警清单 + 最近流水 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ borderRadius: 8, background: '#fff', padding: '20px 24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#fff7e6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <AlertOutlined style={{ fontSize: 14, color: '#FA8C16' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>庫存預警</span>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          </div>
          <Table<ConsumableItem>
            columns={alertColumns}
            dataSource={data?.alertItems ?? []}
            rowKey="id"
            loading={loading}
            size="small"
            pagination={false}
            locale={{ emptyText: <Empty description="庫存充足，無預警" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
          />
        </div>

        <div style={{ borderRadius: 8, background: '#fff', padding: '20px 24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#e6f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <DatabaseOutlined style={{ fontSize: 14, color: '#1890ff' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>最近出入庫</span>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          </div>
          <Table<ConsumableTxn>
            columns={txnColumns}
            dataSource={data?.recentTxns ?? []}
            rowKey="id"
            loading={loading}
            size="small"
            pagination={false}
            locale={{ emptyText: <Empty description="暫無流水" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
          />
        </div>
      </div>
    </div>
  )
}
