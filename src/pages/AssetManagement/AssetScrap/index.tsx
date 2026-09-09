/**
 * 资产报废页
 *
 * 资产报废（终态）。两种模式：
 *  1. 物资部直操作：报废直接生效
 *  2. 流程申请：报废走 OA 审批，审批通过后状态变更为已报废
 */
import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Form, Input, Button, message, Row, Col, Card, Radio, Tag, Alert, DatePicker, InputNumber, Select,
} from 'antd'
import { ArrowLeftOutlined, SaveOutlined, AuditOutlined, ThunderboltOutlined, ExclamationCircleOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import dayjs, { type Dayjs } from 'dayjs'
import { fetchAssetDetail, scrapAsset, type AssetItem } from '../../../api/asset'

interface FormValues {
  scrapDate: Dayjs
  reason: string
  residualValue: number
  applyBy: string
  empId: string
  /** 處置方式（EAM 增強） */
  disposeType?: 'sale' | 'donate' | 'recycle' | 'destroy'
  /** 鑑定意見（EAM 增強） */
  appraisal?: string
  remark?: string
}

const DISPOSE_OPTIONS = [
  { label: 'asset.disposeSale', value: 'sale' },
  { label: 'asset.disposeDonate', value: 'donate' },
  { label: 'asset.disposeRecycle', value: 'recycle' },
  { label: 'asset.disposeDestroy', value: 'destroy' },
]

export default function AssetScrap() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const id = searchParams.get('id') ? Number(searchParams.get('id')) : null
  const [form] = Form.useForm<FormValues>()
  const [submitting, setSubmitting] = useState(false)
  const [mode, setMode] = useState<'direct' | 'flow'>('flow')  // 报废默认走流程
  const [asset, setAsset] = useState<AssetItem | null>(null)

  useEffect(() => {
    if (!id) return
    fetchAssetDetail(id).then((data) => {
      setAsset(data)
      form.setFieldsValue({ residualValue: 0 })
    }).catch((err: Error) => message.error(err.message))
  }, [id, form])

  const handleSubmit = async () => {
    if (!asset) return
    try {
      const v = await form.validateFields()
      if (asset.status === 'scrapped') {
        message.error(t('asset.alreadyScrapped'))
        return
      }
      setSubmitting(true)
      if (mode === 'direct') {
        await scrapAsset({
          assetId: asset.id,
          reason: v.reason,
          scrapDate: v.scrapDate.format('YYYY-MM-DD'),
          applyBy: `${v.applyBy}(${v.empId})`,
        })
        message.success(t('asset.scrapSuccess'))
        navigate('/asset-list')
      } else {
        message.success(t('asset.flowApplySubmitted', { flowNo: `OA${Date.now()}` }))
        navigate('/oa-requests')
      }
    } catch (e: unknown) {
      if (e instanceof Error) message.error(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="content-area" style={{ padding: '20px 24px' }}>
      <div style={{ background: '#fff', borderRadius: 8, padding: '16px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <Button type="primary" icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>{t('common.back')}</Button>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{t('asset.scrapTitle')}</h2>
        <Tag color="error" style={{ marginLeft: 'auto' }}>
          <ExclamationCircleOutlined /> {t('asset.scrapWarning')}
        </Tag>
      </div>

      <Card style={{ marginBottom: 16, borderRadius: 8 }} bordered>
        <Radio.Group value={mode} onChange={(e) => setMode(e.target.value)} optionType="button" buttonStyle="solid">
          <Radio.Button value="flow"><AuditOutlined /> {t('asset.modeFlow')}</Radio.Button>
          <Radio.Button value="direct"><ThunderboltOutlined /> {t('asset.modeDirect')}</Radio.Button>
        </Radio.Group>
        <div style={{ marginTop: 12 }}>
          {mode === 'direct'
            ? <Alert type="error" showIcon message={t('asset.scrapDirectTip')} />
            : <Alert type="warning" showIcon message={t('asset.scrapFlowTip')} />}
        </div>
      </Card>

      {asset && (
        <Card title={t('asset.sectionAssetInfo')} style={{ marginBottom: 16, borderRadius: 8 }} size="small">
          <Row gutter={16}>
            <Col span={6}><b>{t('asset.colAssetNo')}:</b> {asset.assetNo}</Col>
            <Col span={6}><b>{t('asset.colAssetName')}:</b> {asset.assetName}</Col>
            <Col span={6}><b>{t('asset.colAssetType')}:</b> {asset.assetType}</Col>
            <Col span={6}><b>{t('asset.colPurchaseDate')}:</b> {asset.purchaseDate || '-'}</Col>
            <Col span={6} style={{ marginTop: 8 }}><b>{t('asset.colPurchaseValue')}:</b> {asset.purchaseValue ? `MOP ${asset.purchaseValue.toLocaleString()}` : '-'}</Col>
            <Col span={6} style={{ marginTop: 8 }}><b>{t('asset.colDepartment')}:</b> {asset.department || '-'}</Col>
            <Col span={6} style={{ marginTop: 8 }}><b>{t('asset.colUserName')}:</b> {asset.userName || '-'}</Col>
            <Col span={6} style={{ marginTop: 8 }}><b>{t('asset.colUsageDate')}:</b> {asset.usageDate || '-'}</Col>
          </Row>
        </Card>
      )}

      <Card style={{ borderRadius: 8 }} bordered>
        <Form<FormValues> form={form} layout="vertical" initialValues={{ scrapDate: dayjs() }}>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item label={t('asset.colScrapDate')} name="scrapDate" rules={[{ required: true, message: t('asset.scrapDateRequired') }]}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label={t('asset.colApplyBy')} name="applyBy" rules={[{ required: true, message: t('asset.applyByRequired') }]}>
                <Input placeholder={t('asset.userNamePh')} allowClear />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label={t('asset.colUserEmpId')} name="empId" rules={[{ required: true, message: t('asset.userEmpIdRequired') }]}>
                <Input placeholder={t('asset.userEmpIdPh')} allowClear />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label={t('asset.colScrapReason')} name="reason" rules={[{ required: true, message: t('asset.scrapReasonRequired') }]}>
                <Input.TextArea rows={2} placeholder={t('asset.scrapReasonPh')} maxLength={300} showCount />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item label={t('asset.colResidualValue')} name="residualValue">
                    <InputNumber min={0} step={100} addonAfter="MOP" style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label={t('asset.colDisposeType')} name="disposeType">
                    <Select placeholder={t('common.pleaseSelect')} allowClear
                      options={DISPOSE_OPTIONS.map((o) => ({ ...o, label: t(o.label) }))}
                    />
                  </Form.Item>
                </Col>
              </Row>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={24}>
              <Form.Item label={t('asset.colAppraisal')} name="appraisal">
                <Input.TextArea rows={2} placeholder={t('asset.appraisalPh')} maxLength={300} showCount />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={24}>
              <Form.Item label={t('asset.colRemark')} name="remark">
                <Input.TextArea rows={2} placeholder={t('asset.remarkPh')} maxLength={300} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Card>

      <div className="form-footer">
        <Button onClick={() => navigate(-1)}>{t('common.cancel')}</Button>
        <Button danger type="primary" icon={<SaveOutlined />} onClick={handleSubmit} loading={submitting}>
          {mode === 'direct' ? t('asset.btnDirectScrap') : t('asset.btnFlowApply')}
        </Button>
      </div>
    </div>
  )
}
