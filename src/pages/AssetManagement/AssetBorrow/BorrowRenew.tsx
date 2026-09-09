/**
 * 借用續借獨立表單頁
 *
 * 業務閉環：展示原借用信息（只讀）→ 填新歸還期限 + 經辦人 → 提交
 *          （續借次數 +1，逾期狀態回置為借用中，並寫入續借流水）
 */
import { useState, useEffect, useCallback } from 'react'
import {
  Button, Form, Input, DatePicker, Row, Col, Space, Spin,
  message, Descriptions, Alert,
} from 'antd'
import { ArrowLeftOutlined, SaveOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import dayjs, { type Dayjs } from 'dayjs'
import { fetchBorrowDetail, renewBorrow, type BorrowRecord } from '../../../api/eam'

interface FormValues {
  dueDate: Dayjs
  operator: string
}

interface Props {
  id: number
  onBack: () => void
}

export default function BorrowRenew({ id, onBack }: Props) {
  const { t } = useTranslation()
  const [form] = Form.useForm<FormValues>()
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [detail, setDetail] = useState<BorrowRecord | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const d = await fetchBorrowDetail(id)
      setDetail(d)
      // 新期限默認在原期限基礎上延長 7 天
      form.setFieldsValue({ dueDate: dayjs(d.dueDate).add(7, 'day'), operator: t('asset.currentOperator') })
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : t('asset.queryFailed'))
    } finally {
      setLoading(false)
    }
  }, [id, form, t])

  useEffect(() => { loadData() }, [loadData])

  const handleSubmit = async () => {
    if (!detail) return
    try {
      const v = await form.validateFields()
      const newDueDate = v.dueDate.format('YYYY-MM-DD')
      if (newDueDate <= detail.dueDate) {
        message.error(t('asset.renewDateInvalid'))
        return
      }
      setSubmitting(true)
      await renewBorrow(detail.id, newDueDate, v.operator.trim())
      message.success(t('asset.renewSuccess'))
      onBack()
    } catch (e: unknown) {
      if (e instanceof Error && e.message) message.error(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading || !detail) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" tip={t('common.loading')} />
      </div>
    )
  }

  return (
    <Spin spinning={loading}>
      {/* ====== 頂部標題欄 ====== */}
      <div style={{
        background: '#fff', borderRadius: 8, padding: '20px 24px', marginBottom: 16,
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <Button icon={<ArrowLeftOutlined />} onClick={onBack}>{t('common.back')}</Button>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{t('asset.renewAddTitle')}</h2>
      </div>

      {/* ====== 原借用信息（只讀） ====== */}
      <div style={{
        background: '#fff', borderRadius: 8, padding: '20px 24px', marginBottom: 16,
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600 }}>{t('asset.sectionBasic')}</h3>
        <Descriptions column={3} size="middle" bordered>
          <Descriptions.Item label={t('asset.colBorrowNo')}>{detail.borrowNo}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colAssetNo')}>{detail.assetNo}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colAssetName')}>{detail.assetName}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colBorrower')}>{detail.borrower}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colDepartment')}>{detail.department}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colBorrowDate')}>{detail.borrowDate}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colDueDate')}>
            <span style={{ color: detail.status === 'overdue' ? '#FF4D4F' : undefined, fontWeight: 600 }}>
              {detail.dueDate}
            </span>
          </Descriptions.Item>
          <Descriptions.Item label={t('asset.colRenewCount')}>{detail.renewCount}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colPurpose')}>{detail.purpose}</Descriptions.Item>
        </Descriptions>
        {detail.status === 'overdue' && (
          <Alert type="warning" showIcon style={{ marginTop: 16 }} message={t('asset.overdueRenewTip')} />
        )}
      </div>

      {/* ====== 續借表單 ====== */}
      <div style={{
        background: '#fff', borderRadius: 8, padding: 24, marginBottom: 16,
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      }}>
        <Form<FormValues> form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                label={t('asset.colNewDueDate')} name="dueDate"
                rules={[{ required: true, message: t('asset.dueDateRequired') }]}
              >
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                label={t('asset.colOperator')} name="operator"
                rules={[{ required: true, message: t('asset.operatorRequired') }]}
              >
                <Input placeholder={t('asset.operatorRequired')} allowClear />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </div>

      {/* ====== 底部操作欄 ====== */}
      <div className="form-footer">
        <Space>
          <Button onClick={onBack}>{t('common.cancel')}</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={submitting} onClick={handleSubmit}>
            {t('asset.btnRenew')}
          </Button>
        </Space>
      </div>
    </Spin>
  )
}
