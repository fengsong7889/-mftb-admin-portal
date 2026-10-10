/**
 * GiftManage 共享搜索表單欄位 — GiftConsumeDetail / GiftDetail 共用
 *
 * 翻譯函數由父組件傳入：本組件的 key 分屬 giftDetail / giftConsumeDetail 兩個 ns，
 * 若在此處用無 ns 的 useTranslation() 查不到翻譯，界面會直接顯示原始 key。
 */
import { Form, Select } from 'antd'
import type { MerchantGroupItem } from '../../../api/merchantGroup'
import type { StoreItem } from '../../../api/store'

type TFn = (key: string) => string

interface GiftSearchFieldsProps {
  /** 父組件綁定自身 ns 的翻譯函數 */
  t: TFn
  searchGroupId: number | undefined
  setSearchGroupId: (v: number | undefined) => void
  searchStoreId: number | undefined
  setSearchStoreId: (v: number | undefined) => void
  groups: MerchantGroupItem[]
  stores: StoreItem[]
  searchBrand: string
  setSearchBrand: (v: string) => void
  brandOptions: { label: string; value: string }[]
  searchAdType: string
  setSearchAdType: (v: string) => void
  adTypeOptions: { label: string; value: string }[]
}

export default function GiftSearchFields(props: GiftSearchFieldsProps) {
  const {
    t,
    searchGroupId, setSearchGroupId, searchStoreId, setSearchStoreId,
    groups, stores,
    searchBrand, setSearchBrand, brandOptions,
    searchAdType, setSearchAdType, adTypeOptions,
  } = props

  return (
    <>
      <Form.Item name="groupInfo" label={t('searchGroupIdName')}>
        <Select
          placeholder={t('searchGroupIdPlaceholder')}
          allowClear
          showSearch
          optionFilterProp="label"
          value={searchGroupId}
          onChange={setSearchGroupId}
          options={groups.map(g => ({
            label: `${g.groupCode} - ${g.groupName}`,
            value: g.id,
          }))}
          style={{ width: '100%' }}
        />
      </Form.Item>
      <Form.Item name="storeInfo" label={t('searchStoreIdName')}>
        <Select
          placeholder={t('searchStoreIdPlaceholder')}
          allowClear
          showSearch
          optionFilterProp="label"
          value={searchStoreId}
          onChange={setSearchStoreId}
          disabled={!searchGroupId}
          options={stores.map(s => ({
            label: `${s.storeCode} - ${s.storeName}`,
            value: s.id,
          }))}
          style={{ width: '100%' }}
        />
      </Form.Item>
      <Form.Item name="brand" label={t('common:brand')}>
        <Select
          placeholder={t('common:all')}
          allowClear
          options={brandOptions}
          value={searchBrand || undefined}
          onChange={(v) => setSearchBrand(v || '')}
          style={{ width: '100%' }}
        />
      </Form.Item>
      <Form.Item name="adType" label={t('colAdType')}>
        <Select
          placeholder={t('common:all')}
          allowClear
          options={adTypeOptions}
          value={searchAdType || undefined}
          onChange={(v) => setSearchAdType(v || '')}
          style={{ width: '100%' }}
        />
      </Form.Item>
    </>
  )
}
