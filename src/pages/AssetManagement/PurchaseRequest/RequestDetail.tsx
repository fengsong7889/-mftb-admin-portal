/**
 * 採購申請詳情頁（含審批操作）
 *
 * - 只讀展示申請信息與採購明細
 * - 狀態為「待審批」時，底部提供「駁回 / 審批通過」操作
 * - 審批通過後自動生成採購訂單（由 api/eam.ts approvePurchaseRequest 承載）
 */
import { useState, useEffect, useCallback } from 'react'
import {
  Descriptions, Table, Tag, Modal, Input, Space, Spin, message, Alert,
} from 'antd'
import type { TableColumnsType } from 'antd'
import { useTranslation } from 'react-i18next'
import {
  fetchPurchaseRequestDetail, approvePurchaseRequest, type PurchaseRequest,
} from '../../../api/eam'
import DetailPageHeader from '../../../components/DetailPageHeader'

const STATUS_META: Record<PurchaseRequest['status'], { key: string; color: string }> = {
  pending:  { key: 'asset.reqPending',  color: 'processing' },
  approved: { key: 'asset.reqApproved', color: 'success' },
  rejected: { key: 'asset.reqRejected', color: 'error' },
}

interface Props {
  id: number
  onBack: () => void
  onViewOrder: (orderId: number) => void
}

export default function RequestDetail({ id, onBack, onViewOrder }: Props) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState<PurchaseRequest | null>(null)
  const [approveOpen, setApproveOpen] = useState(false)
  const [approveRemark, setApproveRemark] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      setDetail(await fetchPurchaseRequestDetail(id))
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : t('asset.queryFailed'))
    } finally {
      setLoading(false)
    }
  }, [id, t])

  useEffect(() => { loadData() }, [loadData])

  /** 審批（approved=true 通過 / false 駁回） */
  const handleApprove = async (approved: boolean) => {
    if (!detail) return
    setSubmitting(true)
    try {
      const orderId = await approvePurchaseRequest(
        detail.id, approved, t('asset.currentOperator'), approveRemark || undefined,
      )
      message.success(approved ? t('asset.approveSuccess') : t('asset.rejectSuccess'))
      setApproveOpen(false)
      setApproveRemark('')
      if (approved && orderId) {
        onViewOrder(orderId)
      } else {
        onBack()
      }
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : t('asset.queryFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  const columns: TableColumnsType<PurchaseRequest['items'][number]> = [
    { title: t('asset.colModelName'), dataIndex: 'modelName', key: 'modelName' },
    { title: t('asset.colQty'), dataIndex: 'qty', key: 'qty', width: 90, align: 'right' },
    {
      title: t('asset.colEstPrice'), dataIndex: 'estPrice', key: 'estPrice', width: 130, align: 'right',
      render: (v: number) => `MOP ${v.toLocaleString()}`,
    },
    {
      title: t('asset.colSubtotal'), key: 'subtotal', width: 130, align: 'right',
      render: (_: unknown, r) => `MOP ${(r.qty * r.estPrice).toLocaleString()}`,
    },
    {
      title: t('asset.colRemark'), dataIndex: 'remark', key: 'remark', width: 180,
      render: (v: string | undefined) => v || '-',
    },
  ]

  if (loading || !detail) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" tip={t('common.loading')} />
      </div>
    )
  }

  const totalAmount = detail.items.reduce((s, it) => s + it.qty * it.estPrice, 0)
  const statusMeta = STATUS_META[detail.status]

  return (
    <Spin spinning={loading}>
      {/* ====== 詳情頁頭部（全局 DetailPageHeader） ====== */}
      <DetailPageHeader
        title={t('asset.purchaseReqDetailTitle')}
        tags={<Tag color={statusMeta.color}>{t(statusMeta.key)}</Tag>}
        meta={<>{detail.reqNo} · {detail.title}</>}
        onBack={onBack}
      />

      {/* ====== 基本信息 ====== */}
      <div style={{
        background: '#fff', borderRadius: 8, padding: '20px 24px', marginBottom: 16,
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600 }}>{t('asset.sectionBasic')}</h3>
        <Descriptions column={3} size="middle" bordered>
          <Descriptions.Item label={t('asset.colReqNo')}>{detail.reqNo}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colReqTitle')}>{detail.title}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colDepartment')}>{detail.department}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colApplicant')}>{detail.applicant}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colBudget')}>
            {`MOP ${(detail.budget || 0).toLocaleString()}`}
          </Descriptions.Item>
          <Descriptions.Item label={t('asset.colTotalAmount')}>
            <span style={{ color: totalAmount > detail.budget ? '#FF4D4F' : '#E8720C', fontWeight: 600 }}>
              {`MOP ${totalAmount.toLocaleString()}`}
            </span>
          </Descriptions.Item>
          <Descriptions.Item label={t('asset.colReason')} span={3}>{detail.reason || '-'}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colCreatedAt')}>{detail.createdAt}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colApprover')}>{detail.approver || '-'}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colPoNo')}>
            {detail.orderId ? (
              <Button type="link" size="small" onClick={() => onViewOrder(detail.orderId as number)}>
                {t('asset.btnViewOrder')}
              </Button>
            ) : '-'}
          </Descriptions.Item>
          <Descriptions.Item label={t('asset.colApproveRemark')} span={3}>
            {detail.approveRemark || '-'}
          </Descriptions.Item>
        </Descriptions>
      </div>

      {/* ====== 採購明細 ====== */}
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

      {/* ====== 底部審批操作欄（僅待審批） ====== */}
      {detail.status === 'pending' && (
        <div className="form-footer">
          <Space>
            <Button onClick={onBack}>{t('common.cancel')}</Button>
            <Button type="primary" onClick={() => setApproveOpen(true)}>
              {t('asset.btnApprove')}
            </Button>
          </Space>
        </div>
      )}

      {/* ====== 審批彈窗（填写審批意見） ====== */}
      <Modal
        open={approveOpen}
        title={t('asset.btnApprove')}
        onCancel={() => { setApproveOpen(false); setApproveRemark('') }}
        footer={[
          <Button key="cancel" onClick={() => setApproveOpen(false)}>{t('common.cancel')}</Button>,
          <Button key="reject" danger loading={submitting} onClick={() => handleApprove(false)}>
            {t('asset.btnReject')}
          </Button>,
          <Button key="ok" type="primary" loading={submitting} onClick={() => handleApprove(true)}>
            {t('asset.btnApprove')}
          </Button>,
        ]}
      >
        <Alert type="info" showIcon message={t('asset.approveSuccess')} style={{ marginBottom: 12 }} />
        <Input.TextArea
          rows={3}
          value={approveRemark}
          onChange={(e) => setApproveRemark(e.target.value)}
          placeholder={t('asset.colApproveRemark')}
          maxLength={200}
        />
      </Modal>
    </Spin>
  )
}
