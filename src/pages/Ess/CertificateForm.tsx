import { useEffect, useState } from 'react'
import { ArrowLeftOutlined, SaveOutlined, SendOutlined } from '@ant-design/icons'
import { Alert, Button, Card, DatePicker, Form, Input, InputNumber, Modal, Select, message } from 'antd'
import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import { useAuth } from '../../contexts/AuthContext'
import {
  CERT_DETAIL_PATH, CERT_EDITABLE, CERT_LIST_PATH, fetchCertificateDetail,
  saveAndSubmitCertificate, saveCertificateDraft, updateCertificate, type CertificatePayload,
} from '../../api/hrCertificate'
import { CERT_LANG_LABEL_KEY, CERT_TYPE_LABEL_KEY, CERT_TYPE_ORDER, SENSITIVE_CERT_TYPES } from './meta'

interface FormValues {
  certType?: string
  purpose?: string
  recipient?: string
  language?: string
  copies?: number
  expectDate?: Dayjs
  remark?: string
}

/** 证明开具申请表单页（新增/编辑草稿；提交走 OA 审批 + 二次确认） */
export default function CertificateForm() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { t } = useTranslation()
  const { hasPermission } = useAuth()
  const canEdit = hasPermission('ess-certificate:edit')
  const editId = Number(searchParams.get('id')) || undefined
  /** 期望取得日期不得早于今天（与后端 applyDto 同口径，前端先拦一层） */
  const disabledPastDate = (current: Dayjs) => current.isBefore(dayjs().startOf('day'))

  const [form] = Form.useForm<FormValues>()
  const [readonly, setReadonly] = useState(false)
  const [saving, setSaving] = useState(false)

  /** 编辑回填 */
  useEffect(() => {
    if (editId == null) return
    fetchCertificateDetail(editId)
      .then(item => {
        if (!CERT_EDITABLE.includes(item.status)) setReadonly(true)
        form.setFieldsValue({
          certType: item.certType,
          purpose: item.purpose,
          recipient: item.recipient ?? undefined,
          language: item.language,
          copies: item.copies,
          expectDate: item.expectDate ? dayjs(item.expectDate) : undefined,
          remark: item.remark ?? undefined,
        })
      })
      .catch(() => undefined)
  }, [editId, form])

  const certType = Form.useWatch('certType', form)
  const isIncome = certType != null && SENSITIVE_CERT_TYPES.includes(certType)

  const buildValues = (values: FormValues): CertificatePayload => ({
    certType: values.certType as string,
    purpose: (values.purpose as string).trim(),
    recipient: values.recipient?.trim() || undefined,
    language: values.language,
    copies: values.copies as number,
    expectDate: values.expectDate?.format('YYYY-MM-DD'),
    remark: values.remark?.trim() || undefined,
  })

  const handleSaveDraft = async () => {
    const values = await form.validateFields()
    setSaving(true)
    try {
      const payload = buildValues(values)
      const saved = editId == null
        ? await saveCertificateDraft(payload)
        : await updateCertificate(editId, payload)
      message.success(t('hrLeave.saved'))
      navigate(`${CERT_DETAIL_PATH}?id=${saved.id}`, { replace: true })
    } catch {
      // 请求层已提示
    } finally {
      setSaving(false)
    }
  }

  /** 提交申请：校验 → 二次确认 → 保存并提交 OA 审批 */
  const handleSubmit = async () => {
    const values = await form.validateFields()
    const payload = buildValues(values)
    Modal.confirm({
      title: t('hrLeave.confirmSubmitTitle'),
      className: 'custom-confirm-modal',
      icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>{t('hrCert.certType')}：</span>
            <b>{CERT_TYPE_LABEL_KEY[payload.certType] ? t(CERT_TYPE_LABEL_KEY[payload.certType]) : payload.certType}</b></div>
          <div className="confirm-info-row"><span>{t('hrCert.purpose')}：</span><b>{payload.purpose}</b></div>
          <div className="confirm-info-row"><span>{t('hrCert.recipient')}：</span><b>{payload.recipient || '-'}</b></div>
          <div className="confirm-info-row"><span>{t('hrCert.copies')}：</span><b>{payload.copies} {t('hrCert.copyUnit')}</b></div>
          <div className="confirm-info-row"><span>{t('hrCert.expectDate')}：</span><b>{payload.expectDate || '-'}</b></div>
        </div>
      ),
      okText: t('hrLeave.confirmSubmit'), cancelText: t('common.cancel'),
      onOk: async () => {
        const result = await saveAndSubmitCertificate(editId, payload)
        message.success(t('hrLeave.submitted', { flowNo: result.flowNo }))
        navigate(`${CERT_DETAIL_PATH}?id=${result.id}`, { replace: true })
      },
    })
  }

  const headerStyle: CSSProperties = {
    position: 'relative', background: '#fff', marginBottom: 16,
    borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden',
  }

  return (
    <div className="content-area">
      <div style={headerStyle}>
        <div style={{
          height: 3, background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB65D, #F59432, #E8720C)',
          backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite',
        }} />
        <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(CERT_LIST_PATH)}>{t('common.back')}</Button>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{t('hrCert.formTitle')}</div>
            {readonly && <div style={{ fontSize: 12, color: '#FF4D4F' }}>{t('hrLeave.readonlyTip')}</div>}
          </div>
        </div>
      </div>

      <Card size="small" style={{ borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <Form form={form} layout="vertical" disabled={readonly}
          initialValues={{ language: 'ZH', copies: 1 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0 16px' }}>
            <Form.Item name="certType" label={t('hrCert.certType')}
              rules={[{ required: true, message: t('hrCert.certTypeRequired') }]}>
              <Select placeholder={t('common.pleaseSelect')}
                options={CERT_TYPE_ORDER.map(code => ({ value: code, label: t(CERT_TYPE_LABEL_KEY[code]) }))} />
            </Form.Item>
            <Form.Item name="language" label={t('hrCert.language')}
              extra={isIncome ? t('hrCert.incomeTip') : undefined}>
              <Select options={Object.keys(CERT_LANG_LABEL_KEY).map(code => ({
                value: code, label: t(CERT_LANG_LABEL_KEY[code]),
              }))} />
            </Form.Item>
          </div>
          {isIncome && (
            <Alert type="warning" showIcon style={{ marginBottom: 12 }} message={t('hrCert.incomeTip')} />
          )}
          <Form.Item name="purpose" label={t('hrCert.purpose')}
            rules={[{ required: true, message: t('hrCert.purposeRequired') }]}>
            <Input maxLength={200} showCount placeholder={t('hrCert.purposePlaceholder')} />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0 16px' }}>
            <Form.Item name="recipient" label={t('hrCert.recipient')} extra={t('hrCert.recipientHint')}>
              <Input maxLength={200} placeholder={t('hrCert.recipientPlaceholder')} />
            </Form.Item>
            <Form.Item name="copies" label={t('hrCert.copies')}
              rules={[{ required: true, message: t('hrCert.copiesRequired') }]}>
              <InputNumber min={1} max={20} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="expectDate" label={t('hrCert.expectDate')}>
              <DatePicker style={{ width: '100%' }} disabledDate={disabledPastDate} />
            </Form.Item>
          </div>
          <Form.Item name="remark" label={t('hrCert.remark')}>
            <Input.TextArea rows={2} maxLength={500} showCount placeholder={t('hrCert.remarkPlaceholder')} />
          </Form.Item>
        </Form>
      </Card>

      {!readonly && canEdit && (
        <div className="form-footer">
          <Button onClick={() => navigate(editId != null ? `${CERT_DETAIL_PATH}?id=${editId}` : CERT_LIST_PATH)}>
            {t('common.cancel')}
          </Button>
          <Button icon={<SaveOutlined />} loading={saving} onClick={handleSaveDraft}>{t('hrLeave.saveDraft')}</Button>
          <Button type="primary" icon={<SendOutlined />} loading={saving} onClick={handleSubmit}>
            {t('hrLeave.submitApproval')}
          </Button>
        </div>
      )}
    </div>
  )
}
