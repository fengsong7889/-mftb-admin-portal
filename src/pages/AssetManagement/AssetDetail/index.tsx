/**
 * 资产详情页（只读模式）
 *
 * 分模块卡片布局（风格同员工详情页）：
 *  - 顶部：DetailPageHeader（渐变顶条 + 编辑按钮）
 *  - 主体：独立白色卡片分模块展示
 *    1. 资产信息 — 编码/分类/品牌/名称/参数/照片
 *    2. 租/购信息 — 采购形式/公司/价值/日期/存放位置
 *    3. 当前使用人 — 使用人/部门/领用日期
 *    4. 入库信息 — 批次号/入库时间/数量/验收人
 *    5. 操作记录 — 最后更新人/最后更新时间
 */
import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Tag, Image, message, Spin,
} from 'antd'
import { useTranslation } from 'react-i18next'
import {
  AppstoreOutlined, DollarOutlined,
  UserOutlined, InboxOutlined, EditOutlined,
} from '@ant-design/icons'
import {
  fetchAssetDetail, parseAssetImages, type AssetItem, type AssetStatus,
} from '../../../api/asset'
import DetailPageHeader from '../../../components/DetailPageHeader'
import AssetTagBindingSection from '../AssetTag/AssetTagBindingSection'

const STATUS_META: Record<AssetStatus, { key: string; color: string }> = {
  idle:      { key: 'asset.statusIdle',     color: 'default' },
  in_use:    { key: 'asset.statusInUse',    color: 'success' },
  in_repair: { key: 'asset.statusInRepair', color: 'processing' },
  scrapped:  { key: 'asset.statusScrapped', color: 'error' },
}

/* ---- 字段展示单元 ---- */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline' }}>
      <span style={{ fontSize: 14, color: '#8C8C8C', flexShrink: 0, minWidth: 80 }}>{label}：</span>
      <span style={{ fontSize: 14, color: '#262626' }}>{children}</span>
    </div>
  )
}

