/**
 * 仓库维护 詳情頁（只讀）
 *
 * - 使用 DetailPageHeader 組件（紫色漸變頂條 + 橙色返回 + 藍色標題 + 右側編輯按鈕）
 * - 卡片式佈局：基本信息
 */
import { useState, useEffect, useCallback } from 'react'
import { Spin, Descriptions, Tag } from 'antd'
import { HomeOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import DetailPageHeader from '../../../components/DetailPageHeader'
import { fetchLocationList, type AssetLocation } from '../../../api/eam'

interface Props {
  id: number
  onBack: () => void
  onEdit: (id: number) => void
}

const TYPE_META: Record<AssetLocation['type'], { label: string; color: string }> = {
  warehouse: { label: '倉庫', color: 'blue' },
  floor:     { label: '樓層', color: 'cyan' },
  room:      { label: '辦公室', color: 'green' },
}

export default function LocationDetail({ id, onBack, onEdit }: Props) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [location, setLocation] = useState<AssetLocation | null>(null)
  const [parentName, setParentName] = useState<string>('—')

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const list = await fetchLocationList()
      const cur = list.find((l) => l.id === id)
      if (cur) {
        setLocation(cur)
        if (cur.parentId && cur.parentId !== 0) {
          const parent = list.find((l) => l.id === cur.parentId)
          if (parent) setParentName(`${parent.name}（${parent.code}）`)
        } else {
          setParentName('—（頂級）')
        }
      }
    } catch {
      setLocation(null)
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

  if (!location) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <span style={{ color: '#8C8C8C' }}>該倉庫不存在</span>
      </div>
    )
  }

  const typeMeta = TYPE_META[location.type]

  return (
    <>
      {/* ====== 頂部標題欄（全局 DetailPageHeader） ====== */}
      <DetailPageHeader
        title={location.name}
        meta={<>{location.code} · {typeMeta.label}</>}
        onBack={onBack}
        onEdit={() => onEdit(id)}
      />

      {/* ====== 基本信息 ====== */}
      <div style={cardStyle}>
        {cardTitle(
          <HomeOutlined style={{ fontSize: 14, color: '#1890ff' }} />,
          '#E6F7FF',
          '基本信息',
        )}
        <Descriptions column={3} size="middle" bordered>
          <Descriptions.Item label="編碼">
            <span style={{ fontFamily: 'monospace' }}>{location.code}</span>
          </Descriptions.Item>
          <Descriptions.Item label="倉庫名稱">{location.name}</Descriptions.Item>
          <Descriptions.Item label="位置類型">
            <Tag color={typeMeta.color}>{typeMeta.label}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="上級倉庫">{parentName}</Descriptions.Item>
          <Descriptions.Item label="倉庫地址" span={2}>{location.address || '—'}</Descriptions.Item>
          <Descriptions.Item label="最後更新人">{location.updatedBy || '—'}</Descriptions.Item>
          <Descriptions.Item label="最後更新時間" span={2}>{location.updatedAt || '—'}</Descriptions.Item>
          <Descriptions.Item label="備註" span={3}>{location.remark || '—'}</Descriptions.Item>
        </Descriptions>
      </div>
    </>
  )
}
