import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Form, Input, Modal, Result, Select, Space, Spin, Tag, message } from 'antd'
import { FlagOutlined, SaveOutlined } from '@ant-design/icons'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  fetchDocNativeView, isDocNativeConflict, parseDocNativeId, updateDocNativeExecution,
} from '@/api/docNative'
import type { DocNativeView } from '@/api/docNative'
import { DocPlanFormHeader, DocPlanSectionTitle } from './docPlanUi'
import { docPlanCardStyle } from './docPlanStyle'

interface ExecutionValues { revisionId: number; status: number; evidence: string }

/** 合法状态转移与后端一致：1未开始→2执行中；2→3暂停/4完成；3→2恢复。 */
const NEXT_STATUS: Record<number, number[]> = { 1: [2], 2: [3, 4], 3: [2], 4: [] }

export default function DocPlanExecution() {
  const { t } = useTranslation()
  const { search } = useLocation()
  const navigate = useNavigate()
  const id = parseDocNativeId(search)
  const [form] = Form.useForm<ExecutionValues>()
  const [view, setView] = useState<DocNativeView>()
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    if (id === null) { setLoading(false); setFailed(true); return }
    setLoading(true); setFailed(false)
    void fetchDocNativeView(id)
      .then(data => {
        setView(data)
        const approved = approvedRevisionIds(data)
        const approvedSet = new Set(approved.map(revision => revision.id))
        const baseline = data.document.adoptedRevisionId ?? data.document.effectiveRevisionId
        form.setFieldsValue({
          revisionId: baseline && approvedSet.has(baseline) ? baseline : approved[0]?.id,
          status: NEXT_STATUS[data.document.executionStatus]?.[0],
          evidence: '',
        })
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false))
  }, [form, id])
  useEffect(() => { load() }, [load])

  const handleSubmit = async () => {
    if (!view || id === null) return
    let values: ExecutionValues
    try { values = await form.validateFields() } catch { return }
    Modal.confirm({
      title: t('docNative.executionConfirmTitle'),
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      content: <div className="confirm-info-card">
        <div className="confirm-info-row"><span>{t('docNative.number')}：</span><b>{view.document.documentNo}</b></div>
        <div className="confirm-info-row"><span>{t('docNative.revisionId')}：</span><b>#{values.revisionId}</b></div>
        <div className="confirm-info-row"><span>{t('docNative.executionTarget')}：</span><b>{t(`docNative.exec.${values.status}`)}</b></div>
        <div className="confirm-info-row"><span>{t('docNative.executionEvidence')}：</span><b>{values.evidence.trim()}</b></div>
      </div>,
      okText: t('docNative.executionSave'),
      cancelText: t('docNative.cancel'),
      onOk: async () => {
        setSaving(true)
        try {
          await updateDocNativeExecution(id, {
            expectedVersion: view.document.version,
            revisionId: values.revisionId,
            status: values.status,
            evidence: values.evidence.trim(),
          })
          message.success(t('docNative.executionSuccess'))
          load()
        } catch (error) {
          if (isDocNativeConflict(error)) load()
          throw error
        } finally {
          setSaving(false)
        }
      },
    })
  }

  if (loading) return <div className="content-area"><div style={{ minHeight: 400, display: 'grid', placeItems: 'center' }} role="status"><Spin size="large" /></div></div>
  if (failed || !view) return <div className="content-area">
    <DocPlanFormHeader title={t('docNative.executionTitle')} onBack={() => navigate('/doc-plans')} />
    <Result status="error" title={t('docNative.unavailable')} subTitle={t('docNative.unavailableHint')}
      extra={<Button onClick={load}>{t('docNative.retry')}</Button>} />
  </div>

  const approved = approvedRevisionIds(view)
  const next = NEXT_STATUS[view.document.executionStatus] ?? []
  const canExecute = view.allowedActions?.includes('execution') ?? false
  return <div className="content-area">
    <DocPlanFormHeader title={t('docNative.executionTitle')} onBack={() => navigate('/doc-plans')} />
    <div style={docPlanCardStyle}>
      <DocPlanSectionTitle icon={<FlagOutlined />} title={t('docNative.executionCurrent')} />
      <Space wrap size={16} style={{ fontSize: 13, color: '#595959' }}>
        <span>{t('docNative.number')}：<b>{view.document.documentNo}</b></span>
        <span>{t('docNative.executionStatus')}：<Tag color="blue">{t(`docNative.exec.${view.document.executionStatus}`)}</Tag></span>
        <span>{t('docNative.adopted')}：<b>{view.document.adoptedRevisionId ? `#${view.document.adoptedRevisionId}` : '—'}</b></span>
        <span>{t('docNative.effective')}：<b>{view.document.effectiveRevisionId ? `#${view.document.effectiveRevisionId}` : '—'}</b></span>
      </Space>
    </div>
    {!canExecute ? <Alert type="warning" showIcon message={t('docNative.executionNoPermission')} />
      : approved.length === 0 ? <Alert type="info" showIcon message={t('docNative.executionNoApproved')} />
        : next.length === 0 ? <Alert type="success" showIcon message={t('docNative.executionFinished')} />
          : <div style={docPlanCardStyle}>
            <DocPlanSectionTitle icon={<FlagOutlined />} title={t('docNative.executionUpdate')} />
            <Form form={form} layout="vertical">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
                <Form.Item name="revisionId" label={t('docNative.executionBaseline')}
                  extra={t('docNative.executionBaselineHint')} rules={[{ required: true }]}>
                  <Select style={{ width: '100%' }} options={approved.map(revision => ({
                    value: revision.id,
                    label: `v${revision.revisionNo} · ${revision.title}`,
                  }))} />
                </Form.Item>
                <Form.Item name="status" label={t('docNative.executionTarget')} rules={[{ required: true }]}>
                  <Select style={{ width: '100%' }} options={next.map(status => ({ value: status, label: t(`docNative.exec.${status}`) }))} />
                </Form.Item>
                <Form.Item name="evidence" label={t('docNative.executionEvidence')} style={{ gridColumn: '1 / -1' }}
                  extra={t('docNative.executionEvidenceHint')}
                  rules={[{ required: true, whitespace: true, max: 200, message: t('docNative.executionEvidenceRequired') }]}>
                  <Input.TextArea rows={3} maxLength={200} showCount placeholder={t('docNative.executionEvidencePlaceholder')} />
                </Form.Item>
              </div>
            </Form>
            <div className="form-footer">
              <Button onClick={() => navigate('/doc-plans')}>{t('docNative.cancel')}</Button>
              <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSubmit}>{t('docNative.executionSave')}</Button>
            </div>
          </div>}
  </div>
}

function approvedRevisionIds(view: DocNativeView) {
  const ids = new Set<number>()
  for (const confirmation of view.confirmations ?? []) if (confirmation.status === 2) ids.add(confirmation.revisionId)
  if (view.document.effectiveRevisionId) ids.add(view.document.effectiveRevisionId)
  if (view.document.adoptedRevisionId) ids.add(view.document.adoptedRevisionId)
  return (view.revisions ?? []).filter(revision => ids.has(revision.id))
}
