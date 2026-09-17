/**
 * 借用详情 — 接通真实后端 API
 *
 * 样式基准：采购订单详情（PurchaseOrder/OrderDetail.tsx）——
 * DetailPageHeader + 无边框模块卡片 + Descriptions column=4 非 bordered + 最后更新 footer。
 */
import { Alert, Button, Descriptions, Result, Space, Spin, Tag } from 'antd'
import { FileTextOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import DetailPageHeader from '../../../components/DetailPageHeader'
import type { BorrowRow } from '../../../api/eamBorrow'

const STATUS_LABEL: Record<string, string> = { active: '借用中', overdue: '已逾期', returned: '已归还', cancelled: '已取消' }
const STATUS_COLOR: Record<string, string> = { active: 'processing', overdue: 'error', returned: 'success', cancelled: 'default' }

/** 详情卡片统一样式（无边框，对齐采购订单详情） */
const detailCardStyle: React.CSSProperties = {
  borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16,
  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
}

interface Props {
  record?: BorrowRow
  loading?: boolean
  error?: string
  canEdit?: boolean
  canReturn?: boolean
  onBack: () => void
  onRefresh?: () => void
}

export default function BorrowDetail({ record, loading = false, error, canEdit = false, canReturn = false, onBack, onRefresh: _onRefresh }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  if (loading && !record) return <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
  if (error) return <Result status="error" title="加載失敗" subTitle={error} extra={<Button onClick={onBack}>返回列表</Button>} />
  if (!record) return <Result status="warning" title="記錄不存在" extra={<Button onClick={onBack}>返回列表</Button>} />

  const overdueDays = record.status === 'overdue' ? (record.overdueDays ?? dayjs().diff(record.dueDate, 'day')) : 0

  return <>
    {/* ====== 详情页头部 ====== */}
    <DetailPageHeader
      title={t('asset.borrowDetailTitle', { defaultValue: '借用詳情' })}
      tags={<Tag color={STATUS_COLOR[record.status]}>{STATUS_LABEL[record.status] || record.status}</Tag>}
      meta={record.borrowNo}
      onBack={onBack}
      extra={
        record.status !== 'returned' && record.status !== 'cancelled' ? (
          <Space>
            {canEdit && (
              <Button onClick={() => navigate(`/asset-borrow/renew?id=${record.id}`)}
                style={{ borderRadius: 8, height: 36, padding: '0 16px' }}>
                續借
              </Button>
            )}
            {canReturn && (
              <Button type="primary" onClick={() => navigate(`/asset-return/add?borrowId=${record.id}`)}
                style={{ backgroundColor: '#E8720C', borderColor: '#E8720C', borderRadius: 8, height: 36, padding: '0 16px', boxShadow: '0 2px 6px rgba(232,114,12,0.25)' }}>
                歸還
              </Button>
            )}
          </Space>
        ) : undefined
      }
    />

    {record.status === 'overdue' && <Alert className="claim-notice" type="error" showIcon message={`已逾期 ${overdueDays} 天，請盡快歸還或續借`} style={{ marginBottom: 16 }} />}
    {record.returnId && <Alert className="claim-notice" type="success" showIcon message="已歸還"
      description={<Button type="link" style={{ padding: 0 }} onClick={() => navigate(`/asset-return/detail?id=${record.returnId}`)}>查看歸還單</Button>}
      style={{ marginBottom: 16 }} />}

    {/* ====== 借用信息 ====== */}
    <div style={detailCardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <div style={{ width: 28, height: 28, borderRadius: 6, background: '#e6f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <FileTextOutlined style={{ fontSize: 14, color: '#1890ff' }} />
        </div>
        <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>借用信息</span>
        <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
      </div>
      <Descriptions column={4} size="middle">
        <Descriptions.Item label="借用單號"><span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{record.borrowNo}</span></Descriptions.Item>
        <Descriptions.Item label={t('asset.colAssetName')}>{record.assetName} <span style={{ color: '#8C8C8C', fontSize: 12 }}>({record.assetNo})</span></Descriptions.Item>
        <Descriptions.Item label="借用人">{record.holderName}</Descriptions.Item>
        <Descriptions.Item label="借用部門">{record.department}</Descriptions.Item>
        <Descriptions.Item label="借出日期">{record.startDate}</Descriptions.Item>
        <Descriptions.Item label="到期日期">
          <span style={{ color: record.status === 'overdue' ? '#FF4D4F' : undefined, fontWeight: record.status === 'overdue' ? 600 : 400 }}>{record.dueDate}</span>
        </Descriptions.Item>
        <Descriptions.Item label="逾期天数">{overdueDays > 0 ? overdueDays : '—'}</Descriptions.Item>
        <Descriptions.Item label="續借次數">{record.renewCount}</Descriptions.Item>
        <Descriptions.Item label="借用用途" span={2}>{record.purpose || '—'}</Descriptions.Item>
        <Descriptions.Item label="狀態"><Tag color={STATUS_COLOR[record.status]}>{STATUS_LABEL[record.status] || record.status}</Tag></Descriptions.Item>
        <Descriptions.Item label="操作人">{record.operatorName}</Descriptions.Item>
      </Descriptions>
    </div>

    {/* ====== 最後更新（詳情頁規範 footer） ====== */}
    <div style={{
      background: '#fafafa', borderRadius: 8, padding: '12px 24px',
      border: '1px solid #f0f0f0',
      display: 'flex', justifyContent: 'flex-end', gap: 24,
    }}>
      <span style={{ fontSize: 12, color: '#8C8C8C' }}>最後更新人：<span style={{ color: '#595959' }}>{record.operatorName || '-'}</span></span>
      <span style={{ fontSize: 12, color: '#8C8C8C' }}>最後更新時間：<span style={{ color: '#595959' }}>{record.updatedAt || '-'}</span></span>
    </div>
  </>
}
