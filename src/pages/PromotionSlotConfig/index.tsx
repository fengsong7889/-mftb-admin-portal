import { useState, useEffect, useMemo } from 'react'
import { Button, Space, Table, Tag, Select, Form, Input, message, Modal } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { SearchOutlined, ReloadOutlined, PlusOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useColumnConfig } from '../../hooks/useColumnConfig'

/** 瀑布流配置记录 */
interface WaterfallSlotConfig {
  id: number
  promotionName: string
  slotIndex: number
  businessChannel: string  // 业务频道: food / supermarket / groupBuy
  pageLocation: string     // 页面位置: home / delivery / supermarket / groupBuy
  timeSlot: string         // 时段: allDay / breakfast / lunch / afternoonTea / dinner / midnightSnack
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

/** 品牌标签 */
const APP_LABEL: Record<string, string> = {
  shanfeng: '閃峰',
  mfood: 'mFood',
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

/** 推广名称虚拟数据 */
const PROMOTION_NAMES = [
  '无敌星星国庆推广', '新店广告中秋特惠', '盘活广告双十一狂欢',
  '独家商家周年庆', '流量广告圣诞特卖', '猜你喜欢新年推荐',
  '自然流量春季大促', '搜索算法开学季', '无敌星星情人节专场',
  '新店广告夏季清凉', '盘活广告秋季美食', '独家商家冬季暖锅',
  '流量广告周末特惠', '猜你喜欢月末冲刺', '自然流量节日庆典',
  '搜索算法品牌周',
]

/** Mock数据 - 覆盖所有业务频道+页面位置+时段组合 */
const mockData: WaterfallSlotConfig[] = (() => {
  // 业务频道 × 页面位置的有效组合
  const combos: { businessChannel: string; pageLocation: string }[] = [
    { businessChannel: 'food', pageLocation: 'home' },
    { businessChannel: 'food', pageLocation: 'delivery' },
    { businessChannel: 'supermarket', pageLocation: 'home' },
    { businessChannel: 'supermarket', pageLocation: 'supermarket' },
    { businessChannel: 'groupBuy', pageLocation: 'home' },
    { businessChannel: 'groupBuy', pageLocation: 'groupBuy' },
  ]
  const timeSlots = ['breakfast', 'lunch', 'afternoonTea', 'dinner', 'midnightSnack']
  const algorithmTypes = ['invincibleStar', 'youLike', 'newShopAd', 'activateAd', 'exclusiveShop']
  const algorithmNames: Record<string, string[]> = {
    invincibleStar: ['無敵星星-首頁版', '無敵星星-外賣版', '無敵星星-團購版'],
    youLike: ['猜你喜歡-主力版', '猜你喜歡-週末版', '猜你喜歡-夜間版'],
    newShopAd: ['新店廣告-首頁版', '新店廣告-早餐版', '新店廣告-午市版'],
    activateAd: ['盤活復蘇-首頁版', '盤活復蘇-午市版', '盤活復蘇-晚市版'],
    exclusiveShop: ['獨家商家-首頁版', '獨家商家-超市版', '獨家商家-晚市版'],
  }
  const users = ['admin', 'operator', 'user001', 'user002']
  
  const data: WaterfallSlotConfig[] = []
  let id = 1
  
  // 每个组合 × 每个时段生成 2-3 条数据
  for (const combo of combos) {
    for (const ts of timeSlots) {
      const count = 2 + Math.floor(pseudoRandom(id * 77) * 2)
      for (let j = 0; j < count; j++) {
        const seed = id * 100
        const algorithmType = algorithmTypes[Math.floor(pseudoRandom(seed + 1) * algorithmTypes.length)]
        const names = algorithmNames[algorithmType]
        const algorithmName = names[Math.floor(pseudoRandom(seed + 2) * names.length)]
        
        data.push({
          id,
          promotionName: PROMOTION_NAMES[(id - 1) % PROMOTION_NAMES.length],
          slotIndex: j + 1,
          businessChannel: combo.businessChannel,
          pageLocation: combo.pageLocation,
          timeSlot: ts,
          app: 'shanfeng',
          position: j + 1,
          algorithmId: Math.floor(pseudoRandom(seed + 3) * 10) + 1,
          algorithmName,
          algorithmType,
          weight: Math.floor(pseudoRandom(seed + 4) * 50) + 40,
          status: pseudoRandom(seed + 5) > 0.2 ? 'active' : 'inactive',
          updatedBy: users[Math.floor(pseudoRandom(seed + 6) * users.length)],
          updatedAt: `2024-01-${String(20 + Math.floor(id / 3)).padStart(2, '0')} ${String(8 + Math.floor(pseudoRandom(seed + 7) * 12)).padStart(2, '0')}:${String(Math.floor(pseudoRandom(seed + 8) * 60)).padStart(2, '0')}:00`,
        })
        id++
      }
    }
  }
  
  return data
})()

export default function PromotionSlotConfig() {
  const navigate = useNavigate()
  const [searchForm] = Form.useForm()
  const [filteredData, setFilteredData] = useState<WaterfallSlotConfig[]>(mockData)

  // 初始化时查询全部数据
  useEffect(() => {
    setFilteredData(mockData)
  }, [])

  // 编辑
  const handleEdit = (record: WaterfallSlotConfig) => {
    console.log('编辑:', record)
  }

  // 启用/停用
  const handleToggleStatus = (record: WaterfallSlotConfig) => {
    const newStatus: 'active' | 'inactive' = record.status === 'active' ? 'inactive' : 'active'
    const actionText = newStatus === 'active' ? '啟用' : '停用'
    Modal.confirm({
      title: `確認${actionText}`,
      content: `確定要${actionText}「${record.promotionName}」嗎？`,
      okText: '確定',
      cancelText: '取消',
      onOk: () => {
        const updated = filteredData.map(item =>
          item.id === record.id ? { ...item, status: newStatus } : item
        )
        setFilteredData(updated)
        message.success(`已${actionText}「${record.promotionName}」`)
      },
    })
  }


  // 删除
  const handleDelete = (record: WaterfallSlotConfig) => {
    Modal.confirm({
      title: '確認刪除',
      content: `確定要刪除瀑布流「${record.promotionName}」嗎？`,
      okText: '確定',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => {
        setFilteredData(prev => prev.filter(item => item.id !== record.id))
        message.success('刪除成功')
      },
    })
  }
  // 搜索处理
  const handleSearch = () => {
    const values = searchForm.getFieldsValue()
    let result = [...mockData]
    
    // 配置ID
    if (values.id) {
      result = result.filter(item => String(item.id).includes(String(values.id)))
    }
    
    // 瀑布流名称
    if (values.promotionName) {
      result = result.filter(item => item.promotionName?.includes(values.promotionName))
    }
    
    // 所属品牌
    if (values.app) {
      result = result.filter(item => item.app === values.app)
    }
    
    // 算法名称
    if (values.algorithmName) {
      result = result.filter(item => item.algorithmName === values.algorithmName)
    }
    
    // 状态
    if (values.status) {
      result = result.filter(item => item.status === values.status)
    }
    
    setFilteredData(result)
  }

  // 重置搜索
  const handleReset = () => {
    searchForm.resetFields()
    setFilteredData(mockData)
  }

  /** 列配置元数据 */
  const columnMeta = useMemo(() => [
    { key: 'id', title: '配置ID' },
    { key: 'promotionName', title: '瀑布流名稱' },
    { key: 'app', title: '所屬品牌' },
    { key: 'status', title: '狀態' },
    { key: 'action', title: '操作' },
  ], [])

  const { configComponent, applyConfig } = useColumnConfig('promotionSlotConfig', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  // 列定义
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
      title: '瀑布流名稱',
      dataIndex: 'promotionName',
      key: 'promotionName',
      width: 200,
      render: (text: string) => <strong>{text}</strong>,
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
      title: '操作',
      key: 'action',
      width: 180,
      fixed: 'right' as const,
      render: (_, record) => (
        <Space size={0} split={<span style={{ color: '#d9d9d9' }}>|</span>}>
          <Button 
            type="link" 
            size="small"
            danger={record.status === 'active'}
            style={record.status !== 'active' ? { color: '#52c41a' } : undefined}
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
            <Input placeholder="請輸入配置ID" allowClear />
          </Form.Item>
          <Form.Item label="瀑布流名稱" name="promotionName">
            <Input placeholder="請輸入瀑布流名稱" allowClear />
          </Form.Item>
          <Form.Item label="所屬品牌" name="app">
            <Select 
              placeholder="全部" 
              allowClear
              options={[
                { label: '閃峰', value: 'shanfeng' },
                { label: 'mFood', value: 'mfood' },
              ]}
            />
          </Form.Item>
          <Form.Item label="算法名稱" name="algorithmName">
            <Select 
              placeholder="請輸入搜索" 
              allowClear
              showSearch
              optionFilterProp="label"
              options={[
                { label: '無敵星星-首頁版', value: '無敵星星-首頁版' },
                { label: '無敵星星-外賣版', value: '無敵星星-外賣版' },
                { label: '無敵星星-團購版', value: '無敵星星-團購版' },
                { label: '猜你喜歡-主力版', value: '猜你喜歡-主力版' },
                { label: '猜你喜歡-週末版', value: '猜你喜歡-週末版' },
                { label: '猜你喜歡-夜間版', value: '猜你喜歡-夜間版' },
                { label: '新店廣告-首頁版', value: '新店廣告-首頁版' },
                { label: '新店廣告-早餐版', value: '新店廣告-早餐版' },
                { label: '新店廣告-午市版', value: '新店廣告-午市版' },
                { label: '盤活復蘇-首頁版', value: '盤活復蘇-首頁版' },
                { label: '盤活復蘇-午市版', value: '盤活復蘇-午市版' },
                { label: '盤活復蘇-晚市版', value: '盤活復蘇-晚市版' },
                { label: '獨家商家-首頁版', value: '獨家商家-首頁版' },
                { label: '獨家商家-超市版', value: '獨家商家-超市版' },
                { label: '獨家商家-晚市版', value: '獨家商家-晚市版' },
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
          <Button 
            type="primary" 
            icon={<PlusOutlined />}
            onClick={() => navigate('/promotion-slot-config-add')}
          >
            新增
          </Button>

        </Space>
        {configComponent}
      </div>

      {/* 列表区域 */}
      <div className="table-section">
        <Table<WaterfallSlotConfig>
          columns={applyConfig(columns)}
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
      </div>


    </div>
  )
}


