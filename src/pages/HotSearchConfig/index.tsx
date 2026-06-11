import { useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Button, Space, Input, InputNumber, Select, Table, Tag, Modal, Form, DatePicker, TimePicker,
  ColorPicker, Upload, Switch, Radio, Checkbox, message,
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  SearchOutlined, ReloadOutlined, PlusOutlined, UploadOutlined,
  EyeOutlined, TranslationOutlined, FireOutlined, PushpinOutlined, PushpinFilled,
} from '@ant-design/icons'
import { useColumnConfig } from '../../hooks/useColumnConfig'

const { RangePicker } = DatePicker
const { RangePicker: TimeRangePicker } = TimePicker

/* ======================== 常量定义 ======================== */

/** 搜索入口（合并原 searchPage + searchChannel） */
const searchEntryOptions = [
  { label: '大首頁', value: 'home' },
  { label: '外賣搜索', value: 'takeaway' },
  { label: '超市搜索', value: 'supermarket' },
  { label: '團購搜索', value: 'groupBuy' },
]

/** 品牌 */
const brandOptions = [
  { label: '全部', value: 'all' },
  { label: 'mFood', value: 'mFood' },
  { label: '閃蜂', value: 'flashBee' },
]

/** 展示終端 */
const terminalOptions = [
  { label: 'APP', value: 'app' },
  { label: '微信小程序', value: 'wechatMini' },
  { label: 'Mpay小應用', value: 'mpayMini' },
  { label: '微信H5', value: 'wechatH5' },
]

/** 展示區域 */
const regionOptions = [
  { label: '全部', value: 'all' },
  { label: '澳門', value: 'macau' },
  { label: '氹仔', value: 'taipa' },
  { label: '珠海市', value: 'zhuhai' },
]

/** 時段 */
const timeSlotOptions = [
  { label: '全天', value: 'allDay' },
  { label: '早餐', value: 'breakfast' },
  { label: '午餐', value: 'lunch' },
  { label: '下午茶', value: 'afternoonTea' },
  { label: '晚餐', value: 'dinner' },
  { label: '宵夜', value: 'midnightSnack' },
]
const specificSlots = ['breakfast', 'lunch', 'afternoonTea', 'dinner', 'midnightSnack']

/** 人群 */
const crowdOptions = [
  { label: '全部', value: 'all' },
  { label: '新用戶', value: 'newUser' },
  { label: '老用戶', value: 'oldUser' },
  { label: 'VIP用戶', value: 'vip' },
]

/** 熱搜詞來源 */
const wordSourceOptions = [
  { label: '自定義詞', value: 'custom' },
  { label: '熱搜詞庫', value: 'hotSearchLib' },
]

/** 詞庫二級模式 */
const libModeOptions = [
  { label: '指定詞', value: 'specific' },
  { label: '自動獲取排名', value: 'autoRank' },
]

/** 推廣類型 */
const promotionTypeOptions = [
  { label: '商家推廣', value: 'merchant' },
  { label: '活動推廣', value: 'activity' },
  { label: '熱搜推廣', value: 'hotSearch' },
]

/** 跳轉類型（按推廣類型動態過濾） */
const allJumpTypeOptions = [
  { label: '無跳轉', value: 'none' },
  { label: '商家頁', value: 'merchantPage' },
  { label: 'H5鏈接', value: 'h5' },
  { label: 'APP頁面', value: 'appPage' },
]

/** APP頁面 */
const appPageOptions = [
  { label: '個人中心', value: 'personalCenter' },
  { label: '簽到中心', value: 'checkInCenter' },
  { label: '領取中心', value: 'claimCenter' },
  { label: '訂單界面', value: 'orderPage' },
]

/** 展示模式 */
const displayModeOptions = [
  { label: '文字模式', value: 'text' },
  { label: '圖片模式', value: 'image' },
]

/** 常用表情 */
const emojiOptions = ['🔥', '⭐', '🎉', '🎊', '💥', '🆕', '👑', '🎁', '💰', '🏷️', '🍜', '🍕', '🍔', '🧋', '🍰', '☕']

/** 模擬詞庫數據 */
const mockLibWords = ['火鍋', '珍珠奶茶', '酸菜魚', '炸雞', '壽司', '拉麵', '麻辣燙', '烤鴨', '漢堡', '披薩', '咖喱飯', '三文魚']

/* ======================== Map ======================== */

