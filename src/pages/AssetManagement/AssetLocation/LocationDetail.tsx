/**
 * 仓库维护 詳情頁（只讀）
 *
 * 樣式基準：採購訂單詳情（PurchaseOrder/OrderDetail.tsx）——
 * DetailPageHeader + 無邊框模塊卡片 + Descriptions column=4 非 bordered + 最後更新 footer。
 */
import { useState, useEffect, useCallback } from 'react'
import { Spin, Descriptions } from 'antd'
import { HomeOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import DetailPageHeader from '../../../components/DetailPageHeader'
import { fetchLocationList, type AssetLocation } from '../../../api/eam'

interface Props {
  id: number
  onBack: () => void
  onEdit: (id: number) => void
}

export default function LocationDetail({ id, onBack, onEdit }: Props) {
  const { t } = useTranslation()
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
        <span style={{ color: '#8C8C8C' }}>{t('asset.locationNotFound', { defaultValue: '該倉庫不存在' })}</span>
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

      {/* ====== 基本信息（無邊框卡片） ====== */}
      <div style={{ borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: '#E6F7FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <HomeOutlined style={{ fontSize: 14, color: '#1890ff' }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('asset.sectionBasic')}</span>
          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
        </div>
        <Descriptions column={4} size="middle">
          <Descriptions.Item label={t('asset.locationCodeLabel', { defaultValue: '編碼' })}>
            <span style={{ fontFamily: 'monospace' }}>{location.code}</span>
          </Descriptions.Item>
          <Descriptions.Item label={t('asset.locationNameLabel', { defaultValue: '倉庫名稱' })}>{location.name}</Descriptions.Item>
          <Descriptions.Item label={t('asset.provinceLabel', { defaultValue: '省份' })}>{location.province || '—'}</Descriptions.Item>
          <Descriptions.Item label={t('asset.cityLabel', { defaultValue: '城市' })}>{location.city || '—'}</Descriptions.Item>
          <Descriptions.Item label={t('asset.districtLabel', { defaultValue: '區縣' })}>{location.district || '—'}</Descriptions.Item>
          <Descriptions.Item label={t('asset.addressLabel', { defaultValue: '詳細地址' })}>{location.address || '—'}</Descriptions.Item>
          <Descriptions.Item label={t('asset.fullAddressLabel', { defaultValue: '完整地址' })} span={2}>{fullAddress}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colRemark', { defaultValue: '備註' })} span={2}>{location.remark || '—'}</Descriptions.Item>
        </Descriptions>
      </div>

      {/* ====== 最後更新（詳情頁規範 footer） ====== */}
      <div style={{
        background: '#fafafa', borderRadius: 8, padding: '12px 24px',
        border: '1px solid #f0f0f0',
        display: 'flex', justifyContent: 'flex-end', gap: 24,
      }}>
        <span style={{ fontSize: 12, color: '#8C8C8C' }}>{t('asset.updatedByLabel')}<span style={{ color: '#595959' }}>{location.updatedBy || '-'}</span></span>
        <span style={{ fontSize: 12, color: '#8C8C8C' }}>{t('asset.updatedAtLabel')}<span style={{ color: '#595959' }}>{location.updatedAt || '-'}</span></span>
      </div>
    </>
  )
}
