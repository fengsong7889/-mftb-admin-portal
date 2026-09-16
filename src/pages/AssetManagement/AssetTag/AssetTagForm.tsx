/**
 * 新增 / 編輯標籤模板（資產標籤 - 基礎配置）
 *
 * 佈局參考業務原型圖 1：左欄樣式方案畫廊、中欄實時預覽畫布、右欄展示字段配置，
 * 整體遵循 AGENTS.md §C 表單頁規範（橙色漸變頭部 + 模塊卡片 + form-footer）。
 * 所有配置變更實時驅動中欄預覽，無需保存即可看到最終效果。
 */
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Checkbox, ColorPicker, Col, Form, Input, InputNumber, Row, message } from 'antd'
import { ArrowLeftOutlined, CheckOutlined, SaveOutlined } from '@ant-design/icons'
import {
  fetchAssetTagList,
  createAssetTag,
  updateAssetTag,
  ASSET_DISPLAY_FIELDS,
  ASSET_FIELD_SAMPLE_VALUES,
} from '../../../api/eam'
import AssetTagPreview from './AssetTagPreview'
import './index.css'

interface AssetTagFormProps {
  id?: number
  onBack: () => void
}

/** 預置配色方案（純色彩命名，適用於打印實體標籤；label 走 i18n） */
const COLOR_PRESETS = [
  { labelKey: 'colorOrange', bgColor: '#E8720C', textColor: '#FFFFFF' },
  { labelKey: 'colorSkyBlue', bgColor: '#1890FF', textColor: '#FFFFFF' },
  { labelKey: 'colorGrassGreen', bgColor: '#52C41A', textColor: '#FFFFFF' },
  { labelKey: 'colorAmber', bgColor: '#FA8C16', textColor: '#FFFFFF' },
  { labelKey: 'colorPurple', bgColor: '#722ED1', textColor: '#FFFFFF' },
  { labelKey: 'colorRed', bgColor: '#FF4D4F', textColor: '#FFFFFF' },
  { labelKey: 'colorCyan', bgColor: '#13C2C2', textColor: '#FFFFFF' },
  { labelKey: 'colorGold', bgColor: '#FAAD14', textColor: '#FFFFFF' },
]

const DEFAULT_BG = '#E8720C'
const DEFAULT_TEXT = '#FFFFFF'

/** 渲染模塊標題行 */
function renderCardTitle(icon: string, iconBg: string, title: string, extra?: string) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
      <div style={{ width: 28, height: 28, borderRadius: 6, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 14 }}>{icon}</span>
      </div>
      <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{title}</span>
      <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
      {extra && <span style={{ fontSize: 12, color: '#8c8c8c' }}>{extra}</span>}
    </div>
  )
}

