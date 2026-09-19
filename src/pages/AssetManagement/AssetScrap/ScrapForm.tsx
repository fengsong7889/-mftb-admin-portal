/**
 * 新增報廢表單頁
 *
 * 從資產列表選擇資產後跳轉至此，填寫報廢信息並提交。
 * 流程先不做，提交後直接生效（status = approved）。
 */
import { useState, useEffect } from 'react'
import {
  Form, Input, Button, message, Row, Col, Tag, DatePicker, InputNumber, Select,
} from 'antd'
import { ArrowLeftOutlined, SaveOutlined, ExclamationCircleOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import dayjs, { type Dayjs } from 'dayjs'
import { fetchAssetDetail, createScrapRecord, type AssetItem } from '../../../api/asset'
import AssetParameters from '../../../components/AssetParameters'

interface Props {
  assetId: number
  onBack: () => void
}

interface FormValues {
  scrapDate: Dayjs
  reason: string
  residualValue: number
  applyBy: string
  empId: string
  disposeType?: 'sale' | 'donate' | 'recycle' | 'destroy'
  appraisal?: string
  remark?: string
}

const DISPOSE_OPTIONS = [
  { label: '出售', value: 'sale' },
  { label: '捐贈', value: 'donate' },
  { label: '回收', value: 'recycle' },
  { label: '銷毀', value: 'destroy' },
]

export default function ScrapForm({ assetId, onBack }: Props) {
  const { t } = useTranslation()
  const [form] = Form.useForm<FormValues>()
  const [submitting, setSubmitting] = useState(false)
  const [asset, setAsset] = useState<AssetItem | null>(null)
  const [loadingAsset, setLoadingAsset] = useState(true)

  useEffect(() => {
    if (!assetId) {
      message.error('缺少資產 ID')
      onBack()
      return
    }
    setLoadingAsset(true)
    fetchAssetDetail(assetId).then((data) => {
      setAsset(data)
      form.setFieldsValue({ residualValue: 0 })
      if (data.status === 'scrapped') {
        message.warning('該資產已報廢')
      }
    }).catch((err: Error) => message.error(err.message))
      .finally(() => setLoadingAsset(false))
  }, [assetId, form, onBack])

  const handleSubmit = async () => {
    if (!asset) return
    try {
      const v = await form.validateFields()
      if (asset.status === 'scrapped') {
        message.error(t('asset.alreadyScrapped'))
        return
      }
      setSubmitting(true)
      await createScrapRecord({
        assetId: asset.id,
        assetNo: asset.assetNo,
        assetName: asset.assetName,
        assetType: asset.assetType,
        brand: asset.brand,
        scrapDate: v.scrapDate.format('YYYY-MM-DD'),
        applyBy: v.applyBy,
        empId: v.empId,
        reason: v.reason,
        residualValue: v.residualValue || 0,
        disposeType: v.disposeType || null,
        appraisal: v.appraisal || '',
        remark: v.remark || '',
      })
      message.success('報廢申請已提交')
      onBack()
    } catch (e: unknown) {
      if (e instanceof Error) message.error(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loadingAsset) {
    return (
      <div className="content-area" style={{ padding: '20px 24px' }}>
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#8C8C8C' }}>加載中...</div>
      </div>
    )
  }

  return (
    <div className="content-area" style={{ padding: '20px 24px' }}>
      {/* 頁面頭部 */}
      <div style={{ background: '#fff', borderRadius: 12, padding: '16px 24px', marginBottom: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <Button type="primary" icon={<ArrowLeftOutlined />} onClick={onBack}>{t('common.back')}</Button>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>新增報廢申請</h2>
        <Tag color="error" style={{ marginLeft: 'auto' }}>
          <ExclamationCircleOutlined /> 報廢為終態操作，請確認後提交
        </Tag>
      </div>

      {/* 資產信息 */}
      {asset && (
        <div style={{ marginBottom: 16, borderRadius: 8, background: '#fff', padding: '20px 24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#e6f7ff', display: 'grid', placeItems: 'center' }}><ExclamationCircleOutlined style={{ color: '#1890ff' }} /></div>
            <span style={{ fontSize: 15, fontWeight: 600 }}>{t('asset.sectionAssetInfo')}</span>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0' }} />
          </div>
          <Row gutter={16}>
            <Col span={6}><b>{t('asset.colAssetNo')}:</b> {asset.assetNo}</Col>
            <Col span={6}><b>{t('asset.colAssetName')}:</b> {asset.assetName}</Col>
            <Col span={6}><b>{t('asset.colAssetType')}:</b> {asset.assetType}</Col>
            <Col span={6}><b>品牌:</b> {asset.brand || '-'}</Col>
            <Col span={6} style={{ marginTop: 8 }}><b>{t('asset.colPurchaseDate')}:</b> {asset.purchaseDate || '-'}</Col>
            <Col span={6} style={{ marginTop: 8 }}><b>{t('asset.colPurchaseValue')}:</b> {asset.purchaseValue ? `MOP ${asset.purchaseValue.toLocaleString()}` : '-'}</Col>
            <Col span={6} style={{ marginTop: 8 }}><b>{t('asset.colDepartment')}:</b> {asset.department || '-'}</Col>
            <Col span={6} style={{ marginTop: 8 }}><b>{t('asset.colUserName')}:</b> {asset.userName || '-'}</Col>
          </Row>
          <AssetParameters asset={asset} />
        </div>
      )}

      {/* 報廢表單 */}
      <div style={{ borderRadius: 8, background: '#fff', padding: '20px 24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: '#fff7e6', display: 'grid', placeItems: 'center' }}><SaveOutlined style={{ color: '#fa8c16' }} /></div>
          <span style={{ fontSize: 15, fontWeight: 600 }}>報廢信息</span>
          <div style={{ flex: 1, height: 1, background: '#f0f0f0' }} />
        </div>
        <Form<FormValues> form={form} layout="vertical" initialValues={{ scrapDate: dayjs() }}>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item label={t('asset.colScrapDate')} name="scrapDate" rules={[{ required: true, message: '請選擇報廢日期' }]}>
                <DatePicker style={{ width: '100%' }} disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label={t('asset.colApplyBy')} name="applyBy" rules={[{ required: true, message: '請輸入申請人' }]}>
                <Input placeholder="申請人姓名" allowClear />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label={t('asset.colUserEmpId')} name="empId" rules={[{ required: true, message: '請輸入工號' }]}>
                <Input placeholder="申請人工號" allowClear />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label={t('asset.colScrapReason')} name="reason" rules={[{ required: true, message: '請輸入報廢原因' }]}>
                <Input.TextArea rows={2} placeholder="請詳細說明報廢原因" maxLength={300} showCount />
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
                      options={DISPOSE_OPTIONS.map((o) => ({ ...o }))}
                    />
                  </Form.Item>
                </Col>
              </Row>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={24}>
              <Form.Item label={t('asset.colAppraisal')} name="appraisal">
                <Input.TextArea rows={2} placeholder="鑑定意見（可選）" maxLength={300} showCount />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={24}>
              <Form.Item label={t('asset.colRemark')} name="remark" style={{ marginBottom: 0 }}>
                <Input.TextArea rows={2} placeholder="備註（可選）" maxLength={300} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </div>

      {/* 底部操作 */}
      <div className="form-footer">
        <Button onClick={onBack}>{t('common.cancel')}</Button>
        <Button danger type="primary" icon={<SaveOutlined />} onClick={handleSubmit} loading={submitting}>
          確認提交
        </Button>
      </div>
    </div>
  )
}
