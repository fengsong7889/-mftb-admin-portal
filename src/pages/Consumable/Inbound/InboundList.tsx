/**
 * 耗材入庫單列表頁
 *
 * 搜索：入庫單號、入庫類型、所屬品牌、購買公司、創建時間
 * 列：單號、入庫類型、所屬品牌、購買公司、供應商、明細數量、總數量、總金額、入庫日期、創建人、創建時間、操作
 * 操作：詳情跳獨立詳情頁；新建走獨立新建頁（規範禁止 Modal）
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Table, Input, Select, DatePicker, Tag, message, Form } from 'antd'
import type { TableColumnsType } from 'antd'
import { PlusOutlined, SearchOutlined, ReloadOutlined } from '@ant-design/icons'
import type { Dayjs } from 'dayjs'
import {
  fetchConsumableInboundOrders, fetchPurchaseCompanyOptions,
  type ConsumableInboundOrder, type PurchaseCompany
} from '@/api/consumable'
import { useColumnConfig } from '@/hooks/useColumnConfig'
import { useCompanyBrand } from '../../../contexts/CompanyBrandContext'
import { INBOUND_TYPE_MAP } from './inboundMeta'

interface Props {
  /** 跳转新建入库单独立页 */
  onCreate: () => void
  /** 跳转入库单详情独立页 */
  onDetail: (id: number) => void
}

interface InboundFilters {
  inboundNo?: string
  inboundType?: string
  companyBrand?: number
  purchaseCompanyId?: number
  startTime?: string
  endTime?: string
  createTime?: Dayjs | null
}

export default function InboundList({ onCreate, onDetail }: Props) {
  const { t } = useTranslation()
  const [form] = Form.useForm<InboundFilters>()
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<ConsumableInboundOrder[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(20)
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
        <Button type="link" size="small" onClick={() => onDetail(r.id)}>{t('common.detail')}</Button>
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
          <Button type="primary" icon={<PlusOutlined />} onClick={onCreate}>{t('consumable.inboundBtnNew')}</Button>
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
    </>
  )
}
