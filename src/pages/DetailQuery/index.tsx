import { useState, useMemo } from 'react'
import { Button, Input, Select, DatePicker, Table, Tag, Form } from 'antd'
import type { TableColumnsType } from 'antd'
import {
  SearchOutlined,
  ReloadOutlined,
  ExportOutlined,
} from '@ant-design/icons'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import BrandTag from '../../components/BrandTag'
import { BRAND_OPTIONS_WITH_ALL as brandOptions } from '../../constants/brand'
import { getDetailRecords } from '../../utils/approvalStore'

const { RangePicker } = DatePicker

/** 业务频道选项 */
const channelOptions = [
  { label: '全部', value: 'all' },
  { label: '外賣', value: 'takeout' },
  { label: '堂食', value: 'dineIn' },
]

/** 交易类型选项 */
const tradeTypeOptions = [
  { label: '全部', value: 'all' },
  { label: '充值', value: 'recharge' },
  { label: '扣款', value: 'deduct' },
  { label: '消費', value: 'consume' },
  { label: '轉入', value: 'transferIn' },
  { label: '轉出', value: 'transferOut' },
]

/**
 * 变动类别选项（分组）
 * - 交易類型=扣款：消費扣款展示所選消費類型枚舉；充值批次扣款/賬戶扣款展示對應方式名稱
 * - 交易類型=消費：展示商家消費的廣告類型（如無敵星星、盤活復蘇）
 */
