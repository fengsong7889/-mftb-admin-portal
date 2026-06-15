import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card, Tabs, Segmented, Button, Space, Input, Table, Tag, Modal,
  Form, Select, Switch, InputNumber, TimePicker, Radio, Statistic, Row, Col, message,
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  PlusOutlined,
  SearchOutlined,
  EditOutlined,
  DeleteOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  RightOutlined,
  DatabaseOutlined,
  ScissorOutlined,
  SwapOutlined,
  StopOutlined,
} from '@ant-design/icons'

// ============ 類型定義 ============

/** 所屬頻道枚舉 */
type ChannelType = '大首頁' | '外賣' | '超市' | '團購'

/** 展示時段類型 */
type TimeSlotType = '全天' | '自定義'

/** 展示模式 */
type DisplayMode = '文字' | '圖片'

/** 熱搜詞記錄 */
interface HotSearchRecord {
  key: string
  number: number
  word: string
  channel: ChannelType
  timeSlot: string
  isCommercial: boolean
  sortWeight: number
  enabled: boolean
}

/** 底紋詞記錄 */
interface HintWordRecord {
  key: string
  number: number
  word: string
  channel: ChannelType
  displayMode: DisplayMode
  carouselOrder: number
  enabled: boolean
}

// ============ 常量配置 ============

/** 頻道選項 */
const channelOptions = [
  { label: '大首頁', value: '大首頁' },
  { label: '外賣', value: '外賣' },
  { label: '超市', value: '超市' },
  { label: '團購', value: '團購' },
]

/** 頻道Tag顏色映射 */
const channelColorMap: Record<ChannelType, string> = {
  '大首頁': 'blue',
  '外賣': 'orange',
  '超市': 'green',
  '團購': 'purple',
}

// ============ Mock 數據 ============

/** 閃蜂熱搜詞 */
const flashBeeHotSearchData: HotSearchRecord[] = [
  { key: 'fb-h1', number: 1, word: '黃燜雞', channel: '外賣', timeSlot: '全天', isCommercial: true, sortWeight: 100, enabled: true },
  { key: 'fb-h2', number: 2, word: '奶茶', channel: '外賣', timeSlot: '14:00-17:00', isCommercial: false, sortWeight: 95, enabled: true },
  { key: 'fb-h3', number: 3, word: '漢堡', channel: '外賣', timeSlot: '11:00-14:00', isCommercial: false, sortWeight: 90, enabled: true },
  { key: 'fb-h4', number: 4, word: '超市優惠', channel: '超市', timeSlot: '全天', isCommercial: true, sortWeight: 85, enabled: true },
  { key: 'fb-h5', number: 5, word: '水果', channel: '超市', timeSlot: '全天', isCommercial: false, sortWeight: 80, enabled: true },
  { key: 'fb-h6', number: 6, word: '酒店', channel: '團購', timeSlot: '全天', isCommercial: true, sortWeight: 75, enabled: true },
  { key: 'fb-h7', number: 7, word: '美甲', channel: '團購', timeSlot: '全天', isCommercial: false, sortWeight: 70, enabled: true },
  { key: 'fb-h8', number: 8, word: '午餐', channel: '大首頁', timeSlot: '11:00-14:00', isCommercial: false, sortWeight: 65, enabled: true },
]

/** mFood熱搜詞 */
const mFoodHotSearchData: HotSearchRecord[] = [
  { key: 'mf-h1', number: 1, word: '炸雞', channel: '外賣', timeSlot: '全天', isCommercial: true, sortWeight: 100, enabled: true },
  { key: 'mf-h2', number: 2, word: '咖啡', channel: '外賣', timeSlot: '08:00-11:00', isCommercial: false, sortWeight: 95, enabled: true },
  { key: 'mf-h3', number: 3, word: '便當', channel: '外賣', timeSlot: '11:00-14:00', isCommercial: false, sortWeight: 90, enabled: true },
  { key: 'mf-h4', number: 4, word: '零食', channel: '超市', timeSlot: '全天', isCommercial: true, sortWeight: 85, enabled: true },
  { key: 'mf-h5', number: 5, word: '生活用品', channel: '超市', timeSlot: '全天', isCommercial: false, sortWeight: 80, enabled: true },
  { key: 'mf-h6', number: 6, word: 'KTV', channel: '團購', timeSlot: '全天', isCommercial: false, sortWeight: 75, enabled: true },
]

