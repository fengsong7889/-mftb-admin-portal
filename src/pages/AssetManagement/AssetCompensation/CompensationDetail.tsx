/**
 * 赔付详情 — 接通真实后端 API
 *
 * 样式基准：采购订单详情（PurchaseOrder/OrderDetail.tsx）——
 * DetailPageHeader + 无边框模块卡片 + Descriptions column=4 非 bordered + 最后更新 footer。
 */
import { Alert, Button, Descriptions, Empty, Result, Space, Spin, Table, Tabs, Tag } from 'antd'
import type { TableColumnsType } from 'antd'
import { FileTextOutlined, ProfileOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import DetailPageHeader from '../../../components/DetailPageHeader'
import AssetParameters from '../../../components/AssetParameters'
import type { CompensationRow } from '../../../api/eamCompensation'

/* ----- 状态元数据 ----- */
const DAMAGE_LABEL: Record<string, string> = { damage: '損壞', loss: '遺失' }
const CAUSE_LABEL: Record<string, string> = { human: '人為', natural: '自然', third_party: '第三方', quality: '質量' }
const PARTY_LABEL: Record<string, string> = { employee: '員工', department: '部門', company: '公司', none: '未定' }
const STATUS_LABEL: Record<string, string> = {
  pending: '待定責', confirmed: '已定責', partially_paid: '部分收款',
  paid: '已結清', waived: '已免賠', refund_pending: '待退款',
}
const STATUS_COLOR: Record<string, string> = {
  pending: 'default', confirmed: 'processing', partially_paid: 'processing',
  paid: 'success', waived: 'default', refund_pending: 'error',
}

function formatMoney(cents: number): string {
  return `MOP ${(cents / 100).toFixed(2)}`
}

/** 详情卡片统一样式（无边框，对齐采购订单详情） */
const detailCardStyle: React.CSSProperties = {
  borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16,
  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
}

interface Props {
  record?: CompensationRow
  loading?: boolean
  error?: string
  canEdit?: boolean
  onBack: () => void
  onRefresh?: () => void
}

export default function CompensationDetail({ record, loading = false, error, canEdit = false, onBack, onRefresh: _onRefresh }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  if (loading && !record) return <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
  if (error) return <Result status="error" title="加載失敗" subTitle={error} extra={<Button onClick={onBack}>返回列表</Button>} />
  if (!record) return <Result status="warning" title="記錄不存在" extra={<Button onClick={onBack}>返回列表</Button>} />

  const pending = record.status === 'pending' && !record.reviewRequired
  const confirmed = ['confirmed', 'partially_paid', 'paid'].includes(record.status) && !record.reviewRequired
  const refund = record.status === 'refund_pending'

  /** 构建 extra 按钮 */
  const buildExtra = () => {
    if (!canEdit) return undefined
    const btns: React.ReactNode[] = []
    if (pending) {
      btns.push(<Button key="liability" onClick={() => navigate(`/asset-compensation/liability?id=${record.id}`)}>定責</Button>)
      btns.push(<Button key="waive" onClick={() => navigate(`/asset-compensation/waive?id=${record.id}`)}>免賠</Button>)
    }
    if (confirmed) {
      btns.push(<Button key="payment" onClick={() => navigate(`/asset-compensation/payment?id=${record.id}`)}>收款</Button>)
    }
    if (refund) {
      btns.push(<Button key="refund" onClick={() => navigate(`/asset-compensation/refund?id=${record.id}`)}>登記退款</Button>)
    }
    if (record.reviewRequired > 0) {
      btns.push(
        <Button key="review" type="primary" onClick={() => navigate(`/asset-compensation/review?id=${record.id}`)}
          style={{ backgroundColor: '#E8720C', borderColor: '#E8720C', borderRadius: 8, height: 36, padding: '0 16px', boxShadow: '0 2px 6px rgba(232,114,12,0.25)' }}>
          找回復核
        </Button>
      )
    }
    return btns.length > 0 ? <Space>{btns}</Space> : undefined
  }

  const paymentColumns: TableColumnsType = [
    { key: 'type', title: '類型', dataIndex: 'type', width: 100, render: (v: string) => <Tag color={v === 'payment' ? 'success' : 'error'}>{v === 'payment' ? '收款' : '退款'}</Tag> },
    { key: 'amount', title: '金額', dataIndex: 'amount', width: 130, align: 'right', render: (v: number) => formatMoney(v) },
    { key: 'date', title: '業務日期', dataIndex: 'paymentDate', width: 120 },
    { key: 'reason', title: '說明', dataIndex: 'reason' },
    { key: 'operator', title: '操作人', dataIndex: 'operatorName', width: 130 },
  ]

  const reviewColumns: TableColumnsType = [
    { key: 'date', title: '複核日期', dataIndex: 'reviewDate', width: 120 },
    { key: 'before', title: '原應賠', dataIndex: 'beforeAmount', width: 130, align: 'right', render: (v: number) => formatMoney(v) },
    { key: 'after', title: '複核後應賠', dataIndex: 'afterAmount', width: 130, align: 'right', render: (v: number) => formatMoney(v) },
    { key: 'reason', title: '調整理由', dataIndex: 'reason' },
    { key: 'operator', title: '操作人', dataIndex: 'operatorName', width: 130 },
  ]

  return <>
    {/* ====== 详情页头部 ====== */}
    <DetailPageHeader
      title={t('asset.compensationDetailTitle', { defaultValue: '賠付詳情' })}
      tags={
        record.reviewRequired > 0
          ? <Tag color="warning">待找回復核</Tag>
          : <Tag color={STATUS_COLOR[record.status] || 'default'}>{STATUS_LABEL[record.status] || record.status}</Tag>
      }
      meta={record.compNo}
      onBack={onBack}
      extra={buildExtra()}
    />

    {record.reviewRequired > 0 && <Alert className="claim-notice" type="warning" showIcon message="待找回復核"
      description="資產已找回，原賠付記錄保留，需人工複核金額並決定是否退款。" style={{ marginBottom: 16 }} />}
    {refund && <Alert className="claim-notice" type="error" showIcon message="待退款" description="已收金額超過複核後應賠金額，需登記退款沖減。" style={{ marginBottom: 16 }} />}

    {/* ====== 赔付基本信息 ====== */}
    <div style={detailCardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <div style={{ width: 28, height: 28, borderRadius: 6, background: '#fff7e6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <FileTextOutlined style={{ fontSize: 14, color: '#fa8c16' }} />
        </div>
        <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>賠付基本信息</span>
        <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
      </div>
      <Descriptions column={4} size="middle">
        <Descriptions.Item label="賠付單號"><span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{record.compNo}</span></Descriptions.Item>
        <Descriptions.Item label={t('asset.colAssetName')}>{record.assetName} <span style={{ color: '#8C8C8C', fontSize: 12 }}>({record.assetNo})</span></Descriptions.Item>
        <Descriptions.Item label="原持有人">{record.holderName}</Descriptions.Item>
        <Descriptions.Item label="損失類型"><Tag color={record.damageType === 'loss' ? 'error' : 'warning'}>{DAMAGE_LABEL[record.damageType] || record.damageType}</Tag></Descriptions.Item>
        <Descriptions.Item label="關聯歸還單">
          {record.returnId ? <Button type="link" style={{ padding: 0 }} onClick={() => navigate(`/asset-return/detail?id=${record.returnId}`)}>查看</Button> : '—'}
        </Descriptions.Item>
        <Descriptions.Item label="責任對象">{record.party ? <Tag>{PARTY_LABEL[record.party] || record.party}</Tag> : '待定'}</Descriptions.Item>
        <Descriptions.Item label="責任人">{record.responsibleName || '待定'}</Descriptions.Item>
        <Descriptions.Item label="責任部門">{record.department || '待定'}</Descriptions.Item>
        <Descriptions.Item label="原因">{record.cause ? CAUSE_LABEL[record.cause] : '待定'}</Descriptions.Item>
        <Descriptions.Item label="定責依據" span={3}>{record.basis || '待定'}</Descriptions.Item>
        <Descriptions.Item label="應賠金額">{record.status === 'pending' ? '待定' : formatMoney(record.amount)}</Descriptions.Item>
        <Descriptions.Item label="淨收款">{formatMoney(record.netPaid)}</Descriptions.Item>
        <Descriptions.Item label="異常說明" span={2}>{record.reason || record.waiveReason || '—'}</Descriptions.Item>
      </Descriptions>
      <AssetParameters asset={record} current />
    </div>

    {/* ====== 收款/退款 & 找回复核记录 ====== */}
    <div style={detailCardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <div style={{ width: 28, height: 28, borderRadius: 6, background: '#f6ffed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ProfileOutlined style={{ fontSize: 14, color: '#52c41a' }} />
        </div>
        <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>記錄明細</span>
        <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
      </div>
      <Tabs items={[
        {
          key: 'payments', label: '收款 / 退款記錄',
          children: record.payments?.length ? <Table rowKey="id" size="small" pagination={false}
            dataSource={record.payments} columns={paymentColumns} /> : <Empty description="暫無收款 / 退款記錄" />,
        },
        {
          key: 'reviews', label: '找回復核記錄',
          children: record.reviews?.length ? <Table rowKey="id" size="small" pagination={false}
            dataSource={record.reviews} columns={reviewColumns} /> : <Empty description="暫無複核記錄" />,
        },
      ]} />
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
