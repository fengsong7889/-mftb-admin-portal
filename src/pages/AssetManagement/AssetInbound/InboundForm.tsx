/**
 * 批量驗收入庫獨立表單頁
 *
 * 業務閉環：選採購訂單 → 填本次入庫型號/數量/存放位置 → 預覽將生成的資產編號數量
 *          → 確認入庫（自動寫入資產台賬 + 變更歷史流水 + 回寫訂單驗收進度）
 *
 * - 一物一碼：每件資產獨立編號（規則 ZC-年份-序號），由 api/asset.ts bulkCreateAssets 生成
 * - 支持 URL ?poId= 帶入訂單（由採購訂單詳情「驗收入庫」跳轉）
 */
import { useState, useEffect, useCallback } from 'react'
import {
  Button, Form, Input, InputNumber, Select, DatePicker, Row, Col, Space, Spin,
  message, Alert, Table, Tag,
} from 'antd'
import type { TableColumnsType } from 'antd'
import { ArrowLeftOutlined, SaveOutlined, PlusOutlined, MinusCircleOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import dayjs, { type Dayjs } from 'dayjs'
import {
  fetchPendingInboundOrders, fetchPurchaseOrderDetail, fetchLocationList, createInboundBatch,
  type PurchaseOrder, type AssetLocation,
} from '../../../api/eam'
import { todayStr } from '../eamUtils'

interface ItemRow {
  modelId?: number
  qty?: number
  locationId?: number
}

interface FormValues {
  poId: number
  inboundDate: Dayjs
  operator: string
  items: ItemRow[]
  remark?: string
}

interface Props {
  poId?: number
  onBack: () => void
}

export default function InboundForm({ poId, onBack }: Props) {
  const { t } = useTranslation()
  const [form] = Form.useForm<FormValues>()
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [order, setOrder] = useState<PurchaseOrder | null>(null)
  const [locations, setLocations] = useState<AssetLocation[]>([])
  const [items, setItems] = useState<ItemRow[]>([])

  /** 訂單各明細行的剩餘待入庫數量 */
  const remainingOf = useCallback((modelId: number) => {
    const line = order?.items.find((l) => l.modelId === modelId)
    return line ? Math.max(0, line.qty - line.receivedQty) : 0
  }, [order])

  const totalQty = items.reduce((s, it) => s + (it.qty || 0), 0)

  /** 載入待入庫訂單與位置樹 */
  useEffect(() => {
    let alive = true
    setLoading(true)
    Promise.all([fetchPendingInboundOrders(), fetchLocationList()])
      .then(async ([orderList, locList]) => {
        if (!alive) return
        setLocations(locList)
        setOrders(orderList)
        const target = poId
          ? (orderList.find((o) => o.id === poId) || await fetchPurchaseOrderDetail(poId))
          : orderList[0]
        if (target) applyOrder(target, locList)
      })
      .catch((e: Error) => message.error(e.message))
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poId])

  /** 選定訂單後：預填待入庫明細（數量默認取剩餘待入庫數，位置默認首個倉庫） */
  const applyOrder = (target: PurchaseOrder, locList: AssetLocation[]) => {
    const defaultLocation = locList.find((l) => l.type === 'warehouse')?.id || locList[0]?.id
    const rows: ItemRow[] = target.items
      .filter((l) => l.qty - l.receivedQty > 0)
      .map((l) => ({ modelId: l.modelId, qty: l.qty - l.receivedQty, locationId: defaultLocation }))
    setOrder(target)
    setItems(rows)
    form.setFieldsValue({
      poId: target.id,
      inboundDate: dayjs(),
      operator: t('asset.currentOperator'),
      items: rows,
    })
  }

  const handleOrderChange = async (id: number) => {
    try {
      const target = orders.find((o) => o.id === id) || await fetchPurchaseOrderDetail(id)
      applyOrder(target, locations)
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : t('asset.queryFailed'))
    }
  }

  const syncItems = () => setItems((form.getFieldValue('items') as ItemRow[]) || [])

  const handleSubmit = async () => {
    try {
      const v = await form.validateFields()
      const rows = (v.items || []).filter((it) => it.modelId && it.qty && it.locationId)
      if (!rows.length) {
        message.error(t('asset.itemsRequired'))
        return
      }
      const over = rows.find((it) => (it.qty || 0) > remainingOf(it.modelId as number))
      if (over) {
        message.error(t('asset.inboundEmpty'))
        return
      }
      setSubmitting(true)
      const batch = await createInboundBatch({
        poId: v.poId,
        inboundDate: v.inboundDate.format('YYYY-MM-DD'),
        operator: v.operator.trim(),
        items: rows.map((it) => ({
          modelId: it.modelId as number,
          qty: it.qty as number,
          locationId: it.locationId as number,
        })),
        remark: v.remark,
      })
      message.success(t('asset.inboundSuccess', { count: batch.totalQty }))
      onBack()
    } catch (e: unknown) {
      if (e instanceof Error && e.message) message.error(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  /** 訂單明細（唯讀，展示已入庫/待入庫進度） */
  const orderColumns: TableColumnsType<PurchaseOrder['items'][number]> = [
    { title: t('asset.colModelName'), dataIndex: 'modelName', key: 'modelName' },
    { title: t('asset.colQty'), dataIndex: 'qty', key: 'qty', width: 90, align: 'right' },
    {
      title: t('asset.colReceivedQty'), dataIndex: 'receivedQty', key: 'receivedQty', width: 110, align: 'right',
      render: (v: number) => <Tag color={v > 0 ? 'success' : 'default'}>{v}</Tag>,
    },
    {
      title: t('asset.inboundTitle'), key: 'remaining', width: 110, align: 'right',
      render: (_: unknown, r) => (
        <Tag color={r.qty - r.receivedQty > 0 ? 'processing' : 'default'}>
          {Math.max(0, r.qty - r.receivedQty)}
        </Tag>
      ),
    },
  ]

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
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>{t('asset.inboundAddTitle')}</h2>
        </div>
      </div>

      {/* ====== 表單區 ====== */}
      <div style={{
        background: '#fff', borderRadius: 8, padding: 24, marginBottom: 16,
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      }}>
        <Form<FormValues> form={form} layout="vertical" onValuesChange={syncItems}>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                label={t('asset.colPoNo')} name="poId"
                rules={[{ required: true, message: t('asset.poRequired') }]}
              >
                <Select
                  placeholder={t('asset.poRequired')}
                  showSearch
                  optionFilterProp="label"
                  onChange={handleOrderChange}
                  options={orders.map((o) => ({
                    label: `${o.poNo} / ${o.supplier}`, value: o.id,
                  }))}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                label={t('asset.colInboundDate')} name="inboundDate"
                rules={[{ required: true, message: t('asset.inboundDateRequired') }]}
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

          {/* ====== 訂單明細與待入庫進度 ====== */}
          {order && (
            <>
              <h3 style={{ margin: '8px 0 12px', fontSize: 16, fontWeight: 600 }}>{t('asset.sectionItems')}</h3>
              <Table
                columns={orderColumns}
                dataSource={order.items}
                rowKey="modelId"
                size="small"
                pagination={false}
                style={{ marginBottom: 16 }}
              />
            </>
          )}

          {/* ====== 本次入庫明細 ====== */}
          <h3 style={{ margin: '8px 0 12px', fontSize: 16, fontWeight: 600 }}>{t('asset.inboundTitle')}</h3>
          <Form.List name="items">
            {(fields, { add, remove }) => (
              <>
                {fields.map((field) => (
                  <Row gutter={12} key={field.key} align="middle">
                    <Col span={9}>
                      <Form.Item
                        name={[field.name, 'modelId']} label={t('asset.colModelName')}
                        rules={[{ required: true, message: t('asset.modelRequired') }]}
                      >
                        <Select
                          placeholder={t('asset.modelRequired')}
                          disabled={!order}
                          options={(order?.items || [])
                            .filter((l) => l.qty - l.receivedQty > 0)
                            .map((l) => ({ label: l.modelName, value: l.modelId }))}
                        />
                      </Form.Item>
                    </Col>
                    <Col span={4}>
                      <Form.Item
                        noStyle
                        shouldUpdate={(prev, cur) => prev.items?.[field.name]?.modelId !== cur.items?.[field.name]?.modelId}
                      >
                        {() => (
                          <Form.Item
                            name={[field.name, 'qty']} label={t('asset.colQty')}
                            rules={[{ required: true, message: t('asset.qtyRequired') }]}
                          >
                            <InputNumber
                              style={{ width: '100%' }}
                              min={1}
                              max={remainingOf(form.getFieldValue(['items', field.name, 'modelId'])) || undefined}
                            />
                          </Form.Item>
                        )}
                      </Form.Item>
                    </Col>
                    <Col span={9}>
                      <Form.Item
                        name={[field.name, 'locationId']} label={t('asset.colLocationName')}
                        rules={[{ required: true, message: t('asset.locationRequired') }]}
                      >
                        <Select
                          placeholder={t('asset.locationRequired')}
                          showSearch
                          optionFilterProp="label"
                          options={locations.map((l) => ({ label: `${l.name}（${l.code}）`, value: l.id }))}
                        />
                      </Form.Item>
                    </Col>
                    <Col span={1}>
                      <MinusCircleOutlined
                        style={{ color: '#FF4D4F', marginTop: 8 }}
                        onClick={() => { remove(field.name); setTimeout(syncItems, 0) }}
                      />
                    </Col>
                  </Row>
                ))}
                <Form.Item>
                  <Button
                    type="dashed" icon={<PlusOutlined />} block disabled={!order}
                    onClick={() => { add({ qty: 1 }); setTimeout(syncItems, 0) }}
                  >
                    {t('asset.btnAddItem')}
                  </Button>
                </Form.Item>
              </>
            )}
          </Form.List>

          <Row gutter={16}>
            <Col span={24}>
              <Form.Item label={t('asset.colRemark')} name="remark">
                <Input.TextArea rows={2} placeholder={t('asset.remarkPh')} maxLength={200} />
              </Form.Item>
            </Col>
          </Row>
        </Form>

        {/* ====== 入庫預覽 ====== */}
        <Alert
          type={totalQty > 0 ? 'success' : 'info'}
          showIcon
          message={t('asset.inboundPreview', { count: totalQty })}
          description={totalQty > 0 ? `${t('asset.colInboundDate')}：${form.getFieldValue('inboundDate')?.format?.('YYYY-MM-DD') || todayStr()}` : undefined}
        />
      </div>

      {/* ====== 底部操作欄 ====== */}
      <div className="form-footer">
        <Space>
          <Button onClick={onBack}>{t('common.cancel')}</Button>
          <Button
            type="primary" icon={<SaveOutlined />} loading={submitting}
            disabled={!order || totalQty <= 0}
            onClick={handleSubmit}
          >
            {t('asset.btnInbound')}
          </Button>
        </Space>
      </div>
    </Spin>
  )
}
