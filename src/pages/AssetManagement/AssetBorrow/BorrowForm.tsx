/**
 * 借用登記獨立表單頁（臨時借用）
 *
 * 業務閉環：選閒置資產 → 填借用人/部門/借用日期/歸還期限/用途 → 提交
 *          （自動置資產為「在用」、holdType=borrowed，並寫入借用流水）
 *
 * - 歸還期限默認為借用日期 +7 天，須晚於借用日期
 * - 逾期由 api 層在查詢時自動標記，無需人工干預
 */
import { useState, useEffect } from 'react'
import {
  Button, Form, Input, Select, DatePicker, Row, Col, Space, Spin,
  message, Alert, Descriptions,
} from 'antd'
import { ArrowLeftOutlined, SaveOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import dayjs, { type Dayjs } from 'dayjs'
import { fetchIdleAssets, createBorrow } from '../../../api/eam'
import type { AssetItem } from '../../../api/asset'
import { EAM_DEPARTMENTS } from '../eamUtils'

interface FormValues {
  assetId: number
  borrower: string
  department: string
  borrowDate: Dayjs
  dueDate: Dayjs
  purpose: string
  operator: string
  remark?: string
}

interface Props {
  onBack: () => void
}

export default function BorrowForm({ onBack }: Props) {
  const { t } = useTranslation()
  const [form] = Form.useForm<FormValues>()
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [assets, setAssets] = useState<AssetItem[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)

  /** 載入全部閒置資產（僅閒置可借用） */
  useEffect(() => {
    let alive = true
    setLoading(true)
    fetchIdleAssets()
      .then((list) => { if (alive) setAssets(list) })
      .catch((e: Error) => message.error(e.message))
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const selected = assets.find((a) => a.id === selectedId)

  const handleSubmit = async () => {
    try {
      const v = await form.validateFields()
      const borrowDate = v.borrowDate.format('YYYY-MM-DD')
      const dueDate = v.dueDate.format('YYYY-MM-DD')
      if (dueDate <= borrowDate) {
        message.error(t('asset.dueDateInvalid'))
        return
      }
      setSubmitting(true)
      await createBorrow({
        assetId: v.assetId,
        borrower: v.borrower.trim(),
        department: v.department,
        borrowDate,
        dueDate,
        purpose: v.purpose.trim(),
        operator: v.operator.trim(),
        remark: v.remark,
      })
      message.success(t('asset.borrowCreated'))
      onBack()
    } catch (e: unknown) {
      if (e instanceof Error && e.message) message.error(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Spin spinning={loading}>
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
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>{t('asset.borrowAddTitle')}</h2>
        </div>
      </div>

      {/* ====== 表單區 ====== */}
      <div style={{
        background: '#fff', borderRadius: 8, padding: 24, marginBottom: 16,
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      }}>
        {assets.length === 0 && !loading && (
          <Alert type="warning" showIcon style={{ marginBottom: 16 }} message={t('asset.noIdleAsset')} />
        )}

        <Form<FormValues>
          form={form}
          layout="vertical"
          initialValues={{
            borrowDate: dayjs(),
            dueDate: dayjs().add(7, 'day'),
            operator: t('asset.currentOperator'),
          }}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label={t('asset.colAssetNo')} name="assetId"
                rules={[{ required: true, message: t('asset.assetRequired') }]}
              >
                <Select
                  placeholder={t('asset.searchAssetPh')}
                  showSearch
                  optionFilterProp="label"
                  disabled={assets.length === 0}
                  onChange={(v: number) => setSelectedId(v)}
                  options={assets.map((a) => ({
                    label: `${a.assetNo} / ${a.assetName}`, value: a.id,
                  }))}
                />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item
                label={t('asset.colBorrower')} name="borrower"
                rules={[{ required: true, message: t('asset.borrowerRequired') }]}
              >
                <Input placeholder={t('asset.userNamePh')} allowClear />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item
                label={t('asset.colDepartment')} name="department"
                rules={[{ required: true, message: t('asset.departmentRequired') }]}
              >
                <Select
                  placeholder={t('asset.departmentRequired')}
                  showSearch
                  options={EAM_DEPARTMENTS.map((d) => ({ label: d, value: d }))}
                />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item
                label={t('asset.colBorrowDate')} name="borrowDate"
                rules={[{ required: true, message: t('asset.borrowDateRequired') }]}
              >
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item
                label={t('asset.colDueDate')} name="dueDate"
                rules={[{ required: true, message: t('asset.dueDateRequired') }]}
              >
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item
                label={t('asset.colOperator')} name="operator"
                rules={[{ required: true, message: t('asset.operatorRequired') }]}
              >
                <Input placeholder={t('asset.operatorRequired')} allowClear />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item
                label={t('asset.colPurpose')} name="purpose"
                rules={[{ required: true, message: t('asset.purposeRequired') }]}
              >
                <Input placeholder={t('asset.purposeRequired')} allowClear maxLength={100} />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label={t('asset.colRemark')} name="remark">
                <Input.TextArea rows={2} placeholder={t('asset.remarkPh')} maxLength={200} />
              </Form.Item>
            </Col>
          </Row>
        </Form>

        {/* ====== 所選資產信息 ====== */}
        {selected && (
          <>
            <h3 style={{ margin: '8px 0 12px', fontSize: 16, fontWeight: 600 }}>{t('asset.sectionBasic')}</h3>
            <Descriptions column={3} size="middle" bordered>
              <Descriptions.Item label={t('asset.colAssetNo')}>{selected.assetNo}</Descriptions.Item>
              <Descriptions.Item label={t('asset.colAssetName')}>{selected.assetName}</Descriptions.Item>
              <Descriptions.Item label={t('asset.colAssetType')}>{selected.assetType}</Descriptions.Item>
              <Descriptions.Item label={t('asset.colBrand')}>{selected.brand || '-'}</Descriptions.Item>
              <Descriptions.Item label={t('asset.colLocationName')}>{selected.location || '-'}</Descriptions.Item>
              <Descriptions.Item label={t('asset.colPurchaseValue')}>
                {selected.purchaseValue ? `MOP ${selected.purchaseValue.toLocaleString()}` : '-'}
              </Descriptions.Item>
            </Descriptions>
          </>
        )}
      </div>

      {/* ====== 底部操作欄 ====== */}
      <div className="form-footer">
        <Space>
          <Button onClick={onBack}>{t('common.cancel')}</Button>
          <Button
            type="primary" icon={<SaveOutlined />} loading={submitting}
            disabled={assets.length === 0}
            onClick={handleSubmit}
          >
            {t('common.save')}
          </Button>
        </Space>
      </div>
    </Spin>
  )
}
