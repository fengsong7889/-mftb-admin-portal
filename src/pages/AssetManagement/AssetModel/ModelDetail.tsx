/**
 * 品牌型號 詳情頁（只讀模式）
 *
 * - 使用全局 DetailPageHeader 組件（紫色漸變頂條 + 橙色返回 + 藍色標題）
 * - 基本信息卡片 + 參數模板卡片（定價頁卡片樣式）
 * - 無底部操作欄（詳情頁全局規範）
 */
import { useState, useEffect, useMemo } from 'react'
import {
  Descriptions, Tag, Spin, Alert,
} from 'antd'
import { FolderOutlined, SettingOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import {
  fetchModelDetail, fetchCategoryList,
  type AssetModel, type AssetCategory, type ParamField,
} from '../../../api/eam'
import DetailPageHeader from '../../../components/DetailPageHeader'

interface Props {
  id: number
  onBack: () => void
  onEdit: (id: number) => void
}

/* ── 卡片統一樣式（對齊定價頁規範） ── */
const cardStyle: React.CSSProperties = {
  border: '1px solid #e8eaed', borderRadius: 8, background: '#fff',
  padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
}

export default function ModelDetail({ id, onBack, onEdit }: Props) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [model, setModel] = useState<AssetModel | null>(null)
  const [categories, setCategories] = useState<AssetCategory[]>([])

  useEffect(() => {
    let alive = true
    setLoading(true)
    Promise.all([fetchModelDetail(id), fetchCategoryList()])
      .then(([m, cats]) => {
        if (!alive) return
        setModel(m)
        setCategories(cats)
      })
      .catch(() => undefined)
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [id])

  const categoryName = (code: string) => categories.find((c) => c.code === code)?.name || code

  const paramTemplate: ParamField[] = useMemo(() => {
    if (!model) return []
    const cur = categories.find((c) => c.code === model.categoryCode)
    if (!cur) return []
    const parent = categories.find((c) => c.id === cur.parentId)
    const inherited = parent?.paramTemplate?.filter((p) => !cur.paramTemplate.some((x) => x.key === p.key)) || []
    return [...cur.paramTemplate, ...inherited]
  }, [categories, model])

  if (loading || !model) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" tip="載入中..." />
      </div>
    )
  }

  return (
    <>
      {/* ====== 頂部標題欄（全局 DetailPageHeader） ====== */}
      <DetailPageHeader
        title="型號詳情"
        meta={<>{model.modelNo} · {model.name}</>}
        onBack={onBack}
        onEdit={() => onEdit(id)}
      />

      {/* ====== 基本信息卡片 ====== */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: '#e6f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FolderOutlined style={{ fontSize: 14, color: '#1890ff' }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>基本信息</span>
          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
        </div>
        <Descriptions column={3} size="middle" bordered>
          <Descriptions.Item label={t('asset.colCategoryCode')}>
            <Tag color="blue">{categoryName(model.categoryCode)}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label={t('asset.colBrand')}>{model.brand}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colModelNo')}>
            <span style={{ fontFamily: 'monospace' }}>{model.modelNo}</span>
          </Descriptions.Item>
          <Descriptions.Item label={t('asset.colModelName')}>{model.name}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colRefPrice')}>
            {model.refPrice ? `MOP ${model.refPrice.toLocaleString()}` : '-'}
          </Descriptions.Item>
          <Descriptions.Item label={t('asset.colUnit')}>{model.unit}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colSupplier')} span={2}>
            {model.supplier || '-'}
          </Descriptions.Item>
          <Descriptions.Item label={t('asset.colCreatedAt')}>{model.createdAt}</Descriptions.Item>
          <Descriptions.Item label={t('asset.searchUpdatedBy')}>{model.updatedBy || '-'}</Descriptions.Item>
          <Descriptions.Item label={t('asset.searchUpdatedAt')}>{model.updatedAt || '-'}</Descriptions.Item>
        </Descriptions>
      </div>

      {/* ====== 參數模板卡片 ====== */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: '#fff7e6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <SettingOutlined style={{ fontSize: 14, color: '#E8720C' }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('asset.sectionParams')}</span>
          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
        </div>
        {paramTemplate.length ? (
          <Descriptions column={3} size="middle" bordered>
            {paramTemplate.map((p) => (
              <Descriptions.Item key={p.key} label={p.unit ? `${p.label}(${p.unit})` : p.label}>
                {model.params?.[p.key] || '-'}
              </Descriptions.Item>
            ))}
          </Descriptions>
        ) : (
          <Alert type="info" showIcon message="該分類暫無參數模板" />
        )}
      </div>
    </>
  )
}
