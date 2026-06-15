import { useState , useMemo } from 'react'
import { Button, Space, Input, Select, DatePicker, Table, Tag, Form } from 'antd'
import type { TableColumnsType } from 'antd'
import {
  SearchOutlined,
  ReloadOutlined,
  ExportOutlined,
} from '@ant-design/icons'
import { useColumnConfig } from '../../hooks/useColumnConfig'

const { RangePicker } = DatePicker

/** 品牌选项 */
const brandOptions = [
  { label: '全部', value: 'all' },
  { label: '1mFood', value: '1mFood' },
  { label: '2閃蜂', value: 'flashBee' },
]

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
  { label: '轉賬', value: 'transfer' },
  { label: '扣款', value: 'deduct' },
  { label: '合併', value: 'merge' },
]

/** 明细记录类型 */
interface DetailRecord {
  key: string
  index: number
  groupId: string
  groupName: string
  storeId: string
  storeName: string
  brand: string
  channel: string
  detailId: string
  tradeType: string
  changeReason: string
  tradeTime: string
  virtualChange: number
  actualChange: number
  batchNo: string
  virtualBalance: number
  actualBalance: number
  bd: string
  remark: string
}

/** 品牌映射 */
const brandMap: Record<string, string> = {
  '1mFood': '1mFood',
  flashBee: '2閃蜂',
}

/** 交易类型映射 */
const tradeTypeMap: Record<string, string> = {
  recharge: '充值',
  transfer: '轉賬',
  deduct: '扣款',
  merge: '合併',
}

/** 交易类型颜色 */
const tradeTypeColor: Record<string, string> = {
  recharge: 'blue',
  transfer: 'green',
  deduct: 'orange',
  merge: 'purple',
}

/** 变动原因列表 */
const changeReasons = ['對公轉賬', '混合支付', '營業額支付', '賬戶扣款', '充值批次扣款', '消費扣款']

/** 模拟数据 */
const groupIds = ['10000', '10000', '10001', '10000', '10002', '10001', '10000', '10002', '10001', '10000', '10002', '10001', '10000']
const groupNames = ['廣州酒家', '廣州酒家', '廣州酒家', '廣州酒家', '廣州酒家', '廣州酒家', '廣州酒家', '廣州酒家', '廣州酒家', '廣州酒家', '廣州酒家', '廣州酒家', '廣州酒家']
const storeIds = ['S001', 'S002', 'S001', 'S003', 'S001', 'S002', 'S004', 'S001', 'S003', 'S002', 'S001', 'S004', 'S001']
const storeNames = ['廣州酒家', '廣州酒家', '廣州酒家', '廣州酒家', '廣州酒家', '廣州酒家', '廣州酒家', '廣州酒家', '廣州酒家', '廣州酒家', '廣州酒家', '廣州酒家', '廣州酒家']
const brands = ['1mFood', '1mFood', 'flashBee', '1mFood', '1mFood', 'flashBee', '1mFood', '1mFood', 'flashBee', '1mFood', '1mFood', 'flashBee', '1mFood']
const channels = ['外賣', '外賣', '堂食', '外賣', '外賣', '堂食', '外賣', '外賣', '堂食', '外賣', '外賣', '堂食', '外賣']
const tradeTypes = ['recharge', 'recharge', 'deduct', 'recharge', 'transfer', 'deduct', 'recharge', 'transfer', 'deduct', 'recharge', 'recharge', 'deduct', 'merge']
const virtualChanges = [1921, 1500, -19992, 2800, 5000, -3200, 1800, 6000, -1500, 3500, 2200, -800, 4500]
const actualChanges = [1000, 800, -992, 1500, 3000, -1600, 900, 3500, -800, 2000, 1200, -400, 2500]
const virtualBalances = [90000, 91500, 71508, 74308, 79308, 76108, 77908, 83908, 82408, 85908, 88108, 87308, 91808]
const actualBalances = [50000, 50800, 49808, 51308, 54308, 52708, 53608, 57108, 56308, 58308, 59508, 59108, 61608]
const bds = ['關山月(001)', '關山月(001)', '--', '關山月(001)', '關山月(001)', '--', '關山月(001)', '關山月(001)', '--', '關山月(001)', '關山月(001)', '--', '關山月(001)']
const remarkList = ['商家無敵星星購充值', '新店首充獎勵', '該批次贈送有誤，需扣除', '商家充值活動', '轉賬至分店', '營業額扣款', '日常充值', '跨店轉賬', '系統扣款調整', '月度充值', '促銷充值', '扣款處理', '合併結算']

