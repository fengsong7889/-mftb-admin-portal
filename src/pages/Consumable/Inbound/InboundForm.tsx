/**
 * 耗材入库单 - 新建独立页面
 *
 * 遵循表单页规范：橙色渐变顶条 + 返回按钮 + 模块卡片（基础信息 / 入库明细）+ 底部 .form-footer
 * 明细行采用「表头 + CSS Grid 对齐」而非弹窗内的横向挤压，保证空间充裕可核对金额
 */
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Button, DatePicker, Form, Input, InputNumber, Select, message } from 'antd'
import { ArrowLeftOutlined, ImportOutlined, PlusOutlined, ProfileOutlined, SaveOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import type { Dayjs } from 'dayjs'
import {
  createConsumableInboundOrder, fetchConsumableItemOptions, fetchPurchaseCompanyOptions,
  type ConsumableInboundOrderSave, type ConsumableItem, type PurchaseCompany,
} from '../../../api/consumable'
import { fetchLocationList, type AssetLocation } from '../../../api/eam'
import { useCompanyBrand } from '../../../contexts/CompanyBrandContext'
import { INBOUND_CREATE_TYPES, INBOUND_TYPE_MAP, type InboundLine } from './inboundMeta'

interface FormValues {
  companyBrand?: number
  purchaseCompanyId?: number
  inboundType: string
  supplierName?: string
  bizDate?: Dayjs
  remark?: string
  lines: InboundLine[]
}

interface Props {
  onBack: () => void
}

/** 模块卡片样式（表单页：可保留 1px 描边 + 浅阴影） */
const CARD_STYLE: CSSProperties = {
  border: '1px solid #e8eaed', borderRadius: 8, background: '#fff',
  padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
}

/** 明细行网格：耗材 / 仓库 / 数量 / 单价 / 金额 / 删除 */
const LINE_GRID = 'minmax(220px, 2fr) minmax(150px, 1.4fr) 110px 130px 120px 64px'

export default function InboundForm({ onBack }: Props) {
  const { t } = useTranslation()
  const [form] = Form.useForm<FormValues>()
  const [submitting, setSubmitting] = useState(false)
  const [itemOptions, setItemOptions] = useState<ConsumableItem[]>([])
  const [locationOptions, setLocationOptions] = useState<AssetLocation[]>([])
  const [purchaseCompanies, setPurchaseCompanies] = useState<PurchaseCompany[]>([])
  const { numericOptions: brandOptions } = useCompanyBrand()
  // 监听明细用于实时合计，让用户在保存前就能核对总数量与总金额
  const lines = Form.useWatch('lines', form) ?? []

  useEffect(() => {
    fetchConsumableItemOptions().then(setItemOptions).catch(() => setItemOptions([]))
    fetchLocationList().then(setLocationOptions).catch(() => setLocationOptions([]))
    fetchPurchaseCompanyOptions().then(setPurchaseCompanies).catch(() => setPurchaseCompanies([]))
  }, [])

  const itemSelectOptions = useMemo(
    () => itemOptions.map(i => ({ label: `${i.itemCode} ${i.name}${i.spec ? ` / ${i.spec}` : ''}`, value: i.id })),
    [itemOptions],
  )
  const locationSelectOptions = useMemo(
    () => locationOptions.map(l => ({ label: l.name, value: l.id })),
    [locationOptions],
  )
  const companySelectOptions = useMemo(
    () => purchaseCompanies.map(c => ({ label: c.name, value: c.id })),
    [purchaseCompanies],
  )

  const totalQty = lines.reduce((sum, l) => sum + (l.qty ?? 0), 0)
  const totalAmount = lines.reduce((sum, l) => sum + (l.qty ?? 0) * (l.unitPrice ?? 0), 0)

  const handleSubmit = async () => {
    let values: FormValues
    try {
      values = await form.validateFields()
    } catch {
      // 校验失败由 antd 就地展示在字段下方，无需再弹提示（避免双弹）
      return
    }
    const dto: ConsumableInboundOrderSave = {
      inboundType: values.inboundType,
      companyBrand: values.companyBrand,
      purchaseCompanyId: values.purchaseCompanyId,
      supplierName: values.supplierName?.trim(),
      bizDate: values.bizDate?.format('YYYY-MM-DD'),
      remark: values.remark?.trim(),
      items: (values.lines ?? []).map(l => ({
        itemId: l.itemId ?? 0,
        locationId: l.locationId ?? 0,
        qty: l.qty ?? 0,
        unitPrice: l.unitPrice ?? 0,
      })),
    }
    try {
      setSubmitting(true)
      await createConsumableInboundOrder(dto)
      message.success(t('consumable.inboundCreateSuccess'))
      onBack()
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : t('consumable.inboundCreateFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      {/* ====== 顶部标题栏（橙色渐变顶条） ====== */}
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
              backgroundColor: '#E8720C', borderColor: '#E8720C', borderRadius: 8, height: 36,
              padding: '0 16px', display: 'flex', alignItems: 'center', gap: 6,
              boxShadow: '0 2px 6px rgba(232,114,12,0.25)', transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          >{t('common.back')}</Button>
          <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>{t('consumable.inboundBtnNew')}</h2>
        </div>
      </div>

      <Form<FormValues> form={form} layout="vertical" initialValues={{ inboundType: 'in_manual', lines: [{}] }}>
        {/* ====== 模块一：基础信息 ====== */}
        <div style={CARD_STYLE}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#e6f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ImportOutlined style={{ fontSize: 14, color: '#1890ff' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('consumable.sectionBasic')}</span>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <Form.Item label={t('common.colBrand')} name="companyBrand" rules={[{ required: true, message: t('consumable.brandRequired') }]}>
              <Select placeholder={t('common.placeholderSelect')} showSearch optionFilterProp="label"
                options={brandOptions.map(b => ({ label: b.label, value: b.value as number }))} />
            </Form.Item>
            <Form.Item label={t('consumable.purchaseCompany')} name="purchaseCompanyId" rules={[{ required: true, message: t('consumable.companyRequired') }]}>
              <Select placeholder={t('common.placeholderSelect')} showSearch optionFilterProp="label" options={companySelectOptions} />
            </Form.Item>
            <Form.Item label={t('consumable.inboundType')} name="inboundType">
              <Select options={INBOUND_CREATE_TYPES.map(v => ({ label: t(INBOUND_TYPE_MAP[v].labelKey), value: v }))} />
            </Form.Item>
            <Form.Item label={t('consumable.supplier')} name="supplierName">
              <Input placeholder={t('consumable.supplierPh')} allowClear maxLength={128} />
            </Form.Item>
            <Form.Item label={t('consumable.inboundBizDate')} name="bizDate">
              <DatePicker placeholder={t('consumable.phDate')} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label={t('consumable.remark')} name="remark">
              <Input.TextArea rows={1} placeholder={t('consumable.remarkPh')} maxLength={500} allowClear />
            </Form.Item>
          </div>
        </div>

        {/* ====== 模块二：入库明细 ====== */}
        <div style={CARD_STYLE}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#fff7e6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ProfileOutlined style={{ fontSize: 14, color: '#FA8C16' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('consumable.sectionItems')}</span>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
            <span style={{ fontSize: 12, color: '#8c8c8c' }}>{t('consumable.inboundSaveHint')}</span>
          </div>

          {/* 表头（与下方每行共用同一 grid 模板保证对齐） */}
          <div style={{ display: 'grid', gridTemplateColumns: LINE_GRID, gap: 12, marginBottom: 8, fontSize: 13, color: '#595959' }}>
            <span>{t('consumable.inboundItemName')}</span>
            <span>{t('consumable.inboundWarehouse')}</span>
            <span>{t('consumable.inboundQty')}</span>
            <span>{t('consumable.inboundUnitPrice')}</span>
            <span style={{ textAlign: 'right' }}>{t('consumable.inboundAmount')}</span>
            <span />
          </div>

          <Form.List name="lines" rules={[{ validator: async (_, value) => { if (!value || value.length === 0) throw new Error(t('consumable.linesRequired')) } }]}>
            {(fields, { add, remove }, { errors }) => (
              <>
                {fields.map((field, index) => {
                  const line = lines[index] ?? {}
                  const lineAmount = (line.qty ?? 0) * (line.unitPrice ?? 0)
                  return (
                    <div key={field.key} style={{ display: 'grid', gridTemplateColumns: LINE_GRID, gap: 12, alignItems: 'start' }}>
                      <Form.Item name={[field.name, 'itemId']} rules={[{ required: true, message: t('consumable.itemRequired') }]} style={{ marginBottom: 12 }}>
                        <Select placeholder={t('consumable.itemPh')} showSearch optionFilterProp="label" options={itemSelectOptions} />
                      </Form.Item>
                      <Form.Item name={[field.name, 'locationId']} style={{ marginBottom: 12 }}>
                        <Select placeholder={t('consumable.inboundWarehouse')} allowClear showSearch optionFilterProp="label" options={locationSelectOptions} />
                      </Form.Item>
                      <Form.Item name={[field.name, 'qty']} rules={[{ required: true, message: t('consumable.qtyRequired') }]} style={{ marginBottom: 12 }}>
                        <InputNumber min={1} precision={0} style={{ width: '100%' }} placeholder={t('consumable.inboundQty')} />
                      </Form.Item>
                      <Form.Item name={[field.name, 'unitPrice']} rules={[{ required: true, message: t('consumable.priceRequired') }]} style={{ marginBottom: 12 }}>
                        <InputNumber min={0} step={0.01} precision={2} style={{ width: '100%' }} placeholder={t('consumable.inboundUnitPrice')} />
                      </Form.Item>
                      <div style={{ height: 32, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', color: '#262626' }}>
                        MOP {lineAmount.toFixed(2)}
                      </div>
                      <div style={{ height: 32, display: 'flex', alignItems: 'center' }}>
                        <Button type="link" size="small" danger disabled={fields.length === 1}
                          onClick={() => remove(field.name)}>{t('common.delete')}</Button>
                      </div>
                    </div>
                  )
                })}
                <Button type="dashed" block icon={<PlusOutlined />} onClick={() => add({})} style={{ marginBottom: 8 }}>
                  {t('consumable.addLine')}
                </Button>
                <Form.ErrorList errors={errors} />
              </>
            )}
          </Form.List>

          {/* 合计行：与表格分离的浅底汇总，避免与明细行混淆 */}
          <div style={{ background: '#fafafa', borderRadius: 8, padding: '10px 16px', display: 'flex', justifyContent: 'flex-end', gap: 24 }}>
            <span style={{ fontSize: 12, color: '#8C8C8C' }}>{t('consumable.inboundItemCount', { count: lines.length })}</span>
            <span style={{ fontSize: 12, color: '#8C8C8C' }}>{t('consumable.totalQty')}：<span style={{ color: '#262626', fontWeight: 600 }}>{totalQty}</span></span>
            <span style={{ fontSize: 12, color: '#8C8C8C' }}>{t('common.colTotal')}：<span style={{ color: '#E8720C', fontWeight: 600 }}>MOP {totalAmount.toFixed(2)}</span></span>
          </div>
        </div>
      </Form>

      {/* ====== 底部操作栏（取消 + 保存） ====== */}
      <div className="form-footer">
        <Button onClick={onBack}>{t('common.cancel')}</Button>
        <Button type="primary" icon={<SaveOutlined />} loading={submitting} onClick={handleSubmit}>{t('common.save')}</Button>
      </div>
    </>
  )
}
