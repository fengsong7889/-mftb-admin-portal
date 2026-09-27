import { useCallback, useEffect, useState } from 'react'
import { ArrowLeftOutlined, SaveOutlined } from '@ant-design/icons'
import { Alert, Button, Card, DatePicker, Descriptions, Form, Input, Modal, Select, Tag, message } from 'antd'
import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import { useAuth } from '../../../contexts/AuthContext'
import {
  CERT_LEDGER_PATH, fetchCertificateDetail, issueCertificate, type CertificateItem,
} from '../../../api/hrCertificate'
import {
  CERT_LANG_LABEL_KEY, CERT_PICKUP_LABEL_KEY, CERT_PICKUP_ORDER, CERT_TYPE_LABEL_KEY,
} from '../../Ess/meta'

interface FormValues {
  certNo?: string
  issueDate?: Dayjs
  pickupType?: string
  remark?: string
}

/**
 * 开具登记页（人事）：审批通过的申请在此登记实际出具的证明编号、开具日期与领取方式。
 * <p>
 * 只有本页写完后单据才进入「已開具」，因此不提供批量开具，也不允许跳过编号。
 */
export default function CertificateIssueForm() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { t } = useTranslation()
  const { hasPermission } = useAuth()
  const id = Number(searchParams.get('id'))
  const canIssue = hasPermission('hr-certificate:edit')

  const [form] = Form.useForm<FormValues>()
  const [item, setItem] = useState<CertificateItem | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    try {
      const data = await fetchCertificateDetail(id)
      setItem(data)
      form.setFieldsValue({
        certNo: data.certNo ?? undefined,
        issueDate: data.issueDate ? dayjs(data.issueDate) : dayjs(),
        pickupType: data.pickupType ?? 'SELF',
      })
    } catch {
      // 请求层已提示
    }
  }, [id, form])

  useEffect(() => { load() }, [load])

  const notIssuable = !!item && item.status !== 'approved'

  const handleSubmit = async () => {
    let values: FormValues
    try {
      values = await form.validateFields()
    } finally {
      // 校验失败也要解除 loading，否则按钮会永久转圈
      setSaving(false)
    }
    if (!item) return
    const payload = {
      certNo: (values.certNo as string).trim(),
      issueDate: (values.issueDate as Dayjs).format('YYYY-MM-DD'),
      pickupType: values.pickupType as string,
      remark: values.remark?.trim() || undefined,
    }
    Modal.confirm({
      title: t('hrCert.confirmIssueTitle'),
      className: 'custom-confirm-modal',
      icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>{t('hrCert.reqNo')}：</span><b>{item.reqNo}</b></div>
          <div className="confirm-info-row"><span>{t('hrCert.applicant')}：</span>
            <b>{item.empName}{item.empNo ? ` (${item.empNo})` : ''}</b></div>
          <div className="confirm-info-row"><span>{t('hrCert.certType')}：</span>
            <b>{CERT_TYPE_LABEL_KEY[item.certType] ? t(CERT_TYPE_LABEL_KEY[item.certType]) : item.certType}</b></div>
          <div className="confirm-info-row"><span>{t('hrCert.certNo')}：</span><b>{payload.certNo}</b></div>
          <div className="confirm-info-row"><span>{t('hrCert.issueDate')}：</span><b>{payload.issueDate}</b></div>
        </div>
      ),
      okText: t('hrCert.confirmIssue'), cancelText: t('common.cancel'),
      onOk: async () => {
        await issueCertificate(item.id, payload)
        message.success(t('hrCert.issueDone', { certNo: payload.certNo }))
        navigate(`${CERT_LEDGER_PATH}-detail?id=${item.id}`, { replace: true })
      },
    })
  }

  const headerStyle: CSSProperties = {
    position: 'relative', background: '#fff', marginBottom: 16,
    borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden',
  }
  const typeLabel = item ? (CERT_TYPE_LABEL_KEY[item.certType] ? t(CERT_TYPE_LABEL_KEY[item.certType]) : item.certType) : '-'
  const langLabel = item ? (CERT_LANG_LABEL_KEY[item.language] ? t(CERT_LANG_LABEL_KEY[item.language]) : item.language) : '-'

  return (
    <div className="content-area">
      <div style={headerStyle}>
        <div style={{
          height: 3, background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB65D, #F59432, #E8720C)',
          backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite',
        }} />
        <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(CERT_LEDGER_PATH)}>{t('common.back')}</Button>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{t('hrCert.issueTitle')}</div>
            {item && (
              <div style={{ fontSize: 12, color: '#8C8C8C' }}>
                {item.reqNo} · {item.empName}{item.empNo ? `(${item.empNo})` : ''}
              </div>
            )}
          </div>
        </div>
      </div>

      {notIssuable && (
        <Alert type="warning" showIcon style={{ marginBottom: 16 }}
          message={t('hrCert.notIssuableTip')} />
      )}

      <Card size="small" style={{ borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', marginBottom: 16 }}
        title={t('hrCert.sectionInfo')}>
        <Descriptions column={{ xs: 1, sm: 2, md: 3 }} size="small">
          <Descriptions.Item label={t('hrCert.certType')}>
            <Tag color="cyan">{typeLabel}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label={t('hrCert.purpose')}>{item?.purpose || '-'}</Descriptions.Item>
          <Descriptions.Item label={t('hrCert.copies')}>
            {item ? `${item.copies} ${t('hrCert.copyUnit')}` : '-'}
          </Descriptions.Item>
          <Descriptions.Item label={t('hrCert.recipient')}>{item?.recipient || '-'}</Descriptions.Item>
          <Descriptions.Item label={t('hrCert.language')}>{langLabel}</Descriptions.Item>
          <Descriptions.Item label={t('hrCert.expectDate')}>
            {item?.expectDate ? dayjs(item.expectDate).format('YYYY-MM-DD') : '-'}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card size="small" style={{ borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <Form form={form} layout="vertical" disabled={notIssuable || !canIssue}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0 16px' }}>
            <Form.Item name="certNo" label={t('hrCert.certNo')}
              rules={[{ required: true, message: t('hrCert.certNoRequired') }]}>
              <Input maxLength={64} placeholder={t('hrCert.certNoPlaceholder')} />
            </Form.Item>
            <Form.Item name="issueDate" label={t('hrCert.issueDate')}
              rules={[{ required: true, message: t('hrCert.issueDateRequired') }]}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="pickupType" label={t('hrCert.pickupType')}
              rules={[{ required: true, message: t('hrCert.pickupRequired') }]}>
              <Select options={CERT_PICKUP_ORDER.map(value => ({
                value, label: t(CERT_PICKUP_LABEL_KEY[value]),
              }))} />
            </Form.Item>
          </div>
          <Form.Item name="remark" label={t('hrCert.remark')}>
            <Input.TextArea rows={2} maxLength={300} showCount placeholder={t('hrCert.issueRemarkPlaceholder')} />
          </Form.Item>
        </Form>
      </Card>

      {!notIssuable && canIssue && (
        <div className="form-footer">
          <Button onClick={() => navigate(CERT_LEDGER_PATH)}>{t('common.cancel')}</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={saving}
            onClick={() => { setSaving(true); void handleSubmit() }}>
            {t('hrCert.issue')}
          </Button>
        </div>
      )}
    </div>
  )
}