const searchEntryMap: Record<string, string> = { home: '大首頁', takeaway: '外賣搜索', supermarket: '超市搜索', groupBuy: '團購搜索' }
const brandMap: Record<string, string> = { mFood: 'mFood', flashBee: '閃蜂' }
const terminalMap: Record<string, string> = { app: 'APP', wechatMini: '微信小程序', mpayMini: 'Mpay小應用', wechatH5: '微信H5' }
const regionMap: Record<string, string> = { macau: '澳門', taipa: '氹仔', zhuhai: '珠海市' }
const timeSlotMap: Record<string, string> = { allDay: '全天', breakfast: '早餐', lunch: '午餐', afternoonTea: '下午茶', dinner: '晚餐', midnightSnack: '宵夜' }
const crowdMap: Record<string, string> = { all: '全部', newUser: '新用戶', oldUser: '老用戶', vip: 'VIP用戶' }
const wordSourceMap: Record<string, string> = { custom: '自定義詞', hotSearchLib: '熱搜詞庫' }
const promotionTypeMap: Record<string, string> = { merchant: '商家推廣', activity: '活動推廣', hotSearch: '熱搜推廣' }
const jumpTypeMap: Record<string, string> = { none: '無跳轉', merchantPage: '商家頁', h5: 'H5鏈接', appPage: 'APP頁面' }
const displayModeMap: Record<string, string> = { text: '文字', image: '圖片' }

/* ======================== 接口 & Mock ======================== */

interface HotSearchRecord {
  key: string
  id: number
  word: string
  wordEn: string
  wordSource: string
  libMode: string
  hotSearchRank: number | null
  promotionType: string
  jumpType: string
  jumpTarget: string
  searchEntry: string
  brand: string
  terminal: string[]
  region: string[]
  timeSlot: string[]
  crowd: string
  displayMode: string
  displayTimeRange: [string, string] | null
  startDate: string
  endDate: string
  hasImage: boolean
  isPinned: boolean
  status: string
  updateTime: string
}

const mockData: HotSearchRecord[] = [
  { key: '1', id: 1, word: '🔥 限時火鍋優惠', wordEn: 'Hot Pot Deal', wordSource: 'custom', libMode: '', hotSearchRank: null, promotionType: 'activity', jumpType: 'h5', jumpTarget: 'https://example.com/hotpot', searchEntry: 'home', brand: 'mFood', terminal: ['app', 'wechatMini'], region: ['macau', 'taipa'], timeSlot: ['dinner'], crowd: 'all', displayMode: 'text', displayTimeRange: null, startDate: '2026-06-01', endDate: '2026-06-30', hasImage: false, isPinned: true, status: 'active', updateTime: '2026-06-05 10:00:00' },
  { key: '2', id: 2, word: '珍珠奶茶', wordEn: 'Bubble Tea', wordSource: 'hotSearchLib', libMode: 'specific', hotSearchRank: null, promotionType: 'hotSearch', jumpType: 'none', jumpTarget: '', searchEntry: 'home', brand: 'flashBee', terminal: ['app'], region: ['macau'], timeSlot: ['afternoonTea'], crowd: 'all', displayMode: 'text', displayTimeRange: null, startDate: '2026-06-01', endDate: '2026-12-31', hasImage: false, isPinned: false, status: 'active', updateTime: '2026-06-04 15:30:00' },
  { key: '3', id: 3, word: '🆕 美味漢堡', wordEn: 'Tasty Burger', wordSource: 'custom', libMode: '', hotSearchRank: null, promotionType: 'merchant', jumpType: 'merchantPage', jumpTarget: 'shop_10086', searchEntry: 'takeaway', brand: 'mFood', terminal: ['app', 'wechatMini', 'mpayMini'], region: ['macau', 'taipa'], timeSlot: ['lunch'], crowd: 'all', displayMode: 'text', displayTimeRange: null, startDate: '2026-06-10', endDate: '2026-06-20', hasImage: false, isPinned: true, status: 'active', updateTime: '2026-06-03 09:00:00' },
  { key: '4', id: 4, word: '炸雞', wordEn: 'Fried Chicken', wordSource: 'hotSearchLib', libMode: 'autoRank', hotSearchRank: 10, promotionType: 'hotSearch', jumpType: 'none', jumpTarget: '', searchEntry: 'home', brand: 'flashBee', terminal: ['app', 'wechatH5'], region: ['macau'], timeSlot: ['allDay'], crowd: 'all', displayMode: 'text', displayTimeRange: ['08:00', '14:00'], startDate: '2026-06-01', endDate: '2026-12-31', hasImage: false, isPinned: false, status: 'active', updateTime: '2026-06-02 14:00:00' },
  { key: '5', id: 5, word: '下午茶限時折扣', wordEn: 'Tea Time Sale', wordSource: 'custom', libMode: '', hotSearchRank: null, promotionType: 'activity', jumpType: 'appPage', jumpTarget: 'checkInCenter', searchEntry: 'takeaway', brand: 'mFood', terminal: ['app'], region: ['taipa'], timeSlot: ['afternoonTea'], crowd: 'vip', displayMode: 'image', displayTimeRange: null, startDate: '2026-06-05', endDate: '2026-06-25', hasImage: true, isPinned: false, status: 'inactive', updateTime: '2026-06-01 11:20:00' },
  { key: '6', id: 6, word: '壽司', wordEn: 'Sushi', wordSource: 'hotSearchLib', libMode: 'autoRank', hotSearchRank: 5, promotionType: 'merchant', jumpType: 'none', jumpTarget: '', searchEntry: 'home', brand: 'flashBee', terminal: ['app', 'wechatMini'], region: ['macau', 'taipa'], timeSlot: ['dinner'], crowd: 'all', displayMode: 'text', displayTimeRange: null, startDate: '2026-06-01', endDate: '2026-12-31', hasImage: false, isPinned: false, status: 'active', updateTime: '2026-05-30 16:45:00' },
]

