import { useState } from 'react'
import { Card, Row, Col, Statistic, Tag, Descriptions, Table, Input, Button, Space, Select, Form, Tabs, Timeline, Badge, Progress, Alert } from 'antd'
import { SearchOutlined, UserOutlined, ShoppingOutlined, EyeOutlined, TrophyOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'

// 设备类型
const DEVICE_LABEL: Record<number, string> = {
  1: 'iOS',
  2: '安卓',
  3: '鴻蒙',
}

// 区域
const REGION_LABEL: Record<number, string> = {
  1: '澳門',
  2: '氹仔',
  3: '珠海',
}

// APP类型
const APP_LABEL: Record<number, string> = {
  1: '閃峰',
  2: 'mFood',
}

// 用户分群
const USER_SEGMENT_LABEL: Record<string, string> = {
  new_user: '新用戶',
  active: '活躍用戶',
  dormant: '沉睡用戶',
  churn: '流失用戶',
}

const USER_SEGMENT_COLOR: Record<string, string> = {
  new_user: 'green',
  active: 'blue',
  dormant: 'orange',
  churn: 'red',
}

// 价格敏感度
const PRICE_SENSITIVITY_LABEL: Record<string, string> = {
  high: '高敏感',
  medium: '中敏感',
  low: '低敏感',
}

// Mock数据 - 用户列表
const mockUserList = [
  {
    userId: 'U10001',
    phone: '6612****',
    device: 1,
    region: 1,
    app: 1,
    registerDate: '2024-01-15',
    segment: 'active',
    orderCount: 45,
    avgOrderAmount: 85.5,
    lastActive: '2024-01-24 12:30',
  },
  {
    userId: 'U10002',
    phone: '6623****',
    device: 2,
    region: 2,
    app: 2,
    registerDate: '2023-11-20',
    segment: 'dormant',
    orderCount: 12,
    avgOrderAmount: 65.0,
    lastActive: '2024-01-10 08:15',
  },
  {
    userId: 'U10003',
    phone: '6634****',
    device: 1,
    region: 1,
    app: 1,
    registerDate: '2024-01-20',
    segment: 'new_user',
    orderCount: 3,
    avgOrderAmount: 95.0,
    lastActive: '2024-01-24 18:45',
  },
]

// Mock数据 - 用户画像详情
const mockUserProfile = {
  userId: 'U10001',
  phone: '6612****',
  device: 1,
  region: 1,
  app: 1,
  registerDate: '2024-01-15',
  segment: 'active',
  // 行为画像
  behaviorProfile: {
    browseHistory: [
      { time: '2024-01-24 12:25', name: '澳門茶餐廳', type: '商家' },
      { time: '2024-01-24 12:20', name: '奶茶套餐', type: '商品' },
      { time: '2024-01-24 11:50', name: '葡式蛋撻店', type: '商家' },
      { time: '2024-01-24 10:30', name: '咖啡廳', type: '商家' },
    ],
    searchHistory: ['奶茶', '咖啡', '下午茶', '甜品'],
    orderStats: {
      totalOrders: 45,
      avgOrderAmount: 85.5,
      favoriteCategory: '美食外賣',
      orderFrequency: '每週3-4次',
    },
    activeTimeSlots: {
      breakfast: 15,
      lunch: 45,
      afternoon: 25,
      dinner: 10,
      nightSnack: 5,
    },
  },
  // 偏好画像
  preferenceProfile: {
    categories: ['美食外賣', '下午茶', '咖啡廳'],
    priceSensitivity: 'medium',
    favoriteMerchants: ['澳門茶餐廳', '葡式蛋撻店', '星冰樂咖啡'],
    distancePreference: '3km以內',
    avgDeliveryTime: '25分鐘',
  },
  // 推荐策略标签
  recommendationProfile: {
    abTestGroup: '實驗組B',
    recallStrategies: ['用戶購買偏好召回', '熱門商家召回', '用戶地理位置召回'],
    ctrPrediction: 0.085,
    cvrPrediction: 0.125,
    rankingWeight: 1.35,
    lastRecommendation: {
      time: '2024-01-24 12:30',
      clicked: 3,
      converted: 1,
    },
  },
}

export default function UserProfile() {
  const [searchForm] = Form.useForm()
  const [activeTab, setActiveTab] = useState('list')
  const [selectedUser, setSelectedUser] = useState<any>(null)

  // 搜索用户
  const handleSearch = (values: any) => {
    console.log('搜索用户:', values)
    setSelectedUser(mockUserProfile)
    setActiveTab('detail')
  }

  // 查看用户详情
  const handleViewDetail = (record: any) => {
    setSelectedUser(mockUserProfile)
    setActiveTab('detail')
  }

  // 用户列表列定义
  const userColumns: ColumnsType<any> = [
    {
      title: '用戶ID',
      dataIndex: 'userId',
      key: 'userId',
      width: 120,
      render: (text) => <strong>{text}</strong>,
    },
    {
      title: '手機號',
      dataIndex: 'phone',
      key: 'phone',
      width: 120,
    },
    {
      title: '設備',
      dataIndex: 'device',
      key: 'device',
      width: 80,
      render: (v: number) => <Tag>{DEVICE_LABEL[v]}</Tag>,
    },
    {
      title: '所屬區域',
      dataIndex: 'region',
      key: 'region',
      width: 100,
      render: (v: number) => REGION_LABEL[v],
    },
    {
      title: 'APP',
      dataIndex: 'app',
      key: 'app',
      width: 100,
      render: (v: number) => (
        <Tag color={v === 1 ? 'gold' : 'orange'}>{APP_LABEL[v]}</Tag>
      ),
    },
    {
      title: '用戶分群',
      dataIndex: 'segment',
      key: 'segment',
      width: 110,
      render: (v: string) => (
        <Tag color={USER_SEGMENT_COLOR[v]}>{USER_SEGMENT_LABEL[v]}</Tag>
      ),
    },
    {
      title: '訂單數',
      dataIndex: 'orderCount',
      key: 'orderCount',
      width: 90,
      render: (v: number) => `${v}單`,
    },
    {
      title: '客單價',
      dataIndex: 'avgOrderAmount',
      key: 'avgOrderAmount',
      width: 100,
      render: (v: number) => `MOP ${v}`,
    },
    {
      title: '最後活躍',
      dataIndex: 'lastActive',
      key: 'lastActive',
      width: 150,
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_, record) => (
        <Button 
          type="link" 
          size="small" 
          icon={<EyeOutlined />}
          onClick={() => handleViewDetail(record)}
        >
          查看詳情
        </Button>
      ),
    },
  ]

  return (
    <div className="content-area">
      <Tabs activeKey={activeTab} onChange={setActiveTab}>
        {/* Tab 1: 用户列表 */}
        <Tabs.TabPane 
          tab={<span><UserOutlined />用戶列表</span>} 
          key="list"
        >
          {/* 查询区域 */}
          <div className="search-section">
            <Form layout="inline" form={searchForm} onFinish={handleSearch}>
              <Form.Item label="用戶ID" name="userId">
                <Input placeholder="請輸入用戶ID" allowClear style={{ width: 150 }} />
              </Form.Item>
              <Form.Item label="手機號" name="phone">
                <Input placeholder="請輸入手機號" allowClear style={{ width: 150 }} />
              </Form.Item>
              <Form.Item label="用戶分群" name="segment">
                <Select 
                  placeholder="全部" 
                  options={[
                    { label: '新用戶', value: 'new_user' },
                    { label: '活躍用戶', value: 'active' },
                    { label: '沉睡用戶', value: 'dormant' },
                    { label: '流失用戶', value: 'churn' },
                  ]} 
                  allowClear 
                  style={{ width: 130 }}
                />
              </Form.Item>
              <Form.Item label="APP" name="app">
                <Select 
                  placeholder="全部" 
                  options={[
                    { label: '閃峰', value: 1 },
                    { label: 'mFood', value: 2 },
                  ]} 
                  allowClear 
                  style={{ width: 120 }}
                />
              </Form.Item>
              <Form.Item>
                <div className="search-actions">
                  <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>查詢</Button>
                  <Button onClick={() => searchForm.resetFields()}>重置</Button>
                </div>
              </Form.Item>
            </Form>
          </div>

          {/* 统计卡片 */}
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={6}>
              <Card>
                <Statistic 
                  title="總用戶數" 
                  value={12580} 
                  prefix={<UserOutlined />}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card>
                <Statistic 
                  title="活躍用戶" 
                  value={8520} 
                  valueStyle={{ color: '#1890ff' }}
                  suffix="/ 12580"
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card>
                <Statistic 
                  title="沉睡用戶" 
                  value={2850} 
                  valueStyle={{ color: '#faad14' }}
                  suffix="/ 12580"
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card>
                <Statistic 
                  title="流失用戶" 
                  value={1210} 
                  valueStyle={{ color: '#ff4d4f' }}
                  suffix="/ 12580"
                />
              </Card>
            </Col>
          </Row>

          {/* 用户列表 */}
          <Table
            rowKey="userId"
            columns={userColumns}
            dataSource={mockUserList}
            pagination={{
              pageSize: 10,
              showTotal: (total) => `共 ${total} 條`,
              showSizeChanger: true,
              pageSizeOptions: ['10', '20', '50'],
              showQuickJumper: true,
            }}
          />
        </Tabs.TabPane>

        {/* Tab 2: 用户画像详情 */}
        <Tabs.TabPane 
          tab={<span><TrophyOutlined />用戶畫像詳情</span>} 
          key="detail"
        >
          {!selectedUser ? (
            <Alert
              message="提示"
              description="請在用戶列表中选择用戶,或搜索特定用戶ID查看畫像詳情"
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />
          ) : (
            <>
              {/* 基础信息 */}
              <Card title="基礎信息" style={{ marginBottom: 16 }}>
                <Descriptions bordered column={3}>
                  <Descriptions.Item label="用戶ID">
                    <strong>{selectedUser.userId}</strong>
                  </Descriptions.Item>
                  <Descriptions.Item label="手機號">{selectedUser.phone}</Descriptions.Item>
                  <Descriptions.Item label="設備">
                    <Tag>{DEVICE_LABEL[selectedUser.device]}</Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="所屬區域">{REGION_LABEL[selectedUser.region]}</Descriptions.Item>
                  <Descriptions.Item label="APP">
                    <Tag color={selectedUser.app === 1 ? 'gold' : 'orange'}>
                      {APP_LABEL[selectedUser.app]}
                    </Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="註冊日期">{selectedUser.registerDate}</Descriptions.Item>
                  <Descriptions.Item label="用戶分群">
                    <Tag color={USER_SEGMENT_COLOR[selectedUser.segment]}>
                      {USER_SEGMENT_LABEL[selectedUser.segment]}
                    </Tag>
                  </Descriptions.Item>
                </Descriptions>
              </Card>

              {/* 核心指标 */}
              <Row gutter={16} style={{ marginBottom: 16 }}>
                <Col span={6}>
                  <Card>
                    <Statistic 
                      title="總訂單數" 
                      value={selectedUser.behaviorProfile.orderStats.totalOrders}
                      prefix={<ShoppingOutlined />}
                    />
                  </Card>
                </Col>
                <Col span={6}>
                  <Card>
                    <Statistic 
                      title="平均客單價" 
                      value={selectedUser.behaviorProfile.orderStats.avgOrderAmount}
                      prefix="MOP"
                      precision={2}
                    />
                  </Card>
                </Col>
                <Col span={6}>
                  <Card>
                    <Statistic 
                      title="CTR預估" 
                      value={selectedUser.recommendationProfile.ctrPrediction * 100}
                      suffix="%"
                      valueStyle={{ color: '#52c41a' }}
                    />
                  </Card>
                </Col>
                <Col span={6}>
                  <Card>
                    <Statistic 
                      title="CVR預估" 
                      value={selectedUser.recommendationProfile.cvrPrediction * 100}
                      suffix="%"
                      valueStyle={{ color: '#1890ff' }}
                    />
                  </Card>
                </Col>
              </Row>

              {/* 行为画像 + 偏好画像 */}
              <Row gutter={16} style={{ marginBottom: 16 }}>
                <Col span={12}>
                  <Card title={<span><EyeOutlined />行為畫像</span>}>
                    <Descriptions column={1} size="small">
                      <Descriptions.Item label="偏好品類">
                        {selectedUser.behaviorProfile.orderStats.favoriteCategory}
                      </Descriptions.Item>
                      <Descriptions.Item label="訂單頻次">
                        {selectedUser.behaviorProfile.orderStats.orderFrequency}
                      </Descriptions.Item>
                      <Descriptions.Item label="高頻搜索詞">
                        <Space wrap>
                          {selectedUser.behaviorProfile.searchHistory.map((word, idx) => (
                            <Tag key={idx} color="blue">{word}</Tag>
                          ))}
                        </Space>
                      </Descriptions.Item>
                      <Descriptions.Item label="活躍時段分佈">
                        <Row gutter={[8, 8]}>
                          <Col span={12}>
                            <div style={{ fontSize: 12 }}>
                              <div>早餐: <Progress percent={selectedUser.behaviorProfile.activeTimeSlots.breakfast} size="small" /></div>
                              <div>午餐: <Progress percent={selectedUser.behaviorProfile.activeTimeSlots.lunch} size="small" strokeColor="#52c41a" /></div>
                              <div>下午茶: <Progress percent={selectedUser.behaviorProfile.activeTimeSlots.afternoon} size="small" strokeColor="#faad14" /></div>
                            </div>
                          </Col>
                          <Col span={12}>
                            <div style={{ fontSize: 12 }}>
                              <div>晚餐: <Progress percent={selectedUser.behaviorProfile.activeTimeSlots.dinner} size="small" strokeColor="#ff4d4f" /></div>
                              <div>夜宵: <Progress percent={selectedUser.behaviorProfile.activeTimeSlots.nightSnack} size="small" strokeColor="#722ed1" /></div>
                            </div>
                          </Col>
                        </Row>
                      </Descriptions.Item>
                    </Descriptions>

                    <div style={{ marginTop: 16 }}>
                      <strong>最近瀏覽:</strong>
                      <Timeline style={{ marginTop: 12 }}>
                        {selectedUser.behaviorProfile.browseHistory.map((item, idx) => (
                          <Timeline.Item key={idx} color="blue">
                            <div style={{ fontSize: 12 }}>
                              <div>{item.name} ({item.type})</div>
                              <div style={{ color: '#999' }}>{item.time}</div>
                            </div>
                          </Timeline.Item>
                        ))}
                      </Timeline>
                    </div>
                  </Card>
                </Col>

                <Col span={12}>
                  <Card title={<span><TrophyOutlined />偏好畫像</span>}>
                    <Descriptions column={1} size="small">
                      <Descriptions.Item label="品類偏好">
                        <Space wrap>
                          {selectedUser.preferenceProfile.categories.map((cat, idx) => (
                            <Tag key={idx} color="green">{cat}</Tag>
                          ))}
                        </Space>
                      </Descriptions.Item>
                      <Descriptions.Item label="價格敏感度">
                        <Tag>
                          {PRICE_SENSITIVITY_LABEL[selectedUser.preferenceProfile.priceSensitivity]}
                        </Tag>
                      </Descriptions.Item>
                      <Descriptions.Item label="偏好商家">
                        <Space wrap>
                          {selectedUser.preferenceProfile.favoriteMerchants.map((m, idx) => (
                            <Tag key={idx}>{m}</Tag>
                          ))}
                        </Space>
                      </Descriptions.Item>
                      <Descriptions.Item label="距離偏好">
                        {selectedUser.preferenceProfile.distancePreference}
                      </Descriptions.Item>
                      <Descriptions.Item label="平均配送時間">
                        {selectedUser.preferenceProfile.avgDeliveryTime}
                      </Descriptions.Item>
                    </Descriptions>

                    <div style={{ marginTop: 16 }}>
                      <strong>推薦策略標籤:</strong>
                      <Descriptions column={1} size="small" style={{ marginTop: 8 }}>
                        <Descriptions.Item label="A/B測試分組">
                          <Tag color="purple">{selectedUser.recommendationProfile.abTestGroup}</Tag>
                        </Descriptions.Item>
                        <Descriptions.Item label="召回策略命中">
                          <Space wrap>
                            {selectedUser.recommendationProfile.recallStrategies.map((s, idx) => (
                              <Tag key={idx} color="cyan">{s}</Tag>
                            ))}
                          </Space>
                        </Descriptions.Item>
                        <Descriptions.Item label="排序權重">
                          <Badge 
                            count={`×${selectedUser.recommendationProfile.rankingWeight}`} 
                            style={{ backgroundColor: '#52c41a' }} 
                          />
                        </Descriptions.Item>
                        <Descriptions.Item label="最近推薦效果">
                          <div style={{ fontSize: 12 }}>
                            <div>點擊: {selectedUser.recommendationProfile.lastRecommendation.clicked}次</div>
                            <div>轉化: {selectedUser.recommendationProfile.lastRecommendation.converted}單</div>
                            <div style={{ color: '#999' }}>{selectedUser.recommendationProfile.lastRecommendation.time}</div>
                          </div>
                        </Descriptions.Item>
                      </Descriptions>
                    </div>
                  </Card>
                </Col>
              </Row>
            </>
          )}
        </Tabs.TabPane>
      </Tabs>
    </div>
  )
}
