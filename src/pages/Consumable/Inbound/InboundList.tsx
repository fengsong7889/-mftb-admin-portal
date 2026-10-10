/**
 * 耗材入庫單列表頁
 *
 * 搜索：入庫單號、入庫類型、所屬品牌、購買公司、創建時間
 * 列：單號、入庫類型、所屬品牌、購買公司、供應商、明細數量、總數量、總金額、入庫日期、創建人、創建時間、操作
 * 操作：查看明細
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Table, Input, Select, DatePicker, Tag, message, Space, Form, Modal, Descriptions } from 'antd'
import type { TableColumnsType } from 'antd'
import { PlusOutlined, SearchOutlined, ReloadOutlined } from '@ant-design/icons'
import type { Dayjs } from 'dayjs'
import {
  fetchConsumableInboundOrders, fetchConsumableInboundOrderDetail,
  createConsumableInboundOrder, fetchConsumableItemOptions,
  fetchPurchaseCompanyOptions,
  type ConsumableInboundOrder, type ConsumableInboundOrderSave, type ConsumableItem, type PurchaseCompany
} from '@/api/consumable'
import { type AssetLocation, fetchLocationList } from '@/api/eam'
import { useColumnConfig } from '@/hooks/useColumnConfig'
import { useCompanyBrand } from '../../../contexts/CompanyBrandContext'

interface InboundFilters {
  inboundNo?: string
  inboundType?: string
  companyBrand?: number
  purchaseCompanyId?: number
  startTime?: string
  endTime?: string
  createTime?: Dayjs | null
}

/** 入库类型 → i18n 文案 key + Tag 颜色 */
const INBOUND_TYPE_MAP: Record<string, { labelKey: string; color: string }> = {
  in_purchase: { labelKey: 'consumable.typePurchase', color: 'blue' },
  in_manual: { labelKey: 'consumable.typeManual', color: 'green' },
  in_init: { labelKey: 'consumable.typeInit', color: 'default' },
}

