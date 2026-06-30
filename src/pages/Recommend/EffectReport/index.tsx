import { useState } from 'react'
import { Button, Space, Table, Tag, Select, Form, DatePicker } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { DownloadOutlined, SearchOutlined, ReloadOutlined } from '@ant-design/icons'
import {
  AppType, AlgorithmType, RecommendChannel,
  APP_OPTIONS,
} from '../constants'

interface EffectRecord {
  id: number
  app: AppType
  date: string
  channel: RecommendChannel
  slot: string
  algorithm: AlgorithmType
  region: string
  exposure: number
  clicks: number
  ctr: string
  conversionRate: string
  avgOrderValue: number
  roi: string
}

const CHANNEL_LABEL: Record<RecommendChannel, string> = {
  [RecommendChannel.HOME]: '大首頁瀑布流',
  [RecommendChannel.DELIVERY]: '外賣頻道瀑布流',
  [RecommendChannel.GROUP_BUY]: '團購頻道瀑布流',
  [RecommendChannel.SUPERMARKET]: '超市頻道瀑布流',
}

const ALG_LABEL: Record<AlgorithmType, string> = {
  [AlgorithmType.INVINCIBLE_STAR]: '無敵星星',
  [AlgorithmType.NEW_STORE_AD]: '新店廣告',
  [AlgorithmType.HOT_REVIVE_AD]: '盤活復蘇',
  [AlgorithmType.EXCLUSIVE_MERCHANT]: '獨家商家',
  [AlgorithmType.TRAFFIC_AD]: '流量廣告',
  [AlgorithmType.GUESS_YOU_LIKE]: '猜你喜歡',
  [AlgorithmType.ORGANIC_TRAFFIC]: '自然流量',
  [AlgorithmType.SEARCH_ALGORITHM]: '搜索算法',
} as Record<AlgorithmType, string>

const REGION_OPTIONS = [
  { label: '澳門', value: 1 },
  { label: '氹仔', value: 2 },
  { label: '珠海', value: 3 },
]