/* ======================== 组件 ======================== */

export default function HotSearchConfig() {
  const navigate = useNavigate()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<HotSearchRecord | null>(null)
  const [form] = Form.useForm()
  const [wordSource, setWordSource] = useState<string>('custom')
  const [libMode, setLibMode] = useState<string>('specific')
  const [promotionType, setPromotionType] = useState<string>('merchant')
  const [jumpType, setJumpType] = useState<string>('none')
  const [displayMode, setDisplayMode] = useState<string>('text')
  const [timeSlots, setTimeSlots] = useState<string[]>(['allDay'])
  const [autoRankBusiness, setAutoRankBusiness] = useState<string[]>([])
  const [autoRankDays, setAutoRankDays] = useState<number>(30)
  const [autoRankTop, setAutoRankTop] = useState<number>(10)

  // 实时预览 watch
  const watchWord = Form.useWatch('word', form)
  const watchBorderColor = Form.useWatch('borderColor', form)
  const watchBgColor = Form.useWatch('bgColor', form)
  const watchFontColor = Form.useWatch('fontColor', form)

  /** 根据推广类型获取可用跳转选项 */
  const getJumpOptions = useCallback((promoType: string) => {
    if (promoType === 'merchant') {
      return allJumpTypeOptions.filter(o => ['none', 'merchantPage', 'h5'].includes(o.value))
    }
    // activity 和 hotSearch 支持所有跳转
    return allJumpTypeOptions
  }, [])

  /** 是否为自动获取排名模式（隐藏跳转配置） */
  const isAutoRank = wordSource === 'hotSearchLib' && libMode === 'autoRank'

  /** 时段互斥处理 */
  const handleTimeSlotChange = (checkedValues: (string | number | boolean)[]) => {
    const values = checkedValues as string[]
    const prev = timeSlots
    // 新选了「全天」
    if (values.includes('allDay') && !prev.includes('allDay')) {
      setTimeSlots(['allDay'])
      form.setFieldsValue({ timeSlot: ['allDay'] })
      return
    }
    // 取消了「全天」或选了具体时段
    const withoutAllDay = values.filter(v => v !== 'allDay')
    if (withoutAllDay.length === specificSlots.length) {
      // 全部具体时段都选了 → 自动切为全天
      setTimeSlots(['allDay'])
      form.setFieldsValue({ timeSlot: ['allDay'] })
      return
    }
    setTimeSlots(withoutAllDay.length > 0 ? withoutAllDay : ['allDay'])
    form.setFieldsValue({ timeSlot: withoutAllDay.length > 0 ? withoutAllDay : ['allDay'] })
  }

  /** 自动翻译（模拟） */
  const handleAutoTranslate = () => {
    const word = form.getFieldValue('word')
    if (!word) { message.warning('請先輸入熱搜詞'); return }
    // 模拟翻译
    const mockTranslations: Record<string, string> = {
      '火鍋': 'Hot Pot', '奶茶': 'Milk Tea', '炸雞': 'Fried Chicken',
      '壽司': 'Sushi', '拉麵': 'Ramen', '漢堡': 'Burger',
    }
    const translated = mockTranslations[word] || word.split('').map(() => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('').slice(0, 8)
    form.setFieldsValue({ wordEn: translated })
    message.success('翻譯完成')
  }

  /** 15条上限校验 */
  const checkSlotLimit = (brand: string, searchEntry: string, startDate: string, endDate: string): boolean => {
    const count = mockData.filter(d =>
      d.brand === brand && d.searchEntry === searchEntry &&
      d.startDate <= endDate && d.endDate >= startDate &&
      d.status === 'active'
    ).length
    if (editingRecord) {
      // 编辑模式排除自身
      const selfCount = mockData.filter(d =>
        d.key === editingRecord.key && d.brand === brand && d.searchEntry === searchEntry
      ).length
      return (count - selfCount) >= 15
    }
    return count >= 15
  }

  /* ==================== CRUD ==================== */

  const handleAdd = () => {
    setEditingRecord(null)
    setWordSource('custom')
    setLibMode('specific')
    setPromotionType('merchant')
    setJumpType('none')
    setDisplayMode('text')
    setTimeSlots(['allDay'])
    setAutoRankBusiness([])
    setAutoRankDays(30)
    setAutoRankTop(10)
    form.resetFields()
    form.setFieldsValue({
      wordSource: 'custom', libMode: 'specific', promotionType: 'merchant',
      searchEntry: 'home', status: 'active', timeSlot: ['allDay'], crowd: 'all',
      region: ['macau'], terminal: ['app'], jumpType: 'none', displayMode: 'text',
      borderColor: '#E8720C', bgColor: '#FFF7ED', fontColor: '#333333',
      displayTimeRange: null,
    })
    setIsModalOpen(true)
  }

  const handleEdit = (record: HotSearchRecord) => {
    setEditingRecord(record)
    setWordSource(record.wordSource)
    setLibMode(record.libMode || 'specific')
    setPromotionType(record.promotionType)
    setJumpType(record.jumpType || 'none')
    setDisplayMode(record.displayMode || 'text')
    setTimeSlots(record.timeSlot || ['allDay'])
    form.setFieldsValue(record)
    setIsModalOpen(true)
  }

  const handleDelete = (record: HotSearchRecord) => {
    Modal.confirm({
      title: '確認刪除',
      content: `確定要刪除熱搜詞「${record.word}」嗎？`,
      okText: '確定', cancelText: '取消',
      onOk: () => message.success('刪除成功'),
    })
  }

  const handleTogglePin = (record: HotSearchRecord) => {
    const newPinned = !record.isPinned
    message.success(newPinned ? `已將「${record.word}」置頂到「${searchEntryMap[record.searchEntry]}」搜索框頂部` : `已取消「${record.word}」的置頂`)
  }

  const handleSave = () => {
    form.validateFields().then((values) => {
      // 15条上限校验
      const dateRange = values.dateRange
      if (dateRange && values.brand && values.searchEntry) {
        const start = dateRange[0]?.format?.('YYYY-MM-DD') || ''
        const end = dateRange[1]?.format?.('YYYY-MM-DD') || ''
        if (checkSlotLimit(values.brand, values.searchEntry, start, end)) {
          Modal.warning({
            title: '已達上限',
            content: '該搜索入口在當前生效週期內已有15個熱搜詞，已達上限，無法新增。',
          })
          return
        }
      }
      message.success(editingRecord ? '編輯成功' : '新增成功')
      setIsModalOpen(false)
    })
  }

  /* ==================== 列配置 ==================== */

  const columnMeta = useMemo(() => [
    { key: 'word', title: '熱搜詞' },
    { key: 'wordEn', title: '英文詞' },
    { key: 'wordSource', title: '詞來源' },
    { key: 'promotionType', title: '推廣類型' },
    { key: 'searchEntry', title: '搜索入口' },
    { key: 'brand', title: '品牌' },
    { key: 'region', title: '展示區域' },
    { key: 'timeSlot', title: '時段' },
    { key: 'displayMode', title: '樣式配置' },
    { key: 'dateRange', title: '生效週期' },
    { key: 'isPinned', title: '置頂' },
    { key: 'status', title: '狀態' },
    { key: 'action', title: '操作' },
  ], [])

  const { configComponent, applyConfig } = useColumnConfig('hot-search-config', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  const columns: TableColumnsType<HotSearchRecord> = [
    { title: '熱搜詞', dataIndex: 'word', key: 'word', width: 140, fixed: 'left' },
    { title: '英文詞', dataIndex: 'wordEn', key: 'wordEn', width: 100, render: (v: string) => v || '-' },
    { title: '詞來源', dataIndex: 'wordSource', key: 'wordSource', width: 90,
      render: (v: string, r: HotSearchRecord) => (
        <Tag color={v === 'hotSearchLib' ? 'orange' : 'blue'}>
          {wordSourceMap[v]}{v === 'hotSearchLib' && r.libMode === 'autoRank' ? `(前${r.hotSearchRank})` : ''}
        </Tag>
      ),
    },
    { title: '推廣類型', dataIndex: 'promotionType', key: 'promotionType', width: 90, render: (v: string) => <Tag color={v === 'merchant' ? 'blue' : v === 'activity' ? 'orange' : 'green'}>{promotionTypeMap[v]}</Tag> },
    { title: '搜索入口', dataIndex: 'searchEntry', key: 'searchEntry', width: 90, render: (v: string) => searchEntryMap[v] },
    { title: '品牌', dataIndex: 'brand', key: 'brand', width: 70, render: (v: string) => brandMap[v] },
    { title: '展示區域', dataIndex: 'region', key: 'region', width: 100, render: (v: string[]) => v.map(r => regionMap[r]).join('、') },
    { title: '時段', dataIndex: 'timeSlot', key: 'timeSlot', width: 100, render: (v: string[]) => v.map(t => timeSlotMap[t]).join('、') },
    { title: '樣式配置', dataIndex: 'displayMode', key: 'displayMode', width: 80, render: (v: string) => <Tag color={v === 'image' ? 'purple' : 'cyan'}>{displayModeMap[v] || '文字'}</Tag> },
    { title: '生效週期', key: 'dateRange', width: 170, render: (_: unknown, r: HotSearchRecord) => `${r.startDate} ~ ${r.endDate}` },
    { title: '置頂', dataIndex: 'isPinned', key: 'isPinned', width: 60, align: 'center',
      render: (v: boolean, record: HotSearchRecord) => (
        <span
          style={{ cursor: 'pointer', fontSize: 16, color: v ? '#E8720C' : '#D9D9D9' }}
          onClick={() => handleTogglePin(record)}
          title={v ? '取消置頂' : '置頂到該搜索框頂部'}
        >
          {v ? <PushpinFilled /> : <PushpinOutlined />}
        </span>
      ),
    },
    { title: '狀態', dataIndex: 'status', key: 'status', width: 65, render: (v: string) => v === 'active' ? <Tag color="green">啟用</Tag> : <Tag color="default">停用</Tag> },
    {
      title: '操作', key: 'action', width: 110, fixed: 'right',
      render: (_: unknown, record: HotSearchRecord) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => handleEdit(record)}>編輯</Button>
          <Button type="link" size="small" danger onClick={() => handleDelete(record)}>刪除</Button>
        </Space>
      ),
    },
  ]

  /* ==================== 预览颜色处理 ==================== */
  const previewBorderColor = typeof watchBorderColor === 'string' ? watchBorderColor : watchBorderColor?.toHexString?.() || '#E8720C'
  const previewBgColor = typeof watchBgColor === 'string' ? watchBgColor : watchBgColor?.toHexString?.() || '#FFF7ED'
  const previewFontColor = typeof watchFontColor === 'string' ? watchFontColor : watchFontColor?.toHexString?.() || '#333333'
  const previewWord = watchWord || '熱搜詞預覽'

  /* ==================== 渲染 ==================== */

  return (
    <div className="content-area">
      {/* 查询区域 */}
      <div className="search-section">
        <Form layout="inline">
          <Form.Item label="熱搜詞">
            <Input placeholder="請輸入熱搜詞" allowClear style={{ width: 140 }} />
          </Form.Item>
          <Form.Item label="詞來源">
            <Select placeholder="請選擇" allowClear options={wordSourceOptions} style={{ width: 140 }} />
          </Form.Item>
          <Form.Item label="推廣類型">
            <Select placeholder="請選擇" allowClear options={promotionTypeOptions} style={{ width: 140 }} />
          </Form.Item>
          <Form.Item label="搜索入口">
            <Select placeholder="請選擇" allowClear options={searchEntryOptions} style={{ width: 140 }} />
          </Form.Item>
          <Form.Item label="所屬品牌">
            <Select placeholder="請選擇" allowClear options={brandOptions} style={{ width: 140 }} />
          </Form.Item>
          <Form.Item label="展示區域">
            <Select placeholder="請選擇" allowClear options={regionOptions} style={{ width: 140 }} />
          </Form.Item>
          <Form.Item label="狀態">
            <Select placeholder="請選擇" allowClear options={[{ label: '啟用', value: 'active' }, { label: '停用', value: 'inactive' }]} style={{ width: 140 }} />
          </Form.Item>
          <Form.Item label="是否置頂">
            <Select placeholder="請選擇" allowClear options={[{ label: '已置頂', value: 'pinned' }, { label: '未置頂', value: 'notPinned' }]} style={{ width: 140 }} />
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
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新增熱搜詞</Button>
          <Button icon={<EyeOutlined />} onClick={() => navigate('/hot-search-preview')}>效果預覽</Button>
        </Space>
        {configComponent}
      </div>

      {/* 列表区域 */}
      <div className="table-section">
        <Table<HotSearchRecord>
          columns={applyConfig(columns)}
          dataSource={mockData}
          rowSelection={{}}
          pagination={{
            total: mockData.length,
            pageSize: 10,
            showTotal: (total) => `共 ${total} 條`,
            showSizeChanger: true,
          }}
          size="middle"
          bordered={false}
          scroll={{ x: 1800 }}
        />
      </div>

      {/* ==================== 新增/编辑弹窗 ==================== */}
      <Modal
        title={editingRecord ? '編輯熱搜詞' : '新增熱搜詞'}
        open={isModalOpen}
        onOk={handleSave}
        onCancel={() => setIsModalOpen(false)}
        okText="確定"
        cancelText="取消"
        width={760}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>

          {/* ===== 行1：搜索入口 + 所属品牌 + 展示终端（置顶） ===== */}
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item label="搜索入口" name="searchEntry" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Select options={searchEntryOptions} onChange={(v) => {
                // 非大首页时，自动同步业务频道
                if (v !== 'home' && wordSource === 'hotSearchLib' && libMode === 'autoRank') {
                  setAutoRankBusiness([v])
                }
              }} />
            </Form.Item>
            <Form.Item label="所屬品牌" name="brand" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Select options={brandOptions.filter(o => o.value !== 'all')} />
            </Form.Item>
            <Form.Item label="展示終端" name="terminal" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Select mode="multiple" options={terminalOptions} placeholder="請選擇" />
            </Form.Item>
          </div>

          {/* ===== 行2：展示模式 + 词来源 + 推广类型 ===== */}
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item label="展示模式" name="displayMode" style={{ flex: 1 }}>
              <Radio.Group options={displayModeOptions} optionType="button" buttonStyle="solid"
                onChange={(e) => setDisplayMode(e.target.value)} />
            </Form.Item>
            <Form.Item label="詞來源" name="wordSource" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Select options={wordSourceOptions} onChange={(v) => {
                setWordSource(v)
                if (v === 'custom') {
                  setLibMode('specific'); form.setFieldsValue({ libMode: 'specific' })
                }
                if (v === 'hotSearchLib' && libMode === 'autoRank') {
                  setPromotionType('hotSearch'); form.setFieldsValue({ promotionType: 'hotSearch' })
                }
              }} />
            </Form.Item>
            <Form.Item label="推廣類型" name="promotionType" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Select
                options={isAutoRank
                  ? promotionTypeOptions.filter(o => o.value === 'hotSearch')
                  : promotionTypeOptions
                }
                onChange={(v) => {
                  setPromotionType(v)
                  if (v === 'merchant' && jumpType === 'appPage') {
                    setJumpType('none'); form.setFieldsValue({ jumpType: 'none' })
                  }
                }}
              />
            </Form.Item>
          </div>

          {wordSource === 'hotSearchLib' && (
            <Form.Item label="詞庫模式" name="libMode" rules={[{ required: true }]}>
              <Select options={libModeOptions} onChange={(v) => {
                setLibMode(v)
                if (v === 'autoRank') {
                  setJumpType('none'); form.setFieldsValue({ jumpType: 'none' })
                  setPromotionType('hotSearch'); form.setFieldsValue({ promotionType: 'hotSearch' })
                }
              }} />
            </Form.Item>
          )}

          {/* ===== 热搜词输入（根据词来源和模式动态展示） ===== */}
          {wordSource === 'custom' && (
            <>
              <Form.Item label="熱搜詞" name="word" rules={[{ required: true, message: '請輸入熱搜詞' }]}>
                <Input placeholder="請輸入熱搜詞" maxLength={15} showCount />
              </Form.Item>
              {displayMode === 'text' && (
                <Form.Item label="表情選擇">
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {emojiOptions.map(emoji => (
                      <span
                        key={emoji}
                        style={{ fontSize: 22, cursor: 'pointer', padding: '4px 6px', borderRadius: 4, border: '1px solid #F0F0F0' }}
                        onClick={() => {
                          const current = form.getFieldValue('word') || ''
                          form.setFieldsValue({ word: current + emoji })
                        }}
                      >
                        {emoji}
                      </span>
                    ))}
                  </div>
                </Form.Item>
              )}
            </>
          )}

          {wordSource === 'hotSearchLib' && libMode === 'specific' && (
            <Form.Item label="選擇熱搜詞" name="word" rules={[{ required: true, message: '請從詞庫選擇' }]}>
              <Select
                showSearch
                placeholder="搜索並選擇熱搜詞"
                options={mockLibWords.map(w => ({ label: w, value: w }))}
                filterOption={(input, option) => (option?.label ?? '').includes(input)}
              />
            </Form.Item>
          )}

          {/* ===== 自动获取排名（输入框模式） ===== */}
          {wordSource === 'hotSearchLib' && libMode === 'autoRank' && (
            <div style={{ background: '#FFF7ED', borderRadius: 8, padding: 16, marginBottom: 16 }}>
              <Form.Item label="業務頻道" name="autoRankBusiness" rules={[{ required: true, message: '請選擇業務頻道' }]}>
                <Select
                  mode={form.getFieldValue('searchEntry') === 'home' ? 'multiple' : undefined}
                  options={searchEntryOptions}
                  placeholder="請選擇業務頻道"
                  value={autoRankBusiness}
                  onChange={(v) => {
                    const val = Array.isArray(v) ? v : [v]
                    setAutoRankBusiness(val)
                  }}
                  disabled={form.getFieldValue('searchEntry') !== 'home'}
                />
                <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
                  {form.getFieldValue('searchEntry') === 'home'
                    ? '大首頁模式支持多選業務頻道'
                    : '跟隨搜索入口所選業務頻道，不可修改'
                  }
                </div>
              </Form.Item>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 14, color: '#333' }}>自動獲取近</span>
                <InputNumber
                  min={1} max={90} value={autoRankDays}
                  onChange={(v) => setAutoRankDays(v || 30)}
                  style={{ width: 70 }}
                  size="small"
                />
                <span style={{ fontSize: 14, color: '#333' }}>天的熱搜詞排名，只取排名前</span>
                <InputNumber
                  min={1} max={50} value={autoRankTop}
                  onChange={(v) => setAutoRankTop(v || 10)}
                  style={{ width: 70 }}
                  size="small"
                />
                <span style={{ fontSize: 14, color: '#333' }}>的詞</span>
              </div>
              <div style={{ fontSize: 12, color: '#E8720C', marginTop: 8 }}>
                ⚠️ 自動獲取排名模式下，熱搜詞為實時動態更新，無法配置跳轉鏈接，推廣類型僅支持「熱搜推廣」
              </div>
            </div>
          )}

          {/* ===== 英文字段（非自动排名 + 文字模式） ===== */}
          {displayMode === 'text' && !isAutoRank && (
            <Form.Item label="英文熱搜詞" name="wordEn">
              <div style={{ display: 'flex', gap: 8 }}>
                <Input placeholder="請輸入英文熱搜詞" style={{ flex: 1 }} />
                <Button icon={<TranslationOutlined />} onClick={handleAutoTranslate}>自動翻譯</Button>
              </div>
            </Form.Item>
          )}
          {displayMode === 'text' && isAutoRank && (
            <Form.Item label="英文熱搜詞" name="wordEn">
              <Input placeholder="將自動翻譯實時更新的熱搜詞" disabled suffix={<span style={{ color: '#999', fontSize: 12 }}>自動翻譯</span>} />
            </Form.Item>
          )}

          {/* ===== 图片上传（图片模式） ===== */}
          {displayMode === 'image' && (
            <>
              <Form.Item label="熱搜詞圖片（中文）" name="image">
                <Upload
                  listType="picture-card"
                  maxCount={1}
                  accept=".jpeg,.jpg,.png,.gif,.webp"
                  beforeUpload={(file) => {
                    if (file.size > 10 * 1024 * 1024) { message.error('圖片大小不能超過10MB'); return false }
                    return false
                  }}
                >
                  <div style={{ textAlign: 'center' }}>
                    <UploadOutlined />
                    <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>300×100</div>
                  </div>
                </Upload>
                <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
                  圖片尺寸：寬度300 × 高度100，支持jpeg/jpg/png/gif/webp格式，10MB以內
                </div>
              </Form.Item>
              <Form.Item label="熱搜詞圖片（英文，非必傳）" name="imageEn">
                <Upload
                  listType="picture-card"
                  maxCount={1}
                  accept=".jpeg,.jpg,.png,.gif,.webp"
                  beforeUpload={(file) => {
                    if (file.size > 10 * 1024 * 1024) { message.error('圖片大小不能超過10MB'); return false }
                    return false
                  }}
                >
                  <div style={{ textAlign: 'center' }}>
                    <UploadOutlined />
                    <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>EN 300×100</div>
                  </div>
                </Upload>
              </Form.Item>
            </>
          )}

          {/* ===== 跳转配置（自动获取排名时隐藏） ===== */}
          {isAutoRank ? null : (
            <div style={{ background: '#FAFAFA', borderRadius: 8, padding: 16, marginBottom: 16 }}>
              <h4 style={{ marginBottom: 12, fontSize: 14 }}>跳轉配置</h4>
              <div style={{ display: 'flex', gap: 16 }}>
                <Form.Item label="跳轉類型" name="jumpType" style={{ flex: 1 }}>
                  <Select options={getJumpOptions(promotionType)} onChange={(v) => setJumpType(v)} />
                </Form.Item>
                {jumpType === 'merchantPage' && (
                  <Form.Item label="商家ID" name="jumpTarget" rules={[{ required: true, message: '請輸入商家ID' }]} style={{ flex: 1 }}>
                    <Input placeholder="請輸入商家ID或搜索商家" />
                  </Form.Item>
                )}
                {jumpType === 'h5' && (
                  <Form.Item label="H5鏈接" name="jumpTarget" rules={[{ required: true, message: '請輸入H5鏈接' }]} style={{ flex: 1 }}>
                    <Input placeholder="請輸入H5鏈接地址" />
                  </Form.Item>
                )}
                {jumpType === 'appPage' && (
                  <Form.Item label="APP頁面" name="jumpTarget" rules={[{ required: true, message: '請選擇APP頁面' }]} style={{ flex: 1 }}>
                    <Select options={appPageOptions} placeholder="請選擇APP頁面" />
                  </Form.Item>
                )}
              </div>
            </div>
          )}

          {/* ===== 展示区域 + 人群 ===== */}
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item label="展示區域" name="region" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Select mode="multiple" options={regionOptions.filter(o => o.value !== 'all')} />
            </Form.Item>
            <Form.Item label="配置人群" name="crowd" style={{ flex: 1 }}>
              <Select options={crowdOptions} />
            </Form.Item>
          </div>

          {/* ===== 展示时段（多选 + 互斥） ===== */}
          <Form.Item label="展示時段" name="timeSlot" rules={[{ required: true, message: '請選擇展示時段' }]}>
            <Checkbox.Group
              onChange={handleTimeSlotChange}
              style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}
            >
              {timeSlotOptions.map(opt => (
                <Checkbox key={opt.value} value={opt.value}>{opt.label}</Checkbox>
              ))}
            </Checkbox.Group>
          </Form.Item>

          {/* ===== 展示時間段配置 ===== */}
          <Form.Item label="展示時間段配置" name="displayTimeRange">
            <TimeRangePicker
              format="HH:mm"
              style={{ width: '100%' }}
              placeholder={['開始時間', '結束時間']}
            />
            <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
              選填，配置熱搜詞在生效日期內的具體展示時間範圍（如 08:00 - 14:00）
            </div>
          </Form.Item>

          {/* ===== 生效日期 + 状态 ===== */}
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item label="生效日期" name="dateRange" rules={[{ required: true, message: '請選擇生效日期' }]} style={{ flex: 2 }}>
              <RangePicker format="YYYY-MM-DD" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="狀態" name="status" style={{ flex: 1 }}>
              <Select options={[{ label: '啟用', value: 'active' }, { label: '停用', value: 'inactive' }]} />
            </Form.Item>
          </div>

          {/* ===== 样式配置 + 预览（仅 词来源=自定义词 + 文字模式） ===== */}
          {wordSource === 'custom' && displayMode === 'text' && (
            <div style={{ background: '#FAFAFA', borderRadius: 8, padding: 16, marginBottom: 16 }}>
              <h4 style={{ marginBottom: 12, fontSize: 14 }}>樣式配置</h4>
              <div style={{ display: 'flex', gap: 16 }}>
                <Form.Item label="邊框顏色" name="borderColor">
                  <ColorPicker />
                </Form.Item>
                <Form.Item label="背景顏色" name="bgColor">
                  <ColorPicker />
                </Form.Item>
                <Form.Item label="字體顏色" name="fontColor">
                  <ColorPicker />
                </Form.Item>
              </div>
              {/* 实时预览 - 单场景 */}
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 13, color: '#666', marginBottom: 8 }}>📱 展示預覽</div>
                <div style={{ background: '#FFF', borderRadius: 8, padding: 12 }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '6px 14px', borderRadius: 16,
                      border: `2px solid ${previewBorderColor}`,
                      background: previewBgColor, color: previewFontColor, fontSize: 14,
                    }}>
                      <FireOutlined style={{ color: previewBorderColor }} /> {previewWord}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </Form>
      </Modal>
    </div>
  )
}