/* ---- 模块标题栏（同员工详情风格） ---- */
function ModuleTitle({ icon, iconBg, title, tag }: { icon: React.ReactNode; iconBg: string; title: string; tag?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
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
  const id = searchParams.get('id') ? Number(searchParams.get('id')) : null

  const [loading, setLoading] = useState(false)
  const [asset, setAsset] = useState<AssetItem | null>(null)

  const loadData = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const a = await fetchAssetDetail(id)
      setAsset(a)
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : t('asset.queryFailed'))
    } finally {
      setLoading(false)
    }
  }, [id, t])

  useEffect(() => { loadData() }, [loadData])

  /* ----- 渲染状态 ----- */
  const renderStatus = (s: AssetStatus) => {
    const m = STATUS_META[s]
    return <Tag color={m.color}>{t(m.key)}</Tag>
  }

  if (loading || !asset) {
    return (
      <div className="content-area" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" tip={t('common.loading')} />
      </div>
    )
  }

  const imageList = parseAssetImages(asset.images)
  const params = asset.params || {}
  const paramEntries = Object.entries(params)
  const a = asset

  return (
    <div className="content-area">
      {/* ====== 详情页头部 ====== */}
      <DetailPageHeader
        title={t('asset.detailTitle')}
        tags={
          <Tag color={STATUS_META[asset.status].color} style={{
            fontSize: 12, padding: '2px 10px', borderRadius: 4,
            fontWeight: 500, margin: 0,
          }}>{t(STATUS_META[asset.status].key)}</Tag>
        }
        meta={<>{asset.assetNo} · {asset.assetName}</>}
        onBack={() => navigate('/asset-list')}
        onEdit={() => navigate(`/asset-add?id=${asset.id}`)}
        menuKey="asset-list"
      />

      {/* ====== 模块1：资产信息 ====== */}
      <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '16px 20px', marginBottom: 16 }}>
        <ModuleTitle
          icon={<AppstoreOutlined style={{ fontSize: 14, color: '#1890ff' }} />}
          iconBg="#e6f7ff"
          title={t('asset.assetInfoTitle')}
        />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', rowGap: 16, columnGap: 24 }}>
          <Field label={t('asset.colAssetNo')}>
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{asset.assetNo}</span>
          </Field>
          <Field label={t('asset.colAssetType')}>{asset.assetType || '-'}</Field>
          <Field label={t('asset.colBrand')}>{asset.brand || '-'}</Field>
          <Field label={t('asset.colAssetName')}>{asset.assetName}</Field>
        </div>

        {/* 参数信息 */}
        {paramEntries.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#595959', marginBottom: 8 }}>{t('asset.paramInfoTitle')}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', rowGap: 12, columnGap: 24 }}>
              {paramEntries.map(([key, val]) => (
                <Field key={key} label={key}>{val || '-'}</Field>
              ))}
            </div>
          </div>
        )}

        {/* 资产照片 */}
        {imageList.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#595959', marginBottom: 8 }}>{t('asset.assetPhotoSection')}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              {imageList.map((src, i) => (
                <Image
                  key={i} src={src} width={120} height={120}
                  style={{ objectFit: 'cover', borderRadius: 8, border: '1px solid #f0f0f0' }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ====== 模块2：租/购信息 ====== */}
      <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '16px 20px', marginBottom: 16 }}>
        <ModuleTitle
          icon={<DollarOutlined style={{ fontSize: 14, color: '#E8720C' }} />}
          iconBg="#fff7e6"
          title={t('asset.rentPurchaseInfo')}
        />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', rowGap: 16, columnGap: 24 }}>
          <Field label={t('asset.purchaseForm')}>
            <Tag color={asset.source === 'self' ? 'blue' : 'orange'}>
              {asset.source === 'self' ? t('asset.sourceSelf') : t('asset.sourceLease')}
            </Tag>
          </Field>
          {asset.source === 'self' && (
            <>
              <Field label={t('asset.colCompany')}>{asset.company || '-'}</Field>
              <Field label={t('asset.colPurchaseValue')}>
                <span style={{ fontWeight: 600, color: '#E8720C' }}>
                  {asset.purchaseValue ? `MOP ${asset.purchaseValue.toLocaleString()}` : '-'}
                </span>
              </Field>
              <Field label={t('asset.colPurchaseDate')}>{asset.purchaseDate || '-'}</Field>
            </>
          )}
          {asset.source === 'lease' && (
            <>
              <Field label={t('asset.leaseCompanyLabel')}>{asset.company || '-'}</Field>
              <Field label={t('asset.leaseCompanyLabel2')}>{a.leaseCompany || '-'}</Field>
              <Field label={t('asset.rentalCostLabel')}>
                <span style={{ fontWeight: 600, color: '#E8720C' }}>
                  {a.rentalCost ? `MOP ${a.rentalCost.toLocaleString()}` : '-'}
                </span>
              </Field>
              <Field label={t('asset.rentalPeriodLabel')}>
                {a.rentalPeriod && a.rentalPeriod[0]
                  ? `${a.rentalPeriod[0]} ~ ${a.rentalPeriod[1]}`
                  : '-'}
              </Field>
            </>
          )}
          <Field label={t('asset.colLocation')}>{asset.location || '-'}</Field>
        </div>
      </div>

      {/* ====== 模块3：当前使用人 ====== */}
      <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '16px 20px', marginBottom: 16 }}>
        <ModuleTitle
          icon={<UserOutlined style={{ fontSize: 14, color: '#13C2C2' }} />}
          iconBg="#E6FFFB"
          title={t('asset.currentUserTitle')}
        />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', rowGap: 16, columnGap: 24 }}>
          <Field label={t('asset.currentUserLabel')}>{asset.userName || '-'}</Field>
          <Field label={t('asset.colDepartment')}>{asset.department || '-'}</Field>
          <Field label={t('asset.colClaimDate')}>{asset.usageDate || '-'}</Field>
        </div>
      </div>
      
      {/* ====== 模塊4：資產標籤（主標籤 + 次標籤，可綁定/解綁/列印） ====== */}
      {id !== null && <AssetTagBindingSection assetId={id} asset={asset} />}
      
      {/* ====== 模块5：入库信息 ====== */}
      <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '16px 20px', marginBottom: 16 }}>
        <ModuleTitle
          icon={<InboxOutlined style={{ fontSize: 14, color: '#722ED1' }} />}
          iconBg="#f9f0ff"
          title={t('asset.inboundInfo')}
        />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', rowGap: 16, columnGap: 24 }}>
          <Field label={t('asset.inboundBatchNoLabel')}>{a.inboundBatchNo || '-'}</Field>
          <Field label={t('asset.inboundDateLabel')}>{a.inboundDate || '-'}</Field>
          <Field label={t('asset.inboundQtyLabel')}>{a.inboundQty ?? '-'}</Field>
          <Field label={t('asset.inspectorLabel')}>{a.inspector || '-'}</Field>
        </div>
      </div>

      {/* ====== 模块6：操作记录 ====== */}
      <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '16px 20px', marginBottom: 16 }}>
        <ModuleTitle
          icon={<EditOutlined style={{ fontSize: 14, color: '#595959' }} />}
          iconBg="#f5f5f5"
          title={t('asset.operationRecord')}
        />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', rowGap: 16, columnGap: 24 }}>
          <Field label={t('asset.colUpdatedBy')}>{asset.applicant || '-'}</Field>
          <Field label={t('asset.colUpdatedAt')}>{asset.updatedAt || '-'}</Field>
        </div>
      </div>
    </div>
  )
}
