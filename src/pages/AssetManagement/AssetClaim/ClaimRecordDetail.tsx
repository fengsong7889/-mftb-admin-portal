/**
 * 領用及簽收憑證詳情頁
 *
 * 模塊拆分（自上而下）：資產信息 / 領用信息 / 簽收信息與憑證 / 歸還信息（僅已歸還資產展示）。
 * 樣式基準：採購訂單詳情（PurchaseOrder/OrderDetail.tsx）——
 * DetailPageHeader + 無邊框模塊卡片 + Descriptions column=4 非 bordered + 最後更新 footer。
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

/** 詳情卡片統一樣式（無邊框，對齊採購訂單詳情） */
const detailCardStyle: React.CSSProperties = {
  borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16,
  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
}

const RETURN_CONDITION_LABEL: Record<string, string> = { normal: '正常', damaged: '損壞', lost: '遺失' }
const RETURN_CONDITION_COLOR: Record<string, string> = { normal: 'success', damaged: 'warning', lost: 'error' }
const DISPOSITION_LABEL: Record<string, string> = { idle: '收回閒置（可再次使用）', apply_repair: '申請維修（進入維修管理）', scrapped: '登記報廢', written_off: '遺失核銷' }

/** 模塊標題行（28×28 圖標色塊 + 標題 + 右側延伸分隔線） */
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

  /** 加載資產台賬：資產信息模塊「購買時價值」+ 歸還信息模塊歸位字段 */
  useEffect(() => {
    if (assetId == null || error) { setAsset(null); return }
    let alive = true
    fetchAssetDetail(assetId).then(a => { if (alive) setAsset(a) }).catch(() => { if (alive) setAsset(null) })
    return () => { alive = false }
  }, [assetId, error])

  /** 已歸還場景：加載歸還記錄，供「歸還信息」模塊展示 */
  useEffect(() => {
    if (!isReturned || claimId == null || error) { setReturnRec(null); return }
    let alive = true
    fetchReturnByClaim(claimId).then(r => { if (alive) setReturnRec(r) }).catch(() => { if (alive) setReturnRec(null) })
    return () => { alive = false }
  }, [isReturned, claimId, error])

  /** 存放倉庫：倉庫名（城市區縣詳細地址） */
  const locationText = (() => {
    if (!asset) return '—'
    return asset.location || '—'
  })()

  /** 構建 extra 按鈕 */
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
            title: '確認取消領用？',
            content: '取消後領用記錄將標記為已取消，代辦生效的資產將釋放為閒置。',
            okText: '確認取消',
            cancelText: '返回',
            okButtonProps: { danger: true },
            onOk: () => onCancel(record.id, '管理員手動取消'),
          })
        }}>取消領用</Button>
      )
    }
    if (onGoReturn && record.status === CLAIM_STATUS.CLAIMED) {
      btns.push(
        <Button key="return" type="primary" icon={<RollbackOutlined />} onClick={() => onGoReturn(record.id)}>歸還資產</Button>
      )
    }
    return btns.length > 0 ? <Space>{btns}</Space> : undefined
  }

  return <>
    <DetailPageHeader
      title="領用及簽收憑證詳情"
      meta={record?.claimNo}
      onBack={onBack}
      extra={buildExtra()}
    />
    {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
    {record?.sourceTransferId && <Alert type="info" showIcon message={t('transfer.successor')}
      description={`${t('transfer.sourceTransfer')}: ${record.sourceTransferId} · ${t('transfer.previousClaim')}: ${record.previousClaimId || '—'}`} style={{ marginBottom: 16 }} />}
    <Spin spinning={loading}>
      {/* ====== 模塊 1：資產信息 ====== */}
      <div style={detailCardStyle}>
        <SectionTitle icon={<InboxOutlined style={{ fontSize: 14, color: '#1890ff' }} />} iconBg="#e6f7ff" title="資產信息" />
        {record && !error ? (
          <Descriptions column={4} size="middle">
            <Descriptions.Item label="領用編號"><span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{record.claimNo}</span></Descriptions.Item>
            <Descriptions.Item label="資產編號">{record.assetNo}</Descriptions.Item>
            <Descriptions.Item label="資產名稱">{record.assetName}</Descriptions.Item>
            <Descriptions.Item label="所屬品牌">{record.companyBrand ? <BrandTag value={record.companyBrand} /> : '—'}</Descriptions.Item>
            <Descriptions.Item label="資產品牌">{record.brand || '—'}</Descriptions.Item>
            <Descriptions.Item label="資產分類">{record.assetType || '—'}</Descriptions.Item>
            <Descriptions.Item label="購買時價值">{asset?.purchaseValue != null ? `MOP ${asset.purchaseValue.toLocaleString()}` : '—'}</Descriptions.Item>
            <Descriptions.Item label="管理部門">{record.adminDepartment || asset?.adminDepartment || '—'}</Descriptions.Item>
          </Descriptions>
        ) : <Empty description="資產信息尚未加載" />}
        {record && !error && <AssetParameters asset={record} current />}
        {/* 领用配件快照 */}
        {record?.accessories && record.accessories.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <AppstoreOutlined style={{ fontSize: 13, color: '#FA8C16' }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: '#595959' }}>領用配件</span>
              <Tag color="orange" style={{ fontSize: 11 }}>{record.accessories.length} 項</Tag>
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

      {/* ====== 模塊 2：領用信息 ====== */}
      <div style={detailCardStyle}>
        <SectionTitle icon={<FileTextOutlined style={{ fontSize: 14, color: '#1890ff' }} />} iconBg="#e6f7ff" title="領用信息" />
        {record && !error ? (
          <Descriptions column={4} size="middle">
            <Descriptions.Item label="領用人">{record.empName}（{record.empNo}）</Descriptions.Item>
            <Descriptions.Item label="領用時部門">{record.department}</Descriptions.Item>
            <Descriptions.Item label="領用日期">{record.claimDate}</Descriptions.Item>
            <Descriptions.Item label="實際登記時間">{record.createdAt || '—'}</Descriptions.Item>
            <Descriptions.Item label="登記操作人">{record.operator}</Descriptions.Item>
            <Descriptions.Item label="領用狀態"><ClaimStatusTag status={record.status} /></Descriptions.Item>
            <Descriptions.Item label="領用途徑" span={2}>{record.claimReason || '—'}</Descriptions.Item>
            <Descriptions.Item label="備註" span={4}>{record.remark || '—'}</Descriptions.Item>
            {record.proxyReason && <Descriptions.Item label="代辦原因" span={4}>{record.proxyReason}</Descriptions.Item>}
            {record.cancelledReason && <Descriptions.Item label="取消原因" span={4}>{record.cancelledReason}</Descriptions.Item>}
          </Descriptions>
        ) : <Empty description="領用信息尚未加載" />}
      </div>

      {/* ====== 模塊 3：簽收信息與憑證 ====== */}
      <div style={detailCardStyle}>
        <SectionTitle icon={<FileProtectOutlined style={{ fontSize: 14, color: '#fa8c16' }} />} iconBg="#fff7e6" title="簽收信息與憑證" />
        {record && !error ? (
          <Descriptions column={4} size="middle">
            <Descriptions.Item label="簽收狀態"><SignatureStatusTag status={record.signatureStatus} /></Descriptions.Item>
            <Descriptions.Item label="實際簽署時間">{record.signedAt || '—'}</Descriptions.Item>
          </Descriptions>
        ) : <Empty description="簽收信息尚未加載" />}
        {record?.signatureStatus === SIGNATURE_STATUS.PROXY_PENDING && <Alert type="warning" showIcon className="claim-notice"
          message={record.status === CLAIM_STATUS.RETURNED
            ? `此資產已於 ${record.returnDate ?? '—'} 歸還，簽收狀態仍為「代辦未簽」，已無法補簽。`
            : '管理員代辦未簽，不能視為員工本人已確認。'}
          description={record.status === CLAIM_STATUS.RETURNED
            ? '資產已歸還，補簽流程不再適用，當前簽署狀態保持不變，僅供內部記錄。'
            : '補簽只確認歷史領用事實，不重新分配資產，也不影響之後的新領用。'}
          style={{ marginBottom: 16 }} />}
        <p className="claim-muted" style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 16 }}>僅作為內部簽收憑證，不承諾 CA 認證、可信時間戳或特定司法效力。憑證僅允許受控查看和下載。</p>
        <Space>
          <Button disabled={!record || !!error || record.signatureStatus !== SIGNATURE_STATUS.SIGNED || !onViewEvidence} onClick={onViewEvidence}>查看簽收憑證</Button>
          <Button disabled={!record || !!error || record.signatureStatus !== SIGNATURE_STATUS.SIGNED || !onDownloadEvidence} onClick={onDownloadEvidence}>下載憑證包</Button>
          {record && !error && onSign && canSignClaim(record) && <Button type="primary" onClick={onSign}>{record.signatureStatus === SIGNATURE_STATUS.PROXY_PENDING ? '補簽歷史領用' : '前往本人簽署'}</Button>}
          {record && !error && onResendSignNotify && record.status !== CLAIM_STATUS.RETURNED && (
            <Button icon={<NotificationOutlined />} onClick={() => {
              const isSigned = record.signatureStatus === SIGNATURE_STATUS.SIGNED
              Modal.confirm({
                title: '重新推送簽署通知？',
                className: 'custom-confirm-modal',
                icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
                content: (
                  <div className="confirm-info-card">
                    <div className="confirm-info-row"><span>領用編號：</span><b>{record.claimNo}</b></div>
                    <div className="confirm-info-row"><span>領用人：</span><b>{record.empName}（{record.empNo}）</b></div>
                    <div className="confirm-info-row"><span>資產：</span><b>{record.assetNo} / {record.assetName}</b></div>
                    <div style={{ marginTop: 8, fontSize: 12, color: isSigned ? '#FA8C16' : '#8C8C8C' }}>
                      {isSigned
                        ? '當前已簽署，重新推送後簽收狀態將回退為「待本人簽署」，原簽名憑證將被刪除，需員工重新簽字提交。'
                        : '將向領用人重新發送釘釘簽署通知，無論當前是否已簽署。'}
                    </div>
                  </div>
                ),
                okText: '確認推送',
                cancelText: '取消',
                onOk: async () => {
                  try {
                    await onResendSignNotify(record.id)
                    message.success('簽署通知已重新推送')
                  } catch {
                    /* API 層已處理錯誤提示 */
                  }
                },
              })
            }}>重新推送簽署通知</Button>
          )}
        </Space>
      </div>

      {/* ====== 模塊 4：歸還信息（僅已歸還資產展示） ====== */}
      {isReturned && record && !error && (
        <div style={detailCardStyle}>
          <SectionTitle icon={<RollbackOutlined style={{ fontSize: 14, color: '#52c41a' }} />} iconBg="#f6ffed" title="歸還信息" />
          <Descriptions column={4} size="middle">
            <Descriptions.Item label="員工歸還日期">{record.returnDate || '—'}</Descriptions.Item>
            <Descriptions.Item label="實際歸還人">
              {(() => {
                const rawName = returnRec?.actualReturneeName || returnRec?.empName || record.empName || '—'
                const no = returnRec?.actualReturneeNo
                // actualReturneeName 可能已含工号（如「冯松（MF00002）」），避免重复拼接
                if (no && rawName.includes(no)) return rawName
                return no ? `${rawName}（${no}）` : rawName
              })()}
            </Descriptions.Item>
            <Descriptions.Item label="歸還接收人">
              {(() => {
                const name = returnRec?.operatorName || '—'
                const no = returnRec?.operatorNo
                return no ? `${name}（${no}）` : name
              })()}
            </Descriptions.Item>
            <Descriptions.Item label="資產驗收">
              {returnRec?.assetCondition
                ? <Tag color={RETURN_CONDITION_COLOR[returnRec.assetCondition]}>{RETURN_CONDITION_LABEL[returnRec.assetCondition] ?? returnRec.assetCondition}</Tag>
                : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="處理結果">
              {returnRec?.disposition
                ? <Tag color="processing">{DISPOSITION_LABEL[returnRec.disposition] || returnRec.disposition}</Tag>
                : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="接收部門">{asset?.department || '—'}</Descriptions.Item>
            <Descriptions.Item label="存放倉庫" span={2}>{locationText}</Descriptions.Item>
            <Descriptions.Item label={returnRec?.assetCondition === 'normal' ? '歸還說明' : '異常說明'} span={4}>
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
