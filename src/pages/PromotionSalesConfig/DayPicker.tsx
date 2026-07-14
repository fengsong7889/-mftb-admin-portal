import { useState, useMemo, useEffect } from 'react'
import { Tag, Button, Space, Divider, message, Table, Empty, Modal, Select, Card, Form, Input, DatePicker } from 'antd'
import { ShoppingCartOutlined, CalendarOutlined, DeleteOutlined, SearchOutlined, ReloadOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import type { InventoryItem } from './types'
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'

// Mock 梯度折扣配置
const mockGradients = [
  { minDays: 3, discount: 95 },
  { minDays: 7, discount: 90 },
  { minDays: 14, discount: 85 },
  { minDays: 30, discount: 80 },
]

// 中文星期映射
const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六']

// Mock: 部分日期已售罄
const SOLD_OUT_DATES = ['2025-07-08', '2025-07-12', '2025-07-15', '2025-07-20', '2025-07-25']

/** 购物车项 */
interface CartItem {
  key: string
  dates: string[]
  days: number
  originalPrice: number
  discount: number
  salePrice: number
  lockTime: number
}

/** 购物车展平行 */
interface CartRow {
  key: string
  date: string
  cartKey: string
  salePrice: number
  lockTime: number
}

interface DayPickerProps {
  inventoryItem: InventoryItem
}

/** 算法 → 品牌映射（选择算法后自动带出品牌） */
const ALGORITHM_BRAND_MAP: Record<string, string> = {
  hot_revive: 'shanfeng',
  new_store_ad: 'mfood',
  invincible_star: 'shanfeng',
  exclusive_merchant: 'mfood',
  traffic_ad: 'shanfeng',
  guess_you_like: 'shanfeng',
  organic_traffic: 'mfood',
  search_algo: 'shanfeng',
}

export default function DayPicker({ inventoryItem }: DayPickerProps) {
  const navigate = useNavigate()
  const [selectedDates, setSelectedDates] = useState<string[]>([])
  const [currentMonth, setCurrentMonth] = useState<Dayjs>(dayjs(inventoryItem.availableStartDate))
  const [hoveredMonth, setHoveredMonth] = useState<string | null>(null)
  const [cartItems, setCartItems] = useState<CartItem[]>([])
  const [merchantBalance, setMerchantBalance] = useState(15800)
  const [isPaymentModalVisible, setIsPaymentModalVisible] = useState(false)
  const [isSuccessModalVisible, setIsSuccessModalVisible] = useState(false)
  const [currentTime, setCurrentTime] = useState(Date.now())

  // 查询条件状态
  const [searchBrand, setSearchBrand] = useState<string | null>(null)
  const [searchAlgorithm, setSearchAlgorithm] = useState<string | null>(null)
  const [searchBD, setSearchBD] = useState<string | null>(null)

  // 冲突弹窗状态
  const [conflictModalVisible, setConflictModalVisible] = useState(false)
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null)

  // 算法切换处理（带冲突检测）
  const handleAlgorithmChange = (value: string | null) => {
    const hasCartItems = cartItems.length > 0
    if (hasCartItems && value !== searchAlgorithm) {
      setPendingAction(() => {
        setSearchAlgorithm(value)
        if (value && ALGORITHM_BRAND_MAP[value]) {
          setSearchBrand(ALGORITHM_BRAND_MAP[value])
        } else {
          setSearchBrand(null)
        }
        setSelectedDates([])
      })
      setConflictModalVisible(true)
      return
    }
    setSearchAlgorithm(value)
    if (value && ALGORITHM_BRAND_MAP[value]) {
      setSearchBrand(ALGORITHM_BRAND_MAP[value])
    } else {
      setSearchBrand(null)
    }
  }

  // 确认清空购物车
  const handleConfirmClear = () => {
    setCartItems([])
    setConflictModalVisible(false)
    if (pendingAction) {
      pendingAction()
      setPendingAction(null)
    }
  }

  // 取消切换
  const handleCancelSwitch = () => {
    setConflictModalVisible(false)
    setPendingAction(null)
  }

  // 倒计时：每秒更新当前时间
  useEffect(() => {
    const timer = setInterval(() => { setCurrentTime(Date.now()) }, 1000)
    return () => clearInterval(timer)
  }, [])

  // 自动释放过期锁定（60秒后）
  useEffect(() => {
    const expiredItems = cartItems.filter(item => currentTime - item.lockTime >= 60000)
    if (expiredItems.length > 0) {
      setCartItems(prev => prev.filter(item => currentTime - item.lockTime < 60000))
      expiredItems.forEach(item => {
        message.info(`${item.dates.length}天批次 鎖定已到期，自動釋放`)
      })
    }
  }, [currentTime, cartItems])

  // 获取可售月份范围
  const months = useMemo(() => {
    const startDate = dayjs(inventoryItem.availableStartDate)
    const endDate = dayjs(inventoryItem.availableEndDate)
    const result: Dayjs[] = []
    let current = startDate.startOf('month')
    while (current.isBefore(endDate) || current.isSame(endDate, 'month')) {
      result.push(current)
      current = current.add(1, 'month')
    }
    return result
  }, [inventoryItem.availableStartDate, inventoryItem.availableEndDate])

  // 生成当前月份的日历网格
  const calendarGrid = useMemo(() => {
    const year = currentMonth.year()
    const month = currentMonth.month()
    const firstDay = dayjs(new Date(year, month, 1))
    const lastDay = dayjs(new Date(year, month + 1, 0))
    const firstDayOfWeek = firstDay.day()
    const daysInMonth = lastDay.date()
    
    const weeks: (Dayjs | null)[][] = []
    let currentWeek: (Dayjs | null)[] = []
    
    for (let i = 0; i < firstDayOfWeek; i++) { currentWeek.push(null) }
    for (let day = 1; day <= daysInMonth; day++) {
      const date = dayjs(new Date(year, month, day))
      currentWeek.push(date)
      if (currentWeek.length === 7) { weeks.push(currentWeek); currentWeek = [] }
    }
    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) { currentWeek.push(null) }
      weeks.push(currentWeek)
    }
    return weeks
  }, [currentMonth])

  const startDate = dayjs(inventoryItem.availableStartDate)
  const endDate = dayjs(inventoryItem.availableEndDate)

  const isDateAvailable = (date: Dayjs | null) => {
    if (!date) return false
    return date.isAfter(startDate.subtract(1, 'day')) && date.isBefore(endDate.add(1, 'day'))
  }

  const isDateSoldOut = (date: Dayjs | null) => {
    if (!date) return false
    return SOLD_OUT_DATES.includes(date.format('YYYY-MM-DD'))
  }

  // 判断日期是否已锁定
  const isDateLocked = (dateStr: string) => {
    return cartItems.some(item => item.dates.includes(dateStr))
  }

  // 获取锁定项的倒计时
  const getLockedRemaining = (dateStr: string) => {
    const item = cartItems.find(it => it.dates.includes(dateStr))
    if (!item) return 0
    return Math.max(0, 60 - Math.floor((currentTime - item.lockTime) / 1000))
  }

  // 计算当前折扣
  const currentDiscount = useMemo(() => {
    const days = selectedDates.length
    for (let i = mockGradients.length - 1; i >= 0; i--) {
      if (days >= mockGradients[i].minDays) return mockGradients[i]
    }
    return null
  }, [selectedDates])

  // 计算待加购总价
  const pendingPrice = useMemo(() => {
    const days = selectedDates.length
    if (days === 0) return 0
    const basePrice = inventoryItem.dailyPrice * days
    if (currentDiscount) return Math.round(basePrice * currentDiscount.discount / 100)
    return basePrice
  }, [selectedDates, currentDiscount, inventoryItem.dailyPrice])

  // 购物车汇总
  const cartSummary = useMemo(() => {
    const totalOriginal = cartItems.reduce((sum, item) => sum + item.originalPrice, 0)
    const totalSale = cartItems.reduce((sum, item) => sum + item.salePrice, 0)
    return { totalOriginal, totalSale, totalDiscount: totalOriginal - totalSale }
  }, [cartItems])

  // 按月分组已选日期
  const datesByMonth = useMemo(() => {
    const grouped: Record<string, number[]> = {}
    selectedDates.forEach(dateStr => {
      const date = dayjs(dateStr)
      const monthKey = date.format('YYYY-MM')
      const day = date.date()
      if (!grouped[monthKey]) grouped[monthKey] = []
      grouped[monthKey].push(day)
    })
    // 排序月份和日期
    return Object.entries(grouped)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, days]) => ({ month, days: days.sort((a, b) => a - b) }))
  }, [selectedDates])

  // 切换日期选择
  const handleDateClick = (date: Dayjs | null) => {
    if (!date) return
    if (!isDateAvailable(date)) { message.warning('該日期不在可購買範圍內'); return }
    if (isDateSoldOut(date)) { message.warning('該日期已售罄'); return }
    if (isDateLocked(date.format('YYYY-MM-DD'))) { message.info('該日期已被鎖定'); return }
    const dateStr = date.format('YYYY-MM-DD')
    if (selectedDates.includes(dateStr)) { setSelectedDates(selectedDates.filter(d => d !== dateStr)) }
    else { setSelectedDates([...selectedDates, dateStr].sort()) }
  }

  const handleClear = () => setSelectedDates([])

  // 加入购物车
  const handleAddToCart = () => {
    if (selectedDates.length === 0) { message.warning('請先選擇購買日期'); return }
    const days = selectedDates.length
    const basePrice = inventoryItem.dailyPrice * days
    const discount = currentDiscount?.discount ?? 100
    const salePrice = Math.round(basePrice * discount / 100)
    const newItem: CartItem = {
      key: `cart-${Date.now()}`,
      dates: [...selectedDates],
      days, originalPrice: basePrice, discount, salePrice,
      lockTime: Date.now(),
    }
    setCartItems(prev => [...prev, newItem])
    message.success(`已加購 ${days} 天`)
    setSelectedDates([])
  }

  // 切换月份
  const handleMonthChange = (month: Dayjs) => { setCurrentMonth(month) }

  // 获取单元格样式
  const getCellStyle = (date: Dayjs | null) => {
    if (!date) return { background: '#fafafa', cursor: 'default', border: '1px solid #e8e8e8' }
    const dateStr = date.format('YYYY-MM-DD')
    const isSelected = selectedDates.includes(dateStr)
    const isSoldOut = isDateSoldOut(date)
    const isAvailable = isDateAvailable(date)
    const inCart = isDateLocked(dateStr)
    if (inCart) return { background: '#f9f0ff', cursor: 'not-allowed', border: '1px solid #d3adf7', color: '#722ed1' }
    if (!isAvailable) return { background: '#f5f5f5', cursor: 'not-allowed', border: '1px solid #e8e8e8', color: '#bfbfbf' }
    if (isSoldOut) return { background: '#fff2f0', cursor: 'not-allowed', border: '1px solid #ffccc7', color: '#ff4d4f' }
    if (isSelected) return { background: '#f6ffed', cursor: 'pointer', border: '2px solid #52c41a', color: '#52c41a', fontWeight: 600 }
    return { background: '#fff', cursor: 'pointer', border: '1px solid #e8e8e8', color: '#333' }
  }

  const handlePayment = () => { setIsPaymentModalVisible(true) }
  const handleConfirmPayment = () => {
    setMerchantBalance(prev => prev - cartSummary.totalSale)
    setIsPaymentModalVisible(false)
    setCartItems([])
    setIsSuccessModalVisible(true)
  }
  const handleViewOrder = () => { setIsSuccessModalVisible(false); navigate('/promotion-order-manage') }
  const handleContinuePurchase = () => { setIsSuccessModalVisible(false); message.success('繼續購買') }

  return (
    <div style={{ display: 'flex', gap: 16 }}>
      {/* 左侧：查询条件 + 月份选择 + 日历 */}
      <div style={{ flex: 1 }}>
        {/* 查询区域 */}
        <div className="search-section" style={{ marginBottom: 16 }}>
          <Form layout="inline" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px 12px' }}>
            <Form.Item label="算法名稱">
              <Select 
                placeholder="請輸入搜索" 
                value={searchAlgorithm} 
                onChange={handleAlgorithmChange} 
                allowClear 
                showSearch 
                optionFilterProp="label"
                options={[
                  { label: '盤活復蘇-團購版', value: 'hot_revive' },
                  { label: '無敵星星-首頁版', value: 'invincible_star' },
                  { label: '新店廣告-外賣版', value: 'new_store_ad' },
                  { label: '獨家商家-超市版', value: 'exclusive_merchant' },
                  { label: '流量廣告-全渠道', value: 'traffic_ad' },
                  { label: '猜你喜歡-主力版', value: 'guess_you_like' },
                  { label: '自然流量-默認', value: 'organic_traffic' },
                  { label: '搜索算法-綜合版', value: 'search_algo' },
                ]} 
              />
            </Form.Item>
            <Form.Item label="所屬品牌">
              <Select 
                placeholder="選擇算法後自動帶出" 
                value={searchBrand} 
                onChange={(v) => setSearchBrand(v)} 
                allowClear
                options={[{ label: '閃峰', value: 'shanfeng' }, { label: 'mFood', value: 'mfood' }]} 
              />
            </Form.Item>
            <Form.Item label="選擇BD">
              <Select placeholder="全部" value={searchBD} onChange={(v) => setSearchBD(v)} allowClear showSearch
                filterOption={(input, option) => { const keyword = input.toLowerCase(); const label = (option?.label ?? '').toString().toLowerCase(); return label.includes(keyword) }}
                options={[{ label: '張偉', value: 'bd-001' }, { label: '李娜', value: 'bd-002' }, { label: '王強', value: 'bd-003' }, { label: '劉敏', value: 'bd-004' }]} />
            </Form.Item>
            <Form.Item>
              <div className="search-actions">
                <Button type="primary" icon={<SearchOutlined />}>查詢</Button>
                <Button icon={<ReloadOutlined />} onClick={() => {
                  setSearchBrand(null); setSearchAlgorithm(null)
                  setSearchBD(null)
                }}>重置</Button>
              </div>
            </Form.Item>
          </Form>
        </div>

        {/* 月份横向选择器 */}
        <Card title={<Space><CalendarOutlined /><span>選擇月份</span></Space>} style={{ marginBottom: 16 }} bodyStyle={{ padding: '12px 20px' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {months.map(month => {
              const monthStr = month.format('YYYY-MM')
              const isSelected = currentMonth.format('YYYY-MM') === monthStr
              const isHovered = hoveredMonth === monthStr
              return (
                <div
                  key={monthStr}
                  onClick={() => handleMonthChange(month)}
                  onMouseEnter={() => setHoveredMonth(monthStr)}
                  onMouseLeave={() => setHoveredMonth(null)}
                  style={{
                    flex: 1, padding: '8px 4px', borderRadius: 6,
                    border: isSelected ? '2px solid #fa8c16' : isHovered ? '2px solid #fa8c16' : '1px solid #e8e8e8',
                    background: isSelected ? '#fff7e6' : isHovered ? '#fff7e6' : '#fff',
                    cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s',
                  }}
                >
                  <span style={{ fontSize: 15, fontWeight: isSelected || isHovered ? 700 : 500, color: isSelected || isHovered ? '#fa8c16' : '#333' }}>
                    {month.format('M月')}
                  </span>
                </div>
              )
            })}
          </div>
        </Card>

        {/* 日历网格 */}
        <div style={{ border: '1px solid #e8e8e8', borderRadius: 8, overflow: 'hidden' }}>
          {/* 星期表头 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', background: '#f5f5f5', borderBottom: '1px solid #e8e8e8' }}>
            {WEEKDAY_LABELS.map((label, index) => (
              <div key={label} style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 600, fontSize: 13, color: index === 0 || index === 6 ? '#fa541c' : '#333', borderRight: index < 6 ? '1px solid #e8e8e8' : 'none' }}>
                {label}
              </div>
            ))}
          </div>
          {/* 日期网格 */}
          {calendarGrid.map((week, weekIndex) => (
            <div key={weekIndex} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: weekIndex < calendarGrid.length - 1 ? '1px solid #e8e8e8' : 'none' }}>
              {week.map((date, dayIndex) => {
                const cellStyle = getCellStyle(date)
                const dateStr = date?.format('YYYY-MM-DD') || ''
                const isSelected = date ? selectedDates.includes(dateStr) : false
                const isToday = date?.isSame(dayjs(), 'day')
                const inCart = date ? isDateLocked(dateStr) : false
                const remaining = date ? getLockedRemaining(dateStr) : 0
                return (
                  <div key={`${weekIndex}-${dayIndex}`} onClick={() => handleDateClick(date)}
                    style={{ padding: '10px 8px', textAlign: 'center', minHeight: 64, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRight: dayIndex < 6 ? '1px solid #e8e8e8' : 'none', ...cellStyle, transition: 'all 0.2s' }}>
                    {date ? (
                      <>
                        <div style={{ fontSize: 15, fontWeight: isSelected ? 700 : (isToday ? 600 : 400), position: 'relative' }}>
                          {date.date()}
                          {isToday && !isSelected && <span style={{ position: 'absolute', bottom: -2, left: '50%', transform: 'translateX(-50%)', width: 4, height: 4, borderRadius: '50%', background: '#1890ff' }} />}
                        </div>
                        {inCart && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginTop: 2 }}>
                            <span style={{ fontSize: 10, color: '#722ed1' }}>已鎖定</span>
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#ff4d4f' }}>{remaining}</span>
                            <span style={{ fontSize: 9, color: '#ff7875' }}>秒</span>
                          </div>
                        )}
                        {isDateSoldOut(date) && (
                          <>
                            <span style={{ fontSize: 10, marginTop: 2 }}>已售罄</span>
                            <span style={{ fontSize: 10, color: '#bfbfbf', marginTop: 1, textDecoration: 'line-through' }}>${inventoryItem.dailyPrice}</span>
                          </>
                        )}
                        {isDateAvailable(date) && !isDateSoldOut(date) && !inCart && (
                          <>
                            {isSelected
                              ? <span style={{ fontSize: 10, color: '#E8720C', marginTop: 2, fontWeight: 600 }}>已選擇</span>
                              : <span style={{ fontSize: 10, color: '#52c41a', marginTop: 2 }}>可購買</span>
                            }
                            <span style={{ fontSize: 10, color: '#ff4d4f', marginTop: 1, fontWeight: 500 }}>${inventoryItem.dailyPrice}</span>
                          </>
                        )}
                      </>
                    ) : null}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* 右侧面板 */}
      <div style={{ width: 400, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* 当前所选 */}
        <Card size="small" title={<Space><CalendarOutlined /><span>當前所選</span></Space>}>
          {selectedDates.length > 0 ? (
            <div>
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                {/* 按月展示已选日期 */}
                {datesByMonth.map(({ month, days }) => (
                  <div key={month} style={{ background: '#fafafa', borderRadius: 6, padding: '10px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 12, color: '#8c8c8c', whiteSpace: 'nowrap' }}>所選月份：</span>
                      <span style={{ fontSize: 14, fontWeight: 600 }}>{month}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12, color: '#8c8c8c', whiteSpace: 'nowrap' }}>已選擇：</span>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{days.map(d => `${d}號`).join('、')}</span>
                    </div>
                  </div>
                ))}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: '#8c8c8c', whiteSpace: 'nowrap' }}>選擇天數合計：</span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#52c41a' }}>{selectedDates.length}天</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: '#8c8c8c', whiteSpace: 'nowrap' }}>折扣：</span>
                  {currentDiscount ? <Tag color="green">{currentDiscount.discount}折</Tag> : <Tag>無折扣</Tag>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: '#8c8c8c', whiteSpace: 'nowrap' }}>售賣價格：</span>
                  <span style={{ fontSize: 20, fontWeight: 700, color: '#ff4d4f' }}>${pendingPrice}</span>
                </div>
              </Space>
              <Button type="primary" icon={<ShoppingCartOutlined />} block onClick={handleAddToCart}
                style={{ marginTop: 12, height: 40, fontSize: 15, background: '#fa8c16', borderColor: '#fa8c16' }}>
                加購
              </Button>
            </div>
          ) : (
            <Empty description="請在日曆中選擇日期" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          )}
        </Card>

        {/* 已选择购买天数 */}
        <Card size="small" title="已選擇購買天數">
          <div style={{ fontSize: 11, color: '#ff4d4f', marginBottom: 12, lineHeight: 1.4 }}>
            (已加購的日期會被鎖定，鎖定狀態下其他商家無法購買，60秒後自動釋放)
          </div>
          {cartItems.length > 0 ? (
            <Table<CartRow>
              dataSource={cartItems.flatMap(item =>
                item.dates.map((date): CartRow => ({
                  key: `${item.key}-${date}`, date, cartKey: item.key,
                  salePrice: Math.round(item.originalPrice * item.discount / 100 / item.dates.length),
                  lockTime: item.lockTime,
                }))
              )}
              pagination={false} size="small"
              locale={{ emptyText: <Empty description="暫無已選日期" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
              columns={[
                { title: '日期', dataIndex: 'date', key: 'date', width: 110, render: (text: string) => <span style={{ fontSize: 12 }}>{text}</span> },
                { title: '鎖定時間', key: 'countdown', width: 100, align: 'center' as const,
                  render: (_, record) => {
                    const remaining = Math.max(0, 60 - Math.floor((currentTime - record.lockTime) / 1000))
                    if (remaining <= 0) return <span style={{ fontSize: 11, color: '#bfbfbf' }}>已釋放</span>
                    return (
                      <span style={{ fontSize: 12 }}>
                        <span style={{ fontWeight: 700, color: remaining <= 10 ? '#ff4d4f' : '#fa8c16' }}>{remaining}</span>
                        <span style={{ fontSize: 10, color: '#8c8c8c', marginLeft: 2 }}>秒</span>
                      </span>
                    )
                  }
                },
                { title: '售價', dataIndex: 'salePrice', key: 'salePrice', width: 80, align: 'right' as const, render: (price: number) => <span style={{ fontSize: 12, color: '#ff4d4f', fontWeight: 600 }}>${price}</span> },
                { title: '操作', key: 'action', width: 60, align: 'center' as const,
                  render: (_, record) => (
                    <Button type="link" size="small" danger icon={<DeleteOutlined />} style={{ padding: 0, fontSize: 12 }}
                      onClick={() => {
                        setCartItems(prev => prev.map(item => {
                          if (item.key === record.cartKey) {
                            const newDates = item.dates.filter(d => d !== record.date)
                            if (newDates.length === 0) return null as any
                            return { ...item, dates: newDates, days: newDates.length }
                          }
                          return item
                        }).filter(Boolean))
                        message.success('已移除')
                      }}
                    />
                  ),
                },
              ]}
            />
          ) : (
            <Empty description="暫無已選日期" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          )}
        </Card>

        {/* 费用结算 */}
        <Card size="small" title="費用結算">
          <div style={{ padding: '12px 16px', marginBottom: 12, background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: '#fff', opacity: 0.9 }}>推廣金餘額</span>
            <span style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>${merchantBalance.toLocaleString()}</span>
          </div>
          <table style={{ width: '100%', fontSize: 12, marginBottom: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#fafafa' }}>
                <th style={{ padding: '10px 8px', border: '1px solid #e8e8e8', color: '#595959', fontSize: 12, fontWeight: 600 }}>訂單金額（原價）</th>
                <th style={{ padding: '10px 8px', border: '1px solid #e8e8e8', color: '#fa8c16', fontSize: 12, fontWeight: 600 }}>訂單優惠</th>
                <th style={{ padding: '10px 8px', border: '1px solid #e8e8e8', color: '#ff4d4f', fontSize: 12, fontWeight: 600 }}>實付總額</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ padding: '14px 8px', border: '1px solid #e8e8e8', textAlign: 'center' }}><span style={{ fontSize: 16, fontWeight: 600, color: '#595959' }}>${cartSummary.totalOriginal}</span></td>
                <td style={{ padding: '14px 8px', border: '1px solid #e8e8e8', textAlign: 'center' }}><span style={{ fontSize: 16, fontWeight: 600, color: '#fa8c16' }}>-${cartSummary.totalDiscount}</span></td>
                <td style={{ padding: '14px 8px', border: '1px solid #e8e8e8', textAlign: 'center', background: '#fff7f7' }}><span style={{ fontSize: 20, fontWeight: 700, color: '#ff4d4f' }}>${cartSummary.totalSale}</span></td>
              </tr>
            </tbody>
          </table>
          <Button type="primary" block size="large" disabled={cartItems.length === 0} onClick={handlePayment}
            style={{ background: cartItems.length > 0 ? '#ff4d4f' : '#d9d9d9', borderColor: cartItems.length > 0 ? '#ff4d4f' : '#d9d9d9', height: 44, fontSize: 16, fontWeight: 600 }}>
            訂單支付
          </Button>
        </Card>
      </div>

      {/* 支付确认弹窗 */}
      <Modal title="確認訂單" open={isPaymentModalVisible} onOk={handleConfirmPayment} onCancel={() => setIsPaymentModalVisible(false)}
        okText="確定支付" cancelText="取消" okButtonProps={{ style: { background: '#ff4d4f', borderColor: '#ff4d4f' } }} width={600}>
        <div style={{ marginBottom: 16 }}>
          <h4 style={{ marginBottom: 12, fontSize: 14, color: '#595959' }}>購買明細：</h4>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: '#fafafa' }}>
              <th style={{ padding: '8px', border: '1px solid #e8e8e8', textAlign: 'left' }}>日期</th>
              <th style={{ padding: '8px', border: '1px solid #e8e8e8', textAlign: 'center' }}>天數</th>
              <th style={{ padding: '8px', border: '1px solid #e8e8e8', textAlign: 'center' }}>折扣</th>
              <th style={{ padding: '8px', border: '1px solid #e8e8e8', textAlign: 'right' }}>售價</th>
            </tr></thead>
            <tbody>{cartItems.map(item => (
              <tr key={item.key}>
                <td style={{ padding: '8px', border: '1px solid #e8e8e8' }}>{item.dates.length <= 3 ? item.dates.join(', ') : `${item.dates.slice(0, 3).join(', ')} ...共${item.dates.length}天`}</td>
                <td style={{ padding: '8px', border: '1px solid #e8e8e8', textAlign: 'center' }}>{item.days}天</td>
                <td style={{ padding: '8px', border: '1px solid #e8e8e8', textAlign: 'center' }}>{item.discount < 100 ? `${item.discount}折` : '-'}</td>
                <td style={{ padding: '8px', border: '1px solid #e8e8e8', textAlign: 'right', color: '#ff4d4f', fontWeight: 600 }}>${item.salePrice}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <div style={{ background: '#fafafa', padding: 16, borderRadius: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}><span style={{ color: '#595959' }}>訂單金額（原價）：</span><span style={{ fontWeight: 600 }}>${cartSummary.totalOriginal}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, color: '#fa8c16' }}><span>訂單優惠：</span><span style={{ fontWeight: 600 }}>-${cartSummary.totalDiscount}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, color: '#ff4d4f', borderTop: '1px solid #d9d9d9', paddingTop: 8, marginTop: 8 }}><span style={{ fontWeight: 600 }}>實付金額：</span><span style={{ fontWeight: 700 }}>${cartSummary.totalSale}</span></div>
        </div>
      </Modal>

      {/* 支付成功弹窗 */}
      <Modal title="購買成功" open={isSuccessModalVisible} onCancel={() => setIsSuccessModalVisible(false)}
        footer={[<Button key="view" type="primary" onClick={handleViewOrder}>查看訂單</Button>, <Button key="continue" onClick={handleContinuePurchase} style={{ background: '#fa8c16', borderColor: '#fa8c16', color: '#fff' }}>繼續購買</Button>]} width={400}>
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
          <p style={{ fontSize: 16, color: '#595959', marginBottom: 24 }}>恭喜！購買成功</p>
          <div style={{ background: 'linear-gradient(135deg, #fff7e6 0%, #ffe58f 100%)', padding: '20px 16px', borderRadius: 8, marginBottom: 16 }}>
            <p style={{ fontSize: 14, color: '#8c8c8c', marginBottom: 8 }}>已扣除推廣金</p>
            <p style={{ fontSize: 36, fontWeight: 700, color: '#fa541c', margin: 0, lineHeight: 1.2 }}>${cartSummary.totalSale}</p>
          </div>
        </div>
      </Modal>

      {/* 算法切换冲突提醒弹窗 */}
      <Modal
        title="提示"
        open={conflictModalVisible}
        onOk={handleConfirmClear}
        onCancel={handleCancelSwitch}
        okText="確認切換"
        cancelText="取消"
        okButtonProps={{ danger: true }}
      >
        <p style={{ margin: '16px 0 8px', fontSize: 14, lineHeight: 1.8 }}>
          您當前已有加購數據，同一門店同一訂單僅支持選擇相同算法的廣告位。
        </p>
        <p style={{ margin: '0 0 12px', fontSize: 14, color: '#595959' }}>
          切換算法或門店後，已選的日期將被清空。您可以：
        </p>
        <p style={{ margin: '0 0 8px', fontSize: 14, color: '#595959' }}>
          <strong>確認切換：</strong>清空已選日期，重新查詢
        </p>
        <p style={{ margin: '0 0 16px', fontSize: 14, color: '#595959' }}>
          <strong>取消：</strong>保留當前選擇，先完成下單後再選擇其他門店或算法
        </p>
      </Modal>
    </div>
  )
}
