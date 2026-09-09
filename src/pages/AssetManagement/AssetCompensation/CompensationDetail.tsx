/**
 * 賠付詳情頁
 *
 * 三階段流轉：
 *  - pending   → 定責確認（補全責任人/部門/賠付方式/金額）
 *  - confirmed → 確認賠付（登記賠付日期）
 *  - paid      → 只讀展示
 */
import { useState, useEffect, useCallback } from 'react'
import {
  Button, Form, Input, Select, Row, Col, Card, Spin, message, Descriptions, Tag, DatePicker, InputNumber, Modal,
} from 'antd'
import { SaveOutlined, CheckCircleOutlined, DollarOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import {
  fetchCompensationDetail, confirmCompensation, payCompensation,
  type CompensationRecord,
} from '../../../api/eam'
import { fetchAssetDetail, type AssetItem } from '../../../api/asset'
import { EAM_DEPARTMENTS } from '../eamUtils'

const STATUS_META: Record<CompensationRecord['status'], { key: string; color: string }> = {
  pending:   { key: 'asset.compPending',   color: 'warning' },
  confirmed: { key: 'asset.compConfirmed', color: 'processing' },
  paid:      { key: 'asset.compPaid',      color: 'success' },
}

const DAMAGE_META: Record<CompensationRecord['damageType'], { key: string; color: string }> = {
  damage: { key: 'asset.damageDamage', color: 'error' },
  loss:   { key: 'asset.damageLoss',   color: 'volcano' },
}

const CAUSE_META: Record<CompensationRecord['causeType'], { key: string }> = {
  human:       { key: 'asset.causeHuman' },
  natural:     { key: 'asset.causeNatural' },
  third_party: { key: 'asset.causeThirdParty' },
  quality:     { key: 'asset.causeQuality' },
}

const COMP_TYPE_META: Record<CompensationRecord['compType'], { key: string }> = {
  repair_cost:   { key: 'asset.compTypeRepair' },
  replace_price: { key: 'asset.compTypeReplace' },
  depreciated:   { key: 'asset.compTypeDepreciated' },
}

interface ConfirmFormValues {
  responsiblePerson: string
  responsibleDept: string
  liabilityDesc: string
  compType: 'repair_cost' | 'replace_price' | 'depreciated'
  compAmount: number
  operator: string
}

interface PayFormValues {
  paidDate: string
  operator: string
}

interface Props {
  compId: number
  onBack: () => void
  onViewAsset: (assetNo: string) => void
}

export default function CompensationDetail({ compId, onBack, onViewAsset }: Props) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [record, setRecord] = useState<CompensationRecord | null>(null)
  const [asset, setAsset] = useState<AssetItem | null>(null)

  const [confirmModalOpen, setConfirmModalOpen] = useState(false)
  const [payModalOpen, setPayModalOpen] = useState(false)
  const [confirmForm] = Form.useForm<ConfirmFormValues>()
  const [payForm] = Form.useForm<PayFormValues>()
  const [submitting, setSubmitting] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const rec = await fetchCompensationDetail(compId)
      setRecord(rec)
      const a = await fetchAssetDetail(rec.assetId)
      setAsset(a)
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : t('asset.queryFailed'))
    } finally {
      setLoading(false)
    }
  }, [compId, t])

  useEffect(() => { loadData() }, [loadData])

  const handleConfirm = async () => {
    try {
      const v = await confirmForm.validateFields()
      setSubmitting(true)
      await confirmCompensation(record!.id, v)
      message.success(t('asset.compConfirmed'))
      setConfirmModalOpen(false)
      loadData()
    } catch (e: unknown) {
      if (e instanceof Error) message.error(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handlePay = async () => {
    try {
      const v = await payForm.validateFields()
      setSubmitting(true)
      await payCompensation(record!.id, dayjs(v.paidDate).format('YYYY-MM-DD'), v.operator)
      message.success(t('asset.compPaid'))
      setPayModalOpen(false)
      loadData()
    } catch (e: unknown) {
      if (e instanceof Error) message.error(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
  if (!record) return <div style={{ textAlign: 'center', padding: 60 }}>{t('asset.compensationNotFound')}</div>

  const statusMeta = STATUS_META[record.status]

  return (
    <>
      <div style={{ background: '#fff', borderRadius: 8, padding: '16px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <Button type="primary" onClick={onBack}>{t('common.back')}</Button>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{t('asset.compensationDetailTitle')}</h2>
        <Tag color={statusMeta.color} style={{ marginLeft: 'auto' }}>{t(statusMeta.key)}</Tag>
      </div>

      {/* 資產信息 */}
      {asset && (
        <Card title={t('asset.sectionAssetInfo')} style={{ marginBottom: 16, borderRadius: 8 }} size="small">
          <Descriptions column={3} size="small">
            <Descriptions.Item label={t('asset.colAssetNo')}>
              <Button type="link" size="small" style={{ padding: 0, fontFamily: 'monospace', fontWeight: 600 }}
                onClick={() => onViewAsset(asset.assetNo)}
              >
                {asset.assetNo}
              </Button>
            </Descriptions.Item>
            <Descriptions.Item label={t('asset.colAssetName')}>{asset.assetName}</Descriptions.Item>
            <Descriptions.Item label={t('asset.colDepartment')}>{asset.department || '-'}</Descriptions.Item>
          </Descriptions>
        </Card>
      )}

      {/* 賠付基本信息 */}
      <Card title={t('asset.compensationDetailTitle')} style={{ marginBottom: 16, borderRadius: 8 }} size="small">
        <Descriptions column={3} size="small">
          <Descriptions.Item label={t('asset.colCompNo')}>
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{record.compNo}</span>
          </Descriptions.Item>
          <Descriptions.Item label={t('asset.colDamageType')}>
            <Tag color={DAMAGE_META[record.damageType].color}>{t(DAMAGE_META[record.damageType].key)}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label={t('asset.colCauseType')}>
            <Tag>{t(CAUSE_META[record.causeType].key)}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label={t('asset.colResponsiblePerson')} span={3}>
            {record.responsiblePerson || <span style={{ color: '#bfbfbf' }}>-</span>}
          </Descriptions.Item>
          <Descriptions.Item label={t('asset.colResponsibleDept')}>
            {record.responsibleDept || '-'}
          </Descriptions.Item>
          <Descriptions.Item label={t('asset.colCompType')}>
            {record.compAmount ? t(COMP_TYPE_META[record.compType].key) : '-'}
          </Descriptions.Item>
          <Descriptions.Item label={t('asset.colCompAmount')}>
            {record.compAmount ? <span style={{ fontWeight: 600, color: '#f5222d' }}>MOP {record.compAmount.toLocaleString()}</span> : '-'}
          </Descriptions.Item>
          <Descriptions.Item label={t('asset.colLiabilityDesc')} span={3}>
            {record.liabilityDesc || '-'}
          </Descriptions.Item>
          <Descriptions.Item label={t('asset.colPaidDate')}>
            {record.paidDate || '-'}
          </Descriptions.Item>
          <Descriptions.Item label={t('asset.colOperator')}>
            {record.operator}
          </Descriptions.Item>
          <Descriptions.Item label={t('asset.colCreatedAt')}>
            {record.createdAt}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {/* 操作按鈕 */}
      <div className="form-footer">
        {record.status === 'pending' && (
          <Button type="primary" icon={<CheckCircleOutlined />} onClick={() => {
            confirmForm.setFieldsValue({
              responsiblePerson: record.responsiblePerson || '',
              responsibleDept: record.responsibleDept || '',
              liabilityDesc: record.liabilityDesc || '',
              compType: record.compType || 'repair_cost',
              compAmount: record.compAmount || 0,
            })
            setConfirmModalOpen(true)
          }}>
            {t('asset.btnCompConfirm')}
          </Button>
        )}
        {record.status === 'confirmed' && (
          <Button type="primary" icon={<DollarOutlined />} onClick={() => {
            payForm.setFieldsValue({ paidDate: dayjs().format('YYYY-MM-DD') })
            setPayModalOpen(true)
          }}>
            {t('asset.btnCompPay')}
          </Button>
        )}
      </div>

      {/* 定責確認彈窗 */}
      <Modal
        title={t('asset.compensationConfirmTitle')}
        open={confirmModalOpen}
        onCancel={() => setConfirmModalOpen(false)}
        footer={null}
        width={560}
        destroyOnClose
      >
        <Form<ConfirmFormValues> form={confirmForm} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label={t('asset.colResponsiblePerson')} name="responsiblePerson" rules={[{ required: true, message: t('asset.responsiblePersonRequired') }]}>
                <Input placeholder={t('asset.responsiblePersonPh')} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label={t('asset.colResponsibleDept')} name="responsibleDept" rules={[{ required: true, message: t('asset.responsibleDeptRequired') }]}>
                <Select options={EAM_DEPARTMENTS.map((d) => ({ label: d, value: d }))} placeholder={t('common.pleaseSelect')} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label={t('asset.colLiabilityDesc')} name="liabilityDesc" rules={[{ required: true, message: t('asset.liabilityDescRequired') }]}>
            <Input.TextArea rows={2} maxLength={500} showCount />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label={t('asset.colCompType')} name="compType" rules={[{ required: true }]}>
                <Select options={[
                  { label: t('asset.compTypeRepair'), value: 'repair_cost' },
                  { label: t('asset.compTypeReplace'), value: 'replace_price' },
                  { label: t('asset.compTypeDepreciated'), value: 'depreciated' },
                ]} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label={t('asset.colCompAmount')} name="compAmount" rules={[{ required: true, message: t('asset.compAmountRequired') }]}>
                <InputNumber min={0} step={100} addonAfter="MOP" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label={t('asset.colOperator')} name="operator" rules={[{ required: true, message: t('asset.operatorRequired') }]}>
            <Input placeholder={t('asset.userNamePh')} allowClear />
          </Form.Item>
          <div style={{ textAlign: 'right', borderTop: '1px solid #f0f0f0', paddingTop: 12, marginTop: 8 }}>
            <Button onClick={() => setConfirmModalOpen(false)} style={{ marginRight: 8 }}>{t('common.cancel')}</Button>
            <Button type="primary" icon={<SaveOutlined />} onClick={handleConfirm} loading={submitting}>{t('common.confirm')}</Button>
          </div>
        </Form>
      </Modal>

      {/* 賠付執行彈窗 */}
      <Modal
        title={t('asset.btnCompPay')}
        open={payModalOpen}
        onCancel={() => setPayModalOpen(false)}
        footer={null}
        width={420}
        destroyOnClose
      >
        <Form<PayFormValues> form={payForm} layout="vertical">
          <Form.Item label={t('asset.colPaidDate')} name="paidDate" rules={[{ required: true, message: t('asset.paidDateRequired') }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label={t('asset.colOperator')} name="operator" rules={[{ required: true, message: t('asset.operatorRequired') }]}>
            <Input placeholder={t('asset.userNamePh')} allowClear />
          </Form.Item>
          <div style={{ textAlign: 'right', borderTop: '1px solid #f0f0f0', paddingTop: 12, marginTop: 8 }}>
            <Button onClick={() => setPayModalOpen(false)} style={{ marginRight: 8 }}>{t('common.cancel')}</Button>
            <Button type="primary" icon={<DollarOutlined />} onClick={handlePay} loading={submitting}>{t('common.confirm')}</Button>
          </div>
        </Form>
      </Modal>
    </>
  )
}
