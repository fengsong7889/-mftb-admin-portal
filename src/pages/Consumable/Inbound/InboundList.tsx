/**
 * 耗材入庫單列表頁
 *
 * 搜索：入庫單號、入庫類型、所屬品牌、購買公司、創建時間
 * 列：單號、入庫類型、所屬品牌、購買公司、供應商、明細數量、總數量、總金額、入庫日期、創建人、創建時間、操作
 * 操作：查看明細
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Button, Table, Input, Select, DatePicker, Tag, message, Space, Form, Modal, Descriptions } from 'antd'
import type { TableColumnsType } from 'antd'
import { PlusOutlined, SearchOutlined, ReloadOutlined, EyeOutlined } from '@ant-design/icons'
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

const INBOUND_TYPE_MAP: Record<string, { label: string; color: string }> = {
  in_purchase: { label: '採購入庫', color: 'blue' },
  in_manual: { label: '手工入庫', color: 'green' },
  in_init: { label: '期初建賬', color: 'default' },
}

export default function InboundList() {
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
      message.error(e instanceof Error ? e.message : '查詢失敗')
    } finally {
      setLoading(false)
    }
  }, [page, size])

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
      message.error(e instanceof Error ? e.message : '查詢詳情失敗')
    }
  }

  const columns: TableColumnsType<ConsumableInboundOrder> = [
    { title: '入庫單號', dataIndex: 'inboundNo', key: 'inboundNo', width: 170, render: (v: string) => <span style={{ fontFamily: 'monospace' }}>{v}</span> },
    { title: '入庫類型', dataIndex: 'inboundType', key: 'inboundType', width: 100,
      render: (v: string) => { const t = INBOUND_TYPE_MAP[v]; return t ? <Tag color={t.color}>{t.label}</Tag> : v } },
    { title: '所屬品牌', dataIndex: 'companyBrandName', key: 'companyBrandName', width: 100, render: (v: string) => v || '-' },
    { title: '購買公司', dataIndex: 'purchaseCompany', key: 'purchaseCompany', width: 150, ellipsis: true, render: (v: string) => v || '-' },
    { title: '供應商', dataIndex: 'supplierName', key: 'supplierName', width: 130, ellipsis: true, render: (v: string) => v || '-' },
    { title: '明細行數', key: 'lineCount', width: 90, align: 'right', render: (_: unknown, r) => r.items?.length ?? 0 },
    { title: '總數量', dataIndex: 'totalQty', key: 'totalQty', width: 90, align: 'right' },
    { title: '總金額', dataIndex: 'totalAmount', key: 'totalAmount', width: 120, align: 'right', render: (v?: number) => `¥${(v ?? 0).toFixed(2)}` },
    { title: '入庫日期', dataIndex: 'bizDate', key: 'bizDate', width: 110, render: (v: string) => v || '-' },
    { title: '創建人', dataIndex: 'createdBy', key: 'createdBy', width: 100, render: (v: string) => v || '-' },
    { title: '創建時間', dataIndex: 'createdAt', key: 'createdAt', width: 165, render: (v: string) => v || '-' },
    { title: '操作', key: 'action', width: 80, fixed: 'right' as const,
      render: (_: unknown, r: ConsumableInboundOrder) => (
        <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => handleViewDetail(r.id)}>詳情</Button>
      ) },
  ]

  const columnMeta = useMemo(() => [
    { key: 'inboundNo', title: '入庫單號' },
    { key: 'inboundType', title: '入庫類型' },
    { key: 'companyBrandName', title: '所屬品牌' },
    { key: 'purchaseCompany', title: '購買公司' },
    { key: 'supplierName', title: '供應商' },
    { key: 'lineCount', title: '明細行數' },
    { key: 'totalQty', title: '總數量' },
    { key: 'totalAmount', title: '總金額' },
    { key: 'bizDate', title: '入庫日期' },
    { key: 'createdBy', title: '創建人' },
    { key: 'createdAt', title: '創建時間' },
    { key: 'action', title: '操作' },
  ], [])

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
      message.success('入庫單創建成功')
      setCreateVisible(false)
      createForm.resetFields()
      loadData()
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'errorFields' in e) return // form validation
      message.error(e instanceof Error ? e.message : '創建失敗')
    }
  }

  return (
    <>
      <div className="search-section">
        <Form form={form} layout="inline">
          <Form.Item label="入庫單號" name="inboundNo">
            <Input placeholder="入庫單號" allowClear onPressEnter={handleSearch} />
          </Form.Item>
          <Form.Item label="入庫類型" name="inboundType">
            <Select placeholder="全部" allowClear style={{ width: 120 }}
              options={[{ label: '採購入庫', value: 'in_purchase' }, { label: '手工入庫', value: 'in_manual' }, { label: '期初建賬', value: 'in_init' }]} />
          </Form.Item>
          <Form.Item label="所屬品牌" name="companyBrand">
            <Select placeholder="全部" allowClear style={{ width: 120 }}
              options={brandOptions.map(b => ({ label: b.label, value: b.value as number }))} />
          </Form.Item>
          <Form.Item label="購買公司" name="purchaseCompanyId">
            <Select placeholder="全部" allowClear style={{ width: 150 }}
              options={purchaseCompanies.map(c => ({ label: c.name, value: c.id }))} />
          </Form.Item>
          <Form.Item label="創建時間" name="createTime">
            <DatePicker placeholder="選擇日期" />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>查詢</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>重置</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      <div className="action-section">
        <div className="action-section-left" />
        <div className="action-section-right">
          <Space>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateVisible(true)}>新建入庫單</Button>
            {configComponent}
          </Space>
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
          showTotal: (t) => `共 ${t} 條`,
          onChange: (p, s) => { setPage(p); setSize(s) },
        }}
      />

      {/* 详情弹窗 */}
      <Modal title="入庫單詳情" open={detailVisible} onCancel={() => setDetailVisible(false)} footer={null} width={800}>
        {detailData && (
          <>
            <Descriptions column={3} size="small">
              <Descriptions.Item label="入庫單號">{detailData.inboundNo}</Descriptions.Item>
              <Descriptions.Item label="入庫類型">{INBOUND_TYPE_MAP[detailData.inboundType]?.label ?? detailData.inboundType}</Descriptions.Item>
              <Descriptions.Item label="所屬品牌">{detailData.companyBrandName || '-'}</Descriptions.Item>
              <Descriptions.Item label="購買公司">{detailData.purchaseCompany || '-'}</Descriptions.Item>
              <Descriptions.Item label="供應商">{detailData.supplierName || '-'}</Descriptions.Item>
              <Descriptions.Item label="入庫日期">{detailData.bizDate || '-'}</Descriptions.Item>
              <Descriptions.Item label="總數量">{detailData.totalQty}</Descriptions.Item>
              <Descriptions.Item label="總金額">¥{(detailData.totalAmount ?? 0).toFixed(2)}</Descriptions.Item>
              <Descriptions.Item label="備註">{detailData.remark || '-'}</Descriptions.Item>
            </Descriptions>
            <Table
              columns={[
                { title: '耗材編碼', dataIndex: 'itemCode', key: 'itemCode', width: 100 },
                { title: '名稱', dataIndex: 'itemName', key: 'itemName', width: 150 },
                { title: '規格', dataIndex: 'spec', key: 'spec', width: 120 },
                { title: '倉庫', dataIndex: 'locationName', key: 'locationName', width: 100 },
                { title: '數量', dataIndex: 'qty', key: 'qty', width: 80, align: 'right' },
                { title: '單價', dataIndex: 'unitPrice', key: 'unitPrice', width: 100, align: 'right', render: (v?: number) => `¥${(v ?? 0).toFixed(2)}` },
                { title: '金額', dataIndex: 'amount', key: 'amount', width: 110, align: 'right', render: (v?: number) => `¥${(v ?? 0).toFixed(2)}` },
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
      <Modal title="新建入庫單" open={createVisible} onCancel={() => setCreateVisible(false)}
        onOk={handleCreate} okText="確認創建" width={700}>
        <Form form={createForm} layout="vertical">
          <Form.Item label="所屬品牌" name="companyBrand" rules={[{ required: true, message: '請選擇所屬品牌' }]}>
            <Select placeholder="請選擇" options={brandOptions.map(b => ({ label: b.label, value: b.value as number }))} />
          </Form.Item>
          <Form.Item label="購買公司" name="purchaseCompanyId" rules={[{ required: true, message: '請選擇購買公司' }]}>
            <Select placeholder="請選擇" options={purchaseCompanies.map(c => ({ label: c.name, value: c.id }))} />
          </Form.Item>
          <Form.Item label="入庫類型" name="inboundType" initialValue="in_manual">
            <Select options={[{ label: '手工入庫', value: 'in_manual' }, { label: '期初建賬', value: 'in_init' }]} />
          </Form.Item>
          <Form.Item label="供應商" name="supplierName">
            <Input placeholder="供應商名稱（選填）" />
          </Form.Item>
          <Form.Item label="入庫日期" name="bizDate">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="備註" name="remark">
            <Input.TextArea rows={2} placeholder="備註（選填）" />
          </Form.Item>
          <Form.List name="items" rules={[{ validator: async (_, items) => { if (!items || items.length === 0) throw new Error('至少添加一條入庫明細') } }]}>
            {(fields, { add, remove }, { errors }) => (
              <>
                {fields.map((field) => (
                  <Space key={field.key} align="baseline" style={{ display: 'flex', marginBottom: 8 }}>
                    <Form.Item {...field} name={[field.name, 'itemId']} rules={[{ required: true, message: '請選耗材' }]} style={{ marginBottom: 0 }}>
                      <Select placeholder="耗材" style={{ width: 180 }} showSearch optionFilterProp="label"
                        options={itemOptions.map(i => ({ label: `${i.itemCode} ${i.name}`, value: i.id }))} />
                    </Form.Item>
                    <Form.Item {...field} name={[field.name, 'locationId']} style={{ marginBottom: 0 }}>
                      <Select placeholder="倉庫" style={{ width: 120 }} allowClear showSearch optionFilterProp="label"
                        options={locationOptions.map(l => ({ label: l.name, value: l.id }))} />
                    </Form.Item>
                    <Form.Item {...field} name={[field.name, 'qty']} rules={[{ required: true, message: '數量' }]} style={{ marginBottom: 0 }}>
                      <Input type="number" placeholder="數量" style={{ width: 80 }} />
                    </Form.Item>
                    <Form.Item {...field} name={[field.name, 'unitPrice']} rules={[{ required: true, message: '單價' }]} style={{ marginBottom: 0 }}>
                      <Input type="number" placeholder="單價" style={{ width: 100 }} />
                    </Form.Item>
                    <Button type="text" danger onClick={() => remove(field.name)}>刪除</Button>
                  </Space>
                ))}
                <Button type="dashed" onClick={() => add()} block style={{ marginBottom: 8 }}>+ 添加明細</Button>
                <Form.ErrorList errors={errors} />
              </>
            )}
          </Form.List>
        </Form>
      </Modal>
    </>
  )
}
