import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Form, Input, Modal, Result, Select, Spin, Tag, message } from 'antd'
import { AuditOutlined, CheckCircleOutlined } from '@ant-design/icons'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  DOC_NATIVE_PERMISSION, decideDocNativeConfirmation, fetchDocNativeMembers, fetchDocNativeView,
  isDocNativeConflict, parseDocNativeId, submitDocNativeConfirmation,
} from '@/api/docNative'
import type { DocNativeMember, DocNativeView } from '@/api/docNative'
import { DocPlanFormHeader, DocPlanSectionTitle } from './docPlanUi'
import { docPlanCardStyle } from './docPlanStyle'

type Decision = 'approve' | 'reject' | 'withdraw'

export default function DocPlanConfirm() {
  const { t } = useTranslation()
  const { search } = useLocation()
  const navigate = useNavigate()
  const id = parseDocNativeId(search)
  const [form] = Form.useForm<{ reviewerUserId: number }>()
  const [view, setView] = useState<DocNativeView>()
  const [members, setMembers] = useState<DocNativeMember[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [note, setNote] = useState('')

  const load = useCallback(() => {
    if (id === null) { setLoading(false); setFailed(true); return }
    setLoading(true); setFailed(false)
    void fetchDocNativeView(id)
      .then(data => {
        setView(data)
        const spaceId = data.document.spaceId
        if (spaceId) {
          void fetchDocNativeMembers(spaceId)
            .then(rows => setMembers(rows.filter(member => (member.permissions & DOC_NATIVE_PERMISSION.CONFIRM) !== 0)))
            .catch(() => setMembers([]))
        }
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => { load() }, [load])

  const handleSubmit = async () => {
    if (!view || id === null) return
    let values: { reviewerUserId: number }
    try { values = await form.validateFields() } catch { return }
    const reviewer = members.find(member => member.userId === values.reviewerUserId)
    const revisionId = view.document.draftRevisionId
    if (!revisionId) return
    const draftRevision = view.revisions?.find(item => item.id === revisionId)
    Modal.confirm({
      title: t('docNative.submitConfirmTitle'),
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      content: <div className="confirm-info-card">
        <div className="confirm-info-row"><span>{t('docNative.number')}：</span><b>{view.document.documentNo}</b></div>
        <div className="confirm-info-row"><span>{t('docNative.version')}：</span><b>{draftRevision ? `v${draftRevision.revisionNo}` : `#${revisionId}`}</b></div>
        <div className="confirm-info-row"><span>{t('docNative.reviewer')}：</span><b>{reviewer?.name ?? '-'}</b></div>
      </div>,
      okText: t('docNative.submitConfirmation'),
      cancelText: t('docNative.cancel'),
      onOk: async () => {
        setSubmitting(true)
        try {
          await submitDocNativeConfirmation(id, {
            expectedVersion: view.document.version, revisionId, reviewerUserId: values.reviewerUserId,
          })
          message.success(t('docNative.submitSuccess'))
          load()
        } catch (error) {
          if (isDocNativeConflict(error)) load()
          throw error
        } finally {
          setSubmitting(false)
        }
      },
    })
  }

  const handleDecision = (decision: Decision) => {
    if (!view) return
    const pending = view.confirmations?.find(record => record.status === 1)
    if (!pending) return
    if (decision === 'reject' && !note.trim()) { message.warning(t('docNative.rejectNoteRequired')); return }
    Modal.confirm({
      title: t(`docNative.decisionConfirm.${decision}`),
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      content: <div className="confirm-info-card">
        <div className="confirm-info-row"><span>{t('docNative.number')}：</span><b>{view.document.documentNo}</b></div>
        <div className="confirm-info-row"><span>{t('docNative.version')}：</span><b>#{pending.revisionId}</b></div>
        <div className="confirm-info-row"><span>{t('docNative.note')}：</span><b>{note.trim() || '—'}</b></div>
      </div>,
      okText: t('docNative.confirm'),
      cancelText: t('docNative.cancel'),
      okButtonProps: { danger: decision === 'reject' },
      onOk: async () => {
        setSubmitting(true)
        try {
          await decideDocNativeConfirmation(pending.id, {
            expectedVersion: view.document.version, decision, note: note.trim() || undefined,
          })
          message.success(t('docNative.decisionSuccess'))
          setNote('')
          load()
        } catch (error) {
          if (isDocNativeConflict(error)) load()
          throw error
        } finally {
          setSubmitting(false)
        }
      },
    })
  }

  if (loading) return <div className="content-area"><div style={{ minHeight: 400, display: 'grid', placeItems: 'center' }} role="status"><Spin size="large" /></div></div>
  if (failed || !view) return <div className="content-area">
    <DocPlanFormHeader title={t('docNative.confirmTitle')} onBack={() => navigate('/doc-plans')} />
    <Result status="error" title={t('docNative.unavailable')} subTitle={t('docNative.unavailableHint')}
      extra={<Button onClick={load}>{t('docNative.retry')}</Button>} />
  </div>

  const pending = view.confirmations?.find(record => record.status === 1)
  const canRequest = view.allowedActions?.includes('confirm-request') ?? false
  const canDecide = view.allowedActions?.includes('confirm-decision') ?? false
  const effectiveRevision = view.revisions?.find(item => item.id === view.document.effectiveRevisionId)
  const draftRevision = view.revisions?.find(item => item.id === view.document.draftRevisionId)
  return <div className="content-area">
    <DocPlanFormHeader title={t('docNative.confirmTitle')} onBack={() => navigate('/doc-plans')} />
    <div style={docPlanCardStyle}>
      <DocPlanSectionTitle icon={<CheckCircleOutlined />} title={t('docNative.currentState')} />
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 13, color: '#595959' }}>
        <span>{t('docNative.number')}：<b>{view.document.documentNo}</b></span>
        <span>{t('docNative.title')}：<b>{view.revision.title}</b></span>
        <span>{t('docNative.effective')}：<b>{effectiveRevision ? `v${effectiveRevision.revisionNo}` : '—'}</b></span>
        <span>{t('docNative.draft')}：<b>{draftRevision ? `v${draftRevision.revisionNo}` : '—'}</b></span>
        {pending && <Tag color="orange">{t('docNative.pendingConfirmation')}</Tag>}
      </div>
    </div>

    {pending ? <>
      {canDecide
        ? <div style={docPlanCardStyle}>
          <DocPlanSectionTitle icon={<AuditOutlined />} title={t('docNative.decisionSection')} />
          <Input.TextArea rows={3} maxLength={200} showCount value={note} onChange={event => setNote(event.target.value)}
            placeholder={t('docNative.noteHint')} style={{ marginBottom: 16 }} />
          <div style={{ display: 'flex', gap: 12 }}>
            <Button type="primary" loading={submitting} onClick={() => handleDecision('approve')}>{t('docNative.approve')}</Button>
            <Button danger loading={submitting} onClick={() => handleDecision('reject')}>{t('docNative.reject')}</Button>
            <Button loading={submitting} onClick={() => handleDecision('withdraw')}>{t('docNative.withdraw')}</Button>
          </div>
        </div>
        : <Alert type="info" showIcon message={t('docNative.waitingReviewer')} />}
    </> : canRequest
      ? <div style={docPlanCardStyle}>
        <DocPlanSectionTitle icon={<CheckCircleOutlined />} title={t('docNative.submitSection')} />
        {view.document.draftRevisionId
          ? <>
            <Form form={form} layout="vertical">
              <Form.Item name="reviewerUserId" label={t('docNative.reviewer')}
                extra={t('docNative.reviewerHint')}
                rules={[{ required: true, message: t('docNative.reviewerRequired') }]}>
                {/* 确认人必须是本空间持有 CONFIRM 位的成员；自由选员工会被后端 400 拒绝，故此处按空间成员收敛 */}
                <Select style={{ width: '100%' }} placeholder={t('docNative.reviewerPlaceholder')}
                  options={members.map(member => ({
                    value: member.userId,
                    label: member.empId ? `${member.name}(${member.empId})` : member.name,
                  }))} />
              </Form.Item>
            </Form>
            <Button type="primary" icon={<CheckCircleOutlined />} loading={submitting} onClick={handleSubmit}>{t('docNative.submitConfirmation')}</Button>
          </>
          : <Alert type="info" showIcon message={t('docNative.noDraftHint')} />}
      </div>
      : <Alert type="warning" showIcon message={t('docNative.noConfirmPermission')} />}
  </div>
}
