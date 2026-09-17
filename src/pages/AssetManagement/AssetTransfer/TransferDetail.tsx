/**
 * 調撥詳情頁
 *
 * 樣式基準：採購訂單詳情（PurchaseOrder/OrderDetail.tsx）——
 * DetailPageHeader + 無邊框模塊卡片 + Descriptions column=4 非 bordered + 最後更新 footer。
 */
import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Spin, Tag, Descriptions, Modal, Input, message } from 'antd'
import { FileTextOutlined, SwapOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import DetailPageHeader from '../../../components/DetailPageHeader'
import { fetchTransferDetail, type TransferRecord } from '../../../api/asset'

/** 詳情卡片統一樣式（無邊框） */
const detailCardStyle: React.CSSProperties = {
  borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16,
  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
}

/** 模塊標題行 */
function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
      <div style={{
        width: 28, height: 28, borderRadius: 6,
        background: '#f0f5ff', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {icon}
      </div>
      <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{title}</span>
      <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
    </div>
  )
}

/** 格式化使用人：姓名(工号) */
function formatUser(name: string | null | undefined, empId: string | null | undefined): string {
  if (!name) return '-'
  return empId ? `${name}(${empId})` : name
}

export default function TransferDetail() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const id = searchParams.get('id') ? Number(searchParams.get('id')) : null

  const [loading, setLoading] = useState(true)
  const [record, setRecord] = useState<TransferRecord | null>(null)
  const [cancelModal, setCancelModal] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelling, setCancelling] = useState(false)

  const loadDetail = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const data = await fetchTransferDetail(id)
      setRecord(data)
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : t('asset.loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [id, t])

  useEffect(() => { loadDetail() }, [loadDetail])

  const handleCancel = async () => {
    if (!record) return
    setCancelling(true)
    try {
      const { default: request } = await import('../../../api/request')
      await request.post(`/eam/transfers/${record.id}/cancel`, { reason: cancelReason })
      message.success(t('asset.transferCancelled'))
      setCancelModal(false)
      setCancelReason('')
      loadDetail()
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : t('asset.operationFailed'))
    } finally {
      setCancelling(false)
    }
  }

  if (loading || !record) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" />
      </div>
    )
  }

  const statusTag = record.status === 'cancelled'
    ? <Tag color="default">{t('asset.transferCancelled')}</Tag>
    : <Tag color="success">{t('asset.transferDone')}</Tag>

  return (
    <>
      {/* ====== 頁面頭部 ====== */}
      <DetailPageHeader
        title={record.transferNo}
        tags={statusTag}
        meta={<>{record.transferDate} · {record.assetNo}</>}
        onBack={() => navigate('/asset-transfer-list')}
        extra={record.status === 'done' ? (
          <button
            className="ant-btn ant-btn-default"
            onClick={() => setCancelModal(true)}
          >
            {t('asset.btnCancelTransfer', { defaultValue: '作廢調撥' })}
          </button>
        ) : undefined}
      />

      {/* ====== 資產信息 ====== */}
      <div style={detailCardStyle}>
        <SectionTitle
          icon={<FileTextOutlined style={{ fontSize: 14, color: '#1890ff' }} />}
          title={t('asset.sectionAssetInfo')}
        />
        <Descriptions column={4} size="middle">
          <Descriptions.Item label={t('asset.colAssetNo')}>
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{record.assetNo}</span>
          </Descriptions.Item>
          <Descriptions.Item label={t('asset.colAssetName')}>{record.assetName}</Descriptions.Item>
        </Descriptions>
      </div>

      {/* ====== 調撥信息 ====== */}
      <div style={detailCardStyle}>
        <SectionTitle
          icon={<SwapOutlined style={{ fontSize: 14, color: '#722ed1' }} />}
          title={t('asset.sectionTransferInfo')}
        />
        <Descriptions column={4} size="middle">
          <Descriptions.Item label={t('asset.colTransferNo')}>
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{record.transferNo}</span>
          </Descriptions.Item>
          <Descriptions.Item label={t('asset.colTransferDate')}>{record.transferDate}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colStatus')}>{statusTag}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colOperator')}>{record.operatorName || '-'}</Descriptions.Item>

          <Descriptions.Item label={t('asset.colFromUser')}>
            {formatUser(record.fromUserName, record.fromUserEmpId)}
          </Descriptions.Item>
          <Descriptions.Item label={t('asset.colTransferToUser')}>
            {formatUser(record.toUserName, record.toUserEmpId)}
          </Descriptions.Item>
          <Descriptions.Item label={t('asset.colFromDept')}>{record.fromDepartment || '-'}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colToDept')}>{record.toDepartment || '-'}</Descriptions.Item>

          <Descriptions.Item label={t('asset.colTransferReason')} span={4}>{record.reason}</Descriptions.Item>
          {record.remark && (
            <Descriptions.Item label={t('asset.colRemark')} span={4}>{record.remark}</Descriptions.Item>
          )}
        </Descriptions>
      </div>

      {/* ====== 最後更新（詳情頁規範 footer） ====== */}
      <div style={{
        background: '#fafafa', borderRadius: 8, padding: '12px 24px',
        border: '1px solid #f0f0f0',
        display: 'flex', justifyContent: 'flex-end', gap: 24,
      }}>
        <span style={{ fontSize: 12, color: '#8C8C8C' }}>
          {t('asset.updatedByLabel', { defaultValue: '更新人：' })}
          <span style={{ color: '#595959' }}>{record.updatedBy || '-'}</span>
        </span>
        <span style={{ fontSize: 12, color: '#8C8C8C' }}>
          {t('asset.updatedAtLabel', { defaultValue: '更新時間：' })}
          <span style={{ color: '#595959' }}>{record.updatedAt || '-'}</span>
        </span>
      </div>

      {/* ====== 作廢彈窗 ====== */}
      <Modal
        title={t('asset.btnCancelTransfer', { defaultValue: '作廢調撥' })}
        open={cancelModal}
        onOk={handleCancel}
        onCancel={() => { setCancelModal(false); setCancelReason('') }}
        confirmLoading={cancelling}
        okText={t('common.confirm')}
        cancelText={t('common.cancel')}
      >
        <div style={{ marginBottom: 8, color: '#595959' }}>
          {t('asset.cancelTransferTip', { defaultValue: '作廢後資產歸屬將回滾至調撥前狀態，請確認。' })}
        </div>
        <Input.TextArea
          rows={3}
          placeholder={t('asset.cancelReasonPh', { defaultValue: '請輸入作廢原因（選填）' })}
          value={cancelReason}
          onChange={(e) => setCancelReason(e.target.value)}
          maxLength={300}
        />
      </Modal>
    </>
  )
}