/** 閃蜂底紋詞 */
const flashBeeHintData: HintWordRecord[] = [
  { key: 'fb-d1', number: 1, word: '搜索你想吃的', channel: '大首頁', displayMode: '文字', carouselOrder: 1, enabled: true },
  { key: 'fb-d2', number: 2, word: '下午茶半價', channel: '外賣', displayMode: '文字', carouselOrder: 2, enabled: true },
  { key: 'fb-d3', number: 3, word: '新店特惠', channel: '外賣', displayMode: '圖片', carouselOrder: 3, enabled: true },
  { key: 'fb-d4', number: 4, word: '水果蔬菜', channel: '超市', displayMode: '文字', carouselOrder: 1, enabled: true },
  { key: 'fb-d5', number: 5, word: '週末團購享優惠', channel: '團購', displayMode: '文字', carouselOrder: 1, enabled: true },
]

/** mFood底紋詞 */
const mFoodHintData: HintWordRecord[] = [
  { key: 'mf-d1', number: 1, word: '今天吃什麼', channel: '大首頁', displayMode: '文字', carouselOrder: 1, enabled: true },
  { key: 'mf-d2', number: 2, word: '限時折扣', channel: '外賣', displayMode: '文字', carouselOrder: 2, enabled: true },
  { key: 'mf-d3', number: 3, word: '新店推薦', channel: '外賣', displayMode: '圖片', carouselOrder: 1, enabled: true },
  { key: 'mf-d4', number: 4, word: '生鮮直送', channel: '超市', displayMode: '文字', carouselOrder: 1, enabled: true },
]

// ============ 主組件 ============

