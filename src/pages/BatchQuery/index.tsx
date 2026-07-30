import { useState, useMemo, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Input, Select, Table, Tag, Form, DatePicker } from 'antd'
import type { TableColumnsType } from 'antd'
import type { Dayjs } from 'dayjs'
import {
  SearchOutlined,
  ReloadOutlined,
  ExportOutlined,
} from '@ant-design/icons'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import BrandTag from '../../components/BrandTag'
import { BRAND_OPTIONS_WITH_ALL as brandOptions } from '../../constants/brand'
import { getBatchRecords } from '../../utils/approvalStore'
import { fetchFinBatches, withFinanceFallback } from '../../api/finance'
import type { FinBatch, FinBatchQuery } from '../../api/finance'

const { RangePicker } = DatePicker

/** 批次类型选项（僅充值/轉賬/合併生成批次，扣款不生成批次） */
const batchTypeOptions = [
  { label: '全部', value: 'all' },
  { label: '充值', value: 'recharge' },
  { label: '轉賬', value: 'transfer' },
  { label: '合併', value: 'merge' },
]

/** 是否实收选项（值與後端存儲一致） */
const actualOptions = [
  { label: '全部', value: 'all' },
  { label: '是', value: '是' },
  { label: '否', value: '否' },
]

/** 批次记录类型 */
interface BatchRecord {
  key: string
  index: number
  groupId: string
  groupName: string
  brand: string
  batchType: string
  batchNo: string
  flowNo: string
  tradeTime: string
  isActual: string
  virtualAmount: number | null
  actualAmount: number | null
  discountAmount: number | null
  applicant: string
  bd: string
  remark: string
}

/** 品牌显示映射 */

/** 批次类型显示映射 */
const batchTypeMap: Record<string, string> = {
  recharge: '充值',
  transfer: '轉賬',
  merge: '合併',
}

/** 模拟数据（覆蓋充值/轉賬/合併三類，非充值類型實收與優惠為空） */
const flowPrefixMap: Record<string, string> = { recharge: 'CZ', transfer: 'ZZ', merge: 'HB' }

interface MockRowSeed {
  groupName: string
  batchType: string
  seq: number
  isActual: string
  virtualAmount: number
  actualAmount: number | null
  discountAmount: number | null
  bd: string
  remark: string
}

const mockSeeds: MockRowSeed[] = [
  { groupName: '廣州酒家', batchType: 'recharge', seq: 1, isActual: '是', virtualAmount: 28000, actualAmount: 20000, discountAmount: 8000, bd: '關山月(001)', remark: '新店首充，獎勵多' },
  { groupName: '海底撈', batchType: 'transfer', seq: 2, isActual: '--', virtualAmount: -24000, actualAmount: null, discountAmount: null, bd: '--', remark: '集團間餘額調撥（轉出）' },
  { groupName: '星巴克', batchType: 'recharge', seq: 3, isActual: '是', virtualAmount: 24000, actualAmount: 18000, discountAmount: 6000, bd: '關山月(001)', remark: '節日活動充值' },
  { groupName: '麥當勞', batchType: 'recharge', seq: 4, isActual: '否', virtualAmount: 22000, actualAmount: null, discountAmount: 6000, bd: '--', remark: '不綁定BD' },
  { groupName: '肯德基', batchType: 'merge', seq: 5, isActual: '--', virtualAmount: -20000, actualAmount: null, discountAmount: null, bd: '--', remark: '集團合併，資產轉移（註銷）' },
  { groupName: '必勝客', batchType: 'transfer', seq: 2, isActual: '--', virtualAmount: 24000, actualAmount: null, discountAmount: null, bd: '--', remark: '集團間餘額調撥（轉入）' },
  { groupName: '喜茶', batchType: 'recharge', seq: 6, isActual: '是', virtualAmount: 26000, actualAmount: 20000, discountAmount: 6000, bd: '關山月(001)', remark: '月度充值獎勵' },
  { groupName: '奈雪的茶', batchType: 'transfer', seq: 7, isActual: '--', virtualAmount: -30000, actualAmount: null, discountAmount: null, bd: '--', remark: '集團間餘額調撥（轉出）' },
  { groupName: '真功夫', batchType: 'merge', seq: 5, isActual: '--', virtualAmount: 20000, actualAmount: null, discountAmount: null, bd: '--', remark: '集團合併，資產轉移（存續）' },
  { groupName: '大吉鴨', batchType: 'recharge', seq: 8, isActual: '是', virtualAmount: 20000, actualAmount: 14000, discountAmount: 6000, bd: '關山月(001)', remark: '日常充值' },
  { groupName: '太二酸菜魚', batchType: 'transfer', seq: 7, isActual: '--', virtualAmount: 30000, actualAmount: null, discountAmount: null, bd: '--', remark: '集團間餘額調撥（轉入）' },
  { groupName: '瑞幸咖啡', batchType: 'recharge', seq: 10, isActual: '是', virtualAmount: 28000, actualAmount: 20000, discountAmount: 8000, bd: '關山月(001)', remark: '促銷充值活動' },
]

