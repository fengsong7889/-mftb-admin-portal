/**
 * 標籤模板詳情（資產標籤 - 基礎配置）
 *
 * 只讀展示標籤模板完整配置：基本信息、配色樣式、展示字段，
 * 並渲染標籤最終呈現效果。遵循 AGENTS.md §C 頁面規範
 * （橙色漸變頭部 + 模塊卡片）；詳情模式不渲染底部操作按鈕。
 */
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Spin, Tag, message } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import {
  fetchAssetTagList,
  ASSET_DISPLAY_FIELDS,
  ASSET_FIELD_SAMPLE_VALUES,
} from '../../../api/eam'
import type { AssetTagTemplate } from '../../../api/eam'
import AssetTagPreview from './AssetTagPreview'

interface AssetTagDetailProps {
  id: number
  onBack: () => void
}

/** 字段 key → 中文名映射 */
const FIELD_LABEL_MAP: Record<string, string> = Object.fromEntries(
  ASSET_DISPLAY_FIELDS.map(f => [f.key, f.label]),
)

/** 模塊卡片標題行（與表單頁視覺一致） */
function renderCardTitle(emoji: string, bg: string, title: string, extra?: string) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
      <div style={{ width: 28, height: 28, borderRadius: 6, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>
        {emoji}
      </div>
      <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{title}</span>
      <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
      {extra && <span style={{ fontSize: 12, color: '#8c8c8c' }}>{extra}</span>}
    </div>
  )
}

export default function AssetTagDetail({ id, onBack }: AssetTagDetailProps) {
  const { t } = useTranslation()
  const [record, setRecord] = useState<AssetTagTemplate | null>(null)
  const [loading, setLoading] = useState(true)
  const onBackRef = useRef(onBack)
  onBackRef.current = onBack

  useEffect(() => {
    let cancelled = false
    fetchAssetTagList()
      .then(list => {
        if (cancelled) return
        const found = list.find(t => t.id === id) ?? null
        if (!found) {
          message.warning(t('assetTag.notFound'))
          onBackRef.current()
          return
        }
        setRecord(found)
      })
      .catch(() => {
        // 错误提示由请求层统一处理
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [id, t])

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '120px 0', background: '#fff', borderRadius: 8 }}>
        <Spin tip={t('common.loading')} />
      </div>
    )
  }

  if (!record) return null

  return (
    <>
      {/* 頁面頭部 */}
      <div style={{
        position: 'relative', background: '#fff', marginBottom: 16,
        borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden',
      }}>
        <div style={{
          height: 3,
          background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
          backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite',
        }} />
        <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
          <Button
            type="primary" icon={<ArrowLeftOutlined />} onClick={onBack}
            style={{
              backgroundColor: '#E8720C', borderColor: '#E8720C', borderRadius: 8,
              height: 36, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 6,
              boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
              transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          >{t('common.back')}</Button>
          <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>{t('assetTag.detailTitle')}</h2>
        </div>
      </div>

      {/* 模塊1：基本信息 */}
      <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        {renderCardTitle('📋', '#e6f7ff', t('common.basicInfo'))}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          <div>
            <div style={{ fontSize: 13, color: '#8C8C8C', marginBottom: 4 }}>{t('assetTag.nameLabel')}</div>
            <div style={{ fontSize: 14, color: '#262626', fontWeight: 500 }}>{record.name}</div>
          </div>
          <div>
            <div style={{ fontSize: 13, color: '#8C8C8C', marginBottom: 4 }}>{t('assetTag.statusLabel')}</div>
            <Tag color={record.status === 'enabled' ? 'success' : 'default'} style={{ margin: 0 }}>
              {record.status === 'enabled' ? t('assetTag.statusEnabled') : t('assetTag.statusDisabled')}
            </Tag>
          </div>
          <div>
            <div style={{ fontSize: 13, color: '#8C8C8C', marginBottom: 4 }}>{t('assetTag.sortLabel')}</div>
            <div style={{ fontSize: 14, color: '#262626' }}>{record.sort ?? 0}</div>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <div style={{ fontSize: 13, color: '#8C8C8C', marginBottom: 4 }}>{t('assetTag.descLabel')}</div>
            <div style={{ fontSize: 14, color: '#262626' }}>{record.description || '—'}</div>
          </div>
        </div>
      </div>

      {/* 模塊2：標籤樣式與展示字段（左信息 + 右實際效果） */}
      <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        {renderCardTitle('🎨', '#fff7e6', t('assetTag.styleFieldsTitle'), t('assetTag.styleFieldsExtra', { count: record.displayFields.length }))}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1fr) minmax(360px, 1.4fr)', gap: 24, alignItems: 'start' }}>
          {/* 左：配置信息 */}
          <div>
            <div style={{ display: 'flex', gap: 24, marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 13, color: '#8C8C8C', marginBottom: 4 }}>{t('assetTag.bgColorLabel')}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 18, height: 18, borderRadius: 4, background: record.bgColor, border: '1px solid #e8eaed', display: 'inline-block' }} />
                  <span style={{ fontSize: 13, color: '#262626' }}>{record.bgColor}</span>
                </div>
              </div>
              <div>
                <div style={{ fontSize: 13, color: '#8C8C8C', marginBottom: 4 }}>{t('assetTag.textColorLabel')}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 18, height: 18, borderRadius: 4, background: record.textColor, border: '1px solid #e8eaed', display: 'inline-block' }} />
                  <span style={{ fontSize: 13, color: '#262626' }}>{record.textColor}</span>
                </div>
              </div>
            </div>
            <div style={{ fontSize: 13, color: '#8C8C8C', marginBottom: 8 }}>{t('assetTag.displayFieldsLabel')}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {record.displayFields.map((key, idx) => (
                <Tag key={key} style={{ margin: 0, fontSize: 12 }}>
                  {idx + 1}. {FIELD_LABEL_MAP[key] || key}
                </Tag>
              ))}
            </div>
            <div style={{ marginTop: 16, display: 'flex', gap: 24 }}>
              <div>
                <div style={{ fontSize: 13, color: '#8C8C8C', marginBottom: 4 }}>{t('assetTag.boundAssetsLabel')}</div>
                <div style={{ fontSize: 14, color: '#262626', fontWeight: 600 }}>{record.boundCount ?? 0}</div>
              </div>
              <div>
                <div style={{ fontSize: 13, color: '#8C8C8C', marginBottom: 4 }}>{t('assetTag.lastUpdatedLabel')}</div>
                <div style={{ fontSize: 14, color: '#262626' }}>
                  {record.updatedAt || '-'}{record.updatedBy ? ` · ${record.updatedBy}` : ''}
                </div>
              </div>
            </div>
          </div>
          {/* 右：標籤最終呈現效果 */}
          <div style={{ background: '#f5f5f5', borderRadius: 8, padding: 24, display: 'flex', justifyContent: 'center' }}>
            <AssetTagPreview
              data={{ name: record.name, bgColor: record.bgColor, textColor: record.textColor, displayFields: record.displayFields }}
            />
          </div>
        </div>
        <div style={{ marginTop: 16, fontSize: 12, color: '#8C8C8C' }}>
          {t('assetTag.sampleValuesTip')}{record.displayFields.map(key => `${FIELD_LABEL_MAP[key] || key}＝${ASSET_FIELD_SAMPLE_VALUES[key] || '—'}`).join('，')}
        </div>
      </div>
    </>
  )
}
