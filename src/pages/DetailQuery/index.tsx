import { useState, useMemo, useEffect, useCallback } from 'react'
import { Button, Input, Select, DatePicker, Table, Tag, Form } from 'antd'
import type { TableColumnsType } from 'antd'
import type { Dayjs } from 'dayjs'
import { useTranslation } from 'react-i18next'
import {
  SearchOutlined,
  ReloadOutlined,
  ExportOutlined,
} from '@ant-design/icons'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import { useAuth } from '../../contexts/AuthContext'
import BrandTag from '../../components/BrandTag'
import { BRAND_OPTIONS_WITH_ALL as brandOptions } from '../../constants/brand'
import { BIZ_CHANNEL_LABEL_MAP } from '../../constants/bizChannel'
import { getDetailRecords } from '../../utils/approvalStore'
import { fetchFinDetails } from '../../api/finance'
import type { FinDetailQuery } from '../../api/finance'

const { RangePicker } = DatePicker

/** 筛选选项在组件内按语言构造；选项 value/label 为业务数据（数据库中文），保持不翻译 */

/** 交易类型 Tag 颜色 */
const tradeTypeColor: Record<string, string> = {
  充值: 'blue',
  扣款: 'red',
  消費: 'purple',
  退款: 'cyan',
  轉入: 'green',
  轉出: 'orange',
}

/** 明细记录展示行 */
interface DetailRow {
  key: string
  index: number
  detailId: string
  groupId: string
  groupName: string
  brand: string
  storeId: string
  storeName: string
  channel: string
  tradeType: string
  changeType: string
  tradeTime: string
  virtualChange: number
  actualChange: number | null
  batchNo: string
  flowNo: string
  bd: string
  remark: string
}

/**
 * 模拟数据（與批次查詢 Mock 批次對齊）
 * - 商戶消費按最早批次 FIFO 依次扣款：大額消費跨多個批次時拆分為多條明細
 * - 交易類型=扣款：僅消費扣款有門店信息，變動類別展示消費類型枚舉；批次/賬戶扣款無門店
 * - 交易類型=消費：商家自助消費廣告（無審批流程，流程編號 --），變動類別展示廣告類型
 * - 實收變動：消費/扣款/轉出/轉入均按所扣批次「實收充值 ÷ 虛擬充值」等比例同步變動實收賬戶，
 *   純贈送批次（無實收）顯示 --；如 PC202601160001 比例 0.5、PC202602280001 比例 5/7
 */