const mockData: BatchRecord[] = mockSeeds.map((s, i) => ({
  key: String(i + 1),
  index: i + 1,
  groupId: i % 2 === 0 ? '100001' : '100002',
  groupName: s.groupName,
  brand: i % 3 === 0 ? 'flashBee' : 'mFood',
  batchType: s.batchType,
  batchNo: `PC20260228${String(s.seq).padStart(4, '0')}`,
  flowNo: `${flowPrefixMap[s.batchType]}20260228${String(s.seq).padStart(4, '0')}`,
  tradeTime: '2026-02-28 18:20:21',
  isActual: s.isActual,
  virtualAmount: s.virtualAmount,
  actualAmount: s.actualAmount,
  discountAmount: s.discountAmount,
  applicant: '朱棣(002)',
  bd: s.bd,
  remark: s.remark,
}))

/** 格式化金额：正數帶+號、負數帶-號，空值顯示 -- */
const formatAmount = (val: number | null | undefined) => {
  if (val === null || val === undefined) return null
  return `${val >= 0 ? '+' : '-'}${Math.abs(val).toLocaleString()}`
}

/** 搜索區篩選條件 */
interface BatchFilters {
  groupId?: string
  groupName?: string
  brand?: string
  batchNo?: string
  flowNo?: string
  tradeTime?: [Dayjs, Dayjs]
  isActual?: string
  batchType?: string
  applicant?: string
}

/** 「全部」等價於不篩選 */
function pickValue(v?: string) {
  return !v || v === 'all' ? undefined : v
}

/** 後端不可用時的降級查詢：localStorage 批次記錄 + 演示數據本地篩選分頁 */
function mockFetchBatches(query: FinBatchQuery) {
  const stored: BatchRecord[] = getBatchRecords().map(r => ({
    key: r.key,
    index: 0,
    groupId: r.groupId,
    groupName: r.groupName,
    brand: r.brand,
    batchType: r.batchType,
    batchNo: r.batchNo,
    flowNo: r.flowNo,
    tradeTime: r.tradeTime,
    isActual: r.isActual,
    virtualAmount: r.virtualAmount,
    actualAmount: r.actualAmount,
    discountAmount: r.discountAmount,
    applicant: r.applicant,
    bd: r.bd,
    remark: r.remark,
  }))
  const filtered = [...stored, ...mockData].filter(r => {
    if (query.groupId && !r.groupId.includes(query.groupId)) return false
    if (query.groupName && !r.groupName.includes(query.groupName)) return false
    if (query.brand && r.brand !== query.brand) return false
    if (query.batchType && r.batchType !== query.batchType) return false
    if (query.batchNo && !r.batchNo.includes(query.batchNo)) return false
    if (query.flowNo && !r.flowNo.includes(query.flowNo)) return false
    if (query.isActual && r.isActual !== query.isActual) return false
    if (query.applicant && !r.applicant.includes(query.applicant)) return false
    if (query.tradeFrom && r.tradeTime.slice(0, 10) < query.tradeFrom) return false
    if (query.tradeTo && r.tradeTime.slice(0, 10) > query.tradeTo) return false
    return true
  })
  const page = query.page || 1
  const size = query.size || 10
  return { records: filtered.slice((page - 1) * size, page * size), total: filtered.length }
}

