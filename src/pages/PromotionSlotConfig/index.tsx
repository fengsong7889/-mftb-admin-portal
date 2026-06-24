import { useState, useEffect } from 'react'
import { Button, Space, Table, Tag, Select, Form, Card, Badge } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { SearchOutlined, ReloadOutlined, MobileOutlined } from '@ant-design/icons'

/** 瀑布流配置记录 */
interface WaterfallSlotConfig {
  id: number
  slotIndex: number
  channel: string
  app: string
  position: number
  algorithmId: number
  algorithmName: string
  algorithmType: string
  weight: number
  status: 'active' | 'inactive'
  updatedBy: string
  updatedAt: string
}

/** 渠道完整名称 */
const CHANNEL_FULL_LABEL: Record<string, string> = {
  home: '大首頁瀑布流',
  delivery: '外賣頻道瀑布流',
  groupBuy: '團購頻道瀑布流',
  supermarket: '超市頻道瀑布流',
}

/** 渠道标签 */
const CHANNEL_LABEL: Record<string, string> = {
  home: '大首頁',
  delivery: '外賣',
  groupBuy: '團購',
  supermarket: '超市',
}

/** 品牌标签 */
const APP_LABEL: Record<string, string> = {
  shanfeng: '閃峰',
  mfood: 'mFood',
}

/** 算法类型标签 */
const ALGORITHM_TYPE_LABEL: Record<string, string> = {
  invincibleStar: '無敵星星',
  newShopAd: '新店廣告',
  activateAd: '盤活廣告',
  exclusiveShop: '獨家商家',
  youLike: '猜你喜歡',
}

/** 算法类型颜色 */
const ALGORITHM_TYPE_COLOR: Record<string, string> = {
  invincibleStar: 'magenta',
  newShopAd: 'blue',
  activateAd: 'green',
  exclusiveShop: 'orange',
  youLike: 'purple',
}

/** 状态标签 */
const STATUS_LABEL: Record<string, string> = {
  active: '啟用',
  inactive: '停用',
}

/** 伪随机数生成器 */
const pseudoRandom = (seed: number) => {
  const x = Math.sin(seed) * 10000
  return x - Math.floor(x)
}

/** Mock数据 - 15条 */
const mockData: WaterfallSlotConfig[] = (() => {
  const channels = ['home', 'home', 'home', 'home', 'home', 'home', 'home', 'home']
  const apps = ['shanfeng', 'shanfeng', 'shanfeng', 'shanfeng', 'shanfeng', 'shanfeng', 'shanfeng', 'shanfeng']
  const algorithmTypes = ['invincibleStar', 'youLike', 'newShopAd', 'activateAd', 'exclusiveShop']
  const algorithmNames: Record<string, string[]> = {
    invincibleStar: ['無敵星星-首頁版', '無敵星星-外賣版', '無敵星星-團購版'],
    youLike: ['猜你喜歡-主力版', '猜你喜歡-週末版', '猜你喜歡-夜間版'],
    newShopAd: ['新店廣告-首頁版', '新店廣告-早餐版', '新店廣告-午市版'],
    activateAd: ['盤活廣告-首頁版', '盤活廣告-午市版', '盤活廣告-晚市版'],
    exclusiveShop: ['獨家商家-首頁版', '獨家商家-超市版', '獨家商家-晚市版'],
  }
  const users = ['admin', 'operator', 'user001', 'user002']
  
  const data: WaterfallSlotConfig[] = []
  
  for (let i = 0; i < 15; i++) {
    const seed = i * 100
    const channel = channels[i % channels.length]
    const app = apps[i % apps.length]
    const algorithmType = algorithmTypes[Math.floor(pseudoRandom(seed + 1) * algorithmTypes.length)]
    const names = algorithmNames[algorithmType]
    const algorithmName = names[Math.floor(pseudoRandom(seed + 2) * names.length)]
    
    data.push({
      id: i + 1,
      slotIndex: i + 1,
      channel,
      app,
      position: i + 1,
      algorithmId: Math.floor(pseudoRandom(seed + 3) * 10) + 1,
      algorithmName,
      algorithmType,
      weight: Math.floor(pseudoRandom(seed + 4) * 50) + 40,
      status: pseudoRandom(seed + 5) > 0.2 ? 'active' : 'inactive',
      updatedBy: users[Math.floor(pseudoRandom(seed + 6) * users.length)],
      updatedAt: `2024-01-${String(20 + Math.floor(i / 2)).padStart(2, '0')} ${String(8 + Math.floor(pseudoRandom(seed + 7) * 12)).padStart(2, '0')}:${String(Math.floor(pseudoRandom(seed + 8) * 60)).padStart(2, '0')}:00`,
    })
  }
  
  return data
})()

