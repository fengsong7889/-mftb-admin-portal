/**
 * GiftManage 共享搜索表單欄位 — GiftConsumeDetail / GiftDetail 共用
 */
import { Form, Select } from 'antd'
import { useTranslation } from 'react-i18next'
import type { MerchantGroupItem } from '../../../api/merchantGroup'
import type { StoreItem } from '../../../api/store'

interface GiftSearchFieldsProps {
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
  const { t } = useTranslation()
  const {
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
