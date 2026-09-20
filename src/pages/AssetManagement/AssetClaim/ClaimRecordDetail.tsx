/**
 * 领用及签收凭证详情页
 *
 * 模块拆分（自上而下）：资产信息 / 领用信息 / 签收信息与凭证 / 归还信息（仅已归还资产展示）。
 * 样式基准：采购订单详情（PurchaseOrder/OrderDetail.tsx）——
 * DetailPageHeader + 无边框模块卡片 + Descriptions column=4 非 bordered + 最后更新 footer。
 */
import { useEffect, useState } from 'react'
import { Alert, Button, Descriptions, Empty, Modal, Spin, Space, Tag, message } from 'antd'
import { FileProtectOutlined, FileTextOutlined, StopOutlined, RollbackOutlined, NotificationOutlined, AppstoreOutlined, InboxOutlined } from '@ant-design/icons'
import DetailPageHeader from '../../../components/DetailPageHeader'
import BrandTag from '../../../components/BrandTag'
import AssetParameters from '../../../components/AssetParameters'
import { useTranslation } from 'react-i18next'
import { ClaimStatusTag, SignatureStatusTag, canSignClaim } from './ClaimRecordTable'
import { CLAIM_STATUS, SIGNATURE_STATUS, type ClaimRow } from './claimViewTypes'
import { fetchReturnByClaim, type ReturnRow } from '../../../api/eamReturn'
import { fetchAssetDetail, type AssetItem } from '../../../api/asset'

/** 详情卡片统一样式（无边框，对齐采购订单详情） */
const detailCardStyle: React.CSSProperties = {
  borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16,
  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
}

const RETURN_CONDITION_LABEL: Record<string, string> = { normal: '正常', damaged: '損壞', lost: '遺失' }
const RETURN_CONDITION_COLOR: Record<string, string> = { normal: 'success', damaged: 'warning', lost: 'error' }

