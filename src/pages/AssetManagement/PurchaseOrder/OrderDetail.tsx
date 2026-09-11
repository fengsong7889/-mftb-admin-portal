/**
 * 採購執行詳情頁
 *
 * - 展示執行信息（供應商分組、收貨方式、成交價等）與驗收進度
 * - 字段結構與錄入訂單頁（OrderAdd）保持一致
 */
import { useState, useEffect, useCallback } from 'react'
import {
  Button, Descriptions, Table, Tag, Space, Spin, message, Progress,
} from 'antd'
import type { TableColumnsType } from 'antd'
import { useTranslation } from 'react-i18next'
import {
  fetchPurchaseOrderDetail, fetchPurchaseRequestDetail,
  type PurchaseOrder, type PurchaseRequest, type ExecStatus,
  type PurchaseOrderSupplierGroup,
} from '../../../api/eam'
import { fetchEmployees } from '../../../api/employee'
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

const DELIVERY_METHOD_LABEL: Record<string, string> = {
  self_pickup: '自取',
  supplier_delivery: '供應商送貨上門',
  express: '快遞發貨',
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
  const [empDeptMap, setEmpDeptMap] = useState<Map<string, string>>(new Map())

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

  // 員工 → 部門映射
  useEffect(() => {
    fetchEmployees({ page: 1, size: 999, employmentStatus: 'active' })
      .then((res) => {
        const map = new Map<string, string>()
        ;(res.records || []).forEach((e) => {
          if (e.department) { map.set(e.name, e.department); map.set(e.empId, e.department) }
        })
        setEmpDeptMap(map)
      })
      .catch(() => {})
  }, [])

  /** 明細表格列（與 OrderAdd 一致） */
  const itemColumns: TableColumnsType<PurchaseOrder['items'][number]> = [
    { title: '分類', dataIndex: 'categoryName', key: 'categoryName', width: 100, ellipsis: true,
      render: (v: string | undefined) => v || '-' },
    { title: '品牌', dataIndex: 'brandName', key: 'brandName', width: 100, ellipsis: true,
      render: (v: string | undefined) => v || '-' },
    { title: '資產名稱', dataIndex: 'modelName', key: 'modelName', width: 160, ellipsis: true },
    {
      title: '參數', key: 'params', width: 140, ellipsis: true,
      render: (_: unknown, r) => {
        if (!r.params || Object.keys(r.params).length === 0) return <span style={{ color: '#bfbfbf', fontSize: 12 }}>-</span>
        const entries = Object.entries(r.params).filter(([, v]) => v)
        if (entries.length === 0) return <span style={{ color: '#bfbfbf', fontSize: 12 }}>-</span>
        return <span style={{ fontSize: 12, color: '#595959' }}>{entries.map(([k, v]) => `${k}:${v}`).join(' / ')}</span>
      },
    },
    { title: '數量', dataIndex: 'qty', key: 'qty', width: 60, align: 'right' },
    {
      title: '採購形式', key: 'purchaseType', width: 80,
      render: (_: unknown, r) => r.purchaseType
        ? <Tag color={r.purchaseType === 'purchase' ? 'blue' : 'green'}>{r.purchaseType === 'purchase' ? '購買' : '租賃'}</Tag>
        : '-',
    },
    {
      title: '參考單價', key: 'price', width: 100, align: 'right',
      render: (_: unknown, r) => (
        <span style={{ color: '#8c8c8c', fontSize: 12 }}>{r.price ? `MOP ${r.price.toLocaleString()}` : '-'}</span>
      ),
    },
    {
      title: '成交單價', key: 'confirmedPrice', width: 100, align: 'right',
      render: (_: unknown, r) => (
        <span style={{ fontWeight: r.confirmedPrice ? 600 : 400, color: r.confirmedPrice ? '#52c41a' : '#bfbfbf' }}>
          {r.confirmedPrice ? `MOP ${r.confirmedPrice.toLocaleString()}` : '-'}
        </span>
      ),
    },
    {
      title: '小計', key: 'subtotal', width: 100, align: 'right',
      render: (_: unknown, r) => <span style={{ fontWeight: 600 }}>MOP {((r.confirmedPrice || r.price) * r.qty).toLocaleString()}</span>,
    },
    {
      title: '已驗收', dataIndex: 'receivedQty', key: 'receivedQty', width: 80, align: 'right',
      render: (v: number) => <Tag color={v > 0 ? 'success' : 'default'}>{v}</Tag>,
    },
  ]

  if (loading || !detail) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" tip={t('common.loading')} />
      </div>
    )
  }

  // 構建供應商分組（兼容舊數據）
  const groups: PurchaseOrderSupplierGroup[] = detail.supplierGroups && detail.supplierGroups.length > 0
    ? detail.supplierGroups
    : [{ id: 'default', supplier: detail.supplier, contact: detail.contact, orderDate: detail.orderDate, trackingNo: detail.trackingNo, items: detail.items }]

  const grandTotal = groups.reduce((s, g) => s + g.items.reduce((ss, it) => ss + (it.confirmedPrice || it.price) * it.qty, 0), 0)
  const purchaserDept = empDeptMap.get(detail.purchaser || '') || ''
  const execMeta = EXEC_META[detail.execStatus]
  const inboundMeta = INBOUND_META[detail.status]

  return (
    <Spin spinning={loading}>
      {/* ====== 詳情頁頭部 ====== */}
      <DetailPageHeader
        title={t('asset.purchaseOrderDetailTitle')}
        tags={
          <Space>
            <Tag color={execMeta.color}>{t(execMeta.key)}</Tag>
            {detail.execStatus === 'completed' && <Tag color={inboundMeta.color}>{t(inboundMeta.key)}</Tag>}
          </Space>
        }
        meta={<>{detail.poNo} · {detail.supplier}</>}
        onBack={onBack}
        onEdit={detail.execStatus !== 'completed' && detail.status !== 'received' ? () => onEdit(detail.id) : undefined}
        extra={detail.execStatus === 'completed' && detail.status !== 'received' ? (
          <Button type="primary" onClick={() => onInbound(detail.id)}
            style={{ backgroundColor: '#722ED1', borderColor: '#722ED1', borderRadius: 8, height: 36, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 2px 6px rgba(114,46,209,0.25)' }}>
            {t('asset.btnReceive')}
          </Button>
        ) : undefined}
      />

      {/* ====== 訂單信息 ====== */}
      <div style={{
        background: '#fff', borderRadius: 8, padding: '20px 24px', marginBottom: 16,
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: '#fff7e6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 14, color: '#fa8c16' }}>🛒</span>
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>訂單信息</span>
          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
        </div>

        <Descriptions column={4} size="middle">
          <Descriptions.Item label="採購單號"><span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{detail.poNo}</span></Descriptions.Item>
          <Descriptions.Item label={t('asset.colReqNo')}>
            {detail.reqId ? (
              <Button type="link" size="small" onClick={() => onViewRequest(detail.reqId)}>
                {request?.reqNo || detail.reqId}
              </Button>
            ) : '-'}
          </Descriptions.Item>
          <Descriptions.Item label={t('asset.execStatus')}><Tag color={execMeta.color}>{t(execMeta.key)}</Tag></Descriptions.Item>
          <Descriptions.Item label="訂單總計">
            <span style={{ fontSize: 18, fontWeight: 700, color: '#E8720C' }}>MOP {grandTotal.toLocaleString()}</span>
          </Descriptions.Item>
          <Descriptions.Item label="採購經辦人">{detail.purchaser || '-'}</Descriptions.Item>
          <Descriptions.Item label="服務部門">{purchaserDept || '-'}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colCreatedAt')}>{detail.createdAt}</Descriptions.Item>
          <Descriptions.Item label="採購事由">{detail.remark || '-'}</Descriptions.Item>
        </Descriptions>
      </div>

      {/* ====== 採購物資分組 ====== */}
      {groups.map((group, gIdx) => {
        const subtotal = group.items.reduce((s, it) => s + (it.confirmedPrice || it.price) * it.qty, 0)
        const dm = group.deliveryMethod
        return (
          <div key={group.id} style={{
            border: '1px solid #e8eaed', borderRadius: 8, background: '#fff',
            padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          }}>
            {/* 分組標題 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 20, height: 20, borderRadius: '50%',
                  background: 'linear-gradient(135deg, #1890ff, #36cfc9)',
                  color: '#fff', fontSize: 11, fontWeight: 700,
                  boxShadow: '0 1px 4px rgba(24,144,255,0.3)',
                }}>{gIdx + 1}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#262626' }}>採購物資</span>
                <Tag color="blue" style={{ fontSize: 11 }}>小計：MOP {subtotal.toLocaleString()}</Tag>
              </div>
            </div>

            {/* 供應商信息 */}
            <Descriptions column={4} size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="供應商名稱">{group.supplier || '-'}</Descriptions.Item>
              <Descriptions.Item label="供應商聯絡人">{group.contact || '-'}</Descriptions.Item>
              <Descriptions.Item label="下單日期">{group.orderDate || '-'}</Descriptions.Item>
              <Descriptions.Item label="收貨方式">{dm ? DELIVERY_METHOD_LABEL[dm] || '-' : '-'}</Descriptions.Item>
              {dm === 'supplier_delivery' && (
                <Descriptions.Item label="預計收貨日期">{group.expectedReceiveDate || '-'}</Descriptions.Item>
              )}
              {dm === 'express' && (
                <>
                  <Descriptions.Item label="預計收貨日期">{group.expectedReceiveDate || '-'}</Descriptions.Item>
                  <Descriptions.Item label="快遞單號">
                    {group.trackingNo ? <span style={{ fontFamily: 'monospace' }}>{group.trackingNo}</span> : '-'}
                  </Descriptions.Item>
                </>
              )}
            </Descriptions>

            {/* 明細表格 */}
            <Table
              columns={itemColumns}
              dataSource={group.items}
              rowKey={(r) => r.key || r.modelId?.toString() || Math.random().toString()}
              size="small"
              pagination={false}
              scroll={{ x: 1100 }}
            />
          </div>
        )
      })}

      {/* ====== 驗收入庫進度 ====== */}
      {detail.execStatus === 'completed' && (() => {
        const totalQty = detail.items.reduce((s, it) => s + it.qty, 0)
        const receivedQty = detail.items.reduce((s, it) => s + it.receivedQty, 0)
        const percent = totalQty ? Math.round((receivedQty / totalQty) * 100) : 0
        return (
          <div style={{
            background: '#fff', borderRadius: 8, padding: '20px 24px', marginBottom: 16,
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600 }}>{t('asset.sectionInboundProgress')}</h3>
            <Space>
              <span>{`${receivedQty} / ${totalQty}`}</span>
              <Progress percent={percent} size="small" style={{ width: 200 }} />
              <Tag color={inboundMeta.color}>{t(inboundMeta.key)}</Tag>
            </Space>
          </div>
        )
      })()}

      {/* ====== 最後更新 ====== */}
      <div style={{
        background: '#fafafa', borderRadius: 8, padding: '12px 24px',
        border: '1px solid #f0f0f0',
        display: 'flex', justifyContent: 'flex-end', gap: 24,
      }}>
        <span style={{ fontSize: 12, color: '#8C8C8C' }}>最後更新人：<span style={{ color: '#595959' }}>{detail.updatedBy || '-'}</span></span>
        <span style={{ fontSize: 12, color: '#8C8C8C' }}>最後更新時間：<span style={{ color: '#595959' }}>{detail.updatedAt || '-'}</span></span>
      </div>
    </Spin>
  )
}