// 扩展Mock数据到15条
const mockData: EffectRecord[] = [
  { id: 1, app: AppType.SHANFENG, date: '2024-06-01', channel: RecommendChannel.HOME, slot: '首頁第一坑', algorithm: AlgorithmType.INVINCIBLE_STAR, region: '澳門', exposure: 420000, clicks: 23940, ctr: '5.70%', conversionRate: '3.20%', avgOrderValue: 128, roi: '285%' },
  { id: 2, app: AppType.MFOOD, date: '2024-06-01', channel: RecommendChannel.DELIVERY, slot: '外賣第一坑', algorithm: AlgorithmType.GUESS_YOU_LIKE, region: '氹仔', exposure: 310000, clicks: 16430, ctr: '5.30%', conversionRate: '2.85%', avgOrderValue: 86, roi: '210%' },
  { id: 3, app: AppType.SHANFENG, date: '2024-06-02', channel: RecommendChannel.SUPERMARKET, slot: '超市第二坑', algorithm: AlgorithmType.TRAFFIC_AD, region: '珠海', exposure: 185000, clicks: 8140, ctr: '4.40%', conversionRate: '2.10%', avgOrderValue: 65, roi: '168%' },
  { id: 4, app: AppType.MFOOD, date: '2024-06-02', channel: RecommendChannel.HOME, slot: '首頁第二坑', algorithm: AlgorithmType.NEW_STORE_AD, region: '澳門', exposure: 380000, clicks: 19760, ctr: '5.20%', conversionRate: '2.90%', avgOrderValue: 95, roi: '235%' },
  { id: 5, app: AppType.SHANFENG, date: '2024-06-03', channel: RecommendChannel.GROUP_BUY, slot: '團購首選坑位', algorithm: AlgorithmType.HOT_REVIVE_AD, region: '氹仔', exposure: 250000, clicks: 12500, ctr: '5.00%', conversionRate: '2.60%', avgOrderValue: 78, roi: '195%' },
  { id: 6, app: AppType.MFOOD, date: '2024-06-03', channel: RecommendChannel.DELIVERY, slot: '外賣第二坑', algorithm: AlgorithmType.EXCLUSIVE_MERCHANT, region: '澳門', exposure: 290000, clicks: 14790, ctr: '5.10%', conversionRate: '2.75%', avgOrderValue: 110, roi: '245%' },
  { id: 7, app: AppType.SHANFENG, date: '2024-06-04', channel: RecommendChannel.HOME, slot: '首頁第三坑', algorithm: AlgorithmType.ORGANIC_TRAFFIC, region: '珠海', exposure: 150000, clicks: 6750, ctr: '4.50%', conversionRate: '1.90%', avgOrderValue: 58, roi: '142%' },
  { id: 8, app: AppType.MFOOD, date: '2024-06-04', channel: RecommendChannel.SUPERMARKET, slot: '超市第一坑', algorithm: AlgorithmType.SEARCH_ALGORITHM, region: '澳門', exposure: 200000, clicks: 9200, ctr: '4.60%', conversionRate: '2.20%', avgOrderValue: 72, roi: '178%' },
  { id: 9, app: AppType.SHANFENG, date: '2024-06-05', channel: RecommendChannel.GROUP_BUY, slot: '團購第二坑', algorithm: AlgorithmType.INVINCIBLE_STAR, region: '氹仔', exposure: 320000, clicks: 17280, ctr: '5.40%', conversionRate: '3.00%', avgOrderValue: 105, roi: '258%' },
  { id: 10, app: AppType.MFOOD, date: '2024-06-05', channel: RecommendChannel.HOME, slot: '首頁第四坑', algorithm: AlgorithmType.GUESS_YOU_LIKE, region: '珠海', exposure: 270000, clicks: 13500, ctr: '5.00%', conversionRate: '2.70%', avgOrderValue: 88, roi: '220%' },
  { id: 11, app: AppType.SHANFENG, date: '2024-06-06', channel: RecommendChannel.DELIVERY, slot: '外賣第三坑', algorithm: AlgorithmType.TRAFFIC_AD, region: '澳門', exposure: 240000, clicks: 11040, ctr: '4.60%', conversionRate: '2.40%', avgOrderValue: 82, roi: '188%' },
  { id: 12, app: AppType.MFOOD, date: '2024-06-06', channel: RecommendChannel.SUPERMARKET, slot: '超市第三坑', algorithm: AlgorithmType.NEW_STORE_AD, region: '氹仔', exposure: 195000, clicks: 9165, ctr: '4.70%', conversionRate: '2.30%', avgOrderValue: 68, roi: '172%' },
  { id: 13, app: AppType.SHANFENG, date: '2024-06-07', channel: RecommendChannel.HOME, slot: '首頁第五坑', algorithm: AlgorithmType.HOT_REVIVE_AD, region: '珠海', exposure: 210000, clicks: 10080, ctr: '4.80%', conversionRate: '2.50%', avgOrderValue: 75, roi: '185%' },
  { id: 14, app: AppType.MFOOD, date: '2024-06-07', channel: RecommendChannel.GROUP_BUY, slot: '團購第三坑', algorithm: AlgorithmType.EXCLUSIVE_MERCHANT, region: '澳門', exposure: 280000, clicks: 14280, ctr: '5.10%', conversionRate: '2.80%', avgOrderValue: 98, roi: '238%' },
  { id: 15, app: AppType.SHANFENG, date: '2024-06-08', channel: RecommendChannel.DELIVERY, slot: '外賣第四坑', algorithm: AlgorithmType.SEARCH_ALGORITHM, region: '氹仔', exposure: 225000, clicks: 10350, ctr: '4.60%', conversionRate: '2.35%', avgOrderValue: 80, roi: '192%' },
]

