/**
 * 耗材消耗統計報表（階段 D）
 *
 * 口徑：公司採購金額 / 剩餘庫存金額 / 部門消耗金額 / 員工消耗金額（數量 + 實際成本）
 * 結構：篩選區（日期範圍 + 品牌 + 購買公司）→ 匯總指標卡 → 四維度 Tab 表格
 */
import { useCallback, useEffect, useState } from 'react'
import { Button, DatePicker, Form, Select, Space, Table, Tabs, Tag, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { SearchOutlined, ReloadOutlined, ExportOutlined } from '@ant-design/icons'
import type { Dayjs } from 'dayjs'
import {
  fetchConsumableReportSummary, fetchConsumableReportByCompany, fetchConsumableReportByDept,
  fetchConsumableReportByApplicant, fetchConsumableReportByItem,
  fetchPurchaseCompanyOptions,
  type ConsumableReportQuery, type ConsumableReportSummary,
  type ConsumableCompanyStat, type ConsumableDeptStat, type ConsumableApplicantStat,
  type ConsumableItemStat, type PurchaseCompany,
} from '@/api/consumable'
import { useCompanyBrand } from '../../../contexts/CompanyBrandContext'
import '@/styles/components.css'

const { RangePicker } = DatePicker

interface FilterValues {
  range?: [Dayjs, Dayjs] | null
  companyBrand?: number
  purchaseCompanyId?: number
}

const money = (v?: number) => `MOP ${(v ?? 0).toFixed(2)}`

/** 匯總指標卡（遵循 §B.7 數據指標統計卡標準） */
function SummaryCard(props: { icon: string; color: string; bg: string; value: string; label: string }) {
  const { icon, color, bg, value, label } = props
  return (
    <div style={{
      flex: 1, minWidth: 180, borderRadius: 12, padding: 16, background: bg,
      border: `1px solid ${color}22`, textAlign: 'center', position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ fontSize: 20, color }}>{icon}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color, marginTop: 4 }}>{value}</div>
      <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 2 }}>{label}</div>
    </div>
  )
}

