/**
 * 採購申請 新增/編輯獨立表單頁
 *
 * - 明細使用 Form.List：選品牌型號 → 自動帶出參考單價 → 填數量
 * - 實時顯示明細合計金額，與預算金額對比
 * - 底部「取消 + 保存」（全局表單規範）
 */
import { useState, useEffect } from 'react'
import {
  Button, Form, Input, InputNumber, Select, Row, Col, Space, Spin, message, Table,
} from 'antd'
import type { TableColumnsType } from 'antd'
import { ArrowLeftOutlined, SaveOutlined, PlusOutlined, MinusCircleOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import {
  fetchModelList, fetchPurchaseRequestDetail, createPurchaseRequest, updatePurchaseRequest,
  type AssetModel,
} from '../../../api/eam'
import { EAM_DEPARTMENTS } from '../eamUtils'

interface ItemRow {
  modelId?: number
  qty?: number
  estPrice?: number
  remark?: string
}

interface FormValues {
  title: string
  department: string
  applicant: string
  budget: number
  reason: string
  items: ItemRow[]
  remark?: string
}

interface Props {
  id?: number
  onBack: () => void
}

export default function RequestForm({ id, onBack }: Props) {
  const { t } = useTranslation()
  const [form] = Form.useForm<FormValues>()
  const isEdit = id != null
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(false)
  const [models, setModels] = useState<AssetModel[]>([])
  const [items, setItems] = useState<ItemRow[]>([])

  const modelOf = (modelId?: number) => models.find((m) => m.id === modelId)

  /** 明細合計（跟隨表單實時聯動） */
  const totalAmount = items.reduce((s, it) => s + (it.qty || 0) * (it.estPrice || 0), 0)

  useEffect(() => {
    let alive = true
    setLoading(true)
    fetchModelList({ size: 9999 })
      .then(async (res) => {
        if (!alive) return
        setModels(res.records || [])
        if (isEdit && id) {
          const detail = await fetchPurchaseRequestDetail(id)
          if (!alive) return
          const rows: ItemRow[] = detail.items.map((it) => ({
            modelId: it.modelId, qty: it.qty, estPrice: it.estPrice, remark: it.remark,
          }))
          form.setFieldsValue({
            title: detail.title,
            department: detail.department,
            applicant: detail.applicant,
            budget: detail.budget,
            reason: detail.reason,
            items: rows,
          })
          setItems(rows)
        } else {
          form.setFieldsValue({ items: [{ qty: 1 }] })
          setItems([{ qty: 1 }])
        }
      })
      .catch((e: Error) => message.error(e.message))
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [form, id, isEdit])

  /** 明細變化時同步本地 items（用於合計展示） */
  const syncItems = () => {
    setItems((form.getFieldValue('items') as ItemRow[]) || [])
  }

  const handleModelChange = (rowIndex: number, modelId: number) => {
    const model = modelOf(modelId)
    const rows = ((form.getFieldValue('items') as ItemRow[]) || []).map((r, i) => (
      i === rowIndex ? { ...r, modelId, estPrice: model?.refPrice ?? r.estPrice } : r
    ))
    form.setFieldsValue({ items: rows })
    setItems(rows)
  }

  const handleSubmit = async () => {
    try {
      const v = await form.validateFields()
      const rows = (v.items || []).filter((it) => it.modelId && it.qty)
      if (!rows.length) {
        message.error(t('asset.itemsRequired'))
        return
      }
      const payload = {
        title: v.title.trim(),
        department: v.department,
        applicant: v.applicant.trim(),
        budget: v.budget ?? 0,
        reason: v.reason.trim(),
        items: rows.map((it) => ({
          modelId: it.modelId as number,
          modelName: modelOf(it.modelId)?.name || '',
          qty: it.qty as number,
          estPrice: it.estPrice ?? modelOf(it.modelId)?.refPrice ?? 0,
          remark: it.remark,
        })),
      }
      setSubmitting(true)
      if (isEdit && id) {
        await updatePurchaseRequest(id, payload)
        message.success(t('asset.updateSuccess'))
      } else {
        await createPurchaseRequest(payload)
        message.success(t('asset.createSuccess'))
      }
      onBack()
    } catch (e: unknown) {
      if (e instanceof Error && e.message) message.error(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  const itemColumns: TableColumnsType<ItemRow> = [
    {
      title: t('asset.colModelName'), dataIndex: 'modelId', key: 'modelId',
      render: (_: unknown, row: ItemRow) => {
        const m = modelOf(row.modelId)
        return m ? `${m.brand} ${m.modelNo} / ${m.name}` : '-'
      },
    },
    { title: t('asset.colQty'), dataIndex: 'qty', key: 'qty', width: 90, align: 'right' },
    {
      title: t('asset.colEstPrice'), dataIndex: 'estPrice', key: 'estPrice', width: 130, align: 'right',
      render: (v: number | undefined) => (v ? `MOP ${v.toLocaleString()}` : '-'),
    },
    {
      title: t('asset.colSubtotal'), key: 'subtotal', width: 130, align: 'right',
      render: (_: unknown, row: ItemRow) => `MOP ${((row.qty || 0) * (row.estPrice || 0)).toLocaleString()}`,
    },
  ]

  return (
    <Spin spinning={loading}>
      {/* ====== 頂部標題欄 ====== */}
      <div style={{
        background: '#fff', borderRadius: 8, padding: '20px 24px', marginBottom: 16,
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <Button icon={<ArrowLeftOutlined />} onClick={onBack}>{t('common.back')}</Button>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{t('asset.purchaseReqAddTitle')}</h2>
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
                label={t('asset.colReqTitle')} name="title"
                rules={[{ required: true, message: t('asset.reqTitleRequired') }]}
              >
                <Input placeholder={t('asset.reqTitleRequired')} allowClear />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                label={t('asset.colDepartment')} name="department"
                rules={[{ required: true, message: t('asset.departmentRequired') }]}
              >
                <Select
                  placeholder={t('asset.departmentPh')} showSearch
                  options={EAM_DEPARTMENTS.map((d) => ({ label: d, value: d }))}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                label={t('asset.colApplicant')} name="applicant"
                rules={[{ required: true, message: t('asset.applicantRequired') }]}
              >
                <Input placeholder={t('asset.userNamePh')} allowClear />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                label={t('asset.colBudget')} name="budget"
                rules={[{ required: true, message: t('asset.budgetRequired') }]}
              >
                <InputNumber style={{ width: '100%' }} min={0} step={1000} addonBefore="MOP" />
              </Form.Item>
            </Col>
            <Col span={16}>
              <Form.Item
                label={t('asset.colReason')} name="reason"
                rules={[{ required: true, message: t('asset.reasonRequired') }]}
              >
                <Input placeholder={t('asset.reasonRequired')} allowClear maxLength={200} />
              </Form.Item>
            </Col>
          </Row>

          {/* ====== 採購明細 ====== */}
          <h3 style={{ margin: '8px 0 12px', fontSize: 16, fontWeight: 600 }}>{t('asset.sectionItems')}</h3>
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
                          showSearch
                          optionFilterProp="label"
                          onChange={(v: number) => handleModelChange(field.name, v)}
                          options={models.map((m) => ({
                            label: `${m.brand} ${m.modelNo} / ${m.name}`, value: m.id,
                          }))}
                        />
                      </Form.Item>
                    </Col>
                    <Col span={4}>
                      <Form.Item
                        name={[field.name, 'qty']} label={t('asset.colQty')}
                        rules={[{ required: true, message: t('asset.qtyRequired') }]}
                      >
                        <InputNumber style={{ width: '100%' }} min={1} />
                      </Form.Item>
                    </Col>
                    <Col span={5}>
                      <Form.Item
                        name={[field.name, 'estPrice']} label={t('asset.colEstPrice')}
                        rules={[{ required: true, message: t('asset.refPriceRequired') }]}
                      >
                        <InputNumber style={{ width: '100%' }} min={0} addonBefore="MOP" />
                      </Form.Item>
                    </Col>
                    <Col span={5}>
                      <Form.Item name={[field.name, 'remark']} label={t('asset.colRemark')}>
                        <Input placeholder={t('asset.remarkPh')} allowClear />
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
                    type="dashed" icon={<PlusOutlined />} block
                    onClick={() => { add({ qty: 1 }); setTimeout(syncItems, 0) }}
                  >
                    {t('asset.btnAddItem')}
                  </Button>
                </Form.Item>
              </>
            )}
          </Form.List>

          {/* ====== 明細預覽與合計 ====== */}
          <Table<ItemRow>
            columns={itemColumns}
            dataSource={items.filter((it) => it.modelId)}
            rowKey={(_, i) => String(i)}
            size="small"
            pagination={false}
            summary={() => (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={3}>
                  <b>{t('asset.colTotalAmount')}</b>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="right">
                  <b style={{ color: totalAmount > (form.getFieldValue('budget') || 0) ? '#FF4D4F' : '#E8720C' }}>
                    {`MOP ${totalAmount.toLocaleString()}`}
                  </b>
                </Table.Summary.Cell>
              </Table.Summary.Row>
            )}
          />
        </Form>
      </div>

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