const mockData: Omit<DetailRow, 'key' | 'index'>[] = [
  { detailId: 'MX202602280001', groupId: '100001', groupName: '廣州酒家', brand: 'mFood', storeId: '--', storeName: '--', channel: '外賣', tradeType: '充值', changeType: '充值', tradeTime: '2026-02-28 18:20:21', virtualChange: 28000, actualChange: 20000, batchNo: 'PC202602280001', flowNo: 'CZ202602280001', bd: '關山月(001)', remark: '新店首充，獎勵多' },
  { detailId: 'MX202602280002', groupId: '100001', groupName: '廣州酒家', brand: 'mFood', storeId: '123456789', storeName: '廣州酒家食品有限公司', channel: '外賣', tradeType: '扣款', changeType: '充值批次扣款', tradeTime: '2026-02-28 18:20:21', virtualChange: -200, actualChange: -200, batchNo: 'PC202602280001', flowNo: 'CZ202602280001', bd: '關山月(001)', remark: '營業額支付扣款' },
  { detailId: 'MX202602280003', groupId: '100002', groupName: '海底撈', brand: 'mFood', storeId: '--', storeName: '--', channel: '外賣', tradeType: '轉出', changeType: '轉賬轉出', tradeTime: '2026-02-28 17:36:08', virtualChange: -24000, actualChange: -12000, batchNo: 'PC202602280002', flowNo: 'ZZ202602280002', bd: '--', remark: '集團間餘額調撥' },
  { detailId: 'MX202602280004', groupId: '100002', groupName: '必勝客', brand: 'mFood', storeId: '--', storeName: '--', channel: '外賣', tradeType: '轉入', changeType: '轉賬轉入', tradeTime: '2026-02-28 17:36:08', virtualChange: 24000, actualChange: 12000, batchNo: 'PC202602280002', flowNo: 'ZZ202602280002', bd: '--', remark: '集團間餘額調撥' },
  { detailId: 'MX202602280005', groupId: '100001', groupName: '肯德基', brand: 'flashBee', storeId: '223456781', storeName: '肯德基澳門店', channel: '外賣', tradeType: '扣款', changeType: '欠款償還', tradeTime: '2026-02-28 16:52:40', virtualChange: -600, actualChange: -300, batchNo: 'PC202602280005', flowNo: 'HB202602280005', bd: '關山月(001)', remark: '集團合併欠款償還' },
  { detailId: 'MX202602280006', groupId: '100001', groupName: '肯德基', brand: 'flashBee', storeId: '--', storeName: '--', channel: '外賣', tradeType: '轉出', changeType: '合併轉出', tradeTime: '2026-02-28 16:52:40', virtualChange: -20000, actualChange: -10000, batchNo: 'PC202602280005', flowNo: 'HB202602280005', bd: '--', remark: '集團合併，資產轉移（註銷）' },
  { detailId: 'MX202602280007', groupId: '100002', groupName: '真功夫', brand: 'flashBee', storeId: '--', storeName: '--', channel: '外賣', tradeType: '轉入', changeType: '合併轉入', tradeTime: '2026-02-28 16:52:40', virtualChange: 20000, actualChange: 10000, batchNo: 'PC202602280005', flowNo: 'HB202602280005', bd: '--', remark: '集團合併，資產轉移（存續）' },
  { detailId: 'MX202602280008', groupId: '100001', groupName: '廣州酒家', brand: 'mFood', storeId: '123456781', storeName: '廣州酒家番禺店', channel: '外賣', tradeType: '消費', changeType: '無敵星星', tradeTime: '2026-02-28 15:10:33', virtualChange: -18000, actualChange: -9000, batchNo: 'PC202601160001', flowNo: '--', bd: '關山月(001)', remark: '無敵星星廣告投放（跨批次扣款 1/2）' },
  { detailId: 'MX202602280009', groupId: '100001', groupName: '廣州酒家', brand: 'mFood', storeId: '123456781', storeName: '廣州酒家番禺店', channel: '外賣', tradeType: '消費', changeType: '無敵星星', tradeTime: '2026-02-28 15:10:33', virtualChange: -8000, actualChange: -5714.29, batchNo: 'PC202602280001', flowNo: '--', bd: '關山月(001)', remark: '無敵星星廣告投放（跨批次扣款 2/2）' },
  { detailId: 'MX202602280010', groupId: '100001', groupName: '星巴克', brand: 'flashBee', storeId: '--', storeName: '--', channel: '外賣', tradeType: '扣款', changeType: '賬戶扣款', tradeTime: '2026-02-28 14:28:52', virtualChange: -16000, actualChange: -8000, batchNo: 'PC202602280003', flowNo: 'KK202602280002', bd: '--', remark: '賬戶餘額扣除' },
  { detailId: 'MX202602280011', groupId: '100001', groupName: '廣州酒家', brand: 'mFood', storeId: '123456782', storeName: '廣州酒家天河店', channel: '外賣', tradeType: '扣款', changeType: '基礎套餐', tradeTime: '2026-02-28 13:40:15', virtualChange: -3000, actualChange: -1500, batchNo: 'PC202601160001', flowNo: 'KK202602280001', bd: '關山月(001)', remark: '基礎套餐服務費扣款' },
  { detailId: 'MX202602280012', groupId: '100002', groupName: '麥當勞', brand: 'mFood', storeId: '323456782', storeName: '麥當勞氹仔店', channel: '外賣', tradeType: '消費', changeType: '盤活復蘇', tradeTime: '2026-02-28 12:20:36', virtualChange: -1500, actualChange: null, batchNo: 'PC202602280004', flowNo: '--', bd: '--', remark: '盤活復蘇廣告消費（純贈送批次，無實收變動）' },
  { detailId: 'MX202602280013', groupId: '100002', groupName: '麥當勞', brand: 'mFood', storeId: '--', storeName: '--', channel: '外賣', tradeType: '充值', changeType: '充值', tradeTime: '2026-02-28 11:45:17', virtualChange: 22000, actualChange: null, batchNo: 'PC202602280004', flowNo: 'CZ202602280004', bd: '--', remark: '不綁定BD' },
  { detailId: 'MX202602280014', groupId: '100001', groupName: '喜茶', brand: 'flashBee', storeId: '--', storeName: '--', channel: '堂食', tradeType: '充值', changeType: '充值', tradeTime: '2026-02-28 10:32:06', virtualChange: 26000, actualChange: 20000, batchNo: 'PC202602280006', flowNo: 'CZ202602280006', bd: '關山月(001)', remark: '月度充值獎勵' },
  { detailId: 'MX202602280015', groupId: '100002', groupName: '大吉鴨', brand: 'mFood', storeId: '--', storeName: '--', channel: '外賣', tradeType: '充值', changeType: '充值', tradeTime: '2026-02-28 09:58:44', virtualChange: 20000, actualChange: 14000, batchNo: 'PC202602280008', flowNo: 'CZ202602280008', bd: '關山月(001)', remark: '日常充值' },
  { detailId: 'MX202602280016', groupId: '100002', groupName: '瑞幸咖啡', brand: 'mFood', storeId: '--', storeName: '--', channel: '外賣', tradeType: '充值', changeType: '充值', tradeTime: '2026-02-28 09:16:21', virtualChange: 28000, actualChange: 20000, batchNo: 'PC202602280010', flowNo: 'CZ202602280010', bd: '關山月(001)', remark: '促銷充值活動' },
]

