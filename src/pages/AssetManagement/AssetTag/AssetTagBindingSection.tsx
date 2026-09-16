/**
 * 資產標籤綁定管理區塊（共享組件）
 *
 * 複用於：資產詳情頁、資產編輯頁（編輯模式）。
 * 展示已綁標籤（主標籤大卡 + 次標籤卡，真實資產數據實時渲染），
 * 支持：綁定啟用中的模板（Modal 內含預覽確認）、設為主標籤、解綁、跳轉批量列印。
 * 綁定/解綁均即時生效（獨立關係表語義，不隨資產表單提交）。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Button, Empty, Modal, Popconfirm, Select, Spin, Tag, message } from 'antd'
import { PrinterOutlined, PlusOutlined, TagOutlined } from '@ant-design/icons'
import {
  fetchAssetTagList,
  fetchAssetTagBindings,
  bindAssetTag,
  unbindAssetTag,
  setPrimaryAssetTag,
} from '../../../api/eam'
import type { AssetTagBindingItem, AssetTagTemplate } from '../../../api/eam'
import type { AssetItem } from '../../../api/asset'
import AssetTagPreview from './AssetTagPreview'
import { buildTagValues } from './tagValues'

interface Props {
  assetId: number
  /** 資產數據（渲染標籤真實值；編輯頁傳當前表單資產） */
  asset?: AssetItem | null
}

/** 主標籤數量上限提示（1 主 + N 次，業務約束） */
const MAX_BINDINGS_PER_ASSET = 4

