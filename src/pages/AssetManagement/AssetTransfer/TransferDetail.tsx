/**
 * 調撥詳情頁
 *
 * 樣式基準：採購訂單詳情（PurchaseOrder/OrderDetail.tsx）——
 * DetailPageHeader + 無邊框模塊卡片 + Descriptions column=4 非 bordered + 最後更新 footer。
 */
import { useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Spin, Tag, Descriptions, Tooltip } from 'antd'
import { FileTextOutlined, SwapOutlined, EditOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import DetailPageHeader from '../../../components/DetailPageHeader'
import { fetchTransferDetail } from '../../../api/asset'
import AssetParameters from '../../../components/AssetParameters'
import { useTransferData } from './useTransferData'
import { TransferError, TransferSection } from './TransferLayout'
import { positiveId, resolveTransferFrom, TRANSFER_STATUS } from './transferUtils'

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
        background: '#e6f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center',
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
  const id = positiveId(searchParams.get('id'))
  const from = resolveTransferFrom(searchParams.get('from'), undefined, '/asset-transfer/detail')
  const fetcher = useCallback(() => id ? fetchTransferDetail(id) : Promise.reject(new Error(t('transfer.invalidId'))), [id, t])
  const { data: record, loading, error, refresh } = useTransferData(fetcher)
  if (!record) return <div className="content-area">
    <DetailPageHeader title={t('transfer.detailTitle')} onBack={() => navigate(from)} />
    <TransferError error={error} retry={refresh} />
    {loading && <div style={{ minHeight: 400, display: 'grid', placeItems: 'center' }}><Spin /></div>}
  </div>
  const statusTag = record.status === TRANSFER_STATUS.CANCELLED
    ? <Tag color="default">{t('asset.transferCancelled')}</Tag>
    : record.status === TRANSFER_STATUS.DONE ? <Tag color="success">{t('asset.transferDone')}</Tag> : <Tag>{t('transfer.unknown')}</Tag>

  return (
    <div className="content-area">
      {/* ====== 頁面頭部 ====== */}
      <DetailPageHeader
        title={t('transfer.detailTitle')}
        tags={statusTag}
        meta={<>{record.transferNo} · {record.assetNo}</>}
        onBack={() => navigate(from)}
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
          <Descriptions.Item label={t('transfer.brand')}><Tooltip title={record.brandBackfilled ? t('transfer.brandBackfilled') : undefined}>{record.brand || '—'}{record.brandBackfilled ? ' *' : ''}</Tooltip></Descriptions.Item>
        </Descriptions>
        <AssetParameters asset={record} current />
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
          {record.cancelReason && <Descriptions.Item label={t('transfer.cancelReason')} span={4}>{record.cancelReason}</Descriptions.Item>}
          {record.cancelledBy && <Descriptions.Item label={t('transfer.cancelledBy')}>{record.cancelledBy}</Descriptions.Item>}
          {record.cancelledAt && <Descriptions.Item label={t('transfer.cancelledAt')}>{record.cancelledAt}</Descriptions.Item>}
        </Descriptions>
      </div>

      {/* ====== 最後更新（詳情頁規範 footer） ====== */}
      <TransferSection title={t('transfer.audit')} icon={<EditOutlined />}>
        <Descriptions column={2}>
          <Descriptions.Item label={t('transfer.updatedBy')}>{record.updatedBy || '—'}</Descriptions.Item>
          <Descriptions.Item label={t('transfer.updatedAt')}>{record.updatedAt || '—'}</Descriptions.Item>
        </Descriptions>
      </TransferSection>
    </div>
  )
}