/** 變動金額渲染（+藍 / -紅，空值 --，與批次明細流水一致） */
const renderChange = (val: number | null) => {
  if (val === null || val === undefined) return <span style={{ color: '#999' }}>--</span>
  const positive = val >= 0
  return (
    <span style={{ color: positive ? '#1976D2' : '#FF4D4F', fontWeight: 600 }}>
      {positive ? '+' : '-'}{Math.abs(val).toLocaleString()}
    </span>
  )
}

/** 搜索區篩選條件 */
interface DetailFilters {
  groupId?: string
  groupName?: string
  brand?: string
  storeId?: string
  storeName?: string
  channel?: string
  tradeType?: string
  changeType?: string
  tradeTime?: [Dayjs, Dayjs]
  batchNo?: string
  flowNo?: string
  detailId?: string
}

/** 「全部」等價於不篩選 */
function pickValue(v?: string) {
  return !v || v === 'all' ? undefined : v
}

/** 後端不可用時的降級查詢：localStorage 明細記錄 + 演示數據本地篩選分頁 */
function _mockFetchDetails(query: FinDetailQuery) {
  const stored = getDetailRecords().map(r => ({
    detailId: r.detailId,
    groupId: r.groupId,
    groupName: r.groupName,
    brand: r.brand,
    storeId: r.storeId,
    storeName: r.storeName,
    channel: r.channel,
    tradeType: r.tradeType,
    changeType: r.changeType,
    tradeTime: r.tradeTime,
    virtualChange: r.virtualChange,
    actualChange: r.actualChange,
    batchNo: r.batchNo,
    flowNo: r.flowNo,
    bd: r.bd,
    remark: r.remark,
  }))
  const filtered = [...stored, ...mockData].filter(r => {
    if (query.groupId && !r.groupId.includes(query.groupId)) return false
    if (query.groupName && !r.groupName.includes(query.groupName)) return false
    if (query.brand && r.brand !== query.brand) return false
    if (query.storeId && !r.storeId.includes(query.storeId)) return false
    if (query.storeName && !r.storeName.includes(query.storeName)) return false
    if (query.channel && r.channel !== query.channel) return false
    if (query.tradeType && r.tradeType !== query.tradeType) return false
    if (query.changeType && r.changeType !== query.changeType) return false
    if (query.batchNo && !r.batchNo.includes(query.batchNo)) return false
    if (query.flowNo && !r.flowNo.includes(query.flowNo)) return false
    if (query.detailId && !r.detailId.includes(query.detailId)) return false
    if (query.tradeFrom && r.tradeTime.slice(0, 10) < query.tradeFrom) return false
    if (query.tradeTo && r.tradeTime.slice(0, 10) > query.tradeTo) return false
    return true
  })
  const page = query.page || 1
  const size = query.size || 10
  return { records: filtered.slice((page - 1) * size, page * size), total: filtered.length }
}