export default function ConsumableReport() {
  const [form] = Form.useForm<FilterValues>()
  const { numericOptions: brandOptions } = useCompanyBrand()
  const [companies, setCompanies] = useState<PurchaseCompany[]>([])
  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState<ConsumableReportSummary | null>(null)
  const [companyRows, setCompanyRows] = useState<ConsumableCompanyStat[]>([])
  const [deptRows, setDeptRows] = useState<ConsumableDeptStat[]>([])
  const [applicantRows, setApplicantRows] = useState<ConsumableApplicantStat[]>([])
  const [itemRows, setItemRows] = useState<ConsumableItemStat[]>([])

  const buildQuery = useCallback((): ConsumableReportQuery => {
    const v = form.getFieldsValue()
    const q: ConsumableReportQuery = {}
    if (v.range?.[0]) q.startDate = v.range[0].format('YYYY-MM-DD')
    if (v.range?.[1]) q.endDate = v.range[1].format('YYYY-MM-DD')
    if (v.companyBrand != null) q.companyBrand = v.companyBrand
    if (v.purchaseCompanyId != null) q.purchaseCompanyId = v.purchaseCompanyId
    return q
  }, [form])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const q = buildQuery()
      const [s, c, d, a, i] = await Promise.all([
        fetchConsumableReportSummary(q),
        fetchConsumableReportByCompany(q),
        fetchConsumableReportByDept(q),
        fetchConsumableReportByApplicant(q),
        fetchConsumableReportByItem(q),
      ])
      setSummary(s); setCompanyRows(c); setDeptRows(d); setApplicantRows(a); setItemRows(i)
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '查詢失敗')
    } finally {
      setLoading(false)
    }
  }, [buildQuery])

  useEffect(() => {
    loadData()
    fetchPurchaseCompanyOptions().then(setCompanies).catch(() => setCompanies([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleReset = () => { form.resetFields(); setTimeout(loadData, 0) }
  const handleExport = () => {
    if (!companyRows.length && !deptRows.length && !applicantRows.length && !itemRows.length) {
      message.warning('暫無數據可導出'); return
    }
    message.success('導出功能對接中（當前為佔位）')
  }

  /* ===== 四維度列定義 ===== */
  const companyColumns: TableColumnsType<ConsumableCompanyStat> = [
    { title: '所屬品牌', dataIndex: 'companyBrandName', key: 'companyBrandName', width: 110,
      render: (v?: string) => (v && v !== '待確認' ? <Tag color="orange">{v}</Tag> : <Tag>待確認</Tag>) },
    { title: '購買公司', dataIndex: 'purchaseCompanyName', key: 'purchaseCompanyName', width: 170, ellipsis: true },
    { title: '入庫數量', dataIndex: 'inboundQty', key: 'inboundQty', width: 95, align: 'right' },
    { title: '採購/入庫金額', dataIndex: 'inboundAmount', key: 'inboundAmount', width: 140, align: 'right', render: (v: number) => money(v) },
    { title: '消耗數量', dataIndex: 'consumeQty', key: 'consumeQty', width: 95, align: 'right', render: (v: number) => <span style={{ color: '#E8720C', fontWeight: 600 }}>{v}</span> },
    { title: '消耗金額', dataIndex: 'consumeAmount', key: 'consumeAmount', width: 140, align: 'right', render: (v: number) => <span style={{ color: '#E8720C', fontWeight: 600 }}>{money(v)}</span> },
    { title: '退料金額', dataIndex: 'returnAmount', key: 'returnAmount', width: 130, align: 'right', render: (v: number) => (v ? money(v) : '-') },
    { title: '剩餘庫存數量', dataIndex: 'stockQty', key: 'stockQty', width: 120, align: 'right' },
    { title: '剩餘庫存金額', dataIndex: 'stockAmount', key: 'stockAmount', width: 140, align: 'right', render: (v: number) => money(v) },
  ]

  const deptColumns: TableColumnsType<ConsumableDeptStat> = [
    { title: '部門', dataIndex: 'department', key: 'department', render: (v?: string) => v || '未標識部門' },
    { title: '領用單數', dataIndex: 'claimCount', key: 'claimCount', width: 110, align: 'right' },
    { title: '消耗數量', dataIndex: 'consumeQty', key: 'consumeQty', width: 120, align: 'right' },
    { title: '消耗金額（實際成本）', dataIndex: 'consumeAmount', key: 'consumeAmount', width: 190, align: 'right',
      render: (v: number) => <span style={{ color: '#E8720C', fontWeight: 600 }}>{money(v)}</span> },
  ]

  const applicantColumns: TableColumnsType<ConsumableApplicantStat> = [
    { title: '員工', dataIndex: 'applicantName', key: 'applicantName', width: 130 },
    { title: '工號', dataIndex: 'applicantEmpId', key: 'applicantEmpId', width: 120, render: (v?: string) => v || '-' },
    { title: '部門', dataIndex: 'department', key: 'department', width: 160, ellipsis: true, render: (v?: string) => v || '-' },
    { title: '領用單數', dataIndex: 'claimCount', key: 'claimCount', width: 110, align: 'right' },
    { title: '消耗數量', dataIndex: 'consumeQty', key: 'consumeQty', width: 120, align: 'right' },
    { title: '消耗金額（實際成本）', dataIndex: 'consumeAmount', key: 'consumeAmount', width: 190, align: 'right',
      render: (v: number) => <span style={{ color: '#E8720C', fontWeight: 600 }}>{money(v)}</span> },
  ]

  const itemColumns: TableColumnsType<ConsumableItemStat> = [
    { title: '耗材編碼', dataIndex: 'itemCode', key: 'itemCode', width: 110, render: (v: string) => <span style={{ fontFamily: 'monospace' }}>{v || '-'}</span> },
    { title: '名稱', dataIndex: 'itemName', key: 'itemName', width: 160, ellipsis: true },
    { title: '規格', dataIndex: 'spec', key: 'spec', width: 130, ellipsis: true, render: (v?: string) => v || '-' },
    { title: '入庫數量', dataIndex: 'inboundQty', key: 'inboundQty', width: 95, align: 'right' },
    { title: '入庫金額', dataIndex: 'inboundAmount', key: 'inboundAmount', width: 130, align: 'right', render: (v: number) => money(v) },
    { title: '消耗數量', dataIndex: 'consumeQty', key: 'consumeQty', width: 95, align: 'right' },
    { title: '消耗金額', dataIndex: 'consumeAmount', key: 'consumeAmount', width: 140, align: 'right',
      render: (v: number) => <span style={{ color: '#E8720C', fontWeight: 600 }}>{money(v)}</span> },
    { title: '剩餘庫存', dataIndex: 'stockQty', key: 'stockQty', width: 95, align: 'right', render: (v: number, r) => `${v ?? 0} ${r.unit ?? ''}` },
    { title: '庫存金額', dataIndex: 'stockAmount', key: 'stockAmount', width: 130, align: 'right', render: (v: number) => money(v) },
  ]

  const pagination = { showSizeChanger: true, showQuickJumper: true, pageSize: 20, showTotal: (t: number) => `共 ${t} 條` }

  return (
    <div className="content-area" style={{ padding: '20px 24px' }}>
      {/* 篩選區 */}
      <div className="search-section">
        <Form form={form} layout="inline">
          <Form.Item label="統計期間" name="range">
            <RangePicker />
          </Form.Item>
          <Form.Item label="所屬品牌" name="companyBrand">
            <Select placeholder="全部" allowClear style={{ width: 130 }}
              options={brandOptions.map(b => ({ label: b.label, value: b.value as number }))} />
          </Form.Item>
          <Form.Item label="購買公司" name="purchaseCompanyId">
            <Select placeholder="全部" allowClear showSearch optionFilterProp="label" style={{ width: 200 }}
              options={companies.map(c => ({ label: c.name, value: c.id }))} />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={loadData}>查詢</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>重置</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 匯總指標卡 */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <SummaryCard icon="💰" color="#1890FF" bg="#E6F7FF" value={money(summary?.purchaseAmount)} label={`期間採購金額（${summary?.purchaseQty ?? 0} 件）`} />
        <SummaryCard icon="🔥" color="#E8720C" bg="#FFF7E6" value={money(summary?.consumeAmount)} label={`期間消耗金額（${summary?.consumeQty ?? 0} 件）`} />
        <SummaryCard icon="📦" color="#52C41A" bg="#F6FFED" value={money(summary?.stockAmount)} label={`當前庫存金額（${summary?.stockQty ?? 0} 件）`} />
        <SummaryCard icon="👥" color="#722ED1" bg="#F9F0FF"
          value={`${summary?.deptCount ?? 0} / ${summary?.applicantCount ?? 0}`} label="消耗部門數 / 員工數" />
      </div>

      <div className="action-section">
        <div className="action-section-left">
          <Space>
            <Button className="btn-export" icon={<ExportOutlined />} onClick={handleExport}>導出</Button>
          </Space>
        </div>
        <div className="action-section-right">
          <span style={{ fontSize: 12, color: '#8C8C8C' }}>消耗口徑：領用發放（out_claim）實際加權成本；庫存金額為實時值，不受統計期間過濾</span>
        </div>
      </div>

      <Tabs
        items={[
          {
            key: 'company', label: '按公司',
            children: <Table<ConsumableCompanyStat> columns={companyColumns} dataSource={companyRows}
              rowKey={r => `${r.companyBrand ?? 'x'}-${r.purchaseCompanyId ?? 'x'}`} loading={loading}
              scroll={{ x: 1150 }} pagination={pagination} size="middle" />,
          },
          {
            key: 'dept', label: '按部門',
            children: <Table<ConsumableDeptStat> columns={deptColumns} dataSource={deptRows}
              rowKey={r => String(r.departmentId ?? 'unknown')} loading={loading}
              pagination={pagination} size="middle" />,
          },
          {
            key: 'applicant', label: '按員工',
            children: <Table<ConsumableApplicantStat> columns={applicantColumns} dataSource={applicantRows}
              rowKey={r => String(r.applicantId ?? 'unknown')} loading={loading}
              scroll={{ x: 830 }} pagination={pagination} size="middle" />,
          },
          {
            key: 'item', label: '按耗材',
            children: <Table<ConsumableItemStat> columns={itemColumns} dataSource={itemRows}
              rowKey="itemId" loading={loading} scroll={{ x: 1085 }} pagination={pagination} size="middle" />,
          },
        ]}
      />
    </div>
  )
}
