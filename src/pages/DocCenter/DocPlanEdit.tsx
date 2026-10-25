import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Button, Form, Input, Result, Select, Spin, message } from 'antd'
import { FileTextOutlined, SaveOutlined } from '@ant-design/icons'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  DOC_NATIVE_PERMISSION, createDocNativeDraft, docNativeDetailPath, fetchDocNativeSpaces,
  fetchDocNativeView, isDocNativeConflict, newIdempotencyKey, parseDocNativeId, saveDocNativeRevision,
} from '@/api/docNative'
import type { DocNativeSpace, DocNativeView } from '@/api/docNative'
import { DocPlanFormHeader, DocPlanSectionTitle } from './docPlanUi'
import { docPlanCardStyle } from './docPlanStyle'

interface EditValues {
  spaceId: number
  title: string
  summary?: string
  tags?: string[]
  markdown: string
  changeReason: string
}

function parseTags(tagsJson?: string | null): string[] {
  try {
    const parsed: unknown = JSON.parse(tagsJson ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((tag): tag is string => typeof tag === 'string') : []
  } catch {
    return []
  }
}

export default function DocPlanEdit() {
  const { t } = useTranslation()
  const { search } = useLocation()
  const navigate = useNavigate()
  const id = parseDocNativeId(search)
  const isEdit = id !== null
  const [form] = Form.useForm<EditValues>()
  const [spaces, setSpaces] = useState<DocNativeSpace[]>([])
  const [view, setView] = useState<DocNativeView>()
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [conflict, setConflict] = useState(false)
  // 同一次编辑会话的来源标识：创建成功后重试沿用，避免生成第二份草稿
  const sourceSessionKey = useRef(`session-${newIdempotencyKey('src')}`)
  // 幂等键跟随内容版本：内容未变重试复用，改动后重新生成，避免同键异内容 409
  const idempotencyKey = useRef(newIdempotencyKey(isEdit ? 'revise' : 'create'))

  const applyView = useCallback((data: DocNativeView) => {
    setView(data)
    form.setFieldsValue({
      spaceId: data.document.spaceId,
      title: data.revision.title,
      summary: data.revision.summary ?? '',
      tags: parseTags(data.revision.tagsJson),
      markdown: data.revision.markdown ?? '',
      changeReason: '',
    })
  }, [form])

  const load = useCallback(() => {
    setLoading(true)
    setFailed(false)
    void fetchDocNativeSpaces()
      .then(rows => setSpaces(rows.filter(space => (space.permissions & DOC_NATIVE_PERMISSION.EDIT) !== 0)))
      .catch(() => setSpaces([]))
    if (id === null) { setLoading(false); return }
    void fetchDocNativeView(id)
      .then(data => { applyView(data); setConflict(false) })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false))
  }, [applyView, id])

  useEffect(() => { load() }, [load])

  const handleSubmit = async () => {
    let values: EditValues
    try {
      values = await form.validateFields()
    } catch {
      return
    }
    const payload = {
      spaceId: values.spaceId,
      title: values.title.trim(),
      summary: values.summary?.trim() ?? '',
      markdown: values.markdown,
      tags: (values.tags ?? []).map(tag => tag.trim()).filter(Boolean),
      changeReason: values.changeReason.trim(),
      sourceSessionKey: isEdit ? undefined : sourceSessionKey.current,
      expectedVersion: isEdit ? view?.document.version : undefined,
    }
    setSaving(true)
    try {
      const receipt = isEdit
        ? await saveDocNativeRevision(id, payload, idempotencyKey.current)
        : await createDocNativeDraft(payload, idempotencyKey.current)
      message.success(t(isEdit ? 'docNative.saveSuccess' : 'docNative.createSuccess'))
      navigate(docNativeDetailPath(receipt.documentId, receipt.revisionId))
    } catch (error) {
      // 冲突提示由 request 拦截器统一弹出；这里只切换到“需重新载入”状态，禁止静默覆盖
      if (isDocNativeConflict(error)) setConflict(true)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="content-area"><div style={{ minHeight: 400, display: 'grid', placeItems: 'center' }} role="status"><Spin size="large" /></div></div>
  if (isEdit && (failed || !view)) return <div className="content-area">
    <DocPlanFormHeader title={t('docNative.editTitle')} onBack={() => navigate('/doc-plans')} />
    <Result status="error" title={t('docNative.unavailable')} subTitle={t('docNative.unavailableHint')}
      extra={<Button onClick={load}>{t('docNative.retry')}</Button>} />
  </div>

  return <div className="content-area">
    <DocPlanFormHeader title={isEdit ? t('docNative.editTitle') : t('docNative.createTitle')} onBack={() => navigate('/doc-plans')} />
    {conflict && <Alert type="warning" showIcon style={{ marginBottom: 16 }} message={t('docNative.conflictTitle')}
      description={t('docNative.conflictHint')} action={<Button size="small" onClick={load}>{t('docNative.reload')}</Button>} />}
    <Form form={form} layout="vertical" onValuesChange={() => { idempotencyKey.current = newIdempotencyKey(isEdit ? 'revise' : 'create') }}>
      <div style={docPlanCardStyle}>
        <DocPlanSectionTitle icon={<FileTextOutlined />} title={t('docNative.baseSection')} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          <Form.Item name="spaceId" label={t('docNative.space')} rules={[{ required: true, message: t('docNative.spaceRequired') }]}>
            {/* 编辑时不允许移动空间，后端同样拒绝跨空间保存 */}
            <Select disabled={isEdit} style={{ width: '100%' }} placeholder={t('docNative.spacePlaceholder')}
              options={spaces.map(space => ({ value: space.id, label: space.name }))} />
          </Form.Item>
          <Form.Item name="title" label={t('docNative.title')} rules={[{ required: true, whitespace: true, max: 200 }]}>
            <Input maxLength={200} placeholder={t('docNative.titlePlaceholder')} />
          </Form.Item>
          <Form.Item name="tags" label={t('docNative.tags')} rules={[{ type: 'array', max: 20 }]}>
            <Select mode="tags" maxCount={20} open={false} tokenSeparators={[',', '，']}
              placeholder={t('docNative.tagsHint')} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="summary" label={t('docNative.summary')} style={{ gridColumn: '1 / -1' }} rules={[{ max: 1000 }]}>
            <Input maxLength={1000} placeholder={t('docNative.summaryPlaceholder')} />
          </Form.Item>
        </div>
      </div>
      <div style={docPlanCardStyle}>
        <DocPlanSectionTitle icon={<FileTextOutlined />} title={t('docNative.sourceTitle')} />
        <Form.Item name="markdown" rules={[{ required: true, whitespace: true, message: t('docNative.markdownRequired') }]}>
          <Input.TextArea autoSize={{ minRows: 16, maxRows: 40 }} spellCheck={false}
            style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }} placeholder={t('docNative.markdownPlaceholder')} />
        </Form.Item>
      </div>
      <div style={docPlanCardStyle}>
        <DocPlanSectionTitle icon={<SaveOutlined />} title={t('docNative.changeSection')} />
        <Form.Item name="changeReason" label={t('docNative.changeReason')}
          rules={[{ required: true, whitespace: true, max: 200, message: t('docNative.changeReasonRequired') }]}>
          <Input maxLength={200} showCount placeholder={t('docNative.changeReasonHint')} />
        </Form.Item>
      </div>
      <div className="form-footer">
        <Button onClick={() => navigate('/doc-plans')}>{t('docNative.cancel')}</Button>
        <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSubmit}>{t('docNative.save')}</Button>
      </div>
    </Form>
  </div>
}