const mockData: DetailRecord[] = Array.from({ length: 12 }, (_, i) => ({
  key: String(i + 1),
  index: i + 1,
  groupId: groupIds[i],
  groupName: groupNames[i],
  storeId: storeIds[i],
  storeName: storeNames[i],
  brand: brands[i],
  channel: channels[i],
  detailId: `D2026${String(i + 1).padStart(5, '0')}`,
  tradeType: tradeTypes[i],
  changeReason: changeReasons[i % 6],
  tradeTime: `2026-01-${String(16 + i).padStart(2, '0')} 09:${String(16 + i * 3).padStart(2, '0')}:21`,
  virtualChange: virtualChanges[i],
  actualChange: actualChanges[i],
  batchNo: `PC2026${String(i + 1).padStart(5, '0')}`,
  virtualBalance: virtualBalances[i],
  actualBalance: actualBalances[i],
  bd: bds[i],
  remark: remarkList[i],
}))

/** 格式化变动金额（带颜色标识） */
const AmountCell = ({ val, type }: { val: number; type: 'change' | 'balance' }) => {
  if (type === 'change') {
    const isPositive = val >= 0
    const prefix = isPositive ? '+' : ''
    const color = isPositive ? '#E53935' : '#2E7D32'
    return (
      <span style={{ color, fontWeight: 500 }}>
        {prefix}{val.toLocaleString()}
      </span>
    )
  }
  return (
    <span style={{ color: '#1976D2', fontWeight: 500 }}>
      {val.toLocaleString()}
    </span>
  )
}

