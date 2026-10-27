/**
 * 法人主體新增 / 編輯 / 詳情（/hcm-org-legal-form 与 /hcm-org-legal-detail）
 *
 * 形式按全局表单页规范：橙色渐变顶条 + 橙色返回 + 蓝色标题，模块卡片用白色 div，
 * Form layout="vertical" + 3 列 grid，底部 .form-footer（详情模式隐藏）。
 * 「核實狀態」是 HR 核對營業執照後才改的開關，未核實不得用於正式計薪，因此單獨成行並給提示。
 */
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Form, Input, Select, Switch, Tag, message } from 'antd'
import { ArrowLeftOutlined, SaveOutlined, BankOutlined, SafetyCertificateOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import {
  JURISDICTION_OPTIONS,
  createLegalEntity,
  getLegalEntity,
  updateLegalEntity,
  type OrgLegalEntity,
} from '@/api/hcmOrganization'

const cardStyle: React.CSSProperties = {
  border: '1px solid #e8eaed',
  borderRadius: 8,
  background: '#fff',
  padding: '20px 24px',
  marginBottom: 16,
  boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
}

function CardTitle({ icon, title, tone }: { icon: React.ReactNode; title: string; tone: 'blue' | 'orange' }) {
  const palette = tone === 'blue' ? { bg: '#e6f7ff', color: '#1890ff' } : { bg: '#fff7e6', color: '#fa8c16' }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
      <div style={{ width: 28, height: 28, borderRadius: 6, background: palette.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 14, color: palette.color, display: 'inline-flex' }}>{icon}</span>
      </div>
      <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{title}</span>
      <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
    </div>
  )
}

