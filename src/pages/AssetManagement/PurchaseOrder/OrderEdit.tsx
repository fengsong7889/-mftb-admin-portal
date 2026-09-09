/**
 * 採購執行編輯頁
 *
 * 回填：供應商、成交單價、聯繫人、預計交期、快遞單號、採購經辦人、下單日期、備註
 * 遵循全局新增/編輯表單頁風格規範（form-page-style.md）
 */
import { useState, useEffect, useCallback } from 'react'
import {
  Button, Form, Input, InputNumber, DatePicker, Row, Col, Table, Tag, Space, Spin, message,
} from 'antd'
import type { TableColumnsType } from 'antd'
import { ArrowLeftOutlined, SaveOutlined, ShoppingCartOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import dayjs, { type Dayjs } from 'dayjs'
import {
  fetchPurchaseOrderDetail, updatePurchaseOrderExec,
  type PurchaseOrder,
} from '../../../api/eam'

interface Props {
  id: number
  onBack: () => void
  onSaved: () => void
}

interface FormValues {
  supplier: string
  contact: string
  trackingNo: string
  purchaser: string
  deliveryDate: Dayjs
  orderDate: Dayjs
  remark: string
  items: { modelId: number; confirmedPrice?: number }[]
}

export default function OrderEdit({ id, onBack, onSaved }: Props) {
  const { t } = useTranslation()
  const [form] = Form.useForm<FormValues>()
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [order, setOrder] = useState<PurchaseOrder | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const o = await fetchPurchaseOrderDetail(id)
      setOrder(o)
      form.setFieldsValue({
        supplier: o.supplier,
        contact: o.contact || '',
        trackingNo: o.trackingNo || '',
        purchaser: o.purchaser || '',
        deliveryDate: o.deliveryDate ? dayjs(o.deliveryDate) : undefined,
        orderDate: o.orderDate ? dayjs(o.orderDate) : undefined,
        remark: o.remark || '',
        items: o.items.map((it) => ({ modelId: it.modelId, confirmedPrice: it.confirmedPrice })),
      })
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : t('asset.queryFailed'))
    } finally {
      setLoading(false)
    }
  }, [id, form, t])

  useEffect(() => { loadData() }, [loadData])

  const handleSubmit = async () => {
    try {
      const v = await form.validateFields()
      setSubmitting(true)

      const confirmedPrices: Record<number, number> = {}
      ;(v.items || []).forEach((it) => {
        if (it.confirmedPrice) confirmedPrices[it.modelId] = it.confirmedPrice
      })

      await updatePurchaseOrderExec(id, {
        supplier: v.supplier.trim(),
        contact: v.contact.trim() || undefined,
        trackingNo: v.trackingNo.trim() || undefined,
        purchaser: v.purchaser.trim() || undefined,
        orderDate: v.orderDate?.format('YYYY-MM-DD') || undefined,
        remark: v.remark?.trim() || undefined,
        confirmedPrices: Object.keys(confirmedPrices).length > 0 ? confirmedPrices : undefined,
      })

      message.success(t('asset.saveExecSuccess'))
      onSaved()
    } catch (e: unknown) {
      if (e instanceof Error && e.message) message.error(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  const priceColumns: TableColumnsType<{ modelId: number; modelName: string; qty: number; price: number; confirmedPrice?: number }> = [
    { title: t('asset.colModelName'), dataIndex: 'modelName', key: 'modelName' },
    { title: t('asset.colQty'), dataIndex: 'qty', key: 'qty', width: 90, align: 'right' },
    {
      title: t('asset.colRefPrice'), dataIndex: 'price', key: 'price', width: 120, align: 'right',
      render: (v: number) => <span style={{ color: '#8c8c8c' }}>MOP {v.toLocaleString()}</span>,
    },
    {
      title: t('asset.colConfirmedPrice'), key: 'confirmedPrice', width: 160,
      render: (_: unknown, r, idx: number) => (
        <Form.Item
          name={['items', idx, 'confirmedPrice']}
          noStyle
        >
          <InputNumber
            style={{ width: '100%' }}
            min={0}
            precision={2}
            placeholder={t('asset.colConfirmedPrice')}
            addonBefore="MOP"
          />
        </Form.Item>
      ),
    },
    {
      title: t('asset.colSubtotal'), key: 'subtotal', width: 130, align: 'right',
      render: (_: unknown, r, idx: number) => {
        const cp = form.getFieldValue(['items', idx, 'confirmedPrice']) || r.price
        return `MOP ${(cp * r.qty).toLocaleString()}`
      },
    },
  ]

  if (loading || !order) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" tip={t('common.loading')} />
      </div>
    )
  }

  return (
    <Spin spinning={loading}>
      {/* ====== 頁面頭部 ====== */}
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
            style={{
              backgroundColor: '#E8720C', borderColor: '#E8720C',
              borderRadius: 8, height: 36, padding: '0 16px',
              display: 'flex', alignItems: 'center', gap: 6,
              boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
            }}
          >{t('common.back')}</Button>
          <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>
            {t('asset.editExecTitle')}
          </h2>
          <Tag color="orange" style={{ marginLeft: 4 }}>{order.poNo}</Tag>
        </div>
      </div>

      <Form<FormValues> form={form} layout="vertical">
        {/* ====== 採購執行信息 ====== */}
        <div style={{
          border: '1px solid #e8eaed', borderRadius: 8, background: '#fff',
          padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#fff7e6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ShoppingCartOutlined style={{ fontSize: 14, color: '#fa8c16' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('asset.sectionExecInfo')}</span>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          </div>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item label={t('asset.colSupplier')} name="supplier"
                rules={[{ required: true, message: t('asset.supplierRequired') }]}>
                <Input placeholder={t('asset.supplierRequired')} allowClear />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label={t('asset.colContact')} name="contact">
                <Input placeholder={t('asset.colContact')} allowClear />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label={t('asset.colPurchaser')} name="purchaser"
                rules={[{ required: true, message: t('asset.purchaserRequired') }]}>
                <Input placeholder={t('asset.purchaserRequired')} allowClear />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item label={t('asset.colTrackingNo')} name="trackingNo">
                <Input placeholder={t('asset.colTrackingNo')} allowClear style={{ fontFamily: 'monospace' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label={t('asset.colOrderDate')} name="orderDate">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label={t('asset.colDeliveryDate')} name="deliveryDate">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={24}>
              <Form.Item label={t('asset.colRemark')} name="remark">
                <Input.TextArea rows={2} placeholder={t('asset.remarkPh')} maxLength={200} />
              </Form.Item>
            </Col>
          </Row>
        </div>

        {/* ====== 成交單價 ====== */}
        <div style={{
          border: '1px solid #e8eaed', borderRadius: 8, background: '#fff',
          padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#f6ffed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <SaveOutlined style={{ fontSize: 14, color: '#52c41a' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('asset.colConfirmedPrice')}</span>
            <Tag color="green" style={{ marginLeft: 4 }}>{t('asset.colConfirmedAmount')}</Tag>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          </div>

          <Form.List name="items">
            {(fields) => (
              <Table
                columns={priceColumns}
                dataSource={fields.map((f) => ({
                  ...order.items[f.name],
                  key: f.key,
                }))}
                rowKey="modelId"
                size="middle"
                pagination={false}
              />
            )}
          </Form.List>
        </div>
      </Form>

      {/* ====== 底部操作欄 ====== */}
      <div className="form-footer">
        <Space>
          <Button onClick={onBack}>{t('common.cancel')}</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={submitting} onClick={handleSubmit}>
            {t('common.save')}
          </Button>
        </Space>
      </div>
    </Spin>
  )
}