export default function EffectReport() {
  const [searchForm] = Form.useForm()
  const [filteredData, setFilteredData] = useState<EffectRecord[]>(mockData)

  // 搜索处理
  const handleSearch = (values: any) => {
    let result = [...mockData]
    
    // 所属品牌筛选
    if (values.app !== undefined && values.app !== null) {
      result = result.filter(item => item.app === values.app)
    }
    
    // 业务频道筛选
    if (values.channel !== undefined && values.channel !== null) {
      result = result.filter(item => item.channel === values.channel)
    }
    
    // 算法类型筛选
    if (values.algorithm !== undefined && values.algorithm !== null) {
      result = result.filter(item => item.algorithm === values.algorithm)
    }
    
    // 区域筛选
    if (values.region !== undefined && values.region !== null) {
      const regionMap: Record<number, string> = { 1: '澳門', 2: '氹仔', 3: '珠海' }
      result = result.filter(item => item.region === regionMap[values.region])
    }
    
    setFilteredData(result)
  }

  // 重置搜索
  const handleReset = () => {
    searchForm.resetFields()
    setFilteredData(mockData)
  }

  const columns: ColumnsType<EffectRecord> = [
    { 
      title: '所屬品牌', 
      dataIndex: 'app', 
      key: 'app', 
      width: 100,
      render: (v: AppType) => (
        <Tag style={{ 
          margin: 0,
          padding: '2px 10px',
          border: v === AppType.SHANFENG ? '1px solid #fadb14' : '1px solid #fa8c16',
          color: v === AppType.SHANFENG ? '#d4b106' : '#d46b08',
          background: v === AppType.SHANFENG ? '#fffbe6' : '#fff7e6',
          borderRadius: 4,
          fontWeight: 500
        }}>
          {v === AppType.SHANFENG ? '閃峰' : 'mFood'}
        </Tag>
      ),
    },
    { title: '日期', dataIndex: 'date', key: 'date', width: 110 },
    { 
      title: '頻道', 
      dataIndex: 'channel', 
      key: 'channel',
      width: 150,
      render: (v: RecommendChannel) => CHANNEL_LABEL[v],
    },
    { title: '坑位', dataIndex: 'slot', key: 'slot' },
    { title: '算法', dataIndex: 'algorithm', key: 'algorithm', render: (v: AlgorithmType) => ALG_LABEL[v] },
    { title: '區域', dataIndex: 'region', key: 'region' },
    { title: '曝光量', dataIndex: 'exposure', key: 'exposure', render: (v: number) => v.toLocaleString() },
    { title: '點擊量', dataIndex: 'clicks', key: 'clicks', render: (v: number) => v.toLocaleString() },
    { title: 'CTR', dataIndex: 'ctr', key: 'ctr' },
    { title: '轉化率', dataIndex: 'conversionRate', key: 'conversionRate' },
    { title: '客單價 (MOP)', dataIndex: 'avgOrderValue', key: 'avgOrderValue' },
    { title: 'ROI', dataIndex: 'roi', key: 'roi' },
  ]

  return (
    <div className="content-area">
      {/* 查询区域 */}
      <div className="search-section">
        <Form layout="inline" form={searchForm} onFinish={handleSearch}>
          <Form.Item label="所屬品牌" name="app">
            <Select placeholder="全部" options={APP_OPTIONS} allowClear />
          </Form.Item>
          <Form.Item label="業務頻道" name="channel">
            <Select 
              placeholder="全部" 
              options={[
                { label: '大首頁瀑布流', value: RecommendChannel.HOME },
                { label: '外賣頻道瀑布流', value: RecommendChannel.DELIVERY },
                { label: '團購頻道瀑布流', value: RecommendChannel.GROUP_BUY },
                { label: '超市頻道瀑布流', value: RecommendChannel.SUPERMARKET },
              ]}
              allowClear
            />
          </Form.Item>
          <Form.Item label="算法類型" name="algorithm">
            <Select 
              placeholder="全部" 
              options={[
                { label: '無敵星星', value: AlgorithmType.INVINCIBLE_STAR },
                { label: '新店廣告', value: AlgorithmType.NEW_STORE_AD },
                { label: '盤活復蘇', value: AlgorithmType.HOT_REVIVE_AD },
                { label: '獨家商家', value: AlgorithmType.EXCLUSIVE_MERCHANT },
                { label: '流量廣告', value: AlgorithmType.TRAFFIC_AD },
                { label: '猜你喜歡', value: AlgorithmType.GUESS_YOU_LIKE },
                { label: '自然流量', value: AlgorithmType.ORGANIC_TRAFFIC },
                { label: '搜索算法', value: AlgorithmType.SEARCH_ALGORITHM },
              ]}
              allowClear
            />
          </Form.Item>
          <Form.Item label="區域" name="region">
            <Select placeholder="全部" options={REGION_OPTIONS} allowClear />
          </Form.Item>
          <Form.Item label="日期範圍" name="dateRange">
            <DatePicker.RangePicker placeholder={['開始日期', '結束日期']} />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>查詢</Button>
              <Button onClick={handleReset} icon={<ReloadOutlined />}>重置</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 功能区域 */}
      <div className="action-section">
        <Space>
          <Button icon={<DownloadOutlined />}>導出</Button>
        </Space>
      </div>

      {/* 列表区域 */}
      <div className="table-section">
        <Table<EffectRecord>
          rowKey="id"
          columns={columns}
          dataSource={filteredData}
          scroll={{ x: 1200 }}
          pagination={{ 
            pageSize: 10, 
            showTotal: (t) => `共 ${t} 條`, 
            showSizeChanger: true, 
            pageSizeOptions: ['10', '20', '50'], 
            showQuickJumper: true 
          }}
        />
      </div>
    </div>
  )
}
