/**
 * 採購執行詳情頁
 *
 * - 展示執行信息（供應商、成交價、快遞單號等）與驗收進度
 * - 未完成的執行單提供「編輯」入口
 * - 採購完成且未全部入庫時，提供「驗收入庫」入口
 */
import { useState, useEffect, useCallback } from 'react'
import {
  Button, Descriptions, Table, Tag, Space, Spin, message, Progress,
} from 'antd'
import type { TableColumnsType } from 'antd'
import { EditOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import {
  fetchPurchaseOrderDetail, fetchPurchaseRequestDetail,
  type PurchaseOrder, type PurchaseRequest, type ExecStatus,
} from '../../../api/eam'
import DetailPageHeader from '../../../components/DetailPageHeader'

const EXEC_META: Record<ExecStatus, { key: string; color: string }> = {
  pending:    { key: 'asset.execPending',    color: 'default' },
  purchasing: { key: 'asset.execPurchasing', color: 'processing' },
  completed:  { key: 'asset.execCompleted',  color: 'success' },
}

const INBOUND_META: Record<PurchaseOrder['status'], { key: string; color: string }> = {
  pending:  { key: 'asset.poPending',  color: 'processing' },
  partial:  { key: 'asset.poPartial',  color: 'warning' },
  received: { key: 'asset.poReceived', color: 'success' },
}

interface Props {
  id: number
  onBack: () => void
  onEdit: (id: number) => void
  onInbound: (poId: number) => void
  onViewRequest: (reqId: number) => void
}

export default function OrderDetail({ id, onBack, onEdit, onInbound, onViewRequest }: Props) {
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
        try { setRequest(await fetchPurchaseRequestDetail(order.reqId)) } catch { setRequest(null) }
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
      title: t('asset.colRefPrice'), dataIndex: 'price', key: 'price', width: 120, align: 'right',
      render: (v: number) => <span style={{ color: '#8c8c8c', textDecoration: 'line-through' }}>MOP {v.toLocaleString()}</span>,
    },
    {
      title: t('asset.colConfirmedPrice'), key: 'confirmedPrice', width: 130, align: 'right',
      render: (_: unknown, r) => {
        const cp = r.confirmedPrice
        return cp ? <span style={{ fontWeight: 600, color: '#52c41a' }}>MOP {cp.toLocaleString()}</span> : <span style={{ color: '#bfbfbf' }}>—</span>
      },
    },
    {
      title: t('asset.colSubtotal'), key: 'subtotal', width: 130, align: 'right',
      render: (_: unknown, r) => `MOP ${((r.confirmedPrice || r.price) * r.qty).toLocaleString()}`,
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
  const execMeta = EXEC_META[detail.execStatus]
  const inboundMeta = INBOUND_META[detail.status]
  const displayAmount = detail.confirmedAmount ?? detail.amount

  return (
    <Spin spinning={loading}>
      {/* ====== 詳情頁頭部 ====== */}
      <DetailPageHeader
        title={t('asset.purchaseOrderDetailTitle')}
        tags={
          <Space>
            <Tag color={execMeta.color}>{t(execMeta.key)}</Tag>
            {detail.execStatus === 'completed' && (
              <Tag color={inboundMeta.color}>{t(inboundMeta.key)}</Tag>
            )}
          </Space>
        }
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
          <Descriptions.Item label={t('asset.execStatus')}>
            <Tag color={execMeta.color}>{t(execMeta.key)}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label={t('asset.colSupplier')}>{detail.supplier}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colContact')}>{detail.contact || '-'}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colTotalAmount')}>
            <span style={{ fontWeight: detail.confirmedAmount ? 600 : 400, color: detail.confirmedAmount ? '#52c41a' : undefined }}>
              MOP {displayAmount.toLocaleString()}
            </span>
            {detail.confirmedAmount && detail.confirmedAmount !== detail.amount && (
              <span style={{ marginLeft: 8, fontSize: 12, color: '#8c8c8c', textDecoration: 'line-through' }}>
                MOP {detail.amount.toLocaleString()}
              </span>
            )}
          </Descriptions.Item>
          <Descriptions.Item label={t('asset.colTrackingNo')}>
            {detail.trackingNo ? <span style={{ fontFamily: 'monospace' }}>{detail.trackingNo}</span> : '-'}
          </Descriptions.Item>
          <Descriptions.Item label={t('asset.colPurchaser')}>{detail.purchaser || '-'}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colOrderDate')}>{detail.orderDate || '-'}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colDeliveryDate')}>{detail.deliveryDate}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colCreatedAt')}>{detail.createdAt}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colRemark')}>{detail.remark || '-'}</Descriptions.Item>
        </Descriptions>
      </div>

      {/* ====== 訂單明細 ====== */}
      <div style={{
        background: '#fff', borderRadius: 8, padding: '20px 24px', marginBottom: 16,
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

      {/* ====== 驗收入庫進度（僅採購完成時顯示） ====== */}
      {detail.execStatus === 'completed' && (
        <div style={{
          background: '#fff', borderRadius: 8, padding: '20px 24px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600 }}>{t('asset.sectionInboundProgress')}</h3>
          <Space>
            <span>{`${receivedQty} / ${totalQty}`}</span>
            <Progress percent={percent} size="small" style={{ width: 200 }} />
            <Tag color={inboundMeta.color}>{t(inboundMeta.key)}</Tag>
          </Space>
        </div>
      )}

      {/* ====== 底部操作欄 ====== */}
      <div className="form-footer">
        <Space>
          <Button onClick={onBack}>{t('common.back')}</Button>
          {detail.execStatus !== 'completed' && (
            <Button type="default" icon={<EditOutlined />} onClick={() => onEdit(detail.id)}>
              {t('common.edit')}
            </Button>
          )}
          {detail.execStatus === 'completed' && detail.status !== 'received' && (
            <Button type="primary" onClick={() => onInbound(detail.id)}>
              {t('asset.btnReceive')}
            </Button>
          )}
        </Space>
      </div>
    </Spin>
  )
}