export default function DetailQuery() {
  // 菜单权限：detail-query
  const { t } = useTranslation()
  const { hasPermission } = useAuth()

  /** 業務頻道選項（值＝明細存儲的頻道文本） */
  const channelOptions = [
    { label: t('common.all'), value: 'all' },
    ...Object.values(BIZ_CHANNEL_LABEL_MAP).map(label => ({ label, value: label })),
  ]

  /** 交易類型選項（值＝明細存儲/展示的交易類型文本；退款由後端將正數消費明細映射展示） */
  const tradeTypeOptions = [
    { label: t('common.all'), value: 'all' },
    { label: '充值', value: '充值' },
    { label: '扣款', value: '扣款' },
    { label: '消費', value: '消費' },
    { label: '退款', value: '退款' },
    { label: '轉入', value: '轉入' },
    { label: '轉出', value: '轉出' },
  ]

  /** 變動類別選項（分組，選項值為業務數據） */
  const changeTypeOptions = [
    { label: t('common.all'), value: 'all' },
    {
      label: t('detailQuery.changeGroupAccount'),
      options: [
        { label: '充值', value: '充值' },
        { label: '充值批次扣款', value: '充值批次扣款' },
        { label: '賬戶扣款', value: '賬戶扣款' },
        { label: '欠款償還', value: '欠款償還' },
        { label: '轉賬轉出', value: '轉賬轉出' },
        { label: '轉賬轉入', value: '轉賬轉入' },
        { label: '合併轉出', value: '合併轉出' },
        { label: '合併轉入', value: '合併轉入' },
      ],
    },
    {
      label: t('detailQuery.changeGroupConsumeType'),
      options: [
        { label: 'POS機維修', value: 'POS機維修' },
        { label: '巴士廣告', value: '巴士廣告' },
        { label: '百貨精選', value: '百貨精選' },
        { label: '復蘇盤活', value: '復蘇盤活' },
        { label: '基礎套餐', value: '基礎套餐' },
        { label: '機器檢測', value: '機器檢測' },
        { label: '機器維修', value: '機器維修' },
        { label: '金牌套餐', value: '金牌套餐' },
        { label: '精選套餐', value: '精選套餐' },
        { label: '免費入駐', value: '免費入駐' },
        { label: '企業套餐', value: '企業套餐' },
        { label: '升級套餐', value: '升級套餐' },
        { label: '團購套餐', value: '團購套餐' },
        { label: '小紅書廣告', value: '小紅書廣告' },
        { label: '專業套餐', value: '專業套餐' },
      ],
    },
    {
      label: t('detailQuery.changeGroupAdType'),
      options: [
        { label: '無敵星星', value: '無敵星星' },
        { label: '盤活復蘇', value: '盤活復蘇' },
        { label: '點金廣告', value: '點金廣告' },
        { label: '人氣商家', value: '人氣商家' },
        { label: '金字招牌', value: '金字招牌' },
        { label: '商品促銷', value: '商品促銷' },
      ],
    },
  ]
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [searchForm] = Form.useForm<DetailFilters>()
  const [data, setData] = useState<DetailRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState<DetailFilters>({})
  const [pagination, setPagination] = useState({ page: 1, size: 10 })

  /** 組裝查詢參數 */
  const buildQuery = useCallback((): FinDetailQuery => ({
    page: pagination.page,
    size: pagination.size,
    groupId: filters.groupId?.trim() || undefined,
    groupName: filters.groupName?.trim() || undefined,
    brand: pickValue(filters.brand),
    storeId: filters.storeId?.trim() || undefined,
    storeName: filters.storeName?.trim() || undefined,
    channel: pickValue(filters.channel),
    tradeType: pickValue(filters.tradeType),
    changeType: pickValue(filters.changeType),
    batchNo: filters.batchNo?.trim() || undefined,
    flowNo: filters.flowNo?.trim() || undefined,
    detailId: filters.detailId?.trim() || undefined,
    tradeFrom: filters.tradeTime?.[0]?.format('YYYY-MM-DD'),
    tradeTo: filters.tradeTime?.[1]?.format('YYYY-MM-DD'),
  }), [filters, pagination])

  /** 加載明細列表（後端不可用時降級到本地記錄） */
  const loadDetails = useCallback(async () => {
    const query = buildQuery()
    setLoading(true)
    try {
      const res = await fetchFinDetails(query)
      const start = (query.page! - 1) * query.size!
      setData((res.records ?? []).map((r, i) => ({
        key: r.detailId,
        index: start + i + 1,
        detailId: r.detailId,
        groupId: r.groupId,
        groupName: r.groupName,
        brand: r.brand,
        storeId: r.storeId,
        storeName: r.storeName,
        channel: r.channel,
        tradeType: r.tradeType,
        changeType: r.changeType,
        tradeTime: r.tradeTime,
        virtualChange: Number(r.virtualChange) || 0,
        actualChange: r.actualChange === null || r.actualChange === undefined ? null : Number(r.actualChange),
        batchNo: r.batchNo,
        flowNo: r.flowNo,
        bd: r.bd,
        remark: r.remark,
      })))
      setTotal(res.total ?? 0)
    } finally {
      setLoading(false)
    }
  }, [buildQuery])

  useEffect(() => {
    void loadDetails()
  }, [loadDetails])

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
    { key: 'index', title: t('common.colIndex') },
    { key: 'detailId', title: t('common.colDetailId') },
    { key: 'groupId', title: t('common.colGroupId') },
    { key: 'groupName', title: t('common.colGroupName') },
    { key: 'brand', title: t('common.colBrand') },
    { key: 'storeId', title: t('common.colStoreId') },
    { key: 'storeName', title: t('common.colStoreName') },
    { key: 'channel', title: t('common.colChannel') },
    { key: 'tradeType', title: t('common.colTradeType') },
    { key: 'changeType', title: t('common.colChangeType') },
    { key: 'tradeTime', title: t('common.colTradeTime') },
    { key: 'virtualChange', title: t('detailQuery.colVirtualChangeShort') },
    { key: 'actualChange', title: t('detailQuery.colActualChangeShort') },
    { key: 'batchNo', title: t('common.colBatchNo') },
    { key: 'flowNo', title: t('common.colFlowNo') },
    { key: 'bd', title: t('common.colBd') },
    { key: 'remark', title: t('detailQuery.colRemarkShort') },
  ], [t])

  const { configComponent, applyConfig } = useColumnConfig('detail-query', columnMeta)

  const columns: TableColumnsType<DetailRow> = [
    {
      title: t('common.colIndex'),
      dataIndex: 'index',
      key: 'index',
      width: 60,
      align: 'center',
      fixed: 'left',
    },
    {
      title: t('common.colDetailId'),
      dataIndex: 'detailId',
      key: 'detailId',
      width: 150,
      fixed: 'left',
    },
    {
      title: t('common.colGroupId'),
      dataIndex: 'groupId',
      key: 'groupId',
      width: 100,
    },
    {
      title: t('common.colGroupName'),
      dataIndex: 'groupName',
      key: 'groupName',
      width: 160,
    },
    {
      title: t('common.colBrand'),
      dataIndex: 'brand',
      key: 'brand',
      width: 100,
      render: (val: string) => (
        <BrandTag value={val} />
      ),
    },
    {
      title: t('common.colStoreId'),
      dataIndex: 'storeId',
      key: 'storeId',
      width: 110,
      render: (val: string) =>
        val === '--' ? <span style={{ color: '#999' }}>--</span> : val,
    },
    {
      title: t('common.colStoreName'),
      dataIndex: 'storeName',
      key: 'storeName',
      width: 160,
      render: (val: string) =>
        val === '--' ? <span style={{ color: '#999' }}>--</span> : val,
    },
    {
      title: t('common.colChannel'),
      dataIndex: 'channel',
      key: 'channel',
      width: 90,
    },
    {
      title: t('common.colTradeType'),
      dataIndex: 'tradeType',
      key: 'tradeType',
      width: 90,
      render: (val: string) => (
        <Tag color={tradeTypeColor[val] || 'default'}>{val}</Tag>
      ),
    },
    {
      title: t('common.colChangeType'),
      dataIndex: 'changeType',
      key: 'changeType',
      width: 140,
    },
    {
      title: t('common.colTradeTime'),
      dataIndex: 'tradeTime',
      key: 'tradeTime',
      width: 180,
    },
    {
      title: t('common.colVirtualChange'),
      dataIndex: 'virtualChange',
      key: 'virtualChange',
      width: 150,
      align: 'right',
      render: renderChange,
    },
    {
      title: t('common.colActualChange'),
      dataIndex: 'actualChange',
      key: 'actualChange',
      width: 150,
      align: 'right',
      render: renderChange,
    },
    {
      title: t('common.colBatchNo'),
      dataIndex: 'batchNo',
      key: 'batchNo',
      width: 150,
      render: (val: string) =>
        val === '--' ? <span style={{ color: '#999' }}>--</span> : val,
    },
    {
      title: t('common.colFlowNo'),
      dataIndex: 'flowNo',
      key: 'flowNo',
      width: 150,
      render: (val: string) =>
        val === 'DIRECT-EXEC' ? <Tag color="default">未經審批</Tag>
        : val === '--' ? <span style={{ color: '#999' }}>--</span> : val,
    },
    {
      title: t('common.colBd'),
      dataIndex: 'bd',
      key: 'bd',
      width: 120,
      render: (val: string) =>
        val === '--' ? <span style={{ color: '#999' }}>--</span> : val,
    },
    {
      title: t('common.colRemark'),
      dataIndex: 'remark',
      key: 'remark',
      width: 220,
      render: (val: string) =>
        val && val !== '--' ? val : <span style={{ color: '#999' }}>--</span>,
    },
  ]

  return (
    <div className="content-area">
      {/* 查询区域 */}
      <div className="search-section">
        <Form form={searchForm} layout="inline">
          <Form.Item label={t('common.colGroupId')} name="groupId">
            <Input placeholder={t('detailQuery.groupIdPlaceholder')} allowClear />
          </Form.Item>
          <Form.Item label={t('common.colGroupName')} name="groupName">
            <Input placeholder={t('detailQuery.groupNamePlaceholder')} allowClear />
          </Form.Item>
          <Form.Item label={t('common.colBrand')} name="brand">
            <Select placeholder={t('common.all')} options={brandOptions} allowClear />
          </Form.Item>
          <Form.Item label={t('common.colStoreId')} name="storeId">
            <Input placeholder={t('detailQuery.storeIdPlaceholder')} allowClear />
          </Form.Item>
          <Form.Item label={t('common.colStoreName')} name="storeName">
            <Input placeholder={t('detailQuery.storeNamePlaceholder')} allowClear />
          </Form.Item>
          <Form.Item label={t('common.colChannel')} name="channel">
            <Select placeholder={t('common.all')} options={channelOptions} allowClear />
          </Form.Item>
          <Form.Item label={t('common.colTradeType')} name="tradeType">
            <Select placeholder={t('common.all')} options={tradeTypeOptions} allowClear />
          </Form.Item>
          <Form.Item label={t('common.colChangeType')} name="changeType">
            <Select placeholder={t('common.all')} options={changeTypeOptions} allowClear showSearch />
          </Form.Item>
          <Form.Item label={t('common.colTradeTime')} name="tradeTime">
            <RangePicker
              showTime
              format="YYYY-MM-DD HH:mm:ss"
              placeholder={[t('detailQuery.startTime'), t('detailQuery.endTime')]}
            />
          </Form.Item>
          <Form.Item label={t('detailQuery.batchNoLabel')} name="batchNo">
            <Input placeholder={t('detailQuery.batchNoPlaceholder')} allowClear />
          </Form.Item>
          <Form.Item label={t('common.colFlowNo')} name="flowNo">
            <Input placeholder={t('detailQuery.flowNoPlaceholder')} allowClear />
          </Form.Item>
          <Form.Item label={t('common.colDetailId')} name="detailId">
            <Input placeholder={t('detailQuery.detailIdPlaceholder')} allowClear />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>{t('common.search')}</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>{t('common.reset')}</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 功能区域 */}
      <div className="action-section">
        <div className="action-section-left">
          {hasPermission('detail-query:export') && (
            <Button className="btn-export" icon={<ExportOutlined />}>
              {t('common.export')}
            </Button>
          )}
        </div>
        <div className="action-section-right">
          {configComponent}
        </div>
      </div>

      {/* 列表区域 */}
      <div className="table-section">
        <Table<DetailRow>
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
            showTotal: (total) => t('common.total', { count: total }),
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50', '100'],
            showQuickJumper: true,
            onChange: (page, size) => setPagination({ page, size: size || 10 }),
          }}
          size="middle"
          bordered={false}
          scroll={{ x: 2300 }}
        />
      </div>
    </div>
  )
}
