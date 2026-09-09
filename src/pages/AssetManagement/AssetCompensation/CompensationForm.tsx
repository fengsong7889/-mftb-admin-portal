/**
 * 賠付登記表單頁
 *
 * 業務閉環：從歸還記錄帶入資產 + 損失類型 → 填原因/責任人 → 提交
 *          提交後自動寫入變更歷史流水，狀態為「待定責」
 *
 * URL 參數：
 *  - returnId  歸還記錄 ID（可選）
 *  - assetId   資產 ID（必填）
 *  - damageType 損失類型 damage|loss（可選）
 */
import { useState, useEffect } from 'react'
import {
  Button, Form, Input, Select, Row, Col, Card, Spin, message, Descriptions, Tag,
} from 'antd'
import { SaveOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import {
  createCompensation, bindReturnCompensation,
} from '../../../api/eam'
import { fetchAssetDetail, type AssetItem } from '../../../api/asset'
import { EAM_DEPARTMENTS } from '../eamUtils'

const CAUSE_OPTIONS = [
  { label: 'asset.causeHuman', value: 'human' },
  { label: 'asset.causeNatural', value: 'natural' },
  { label: 'asset.causeThirdParty', value: 'third_party' },
  { label: 'asset.causeQuality', value: 'quality' },
]

const DAMAGE_OPTIONS = [
  { label: 'asset.damageDamage', value: 'damage' },
  { label: 'asset.damageLoss', value: 'loss' },
]

interface FormValues {
  assetId: number
  damageType: 'damage' | 'loss'
  causeType: 'human' | 'natural' | 'third_party' | 'quality'
  liabilityDesc: string
  operator: string
  responsiblePerson?: string
  responsibleDept?: string
}

interface Props {
  /** 來源歸還記錄 ID */
  returnId?: number
  /** 資產 ID */
  assetId: number
  /** 損失類型 */
  damageType?: 'damage' | 'loss'
  onBack: () => void
  onCreated?: (compId: number) => void
}

export default function CompensationForm({ returnId, assetId, damageType, onBack, onCreated }: Props) {
  const { t } = useTranslation()
  const [form] = Form.useForm<FormValues>()
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [asset, setAsset] = useState<AssetItem | null>(null)

  useEffect(() => {
    setLoading(true)
    fetchAssetDetail(assetId)
      .then(setAsset)
      .catch((e: Error) => message.error(e.message))
      .finally(() => setLoading(false))
  }, [assetId])

  useEffect(() => {
    if (damageType) form.setFieldsValue({ damageType })
  }, [damageType, form])

  const handleSubmit = async () => {
    try {
      const v = await form.validateFields()
      setSubmitting(true)
      const record = await createCompensation({
        assetId: v.assetId,
        damageType: v.damageType,
        causeType: v.causeType,
        liabilityDesc: v.liabilityDesc,
        operator: v.operator,
        returnId,
        responsiblePerson: v.responsiblePerson,
        responsibleDept: v.responsibleDept,
      })
      // 若來自歸還記錄，回填關聯
      if (returnId) await bindReturnCompensation(returnId, record.id)
      message.success(t('asset.compensationCreated'))
      onCreated?.(record.id)
    } catch (e: unknown) {
      if (e instanceof Error) message.error(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>

  return (
    <>
      {/* ====== 頂部標題欄（橙色漸變頂條） ====== */}
      <div style={{
        position: 'relative', background: '#fff', marginBottom: 16,
        borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden',
      }}>
        <div style={{
          height: 3, background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
          backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite',
        }} />
        <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
          <Button type="primary" icon={<ArrowLeftOutlined />} onClick={onBack}
            style={{ backgroundColor: '#E8720C', borderColor: '#E8720C', borderRadius: 8, height: 36, padding: '0 16px', boxShadow: '0 2px 6px rgba(232,114,12,0.25)' }}
          >{t('common.back')}</Button>
          <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>{t('asset.compensationAddTitle')}</h2>
        </div>
      </div>

      {asset && (
        <Card title={t('asset.sectionAssetInfo')} style={{ marginBottom: 16, borderRadius: 8 }} size="small">
          <Descriptions column={3} size="small">
            <Descriptions.Item label={t('asset.colAssetNo')}>
              <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{asset.assetNo}</span>
            </Descriptions.Item>
            <Descriptions.Item label={t('asset.colAssetName')}>{asset.assetName}</Descriptions.Item>
            <Descriptions.Item label={t('asset.colDepartment')}>{asset.department || '-'}</Descriptions.Item>
            <Descriptions.Item label={t('asset.colUserName')}>{asset.userName || '-'}</Descriptions.Item>
            <Descriptions.Item label={t('asset.colBrand')}>{asset.brand || '-'}</Descriptions.Item>
            <Descriptions.Item label={t('asset.colPurchaseValue')}>
              {asset.purchaseValue ? `MOP ${asset.purchaseValue.toLocaleString()}` : '-'}
            </Descriptions.Item>
          </Descriptions>
        </Card>
      )}

      <Card style={{ borderRadius: 8 }} bordered>
        <Form<FormValues> form={form} layout="vertical" initialValues={{ assetId, damageType: damageType || 'damage' }}>
          <Form.Item name="assetId" hidden><Input /></Form.Item>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item label={t('asset.colDamageType')} name="damageType" rules={[{ required: true }]}>
                <Select options={DAMAGE_OPTIONS.map((o) => ({ ...o, label: t(o.label) }))} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label={t('asset.colCauseType')} name="causeType" rules={[{ required: true, message: t('asset.causeTypeRequired') }]}>
                <Select options={CAUSE_OPTIONS.map((o) => ({ ...o, label: t(o.label) }))} placeholder={t('asset.causeTypePh')} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label={t('asset.colOperator')} name="operator" rules={[{ required: true, message: t('asset.operatorRequired') }]}>
                <Input placeholder={t('asset.userNamePh')} allowClear />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item label={t('asset.colResponsiblePerson')} name="responsiblePerson">
                <Input placeholder={t('asset.responsiblePersonPh')} allowClear />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label={t('asset.colResponsibleDept')} name="responsibleDept">
                <Select placeholder={t('common.pleaseSelect')} allowClear options={EAM_DEPARTMENTS.map((d) => ({ label: d, value: d }))} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item label={t('asset.colLiabilityDesc')} name="liabilityDesc" rules={[{ required: true, message: t('asset.liabilityDescRequired') }]}>
            <Input.TextArea rows={3} placeholder={t('asset.liabilityDescPh')} maxLength={500} showCount />
          </Form.Item>
        </Form>
      </Card>

      <div className="form-footer">
        <Button onClick={onBack}>{t('common.cancel')}</Button>
        <Button type="primary" icon={<SaveOutlined />} onClick={handleSubmit} loading={submitting}>
          {t('common.save')}
        </Button>
      </div>
    </>
  )
}
