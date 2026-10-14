/**
 * 新增/編輯空間（/doc-space/form，編輯帶 ?id=）—— 表單走獨立頁面路由（§9.1）
 *
 * 風格遵循 form-page-style：橙色漸變頭條 + 白色 div 模塊卡 + .form-footer。
 */
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, Form, Input, InputNumber, message } from 'antd'
import { ArrowLeftOutlined, SaveOutlined, AppstoreOutlined } from '@ant-design/icons'
import DocSectionCard from './DocSectionCard'
import { fetchDocSpaces, createSpace, updateSpace, type DocSpacePayload } from '@/api/docCenter'
import '@/styles/components.css'

interface SpaceFormValues {
  name: string
  icon?: string
  sortOrder: number
  description?: string
}

const NAME_MAX = 64
const DESC_MAX = 255

export default function DocSpaceForm() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [params] = useSearchParams()
  const rawId = params.get('id') ?? ''
  const editId = /^[1-9]\d*$/.test(rawId) ? Number(rawId) : undefined
  const isEditMode = editId != null
  const [form] = Form.useForm<SpaceFormValues>()
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!editId) return
    fetchDocSpaces()
      .then(spaces => {
        const s = spaces.find(x => x.id === editId)
        if (s) {
          form.setFieldsValue({ name: s.name, icon: s.icon, sortOrder: s.sort, description: s.description })
        }
      })
      .catch((e: unknown) => message.error(e instanceof Error ? e.message : t('doc.loadSpaceFailed')))
  }, [editId, form, t])

  const handleSubmit = async () => {
    let values: SpaceFormValues
    try {
      values = await form.validateFields()
    } catch {
      return // 校驗失敗：antd 已在表單項下方給出提示
    }
    const payload: DocSpacePayload = {
      name: values.name.trim(),
      icon: values.icon?.trim() || undefined,
      sortOrder: values.sortOrder ?? 0,
      description: values.description?.trim() || undefined,
    }
    setSaving(true)
    try {
      if (editId) {
        await updateSpace(editId, payload)
        message.success(t('doc.spaceUpdated'))
      } else {
        await createSpace(payload)
        message.success(t('doc.spaceCreated'))
      }
      navigate('/doc-space')
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : t('doc.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="content-area" style={{ padding: '20px 24px' }}>
      {/* 頁面頭部：白色圓角卡片 + 橙色漸變動畫條 + 返回按鈕 */}
      <div style={{
        position: 'relative', background: '#fff', marginBottom: 16,
        borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden',
      }}>
        <div style={{
          height: 3, background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
          backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite',
        }} />
        <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Button
              type="primary"
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate('/doc-space')}
              style={{
                backgroundColor: '#E8720C', borderColor: '#E8720C',
                borderRadius: 8, height: 36, padding: '0 16px',
                display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            >
              {t('common.back')}
            </Button>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>
              {isEditMode ? t('doc.editSpace') : t('doc.addSpaceTitle')}
            </h2>
          </div>
          <span style={{ fontSize: 12, color: '#8c8c8c' }}>{t('doc.spaceHeaderHint')}</span>
        </div>
      </div>

      <Form form={form} layout="vertical" initialValues={{ sortOrder: 0 }}>
        <DocSectionCard icon={<AppstoreOutlined />} color="#1890ff" bg="#e6f7ff" title={t('doc.spaceInfo')}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <Form.Item
              label={t('doc.colName')} name="name"
              rules={[{ required: true, message: t('doc.nameRequired') }, { max: NAME_MAX, message: t('doc.nameMax') }]}
            >
              <Input placeholder={t('doc.namePlaceholder')} allowClear />
            </Form.Item>
            <Form.Item label={t('doc.iconField')} name="icon" rules={[{ max: 8, message: t('doc.iconMax') }]}>
              <Input placeholder={t('doc.iconPlaceholder')} allowClear style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label={t('doc.sortField')} name="sortOrder" rules={[{ required: true, message: t('doc.sortRequired') }]}>
              <InputNumber min={0} max={999} precision={0} style={{ width: '100%' }} placeholder={t('doc.sortPlaceholder')} />
            </Form.Item>
            <Form.Item
              label={t('doc.descField')} name="description" style={{ gridColumn: '1 / -1' }}
              rules={[{ max: DESC_MAX, message: t('doc.descMax', { max: DESC_MAX }) }]}
            >
              <Input.TextArea rows={2} maxLength={DESC_MAX} showCount placeholder={t('doc.descPlaceholder')} />
            </Form.Item>
          </div>
        </DocSectionCard>

        <div className="form-footer">
          <Button onClick={() => navigate('/doc-space')}>{t('doc.cancel')}</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSubmit}>
            {t('doc.save')}
          </Button>
        </div>
      </Form>
    </div>
  )
}
