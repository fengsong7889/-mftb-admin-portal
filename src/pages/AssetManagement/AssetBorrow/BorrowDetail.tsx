/**
 * 借用詳情頁（只讀）
 *
 * - 展示借用單信息、逾期提示與續借次數
 * - 未歸還時底部提供「續借」「歸還」入口（歸還跳轉歸還管理並帶入借用單）
 */
import { useState, useEffect, useCallback } from 'react'
import { Descriptions, Tag, Space, Spin, message, Alert } from 'antd'
import { useTranslation } from 'react-i18next'
import { fetchBorrowDetail, type BorrowRecord } from '../../../api/eam'
import { daysBetween, todayStr } from '../eamUtils'
import DetailPageHeader from '../../../components/DetailPageHeader'

const STATUS_META: Record<BorrowRecord['status'], { key: string; color: string }> = {
  borrowing: { key: 'asset.borrowBorrowing', color: 'processing' },
  returned:  { key: 'asset.borrowReturned',  color: 'success' },
  overdue:   { key: 'asset.borrowOverdue',   color: 'error' },
}

interface Props {
  id: number
  onBack: () => void
  onRenew: (id: number) => void
  onReturn: (id: number) => void
  onViewAsset: (assetNo: string) => void
}

export default function BorrowDetail({ id, onBack, onRenew, onReturn, onViewAsset }: Props) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState<BorrowRecord | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      setDetail(await fetchBorrowDetail(id))
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : t('asset.queryFailed'))
    } finally {
      setLoading(false)
    }
  }, [id, t])

  useEffect(() => { loadData() }, [loadData])

  if (loading || !detail) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" tip={t('common.loading')} />
      </div>
    )
  }

  const statusMeta = STATUS_META[detail.status]
  const overdueDays = detail.status === 'overdue' ? daysBetween(detail.dueDate, todayStr()) : 0

  return (
    <Spin spinning={loading}>
      {/* ====== 詳情頁頭部（全局 DetailPageHeader） ====== */}
      <DetailPageHeader
        title={t('asset.borrowDetailTitle')}
        tags={<Tag color={statusMeta.color}>{t(statusMeta.key)}</Tag>}
        meta={<>{detail.borrowNo} · {detail.assetName}</>}
        onBack={onBack}
      />

      {/* ====== 逾期提示 ====== */}
      {detail.status === 'overdue' && (
        <Alert
          type="error" showIcon style={{ marginBottom: 16 }}
          message={t('asset.overdueTip', { days: overdueDays })}
        />
      )}

      {/* ====== 基本信息 ====== */}
      <div style={{
        background: '#fff', borderRadius: 8, padding: '20px 24px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600 }}>{t('asset.sectionBasic')}</h3>
        <Descriptions column={3} size="middle" bordered>
          <Descriptions.Item label={t('asset.colBorrowNo')}>{detail.borrowNo}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colAssetNo')}>
            <Button type="link" size="small" style={{ padding: 0 }} onClick={() => onViewAsset(detail.assetNo)}>
              {detail.assetNo}
            </Button>
          </Descriptions.Item>
          <Descriptions.Item label={t('asset.colAssetName')}>{detail.assetName}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colBorrower')}>{detail.borrower}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colDepartment')}>{detail.department}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colPurpose')}>{detail.purpose}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colBorrowDate')}>{detail.borrowDate}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colDueDate')}>
            <span style={{ color: detail.status === 'overdue' ? '#FF4D4F' : undefined, fontWeight: 600 }}>
              {detail.dueDate}
            </span>
          </Descriptions.Item>
          <Descriptions.Item label={t('asset.colOverdueDays')}>
            {detail.status === 'overdue' ? <Tag color="error">{overdueDays}</Tag> : '-'}
          </Descriptions.Item>
          <Descriptions.Item label={t('asset.colRenewCount')}>{detail.renewCount}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colReturnDate')}>{detail.returnDate || '-'}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colOperator')}>{detail.operator}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colCreatedAt')}>{detail.createdAt}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colRemark')} span={2}>{detail.remark || '-'}</Descriptions.Item>
        </Descriptions>
      </div>

      {/* ====== 底部操作欄（未歸還時可續借/歸還） ====== */}
      {detail.status !== 'returned' && (
        <div className="form-footer">
          <Space>
            <Button onClick={onBack}>{t('common.cancel')}</Button>
            <Button onClick={() => onRenew(detail.id)}>{t('asset.btnRenew')}</Button>
            <Button type="primary" onClick={() => onReturn(detail.id)}>
              {t('asset.btnBorrowReturn')}
            </Button>
          </Space>
        </div>
      )}
    </Spin>
  )
}
