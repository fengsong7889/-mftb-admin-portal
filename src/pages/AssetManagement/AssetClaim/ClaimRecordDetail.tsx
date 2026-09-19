/**
 * 领用及签收凭证详情页
 *
 * 样式基准：采购订单详情（PurchaseOrder/OrderDetail.tsx）——
 * DetailPageHeader + 无边框模块卡片 + Descriptions column=4 非 bordered + 最后更新 footer。
 */
import { Alert, Button, Descriptions, Empty, Modal, Spin, Space } from 'antd'
import { FileProtectOutlined, FileTextOutlined, StopOutlined, RollbackOutlined } from '@ant-design/icons'
import DetailPageHeader from '../../../components/DetailPageHeader'
import BrandTag from '../../../components/BrandTag'
import AssetParameters from '../../../components/AssetParameters'
import { useTranslation } from 'react-i18next'
import { ClaimStatusTag, SignatureStatusTag, canSignClaim } from './ClaimRecordTable'
import { CLAIM_STATUS, SIGNATURE_STATUS, type ClaimRow } from './claimViewTypes'

/** 详情卡片统一样式（无边框，对齐采购订单详情） */
const detailCardStyle: React.CSSProperties = {
  borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16,
  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
}

interface Props {
  record?: ClaimRow
  loading?: boolean
  error?: string
  onBack: () => void
  onSign?: () => void
  onViewEvidence?: () => void
  onDownloadEvidence?: () => void
  onCancel?: (claimId: number, reason: string) => Promise<void>
  onReturn?: (claimId: number, returnDate: string, returnReason?: string, conditionNote?: string) => Promise<void>
}

