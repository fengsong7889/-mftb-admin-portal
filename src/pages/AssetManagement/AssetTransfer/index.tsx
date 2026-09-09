/**
 * 资产转移独立页
 *
 * - 通过 URL ?id= 获取要转移的资产 ID
 * - 物资部直接将资产从当前使用人/部门转移到新使用人/部门
 * - 只能转移状态为「在用」(status='in_use') 的资产
 * - 顶部"返回"按钮，底部"取消+保存"按钮（符合全局规范）
 */
import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Button, Form, Input, Select, DatePicker, message, Row, Col, Tag, Alert, Spin,
} from 'antd'
import { ArrowLeftOutlined, SaveOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import dayjs, { type Dayjs } from 'dayjs'
import { transferAsset, fetchAssetDetail, type AssetItem } from '../../../api/asset'

const DEPARTMENT_OPTIONS = ['研发部', '产品部', '市场部', '设计部', '技术部', '人事部', '财务部', '行政部', '运营部']

interface FormValues {
  toUser: string
  toEmpId: string
  toDepartment: string
  reason: string
  transferDate: Dayjs
  remark?: string
}

export default function AssetTransfer() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const assetId = searchParams.get('id') ? Number(searchParams.get('id')) : null

  const [form] = Form.useForm<FormValues>()
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(false)
  const [asset, setAsset] = useState<AssetItem | null>(null)

  useEffect(() => {
    if (!assetId) {
      message.error(t('asset.assetIdMissing'))
      navigate('/asset-list')
      return
    }
    setLoading(true)
    fetchAssetDetail(assetId)
      .then((data) => {
        setAsset(data)
        form.resetFields()
      })
      .catch((err: Error) => message.error(err.message))
      .finally(() => setLoading(false))
  }, [assetId, form, navigate, t])

  /** 保存 */
  const handleSubmit = async () => {
    if (!asset) return
    try {
      const v = await form.validateFields()
      if (asset.status !== 'in_use') {
        message.error(t('asset.notInUseCannotTransfer'))
        return
      }
      setSubmitting(true)
      const toUserFull = `${v.toUser}(${v.toEmpId})`
      await transferAsset({
        assetId: asset.id,
        toUser: toUserFull,
        toDepartment: v.toDepartment,
        reason: v.reason,
        applyBy: t('asset.currentOperator'),
      })
      message.success(t('asset.transferSuccess'))
      navigate('/asset-list')
    } catch (e: unknown) {
      if (e instanceof Error) message.error(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  /** 取消：返回列表 */
  const handleCancel = () => {
    navigate('/asset-list')
  }

  return (
    <div className="content-area" style={{ padding: '20px 24px' }}>
      {/* ====== 顶部标题栏 ====== */}
      <div style={{
        background: '#fff', borderRadius: 8, padding: '20px 24px', marginBottom: 16,
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={handleCancel}>
            {t('common.back')}
          </Button>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
            {t('asset.transferTitle')}
          </h2>
        </div>
      </div>

      {/* ====== 资产信息 + 当前持有人 ====== */}
      <Spin spinning={loading}>
        {asset && (
          <div style={{
            background: '#fff', borderRadius: 8, padding: '20px 24px', marginBottom: 16,
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          }}>
            <Alert type="info" showIcon message={t('asset.modeDirectTip')} style={{ marginBottom: 16 }} />
            <div style={{
              background: '#FAFAFA', borderRadius: 8, padding: 16,
              display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12,
            }}>
              <div><b>{t('asset.colAssetNo')}:</b> <span style={{ fontFamily: 'monospace' }}>{asset.assetNo}</span></div>
              <div><b>{t('asset.colAssetName')}:</b> {asset.assetName}</div>
              <div><b>{t('asset.colAssetType')}:</b> {asset.assetType}</div>
              <div>
                <b>{t('asset.colStatus')}:</b>{' '}
                <Tag color="success">{t('asset.statusInUse')}</Tag>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <b>{t('asset.fromLabel')}:</b>{' '}
                <span style={{ color: '#E8720C', fontWeight: 600 }}>{asset.userName || '-'}</span>
                {' / '}
                {asset.department || '-'}
              </div>
            </div>
          </div>
        )}

        {/* ====== 表单区 ====== */}
        {asset && (
          <div style={{
            background: '#fff', borderRadius: 8, padding: '24px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          }}>
            <Form<FormValues>
              form={form}
              layout="vertical"
              initialValues={{ transferDate: dayjs() }}
            >
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item
                    label={t('asset.colToUser')}
                    name="toUser"
                    rules={[{ required: true, message: t('asset.userNameRequired') }]}
                  >
                    <Input placeholder={t('asset.userNamePh')} allowClear />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item
                    label={t('asset.colUserEmpId')}
                    name="toEmpId"
                    rules={[{ required: true, message: t('asset.userEmpIdRequired') }]}
                  >
                    <Input placeholder={t('asset.userEmpIdPh')} allowClear />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item
                    label={t('asset.colToDepartment')}
                    name="toDepartment"
                    rules={[{ required: true, message: t('asset.departmentRequired') }]}
                  >
                    <Select placeholder={t('asset.departmentPh')}>
                      {DEPARTMENT_OPTIONS.map((d) => <Select.Option key={d} value={d}>{d}</Select.Option>)}
                    </Select>
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item
                    label={t('asset.colTransferDate')}
                    name="transferDate"
                    rules={[{ required: true, message: t('asset.transferDateRequired') }]}
                  >
                    <DatePicker style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={16}>
                  <Form.Item
                    label={t('asset.colReason')}
                    name="reason"
                    rules={[{ required: true, message: t('asset.reasonRequired') }]}
                  >
                    <Input placeholder={t('asset.transferReasonPh')} allowClear />
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
          </div>
        )}
      </Spin>

      {/* ====== 底部操作栏（取消+保存，符合全局规范） ====== */}
      <div className="form-footer">
        <Button onClick={handleCancel}>{t('common.cancel')}</Button>
        <Button
          type="primary"
          icon={<SaveOutlined />}
          onClick={handleSubmit}
          loading={submitting}
          disabled={!asset || asset.status !== 'in_use'}
        >
          {t('common.save')}
        </Button>
      </div>
    </div>
  )
}
