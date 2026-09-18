/**
 * 耗材品牌详情页（只读）
 *
 * 样式基准：对齐资产分类详情页 ——
 * DetailPageHeader + 无边框模块卡片 + Descriptions column=4 非 bordered + 最后更新 footer。
 */
import { useState, useEffect, useCallback } from 'react'
import { Spin, Descriptions, Tag } from 'antd'
import { TagOutlined } from '@ant-design/icons'
import DetailPageHeader from '../../../components/DetailPageHeader'
import { fetchConsumableBrandDetail, type ConsumableBrand } from '../../../api/consumable'

const CATEGORY_TYPE_COLOR: Record<string, string> = { CONSUMABLE: 'blue', BOTH: 'purple', ASSET: 'default' }
const CATEGORY_TYPE_LABEL: Record<string, string> = { CONSUMABLE: '僅耗材', BOTH: '資產+耗材', ASSET: '僅資產' }

interface Props {
  id: number
  onBack: () => void
  onEdit: (id: number) => void
}

export default function BrandDetail({ id, onBack, onEdit }: Props) {
  const [loading, setLoading] = useState(true)
  const [brand, setBrand] = useState<ConsumableBrand | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchConsumableBrandDetail(id)
      setBrand(data)
    } catch {
      setBrand(null)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { loadData() }, [loadData])

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" />
      </div>
    )
  }

  if (!brand) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <span style={{ color: '#8C8C8C' }}>該品牌不存在</span>
      </div>
    )
  }

  return (
    <>
      {/* ====== 顶部标题栏 ====== */}
      <DetailPageHeader
        title={brand.name}
        meta={<>{brand.code || '—'} · 最後更新人: {brand.updatedBy || '—'}</>}
        tags={
          <Tag color={CATEGORY_TYPE_COLOR[brand.categoryType]}>
            {CATEGORY_TYPE_LABEL[brand.categoryType] ?? brand.categoryType}
          </Tag>
        }
        onBack={onBack}
        onEdit={() => onEdit(id)}
      />

      {/* ====== 基本信息（无边框卡片） ====== */}
      <div style={{ borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: '#FFF7E6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <TagOutlined style={{ fontSize: 14, color: '#FA8C16' }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>基本信息</span>
          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
        </div>
        <Descriptions column={4} size="middle">
          <Descriptions.Item label="品牌編碼">
            <span style={{ fontFamily: 'monospace' }}>{brand.code || '—'}</span>
          </Descriptions.Item>
          <Descriptions.Item label="品牌名稱">{brand.name}</Descriptions.Item>
          <Descriptions.Item label="英文名">{brand.nameEn || '—'}</Descriptions.Item>
          <Descriptions.Item label="適用範圍">
            <Tag color={CATEGORY_TYPE_COLOR[brand.categoryType]}>
              {CATEGORY_TYPE_LABEL[brand.categoryType] ?? brand.categoryType}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="狀態">
            <Tag color={brand.status === 'enabled' ? 'success' : 'default'}>
              {brand.status === 'enabled' ? '啟用' : '停用'}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="備註" span={3}>{brand.remark || '—'}</Descriptions.Item>
        </Descriptions>
      </div>

      {/* ====== 最后更新（详情页规范 footer） ====== */}
      <div style={{
        background: '#fafafa', borderRadius: 8, padding: '12px 24px',
        border: '1px solid #f0f0f0',
        display: 'flex', justifyContent: 'flex-end', gap: 24,
      }}>
        <span style={{ fontSize: 12, color: '#8C8C8C' }}>最後更新人：<span style={{ color: '#595959' }}>{brand.updatedBy || '-'}</span></span>
        <span style={{ fontSize: 12, color: '#8C8C8C' }}>最後更新時間：<span style={{ color: '#595959' }}>{brand.updatedAt || '-'}</span></span>
      </div>
    </>
  )
}
