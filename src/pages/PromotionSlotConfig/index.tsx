import { useState, useEffect } from 'react'
import { Button, Space, Table, Tag, Select, Form, Card, Badge, Modal, InputNumber, message, Input, DatePicker } from 'antd'
const { RangePicker } = DatePicker
import type { ColumnsType } from 'antd/es/table'
import { SearchOutlined, ReloadOutlined, MobileOutlined, PlusOutlined, EditOutlined, ControlOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'

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
  home: '美食外賣',
  delivery: '外賣頻道',
  groupBuy: '團購到店',
  supermarket: '超市百貨',
}

/** 投放界面标签 */
const PLACEMENT_LABEL: Record<string, string> = {
  home: '大首頁-Feed',
  delivery: '外賣頻道-Feed',
  groupBuy: '團購頻道-Feed',
  supermarket: '超市頻道-Feed',
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
  const navigate = useNavigate()
  const [searchForm] = Form.useForm()
  const [addForm] = Form.useForm()
  const [filteredData, setFilteredData] = useState<WaterfallSlotConfig[]>([])
  const [searched, setSearched] = useState(false)
  const [addModalVisible, setAddModalVisible] = useState(false)
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]) // 选中的行
  const [boothControlVisible, setBoothControlVisible] = useState(false) // 展位管控弹窗
  const [boothControlForm] = Form.useForm() // 展位管控表单
  const [maxSlotCount, setMaxSlotCount] = useState(15) // 最大展示位置数量

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

  // 新增 - 跳转到新页面
  const handleAdd = () => {
    navigate('/promotion-slot-config-add')
  }

  // 提交新增
  const handleAddSubmit = async () => {
    try {
      const values = await addForm.validateFields()
      
      const maxId = filteredData.length > 0 ? Math.max(...filteredData.map(d => d.id)) : 0
      const maxPosition = filteredData.length > 0 ? Math.max(...filteredData.map(d => d.position)) : 0
      
      const algorithmTypeNames: Record<string, string[]> = {
        invincibleStar: ['無敵星星-首頁版', '無敵星星-外賣版', '無敵星星-團購版'],
        youLike: ['猜你喜歡-主力版', '猜你喜歡-週末版', '猜你喜歡-夜間版'],
        newShopAd: ['新店廣告-首頁版', '新店廣告-早餐版', '新店廣告-午市版'],
        activateAd: ['盤活廣告-首頁版', '盤活廣告-午市版', '盤活廣告-晚市版'],
        exclusiveShop: ['獨家商家-首頁版', '獨家商家-超市版', '獨家商家-晚市版'],
      }
      
      const algorithmNames = algorithmTypeNames[values.algorithmType]
      const algorithmName = algorithmNames[0]
      
      const now = new Date()
      const timeStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:00`
      
      const newRecord: WaterfallSlotConfig = {
        id: maxId + 1,
        slotIndex: maxPosition + 1,
        channel: values.channel,
        app: values.app,
        position: values.position || (maxPosition + 1),
        algorithmId: values.algorithmId,
        algorithmName,
        algorithmType: values.algorithmType,
        weight: values.weight,
        status: values.status,
        updatedBy: 'admin',
        updatedAt: timeStr,
      }
      
      const newData = [...filteredData, newRecord]
      setFilteredData(newData)
      setSearched(true)
      setAddModalVisible(false)
      message.success('新增成功')
    } catch (error) {
      console.error('新增失败:', error)
    }
  }

  // 编辑
  const handleEdit = (record: WaterfallSlotConfig) => {
    console.log('编辑:', record)
  }

  // 批量修改
  const handleBatchEdit = () => {
    if (selectedRowKeys.length === 0) {
      message.warning('請先選擇需要修改的數據')
      return
    }
    console.log('批量修改:', selectedRowKeys)
    message.info(`已選擇 ${selectedRowKeys.length} 條數據，批量修改功能開發中`)
  }

  // 展位管控
  const handleBoothControl = () => {
    // 获取当前查询条件
    const currentChannel = searchForm.getFieldValue('channel') || 'home'
    const currentApp = searchForm.getFieldValue('app') || 'shanfeng'
    
    // 计算当前已配置的数量
    const currentMaxPosition = filteredData.length > 0 
      ? Math.max(...filteredData.map(d => d.position)) 
      : 0
    
    // 初始化表单 - 使用枚举值显示中文
    boothControlForm.setFieldsValue({
      channel: CHANNEL_FULL_LABEL[currentChannel] || currentChannel,
      app: APP_LABEL[currentApp] || currentApp,
      maxSlotCount: currentMaxPosition,
    })
    
    setBoothControlVisible(true)
  }

  // 提交展位管控
  const handleBoothControlSubmit = async () => {
    try {
      const values = await boothControlForm.validateFields()
      const newMaxCount = values.maxSlotCount
      
      // 更新最大展示位置数量
      setMaxSlotCount(newMaxCount)
      
      // 存储到 localStorage 供新增页面使用
      localStorage.setItem('waterfall_max_slot_count', String(newMaxCount))
      
      message.success(`展位管控成功，最多可配置 ${newMaxCount} 個展示位置`)
      setBoothControlVisible(false)
    } catch (error) {
      console.error('展位管控提交失败:', error)
    }
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
    
    // 配置ID
    if (values.id) {
      result = result.filter(item => String(item.id).includes(String(values.id)))
    }
    
    // 业务频道
    if (values.channel) {
      result = result.filter(item => item.channel === values.channel)
    }
    
    // 所属品牌
    if (values.app) {
      result = result.filter(item => item.app === values.app)
    }
    
    // 算法ID
    if (values.algorithmId) {
      result = result.filter(item => String(item.algorithmId).includes(String(values.algorithmId)))
    }
    
    // 算法名称
    if (values.algorithmName) {
      result = result.filter(item => item.algorithmName.includes(values.algorithmName))
    }
    
    // 展示位置
    if (values.position) {
      result = result.filter(item => item.position === values.position)
    }
    
    // 推荐类型
    if (values.algorithmType) {
      result = result.filter(item => item.algorithmType === values.algorithmType)
    }
    
    // 最后更新人
    if (values.updatedBy) {
      result = result.filter(item => item.updatedBy.includes(values.updatedBy))
    }
    
    // 状态
    if (values.status) {
      result = result.filter(item => item.status === values.status)
    }
    
    // 最后更新时间（日期范围）
    if (values.updatedAt && values.updatedAt.length === 2) {
      const [startDate, endDate] = values.updatedAt
      result = result.filter(item => {
        const itemDate = new Date(item.updatedAt)
        return itemDate >= startDate && itemDate <= endDate
      })
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
      title: '配置ID',
      dataIndex: 'id',
      key: 'id',
      width: 100,
      align: 'center',
      render: (v: number) => (
        <Tag color="blue">{String(v).padStart(6, '0')}</Tag>
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
      title: '投放界面',
      dataIndex: 'channel',
      key: 'placementInterface',
      width: 140,
      render: (v: string) => PLACEMENT_LABEL[v] || '-',
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
      title: '推薦類型',
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
      title: '算法ID',
      dataIndex: 'algorithmId',
      key: 'algorithmId',
      width: 100,
      align: 'center',
      render: (id: number) => (
        <code style={{ background: '#f5f5f5', padding: '2px 6px', borderRadius: 4 }}>
          {String(id).padStart(6, '0')}
        </code>
      ),
    },
    {
      title: '算法名稱',
      dataIndex: 'algorithmName',
      key: 'algorithmName',
      width: 180,
      ellipsis: true,
      render: (text: string) => <strong>{text}</strong>,
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
          <Form.Item label="配置ID" name="id">
            <Input 
              placeholder="請輸入配置ID" 
              allowClear
            />
          </Form.Item>
          <Form.Item label="業務頻道" name="channel" initialValue="home">
            <Select 
              placeholder="全部"
              options={[
                { label: '美食外賣', value: 'home' },
                { label: '超市百貨', value: 'supermarket' },
                { label: '團購到店', value: 'groupBuy' },
              ]}
              allowClear
            />
          </Form.Item>
          <Form.Item label="所屬品牌" name="app" initialValue="shanfeng">
            <Select 
              placeholder="全部"
              options={[
                { label: '閃峰', value: 'shanfeng' },
                { label: 'mFood', value: 'mfood' },
              ]}
              allowClear
            />
          </Form.Item>
          <Form.Item label="投放界面" name="placementInterface">
            <Select 
              placeholder="全部"
              options={[
                { label: '大首頁-Feed', value: 'home' },
                { label: '外賣頻道-Feed', value: 'delivery' },
                { label: '超市頻道-Feed', value: 'supermarket' },
                { label: '團購頻道-Feed', value: 'groupBuy' },
              ]}
              allowClear
            />
          </Form.Item>
          <Form.Item label="算法ID" name="algorithmId">
            <Input 
              placeholder="請輸入算法ID" 
              allowClear
            />
          </Form.Item>
          <Form.Item label="算法名稱" name="algorithmName">
            <Input 
              placeholder="算法名稱/ID" 
              allowClear
            />
          </Form.Item>
          <Form.Item label="展示位置" name="position">
            <Select 
              placeholder="請選擇"
              allowClear
              options={Array.from({ length: 20 }, (_, i) => ({
                label: `${i + 1}號位`,
                value: i + 1,
              }))}
            />
          </Form.Item>
          <Form.Item label="推薦類型" name="algorithmType">
            <Select 
              placeholder="全部"
              allowClear
              options={[
                { label: '無敵星星', value: 'invincibleStar' },
                { label: '猜你喜歡', value: 'youLike' },
                { label: '新店廣告', value: 'newShopAd' },
                { label: '盤活廣告', value: 'activateAd' },
                { label: '獨家商家', value: 'exclusiveShop' },
              ]}
            />
          </Form.Item>
          <Form.Item label="狀態" name="status">
            <Select 
              placeholder="全部"
              allowClear
              options={[
                { label: '啟用', value: 'active' },
                { label: '停用', value: 'inactive' },
              ]}
            />
          </Form.Item>
          <Form.Item label="最後更新人" name="updatedBy">
            <Input 
              placeholder="請輸入更新人" 
              allowClear
            />
          </Form.Item>
          <Form.Item label="最後更新時間" name="updatedAt">
            <RangePicker 
              placeholder={['開始日期', '結束日期']}
              allowClear
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
                <div style={{ fontSize: 16, fontWeight: 600, color: '#333', marginBottom: 6 }}>
                  {phoneTitle}
                </div>
                <div style={{ fontSize: 12, color: '#8c8c8c', lineHeight: 1.5 }}>
                  (只展示啟用狀態的配置)
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
                <Space>
                  <MobileOutlined style={{ color: '#1890ff' }} />
                  <span style={{ fontSize: 15, fontWeight: 600 }}>瀑布流規劃詳情</span>
                </Space>
              }
              extra={
                <Space>
                  <Button type="primary" onClick={handleAdd}>
                    <PlusOutlined /> 新增
                  </Button>
                  <Button onClick={handleBatchEdit}>
                    <EditOutlined /> 批量修改
                  </Button>
                  <Button onClick={handleBoothControl}>
                    <ControlOutlined /> 展位管控
                  </Button>
                </Space>
              }
              style={{ borderRadius: 8 }}
            >
              <Table<WaterfallSlotConfig>
                columns={columns}
                dataSource={filteredData}
                rowSelection={{
                  selectedRowKeys,
                  onChange: (selectedKeys) => {
                    setSelectedRowKeys(selectedKeys)
                  },
                  getCheckboxProps: (record) => ({
                    disabled: record.status === 'inactive',
                    name: record.algorithmName,
                  }),
                }}
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
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          {/* 左侧：手机模型 - 空数据时仍然显示 */}
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
                <div style={{ fontSize: 16, fontWeight: 600, color: '#333', marginBottom: 6 }}>
                  {phoneTitle}
                </div>
                <div style={{ fontSize: 12, color: '#8c8c8c', lineHeight: 1.5 }}>
                  (只展示啟用狀態的配置)
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
                {/* 空数据时展示默认位置和权重分排序 */}
                {[1, 2, 3, 4, 5, 6].map((position) => (
                  <div
                    key={position}
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
                        count={`${position}號位`}
                        style={{ backgroundColor: '#d9d9d9' }}
                      />
                      <Tag color="default">
                        權重分排序
                      </Tag>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 右侧：列表视图 - 保留新增按钮 */}
          <div style={{ flex: 1, minWidth: 360 }}>
            <Card
              title={
                <Space>
                  <MobileOutlined style={{ color: '#1890ff' }} />
                  <span style={{ fontSize: 15, fontWeight: 600 }}>瀑布流規劃詳情</span>
                </Space>
              }
              extra={
                <Space>
                  <Button type="primary" onClick={handleAdd}>
                    <PlusOutlined /> 新增
                  </Button>
                  <Button onClick={handleBatchEdit}>
                    <EditOutlined /> 批量修改
                  </Button>
                  <Button onClick={handleBoothControl}>
                    <ControlOutlined /> 展位管控
                  </Button>
                </Space>
              }
              style={{ borderRadius: 8 }}
            >
              <div style={{ 
                textAlign: 'center', 
                padding: '60px 0', 
                color: '#bbb' 
              }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>📭</div>
                <div style={{ fontSize: 14 }}>暫無瀑布流配置</div>
                <div style={{ fontSize: 12, marginTop: 8, color: '#8c8c8c' }}>
                  點擊「新增」按鈕添加配置
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* 新增弹窗 */}
      <Modal
        title="新增瀑布流配置"
        open={addModalVisible}
        onOk={handleAddSubmit}
        onCancel={() => setAddModalVisible(false)}
        width={600}
        okText="確定"
        cancelText="取消"
      >
        <Form
          form={addForm}
          layout="vertical"
          style={{ marginTop: 24 }}
        >
          <Form.Item
            label="業務頻道"
            name="channel"
            rules={[{ required: true, message: '請選擇業務頻道' }]}
          >
            <Select
              options={[
                { label: '大首頁', value: 'home' },
                { label: '外賣', value: 'delivery' },
                { label: '團購', value: 'groupBuy' },
                { label: '超市', value: 'supermarket' },
              ]}
            />
          </Form.Item>

          <Form.Item
            label="所屬品牌"
            name="app"
            rules={[{ required: true, message: '請選擇所屬品牌' }]}
          >
            <Select
              options={[
                { label: '閃峰', value: 'shanfeng' },
                { label: 'mFood', value: 'mfood' },
              ]}
            />
          </Form.Item>

          <Form.Item
            label="展示位置"
            name="position"
            rules={[{ required: true, message: '請輸入展示位置' }]}
          >
            <InputNumber
              min={1}
              max={100}
              style={{ width: '100%' }}
              placeholder="請輸入位置序號(如: 1, 2, 3...)"
            />
          </Form.Item>

          <Form.Item
            label="算法類型"
            name="algorithmType"
            rules={[{ required: true, message: '請選擇算法類型' }]}
          >
            <Select
              options={[
                { label: '無敵星星', value: 'invincibleStar' },
                { label: '猜你喜歡', value: 'youLike' },
                { label: '新店廣告', value: 'newShopAd' },
                { label: '盤活廣告', value: 'activateAd' },
                { label: '獨家商家', value: 'exclusiveShop' },
              ]}
            />
          </Form.Item>

          <Form.Item
            label="算法ID"
            name="algorithmId"
            rules={[{ required: true, message: '請輸入算法ID' }]}
          >
            <InputNumber
              min={1}
              max={1000}
              style={{ width: '100%' }}
              placeholder="請輸入算法ID"
            />
          </Form.Item>

          <Form.Item
            label="權重分"
            name="weight"
            rules={[{ required: true, message: '請輸入權重分' }]}
          >
            <InputNumber
              min={0}
              max={100}
              style={{ width: '100%' }}
              placeholder="請輸入權重分(0-100)"
            />
          </Form.Item>

          <Form.Item
            label="狀態"
            name="status"
            rules={[{ required: true, message: '請選擇狀態' }]}
          >
            <Select
              options={[
                { label: '啟用', value: 'active' },
                { label: '停用', value: 'inactive' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 展位管控弹窗 */}
      <Modal
        title="展位管控"
        open={boothControlVisible}
        onOk={handleBoothControlSubmit}
        onCancel={() => setBoothControlVisible(false)}
        okText="確認"
        cancelText="取消"
        width={600}
      >
        <Form
          form={boothControlForm}
          layout="vertical"
          style={{ marginTop: 24 }}
        >
          <div style={{ 
            background: '#f0f5ff', 
            padding: '16px', 
            borderRadius: 8,
            marginBottom: 24
          }}>
            <div style={{ 
              fontSize: 14, 
              color: '#595959',
              marginBottom: 8
            }}>
              📊 當前配置信息
            </div>
            <Form.Item
              label="所屬品牌"
              name="app"
              style={{ marginBottom: 12 }}
            >
              <Select disabled />
            </Form.Item>
            <Form.Item
              label="業務頻道"
              name="channel"
              style={{ marginBottom: 0 }}
            >
              <Select disabled />
            </Form.Item>
          </div>

          <Form.Item
            label="可配置展示數量"
            name="maxSlotCount"
            rules={[
              { required: true, message: '請輸入可配置展示數量' },
              { 
                type: 'number', 
                min: 1, 
                max: 100, 
                message: '展示數量必須在 1-100 之間' 
              }
            ]}
            extra="修改後，新增界面的展示位置將最多可選擇至此數量"
          >
            <InputNumber
              min={1}
              max={100}
              style={{ width: '100%' }}
              placeholder="請輸入展示位置數量"
              addonAfter="個"
              size="large"
            />
          </Form.Item>

          <div style={{ 
            background: '#fffbe6', 
            padding: '12px 16px', 
            borderRadius: 6,
            border: '1px solid #ffe58f',
            marginTop: 16
          }}>
            <div style={{ 
              fontSize: 13, 
              color: '#8c8c8c',
              lineHeight: 1.6
            }}>
              💡 <strong>說明：</strong>
              <br />
              • 當前最多可選擇 <strong>{maxSlotCount}</strong> 號位置
              <br />
              • 修改後，新增界面的展示位置下拉框將擴展至新的數量
              <br />
              • 例如：修改為 20，則可以選擇 1-20 號位置
            </div>
          </div>
        </Form>
      </Modal>
    </div>
  )
}
