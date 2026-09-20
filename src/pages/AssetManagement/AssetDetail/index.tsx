/**
 * 资产详情页（只读模式）
 *
 * 样式基准：采购订单详情（PurchaseOrder/OrderDetail.tsx）——
 * DetailPageHeader + 无边框模块卡片 + Descriptions column=4 非 bordered + 最后更新 footer。
 */
import { useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Tag, Image, Spin, Descriptions,
} from 'antd'
import { useTranslation } from 'react-i18next'
import {
  AppstoreOutlined, DollarOutlined,
  UserOutlined, InboxOutlined,
  ToolOutlined,
} from '@ant-design/icons'
import {
  fetchAssetDetail, fetchTransferAsset, parseAssetImages, type AssetStatus, type AssetItem,
} from '../../../api/asset'
import DetailPageHeader from '../../../components/DetailPageHeader'
import BrandTag from '../../../components/BrandTag'
import AssetTagBindingSection from '../AssetTag/AssetTagBindingSection'
import AssetParameters from '../../../components/AssetParameters'
import { useAuth } from '../../../contexts/AuthContext'
import { useTransferData } from '../AssetTransfer/useTransferData'
import { TransferError } from '../AssetTransfer/TransferLayout'
import { positiveId, resolveTransferFrom } from '../AssetTransfer/transferUtils'

const STATUS_META: Record<AssetStatus, { key: string; color: string }> = {
  idle:      { key: 'asset.statusIdle',     color: 'default' },
  in_use:    { key: 'asset.statusInUse',    color: 'success' },
  in_repair: { key: 'asset.statusInRepair', color: 'processing' },
  scrapped:  { key: 'asset.statusScrapped', color: 'error' },
}

const HOLD_META: Record<NonNullable<AssetItem['holdType']>, { key: string; color: string }> = {
  owned:    { key: 'asset.holdOwned',    color: 'geekblue' },
  borrowed: { key: 'asset.holdBorrowed', color: 'volcano' },
}

/** 详情卡片统一样式（无边框，对齐采购订单详情） */
const detailCardStyle: React.CSSProperties = {
  borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16,
  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
}

/** 仓库位置：后端已存储为「仓库名（城市区县详细地址）」格式 */
function formatWarehouseLocation(asset: AssetItem): string {
  return asset.location || '-'
}