export default function PromotionSlotConfig() {
  const [searchForm] = Form.useForm()
  const [filteredData, setFilteredData] = useState<WaterfallSlotConfig[]>([])
  const [searched, setSearched] = useState(false)

  // 初始化时默认查询大首页-闪蜂数据
  useEffect(() => {
    const defaultData = mockData.filter(
      item => item.channel === 'home' && item.app === 'shanfeng'
    )
    setFilteredData(defaultData)
    setSearched(true)
  }, [])

  // 获取当前查询条件
  const currentChannel = searchForm.getFieldValue('channel') || 'home'
  const currentApp = searchForm.getFieldValue('app') || 'shanfeng'
  
  // 手机模型标题
  const phoneTitle = `${CHANNEL_FULL_LABEL[currentChannel]}-${APP_LABEL[currentApp]}`

  // 新增
  const handleAdd = () => {
    console.log('新增瀑布流规划')
  }

  // 编辑
  const handleEdit = (record: WaterfallSlotConfig) => {
    console.log('编辑:', record)
  }

  // 启用/停用
  const handleToggleStatus = (record: WaterfallSlotConfig) => {
    console.log('切换状态:', record)
  }

  // 上移
  const handleMoveUp = (record: WaterfallSlotConfig) => {
    console.log('上移:', record)
  }

  // 下移
  const handleMoveDown = (record: WaterfallSlotConfig) => {
    console.log('下移:', record)
  }

  // 删除
  const handleDelete = (record: WaterfallSlotConfig) => {
    console.log('删除:', record)
  }
  const handleSearch = () => {
    const values = searchForm.getFieldsValue()
    let result = [...mockData]
    
    if (values.channel) {
      result = result.filter(item => item.channel === values.channel)
    }
    
    if (values.app) {
      result = result.filter(item => item.app === values.app)
    }
    
    setFilteredData(result)
    setSearched(true)
  }

  // 重置搜索
  const handleReset = () => {
    searchForm.resetFields()
    // 重置为默认值
    searchForm.setFieldsValue({
      channel: 'home',
      app: 'shanfeng',
    })
    setFilteredData([])
    setSearched(false)
  }

  const columns: ColumnsType<WaterfallSlotConfig> = [
    {
      title: '展示位序號',
      dataIndex: 'slotIndex',
      key: 'slotIndex',
      width: 100,
      align: 'center',
      render: (v: number) => (
        <Tag color="blue">#{v}</Tag>
      ),
    },
    {
      title: '業務頻道',
      dataIndex: 'channel',
      key: 'channel',
      width: 120,
      render: (v: string) => CHANNEL_LABEL[v],
    },
    {
      title: '所屬品牌',
      dataIndex: 'app',
      key: 'app',
      width: 100,
      render: (v: string) => (
        <Tag color={v === 'shanfeng' ? 'gold' : 'orange'}>
          {APP_LABEL[v]}
        </Tag>
      ),
    },
    {
      title: '展示位置',
      dataIndex: 'position',
      key: 'position',
      width: 100,
      align: 'center',
      render: (v: number) => (
        <Tag color="green">{v}號位</Tag>
      ),
    },
    {
      title: '展示位類型',
      dataIndex: 'algorithmType',
      key: 'algorithmType',
      width: 120,
      render: (v: string) => (
        <Tag color={ALGORITHM_TYPE_COLOR[v]}>
          {ALGORITHM_TYPE_LABEL[v]}
        </Tag>
      ),
    },
    {
      title: '狀態',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      align: 'center',
      render: (v: string) => (
        <Tag color={v === 'active' ? 'green' : 'default'}>
          {STATUS_LABEL[v]}
        </Tag>
      ),
    },
    {
      title: '最後更新人',
      dataIndex: 'updatedBy',
      key: 'updatedBy',
      width: 100,
    },
    {
      title: '最後更新時間',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 160,
    },
    {
      title: '操作',
      key: 'action',
      width: 280,
      fixed: 'right' as const,
      render: (_, record) => (
        <Space size={0} split={<span style={{ color: '#d9d9d9' }}>|</span>}>
          <Button 
            type="link" 
            size="small"
            onClick={() => handleToggleStatus(record)}
          >
            {record.status === 'active' ? '停用' : '啟用'}
          </Button>
          <Button 
            type="link" 
            size="small"
            onClick={() => handleEdit(record)}
          >
            編輯
          </Button>
          <Button 
            type="link" 
            size="small"
            onClick={() => handleMoveUp(record)}
          >
            上移
          </Button>
          <Button 
            type="link" 
            size="small"
            onClick={() => handleMoveDown(record)}
          >
            下移
          </Button>
          <Button 
            type="link" 
            size="small"
            danger
            onClick={() => handleDelete(record)}
          >
            刪除
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <div className="content-area">
      {/* 查询区域 */}
      <div className="search-section">
        <Form layout="inline" form={searchForm} onFinish={handleSearch}>
          <Form.Item label="業務頻道" name="channel" initialValue="home">
            <Select 
              style={{ width: 160 }}
              options={[
                { label: '大首頁', value: 'home' },
                { label: '外賣', value: 'delivery' },
                { label: '團購', value: 'groupBuy' },
                { label: '超市', value: 'supermarket' },
              ]}
            />
          </Form.Item>
          <Form.Item label="所屬品牌" name="app" initialValue="shanfeng">
            <Select 
              style={{ width: 120 }}
              options={[
                { label: '閃峰', value: 'shanfeng' },
                { label: 'mFood', value: 'mfood' },
              ]}
            />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>查詢</Button>
              <Button onClick={handleReset} icon={<ReloadOutlined />}>重置</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 结果区域 */}
      {searched && filteredData.length > 0 && (
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          {/* 左侧：手机模型 */}
          <div style={{
            width: 375, height: 720, flexShrink: 0,
            background: 'linear-gradient(180deg, #f5f5f5 0%, #e8e8e8 100%)',
            borderRadius: 40, padding: '60px 20px 30px',
            boxShadow: '0 12px 32px rgba(0, 0, 0, 0.25), inset 0 0 0 2px rgba(255,255,255,0.1)',
            border: '10px solid #1a1a1a', position: 'relative',
          }}>
            {/* 顶部状态栏 */}
            <div style={{
              position: 'absolute', top: 16, left: 0, right: 0,
              padding: '0 24px', display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', fontSize: 12, color: '#333', fontWeight: 600,
            }}>
              <span>9:41</span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 11 }}>📶</span>
                <span style={{ fontSize: 11 }}>🔋</span>
              </div>
            </div>

            {/* 屏幕内容区 */}
            <div style={{
              background: '#fff', borderRadius: 24, padding: '16px',
              height: 'calc(100% - 20px)', overflow: 'hidden',
              boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.08)',
              display: 'flex',
              flexDirection: 'column',
            }}>
              {/* 标题栏 - 固定 */}
              <div style={{
                textAlign: 'center', padding: '12px 0', marginBottom: 16,
                borderBottom: '1px solid #f0f0f0',
                flexShrink: 0,
              }}>
                <div style={{ fontSize: 16, fontWeight: 600, color: '#333' }}>
                  {phoneTitle}
                </div>
              </div>

              {/* 瀑布流内容 - 可滚动 */}
              <div style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                gap: 12,
                overflow: 'auto',
                flex: 1,
              }}>
                {filteredData.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      background: '#FAFAFA',
                      borderRadius: 12,
                      padding: 16,
                      border: '1px solid #F0F0F0',
                    }}
                  >
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}>
                      <Badge
                        count={`${item.position}號位`}
                        style={{ backgroundColor: '#1890ff' }}
                      />
                      <Tag color={ALGORITHM_TYPE_COLOR[item.algorithmType]}>
                        {ALGORITHM_TYPE_LABEL[item.algorithmType]}
                      </Tag>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 右侧：列表视图 */}
          <div style={{ flex: 1, minWidth: 360 }}>
            <Card
              title={
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Space>
                    <MobileOutlined style={{ color: '#1890ff' }} />
                    <span style={{ fontSize: 15, fontWeight: 600 }}>瀑布流規劃詳情</span>
                  </Space>
                  <Tag color="blue">共 {filteredData.length} 個配置</Tag>
                </div>
              }
              extra={
                <Button type="primary" onClick={handleAdd}>
                  新增
                </Button>
              }
              style={{ borderRadius: 8 }}
            >
              <Table<WaterfallSlotConfig>
                columns={columns}
                dataSource={filteredData}
                pagination={{
                  pageSize: 10,
                  showSizeChanger: true,
                  pageSizeOptions: ['10', '20', '50'],
                  showQuickJumper: true,
                  showTotal: (total) => `共 ${total} 條`,
                }}
                size="small"
                rowKey="id"
                scroll={{ x: 1200 }}
              />
            </Card>
          </div>
        </div>
      )}

      {!searched && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#bbb' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📱</div>
          <div style={{ fontSize: 15 }}>請設置查詢條件後，點擊「查詢」查看瀑布流配置</div>
        </div>
      )}

      {searched && filteredData.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#bbb' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
          <div style={{ fontSize: 15 }}>未找到匹配的瀑布流配置</div>
        </div>
      )}
    </div>
  )
}
