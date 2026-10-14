/**
 * 登記/編輯文檔（/doc-center/register、/doc-center/edit?id=）—— 表單走獨立頁面路由（§9.1）
 *
 * 風格遵循 form-page-style：橙色漸變頭條 + 白色 div 模塊卡 + .form-footer 底部按鈕。
 */
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, Form, Input, InputNumber, Select, message } from 'antd'
import {
  ArrowLeftOutlined, SaveOutlined, FileTextOutlined,
  LinkOutlined, ApartmentOutlined, ProfileOutlined,
} from '@ant-design/icons'
import HelpPopover from '@/components/HelpPopover'
import DocSectionCard from './DocSectionCard'
import {
  fetchDocSpaces, fetchDocNode, registerDoc, updateDoc,
  DOC_TYPE_VALUES, DOC_STATUS_VALUES,
  type DocSpace, type DocType, type DocStatus, type DocRegisterPayload,
} from '@/api/docCenter'
import '@/styles/components.css'

interface RegisterFormValues {
  spaceId: number
  category: string
  title: string
  docType: DocType
  status: DocStatus
  tencentUrl: string
  bizId?: number | null
  tags?: string[]
  summary?: string
}

/** 只收騰訊文檔域名鏈接，防止把外部系統地址誤登記為公司文檔（與後端 DocService 白名單同口徑） */
const TENCENT_URL_PATTERN = /^https:\/\/docs\.qq\.com\//

const TITLE_MAX = 200
const CATEGORY_MAX = 64
const SUMMARY_MAX = 500

/** 標籤是隨數據入庫的建議值（數據而非 UI 文案），保持字面量不做 i18n */
const TAG_SUGGESTIONS = ['PRD', '評審紀要', '制度', '入職', '培訓', '安全', '行政', '需求池', '算法', '廣告']

