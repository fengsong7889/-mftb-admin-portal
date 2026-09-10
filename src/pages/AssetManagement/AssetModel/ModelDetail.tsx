/**
 * 品牌/产品 详情页（只读模式）
 *
 * - type="brand"：品牌详情
 * - type="product"：产品详情（无参数，参数从参数库读取）
 * - 无底部操作栏（详情页全局规范）
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

/* ── 卡片统一样式 ── */
const cardStyle: React.CSSProperties = {
  border: '1px solid #e8eaed', borderRadius: 8, background: '#fff',
  padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
}

export default function ModelDetail({ id, type, onBack, onEdit }: Props) {
  const { t } = useTranslation()
  const isBrand = type === 'brand'
  const [loading, setLoading] = useState(false)
  const [brand, setBrand] = useState<AssetBrand | null>(null)
  const [model, setModel] = useState<AssetModel | null>(null)
  const [categories, setCategories] = useState<AssetCategory[]>([])
  const [brands, setBrands] = useState<AssetBrand[]>([])

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
        <Spin size="large" tip="载入中..." />
      </div>
    )
  }

  return (
    <>
      {/* ====== 顶部标题栏 ====== */}
      <DetailPageHeader
        title={isBrand ? '品牌详情' : '产品详情'}
        meta={<>{isBrand ? brand?.brandZh : model?.name}</>}
        onBack={onBack}
        onEdit={() => onEdit(id)}
      />

      {/* ====== 基本信息卡片 ====== */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: isBrand ? '#fff7e6' : '#e6f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {isBrand
              ? <ShopOutlined style={{ fontSize: 14, color: '#E8720C' }} />
              : <AppstoreOutlined style={{ fontSize: 14, color: '#1890ff' }} />
            }
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{isBrand ? '品牌信息' : '产品信息'}</span>
          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
        </div>
        {isBrand && brand ? (
          <Descriptions column={3} size="middle" bordered>
            <Descriptions.Item label="所属分类">
              <Tag color="blue">{categoryName(brand.categoryCode)}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="品牌（中文）">{brand.brandZh}</Descriptions.Item>
            <Descriptions.Item label="品牌（英文）">{brand.brandEn}</Descriptions.Item>
            <Descriptions.Item label="品牌LOGO">
              {brand.brandLogo ? (
                <img src={brand.brandLogo} alt={brand.brandEn} style={{ width: 32, height: 32, objectFit: 'contain' }} />
              ) : '-'}
            </Descriptions.Item>
            <Descriptions.Item label="最后更新人">{brand.updatedBy || '-'}</Descriptions.Item>
            <Descriptions.Item label="最后更新时间">{brand.updatedAt || '-'}</Descriptions.Item>
          </Descriptions>
        ) : model ? (
          <Descriptions column={3} size="middle" bordered>
            <Descriptions.Item label="所属品牌">
              <Tag color="orange">{model.brandZh}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="所属分类">
              <Tag color="blue">{categoryName(model.categoryCode)}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="产品名称">{model.name}</Descriptions.Item>
            <Descriptions.Item label="型号编码">{model.modelNo || '-'}</Descriptions.Item>
            <Descriptions.Item label={t('asset.colUnit')}>{model.unit}</Descriptions.Item>
            <Descriptions.Item label="参考单价">
              {model.refPrice != null ? `¥${model.refPrice}` : '-'}
            </Descriptions.Item>
            <Descriptions.Item label="供应商">{model.supplier || '-'}</Descriptions.Item>
            <Descriptions.Item label="最后更新人">{model.updatedBy || '-'}</Descriptions.Item>
            <Descriptions.Item label="最后更新时间">{model.updatedAt || '-'}</Descriptions.Item>
          </Descriptions>
        ) : null}
      </div>
    </>
  )
}