export default function ClaimRecordDetail({ record, loading, error, onBack, onSign, onViewEvidence, onDownloadEvidence, onCancel, onReturn }: Props) {
  const { t } = useTranslation()

  /** 构建 extra 按钮 */
  const buildExtra = () => {
    if (!record || error) return undefined
    const btns: React.ReactNode[] = []
    if (onCancel && !record.sourceTransferId && record.status !== CLAIM_STATUS.TRANSFERRED
      && record.status !== CLAIM_STATUS.RETURNED && record.status !== CLAIM_STATUS.CANCELLED
      && record.signatureStatus !== SIGNATURE_STATUS.SIGNED) {
      btns.push(
        <Button key="cancel" danger icon={<StopOutlined />} onClick={() => {
          Modal.confirm({
            title: '确认取消领用？',
            content: '取消后领用记录将标记为已取消，代办生效的资产将释放为闲置。',
            okText: '确认取消',
            cancelText: '返回',
            okButtonProps: { danger: true },
            onOk: () => onCancel(record.id, '管理员手动取消'),
          })
        }}>取消领用</Button>
      )
    }
    if (onReturn && record.status === CLAIM_STATUS.CLAIMED) {
      btns.push(
        <Button key="return" type="primary" icon={<RollbackOutlined />} onClick={() => {
          Modal.confirm({
            title: '确认归还资产？',
            content: `确认将资产「${record.assetName}（${record.assetNo}）」归还？`,
            okText: '确认归还',
            cancelText: '返回',
            onOk: () => onReturn(record.id, new Date().toISOString().slice(0, 10), '正常归还'),
          })
        }}>归还资产</Button>
      )
    }
    return btns.length > 0 ? <Space>{btns}</Space> : undefined
  }

  return <>
    <DetailPageHeader
      title="领用及签收凭证详情"
      meta={record?.claimNo}
      onBack={onBack}
      extra={buildExtra()}
    />
    {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
    {record?.sourceTransferId && <Alert type="info" showIcon message={t('transfer.successor')}
      description={`${t('transfer.sourceTransfer')}: ${record.sourceTransferId} · ${t('transfer.previousClaim')}: ${record.previousClaimId || '—'}`} style={{ marginBottom: 16 }} />}
    <Spin spinning={loading}>
      {/* ====== 领用内容快照 ====== */}
      <div style={detailCardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: '#e6f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FileTextOutlined style={{ fontSize: 14, color: '#1890ff' }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>领用内容快照</span>
          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
        </div>
        {record && !error ? (
          <Descriptions column={4} size="middle">
            <Descriptions.Item label="领用编号"><span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{record.claimNo}</span></Descriptions.Item>
            <Descriptions.Item label="资产编号">{record.assetNo}</Descriptions.Item>
            <Descriptions.Item label="资产名称">{record.assetName}</Descriptions.Item>
            <Descriptions.Item label="所屬品牌">{record.companyBrand ? <BrandTag value={record.companyBrand} /> : '—'}</Descriptions.Item>
            <Descriptions.Item label="资产品牌">{record.brand || '—'}</Descriptions.Item>
            <Descriptions.Item label="资产分类">{record.assetType || '—'}</Descriptions.Item>
            <Descriptions.Item label="领用人">{record.empName}（{record.empNo}）</Descriptions.Item>
            <Descriptions.Item label="领用时部门">{record.department}</Descriptions.Item>
            <Descriptions.Item label="业务领用日期">{record.claimDate}</Descriptions.Item>
            <Descriptions.Item label="实际登记时间">{record.createdAt || '—'}</Descriptions.Item>
            <Descriptions.Item label="登记操作人">{record.operator}</Descriptions.Item>
            <Descriptions.Item label="领用状态"><ClaimStatusTag status={record.status} /></Descriptions.Item>
            <Descriptions.Item label="签收状态"><SignatureStatusTag status={record.signatureStatus} /></Descriptions.Item>
            <Descriptions.Item label="实际签署时间">{record.signedAt || '—'}</Descriptions.Item>
            <Descriptions.Item label="业务归还日期">{record.returnDate || '—'}</Descriptions.Item>
            <Descriptions.Item label="实际归还时间">{record.returnedAt || '—'}</Descriptions.Item>
            <Descriptions.Item label="领用用途" span={2}>{record.claimReason || '—'}</Descriptions.Item>
            <Descriptions.Item label="备注" span={2}>{record.remark || '—'}</Descriptions.Item>
            {record.proxyReason && <Descriptions.Item label="代办原因" span={4}>{record.proxyReason}</Descriptions.Item>}
            {record.cancelledReason && <Descriptions.Item label="取消原因" span={4}>{record.cancelledReason}</Descriptions.Item>}
          </Descriptions>
        ) : <Empty description="领用内容尚未加载" />}
        {record && !error && <AssetParameters asset={record} current />}
      </div>

      {/* ====== 签收凭证 ====== */}
      <div style={detailCardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: '#fff7e6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FileProtectOutlined style={{ fontSize: 14, color: '#fa8c16' }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>签收凭证</span>
          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
        </div>
        {record?.signatureStatus === SIGNATURE_STATUS.PROXY_PENDING && <Alert type="warning" showIcon className="claim-notice"
          message={record.status === CLAIM_STATUS.RETURNED ? `此资产已于 ${record.returnDate ?? '—'} 归还，尚未补签。` : '管理员代办未签，不能视为员工本人已确认。'}
          description="补签只确认历史领用事实，不重新分配资产，也不影响之后的新领用。"
          style={{ marginBottom: 16 }} />}
        <p className="claim-muted" style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 16 }}>仅作为内部签收凭证，不承诺 CA 认证、可信时间戳或特定司法效力。凭证仅允许受控查看和下载。</p>
        <Space>
          <Button disabled={!record || !!error || record.signatureStatus !== SIGNATURE_STATUS.SIGNED || !onViewEvidence} onClick={onViewEvidence}>查看签收凭证</Button>
          <Button disabled={!record || !!error || record.signatureStatus !== SIGNATURE_STATUS.SIGNED || !onDownloadEvidence} onClick={onDownloadEvidence}>下载凭证包</Button>
          {record && !error && onSign && canSignClaim(record) && <Button type="primary" onClick={onSign}>{record.signatureStatus === SIGNATURE_STATUS.PROXY_PENDING ? '补签历史领用' : '前往本人签署'}</Button>}
        </Space>
      </div>
    </Spin>

    {/* ====== 最後更新（詳情頁規範 footer） ====== */}
    <div style={{
      background: '#fafafa', borderRadius: 8, padding: '12px 24px',
      border: '1px solid #f0f0f0',
      display: 'flex', justifyContent: 'flex-end', gap: 24,
    }}>
      <span style={{ fontSize: 12, color: '#8C8C8C' }}>最後更新人：<span style={{ color: '#595959' }}>{record?.updatedBy || record?.operator || '-'}</span></span>
      <span style={{ fontSize: 12, color: '#8C8C8C' }}>最後更新時間：<span style={{ color: '#595959' }}>{record?.updatedAt || '-'}</span></span>
    </div>
  </>
}
