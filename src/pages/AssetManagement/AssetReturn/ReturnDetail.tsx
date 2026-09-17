/**
 * 归还详情 — 接通真实后端 API
 *
 * 样式基准：采购订单详情（PurchaseOrder/OrderDetail.tsx）——
 * DetailPageHeader（紫色渐变顶条）+ 无边框模块卡片 + Descriptions column=4 非 bordered + 最后更新 footer。
 */
import { Alert, Button, Descriptions, Result, Space, Spin, Steps, Tag } from 'antd'
import { FileTextOutlined, ProfileOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import DetailPageHeader from '../../../components/DetailPageHeader'
import AssetParameters from '../../../components/AssetParameters'
import type { ReturnRow } from '../../../api/eamReturn'

const SOURCE_LABEL: Record<string, string> = { claim: '領用歸還', borrow: '借用歸還', historical: '歷史資產歸還' }
const STATUS_LABEL: Record<string, string> = { completed: '正常完成', exception_pending: '異常處理中', exception_closed: '異常已結束' }
const STATUS_COLOR: Record<string, string> = { completed: 'success', exception_pending: 'processing', exception_closed: 'default' }
const CONDITION_LABEL: Record<string, string> = { normal: '正常', damaged: '損壞', lost: '遺失' }
const CONDITION_COLOR: Record<string, string> = { normal: 'success', damaged: 'error', lost: 'warning' }
const DISPOSITION_LABEL: Record<string, string> = { idle: '已收回·可使用', scrapped: '已登記報廢', written_off: '遺失已核銷' }

/** 详情卡片统一样式（无边框，对齐采购订单详情） */
const detailCardStyle: React.CSSProperties = {
  borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16,
  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
}

/** 模块标题行 */
function SectionTitle({ icon, iconBg, title, tag }: { icon: React.ReactNode; iconBg: string; title: string; tag?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
      <div style={{ width: 28, height: 28, borderRadius: 6, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {icon}
      </div>
      <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{title}</span>
      {tag}
      <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
    </div>
  )
}

interface Props {
  record?: ReturnRow
  loading?: boolean
  error?: string
  canEdit?: boolean
  showResult?: boolean
  onBack: () => void
  onRefresh?: () => void
}

export default function ReturnDetail({ record, loading = false, error, canEdit = false, showResult = false, onBack, onRefresh: _onRefresh }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  if (loading && !record) {
    return <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
  }

  if (error) {
    return <Result status="error" title="加載失敗" subTitle={error} extra={<Button onClick={onBack}>返回列表</Button>} />
  }

  if (!record) {
    return <Result status="warning" title="記錄不存在" subTitle="該歸還記錄不存在或已失效。" extra={<Button onClick={onBack}>返回列表</Button>} />
  }

  const status = record.returnStatus
  const isException = record.assetCondition !== 'normal'
  const canDispose = canEdit && isException && !record.disposition
  const canRecover = canEdit && record.assetCondition === 'lost' && !record.recovered

  return <>
    {/* ====== 详情页头部 ====== */}
    <DetailPageHeader
      title={t('asset.returnDetailTitle', { defaultValue: '歸還詳情' })}
      tags={
        <Space>
          <Tag color={STATUS_COLOR[status]}>{STATUS_LABEL[status] || status}</Tag>
          <Tag color={CONDITION_COLOR[record.assetCondition]}>{CONDITION_LABEL[record.assetCondition] || record.assetCondition}</Tag>
        </Space>
      }
      meta={record.returnNo}
      onBack={onBack}
      extra={
        <Space>
          {canDispose && (
            <Button onClick={() => navigate(`/asset-return/dispose?id=${record.id}`)}
              style={{ borderRadius: 8, height: 36, padding: '0 16px' }}>
              登記處置結果
            </Button>
          )}
          {canRecover && (
            <Button onClick={() => navigate(`/asset-return/recover?id=${record.id}`)}
              style={{ borderRadius: 8, height: 36, padding: '0 16px' }}>
              登記遺失找回
            </Button>
          )}
          {record.compensationId && (
            <Button type="primary" onClick={() => navigate(`/asset-compensation/detail?id=${record.compensationId}`)}
              style={{ backgroundColor: '#E8720C', borderColor: '#E8720C', borderRadius: 8, height: 36, padding: '0 16px', boxShadow: '0 2px 6px rgba(232,114,12,0.25)' }}>
              查看關聯賠付單
            </Button>
          )}
        </Space>
      }
    />

    {showResult && <Alert className="claim-notice" showIcon type="success" message="歸還登記已完成，數據已保存。" style={{ marginBottom: 16 }} />}

    {/* ====== 歸還事實 ====== */}
    <div style={detailCardStyle}>
      <SectionTitle
        icon={<FileTextOutlined style={{ fontSize: 14, color: '#1890ff' }} />}
        iconBg="#e6f7ff"
        title="歸還事實"
      />
      <Descriptions column={4} size="middle">
        <Descriptions.Item label="歸還單號"><span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{record.returnNo}</span></Descriptions.Item>
        <Descriptions.Item label={t('asset.colAssetName')}>{record.assetName} <span style={{ color: '#8C8C8C', fontSize: 12 }}>({record.assetNo})</span></Descriptions.Item>
        <Descriptions.Item label="歸還來源">{SOURCE_LABEL[record.sourceType] || record.sourceType}</Descriptions.Item>
        <Descriptions.Item label="歸還日期">{record.returnDate}</Descriptions.Item>
        <Descriptions.Item label="原持有人">{record.empName}</Descriptions.Item>
        <Descriptions.Item label="實際歸還人">{record.actualReturneeName || record.empName}</Descriptions.Item>
        <Descriptions.Item label="操作人">{record.operatorName}</Descriptions.Item>
        <Descriptions.Item label="驗收狀況"><Tag color={CONDITION_COLOR[record.assetCondition]}>{CONDITION_LABEL[record.assetCondition] || record.assetCondition}</Tag></Descriptions.Item>
        <Descriptions.Item label="歸還說明" span={4}>{record.returnReason || '—'}</Descriptions.Item>
        {record.conditionNote && <Descriptions.Item label="狀況備註" span={4}>{record.conditionNote}</Descriptions.Item>}
        {record.exceptionReason && <Descriptions.Item label="異常原因" span={4}>{record.exceptionReason}</Descriptions.Item>}
      </Descriptions>
      <AssetParameters asset={record} current />
    </div>

    {/* ====== 處理進度 ====== */}
    <div style={detailCardStyle}>
      <SectionTitle
        icon={<ProfileOutlined style={{ fontSize: 14, color: '#fa8c16' }} />}
        iconBg="#fff7e6"
        title="處理進度"
      />
      <Steps size="small" current={status === 'exception_pending' ? 1 : 2}
        items={[{ title: '驗收登記' }, { title: '實物 / 責任處理' }, { title: '處理結束' }]} />
      {record.disposition && (
        <Descriptions column={4} size="small" style={{ marginTop: 16 }}>
          <Descriptions.Item label="處置結果">{DISPOSITION_LABEL[record.disposition] || record.disposition}</Descriptions.Item>
          <Descriptions.Item label="處置日期">{record.dispositionDate || '—'}</Descriptions.Item>
        </Descriptions>
      )}
      {record.recovered === 1 && (
        <Descriptions column={4} size="small" style={{ marginTop: 16 }}>
          <Descriptions.Item label="找回日期">{record.recoveredDate || '—'}</Descriptions.Item>
          <Descriptions.Item label="找回說明">{record.recoveredNote || '—'}</Descriptions.Item>
        </Descriptions>
      )}
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
