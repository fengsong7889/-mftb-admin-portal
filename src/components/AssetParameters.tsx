import { Descriptions, Tag } from 'antd'
import { AppstoreOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import type { AssetItem } from '../api/asset'
import { useAssetParameterCatalog } from '../hooks/useAssetParameterCatalog'
import { assetParameterFields, normalizeAssetParams, type AssetParameterCatalog, type AssetParameterSource } from '../utils/assetParams'
import './AssetParameters.css'

interface Props {
  asset: AssetParameterSource
  compact?: boolean
  current?: boolean
  catalog?: AssetParameterCatalog
}

/** 只展示实物已保存的配置，字典失败时保留原始 key，不用产品模板填充参数值。 */
export default function AssetParameters({ asset, compact = false, current = false, catalog: providedCatalog }: Props) {
  const { t } = useTranslation()
  const values = normalizeAssetParams(asset.params)
  const catalog = useAssetParameterCatalog(!providedCatalog && Object.keys(values).length > 0)
  const fields = assetParameterFields(asset, providedCatalog || catalog).filter(field => values[field.key] !== undefined && values[field.key] !== '')
  return <div className={`asset-parameters${compact ? ' asset-parameters--compact' : ''}`}>
    {!compact && <div className="asset-parameters__heading">
      <span>{t('asset.paramInfoTitle')}</span>
      {current && <span className="asset-parameters__hint">{t('asset.currentParamsHint')}</span>}
    </div>}
    {fields.length ? <dl className="asset-parameters__list">
      {fields.map(field => <div className="asset-parameters__item" key={field.key}>
        <dt>{field.label}{field.unit ? `（${field.unit}）` : ''}：</dt>
        <dd>{values[field.key]}</dd>
      </div>)}
    </dl> : <span className="asset-parameters__hint">{compact ? '—' : t(asset.params === undefined || asset.params === null ? 'asset.paramsUnavailable' : 'asset.noParams')}</span>}
  </div>
}

type SummaryAsset = Pick<AssetItem, 'assetNo' | 'assetName'> & Partial<AssetItem>
export function AssetSummary({ asset, hideAccessories = false }: { asset: SummaryAsset; hideAccessories?: boolean }) {
  const { t } = useTranslation()
  const accessories = asset.accessories ?? []
  return <div className="asset-summary">
    <Descriptions column={{ xs: 1, sm: 2, lg: 3 }} size="small" items={[
      { key: 'no', label: t('asset.colAssetNo'), children: asset.assetNo },
      { key: 'name', label: t('asset.colAssetName'), children: asset.assetName },
      { key: 'type', label: t('asset.colAssetType'), children: asset.assetType || '—' },
      { key: 'brand', label: t('asset.colBrand'), children: asset.brand || '—' },
      { key: 'location', label: t('asset.colLocationName'), children: asset.location || '—' },
      { key: 'value', label: t('asset.colPurchaseValue'), children: asset.purchaseValue != null ? `MOP ${asset.purchaseValue.toLocaleString()}` : '—' },
    ]} />
    <AssetParameters asset={asset} />
    {/* 配件清单 */}
    {!hideAccessories ? (
      <div style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <AppstoreOutlined style={{ fontSize: 13, color: '#FA8C16' }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#595959' }}>{t('asset.accessoryListTitleDetail')}</span>
          {accessories.length > 0 && <Tag color="orange" style={{ fontSize: 11 }}>{t('asset.accessoryCount', { count: accessories.length })}</Tag>}
          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
        </div>
        {accessories.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {accessories.map((acc, idx) => (
              <Tag key={idx} color="orange" style={{ fontSize: 13, padding: '4px 12px', borderRadius: 4 }}>
                {acc.name} × {acc.qty}
              </Tag>
            ))}
          </div>
        ) : (
          <span style={{ fontSize: 12, color: '#8C8C8C' }}>{t('asset.accessoriesEmpty')}</span>
        )}
      </div>
    ) : null}
  </div>
}