const changeTypeOptions = [
  { label: '全部', value: 'all' },
  {
    label: '賬戶變動',
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
    label: '消費扣款（消費類型）',
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
    label: '消費（廣告類型）',
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

/** 交易类型 Tag 颜色 */
const tradeTypeColor: Record<string, string> = {
  充值: 'blue',
  扣款: 'red',
  消費: 'purple',
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

export default function DetailQuery() {
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])

  /** 真實明細記錄（審批全部通過後寫入）+ Mock 數據 */
  const allData = useMemo<DetailRow[]>(() => {
    const stored = getDetailRecords().map(r => ({
      key: r.key,
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
    const mocks = mockData.map((r, i) => ({ ...r, key: `mock_${i}` }))
    return [...stored, ...mocks].map((r, i) => ({ ...r, index: i + 1 }))
  }, [])

  /** 列配置元数据 */
  const columnMeta = useMemo(() => [
    { key: 'index', title: '序號' },
    { key: 'detailId', title: '明細ID' },
    { key: 'groupId', title: '集團ID' },
    { key: 'groupName', title: '集團名稱' },
    { key: 'brand', title: '所屬品牌' },
    { key: 'storeId', title: '門店ID' },
    { key: 'storeName', title: '門店名稱' },
    { key: 'channel', title: '業務頻道' },
    { key: 'tradeType', title: '交易類型' },
    { key: 'changeType', title: '變動類別' },
    { key: 'tradeTime', title: '交易時間' },
    { key: 'virtualChange', title: '虛擬變動' },
    { key: 'actualChange', title: '實收變動' },
    { key: 'batchNo', title: '關聯批次號' },
    { key: 'flowNo', title: '流程編號' },
    { key: 'bd', title: '歸屬BD' },
    { key: 'remark', title: '備註' },
  ], [])

  const { configComponent, applyConfig } = useColumnConfig('detail-query', columnMeta)

  const columns: TableColumnsType<DetailRow> = [
    {
      title: '序號',
      dataIndex: 'index',
      key: 'index',
      width: 60,
      align: 'center',
      fixed: 'left',
    },
    {
      title: '明細ID',
      dataIndex: 'detailId',
      key: 'detailId',
      width: 150,
      fixed: 'left',
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
      title: '門店ID',
      dataIndex: 'storeId',
      key: 'storeId',
      width: 110,
      render: (val: string) =>
        val === '--' ? <span style={{ color: '#999' }}>--</span> : val,
    },
    {
      title: '門店名稱',
      dataIndex: 'storeName',
      key: 'storeName',
      width: 160,
      render: (val: string) =>
        val === '--' ? <span style={{ color: '#999' }}>--</span> : val,
    },
    {
      title: '業務頻道',
      dataIndex: 'channel',
      key: 'channel',
      width: 90,
      align: 'center',
    },
    {
      title: '交易類型',
      dataIndex: 'tradeType',
      key: 'tradeType',
      width: 90,
      align: 'center',
      render: (val: string) => (
        <Tag color={tradeTypeColor[val] || 'default'}>{val}</Tag>
      ),
    },
    {
      title: '變動類別',
      dataIndex: 'changeType',
      key: 'changeType',
      width: 140,
      align: 'center',
    },
    {
      title: '交易時間',
      dataIndex: 'tradeTime',
      key: 'tradeTime',
      width: 180,
    },
    {
      title: '虛擬賬戶變動金額',
      dataIndex: 'virtualChange',
      key: 'virtualChange',
      width: 150,
      align: 'right',
      render: renderChange,
    },
    {
      title: '實收賬戶變動金額',
      dataIndex: 'actualChange',
      key: 'actualChange',
      width: 150,
      align: 'right',
      render: renderChange,
    },
    {
      title: '關聯批次號',
      dataIndex: 'batchNo',
      key: 'batchNo',
      width: 150,
      render: (val: string) =>
        val === '--' ? <span style={{ color: '#999' }}>--</span> : val,
    },
    {
      title: '流程編號',
      dataIndex: 'flowNo',
      key: 'flowNo',
      width: 150,
      render: (val: string) =>
        val === '--' ? <span style={{ color: '#999' }}>--</span> : val,
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
      width: 220,
      render: (val: string) =>
        val && val !== '--' ? val : <span style={{ color: '#999' }}>--</span>,
    },
  ]

  return (
    <div className="content-area">
      {/* 查询区域 */}
      <div className="search-section">
        <Form layout="inline">
          <Form.Item label="集團ID">
            <Input placeholder="請輸入集團ID" allowClear />
          </Form.Item>
          <Form.Item label="集團名稱">
            <Input placeholder="請輸入集團名稱" allowClear />
          </Form.Item>
          <Form.Item label="所屬品牌">
            <Select placeholder="全部" options={brandOptions} allowClear />
          </Form.Item>
          <Form.Item label="門店ID">
            <Input placeholder="請輸入門店ID" allowClear />
          </Form.Item>
          <Form.Item label="門店名稱">
            <Input placeholder="請輸入門店名稱" allowClear />
          </Form.Item>
          <Form.Item label="業務頻道">
            <Select placeholder="全部" options={channelOptions} allowClear />
          </Form.Item>
          <Form.Item label="交易類型">
            <Select placeholder="全部" options={tradeTypeOptions} allowClear />
          </Form.Item>
          <Form.Item label="變動類別">
            <Select placeholder="全部" options={changeTypeOptions} allowClear showSearch />
          </Form.Item>
          <Form.Item label="交易時間">
            <RangePicker
              showTime
              format="YYYY-MM-DD HH:mm:ss"
              placeholder={['開始時間', '結束時間']}
            />
          </Form.Item>
          <Form.Item label="批次號">
            <Input placeholder="請輸入關聯批次號" allowClear />
          </Form.Item>
          <Form.Item label="流程編號">
            <Input placeholder="請輸入流程編號" allowClear />
          </Form.Item>
          <Form.Item label="明細ID">
            <Input placeholder="請輸入明細ID" allowClear />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />}>查詢</Button>
              <Button icon={<ReloadOutlined />}>重置</Button>
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
        <Table<DetailRow>
          rowSelection={{
            selectedRowKeys,
            onChange: setSelectedRowKeys,
          }}
          columns={applyConfig(columns)}
          dataSource={allData}
          pagination={{
            total: allData.length,
            showTotal: (total) => `共 ${total} 條`,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50', '100'],
            defaultPageSize: 10,
            showQuickJumper: true,
          }}
          size="middle"
          bordered={false}
          scroll={{ x: 2300 }}
        />
      </div>
    </div>
  )
}