export default function SearchDataManage() {
  const navigate = useNavigate()
  const [hotSearchForm] = Form.useForm()
  const [hintWordForm] = Form.useForm()

  // ---- 熱搜詞狀態 ----
  const [hotSearchApp, setHotSearchApp] = useState<string>('閃蜂')
  const [flashBeeHotSearch, setFlashBeeHotSearch] = useState<HotSearchRecord[]>([...flashBeeHotSearchData])
  const [mFoodHotSearch, setMFoodHotSearch] = useState<HotSearchRecord[]>([...mFoodHotSearchData])
  const [hotSearchModalOpen, setHotSearchModalOpen] = useState(false)
  const [editingHotSearch, setEditingHotSearch] = useState<HotSearchRecord | null>(null)
  const [hotSearchKeyword, setHotSearchKeyword] = useState('')

  // ---- 底紋詞狀態 ----
  const [hintWordApp, setHintWordApp] = useState<string>('閃蜂')
  const [flashBeeHint, setFlashBeeHint] = useState<HintWordRecord[]>([...flashBeeHintData])
  const [mFoodHint, setMFoodHint] = useState<HintWordRecord[]>([...mFoodHintData])
  const [hintWordModalOpen, setHintWordModalOpen] = useState(false)
  const [editingHintWord, setEditingHintWord] = useState<HintWordRecord | null>(null)
  const [hintWordKeyword, setHintWordKeyword] = useState('')

  // ---- 熱搜詞展示時段Radio ----
  const [hotSearchTimeType, setHotSearchTimeType] = useState<TimeSlotType>('全天')

  // ============ 熱搜詞操作 ============

  const currentHotSearchData = hotSearchApp === '閃蜂' ? flashBeeHotSearch : mFoodHotSearch
  const setCurrentHotSearchData = hotSearchApp === '閃蜂' ? setFlashBeeHotSearch : setMFoodHotSearch

  const filteredHotSearchData = hotSearchKeyword
    ? currentHotSearchData.filter(item => item.word.includes(hotSearchKeyword) || item.channel.includes(hotSearchKeyword))
    : currentHotSearchData

  /** 新增熱搜詞 */
  const handleAddHotSearch = () => {
    setEditingHotSearch(null)
    setHotSearchTimeType('全天')
    hotSearchForm.resetFields()
    hotSearchForm.setFieldsValue({ channel: '外賣', timeSlotType: '全天', isCommercial: false, sortWeight: 50, enabled: true })
    setHotSearchModalOpen(true)
  }

  /** 編輯熱搜詞 */
  const handleEditHotSearch = (record: HotSearchRecord) => {
    setEditingHotSearch(record)
    const isAllDay = record.timeSlot === '全天'
    setHotSearchTimeType(isAllDay ? '全天' : '自定義')
    hotSearchForm.setFieldsValue({
      word: record.word,
      channel: record.channel,
      timeSlotType: isAllDay ? '全天' : '自定義',
      isCommercial: record.isCommercial,
      sortWeight: record.sortWeight,
      enabled: record.enabled,
    })
    setHotSearchModalOpen(true)
  }

  /** 刪除熱搜詞 */
  const handleDeleteHotSearch = (record: HotSearchRecord) => {
    Modal.confirm({
      title: '確認刪除',
      content: `確定要刪除熱搜詞「${record.word}」嗎？`,
      okText: '確定',
      cancelText: '取消',
      onOk: () => {
        setCurrentHotSearchData(prev => prev.filter(item => item.key !== record.key))
        message.success('刪除成功')
      },
    })
  }

  /** 上移/下移熱搜詞 */
  const handleMoveHotSearch = (record: HotSearchRecord, direction: 'up' | 'down') => {
    const data = [...currentHotSearchData]
    const index = data.findIndex(item => item.key === record.key)
    if ((direction === 'up' && index <= 0) || (direction === 'down' && index >= data.length - 1)) return
    const swapIndex = direction === 'up' ? index - 1 : index + 1
    ;[data[index], data[swapIndex]] = [data[swapIndex], data[index]]
    // 更新序號
    data.forEach((item, i) => { item.number = i + 1 })
    setCurrentHotSearchData(data)
  }

  /** 保存熱搜詞 */
  const handleSaveHotSearch = () => {
    hotSearchForm.validateFields().then(values => {
      const timeSlot = values.timeSlotType === '全天' ? '全天' : values.customTimeSlot
      if (editingHotSearch) {
        setCurrentHotSearchData(prev =>
          prev.map(item => item.key === editingHotSearch.key
            ? { ...item, word: values.word, channel: values.channel, timeSlot, isCommercial: values.isCommercial, sortWeight: values.sortWeight, enabled: values.enabled }
            : item
          )
        )
        message.success('編輯成功')
      } else {
        const newData: HotSearchRecord = {
          key: `${hotSearchApp === '閃蜂' ? 'fb' : 'mf'}-h${Date.now()}`,
          number: currentHotSearchData.length + 1,
          word: values.word,
          channel: values.channel,
          timeSlot,
          isCommercial: values.isCommercial,
          sortWeight: values.sortWeight,
          enabled: values.enabled,
        }
        setCurrentHotSearchData(prev => [...prev, newData])
        message.success('新增成功')
      }
      setHotSearchModalOpen(false)
    })
  }

  // ============ 底紋詞操作 ============

  const currentHintData = hintWordApp === '閃蜂' ? flashBeeHint : mFoodHint
  const setCurrentHintData = hintWordApp === '閃蜂' ? setFlashBeeHint : setMFoodHint

  const filteredHintData = hintWordKeyword
    ? currentHintData.filter(item => item.word.includes(hintWordKeyword) || item.channel.includes(hintWordKeyword))
    : currentHintData

  /** 新增底紋詞 */
  const handleAddHintWord = () => {
    setEditingHintWord(null)
    hintWordForm.resetFields()
    hintWordForm.setFieldsValue({ channel: '大首頁', displayMode: '文字', carouselOrder: 1, enabled: true })
    setHintWordModalOpen(true)
  }

  /** 編輯底紋詞 */
  const handleEditHintWord = (record: HintWordRecord) => {
    setEditingHintWord(record)
    hintWordForm.setFieldsValue({
      word: record.word,
      channel: record.channel,
      displayMode: record.displayMode,
      carouselOrder: record.carouselOrder,
      enabled: record.enabled,
    })
    setHintWordModalOpen(true)
  }

  /** 刪除底紋詞 */
  const handleDeleteHintWord = (record: HintWordRecord) => {
    Modal.confirm({
      title: '確認刪除',
      content: `確定要刪除底紋詞「${record.word}」嗎？`,
      okText: '確定',
      cancelText: '取消',
      onOk: () => {
        setCurrentHintData(prev => prev.filter(item => item.key !== record.key))
        message.success('刪除成功')
      },
    })
  }

  /** 上移/下移底紋詞 */
  const handleMoveHintWord = (record: HintWordRecord, direction: 'up' | 'down') => {
    const data = [...currentHintData]
    const index = data.findIndex(item => item.key === record.key)
    if ((direction === 'up' && index <= 0) || (direction === 'down' && index >= data.length - 1)) return
    const swapIndex = direction === 'up' ? index - 1 : index + 1
    ;[data[index], data[swapIndex]] = [data[swapIndex], data[index]]
    data.forEach((item, i) => { item.number = i + 1 })
    setCurrentHintData(data)
  }

  /** 保存底紋詞 */
  const handleSaveHintWord = () => {
    hintWordForm.validateFields().then(values => {
      if (editingHintWord) {
        setCurrentHintData(prev =>
          prev.map(item => item.key === editingHintWord.key
            ? { ...item, word: values.word, channel: values.channel, displayMode: values.displayMode, carouselOrder: values.carouselOrder, enabled: values.enabled }
            : item
          )
        )
        message.success('編輯成功')
      } else {
        const newData: HintWordRecord = {
          key: `${hintWordApp === '閃蜂' ? 'fb' : 'mf'}-d${Date.now()}`,
          number: currentHintData.length + 1,
          word: values.word,
          channel: values.channel,
          displayMode: values.displayMode,
          carouselOrder: values.carouselOrder,
          enabled: values.enabled,
        }
        setCurrentHintData(prev => [...prev, newData])
        message.success('新增成功')
      }
      setHintWordModalOpen(false)
    })
  }

  // ============ 熱搜詞表格列定義 ============

  const hotSearchColumns: TableColumnsType<HotSearchRecord> = [
    {
      title: '序號',
      dataIndex: 'number',
      key: 'number',
      width: 70,
      align: 'center',
    },
    {
      title: '熱搜詞',
      dataIndex: 'word',
      key: 'word',
      width: 120,
    },
    {
      title: '所屬頻道',
      dataIndex: 'channel',
      key: 'channel',
      width: 100,
      render: (v: ChannelType) => <Tag color={channelColorMap[v]}>{v}</Tag>,
    },
    {
      title: '展示時段',
      dataIndex: 'timeSlot',
      key: 'timeSlot',
      width: 130,
    },
    {
      title: '是否商業詞',
      dataIndex: 'isCommercial',
      key: 'isCommercial',
      width: 110,
      render: (v: boolean) => v ? <Tag color="red">是</Tag> : <Tag>否</Tag>,
    },
    {
      title: '排序權重',
      dataIndex: 'sortWeight',
      key: 'sortWeight',
      width: 100,
      align: 'center',
    },
    {
      title: '狀態',
      dataIndex: 'enabled',
      key: 'enabled',
      width: 80,
      render: (v: boolean, record) => (
        <Switch
          size="small"
          checked={v}
          onChange={(checked) => {
            setCurrentHotSearchData(prev =>
              prev.map(item => item.key === record.key ? { ...item, enabled: checked } : item)
            )
          }}
        />
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      render: (_, record) => {
        const index = currentHotSearchData.findIndex(item => item.key === record.key)
        return (
          <Space size={0} split={<span className="action-split">|</span>}>
            <Button type="link" size="small" onClick={(e) => { e.preventDefault(); handleEditHotSearch(record) }}>編輯</Button>
            <Button type="link" size="small" danger onClick={(e) => { e.preventDefault(); handleDeleteHotSearch(record) }}>刪除</Button>
            <Button type="link" size="small" disabled={index === 0} onClick={(e) => { e.preventDefault(); handleMoveHotSearch(record, 'up') }}>上移</Button>
            <Button type="link" size="small" disabled={index === currentHotSearchData.length - 1} onClick={(e) => { e.preventDefault(); handleMoveHotSearch(record, 'down') }}>下移</Button>
          </Space>
        )
      },
    },
  ]

  // ============ 底紋詞表格列定義 ============

  const hintWordColumns: TableColumnsType<HintWordRecord> = [
    {
      title: '序號',
      dataIndex: 'number',
      key: 'number',
      width: 70,
      align: 'center',
    },
    {
      title: '底紋詞',
      dataIndex: 'word',
      key: 'word',
      width: 150,
    },
    {
      title: '所屬頻道',
      dataIndex: 'channel',
      key: 'channel',
      width: 100,
      render: (v: ChannelType) => <Tag color={channelColorMap[v]}>{v}</Tag>,
    },
    {
      title: '展示模式',
      dataIndex: 'displayMode',
      key: 'displayMode',
      width: 100,
      render: (v: DisplayMode) => <Tag color={v === '文字' ? 'blue' : 'cyan'}>{v}</Tag>,
    },
    {
      title: '輪播順序',
      dataIndex: 'carouselOrder',
      key: 'carouselOrder',
      width: 100,
      align: 'center',
    },
    {
      title: '狀態',
      dataIndex: 'enabled',
      key: 'enabled',
      width: 80,
      render: (v: boolean, record) => (
        <Switch
          size="small"
          checked={v}
          onChange={(checked) => {
            setCurrentHintData(prev =>
              prev.map(item => item.key === record.key ? { ...item, enabled: checked } : item)
            )
          }}
        />
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      render: (_, record) => {
        const index = currentHintData.findIndex(item => item.key === record.key)
        return (
          <Space size={0} split={<span className="action-split">|</span>}>
            <Button type="link" size="small" onClick={(e) => { e.preventDefault(); handleEditHintWord(record) }}>編輯</Button>
            <Button type="link" size="small" danger onClick={(e) => { e.preventDefault(); handleDeleteHintWord(record) }}>刪除</Button>
            <Button type="link" size="small" disabled={index === 0} onClick={(e) => { e.preventDefault(); handleMoveHintWord(record, 'up') }}>上移</Button>
            <Button type="link" size="small" disabled={index === currentHintData.length - 1} onClick={(e) => { e.preventDefault(); handleMoveHintWord(record, 'down') }}>下移</Button>
          </Space>
        )
      },
    },
  ]

  // ============ 詞庫管理Card數據 ============

  const libraryCards = [
    {
      key: 'word-segmentation',
      title: '分詞詞庫',
      description: '管理搜索分詞詞典，控制搜索時的分詞策略和效果',
      count: 12800,
      countLabel: '個詞',
      icon: <ScissorOutlined style={{ fontSize: 32, color: '#1890ff' }} />,
      route: '/word-segmentation',
      color: '#e6f7ff',
    },
    {
      key: 'synonym-config',
      title: '同義詞庫',
      description: '管理同義詞映射關係，提升搜索召回率和用戶體驗',
      count: 3560,
      countLabel: '組',
      icon: <SwapOutlined style={{ fontSize: 32, color: '#52c41a' }} />,
      route: '/synonym-config',
      color: '#f6ffed',
    },
    {
      key: 'merchant-alias',
      title: '商家別名庫',
      description: '管理商家名稱別名，支持多種名稱搜索到同一商家',
      count: 8920,
      countLabel: '個',
      icon: <DatabaseOutlined style={{ fontSize: 32, color: '#fa8c16' }} />,
      route: '/search-data-manage',
      color: '#fff7e6',
    },
    {
      key: 'stop-words',
      title: '停用詞庫',
      description: '管理搜索停用詞，過濾無意義的搜索詞彙',
      count: 450,
      countLabel: '個',
      icon: <StopOutlined style={{ fontSize: 32, color: '#f5222d' }} />,
      route: '/search-data-manage',
      color: '#fff1f0',
    },
  ]

  // ============ 渲染 ============

  /** 熱搜詞管理Tab */
  const renderHotSearchTab = () => (
    <div>
      {/* APP切換 */}
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Segmented
          value={hotSearchApp}
          onChange={(val) => setHotSearchApp(val as string)}
          options={['閃蜂', 'mFood']}
        />
        <Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAddHotSearch}>新增熱搜詞</Button>
          <Input
            placeholder="搜索熱搜詞"
            prefix={<SearchOutlined />}
            allowClear
            value={hotSearchKeyword}
            onChange={(e) => setHotSearchKeyword(e.target.value)}
            style={{ width: 200 }}
          />
        </Space>
      </div>

      {/* 熱搜詞表格 */}
      <Table<HotSearchRecord>
        columns={hotSearchColumns}
        dataSource={filteredHotSearchData}
        pagination={{
          total: filteredHotSearchData.length,
          pageSize: 10,
          showTotal: (total) => `共 ${total} 條`,
          showSizeChanger: true,
          pageSizeOptions: ['10', '20', '50'],
          showQuickJumper: true,
        }}
        size="middle"
        bordered={false}
      />
    </div>
  )

  /** 底紋詞管理Tab */
  const renderHintWordTab = () => (
    <div>
      {/* APP切換 */}
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Segmented
          value={hintWordApp}
          onChange={(val) => setHintWordApp(val as string)}
          options={['閃蜂', 'mFood']}
        />
        <Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAddHintWord}>新增底紋詞</Button>
          <Input
            placeholder="搜索底紋詞"
            prefix={<SearchOutlined />}
            allowClear
            value={hintWordKeyword}
            onChange={(e) => setHintWordKeyword(e.target.value)}
            style={{ width: 200 }}
          />
        </Space>
      </div>

      {/* 底紋詞表格 */}
      <Table<HintWordRecord>
        columns={hintWordColumns}
        dataSource={filteredHintData}
        pagination={{
          total: filteredHintData.length,
          pageSize: 10,
          showTotal: (total) => `共 ${total} 條`,
          showSizeChanger: true,
          pageSizeOptions: ['10', '20', '50'],
          showQuickJumper: true,
        }}
        size="middle"
        bordered={false}
      />
    </div>
  )

  /** 詞庫管理Tab */
  const renderLibraryTab = () => (
    <Row gutter={[16, 16]}>
      {libraryCards.map(card => (
        <Col span={12} key={card.key}>
          <Card
            hoverable
            style={{ height: '100%' }}
            bodyStyle={{ padding: 24 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                  <div style={{
                    width: 48,
                    height: 48,
                    borderRadius: 8,
                    background: card.color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    {card.icon}
                  </div>
                  <span style={{ fontSize: 18, fontWeight: 600 }}>{card.title}</span>
                </div>
                <p style={{ color: '#666', margin: '8px 0 16px', lineHeight: 1.6 }}>{card.description}</p>
                <Statistic
                  value={card.count}
                  suffix={card.countLabel}
                  valueStyle={{ fontSize: 28, fontWeight: 600, color: '#1890ff' }}
                />
              </div>
              <Button
                type="primary"
                ghost
                icon={<RightOutlined />}
                onClick={() => navigate(card.route)}
              >
                前往管理
              </Button>
            </div>
          </Card>
        </Col>
      ))}
    </Row>
  )

  return (
    <div className="content-area">
      {/* 頁面描述 */}
      <Card
        size="small"
        style={{ marginBottom: 16, borderLeft: '3px solid #1890ff', background: '#f0f5ff' }}
      >
        <span style={{ color: '#666' }}>
          管理搜索相關數據，熱搜詞和底紋詞按APP獨立管理，詞庫數據兩個APP共用
        </span>
      </Card>

      {/* 頁面主體Tabs */}
      <Tabs
        defaultActiveKey="hotSearch"
        items={[
          {
            key: 'hotSearch',
            label: '熱搜詞管理',
            children: renderHotSearchTab(),
          },
          {
            key: 'hintWord',
            label: '底紋詞管理',
            children: renderHintWordTab(),
          },
          {
            key: 'library',
            label: '詞庫管理',
            children: renderLibraryTab(),
          },
        ]}
      />

      {/* 熱搜詞新增/編輯彈窗 */}
      <Modal
        title={editingHotSearch ? '編輯熱搜詞' : '新增熱搜詞'}
        open={hotSearchModalOpen}
        onOk={handleSaveHotSearch}
        onCancel={() => setHotSearchModalOpen(false)}
        okText="確定"
        cancelText="取消"
        width={560}
        destroyOnClose
      >
        <Form form={hotSearchForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            label="熱搜詞"
            name="word"
            rules={[{ required: true, message: '請輸入熱搜詞' }]}
          >
            <Input placeholder="請輸入熱搜詞" maxLength={20} showCount />
          </Form.Item>

          <Form.Item
            label="所屬頻道"
            name="channel"
            rules={[{ required: true, message: '請選擇所屬頻道' }]}
          >
            <Select options={channelOptions} placeholder="請選擇頻道" />
          </Form.Item>

          <Form.Item
            label="展示時段"
            name="timeSlotType"
            rules={[{ required: true, message: '請選擇展示時段' }]}
          >
            <Radio.Group onChange={(e) => setHotSearchTimeType(e.target.value)}>
              <Radio value="全天">全天</Radio>
              <Radio value="自定義">自定義</Radio>
            </Radio.Group>
          </Form.Item>

          {hotSearchTimeType === '自定義' && (
            <Form.Item
              label="自定義時段"
              name="customTimeSlot"
              rules={[{ required: true, message: '請選擇時段' }]}
            >
              <TimePicker.RangePicker format="HH:mm" style={{ width: '100%' }} />
            </Form.Item>
          )}

          <Form.Item label="是否商業詞" name="isCommercial" valuePropName="checked">
            <Switch checkedChildren="是" unCheckedChildren="否" />
          </Form.Item>

          <Form.Item label="排序權重" name="sortWeight">
            <InputNumber min={0} max={999} style={{ width: '100%' }} placeholder="請輸入排序權重" />
          </Form.Item>

          <Form.Item label="狀態" name="enabled" valuePropName="checked">
            <Switch checkedChildren="啟用" unCheckedChildren="停用" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 底紋詞新增/編輯彈窗 */}
      <Modal
        title={editingHintWord ? '編輯底紋詞' : '新增底紋詞'}
        open={hintWordModalOpen}
        onOk={handleSaveHintWord}
        onCancel={() => setHintWordModalOpen(false)}
        okText="確定"
        cancelText="取消"
        width={560}
        destroyOnClose
      >
        <Form form={hintWordForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            label="底紋詞"
            name="word"
            rules={[{ required: true, message: '請輸入底紋詞' }]}
          >
            <Input placeholder="請輸入底紋詞" maxLength={20} showCount />
          </Form.Item>

          <Form.Item
            label="所屬頻道"
            name="channel"
            rules={[{ required: true, message: '請選擇所屬頻道' }]}
          >
            <Select options={channelOptions} placeholder="請選擇頻道" />
          </Form.Item>

          <Form.Item
            label="展示模式"
            name="displayMode"
            rules={[{ required: true, message: '請選擇展示模式' }]}
          >
            <Select
              options={[
                { label: '文字', value: '文字' },
                { label: '圖片', value: '圖片' },
              ]}
              placeholder="請選擇展示模式"
            />
          </Form.Item>

          <Form.Item label="輪播順序" name="carouselOrder">
            <InputNumber min={1} max={99} style={{ width: '100%' }} placeholder="請輸入輪播順序" />
          </Form.Item>

          <Form.Item label="狀態" name="enabled" valuePropName="checked">
            <Switch checkedChildren="啟用" unCheckedChildren="停用" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