export default function BatchQuery() {
  const navigate = useNavigate()
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [searchForm] = Form.useForm<BatchFilters>()
  const [data, setData] = useState<BatchRecord[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState<BatchFilters>({})
  const [pagination, setPagination] = useState({ page: 1, size: 10 })

  /** 組裝查詢參數 */
  const buildQuery = useCallback((): FinBatchQuery => ({
    page: pagination.page,
    size: pagination.size,
    groupId: filters.groupId?.trim() || undefined,
    groupName: filters.groupName?.trim() || undefined,
    brand: pickValue(filters.brand),
    batchType: pickValue(filters.batchType),
    batchNo: filters.batchNo?.trim() || undefined,
    flowNo: filters.flowNo?.trim() || undefined,
    isActual: pickValue(filters.isActual),
    applicant: filters.applicant?.trim() || undefined,
    tradeFrom: filters.tradeTime?.[0]?.format('YYYY-MM-DD'),
    tradeTo: filters.tradeTime?.[1]?.format('YYYY-MM-DD'),
  }), [filters, pagination])

  /** 加載批次列表（後端不可用時降級到本地記錄） */
  const loadBatches = useCallback(async () => {
    const query = buildQuery()
    setLoading(true)
    try {
      const res = await withFinanceFallback<{ records: FinBatch[]; total: number }>(
        () => fetchFinBatches(query),
        () => mockFetchBatches(query),
      )
      const start = (query.page! - 1) * query.size!
      setData((res.records ?? []).map((r, i) => ({
        key: `${r.batchNo}-${r.groupId}`,
        index: start + i + 1,
        groupId: r.groupId,
        groupName: r.groupName,
        brand: r.brand,
        batchType: r.batchType,
        batchNo: r.batchNo,
        flowNo: r.flowNo,
        tradeTime: r.tradeTime,
        isActual: r.isActual,
        virtualAmount: r.virtualAmount,
        actualAmount: r.actualAmount,
        discountAmount: r.discountAmount,
        applicant: r.applicant,
        bd: r.bd,
        remark: r.remark,
      })))
      setTotal(res.total ?? 0)
    } finally {
      setLoading(false)
    }
  }, [buildQuery])

  useEffect(() => {
    void loadBatches()
  }, [loadBatches])

  const handleSearch = () => {
    setFilters(searchForm.getFieldsValue())
    setPagination(p => ({ ...p, page: 1 }))
  }

  const handleReset = () => {
    searchForm.resetFields()
    setFilters({})
    setPagination({ page: 1, size: 10 })
  }

  /** 列配置元数据 */
  const columnMeta = useMemo(() => [
    { key: 'index', title: '序號' },
    { key: 'groupId', title: '集團ID' },
    { key: 'groupName', title: '集團名稱' },
    { key: 'brand', title: '所屬品牌' },
    { key: 'batchType', title: '批次類型' },
    { key: 'batchNo', title: '批次號' },
    { key: 'flowNo', title: '流程編號' },
    { key: 'tradeTime', title: '交易時間' },
    { key: 'isActual', title: '實收標記' },
    { key: 'virtualAmount', title: '虛擬金額' },
    { key: 'actualAmount', title: '實收金額' },
    { key: 'discountAmount', title: '優惠金額' },
    { key: 'applicant', title: '申請人' },
    { key: 'bd', title: '所屬BD' },
    { key: 'remark', title: '備註' },
    { key: 'action', title: '操作' },
  ], [])

  const { configComponent, applyConfig } = useColumnConfig('batch-query', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const }
  ])

  

  const columns: TableColumnsType<BatchRecord> = [
    {
      title: '序號',
      dataIndex: 'index',
      key: 'index',
      width: 60,
      align: 'center',
    },
    {
      title: '集團ID',
      dataIndex: 'groupId',
      key: 'groupId',
      width: 100,
    },
    {
      title: '集團名稱',
      dataIndex: 'groupName',
      key: 'groupName',
      width: 120,
    },
    {
      title: '所屬品牌',
      dataIndex: 'brand',
      key: 'brand',
      width: 100,
      render: (val: string) => (
        <BrandTag value={val} />
      ),
    },
    {
      title: '批次類型',
      dataIndex: 'batchType',
      key: 'batchType',
      width: 90,
      render: (val: string) => {
        const text = batchTypeMap[val] || val
        const colorMap: Record<string, string> = { recharge: 'blue', transfer: 'green', merge: 'orange' }
        return <Tag color={colorMap[val] || 'default'}>{text}</Tag>
      },
    },
    {
      title: '批次編號',
      dataIndex: 'batchNo',
      key: 'batchNo',
      width: 140,
    },
    {
      title: '流程編號',
      dataIndex: 'flowNo',
      key: 'flowNo',
      width: 100,
    },
    {
      title: '交易時間',
      dataIndex: 'tradeTime',
      key: 'tradeTime',
      width: 180,
    },
    {
      title: '是否實收',
      dataIndex: 'isActual',
      key: 'isActual',
      width: 90,
      align: 'center',
      render: (val: string) => {
        if (val === '是') return <Tag color="green">是</Tag>
        if (val === '否') return <Tag color="red">否</Tag>
        return <span style={{ color: '#999' }}>--</span>
      },
    },
    {
      title: '虛擬賬戶變動金額',
      dataIndex: 'virtualAmount',
      key: 'virtualAmount',
      width: 160,
      align: 'right',
      render: (val: number | null) => {
        const text = formatAmount(val)
        if (text === null) return <span style={{ color: '#999' }}>--</span>
        return (
          <span style={{ color: (val as number) < 0 ? '#FF4D4F' : '#E8720C', fontWeight: 500 }}>{text}</span>
        )
      },
    },
    {
      title: '實收賬戶變動金額',
      dataIndex: 'actualAmount',
      key: 'actualAmount',
      width: 160,
      align: 'right',
      render: (val: number | null) => {
        const text = formatAmount(val)
        if (text === null) return <span style={{ color: '#999' }}>--</span>
        return (
          <span style={{ color: (val as number) < 0 ? '#FF4D4F' : '#1976D2', fontWeight: 500 }}>{text}</span>
        )
      },
    },
    {
      title: '優惠金額',
      dataIndex: 'discountAmount',
      key: 'discountAmount',
      width: 100,
      align: 'right',
      render: (val: number | null) =>
        val === null || val === undefined
          ? <span style={{ color: '#999' }}>--</span>
          : <span style={{ fontWeight: 500 }}>{val.toLocaleString()}</span>,
    },
    {
      title: '申請人',
      dataIndex: 'applicant',
      key: 'applicant',
      width: 120,
    },
    {
      title: '歸屬BD',
      dataIndex: 'bd',
      key: 'bd',
      width: 120,
      render: (val: string) =>
        val === '--' ? <span style={{ color: '#999' }}>--</span> : val,
    },
    {
      title: '備註信息',
      dataIndex: 'remark',
      key: 'remark',
      width: 180,
      render: (val: string) =>
        val === '--' ? <span style={{ color: '#999' }}>--</span> : val,
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      fixed: 'right',
      render: (_, record) => (
        <a onClick={() => navigate(`/batch-detail?key=${record.key}&type=${record.batchType}&batchNo=${record.batchNo}&groupId=${record.groupId}`)}>明細</a>
      ),
    },
  ]

  return (
    <div className="content-area">
      {/* 查询区域 */}
      <div className="search-section">
        <Form form={searchForm} layout="inline">
          <Form.Item label="集團ID" name="groupId">
            <Input placeholder="請輸入集團ID" allowClear />
          </Form.Item>
          <Form.Item label="集團名稱" name="groupName">
            <Input placeholder="請輸入集團名稱" allowClear />
          </Form.Item>
          <Form.Item label="所屬品牌" name="brand">
            <Select placeholder="請選擇" options={brandOptions} style={{ width: 140 }} />
          </Form.Item>
          <Form.Item label="批次編號" name="batchNo">
            <Input placeholder="請輸入批次編號" allowClear />
          </Form.Item>
          <Form.Item label="流程編號" name="flowNo">
            <Input placeholder="請輸入流程編號" allowClear />
          </Form.Item>
          <Form.Item label="交易時間" name="tradeTime">
            <RangePicker
              showTime
              format="YYYY-MM-DD HH:mm:ss"
              placeholder={['開始時間', '結束時間']}
            />
          </Form.Item>
          <Form.Item label="是否實收" name="isActual">
            <Select placeholder="請選擇" options={actualOptions} style={{ width: 120 }} />
          </Form.Item>
          <Form.Item label="批次類型" name="batchType">
            <Select placeholder="請選擇" options={batchTypeOptions} style={{ width: 120 }} />
          </Form.Item>
          <Form.Item label="申請人" name="applicant">
            <Input placeholder="請輸入申請人姓名/工號" allowClear />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>查詢</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>重置</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 功能区域 */}
      <div className="action-section">
        <div className="action-section-left">
          <Button className="btn-export" icon={<ExportOutlined />}>
            導出
          </Button>
        </div>
        <div className="action-section-right">
          {configComponent}
        </div>
      </div>

      {/* 列表区域 */}
      <div className="table-section">
        <Table<BatchRecord>
          rowSelection={{
            selectedRowKeys,
            onChange: setSelectedRowKeys,
          }}
          columns={applyConfig(columns)}
          dataSource={data}
          rowKey="key"
          loading={loading}
          pagination={{
            current: pagination.page,
            pageSize: pagination.size,
            total,
            showTotal: (t) => `共 ${t} 條`,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50', '100'],
            showQuickJumper: true,
            onChange: (page, size) => setPagination({ page, size: size || 10 }),
          }}
          size="middle"
          bordered={false}
          scroll={{ x: 2200 }}
        />
      </div>
    </div>
  )
}
