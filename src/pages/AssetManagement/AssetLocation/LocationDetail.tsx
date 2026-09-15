/**
 * 仓库维护 詳情頁（只讀）
 *
 * - 使用 DetailPageHeader 組件（橙色返回 + 藍色標題 + 右側編輯按鈕）
 * - 卡片式佈局：基本信息（編碼、名稱、省-市-区-详细地址）
 */
import { useState, useEffect, useCallback } from 'react'
import { Spin, Descriptions } from 'antd'
import { HomeOutlined } from '@ant-design/icons'
import DetailPageHeader from '../../../components/DetailPageHeader'
import { fetchLocationList, type AssetLocation } from '../../../api/eam'

interface Props {
  id: number
  onBack: () => void
  onEdit: (id: number) => void
}

export default function LocationDetail({ id, onBack, onEdit }: Props) {
  const [loading, setLoading] = useState(true)
  const [location, setLocation] = useState<AssetLocation | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const list = await fetchLocationList()
      const cur = list.find((l) => l.id === id)
      if (cur) {
        setLocation(cur)
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

  const fullAddress = [location.province, location.city, location.district, location.address].filter(Boolean).join(' ') || '—'

  return (
    <>
      {/* ====== 頂部標題欄（全局 DetailPageHeader） ====== */}
      <DetailPageHeader
        title={location.name}
        meta={<>{location.code}</>}
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
          <Descriptions.Item label="省份">{location.province || '—'}</Descriptions.Item>
          <Descriptions.Item label="城市">{location.city || '—'}</Descriptions.Item>
          <Descriptions.Item label="區縣">{location.district || '—'}</Descriptions.Item>
          <Descriptions.Item label="詳細地址">{location.address || '—'}</Descriptions.Item>
          <Descriptions.Item label="完整地址" span={3}>{fullAddress}</Descriptions.Item>
          <Descriptions.Item label="最後更新人">{location.updatedBy || '—'}</Descriptions.Item>
          <Descriptions.Item label="最後更新時間" span={2}>{location.updatedAt || '—'}</Descriptions.Item>
          <Descriptions.Item label="備註" span={3}>{location.remark || '—'}</Descriptions.Item>
        </Descriptions>
      </div>
    </>
  )
}