export default function HcmOrgLegalEntityForm() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const id = params.get('id') ? Number(params.get('id')) : null
  const isDetail = window.location.hash.includes('/hcm-org-legal-detail')
  const isEdit = !!id && !isDetail

  const [form] = Form.useForm<OrgLegalEntity>()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [updatedBy, setUpdatedBy] = useState<string>('')
  const [updatedAt, setUpdatedAt] = useState<string>('')

  const loadDetail = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const detail = await getLegalEntity(id)
      form.setFieldsValue(detail)
      setUpdatedBy(detail.updatedBy ?? '')
      // 后端 LocalDateTime 已被全局 Jackson 转成毫秒时间戳
      setUpdatedAt(detail.updatedAt ? new Date(Number(detail.updatedAt)).toLocaleString() : '')
    } finally {
      setLoading(false)
    }
  }, [id, form])

  useEffect(() => {
    void loadDetail()
  }, [loadDetail])

  const handleSubmit = async () => {
    const values = await form.validateFields()
    setSaving(true)
    try {
      if (isEdit && id) {
        await updateLegalEntity(id, values)
      } else {
        await createLegalEntity(values)
      }
      message.success(t('hcmOrg.saveSuccess'))
      navigate('/hcm-org-legal')
    } finally {
      setSaving(false)
    }
  }

  const title = isDetail ? t('hcmOrg.legal.detailTitle') : isEdit ? t('hcmOrg.legal.editTitle') : t('hcmOrg.legal.addTitle')

  return (
    <div className="content-area">
      <div style={{ position: 'relative', background: '#fff', marginBottom: 16, borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
        <div style={{
          height: 3,
          background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
          backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite',
        }} />
        <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Button
              type="primary"
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate('/hcm-org-legal')}
              style={{
                backgroundColor: '#E8720C', borderColor: '#E8720C', borderRadius: 8, height: 36,
                padding: '0 16px', display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            >
              {t('common.back')}
            </Button>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>{title}</h2>
            {isDetail && id && <Tag color="blue">ID {id}</Tag>}
          </div>
        </div>
      </div>

      <Form form={form} layout="vertical" disabled={isDetail} initialValues={{ jurisdiction: 'CN', status: 1, verifyStatus: 0, sortOrder: 0 }}>
        <div style={cardStyle}>
          <CardTitle icon={<BankOutlined />} title={t('hcmOrg.legal.basicInfo')} tone="blue" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <Form.Item name="code" label={t('hcmOrg.legal.code')} rules={[{ required: true, message: t('hcmOrg.legal.codeRequired') }]}>
              <Input placeholder={t('hcmOrg.legal.codePlaceholder')} maxLength={32} />
            </Form.Item>
            <Form.Item name="name" label={t('hcmOrg.legal.name')} rules={[{ required: true, message: t('hcmOrg.legal.nameRequired') }]}>
              <Input placeholder={t('hcmOrg.legal.namePlaceholder')} maxLength={128} />
            </Form.Item>
            <Form.Item name="nameEn" label={t('hcmOrg.legal.nameEn')}>
              <Input maxLength={128} />
            </Form.Item>
            <Form.Item name="jurisdiction" label={t('hcmOrg.legal.jurisdiction')} rules={[{ required: true, message: t('hcmOrg.legal.jurisdictionRequired') }]}>
              <Select options={[...JURISDICTION_OPTIONS]} />
            </Form.Item>
            <Form.Item name="registrationNo" label={t('hcmOrg.legal.registrationNo')}>
              <Input maxLength={64} placeholder={t('hcmOrg.legal.registrationNoPlaceholder')} />
            </Form.Item>
            <Form.Item name="sortOrder" label={t('hcmOrg.sortOrder')}>
              <Input type="number" />
            </Form.Item>
            <Form.Item name="registeredAddress" label={t('hcmOrg.legal.registeredAddress')} style={{ gridColumn: '1 / -1' }}>
              <Input maxLength={255} />
            </Form.Item>
          </div>
        </div>

        <div style={cardStyle}>
          <CardTitle icon={<SafetyCertificateOutlined />} title={t('hcmOrg.legal.verifySection')} tone="orange" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <Form.Item name="verifyStatus" label={t('hcmOrg.legal.verifyStatus')} valuePropName="checked" getValueFromEvent={(checked: boolean) => (checked ? 1 : 0)} getValueProps={(value: number) => ({ checked: value === 1 })}>
              <Switch checkedChildren={t('hcmOrg.legal.verified')} unCheckedChildren={t('hcmOrg.legal.pendingVerify')} />
            </Form.Item>
            <Form.Item name="status" label={t('hcmOrg.status')} valuePropName="checked" getValueFromEvent={(checked: boolean) => (checked ? 1 : 0)} getValueProps={(value: number) => ({ checked: value === 1 })}>
              <Switch checkedChildren={t('hcmOrg.enabled')} unCheckedChildren={t('hcmOrg.disabled')} />
            </Form.Item>
            <Form.Item label={t('hcmOrg.legal.verifyHintLabel')}>
              {/* 只读说明：核实状态不是开关文案能表达清楚的规则，用整行灰字而不是 tooltip 长文 */}
              <span style={{ fontSize: 12, color: '#8C8C8C' }}>{t('hcmOrg.legal.verifyHint')}</span>
            </Form.Item>
            <Form.Item name="remark" label={t('hcmOrg.remark')} style={{ gridColumn: '1 / -1' }}>
              <Input.TextArea rows={3} maxLength={200} showCount style={{ resize: 'none' }} />
            </Form.Item>
          </div>
        </div>
      </Form>

      {/* 详情模式以「最后更新」收尾，不展示完整操作日志（§D.4） */}
      {isDetail && (
        <div style={{ background: '#fafafa', borderRadius: 8, padding: '12px 24px', border: '1px solid #f0f0f0', display: 'flex', justifyContent: 'flex-end', gap: 24 }}>
          <span style={{ fontSize: 12, color: '#8C8C8C' }}>{t('hcmOrg.updatedBy')}：<span style={{ color: '#595959' }}>{updatedBy || '-'}</span></span>
          <span style={{ fontSize: 12, color: '#8C8C8C' }}>{t('hcmOrg.updatedAt')}：<span style={{ color: '#595959' }}>{updatedAt || '-'}</span></span>
        </div>
      )}

      {!isDetail && (
        <div className="form-footer">
          <Button onClick={() => navigate('/hcm-org-legal')}>{t('common.cancel')}</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={saving || loading} onClick={handleSubmit}>
            {t('common.save')}
          </Button>
        </div>
      )}
    </div>
  )
}