export default function AssetTagForm({ id, onBack }: AssetTagFormProps) {
  const { t } = useTranslation()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [isEdit, setIsEdit] = useState(!!id)
  const [bgColor, setBgColor] = useState(DEFAULT_BG)
  const [textColor, setTextColor] = useState(DEFAULT_TEXT)
  const [selectedFields, setSelectedFields] = useState<string[]>([])

  /** 實時監聽標籤名稱，驅動預覽 */
  const nameWatch = Form.useWatch('name', form) as string | undefined

  /** 按 ASSET_DISPLAY_FIELDS 規範順序排列的已選字段 */
  const orderedFields = ASSET_DISPLAY_FIELDS.filter(f => selectedFields.includes(f.key))

  /** 加載編輯數據 */
  const loadDetail = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const list = await fetchAssetTagList()
      const record = list.find(t => t.id === id)
      if (record) {
        form.setFieldsValue({
          name: record.name,
          description: record.description,
          sort: record.sort,
        })
        setBgColor(record.bgColor)
        setTextColor(record.textColor)
        setSelectedFields(record.displayFields)
        setIsEdit(true)
      }
    } catch {
      message.error(t('assetTag.loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [id, form, t])

  useEffect(() => {
    loadDetail()
  }, [loadDetail])

  /** 勾選 / 取消字段 */
  const handleToggleField = (key: string) => {
    setSelectedFields(prev =>
      prev.includes(key) ? prev.filter(f => f !== key) : [...prev, key],
    )
  }

  /** 保存 */
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      if (orderedFields.length === 0) {
        message.warning(t('assetTag.selectAtLeastOneField'))
        return
      }
      setLoading(true)
      const data = {
        name: values.name as string,
        description: (values.description as string) || '',
        bgColor,
        textColor,
        displayFields: orderedFields.map(f => f.key),
        sort: (values.sort as number) ?? 0,
        status: 'enabled' as const,
      }
      if (isEdit && id) {
        await updateAssetTag(id, data)
        message.success(t('assetTag.updateSuccess'))
      } else {
        await createAssetTag(data)
        message.success(t('assetTag.createSuccess'))
      }
      onBack()
    } catch {
      // 表單校驗失敗或接口錯誤（由請求層統一提示）
    } finally {
      setLoading(false)
    }
  }

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
        <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
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
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>
              {isEdit ? t('assetTag.editTitle') : t('assetTag.addTitle')}
            </h2>
          </div>
        </div>
      </div>

      <Form form={form} layout="vertical" disabled={loading}>
        {/* 模塊1：基本信息 */}
        <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          {renderCardTitle('📋', '#e6f7ff', t('common.basicInfo'))}
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item label={t('assetTag.nameLabel')} name="name" rules={[{ required: true, message: t('assetTag.nameRequired') }]}>
                <Input placeholder={t('assetTag.namePh')} maxLength={30} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label={t('assetTag.sortLabel')} name="sort" initialValue={0}>
                <InputNumber min={0} max={9999} precision={0} style={{ width: '100%' }} placeholder={t('assetTag.sortPh')} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label={t('assetTag.descLabel')} name="description">
                <Input placeholder={t('assetTag.descPh')} maxLength={200} />
              </Form.Item>
            </Col>
          </Row>
        </div>

        {/* 三欄工作區：樣式畫廊 / 實時預覽 / 字段配置 */}
        <div className="asset-tag-workspace">
          {/* 左欄：標籤樣式配置 */}
          <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            {renderCardTitle('🎨', '#fff7e6', t('assetTag.styleTitle'), t('assetTag.stylePresetExtra'))}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {COLOR_PRESETS.map(preset => {
                const active = bgColor === preset.bgColor && textColor === preset.textColor
                return (
                  <div
                    key={preset.labelKey}
                    className={`asset-tag-style-thumb${active ? ' selected' : ''}`}
                    onClick={() => { setBgColor(preset.bgColor); setTextColor(preset.textColor) }}
                  >
                    <div style={{ background: preset.bgColor, color: preset.textColor, fontSize: 11, fontWeight: 600, padding: '3px 8px' }}>
                      {t(`assetTag.${preset.labelKey}`)}
                    </div>
                    <div style={{ padding: '8px 10px' }}>
                      <div style={{ height: 6, borderRadius: 3, background: '#f0f0f0', marginBottom: 6 }} />
                      <div style={{ height: 6, borderRadius: 3, background: '#f0f0f0', width: '70%' }} />
                    </div>
                    <span className="thumb-check"><CheckOutlined /></span>
                  </div>
                )
              })}
            </div>
            <div style={{ height: 1, background: '#f0f0f0', margin: '14px 0' }} />
            <div style={{ fontSize: 13, fontWeight: 500, color: '#595959', marginBottom: 8 }}>{t('assetTag.customColor')}</div>
            <div style={{ display: 'flex', gap: 16 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>{t('assetTag.bgColorLabel')}</div>
                <ColorPicker value={bgColor} showText onChange={(c) => setBgColor(c.toHexString())} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>{t('assetTag.textColorLabel')}</div>
                <ColorPicker value={textColor} showText onChange={(c) => setTextColor(c.toHexString())} />
              </div>
            </div>
          </div>

          {/* 中欄：實時預覽 */}
          <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            {renderCardTitle('👁', '#e6f7ff', t('assetTag.previewTitle'), t('assetTag.previewSyncExtra'))}
            <div className="asset-tag-canvas">
              <AssetTagPreview data={{ name: nameWatch, bgColor, textColor, displayFields: selectedFields }} />
              <div style={{ fontSize: 12, color: '#8C8C8C' }}>
                {t('assetTag.previewSummary', { name: nameWatch || t('assetTag.nameLabel'), count: orderedFields.length })}
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#595959', marginBottom: 8 }}>{t('assetTag.fieldOrderTitle')}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {orderedFields.length === 0 ? (
                  <span style={{ fontSize: 12, color: '#8C8C8C' }}>{t('assetTag.fieldOrderEmpty')}</span>
                ) : (
                  orderedFields.map((f, idx) => (
                    <span key={f.key} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      background: `${bgColor}14`, border: `1px solid ${bgColor}40`, color: bgColor,
                      borderRadius: 4, padding: '1px 8px', fontSize: 12, fontWeight: 500,
                    }}>
                      <span style={{ fontSize: 11, opacity: 0.8 }}>{idx + 1}</span>
                      {f.label}
                    </span>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* 右欄：展示字段配置 */}
          <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            {renderCardTitle('📑', '#f6ffed', t('assetTag.fieldsTitle'), t('assetTag.fieldsSelectedExtra', { selected: selectedFields.length, total: ASSET_DISPLAY_FIELDS.length }))}
            <div className="asset-tag-panel-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {ASSET_DISPLAY_FIELDS.map(field => {
                const checked = selectedFields.includes(field.key)
                return (
                  <div
                    key={field.key}
                    className={`asset-tag-field-row${checked ? ' selected' : ''}`}
                    onClick={() => handleToggleField(field.key)}
                  >
                    <Checkbox
                      checked={checked}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => handleToggleField(field.key)}
                    />
                    <span style={{ fontSize: 13, fontWeight: checked ? 500 : 400, color: '#262626' }}>
                      {field.label}
                    </span>
                    <span style={{ marginLeft: 'auto', fontSize: 12, color: '#8C8C8C' }}>
                      {ASSET_FIELD_SAMPLE_VALUES[field.key]}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </Form>

      {/* 底部操作按鈕 */}
      <div className="form-footer">
        <Button onClick={onBack}>{t('common.cancel')}</Button>
        <Button type="primary" icon={<SaveOutlined />} onClick={handleSubmit} loading={loading}>
          {t('common.save')}
        </Button>
      </div>
    </>
  )
}