export default function DocRegisterForm() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [params] = useSearchParams()
  // 編輯模式：/doc-center/edit?id=123；ID 正則校驗防無效深鏈打進接口
  const rawId = params.get('id') ?? ''
  const editId = /^[1-9]\d*$/.test(rawId) ? Number(rawId) : undefined
  const isEditMode = editId != null
  const [form] = Form.useForm<RegisterFormValues>()
  const [spaces, setSpaces] = useState<DocSpace[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchDocSpaces().then(setSpaces).catch(() => setSpaces([]))
  }, [])

  useEffect(() => {
    if (!editId) return
    fetchDocNode(editId)
      .then(n => {
        if (n) {
          form.setFieldsValue({
            spaceId: n.spaceId, category: n.category, title: n.title,
            docType: n.docType, status: n.status, tencentUrl: n.tencentUrl,
            tags: n.tags, bizId: n.bizId, summary: n.summary,
          })
        }
      })
      .catch((e: unknown) => message.error(e instanceof Error ? e.message : t('doc.loadDocFailed')))
  }, [editId, form, t])

  const handleSubmit = async () => {
    let values: RegisterFormValues
    try {
      values = await form.validateFields()
    } catch {
      return // 校驗失敗：antd 已在表單項下方給出提示，不再重複彈 toast
    }
    setSaving(true)
    try {
      const payload: DocRegisterPayload = {
        spaceId: values.spaceId,
        category: values.category.trim(),
        title: values.title.trim(),
        docType: values.docType,
        status: values.status,
        tencentUrl: values.tencentUrl.trim(),
        tags: values.tags ?? [],
        bizId: values.bizId ?? undefined,
        summary: values.summary?.trim() || undefined,
      }
      if (editId) {
        await updateDoc(editId, payload)
        message.success(t('doc.savedUpdated'))
      } else {
        await registerDoc(payload)
        message.success(t('doc.savedRegistered'))
      }
      navigate('/doc-center')
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : t('doc.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const statusOptions = DOC_STATUS_VALUES.map(v => ({ value: v, label: t(`doc.status.${v}`) }))
  const typeOptions = DOC_TYPE_VALUES.map(v => ({ value: v, label: t(`doc.type.${v}`) }))

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
              onClick={() => navigate('/doc-center')}
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
              {isEditMode ? t('doc.editDocTitle') : t('doc.registerTitle')}
            </h2>
          </div>
          <span style={{ fontSize: 12, color: '#8c8c8c' }}>{t('doc.headerIndexHint')}</span>
        </div>
      </div>

      <Form form={form} layout="vertical" initialValues={{ docType: 'doc', status: 'published' }}>
        {/* ── 基礎信息 ── */}
        <DocSectionCard icon={<FileTextOutlined />} color="#1890ff" bg="#e6f7ff" title={t('doc.basicInfo')}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <Form.Item label={t('doc.spaceField')} name="spaceId" rules={[{ required: true, message: t('doc.spaceRequired') }]}>
              <Select placeholder={t('doc.spacePlaceholder')} options={spaces.map(s => ({ value: s.id, label: `${s.icon} ${s.name}` }))} />
            </Form.Item>
            <Form.Item label={t('doc.categoryField')} name="category" rules={[{ required: true, message: t('doc.categoryRequired') }, { max: CATEGORY_MAX, message: t('doc.categoryMax', { max: CATEGORY_MAX }) }]}>
              <Input placeholder={t('doc.categoryPlaceholder')} allowClear />
            </Form.Item>
            <Form.Item label={t('doc.typeField')} name="docType" rules={[{ required: true, message: t('doc.typeRequired') }]}>
              <Select options={typeOptions} />
            </Form.Item>
            <Form.Item
              label={t('doc.titleField')} name="title" style={{ gridColumn: '1 / -1' }}
              rules={[{ required: true, message: t('doc.titleRequired') }, { max: TITLE_MAX, message: t('doc.titleMax', { max: TITLE_MAX }) }]}
            >
              <Input placeholder={t('doc.titlePlaceholder')} showCount maxLength={TITLE_MAX} allowClear />
            </Form.Item>
            <Form.Item label={t('doc.statusField')} name="status" rules={[{ required: true, message: t('doc.statusRequired') }]}>
              <Select options={statusOptions} style={{ width: 180 }} />
            </Form.Item>
          </div>
        </DocSectionCard>

        {/* ── 騰訊文檔鏈接 ── */}
        <DocSectionCard icon={<LinkOutlined />} color="#fa8c16" bg="#fff7e6" title={t('doc.urlSection')}
          hint={t('doc.urlSectionHint')}>
          <Form.Item
            label={
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                {t('doc.urlField')}
                <HelpPopover
                  title={t('doc.urlHelpTitle')}
                  ariaLabel={t('doc.urlHelpTitle')}
                  width={420}
                  content={[
                    { tone: 'info', label: t('doc.helpView'), body: t('doc.helpViewBody') },
                    { tone: 'warn', label: t('doc.helpEdit'), body: t('doc.helpEditBody') },
                    { tone: 'neutral', label: t('doc.helpOwner'), body: t('doc.helpOwnerBody') },
                  ]}
                />
              </span>
            }
            name="tencentUrl"
            rules={[
              { required: true, message: t('doc.urlRequired') },
              { pattern: TENCENT_URL_PATTERN, message: t('doc.urlPattern') },
            ]}
          >
            <Input placeholder={t('doc.urlPlaceholder')} allowClear />
          </Form.Item>
        </DocSectionCard>

        {/* ── 業務掛接與標籤 ── */}
        <DocSectionCard icon={<ApartmentOutlined />} color="#722ed1" bg="#f9f0ff" title={t('doc.bizSection')}
          hint={t('doc.bizSectionHint')}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
            <Form.Item label={t('doc.bizField')} name="bizId">
              <InputNumber min={1} precision={0} placeholder={t('doc.bizPlaceholder')} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label={t('doc.tagsField')} name="tags">
              <Select mode="tags" options={TAG_SUGGESTIONS.map(v => ({ value: v, label: v }))} placeholder={t('doc.tagsPlaceholder')} allowClear />
            </Form.Item>
          </div>
        </DocSectionCard>

        {/* ── 文檔摘要 ── */}
        <DocSectionCard icon={<ProfileOutlined />} color="#52c41a" bg="#f6ffed" title={t('doc.summarySection')}>
          <Form.Item label={t('doc.summaryField')} name="summary" rules={[{ max: SUMMARY_MAX, message: t('doc.summaryMax', { max: SUMMARY_MAX }) }]}>
            <Input.TextArea rows={4} maxLength={SUMMARY_MAX} showCount placeholder={t('doc.summaryPlaceholder')} />
          </Form.Item>
        </DocSectionCard>

        {/* 底部操作按鈕（全局統一 .form-footer） */}
        <div className="form-footer">
          <Button onClick={() => navigate('/doc-center')}>{t('doc.cancel')}</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSubmit}>
            {t('doc.saveDoc')}
          </Button>
        </div>
      </Form>
    </div>
  )
}