/* ---- 模块标题栏 ---- */
function ModuleTitle({ icon, iconBg, title, tag }: { icon: React.ReactNode; iconBg: string; title: string; tag?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
      <div style={{ width: 28, height: 28, borderRadius: 6, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {icon}
      </div>
      <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{title}</span>
      {tag && <Tag color="blue" style={{ fontSize: 11 }}>{tag}</Tag>}
      <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
    </div>
  )
}

export default function AssetDetail() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const id = positiveId(searchParams.get('id'))
  const from = resolveTransferFrom(searchParams.get('from'), '/asset-list', '/asset-detail')
  const transferContext = searchParams.get('context') === 'transfer'
  const { hasPermission } = useAuth()
  const fetcher = useCallback(() => id ? (transferContext ? fetchTransferAsset(id) : fetchAssetDetail(id))
    : Promise.reject(new Error(t('transfer.invalidId'))), [id, transferContext, t])
  const { data: asset, loading, error, refresh } = useTransferData(fetcher)
  if (!asset) return <div className="content-area">
    <DetailPageHeader title={t('asset.detailTitle')} onBack={() => navigate(from)} />
    <TransferError error={error} retry={refresh} />
    {loading && <div style={{ minHeight: 400, display: 'grid', placeItems: 'center' }}><Spin /></div>}
  </div>

  const imageList = parseAssetImages(asset.images)
  const a = asset

  return (
    <div className="content-area">
      {/* ====== 详情页头部 ====== */}
      <DetailPageHeader
        title={t('asset.detailTitle')}
        tags={
          <Tag color={STATUS_META[asset.status]?.color} style={{
            fontSize: 12, padding: '2px 10px', borderRadius: 4,
            fontWeight: 500, margin: 0,
          }}>{t(STATUS_META[asset.status]?.key || 'transfer.unknown')}</Tag>
        }
        meta={<>{asset.assetNo} · {asset.assetName}</>}
        onBack={() => navigate(from)}
        onEdit={!transferContext && hasPermission('asset-list:edit') ? () => navigate(`/asset-add?id=${asset.id}`) : undefined}
        menuKey="asset-list"
      />

      {/* ====== 模块1：资产信息 ====== */}
      <div style={detailCardStyle}>
        <ModuleTitle
          icon={<AppstoreOutlined style={{ fontSize: 14, color: '#1890ff' }} />}
          iconBg="#e6f7ff"
          title={t('asset.assetInfoTitle')}
        />
        <Descriptions column={4} size="middle">
          <Descriptions.Item label={t('asset.colAssetNo')}><span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{asset.assetNo}</span></Descriptions.Item>
          <Descriptions.Item label={t('asset.colAssetType')}>{asset.assetType || '-'}</Descriptions.Item>
          <Descriptions.Item label={t('transfer.brand')}>{asset.brand || '-'}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colAssetName')}>{asset.assetName}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colCompanyBrand')}>{asset.companyBrand ? <BrandTag value={asset.companyBrand} /> : '-'}</Descriptions.Item>
        </Descriptions>

        {/* 参数信息 */}
        <AssetParameters asset={asset} />

        {/* 资产照片 */}
        {imageList.length > 0 && (
          <>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#595959', margin: '16px 0 8px' }}>{t('asset.assetPhotoSection')}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              {imageList.map((src, i) => (
                <Image
                  key={i} src={src} width={120} height={120}
                  style={{ objectFit: 'cover', borderRadius: 8, border: '1px solid #f0f0f0' }}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* ====== 模块2：租/购信息 ====== */}
      <div style={detailCardStyle}>
        <ModuleTitle
          icon={<DollarOutlined style={{ fontSize: 14, color: '#E8720C' }} />}
          iconBg="#fff7e6"
          title={t('asset.rentPurchaseInfo')}
        />
        <Descriptions column={4} size="middle">
          <Descriptions.Item label={t('asset.purchaseForm')}>
            <Tag color={asset.source === 'self' ? 'blue' : 'orange'}>
              {asset.source === 'self' ? t('asset.sourceSelf') : t('asset.sourceLease')}
            </Tag>
          </Descriptions.Item>
          {asset.source === 'self' ? (
            <>
              <Descriptions.Item label={t('asset.purchaseCompanyLabel')}>{asset.company || '-'}</Descriptions.Item>
              <Descriptions.Item label={t('asset.colPurchaseValue')}>
                <span style={{ fontWeight: 600, color: '#E8720C' }}>
                  {asset.purchaseValue ? `MOP ${asset.purchaseValue.toLocaleString()}` : '-'}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label={t('asset.colPurchaseDate')}>{asset.purchaseDate || '-'}</Descriptions.Item>
              <Descriptions.Item label={t('asset.warehouseLocationLabel')}>{formatWarehouseLocation(asset)}</Descriptions.Item>
              <Descriptions.Item label={t('asset.adminDeptLabel')}>{asset.adminDepartment || '-'}</Descriptions.Item>
            </>
          ) : (
            <>
              <Descriptions.Item label={t('asset.leaseCompanyLabel')}>{asset.company || '-'}</Descriptions.Item>
              <Descriptions.Item label={t('asset.leaseCompanyLabel2')}>{a.leaseCompany || '-'}</Descriptions.Item>
              <Descriptions.Item label={t('asset.rentalCostLabel')}>
                <span style={{ fontWeight: 600, color: '#E8720C' }}>
                  {a.rentalCost ? `MOP ${a.rentalCost.toLocaleString()}` : '-'}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label={t('asset.rentalPeriodLabel')}>
                {a.rentalPeriod && a.rentalPeriod[0]
                  ? `${a.rentalPeriod[0]} ~ ${a.rentalPeriod[1]}`
                  : '-'}
              </Descriptions.Item>
              <Descriptions.Item label={t('asset.warehouseLocationLabel')}>{formatWarehouseLocation(asset)}</Descriptions.Item>
              <Descriptions.Item label={t('asset.adminDeptLabel')}>{asset.adminDepartment || '-'}</Descriptions.Item>
            </>
          )}
        </Descriptions>
      </div>

      {/* ====== 模块3：当前使用人（闲置资产无使用人，不展示） ====== */}
      {asset.status !== 'idle' && (
        <div style={detailCardStyle}>
          <ModuleTitle
            icon={<UserOutlined style={{ fontSize: 14, color: '#13C2C2' }} />}
            iconBg="#E6FFFB"
            title={t('asset.currentUserTitle')}
          />
          <Descriptions column={4} size="middle">
            <Descriptions.Item label={t('asset.currentUserLabel')}>{asset.userName || '-'}</Descriptions.Item>
            <Descriptions.Item label={t('asset.colDepartment')}>{asset.department || '-'}</Descriptions.Item>
            <Descriptions.Item label={t('asset.colHoldType')}>{asset.holdType ? <Tag color={HOLD_META[asset.holdType]?.color}>{t(HOLD_META[asset.holdType]?.key)}</Tag> : '-'}</Descriptions.Item>
            <Descriptions.Item label={t('transfer.claimDate')}>{(transferContext ? asset.claimDate : asset.usageDate) || '—'}</Descriptions.Item>
          </Descriptions>
        </div>
      )}

      {/* ====== 模块3.5：配件清单 ====== */}
      {asset.accessories && asset.accessories.length > 0 && (
        <div style={detailCardStyle}>
          <ModuleTitle
            icon={<ToolOutlined style={{ fontSize: 14, color: '#FA8C16' }} />}
            iconBg="#FFF7E6"
            title={t('asset.accessoryListTitleDetail')}
            tag={t('asset.accessoryCount', { count: asset.accessories.length })}
          />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {asset.accessories.map((acc, idx) => (
              <Tag key={idx} color="orange" style={{ fontSize: 13, padding: '4px 12px', borderRadius: 4 }}>
                {acc.name} × {acc.qty}
              </Tag>
            ))}
          </div>
        </div>
      )}
      
      {/* ====== 模塊4：資產標籤（主標籤 + 次標籤，可綁定/解綁/列印） ====== */}
      {id !== undefined && !transferContext && hasPermission('asset-list:view') && <AssetTagBindingSection assetId={id} asset={asset} />}
      
      {/* ====== 模块5：入库信息 ====== */}
      <div style={detailCardStyle}>
        <ModuleTitle
          icon={<InboxOutlined style={{ fontSize: 14, color: '#722ED1' }} />}
          iconBg="#f9f0ff"
          title={t('asset.inboundInfoTitle')}
        />
        <Descriptions column={4} size="middle">
          <Descriptions.Item label={t('asset.inboundBatchNoLabel')}>{a.inboundBatchNo || '-'}</Descriptions.Item>
          <Descriptions.Item label={t('asset.inboundDateLabel')}>{a.inboundDate || '-'}</Descriptions.Item>
          <Descriptions.Item label={t('asset.inboundQtyLabel')}>{a.inboundQty ?? '-'}</Descriptions.Item>
          <Descriptions.Item label={t('asset.inspectorLabel')}>{a.inspector || '-'}</Descriptions.Item>
        </Descriptions>
      </div>

      {/* ====== 最後更新（詳情頁規範 footer） ====== */}
      <div style={{
        background: '#fafafa', borderRadius: 8, padding: '12px 24px',
        border: '1px solid #f0f0f0',
        display: 'flex', justifyContent: 'flex-end', gap: 24,
      }}>
        <span style={{ fontSize: 12, color: '#8C8C8C' }}>{t('asset.updatedByLabel')}<span style={{ color: '#595959' }}>{asset.applicant || '-'}</span></span>
        <span style={{ fontSize: 12, color: '#8C8C8C' }}>{t('asset.updatedAtLabel')}<span style={{ color: '#595959' }}>{asset.updatedAt || '-'}</span></span>
      </div>
    </div>
  )
}
