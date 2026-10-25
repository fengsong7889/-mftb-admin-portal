import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Descriptions, Form, Input, Modal, Result, Select, Spin, Tag, message } from 'antd'
import { SwapOutlined } from '@ant-design/icons'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/contexts/AuthContext'
import {
  DOC_NATIVE_PERMISSION, acceptDocNativeHandoff, createDocNativeHandoff, fetchDocNativeMembers,
  fetchDocNativeView, formatDocNativeTime, isDocNativeConflict, parseDocNativeId,
} from '@/api/docNative'
import type { DocNativeMember, DocNativeView } from '@/api/docNative'
import { DocPlanFormHeader, DocPlanSectionTitle } from './docPlanUi'
import { docPlanCardStyle } from './docPlanStyle'

interface HandoffValues {
  recipientUserId: number
  completedText: string
  remainingText: string
  riskText?: string
}

export default function DocPlanHandoff() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { search } = useLocation()
  const navigate = useNavigate()
  const id = parseDocNativeId(search)
  const [form] = Form.useForm<HandoffValues>()
  const [view, setView] = useState<DocNativeView>()
  const [members, setMembers] = useState<DocNativeMember[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(() => {
    if (id === null) { setLoading(false); setFailed(true); return }
    setLoading(true); setFailed(false)
    void fetchDocNativeView(id)
      .then(data => {
        setView(data)
        const spaceId = data.document.spaceId
        if (spaceId) {
          void fetchDocNativeMembers(spaceId)
            .then(rows => setMembers(rows.filter(member =>
              (member.permissions & DOC_NATIVE_PERMISSION.EDIT) !== 0 && member.userId !== user?.id)))
            .catch(() => setMembers([]))
        }
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false))
  }, [id, user?.id])

  useEffect(() => { load() }, [load])

  const handleCreate = async () => {
    if (!view || id === null) return
    let values: HandoffValues
    try { values = await form.validateFields() } catch { return }
    const baseline = view.document.adoptedRevisionId ?? view.document.effectiveRevisionId
    if (!baseline) return
    const recipient = members.find(member => member.userId === values.recipientUserId)
    Modal.confirm({
      title: t('docNative.handoffConfirmTitle'),
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      content: <div className="confirm-info-card">
        <div className="confirm-info-row"><span>{t('docNative.number')}：</span><b>{view.document.documentNo}</b></div>
        <div className="confirm-info-row"><span>{t('docNative.adopted')}：</span><b>#{baseline}</b></div>
        <div className="confirm-info-row"><span>{t('docNative.recipient')}：</span><b>{recipient?.name ?? '-'}</b></div>
      </div>,
      okText: t('docNative.handoffCreate'),
      cancelText: t('docNative.cancel'),
      onOk: async () => {
        setSubmitting(true)
        try {
          await createDocNativeHandoff(id, {
            expectedVersion: view.document.version,
            revisionId: baseline,
            recipientUserId: values.recipientUserId,
            completedText: values.completedText.trim(),
            remainingText: values.remainingText.trim(),
            riskText: values.riskText?.trim() || undefined,
          })
          message.success(t('docNative.handoffSuccess'))
          form.resetFields()
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

  const handleAccept = (handoffId: number) => {
    if (!view) return
    Modal.confirm({
      title: t('docNative.acceptConfirmTitle'),
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      content: <div className="confirm-info-card">
        <div className="confirm-info-row"><span>{t('docNative.number')}：</span><b>{view.document.documentNo}</b></div>
        <div className="confirm-info-row"><span>{t('docNative.adopted')}：</span><b>#{view.handoffs?.find(item => item.id === handoffId)?.revisionId ?? '—'}</b></div>
      </div>,
      okText: t('docNative.accept'),
      cancelText: t('docNative.cancel'),
      onOk: async () => {
        setSubmitting(true)
        try {
          await acceptDocNativeHandoff(handoffId, { expectedVersion: view.document.version })
          message.success(t('docNative.acceptSuccess'))
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
    <DocPlanFormHeader title={t('docNative.handoffTitle')} onBack={() => navigate('/doc-plans')} />
    <Result status="error" title={t('docNative.unavailable')} subTitle={t('docNative.unavailableHint')}
      extra={<Button onClick={load}>{t('docNative.retry')}</Button>} />
  </div>

  const baseline = view.document.adoptedRevisionId ?? view.document.effectiveRevisionId
  const canHandoff = (view.allowedActions?.includes('handoff') ?? false) && !!baseline
  const pending = (view.handoffs ?? []).filter(item => item.status === 1)
  const mine = pending.filter(item => item.recipientUserId === user?.id)
  return <div className="content-area">
    <DocPlanFormHeader title={t('docNative.handoffTitle')} onBack={() => navigate('/doc-plans')} />
    <div style={docPlanCardStyle}>
      <DocPlanSectionTitle icon={<SwapOutlined />} title={t('docNative.currentState')} />
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 13, color: '#595959' }}>
        <span>{t('docNative.number')}：<b>{view.document.documentNo}</b></span>
        <span>{t('docNative.title')}：<b>{view.revision.title}</b></span>
        <span>{t('docNative.adopted')}：<b>{baseline ? `#${baseline}` : '—'}</b></span>
        {pending.length > 0 && <Tag color="orange">{t('docNative.pendingHandoff')}</Tag>}
      </div>
    </div>

    {mine.length > 0 && <div style={docPlanCardStyle}>
      <DocPlanSectionTitle icon={<SwapOutlined />} title={t('docNative.acceptSection')} />
      {mine.map(item => <Descriptions key={item.id} column={3} size="small" style={{ marginBottom: 16 }} items={[
        { key: 'version', label: t('docNative.adopted'), children: `#${item.revisionId}` },
        { key: 'done', label: t('docNative.handoffCompleted'), children: item.completedText },
        { key: 'remaining', label: t('docNative.handoffRemaining'), children: item.remainingText || '—' },
        { key: 'risk', label: t('docNative.handoffRisk'), children: item.riskText || '—', span: 2 },
        { key: 'time', label: t('docNative.savedAt'), children: formatDocNativeTime(item.createdAt) },
      ]} />)}
      {mine.map(item => <Button key={item.id} type="primary" loading={submitting} onClick={() => handleAccept(item.id)}>
        {t('docNative.accept')}
      </Button>)}
    </div>}

    {canHandoff
      ? <div style={docPlanCardStyle}>
        <DocPlanSectionTitle icon={<SwapOutlined />} title={t('docNative.handoffCreateSection')} />
        <Form form={form} layout="vertical">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
            <Form.Item name="recipientUserId" label={t('docNative.recipient')} extra={t('docNative.recipientHint')}
              rules={[{ required: true, message: t('docNative.recipientRequired') }]}>
              {/* 接手人必须是本空间可编辑成员：交接不能自动扩大权限范围 */}
              <Select style={{ width: '100%' }} placeholder={t('docNative.recipientPlaceholder')}
                options={members.map(member => ({
                  value: member.userId,
                  label: member.empId ? `${member.name}(${member.empId})` : member.name,
                }))} />
            </Form.Item>
            <div />
            <Form.Item name="completedText" label={t('docNative.handoffCompleted')} rules={[{ required: true, whitespace: true, max: 2000 }]}>
              <Input.TextArea rows={3} maxLength={2000} showCount placeholder={t('docNative.handoffCompletedHint')} />
            </Form.Item>
            <Form.Item name="remainingText" label={t('docNative.handoffRemaining')} rules={[{ required: true, whitespace: true, max: 2000 }]}>
              <Input.TextArea rows={3} maxLength={2000} showCount placeholder={t('docNative.handoffRemainingHint')} />
            </Form.Item>
            <Form.Item name="riskText" label={t('docNative.handoffRisk')} style={{ gridColumn: '1 / -1' }} rules={[{ max: 2000 }]}>
              <Input.TextArea rows={3} maxLength={2000} showCount placeholder={t('docNative.handoffRiskHint')} />
            </Form.Item>
          </div>
        </Form>
        <div className="form-footer">
          <Button onClick={() => navigate('/doc-plans')}>{t('docNative.cancel')}</Button>
          <Button type="primary" loading={submitting} onClick={handleCreate}>{t('docNative.handoffCreate')}</Button>
        </div>
      </div>
      : <Alert type="info" showIcon message={baseline ? t('docNative.handoffNotAllowed') : t('docNative.noBaselineHint')} />}
  </div>
}
