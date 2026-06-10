import { useState , useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Space, Input, Select, Table, Tag, Modal, Form, DatePicker, ColorPicker, Upload, InputNumber, Switch, message } from 'antd'
import type { TableColumnsType } from 'antd'
import {
  SearchOutlined,
  ReloadOutlined,
  PlusOutlined,
  UploadOutlined,
  EyeOutlined,
} from '@ant-design/icons'
import { useColumnConfig } from '../../hooks/useColumnConfig'

const { RangePicker } = DatePicker

/** 搜索界面 */
const searchPageOptions = [
  { label: '大首頁', value: 'home' },
  { label: '外賣頁', value: 'takeaway' },
  { label: '團購頁', value: 'groupBuy' },
  { label: '超市頁', value: 'supermarket' },
]

/** 搜索频道 */
const searchChannelOptions = [
  { label: '大首頁', value: 'home' },
  { label: '外賣頻道', value: 'takeaway' },
  { label: '團購頻道', value: 'groupBuy' },
  { label: '超市頻道', value: 'supermarket' },
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

/** 區域 */
const regionOptions = [
  { label: '全部', value: 'all' },
  { label: '澳門', value: 'macau' },
  { label: '氹仔', value: 'taipa' },
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

/** 人群 */
const crowdOptions = [
  { label: '全部', value: 'all' },
  { label: '新用戶', value: 'newUser' },
  { label: '老用戶', value: 'oldUser' },
  { label: 'VIP用戶', value: 'vip' },
]

/** 熱搜詞來源 */
const hotSearchTypeOptions = [
  { label: '熱搜詞庫', value: 'hotSearchLib' },
  { label: '自定義詞', value: 'custom' },
]

/** 推廣類型 */
const promotionTypeOptions = [
  { label: '活動推廣', value: 'activity' },
  { label: '商家推廣', value: 'merchant' },
  { label: '運營推廣', value: 'operation' },
]

/** 熱搜詞庫排名 */
const hotSearchRankOptions = [
  { label: '前5', value: 5 },
  { label: '前10', value: 10 },
]

/** 常用表情 */
const emojiOptions = ['🔥', '⭐', '🎉', '🎊', '💥', '🆕', '👑', '🎁', '💰', '🏷️', '🍜', '🍕', '🍔', '🧋', '🍰', '☕']

interface HotSearchRecord {
  key: string
  id: number
  word: string
  wordSource: string
  promotionType: string
  searchPage: string
  searchChannel: string
  brand: string
  terminal: string[]
  region: string[]
  timeSlot: string
  crowd: string
  startDate: string
  endDate: string
  hasImage: boolean
  isSold: boolean
  status: string
  updateTime: string
}

const mockData: HotSearchRecord[] = [
  { key: '1', id: 1, word: ' 限時火鍋優惠', wordSource: 'custom', promotionType: 'activity', searchPage: 'home', searchChannel: 'home', brand: 'mFood', terminal: ['app', 'wechatMini'], region: ['macau', 'taipa'], timeSlot: 'dinner', crowd: 'all', startDate: '2026-06-01', endDate: '2026-06-30', hasImage: true, isSold: false, status: 'active', updateTime: '2026-06-05 10:00:00' },
  { key: '2', id: 2, word: '珍珠奶茶', wordSource: 'hotSearchLib', promotionType: 'operation', searchPage: 'home', searchChannel: 'home', brand: 'flashBee', terminal: ['app'], region: ['macau'], timeSlot: 'afternoonTea', crowd: 'all', startDate: '2026-06-01', endDate: '2026-12-31', hasImage: false, isSold: false, status: 'active', updateTime: '2026-06-04 15:30:00' },
  { key: '3', id: 3, word: '🆕 美味漢堡', wordSource: 'custom', promotionType: 'merchant', searchPage: 'takeaway', searchChannel: 'takeaway', brand: 'mFood', terminal: ['app', 'wechatMini', 'mpayMini'], region: ['macau', 'taipa'], timeSlot: 'lunch', crowd: 'all', startDate: '2026-06-10', endDate: '2026-06-20', hasImage: true, isSold: true, status: 'active', updateTime: '2026-06-03 09:00:00' },
  { key: '4', id: 4, word: '炸雞', wordSource: 'hotSearchLib', promotionType: 'operation', searchPage: 'home', searchChannel: 'home', brand: 'flashBee', terminal: ['app', 'wechatH5'], region: ['macau'], timeSlot: 'allDay', crowd: 'all', startDate: '2026-06-01', endDate: '2026-12-31', hasImage: false, isSold: false, status: 'active', updateTime: '2026-06-02 14:00:00' },
  { key: '5', id: 5, word: ' 下午茶限時折扣', wordSource: 'custom', promotionType: 'activity', searchPage: 'takeaway', searchChannel: 'takeaway', brand: 'mFood', terminal: ['app'], region: ['taipa'], timeSlot: 'afternoonTea', crowd: 'vip', startDate: '2026-06-05', endDate: '2026-06-25', hasImage: false, isSold: false, status: 'inactive', updateTime: '2026-06-01 11:20:00' },
  { key: '6', id: 6, word: '壽司', wordSource: 'hotSearchLib', promotionType: 'merchant', searchPage: 'home', searchChannel: 'home', brand: 'flashBee', terminal: ['app', 'wechatMini'], region: ['macau', 'taipa'], timeSlot: 'dinner', crowd: 'all', startDate: '2026-06-01', endDate: '2026-12-31', hasImage: false, isSold: true, status: 'active', updateTime: '2026-05-30 16:45:00' },
]

const pageMap: Record<string, string> = { home: '大首頁', takeaway: '外賣頁', groupBuy: '團購頁', supermarket: '超市頁' }
const channelMap: Record<string, string> = { home: '大首頁', takeaway: '外賣頻道', groupBuy: '團購頻道', supermarket: '超市頻道' }
const brandMap: Record<string, string> = { mFood: 'mFood', flashBee: '閃蜂' }
const terminalMap: Record<string, string> = { app: 'APP', wechatMini: '微信小程序', mpayMini: 'Mpay小應用', wechatH5: '微信H5' }
const regionMap: Record<string, string> = { macau: '澳門', taipa: '氹仔' }
const timeSlotMap: Record<string, string> = { allDay: '全天', breakfast: '早餐', lunch: '午餐', afternoonTea: '下午茶', dinner: '晚餐', midnightSnack: '宵夜' }
const crowdMap: Record<string, string> = { all: '全部', newUser: '新用戶', oldUser: '老用戶', vip: 'VIP用戶' }
const wordSourceMap: Record<string, string> = { hotSearchLib: '熱搜詞庫', custom: '自定義詞' }
const promotionTypeMap: Record<string, string> = { activity: '活動推廣', merchant: '商家推廣', operation: '運營推廣' }

export default function HotSearchConfig() {
  const navigate = useNavigate()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<HotSearchRecord | null>(null)
  const [wordSource, setWordSource] = useState<string>('custom')
  const [form] = Form.useForm()

  const handleAdd = () => {
    setEditingRecord(null)
    setWordSource('custom')
    form.resetFields()
    form.setFieldsValue({
      wordSource: 'custom', promotionType: 'operation', searchPage: 'home',
      status: 'active', timeSlot: 'allDay', crowd: 'all',
      region: ['macau'], terminal: ['app'],
      borderColor: '#E8720C', bgColor: '#FFF7ED', fontColor: '#333333',
      isSold: false, hasImage: false,
    })
    setIsModalOpen(true)
  }

  const handleEdit = (record: HotSearchRecord) => {
    setEditingRecord(record)
    setWordSource(record.wordSource)
    form.setFieldsValue(record)
    setIsModalOpen(true)
  }

  const handleDelete = (record: HotSearchRecord) => {
    Modal.confirm({
      title: '確認刪除',
      content: `確定要刪除熱搜詞「${record.word}」嗎？`,
      okText: '確定',
      cancelText: '取消',
      onOk: () => message.success('刪除成功'),
    })
  }

  const handleSave = () => {
    form.validateFields().then(() => {
      message.success(editingRecord ? '編輯成功' : '新增成功')
      setIsModalOpen(false)
    })
  }
  /** 列配置元数据 */
  const columnMeta = useMemo(() => [
    { key: 'hotId', title: '熱搜ID' },
    { key: 'brand', title: '所屬品牌' },
    { key: 'searchChannel', title: '搜索頻道' },
    { key: 'region', title: '地區' },
    { key: 'terminal', title: '終端' },
    { key: 'effectStartDate', title: '生效開始日' },
    { key: 'effectEndDate', title: '生效結束日' },
    { key: 'lastUpdater', title: '最後更新人' },
    { key: 'lastUpdateTime', title: '最後更新時間' },
    { key: 'status', title: '狀態' },
    { key: 'action', title: '操作' },
  ], [])

  const { configComponent, applyConfig } = useColumnConfig('hot-search-config', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const }
  ])

  

  const columns: TableColumnsType<HotSearchRecord> = [
    { title: '熱搜詞', dataIndex: 'word', key: 'word', width: 160 },
    { title: '詞來源', dataIndex: 'wordSource', key: 'wordSource', width: 100, render: (v: string) => <Tag color={v === 'hotSearchLib' ? 'orange' : 'blue'}>{wordSourceMap[v]}</Tag> },
    { title: '推廣類型', dataIndex: 'promotionType', key: 'promotionType', width: 100, render: (v: string) => promotionTypeMap[v] },
    { title: '搜索频道', dataIndex: 'searchChannel', key: 'searchChannel', width: 100, render: (v: string) => channelMap[v] },
    { title: '品牌', dataIndex: 'brand', key: 'brand', width: 80, render: (v: string) => brandMap[v] },
    { title: '終端', dataIndex: 'terminal', key: 'terminal', width: 160, render: (v: string[]) => v.map(t => terminalMap[t]).join('、') },
    { title: '區域', dataIndex: 'region', key: 'region', width: 100, render: (v: string[]) => v.map(r => regionMap[r]).join('、') },
    { title: '時段', dataIndex: 'timeSlot', key: 'timeSlot', width: 80, render: (v: string) => timeSlotMap[v] },
    { title: '生效週期', key: 'dateRange', width: 180, render: (_, r) => `${r.startDate} ~ ${r.endDate}` },
    { title: '圖片', dataIndex: 'hasImage', key: 'hasImage', width: 60, render: (v: boolean) => v ? <Tag color="green">有</Tag> : <Tag>無</Tag> },
    { title: '售賣', dataIndex: 'isSold', key: 'isSold', width: 60, render: (v: boolean) => v ? <Tag color="gold">已售</Tag> : <Tag>未售</Tag> },
    { title: '狀態', dataIndex: 'status', key: 'status', width: 70, render: (v: string) => v === 'active' ? <Tag color="green">啟用</Tag> : <Tag color="default">停用</Tag> },
    {
      title: '操作',
      key: 'action',
      width: 200,
      render: (_, record) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => handleEdit(record)}>編輯</Button>
          <Button type="link" size="small" danger onClick={() => handleDelete(record)}>刪除</Button>
          <Button type="link" size="small" onClick={() => navigate('/hot-search-preview')}>效果預覽</Button>
        </Space>
      ),
    },
  ]

  return (
    <div className="content-area">
      {/* 查询区域 */}
      <div className="search-section">
        <Form layout="inline">
          <Form.Item label="熱搜詞">
            <Input placeholder="請輸入熱搜詞" allowClear />
          </Form.Item>
          <Form.Item label="詞來源">
            <Select placeholder="請選擇" options={hotSearchTypeOptions} />
          </Form.Item>
          <Form.Item label="推广類型">
            <Select placeholder="請選擇" options={promotionTypeOptions} />
          </Form.Item>
          <Form.Item label="搜索频道">
            <Select placeholder="請選擇" options={searchChannelOptions} />
          </Form.Item>
          <Form.Item label="所屬品牌">
            <Select placeholder="請選擇" options={brandOptions} />
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
          pagination={{
            total: mockData.length,
            pageSize: 10,
            showTotal: (total) => `共 ${total} 條`,
            showSizeChanger: true,
          }}
          size="middle"
          bordered={false}
          scroll={{ x: 1600 }}
        />
      </div>

      {/* 新增/编辑弹窗 */}
      <Modal
        title={editingRecord ? '編輯熱搜詞' : '新增熱搜詞'}
        open={isModalOpen}
        onOk={handleSave}
        onCancel={() => setIsModalOpen(false)}
        okText="確定"
        cancelText="取消"
        width={720}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Space size={24} style={{ width: '100%' }}>
            <Form.Item label="詞來源" name="wordSource" rules={[{ required: true }]}>
              <Select options={hotSearchTypeOptions} onChange={(v) => setWordSource(v)} />
            </Form.Item>
            <Form.Item label="推廣類型" name="promotionType" rules={[{ required: true }]}>
              <Select options={promotionTypeOptions} />
            </Form.Item>
          </Space>

          {wordSource === 'custom' ? (
            <Form.Item label="熱搜詞" name="word" rules={[{ required: true, message: '請輸入熱搜詞' }]}>
              <Input placeholder="請輸入熱搜詞" maxLength={20} showCount />
            </Form.Item>
          ) : (
            <Form.Item label="熱搜詞排名" name="hotSearchRank" rules={[{ required: true }]}>
              <Select options={hotSearchRankOptions} placeholder="獲取近30天熱搜詞排名" />
            </Form.Item>
          )}

          {/* 表情选择 */}
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

          <Space size={24} style={{ width: '100%' }}>
            <Form.Item label="搜索界面" name="searchPage" rules={[{ required: true }]}>
              <Select options={searchPageOptions} />
            </Form.Item>
            <Form.Item label="所屬品牌" name="brand" rules={[{ required: true }]}>
              <Select options={brandOptions.filter(o => o.value !== 'all')} />
            </Form.Item>
          </Space>

          <Form.Item label="展示終端" name="terminal" rules={[{ required: true }]}>
            <Select mode="multiple" options={terminalOptions} placeholder="請選擇展示終端" />
          </Form.Item>

          <Space size={24}>
            <Form.Item label="展示區域" name="region" rules={[{ required: true }]}>
              <Select mode="multiple" options={regionOptions.filter(o => o.value !== 'all')} />
            </Form.Item>
            <Form.Item label="展示時段" name="timeSlot" rules={[{ required: true }]}>
              <Select options={timeSlotOptions} />
            </Form.Item>
          </Space>

          <Space size={24}>
            <Form.Item label="配置人群" name="crowd">
              <Select options={crowdOptions} />
            </Form.Item>
            <Form.Item label="是否售賣" name="isSold" valuePropName="checked">
              <Switch checkedChildren="是" unCheckedChildren="否" />
            </Form.Item>
            <Form.Item label="狀態" name="status">
              <Select options={[{ label: '啟用', value: 'active' }, { label: '停用', value: 'inactive' }]} />
            </Form.Item>
          </Space>

          <Form.Item label="生效日期" name="dateRange" rules={[{ required: true, message: '請選擇生效日期' }]}>
            <RangePicker style={{ width: '100%' }} />
          </Form.Item>

          {/* 图片上传 */}
          <Form.Item label="熱搜詞圖片" name="image">
            <Upload
              listType="picture-card"
              maxCount={1}
              accept=".jpeg,.jpg,.png,.gif,.webp"
              beforeUpload={() => false}
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

          {/* 样式配置 */}
          <div style={{ background: '#FAFAFA', borderRadius: 8, padding: 16, marginBottom: 16 }}>
            <h4 style={{ marginBottom: 12 }}>樣式配置</h4>
            <Space size={24}>
              <Form.Item label="邊框顏色" name="borderColor">
                <ColorPicker />
              </Form.Item>
              <Form.Item label="背景顏色" name="bgColor">
                <ColorPicker />
              </Form.Item>
              <Form.Item label="字體顏色" name="fontColor">
                <ColorPicker />
              </Form.Item>
            </Space>
            {/* 预览效果 */}
            <div style={{ marginTop: 8 }}>
              <span style={{ fontSize: 13, color: '#666' }}>預覽效果：</span>
              <span style={{
                display: 'inline-block', marginTop: 8, padding: '6px 16px', borderRadius: 16,
                border: '2px solid #E8720C', background: '#FFF7ED', color: '#333333', fontSize: 14,
              }}>
                🔥 限時火鍋優惠
              </span>
            </div>
          </div>
        </Form>
      </Modal>
    </div>
  )
}
