/**
 * GiftManage 共享工具 —— GiftConsumeDetail 與 GiftDetail 的公共邏輯
 */
import { useState, useEffect } from 'react'
import { Space, Tag, message } from 'antd'
import type { TablePaginationConfig } from 'antd'
import BrandTag from '../../../components/BrandTag'
import { BRAND_OPTIONS_WITH_ALL as brandOptions } from '../../../constants/brand'
import type { MerchantGroupItem } from '../../../api/merchantGroup'
import { fetchAllMerchantGroups } from '../../../api/merchantGroup'
import type { StoreItem } from '../../../api/store'
import { fetchStoresByGroup } from '../../../api/store'

/* ──────────── 常量 ──────────── */

/**
 * 廣告類型顏色映射。
 * 鍵為後端存儲的廣告類型代碼，exclusive/gold/ka 為歷史代碼（僅用於存量數據渲染兜底）。
 */
export const adTypeColorMap: Record<string, string> = {
  new_store: '#52C41A',
  revival: '#E8720C',
  exclusive: '#722ED1',
  gold: '#FAAD14',
  popular_merchant: '#1890FF',
  golden_signboard: '#D48806',
  traffic_ad: '#13C2C2',
}

export const tradeTypeColorMap: Record<string, string> = {
  ad_purchase: 'orange',
  ad_refund: 'green',
  manual_deduct: 'red',
  auto_expire: 'default',
}

/* ──────────── 選項 / 映射工廠 ──────────── */

type TFn = (key: string) => string

/**
 * 可贈送的廣告類型選項（新增贈送表單、列表篩選共用）。
 * 必須與後端 BizSeqService.giftRuleKey 支持的類型一一對應，否則選了就無法生成贈送ID。
 */
export const createGiftAdTypeOptions = (t: TFn) => [
  { label: t('adTypeNewStore'), value: 'new_store' },
  { label: t('adTypeRevival'), value: 'revival' },
  { label: t('adTypePopularMerchant'), value: 'popular_merchant' },
  { label: t('adTypeGoldenSignboard'), value: 'golden_signboard' },
  { label: t('adTypeTrafficAd'), value: 'traffic_ad' },
]

/** 搜索篩選用：在可贈送類型前補「全部」 */
export const createAdTypeOptions = (t: TFn) => [
  { label: t('common:all'), value: '' },
  ...createGiftAdTypeOptions(t),
]

/** 廣告類型代碼 → 顯示名（含歷史代碼 exclusive/gold/ka，保證存量數據不退化為原始碼） */
export const createAdTypeMap = (t: TFn): Record<string, string> => ({
  new_store: t('adTypeNewStore'),
  revival: t('adTypeRevival'),
  exclusive: t('adTypeExclusive'),
  gold: t('adTypeGold'),
  popular_merchant: t('adTypePopularMerchant'),
  golden_signboard: t('adTypeGoldenSignboard'),
  traffic_ad: t('adTypeTrafficAd'),
  ka: t('adTypePopularMerchant'),
})

export const createTradeTypeOptions = (t: TFn) => [
  { label: t('common:all'), value: '' },
  { label: t('tradeTypePurchase'), value: 'ad_purchase' },
  { label: t('tradeTypeRefund'), value: 'ad_refund' },
  { label: t('tradeTypeDeduct'), value: 'manual_deduct' },
  { label: t('tradeTypeExpire'), value: 'auto_expire' },
]

export const createTradeTypeMap = (t: TFn): Record<string, string> => ({
  ad_purchase: t('tradeTypePurchase'),
  ad_refund: t('tradeTypeRefund'),
  manual_deduct: t('tradeTypeDeduct'),
  auto_expire: t('tradeTypeExpire'),
})

export { brandOptions }

/* ──────────── 集團/門店級聯加載 Hook ──────────── */

export function useGroupStoreSearch() {
  const [searchGroupId, setSearchGroupId] = useState<number | undefined>()
  const [searchStoreId, setSearchStoreId] = useState<number | undefined>()
  const [groups, setGroups] = useState<MerchantGroupItem[]>([])
  const [stores, setStores] = useState<StoreItem[]>([])

  useEffect(() => {
    fetchAllMerchantGroups()
      .then(setGroups)
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (searchGroupId) {
      fetchStoresByGroup(searchGroupId)
        .then(setStores)
        .catch(() => setStores([]))
    } else {
      setStores([])
    }
    setSearchStoreId(undefined)
  }, [searchGroupId])

  return {
    searchGroupId, setSearchGroupId,
    searchStoreId, setSearchStoreId,
    groups, stores,
  }
}

/* ──────────── 通用處理函數 ──────────── */

export const createHandleTableChange = (
  setPage: (v: number) => void,
  setSize: (v: number) => void,
) => (pagination: TablePaginationConfig) => {
  setPage(pagination.current || 1)
  setSize(pagination.pageSize || 10)
}

export const createHandleExport = (t: TFn) => () => {
  message.success(t('common:exportDev'))
}

/* ──────────── 列渲染器 ──────────── */

export const renderGroupInfoColumn = (groupCode?: string, groupId?: number, groupName?: string) => (
  <Space direction="vertical" size={0}>
    <span style={{ fontSize: 12, color: '#8C8C8C' }}>{groupCode || groupId}</span>
    <span>{groupName}</span>
  </Space>
)

export const renderStoreInfoColumn = (storeCode?: string, storeId?: number, storeName?: string) => (
  <Space direction="vertical" size={0}>
    <span style={{ fontSize: 12, color: '#8C8C8C' }}>{storeCode || storeId}</span>
    <span>{storeName}</span>
  </Space>
)

export const renderBrandColumn = (brand: string) => <BrandTag value={brand} />

export const renderAdTypeColumn = (adType: string, adTypeMap: Record<string, string>) => (
  <Tag style={{
    background: `${adTypeColorMap[adType] || '#E8720C'}15`,
    color: adTypeColorMap[adType] || '#E8720C',
    border: `1px solid ${adTypeColorMap[adType] || '#E8720C'}40`,
    fontSize: 12,
    padding: '1px 8px',
    borderRadius: 4,
  }}>
    {adTypeMap[adType] || adType}
  </Tag>
)

export const renderTradeTypeColumn = (type: string, tradeTypeMap: Record<string, string>) => (
  <Tag color={tradeTypeColorMap[type] || 'default'}>
    {tradeTypeMap[type] || type}
  </Tag>
)

export const renderRemainingDaysColumn = (days: number, t: TFn) => (
  <span style={{ color: days > 0 ? '#52C41A' : '#8C8C8C', fontWeight: days > 0 ? 600 : 400 }}>
    {days} {t('dayUnit')}
  </span>
)
