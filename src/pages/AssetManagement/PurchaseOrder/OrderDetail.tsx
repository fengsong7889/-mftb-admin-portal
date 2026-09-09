/**
 * 採購訂單詳情頁
 *
 * - 只讀展示訂單信息、明細與驗收進度（已入庫 / 待入庫）
 * - 未全部入庫時，底部提供「驗收入庫」入口，跳轉批量入庫頁
 */
import { useState, useEffect, useCallback } from 'react'
import {
  Button, Descriptions, Table, Tag, Space, Spin, message, Progress,
} from 'antd'
import type { TableColumnsType } from 'antd'
import { useTranslation } from 'react-i18next'
import {
  fetchPurchaseOrderDetail, fetchPurchaseRequestDetail,
  type PurchaseOrder, type PurchaseRequest,
} from '../../../api/eam'
import DetailPageHeader from '../../../components/DetailPageHeader'

const STATUS_META: Record<PurchaseOrder['status'], { key: string; color: string }> = {
  pending:  { key: 'asset.poPending',  color: 'processing' },
  partial:  { key: 'asset.poPartial',  color: 'warning' },
  received: { key: 'asset.poReceived', color: 'success' },
}

interface Props {
  id: number
  onBack: () => void
  onInbound: (poId: number) => void
  onViewRequest: (reqId: number) => void
}

export default function OrderDetail({ id, onBack, onInbound, onViewRequest }: Props) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState<PurchaseOrder | null>(null)
  const [request, setRequest] = useState<PurchaseRequest | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const order = await fetchPurchaseOrderDetail(id)
      setDetail(order)
      if (order.reqId) {
        try {
          setRequest(await fetchPurchaseRequestDetail(order.reqId))
        } catch {
          setRequest(null)
        }
      }
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : t('asset.queryFailed'))
    } finally {
      setLoading(false)
    }
  }, [id, t])

  useEffect(() => { loadData() }, [loadData])

  const columns: TableColumnsType<PurchaseOrder['items'][number]> = [
    { title: t('asset.colModelName'), dataIndex: 'modelName', key: 'modelName' },
    { title: t('asset.colQty'), dataIndex: 'qty', key: 'qty', width: 90, align: 'right' },
    {
      title: t('asset.colPrice'), dataIndex: 'price', key: 'price', width: 130, align: 'right',
      render: (v: number) => `MOP ${v.toLocaleString()}`,
    },
    {
      title: t('asset.colSubtotal'), key: 'subtotal', width: 130, align: 'right',
      render: (_: unknown, r) => `MOP ${(r.qty * r.price).toLocaleString()}`,
    },
    {
      title: t('asset.colReceivedQty'), dataIndex: 'receivedQty', key: 'receivedQty', width: 110, align: 'right',
      render: (v: number) => <Tag color={v > 0 ? 'success' : 'default'}>{v}</Tag>,
    },
    {
      title: t('asset.inboundTitle'), key: 'pendingQty', width: 110, align: 'right',
      render: (_: unknown, r) => Math.max(0, r.qty - r.receivedQty),
    },
  ]

  if (loading || !detail) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" tip={t('common.loading')} />
      </div>
    )
  }

  const totalQty = detail.items.reduce((s, it) => s + it.qty, 0)
  const receivedQty = detail.items.reduce((s, it) => s + it.receivedQty, 0)
  const percent = totalQty ? Math.round((receivedQty / totalQty) * 100) : 0
  const statusMeta = STATUS_META[detail.status]

  return (
    <Spin spinning={loading}>
      {/* ====== 詳情頁頭部（全局 DetailPageHeader） ====== */}
      <DetailPageHeader
        title={t('asset.purchaseOrderDetailTitle')}
        tags={<Tag color={statusMeta.color}>{t(statusMeta.key)}</Tag>}
        meta={<>{detail.poNo} · {detail.supplier}</>}
        onBack={onBack}
      />

      {/* ====== 基本信息 ====== */}
      <div style={{
        background: '#fff', borderRadius: 8, padding: '20px 24px', marginBottom: 16,
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600 }}>{t('asset.sectionBasic')}</h3>
        <Descriptions column={3} size="middle" bordered>
          <Descriptions.Item label={t('asset.colPoNo')}>{detail.poNo}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colReqNo')}>
            {detail.reqId ? (
              <Button type="link" size="small" onClick={() => onViewRequest(detail.reqId)}>
                {request?.reqNo || detail.reqId}
              </Button>
            ) : '-'}
          </Descriptions.Item>
          <Descriptions.Item label={t('asset.colSupplier')}>{detail.supplier}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colContact')}>{detail.contact || '-'}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colTotalAmount')}>
            {`MOP ${(detail.amount || 0).toLocaleString()}`}
          </Descriptions.Item>
          <Descriptions.Item label={t('asset.colDeliveryDate')}>{detail.deliveryDate}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colReceivedQty')}>
            <Space>
              <span>{`${receivedQty} / ${totalQty}`}</span>
              <Progress percent={percent} size="small" style={{ width: 120 }} />
            </Space>
          </Descriptions.Item>
          <Descriptions.Item label={t('asset.colCreatedAt')}>{detail.createdAt}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colRemark')}>{detail.remark || '-'}</Descriptions.Item>
        </Descriptions>
      </div>

      {/* ====== 訂單明細 ====== */}
      <div style={{
        background: '#fff', borderRadius: 8, padding: '20px 24px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600 }}>{t('asset.sectionItems')}</h3>
        <Table
          columns={columns}
          dataSource={detail.items}
          rowKey="modelId"
          size="middle"
          pagination={false}
        />
      </div>

      {/* ====== 底部操作欄（未全部入庫時可驗收入庫） ====== */}
      {detail.status !== 'received' && (
        <div className="form-footer">
          <Space>
            <Button onClick={onBack}>{t('common.cancel')}</Button>
            <Button type="primary" onClick={() => onInbound(detail.id)}>
              {t('asset.btnReceive')}
            </Button>
          </Space>
        </div>
      )}
    </Spin>
  )
}