export default function DetailQuery() {
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  /** 列配置元数据 */
  const columnMeta = useMemo(() => [
    { key: 'index', title: '序號' },
    { key: 'groupId', title: '集團ID' },
    { key: 'groupName', title: '集團名稱' },
    { key: 'storeId', title: '門店ID' },
    { key: 'storeName', title: '門店名稱' },
    { key: 'brand', title: '所屬品牌' },
    { key: 'channel', title: '業務頻道' },
    { key: 'detailId', title: '明細ID' },
    { key: 'tradeType', title: '交易類型' },
    { key: 'changeReason', title: '變動原因' },
    { key: 'tradeTime', title: '交易時間' },
    { key: 'virtualChange', title: '虛擬變動' },
    { key: 'actualChange', title: '實收變動' },
    { key: 'batchNo', title: '批次號' },
    { key: 'virtualBalance', title: '虛擬餘額' },
    { key: 'actualBalance', title: '實收餘額' },
    { key: 'bd', title: '所屬BD' },
    { key: 'remark', title: '備註' },
  ], [])

  const { configComponent, applyConfig } = useColumnConfig('detail-query', columnMeta)

  

  const columns: TableColumnsType<DetailRecord> = [
    {
      title: '序號',
      dataIndex: 'index',
      key: 'index',
      width: 60,
      align: 'center',
      fixed: 'left',
    },
    {
      title: '集團ID',
      dataIndex: 'groupId',
      key: 'groupId',
      width: 100,
      fixed: 'left',
    },
    {
      title: '集團名稱',
      dataIndex: 'groupName',
      key: 'groupName',
      width: 120,
    },
    {
      title: '門店ID',
      dataIndex: 'storeId',
      key: 'storeId',
      width: 90,
    },
    {
      title: '門店名稱',
      dataIndex: 'storeName',
      key: 'storeName',
      width: 120,
    },
    {
      title: '所屬品牌',
      dataIndex: 'brand',
      key: 'brand',
      width: 100,
      render: (val: string) => (
        <Tag style={{ 
          margin: 0,
          padding: '2px 10px',
          border: val === '閃蜂' || val === 'flashBee' ? '1px solid #fadb14' : '1px solid #fa8c16',
          color: val === '閃蜂' || val === 'flashBee' ? '#d4b106' : '#d46b08',
          background: val === '閃蜂' || val === 'flashBee' ? '#fffbe6' : '#fff7e6',
          borderRadius: 4,
          fontWeight: 500
        }}>
          {brandMap[val] || val}
        </Tag>
      ),
    },
    {
      title: '業務頻道',
      dataIndex: 'channel',
      key: 'channel',
      width: 90,
    },
    {
      title: '明細ID',
      dataIndex: 'detailId',
      key: 'detailId',
      width: 140,
    },
    {
      title: '交易類型',
      dataIndex: 'tradeType',
      key: 'tradeType',
      width: 90,
      render: (val: string) => (
        <Tag color={tradeTypeColor[val] || 'default'}>{tradeTypeMap[val] || val}</Tag>
      ),
    },
    {
      title: '變動原因',
      dataIndex: 'changeReason',
      key: 'changeReason',
      width: 130,
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
      width: 160,
      align: 'right',
      render: (val: number) => <AmountCell val={val} type="change" />,
    },
    {
      title: '實收賬戶變動金額',
      dataIndex: 'actualChange',
      key: 'actualChange',
      width: 160,
      align: 'right',
      render: (val: number) => <AmountCell val={val} type="change" />,
    },
    {
      title: '關聯批次號',
      dataIndex: 'batchNo',
      key: 'batchNo',
      width: 140,
    },
    {
      title: '虛擬賬戶餘額',
      dataIndex: 'virtualBalance',
      key: 'virtualBalance',
      width: 130,
      align: 'right',
      render: (val: number) => <AmountCell val={val} type="balance" />,
    },
    {
      title: '實收賬戶餘額',
      dataIndex: 'actualBalance',
      key: 'actualBalance',
      width: 130,
      align: 'right',
      render: (val: number) => <AmountCell val={val} type="balance" />,
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
      width: 200,
      render: (val: string) =>
        val ? val : <span style={{ color: '#999' }}>--</span>,
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
            <Select placeholder="請選擇" options={brandOptions} style={{ width: 140 }} />
          </Form.Item>
          <Form.Item label="門店ID">
            <Input placeholder="請輸入門店ID" allowClear />
          </Form.Item>
          <Form.Item label="門店名稱">
            <Input placeholder="請輸入門店名稱" allowClear />
          </Form.Item>
          <Form.Item label="業務頻道">
            <Select placeholder="請選擇" options={channelOptions} style={{ width: 120 }} />
          </Form.Item>
          <Form.Item label="交易時間">
            <RangePicker
              showTime
              format="YYYY-MM-DD HH:mm:ss"
              placeholder={['開始時間', '結束時間']}
            />
          </Form.Item>
          <Form.Item label="交易類型">
            <Select placeholder="請選擇" options={tradeTypeOptions} style={{ width: 120 }} />
          </Form.Item>
          <Form.Item label="批次號">
            <Input placeholder="請輸入批次號" allowClear />
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
        <Space>
          <Button icon={<ExportOutlined />} style={{ color: '#52C41A', borderColor: '#52C41A' }}>
            數據導出
          </Button>
        </Space>
              {configComponent}
      </div>

      {/* 列表区域 */}
      <div className="table-section">
        <Table<DetailRecord>
          rowSelection={{
            selectedRowKeys,
            onChange: setSelectedRowKeys,
          }}
          columns={applyConfig(columns)}
          dataSource={mockData}
          pagination={{
            total: mockData.length,
            pageSize: 10,
            showTotal: (total) => `共 ${total} 條`,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50', '100'],
            defaultPageSize: 10,
            showQuickJumper: true,
          }}
          size="middle"
          bordered={false}
          scroll={{ x: 2600 }}
        />
      </div>
    </div>
  )
}