export default function AssetTagBindingSection({ assetId, asset }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [bindings, setBindings] = useState<AssetTagBindingItem[]>([])
  const [templates, setTemplates] = useState<AssetTagTemplate[]>([])
  const [loading, setLoading] = useState(false)
  const [bindOpen, setBindOpen] = useState(false)
  const [selectedTagId, setSelectedTagId] = useState<number>()
  const [submitting, setSubmitting] = useState(false)

  const tagValues = useMemo(() => (asset ? buildTagValues(asset) : undefined), [asset])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [list, tagList] = await Promise.all([fetchAssetTagBindings(assetId), fetchAssetTagList()])
      setBindings(list)
      setTemplates(tagList)
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : t('assetTag.loadBindFailed'))
    } finally {
      setLoading(false)
    }
  }, [assetId, t])

  useEffect(() => { loadData() }, [loadData])

  /** 可綁定模板：啟用中 且 未被本資產綁定 */
  const bindableTemplates = useMemo(() => templates.filter(
    t => t.status === 'enabled' && !bindings.some(b => b.tag.id === t.id),
  ), [templates, bindings])

  const selectedTemplate = useMemo(
    () => bindableTemplates.find(t => t.id === selectedTagId),
    [bindableTemplates, selectedTagId],
  )

  const handleOpenBind = () => {
    if (bindings.length >= MAX_BINDINGS_PER_ASSET) {
      message.warning(t('assetTag.maxBindingsWarn', { count: MAX_BINDINGS_PER_ASSET }))
      return
    }
    setSelectedTagId(undefined)
    setBindOpen(true)
  }

  const handleBind = async () => {
    if (!selectedTagId) {
      message.warning(t('assetTag.selectTemplateFirst'))
      return
    }
    setSubmitting(true)
    try {
      await bindAssetTag(assetId, selectedTagId)
      message.success(t('assetTag.bindSuccess'))
      setBindOpen(false)
      loadData()
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : t('assetTag.bindFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleUnbind = async (item: AssetTagBindingItem) => {
    try {
      await unbindAssetTag(assetId, item.tag.id)
      message.success(t('assetTag.unboundMsg'))
      loadData()
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : t('assetTag.unbindFailed'))
    }
  }

  const handleSetPrimary = async (item: AssetTagBindingItem) => {
    try {
      await setPrimaryAssetTag(assetId, item.tag.id)
      message.success(t('assetTag.setPrimarySuccess'))
      loadData()
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : t('assetTag.operateFailed'))
    }
  }

  const handlePrint = () => {
    navigate(`/asset-tag-print?ids=${assetId}${bindings.length === 1 ? `&tagId=${bindings[0].tag.id}` : ''}`)
  }

  return (
    <div style={{
      border: '1px solid #e8eaed', borderRadius: 8, background: '#fff',
      padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
    }}>
      {/* 標題行（模塊卡片規範） */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 6, background: '#e6f7ff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <TagOutlined style={{ fontSize: 14, color: '#1890ff' }} />
        </div>
        <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('assetTag.sectionTitle')}</span>
        <Tag color="blue" style={{ marginLeft: 4, fontSize: 11 }}>{t('assetTag.primaryPolicyTag', { count: MAX_BINDINGS_PER_ASSET - 1 })}</Tag>
        <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
        <span style={{ fontSize: 12, color: '#8c8c8c' }}>
          {t('assetTag.boundCountShort', { count: bindings.length })}{bindings.some(b => b.isPrimary) ? '' : t('assetTag.noPrimarySuffix')}
        </span>
      </div>

      <Spin spinning={loading}>
        {bindings.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={<span style={{ fontSize: 12, color: '#8c8c8c' }}>{t('assetTag.emptyDesc')}</span>}
            style={{ margin: '8px 0 16px' }}
          />
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 16 }}>
            {bindings.map(item => (
              <div key={item.bindingId} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ position: 'relative' }}>
                  <AssetTagPreview data={item.tag} values={tagValues} />
                  {item.isPrimary && (
                    <Tag color="orange" style={{
                      position: 'absolute', top: -8, right: -8, fontSize: 11,
                      lineHeight: '18px', borderRadius: 4, margin: 0, zIndex: 1,
                    }}>{t('assetTag.primaryTagBadge')}</Tag>
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 4 }}>
                  {!item.isPrimary && (
                    <Button type="link" size="small" style={{ fontSize: 12, padding: '0 4px' }} onClick={() => handleSetPrimary(item)}>
                      {t('assetTag.setPrimary')}
                    </Button>
                  )}
                  <Popconfirm
                    title={t('assetTag.unbindConfirmTitle')}
                    description={item.isPrimary && bindings.length > 1 ? t('assetTag.unbindFallbackTip') : undefined}
                    okText={t('assetTag.unbindBtn')}
                    cancelText={t('common.cancel')}
                    onConfirm={() => handleUnbind(item)}
                  >
                    <Button type="link" size="small" danger style={{ fontSize: 12, padding: '0 4px' }}>
                      {t('assetTag.unbindBtn')}
                    </Button>
                  </Popconfirm>
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <Button icon={<PlusOutlined />} onClick={handleOpenBind}>{t('assetTag.bindBtn')}</Button>
          {bindings.length > 0 && (
            <Button icon={<PrinterOutlined />} onClick={handlePrint}>{t('assetTag.printBtn')}</Button>
          )}
        </div>
      </Spin>

      {/* 綁定標籤彈窗（Select + 預覽即確認層） */}
      <Modal
        title={t('assetTag.bindBtn')}
        open={bindOpen}
        onOk={handleBind}
        onCancel={() => setBindOpen(false)}
        okText={t('common.confirm')}
        cancelText={t('common.cancel')}
        confirmLoading={submitting}
        okButtonProps={{ disabled: !selectedTagId }}
        width={420}
      >
        <div style={{ marginBottom: 8, fontSize: 13, color: '#595959' }}>
          {t('assetTag.assetNoLabel')}<span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{asset?.assetNo || assetId}</span>
        </div>
        <Select
          style={{ width: '100%' }}
          placeholder={t('assetTag.selectPh')}
          value={selectedTagId}
          onChange={setSelectedTagId}
          options={bindableTemplates.map(t => ({ label: t.name, value: t.id }))}
          notFoundContent={<span style={{ fontSize: 12, color: '#8c8c8c' }}>{t('assetTag.noBindableTemplate')}</span>}
        />
        {selectedTemplate && (
          <div style={{ marginTop: 12, background: '#FAFAFA', borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 8 }}>{t('assetTag.previewLabel')}</div>
            <AssetTagPreview data={selectedTemplate} />
          </div>
        )}
        <div style={{ marginTop: 12, fontSize: 12, color: '#8c8c8c' }}>
          {t('assetTag.bindInstantTip')}
        </div>
      </Modal>
    </div>
  )
}