/** 模块标题行（28×28 图标色块 + 标题 + 右侧延伸分隔线） */
function SectionTitle({ icon, iconBg, title }: { icon: React.ReactNode; iconBg: string; title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
      <div style={{ width: 28, height: 28, borderRadius: 6, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {icon}
      </div>
      <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{title}</span>
      <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
    </div>
  )
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
  onGoReturn?: (claimId: number) => void
  onResendSignNotify?: (claimId: number) => Promise<void>
}

export default function ClaimRecordDetail({ record, loading, error, onBack, onSign, onViewEvidence, onDownloadEvidence, onCancel, onGoReturn, onResendSignNotify }: Props) {
  const { t } = useTranslation()
  const [returnRec, setReturnRec] = useState<ReturnRow | null>(null)
  const [asset, setAsset] = useState<AssetItem | null>(null)

  const claimId = record?.id
  const assetId = record?.assetId
  const isReturned = record?.status === CLAIM_STATUS.RETURNED

  /** 加载资产台账：资产信息模块「购买时价值」+ 归还信息模块归位字段 */
  useEffect(() => {
    if (assetId == null || error) { setAsset(null); return }
    let alive = true
    fetchAssetDetail(assetId).then(a => { if (alive) setAsset(a) }).catch(() => { if (alive) setAsset(null) })
    return () => { alive = false }
  }, [assetId, error])

  /** 已归还场景：加载归还记录，供「归还信息」模块展示 */
  useEffect(() => {
    if (!isReturned || claimId == null || error) { setReturnRec(null); return }
    let alive = true
    fetchReturnByClaim(claimId).then(r => { if (alive) setReturnRec(r) }).catch(() => { if (alive) setReturnRec(null) })
    return () => { alive = false }
  }, [isReturned, claimId, error])

  /** 存放仓库：仓库名（城市区县详细地址） */
  const locationText = (() => {
    if (!asset) return '—'
    const addr = [asset.province, asset.city, asset.district, asset.address].filter(Boolean).join('')
    return (asset.location || '—') + (addr ? `（${addr}）` : '')
  })()

  /** 构建 extra 按钮 */
  const buildExtra = () => {
    if (!record || error) return undefined
    const btns: React.ReactNode[] = []
    if (onCancel && !record.sourceTransferId && record.status !== CLAIM_STATUS.TRANSFERRED
      && record.status !== CLAIM_STATUS.RETURNED && record.status !== CLAIM_STATUS.CANCELLED
      && record.status !== CLAIM_STATUS.CLAIMED
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
    if (onGoReturn && record.status === CLAIM_STATUS.CLAIMED) {
      btns.push(
        <Button key="return" type="primary" icon={<RollbackOutlined />} onClick={() => onGoReturn(record.id)}>归还资产</Button>
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
      {/* ====== 模块 1：资产信息 ====== */}
      <div style={detailCardStyle}>
        <SectionTitle icon={<InboxOutlined style={{ fontSize: 14, color: '#1890ff' }} />} iconBg="#e6f7ff" title="资产信息" />
        {record && !error ? (
          <Descriptions column={4} size="middle">
            <Descriptions.Item label="领用编号"><span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{record.claimNo}</span></Descriptions.Item>
            <Descriptions.Item label="资产编号">{record.assetNo}</Descriptions.Item>
            <Descriptions.Item label="资产名称">{record.assetName}</Descriptions.Item>
            <Descriptions.Item label="所屬品牌">{record.companyBrand ? <BrandTag value={record.companyBrand} /> : '—'}</Descriptions.Item>
            <Descriptions.Item label="资产品牌">{record.brand || '—'}</Descriptions.Item>
            <Descriptions.Item label="资产分类">{record.assetType || '—'}</Descriptions.Item>
            <Descriptions.Item label="购买时价值">{asset?.purchaseValue != null ? `MOP ${asset.purchaseValue.toLocaleString()}` : '—'}</Descriptions.Item>
            <Descriptions.Item label="管理部门">{record.adminDepartment || asset?.adminDepartment || '—'}</Descriptions.Item>
          </Descriptions>
        ) : <Empty description="资产信息尚未加载" />}
        {record && !error && <AssetParameters asset={record} current />}
        {/* 领用配件快照 */}
        {record?.accessories && record.accessories.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <AppstoreOutlined style={{ fontSize: 13, color: '#FA8C16' }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: '#595959' }}>领用配件</span>
              <Tag color="orange" style={{ fontSize: 11 }}>{record.accessories.length} 项</Tag>
              <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {record.accessories.map((acc, idx) => (
                <Tag key={idx} color="orange" style={{ fontSize: 13, padding: '4px 12px', borderRadius: 4 }}>
                  {acc.name} × {acc.qty}
                </Tag>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ====== 模块 2：领用信息 ====== */}
      <div style={detailCardStyle}>
        <SectionTitle icon={<FileTextOutlined style={{ fontSize: 14, color: '#1890ff' }} />} iconBg="#e6f7ff" title="领用信息" />
        {record && !error ? (
          <Descriptions column={4} size="middle">
            <Descriptions.Item label="领用人">{record.empName}（{record.empNo}）</Descriptions.Item>
            <Descriptions.Item label="领用时部门">{record.department}</Descriptions.Item>
            <Descriptions.Item label="领用日期">{record.claimDate}</Descriptions.Item>
            <Descriptions.Item label="实际登记时间">{record.createdAt || '—'}</Descriptions.Item>
            <Descriptions.Item label="登记操作人">{record.operator}</Descriptions.Item>
            <Descriptions.Item label="领用状态"><ClaimStatusTag status={record.status} /></Descriptions.Item>
            <Descriptions.Item label="领用用途" span={2}>{record.claimReason || '—'}</Descriptions.Item>
            <Descriptions.Item label="备注" span={4}>{record.remark || '—'}</Descriptions.Item>
            {record.proxyReason && <Descriptions.Item label="代办原因" span={4}>{record.proxyReason}</Descriptions.Item>}
            {record.cancelledReason && <Descriptions.Item label="取消原因" span={4}>{record.cancelledReason}</Descriptions.Item>}
          </Descriptions>
        ) : <Empty description="领用信息尚未加载" />}
      </div>

      {/* ====== 模块 3：签收信息与凭证 ====== */}
      <div style={detailCardStyle}>
        <SectionTitle icon={<FileProtectOutlined style={{ fontSize: 14, color: '#fa8c16' }} />} iconBg="#fff7e6" title="签收信息与凭证" />
        {record && !error ? (
          <Descriptions column={4} size="middle">
            <Descriptions.Item label="签收状态"><SignatureStatusTag status={record.signatureStatus} /></Descriptions.Item>
            <Descriptions.Item label="实际签署时间">{record.signedAt || '—'}</Descriptions.Item>
          </Descriptions>
        ) : <Empty description="签收信息尚未加载" />}
        {record?.signatureStatus === SIGNATURE_STATUS.PROXY_PENDING && <Alert type="warning" showIcon className="claim-notice"
          message={record.status === CLAIM_STATUS.RETURNED
            ? `此资产已于 ${record.returnDate ?? '—'} 归还，签收状态仍为「代办未签」，已无法补签。`
            : '管理员代办未签，不能视为员工本人已确认。'}
          description={record.status === CLAIM_STATUS.RETURNED
            ? '资产已归还，补签流程不再适用，当前签署状态保持不变，仅供内部记录。'
            : '补签只确认历史领用事实，不重新分配资产，也不影响之后的新领用。'}
          style={{ marginBottom: 16 }} />}
        <p className="claim-muted" style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 16 }}>仅作为内部签收凭证，不承诺 CA 认证、可信时间戳或特定司法效力。凭证仅允许受控查看和下载。</p>
        <Space>
          <Button disabled={!record || !!error || record.signatureStatus !== SIGNATURE_STATUS.SIGNED || !onViewEvidence} onClick={onViewEvidence}>查看签收凭证</Button>
          <Button disabled={!record || !!error || record.signatureStatus !== SIGNATURE_STATUS.SIGNED || !onDownloadEvidence} onClick={onDownloadEvidence}>下载凭证包</Button>
          {record && !error && onSign && canSignClaim(record) && <Button type="primary" onClick={onSign}>{record.signatureStatus === SIGNATURE_STATUS.PROXY_PENDING ? '补签历史领用' : '前往本人签署'}</Button>}
          {record && !error && onResendSignNotify && record.status !== CLAIM_STATUS.RETURNED && (
            <Button icon={<NotificationOutlined />} onClick={() => {
              const isSigned = record.signatureStatus === SIGNATURE_STATUS.SIGNED
              Modal.confirm({
                title: '重新推送签署通知？',
                className: 'custom-confirm-modal',
                icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
                content: (
                  <div className="confirm-info-card">
                    <div className="confirm-info-row"><span>领用编号：</span><b>{record.claimNo}</b></div>
                    <div className="confirm-info-row"><span>领用人：</span><b>{record.empName}（{record.empNo}）</b></div>
                    <div className="confirm-info-row"><span>资产：</span><b>{record.assetNo} / {record.assetName}</b></div>
                    <div style={{ marginTop: 8, fontSize: 12, color: isSigned ? '#FA8C16' : '#8C8C8C' }}>
                      {isSigned
                        ? '当前已签署，重新推送后签收状态将回退为「待本人签署」，原签名凭证将被删除，需员工重新签字提交。'
                        : '将向领用人重新发送钉钉签署通知，无论当前是否已签署。'}
                    </div>
                  </div>
                ),
                okText: '确认推送',
                cancelText: '取消',
                onOk: async () => {
                  try {
                    await onResendSignNotify(record.id)
                    message.success('签署通知已重新推送')
                  } catch {
                    /* API 层已处理错误提示 */
                  }
                },
              })
            }}>重新推送签署通知</Button>
          )}
        </Space>
      </div>

      {/* ====== 模块 4：归还信息（仅已归还资产展示） ====== */}
      {isReturned && record && !error && (
        <div style={detailCardStyle}>
          <SectionTitle icon={<RollbackOutlined style={{ fontSize: 14, color: '#52c41a' }} />} iconBg="#f6ffed" title="归还信息" />
          <Descriptions column={4} size="middle">
            <Descriptions.Item label="员工归还日期">{record.returnDate || '—'}</Descriptions.Item>
            <Descriptions.Item label="实际归还人">
              {(() => {
                const name = returnRec?.actualReturneeName || returnRec?.empName || record.empName || '—'
                const no = returnRec?.actualReturneeNo
                return no ? `${name}（${no}）` : name
              })()}
            </Descriptions.Item>
            <Descriptions.Item label="归还接收人">
              {(() => {
                const name = returnRec?.operatorName || '—'
                const no = returnRec?.operatorNo
                return no ? `${name}（${no}）` : name
              })()}
            </Descriptions.Item>
            <Descriptions.Item label="资产验收">
              {returnRec?.assetCondition
                ? <Tag color={RETURN_CONDITION_COLOR[returnRec.assetCondition]}>{RETURN_CONDITION_LABEL[returnRec.assetCondition] ?? returnRec.assetCondition}</Tag>
                : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="接收部门">{asset?.department || '—'}</Descriptions.Item>
            <Descriptions.Item label="存放仓库" span={2}>{locationText}</Descriptions.Item>
            <Descriptions.Item label={returnRec?.assetCondition === 'normal' ? '归还说明' : '异常说明'} span={4}>
              {returnRec?.assetCondition === 'normal'
                ? (returnRec?.returnReason || '—')
                : (returnRec?.exceptionReason || '—')}
            </Descriptions.Item>
          </Descriptions>
        </div>
      )}
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
