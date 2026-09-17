/**
 * 资产品牌/产品 详情页（只读模式）
 *
 * 样式基准：采购订单详情（PurchaseOrder/OrderDetail.tsx）——
 * DetailPageHeader + 无边框模块卡片 + Descriptions column=4 非 bordered + 最后更新 footer。
 */
import { useState, useEffect } from 'react'
import {
  Descriptions, Tag, Spin,
} from 'antd'
import { ShopOutlined, AppstoreOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import {
  fetchModelDetail, fetchCategoryList, fetchBrandList,
  type AssetModel, type AssetCategory, type AssetBrand,
} from '../../../api/eam'
import DetailPageHeader from '../../../components/DetailPageHeader'

interface Props {
  id: number
  type: 'brand' | 'product'
  onBack: () => void
  onEdit: (id: number) => void
}

export default function ModelDetail({ id, type, onBack, onEdit }: Props) {
  const { t } = useTranslation()
  const isBrand = type === 'brand'
  const [loading, setLoading] = useState(false)
  const [brand, setBrand] = useState<AssetBrand | null>(null)
  const [model, setModel] = useState<AssetModel | null>(null)
  const [categories, setCategories] = useState<AssetCategory[]>([])
  const [_brands, setBrands] = useState<AssetBrand[]>([])

  useEffect(() => {
    let alive = true
    setLoading(true)
    Promise.all([fetchCategoryList(), fetchBrandList()])
      .then(async ([cats, brs]) => {
        if (!alive) return
        setCategories(cats)
        setBrands(brs)
        if (isBrand) {
          const b = brs.find(x => x.id === id)
          if (alive) setBrand(b || null)
        } else {
          const m = await fetchModelDetail(id)
          if (alive) setModel(m)
        }
      })
      .catch(() => undefined)
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [id, isBrand])

  const categoryName = (code: string) => categories.find((c) => c.code === code)?.name || code

  if (loading || (isBrand && !brand) || (!isBrand && !model)) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" tip={t('asset.loadingText')} />
      </div>
    )
  }

  return (
    <>
      {/* ====== 顶部标题栏 ====== */}
      <DetailPageHeader
        title={isBrand ? t('asset.brandDetailTitle') : t('asset.productDetailTitle')}
        meta={<>{isBrand ? brand?.brandZh : model?.name}</>}
        onBack={onBack}
        onEdit={() => onEdit(id)}
      />

      {/* ====== 基本信息卡片（无边框） ====== */}
      <div style={{ borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: isBrand ? '#fff7e6' : '#e6f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {isBrand
              ? <ShopOutlined style={{ fontSize: 14, color: '#E8720C' }} />
              : <AppstoreOutlined style={{ fontSize: 14, color: '#1890ff' }} />
            }
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{isBrand ? t('asset.brandInfoTitle') : t('asset.productInfoTitle')}</span>
          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
        </div>
        {isBrand && brand ? (
          <Descriptions column={4} size="middle">
            <Descriptions.Item label={t('asset.belongCategory')}>
              <Tag color="blue">{categoryName(brand.categoryCode)}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label={t('asset.brandZhLabel')}>{brand.brandZh}</Descriptions.Item>
            <Descriptions.Item label={t('asset.brandEnLabel')}>{brand.brandEn}</Descriptions.Item>
            <Descriptions.Item label={t('asset.brandLogoLabel')}>
              {brand.brandLogo ? (
                <img src={brand.brandLogo} alt={brand.brandEn} style={{ width: 32, height: 32, objectFit: 'contain' }} />
              ) : '-'}
            </Descriptions.Item>
          </Descriptions>
        ) : model ? (
          <Descriptions column={4} size="middle">
            <Descriptions.Item label={t('asset.belongBrand')}>
              <Tag color="orange">{model.brandZh}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label={t('asset.belongCategory')}>
              <Tag color="blue">{categoryName(model.categoryCode)}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label={t('asset.productNameLabel')}>{model.name}</Descriptions.Item>
            <Descriptions.Item label={t('asset.colUnit')}>{model.unit}</Descriptions.Item>
          </Descriptions>
        ) : null}
      </div>

      {/* ====== 最後更新（詳情頁規範 footer） ====== */}
      <div style={{
        background: '#fafafa', borderRadius: 8, padding: '12px 24px',
        border: '1px solid #f0f0f0',
        display: 'flex', justifyContent: 'flex-end', gap: 24,
      }}>
        <span style={{ fontSize: 12, color: '#8C8C8C' }}>{t('asset.updatedByLabel')}<span style={{ color: '#595959' }}>{(isBrand ? brand?.updatedBy : model?.updatedBy) || '-'}</span></span>
        <span style={{ fontSize: 12, color: '#8C8C8C' }}>{t('asset.updatedAtLabel')}<span style={{ color: '#595959' }}>{(isBrand ? brand?.updatedAt : model?.updatedAt) || '-'}</span></span>
      </div>
    </>
  )
}
