/**
 * 耗材分类详情页（只读）
 *
 * 样式基准：对齐资产分类详情页（AssetCategory/CategoryDetail.tsx）——
 * DetailPageHeader + 无边框模块卡片 + Descriptions column=4 非 bordered + 最后更新 footer。
 */
import { useState, useEffect, useCallback } from 'react'
import { Spin, Descriptions, Tag } from 'antd'
import { FolderOutlined } from '@ant-design/icons'
import DetailPageHeader from '../../../components/DetailPageHeader'
import { fetchConsumableCategories, type ConsumableCategory } from '../../../api/consumable'

interface Props {
  id: number
  onBack: () => void
  onEdit: (id: number) => void
}

export default function CategoryDetail({ id, onBack, onEdit }: Props) {
  const [loading, setLoading] = useState(true)
  const [category, setCategory] = useState<ConsumableCategory | null>(null)
  const [parentName, setParentName] = useState<string>('—')

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const list = await fetchConsumableCategories()
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
        <span style={{ color: '#8C8C8C' }}>該分類不存在</span>
      </div>
    )
  }

  return (
    <>
      {/* ====== 顶部标题栏（全局 DetailPageHeader） ====== */}
      <DetailPageHeader
        title={category.name}
        meta={<>{category.code} · 最後更新人: {category.updatedBy || '—'}</>}
        onBack={onBack}
        onEdit={() => onEdit(id)}
      />

      {/* ====== 基本信息（无边框卡片） ====== */}
      <div style={{ borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: '#E6F7FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FolderOutlined style={{ fontSize: 14, color: '#1890ff' }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>基本信息</span>
          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
        </div>
        <Descriptions column={4} size="middle">
          <Descriptions.Item label="分類編碼">
            <span style={{ fontFamily: 'monospace' }}>{category.code}</span>
          </Descriptions.Item>
          <Descriptions.Item label="分類名稱">{category.name}</Descriptions.Item>
          <Descriptions.Item label="上級分類">{parentName}</Descriptions.Item>
          <Descriptions.Item label="狀態">
            <Tag color={category.status === 'enabled' ? 'success' : 'default'}>
              {category.status === 'enabled' ? '啟用' : '停用'}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="備註" span={4}>{category.remark || '—'}</Descriptions.Item>
        </Descriptions>
      </div>

      {/* ====== 最后更新（详情页规范 footer） ====== */}
      <div style={{
        background: '#fafafa', borderRadius: 8, padding: '12px 24px',
        border: '1px solid #f0f0f0',
        display: 'flex', justifyContent: 'flex-end', gap: 24,
      }}>
        <span style={{ fontSize: 12, color: '#8C8C8C' }}>最後更新人：<span style={{ color: '#595959' }}>{category.updatedBy || '-'}</span></span>
        <span style={{ fontSize: 12, color: '#8C8C8C' }}>最後更新時間：<span style={{ color: '#595959' }}>{category.updatedAt || '-'}</span></span>
      </div>
    </>
  )
}
