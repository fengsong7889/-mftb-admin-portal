/**
 * 資產分類詳情頁（只讀）
 *
 * - 使用 DetailPageHeader 組件（紫色漸變頂條 + 橙色返回 + 藍色標題 + 右側編輯按鈕）
 * - 卡片式佈局：基本信息
 * - 分類僅做層級歸類，參數配置由「品牌型號庫」負責
 */
import { useState, useEffect, useCallback } from 'react'
import { Spin, Descriptions } from 'antd'
import { FolderOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import DetailPageHeader from '../../../components/DetailPageHeader'
import { fetchCategoryList, type AssetCategory } from '../../../api/eam'

interface Props {
  id: number
  onBack: () => void
  onEdit: (id: number) => void
}

export default function CategoryDetail({ id, onBack, onEdit }: Props) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [category, setCategory] = useState<AssetCategory | null>(null)
  const [parentName, setParentName] = useState<string>('—')

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const list = await fetchCategoryList()
      const cur = list.find((c) => c.id === id)
      if (cur) {
        setCategory(cur)
        if (cur.parentId && cur.parentId !== 0) {
          const parent = list.find((c) => c.id === cur.parentId)
          if (parent) setParentName(`${parent.name}（${parent.code}）`)
        } else {
          setParentName('—（頂級分類）')
        }
      }
    } catch {
      setCategory(null)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { loadData() }, [loadData])

  /* ── 樣式 ── */
  const cardStyle: React.CSSProperties = {
    border: '1px solid #e8eaed', borderRadius: 8, background: '#fff',
    padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
  }

  const cardTitle = (icon: React.ReactNode, iconBg: string, title: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
      <div style={{ width: 28, height: 28, borderRadius: 6, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {icon}
      </div>
      <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{title}</span>
      <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
    </div>
  )

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" />
      </div>
    )
  }

  if (!category) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <span style={{ color: '#8C8C8C' }}>{t('asset.categoryNotFound', '該分類不存在')}</span>
      </div>
    )
  }

  return (
    <>
      {/* ====== 頂部標題欄（全局 DetailPageHeader） ====== */}
      <DetailPageHeader
        title={category.name}
        meta={<>{category.code} · {t('asset.colUpdatedBy')}: {category.updatedBy || '—'}</>}
        onBack={onBack}
        onEdit={() => onEdit(id)}
      />

      {/* ====== 基本信息 ====== */}
      <div style={cardStyle}>
        {cardTitle(
          <FolderOutlined style={{ fontSize: 14, color: '#1890ff' }} />,
          '#E6F7FF',
          t('asset.sectionBasic'),
        )}
        <Descriptions column={3} size="middle" bordered>
          <Descriptions.Item label={t('asset.colCode')}>
            <span style={{ fontFamily: 'monospace' }}>{category.code}</span>
          </Descriptions.Item>
          <Descriptions.Item label={t('asset.colName')}>{category.name}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colParent')}>{parentName}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colSort')}>{category.sort}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colUpdatedBy')}>{category.updatedBy || '—'}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colUpdatedAt')}>{category.updatedAt || '—'}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colRemark')} span={3}>{category.remark || '—'}</Descriptions.Item>
        </Descriptions>
      </div>
    </>
  )
}