export default function InboundList() {
  const { t } = useTranslation()
  const [form] = Form.useForm<InboundFilters>()
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<ConsumableInboundOrder[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(20)
  const [detailVisible, setDetailVisible] = useState(false)
  const [detailData, setDetailData] = useState<ConsumableInboundOrder | null>(null)
  const [createVisible, setCreateVisible] = useState(false)
  const [itemOptions, setItemOptions] = useState<ConsumableItem[]>([])
  const [locationOptions, setLocationOptions] = useState<AssetLocation[]>([])
  const [purchaseCompanies, setPurchaseCompanies] = useState<PurchaseCompany[]>([])
  const { numericOptions: brandOptions } = useCompanyBrand()

  const loadData = useCallback(async (filters?: InboundFilters, p?: number, s?: number) => {
    setLoading(true)
    try {
      const params: Record<string, unknown> = { page: p ?? page, size: s ?? size }
      if (filters?.inboundNo) params.inboundNo = filters.inboundNo
      if (filters?.inboundType) params.inboundType = filters.inboundType
      if (filters?.companyBrand) params.companyBrand = filters.companyBrand
      if (filters?.purchaseCompanyId) params.purchaseCompanyId = filters.purchaseCompanyId
      if (filters?.startTime) params.startTime = filters.startTime
      if (filters?.endTime) params.endTime = filters.endTime
      const res = await fetchConsumableInboundOrders(params as Record<string, string | number>)
      setRows(res.records)
      setTotal(res.total)
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : t('consumable.queryFailed'))
    } finally {
      setLoading(false)
    }
  }, [page, size, t])

  useEffect(() => { loadData() }, [loadData])

  useEffect(() => {
    fetchConsumableItemOptions().then(setItemOptions).catch(() => setItemOptions([]))
    fetchLocationList().then(setLocationOptions).catch(() => setLocationOptions([]))
    fetchPurchaseCompanyOptions().then(setPurchaseCompanies).catch(() => setPurchaseCompanies([]))
  }, [])

  const handleSearch = () => {
    const values = form.getFieldsValue()
    const params: InboundFilters = {}
    if (values.inboundNo?.trim()) params.inboundNo = values.inboundNo.trim()
    if (values.inboundType) params.inboundType = values.inboundType
    if (values.companyBrand) params.companyBrand = values.companyBrand
    if (values.purchaseCompanyId) params.purchaseCompanyId = values.purchaseCompanyId
    if (values.createTime) {
      params.startTime = values.createTime.format('YYYY-MM-DD')
      params.endTime = values.createTime.format('YYYY-MM-DD')
    }
    setPage(1)
    loadData(params, 1, size)
  }

  const handleReset = () => { form.resetFields(); setPage(1); loadData() }

  const handleViewDetail = async (id: number) => {
    try {
      const data = await fetchConsumableInboundOrderDetail(id)
      setDetailData(data)
      setDetailVisible(true)
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : t('consumable.queryFailed'))
    }
  }

  /* ── 列定义（title 跟随当前语言） ── */
  const columns: TableColumnsType<ConsumableInboundOrder> = [
    { title: t('consumable.inboundNo'), dataIndex: 'inboundNo', key: 'inboundNo', width: 170, render: (v: string) => <span style={{ fontFamily: 'monospace' }}>{v}</span> },
    { title: t('consumable.inboundType'), dataIndex: 'inboundType', key: 'inboundType', width: 100,
      render: (v: string) => { const meta = INBOUND_TYPE_MAP[v]; return meta ? <Tag color={meta.color}>{t(meta.labelKey)}</Tag> : v } },
    { title: t('common.colBrand'), dataIndex: 'companyBrandName', key: 'companyBrandName', width: 100, render: (v: string) => v || '-' },
    { title: t('consumable.purchaseCompany'), dataIndex: 'purchaseCompany', key: 'purchaseCompany', width: 150, ellipsis: true, render: (v: string) => v || '-' },
    { title: t('consumable.supplier'), dataIndex: 'supplierName', key: 'supplierName', width: 130, ellipsis: true, render: (v: string) => v || '-' },
    { title: t('consumable.inboundLineCount'), key: 'lineCount', width: 90, align: 'right', render: (_: unknown, r) => r.items?.length ?? 0 },
    { title: t('consumable.totalQty'), dataIndex: 'totalQty', key: 'totalQty', width: 90, align: 'right' },
    { title: t('consumable.inboundTotalAmount'), dataIndex: 'totalAmount', key: 'totalAmount', width: 120, align: 'right', render: (v?: number) => `MOP ${(v ?? 0).toFixed(2)}` },
    { title: t('consumable.inboundBizDate'), dataIndex: 'bizDate', key: 'bizDate', width: 110, render: (v: string) => v || '-' },
    { title: t('common.colCreator'), dataIndex: 'createdBy', key: 'createdBy', width: 100, render: (v: string) => v || '-' },
    { title: t('common.colCreateTime'), dataIndex: 'createdAt', key: 'createdAt', width: 165, render: (v: string) => v || '-' },
    { title: t('common.colAction'), key: 'action', width: 80, fixed: 'right' as const,
      render: (_: unknown, r: ConsumableInboundOrder) => (
        <Button type="link" size="small" onClick={() => handleViewDetail(r.id)}>{t('common.detail')}</Button>
      ) },
  ]

  /* ── 列字段配置（key 保持穩定以免影響已保存的列配置） ── */
  const columnMeta = useMemo(() => [
    { key: 'inboundNo', title: t('consumable.inboundNo') },
    { key: 'inboundType', title: t('consumable.inboundType') },
    { key: 'companyBrandName', title: t('common.colBrand') },
    { key: 'purchaseCompany', title: t('consumable.purchaseCompany') },
    { key: 'supplierName', title: t('consumable.supplier') },
    { key: 'lineCount', title: t('consumable.inboundLineCount') },
    { key: 'totalQty', title: t('consumable.totalQty') },
    { key: 'totalAmount', title: t('consumable.inboundTotalAmount') },
    { key: 'bizDate', title: t('consumable.inboundBizDate') },
    { key: 'createdBy', title: t('common.colCreator') },
    { key: 'createdAt', title: t('common.colCreateTime') },
    { key: 'action', title: t('common.colAction') },
  ], [t])

  const { configComponent, applyConfig } = useColumnConfig('consumable-inbound', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' },
  ])

  // 创建入库单表单
  const [createForm] = Form.useForm()
  const handleCreate = async () => {
    try {
      const values = await createForm.validateFields()
      const dto: ConsumableInboundOrderSave = {
        inboundType: values.inboundType || 'in_manual',
        companyBrand: values.companyBrand,
        purchaseCompanyId: values.purchaseCompanyId,
        supplierName: values.supplierName,
        bizDate: values.bizDate?.format('YYYY-MM-DD'),
        remark: values.remark,
        items: (values.items || []).map((it: { itemId: number; locationId?: number; qty: number; unitPrice: number }) => ({
          itemId: it.itemId,
          locationId: it.locationId || 0,
          qty: it.qty,
          unitPrice: it.unitPrice,
        })),
      }
      await createConsumableInboundOrder(dto)
      message.success(t('consumable.inboundCreateSuccess'))
      setCreateVisible(false)
      createForm.resetFields()
      loadData()
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'errorFields' in e) return // form validation
      message.error(e instanceof Error ? e.message : t('consumable.inboundCreateFailed'))
    }
  }

  return (
    <>
      <div className="search-section">
        <Form form={form} layout="inline">
          <Form.Item label={t('consumable.inboundNo')} name="inboundNo">
            <Input placeholder={t('consumable.phInboundNo')} allowClear onPressEnter={handleSearch} />
          </Form.Item>
          <Form.Item label={t('consumable.inboundType')} name="inboundType">
            <Select placeholder={t('common.all')} allowClear
              options={Object.entries(INBOUND_TYPE_MAP).map(([value, meta]) => ({ label: t(meta.labelKey), value }))} />
          </Form.Item>
          <Form.Item label={t('common.colBrand')} name="companyBrand">
            <Select placeholder={t('common.all')} allowClear
              options={brandOptions.map(b => ({ label: b.label, value: b.value as number }))} />
          </Form.Item>
          <Form.Item label={t('consumable.purchaseCompany')} name="purchaseCompanyId">
            <Select placeholder={t('common.all')} allowClear
              options={purchaseCompanies.map(c => ({ label: c.name, value: c.id }))} />
          </Form.Item>
          <Form.Item label={t('common.colCreateTime')} name="createTime">
            <DatePicker placeholder={t('consumable.phDate')} />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>{t('common.search')}</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>{t('common.reset')}</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      <div className="action-section">
        <div className="action-section-left" />
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateVisible(true)}>{t('consumable.inboundBtnNew')}</Button>
          {configComponent}
        </div>
      </div>

      <Table<ConsumableInboundOrder>
        columns={applyConfig(columns)}
        dataSource={rows}
        rowKey="id"
        loading={loading}
        scroll={{ x: 1500 }}
        pagination={{
          current: page, pageSize: size, total,
          showSizeChanger: true, showQuickJumper: true,
          showTotal: (n) => t('common.total', { count: n }),
          onChange: (p, s) => { setPage(p); setSize(s) },
        }}
      />

      {/* 详情弹窗 */}
      <Modal title={t('consumable.inboundDetailTitle')} open={detailVisible} onCancel={() => setDetailVisible(false)} footer={null} width={800}>
        {detailData && (
          <>
            <Descriptions column={3} size="small">
              <Descriptions.Item label={t('consumable.inboundNo')}>{detailData.inboundNo}</Descriptions.Item>
              <Descriptions.Item label={t('consumable.inboundType')}>
                {INBOUND_TYPE_MAP[detailData.inboundType] ? t(INBOUND_TYPE_MAP[detailData.inboundType].labelKey) : detailData.inboundType}
              </Descriptions.Item>
              <Descriptions.Item label={t('common.colBrand')}>{detailData.companyBrandName || '-'}</Descriptions.Item>
              <Descriptions.Item label={t('consumable.purchaseCompany')}>{detailData.purchaseCompany || '-'}</Descriptions.Item>
              <Descriptions.Item label={t('consumable.supplier')}>{detailData.supplierName || '-'}</Descriptions.Item>
              <Descriptions.Item label={t('consumable.inboundBizDate')}>{detailData.bizDate || '-'}</Descriptions.Item>
              <Descriptions.Item label={t('consumable.totalQty')}>{detailData.totalQty}</Descriptions.Item>
              <Descriptions.Item label={t('consumable.inboundTotalAmount')}>MOP {(detailData.totalAmount ?? 0).toFixed(2)}</Descriptions.Item>
              <Descriptions.Item label={t('consumable.remark')}>{detailData.remark || '-'}</Descriptions.Item>
            </Descriptions>
            <Table
              columns={[
                { title: t('consumable.inboundItemCode'), dataIndex: 'itemCode', key: 'itemCode', width: 100 },
                { title: t('consumable.inboundItemName'), dataIndex: 'itemName', key: 'itemName', width: 150 },
                { title: t('consumable.inboundSpec'), dataIndex: 'spec', key: 'spec', width: 120 },
                { title: t('consumable.inboundWarehouse'), dataIndex: 'locationName', key: 'locationName', width: 100 },
                { title: t('consumable.inboundQty'), dataIndex: 'qty', key: 'qty', width: 80, align: 'right' },
                { title: t('consumable.inboundUnitPrice'), dataIndex: 'unitPrice', key: 'unitPrice', width: 100, align: 'right', render: (v?: number) => `MOP ${(v ?? 0).toFixed(2)}` },
                { title: t('consumable.inboundAmount'), dataIndex: 'amount', key: 'amount', width: 110, align: 'right', render: (v?: number) => `MOP ${(v ?? 0).toFixed(2)}` },
              ]}
              dataSource={detailData.items}
              rowKey="id"
              pagination={false}
              size="small"
              style={{ marginTop: 16 }}
            />
          </>
        )}
      </Modal>

      {/* 新建入库单弹窗 */}
      <Modal title={t('consumable.inboundBtnNew')} open={createVisible} onCancel={() => setCreateVisible(false)}
        onOk={handleCreate} okText={t('consumable.createOk')} width={700}>
        <Form form={createForm} layout="vertical">
          <Form.Item label={t('common.colBrand')} name="companyBrand" rules={[{ required: true, message: t('consumable.brandRequired') }]}>
            <Select placeholder={t('common.placeholderSelect')} options={brandOptions.map(b => ({ label: b.label, value: b.value as number }))} />
          </Form.Item>
          <Form.Item label={t('consumable.purchaseCompany')} name="purchaseCompanyId" rules={[{ required: true, message: t('consumable.companyRequired') }]}>
            <Select placeholder={t('common.placeholderSelect')} options={purchaseCompanies.map(c => ({ label: c.name, value: c.id }))} />
          </Form.Item>
          <Form.Item label={t('consumable.inboundType')} name="inboundType" initialValue="in_manual">
            <Select options={[
              { label: t('consumable.typeManual'), value: 'in_manual' },
              { label: t('consumable.typeInit'), value: 'in_init' },
            ]} />
          </Form.Item>
          <Form.Item label={t('consumable.supplier')} name="supplierName">
            <Input placeholder={t('consumable.supplierPh')} />
          </Form.Item>
          <Form.Item label={t('consumable.inboundBizDate')} name="bizDate">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label={t('consumable.remark')} name="remark">
            <Input.TextArea rows={2} placeholder={t('consumable.remarkPh')} />
          </Form.Item>
          <Form.List name="items" rules={[{ validator: async (_, items) => { if (!items || items.length === 0) throw new Error(t('consumable.linesRequired')) } }]}>
            {(fields, { add, remove }, { errors }) => (
              <>
                {fields.map((field) => (
                  <Space key={field.key} align="baseline" style={{ display: 'flex', marginBottom: 8 }}>
                    <Form.Item {...field} name={[field.name, 'itemId']} rules={[{ required: true, message: t('consumable.itemRequired') }]} style={{ marginBottom: 0 }}>
                      <Select placeholder={t('consumable.itemPh')} style={{ width: 180 }} showSearch optionFilterProp="label"
                        options={itemOptions.map(i => ({ label: `${i.itemCode} ${i.name}`, value: i.id }))} />
                    </Form.Item>
                    <Form.Item {...field} name={[field.name, 'locationId']} style={{ marginBottom: 0 }}>
                      <Select placeholder={t('consumable.inboundWarehouse')} style={{ width: 120 }} allowClear showSearch optionFilterProp="label"
                        options={locationOptions.map(l => ({ label: l.name, value: l.id }))} />
                    </Form.Item>
                    <Form.Item {...field} name={[field.name, 'qty']} rules={[{ required: true, message: t('consumable.qtyRequired') }]} style={{ marginBottom: 0 }}>
                      <Input type="number" placeholder={t('consumable.inboundQty')} style={{ width: 80 }} />
                    </Form.Item>
                    <Form.Item {...field} name={[field.name, 'unitPrice']} rules={[{ required: true, message: t('consumable.priceRequired') }]} style={{ marginBottom: 0 }}>
                      <Input type="number" placeholder={t('consumable.inboundUnitPrice')} style={{ width: 100 }} />
                    </Form.Item>
                    <Button type="text" danger onClick={() => remove(field.name)}>{t('common.delete')}</Button>
                  </Space>
                ))}
                <Button type="dashed" onClick={() => add()} block style={{ marginBottom: 8 }}>+ {t('consumable.addLine')}</Button>
                <Form.ErrorList errors={errors} />
              </>
            )}
          </Form.List>
        </Form>
      </Modal>
    </>
  )
}
