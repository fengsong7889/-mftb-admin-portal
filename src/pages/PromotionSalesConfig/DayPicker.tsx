import { useState, useMemo } from 'react'
import { Tag, Button, Space, Divider, message, Alert, DatePicker, Table, Empty, Modal } from 'antd'
import { ShoppingCartOutlined, CheckCircleFilled, CalendarOutlined, DeleteOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import type { InventoryItem } from './types'
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import 'dayjs/locale/zh-tw'

dayjs.locale('zh-tw')

// Mock 梯度折扣配置
const mockGradients = [
  { minDays: 3, discount: 95 },  // 3天起 95折
  { minDays: 7, discount: 90 },  // 7天起 9折
  { minDays: 14, discount: 85 }, // 14天起 85折
  { minDays: 30, discount: 80 }, // 30天起 8折
]

// 中文星期映射
const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

// Mock: 部分日期已售罄
const SOLD_OUT_DATES = ['2025-07-08', '2025-07-12', '2025-07-15', '2025-07-20', '2025-07-25']

/** 购物车项 */
interface CartItem {
  key: string
  dates: string[]        // 购买日期列表
  days: number           // 天数
  originalPrice: number  // 原价
  discount: number       // 折扣
  salePrice: number      // 售价
}

/** 购物车展平行 */
interface CartRow {
  key: string
  date: string
  cartKey: string
  salePrice: number
}

interface DayPickerProps {
  inventoryItem: InventoryItem
}

export default function DayPicker({ inventoryItem }: DayPickerProps) {
  const navigate = useNavigate()
  const [selectedDates, setSelectedDates] = useState<string[]>([])
  const [currentMonth, setCurrentMonth] = useState<Dayjs>(dayjs(inventoryItem.availableStartDate))
  const [cartItems, setCartItems] = useState<CartItem[]>([])
  const [merchantBalance, setMerchantBalance] = useState(15800)
  const [isPaymentModalVisible, setIsPaymentModalVisible] = useState(false)
  const [isSuccessModalVisible, setIsSuccessModalVisible] = useState(false)

  // 获取可售日期范围
  const startDate = dayjs(inventoryItem.availableStartDate)
  const endDate = dayjs(inventoryItem.availableEndDate)

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
    
    for (let i = 0; i < firstDayOfWeek; i++) {
      currentWeek.push(null)
    }
    
    for (let day = 1; day <= daysInMonth; day++) {
      const date = dayjs(new Date(year, month, day))
      currentWeek.push(date)
      if (currentWeek.length === 7) {
        weeks.push(currentWeek)
        currentWeek = []
      }
    }
    
    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) {
        currentWeek.push(null)
      }
      weeks.push(currentWeek)
    }
    
    return weeks
  }, [currentMonth])

  // 判断日期是否可售
  const isDateAvailable = (date: Dayjs | null) => {
    if (!date) return false
    return date.isAfter(startDate.subtract(1, 'day')) && 
           date.isBefore(endDate.add(1, 'day'))
  }

  // 判断日期是否售罄
  const isDateSoldOut = (date: Dayjs | null) => {
    if (!date) return false
    const dateStr = date.format('YYYY-MM-DD')
    return SOLD_OUT_DATES.includes(dateStr)
  }

  // 计算当前折扣（基于已选天数）
  const currentDiscount = useMemo(() => {
    const days = selectedDates.length
    for (let i = mockGradients.length - 1; i >= 0; i--) {
      if (days >= mockGradients[i].minDays) {
        return mockGradients[i]
      }
    }
    return null
  }, [selectedDates])

  // 计算待加购总价
  const pendingPrice = useMemo(() => {
    const days = selectedDates.length
    if (days === 0) return 0
    const basePrice = inventoryItem.dailyPrice * days
    if (currentDiscount) {
      return Math.round(basePrice * currentDiscount.discount / 100)
    }
    return basePrice
  }, [selectedDates, currentDiscount, inventoryItem.dailyPrice])

  // 购物车汇总
  const cartSummary = useMemo(() => {
    const totalOriginal = cartItems.reduce((sum, item) => sum + item.originalPrice, 0)
    const totalSale = cartItems.reduce((sum, item) => sum + item.salePrice, 0)
    const totalDiscount = totalOriginal - totalSale
    return { totalOriginal, totalSale, totalDiscount }
  }, [cartItems])

  // 切换日期选择
  const handleDateClick = (date: Dayjs | null) => {
    if (!date) return
    if (!isDateAvailable(date)) {
      message.warning('該日期不在可購買範圍內')
      return
    }
    if (isDateSoldOut(date)) {
      message.warning('該日期已售罄')
      return
    }
    const dateStr = date.format('YYYY-MM-DD')
    if (selectedDates.includes(dateStr)) {
      setSelectedDates(selectedDates.filter(d => d !== dateStr))
    } else {
      setSelectedDates([...selectedDates, dateStr].sort())
    }
  }

  // 清空选择
  const handleClear = () => setSelectedDates([])

  // 加入购物车
  const handleAddToCart = () => {
    if (selectedDates.length === 0) {
      message.warning('請先選擇購買日期')
      return
    }
    const days = selectedDates.length
    const basePrice = inventoryItem.dailyPrice * days
    const discount = currentDiscount?.discount ?? 100
    const salePrice = Math.round(basePrice * discount / 100)

    const newItem: CartItem = {
      key: `cart-${Date.now()}`,
      dates: [...selectedDates],
      days,
      originalPrice: basePrice,
      discount,
      salePrice,
    }
    setCartItems(prev => [...prev, newItem])
    message.success(`已加購 ${days} 天`)
    setSelectedDates([])
  }

  // 切换月份
  const handleMonthChange = (month: Dayjs | null) => {
    if (month) setCurrentMonth(month)
  }

  // 获取单元格样式
  const getCellStyle = (date: Dayjs | null) => {
    if (!date) return { background: '#fafafa', cursor: 'default', border: '1px solid #e8e8e8' }

    const dateStr = date.format('YYYY-MM-DD')
    const isSelected = selectedDates.includes(dateStr)
    const isSoldOut = isDateSoldOut(date)
    const isAvailable = isDateAvailable(date)
    // 检查是否已在购物车中
    const inCart = cartItems.some(item => item.dates.includes(dateStr))

    if (inCart) {
      return { background: '#f9f0ff', cursor: 'not-allowed', border: '1px solid #d3adf7', color: '#722ed1' }
    }
    if (!isAvailable) {
      return { background: '#f5f5f5', cursor: 'not-allowed', border: '1px solid #e8e8e8', color: '#bfbfbf' }
    }
    if (isSoldOut) {
      return { background: '#fff2f0', cursor: 'not-allowed', border: '1px solid #ffccc7', color: '#ff4d4f' }
    }
    if (isSelected) {
      return { background: '#f6ffed', cursor: 'pointer', border: '2px solid #52c41a', color: '#52c41a', fontWeight: 600 }
    }
    return { background: '#fff', cursor: 'pointer', border: '1px solid #e8e8e8', color: '#333' }
  }

  // 点击订单支付
  const handlePayment = () => {
    setIsPaymentModalVisible(true)
  }

  // 确认支付
  const handleConfirmPayment = () => {
    const totalAmount = cartSummary.totalSale
    setMerchantBalance(prev => prev - totalAmount)
    setIsPaymentModalVisible(false)
    setCartItems([])
    setIsSuccessModalVisible(true)
  }

  // 查看订单
  const handleViewOrder = () => {
    setIsSuccessModalVisible(false)
    navigate('/promotion-order-manage')
  }

  // 继续购买
  const handleContinuePurchase = () => {
    setIsSuccessModalVisible(false)
    message.success('繼續購買')
  }

  return (
    <div style={{ display: 'flex', gap: 16 }}>
      {/* 左侧：日历网格 */}
      <div style={{ flex: 1 }}>
        {/* 按天购买说明 + 梯度折扣 */}
        <Alert
          message="按天購買說明"
          description={
            <div>
              <div style={{ marginBottom: 12 }}>
                盤活復蘇廣告按天計價，選擇購買天數越多，享受的折扣越大。請在日曆中點擊選擇/取消日期。
              </div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: '#333', fontWeight: 600, whiteSpace: 'nowrap' }}>
                  購買多天折扣（梯度）：
                </span>
                {mockGradients.map((g, i) => {
                  const isActive = currentDiscount?.minDays === g.minDays
                  return (
                    <Tag
                      key={i}
                      color={isActive ? 'orange' : undefined}
                      style={{
                        margin: 0,
                        fontWeight: isActive ? 700 : 400,
                        borderColor: isActive ? '#fa8c16' : 'rgba(255,255,255,0.4)',
                      }}
                    >
                      ≥{g.minDays}天 {g.discount}折
                    </Tag>
                  )
                })}
              </div>
            </div>
          }
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />

        {/* 月份选择器 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
          <CalendarOutlined style={{ fontSize: 18, color: '#1890ff' }} />
          <span style={{ fontSize: 14, color: '#595959' }}>選擇月份：</span>
          <DatePicker
            picker="month"
            value={currentMonth}
            onChange={handleMonthChange}
            format="YYYY年MM月"
            style={{ width: 160 }}
            allowClear={false}
          />
          
          {/* 图例 */}
          <div style={{ display: 'flex', gap: 16, marginLeft: 'auto', fontSize: 12 }}>
            <Space size={4}>
              <div style={{ width: 14, height: 14, background: '#f6ffed', border: '2px solid #52c41a', borderRadius: 2 }} />
              <span style={{ color: '#595959' }}>已選中</span>
            </Space>
            <Space size={4}>
              <div style={{ width: 14, height: 14, background: '#fff', border: '1px solid #e8e8e8', borderRadius: 2 }} />
              <span style={{ color: '#595959' }}>可購買</span>
            </Space>
            <Space size={4}>
              <div style={{ width: 14, height: 14, background: '#fff2f0', border: '1px solid #ffccc7', borderRadius: 2 }} />
              <span style={{ color: '#595959' }}>已售罄</span>
            </Space>
            <Space size={4}>
              <div style={{ width: 14, height: 14, background: '#f5f5f5', borderRadius: 2 }} />
              <span style={{ color: '#595959' }}>不可售</span>
            </Space>
            <Space size={4}>
              <div style={{ width: 14, height: 14, background: '#f9f0ff', border: '1px solid #d3adf7', borderRadius: 2 }} />
              <span style={{ color: '#595959' }}>已鎖定</span>
            </Space>
          </div>
        </div>

        {/* 日历网格 */}
        <div style={{ border: '1px solid #e8e8e8', borderRadius: 8, overflow: 'hidden' }}>
          {/* 星期表头 */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(7, 1fr)',
            background: '#f5f5f5',
            borderBottom: '1px solid #e8e8e8',
          }}>
            {WEEKDAY_LABELS.map((label, index) => (
              <div
                key={label}
                style={{
                  padding: '12px 8px',
                  textAlign: 'center',
                  fontWeight: 600,
                  fontSize: 13,
                  color: index === 0 || index === 6 ? '#fa541c' : '#333',
                  borderRight: index < 6 ? '1px solid #e8e8e8' : 'none',
                }}
              >
                {label}
              </div>
            ))}
          </div>

          {/* 日期网格 */}
          {calendarGrid.map((week, weekIndex) => (
            <div
              key={weekIndex}
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, 1fr)',
                borderBottom: weekIndex < calendarGrid.length - 1 ? '1px solid #e8e8e8' : 'none',
              }}
            >
              {week.map((date, dayIndex) => {
                const cellStyle = getCellStyle(date)
                const dateStr = date?.format('YYYY-MM-DD') || ''
                const isSelected = date ? selectedDates.includes(dateStr) : false
                const isToday = date?.isSame(dayjs(), 'day')
                const inCart = date ? cartItems.some(item => item.dates.includes(dateStr)) : false

                return (
                  <div
                    key={`${weekIndex}-${dayIndex}`}
                    onClick={() => handleDateClick(date)}
                    style={{
                      padding: '12px 8px',
                      textAlign: 'center',
                      minHeight: 70,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRight: dayIndex < 6 ? '1px solid #e8e8e8' : 'none',
                      ...cellStyle,
                      transition: 'all 0.2s',
                    }}
                  >
                    {date ? (
                      <>
                        <div style={{ 
                          fontSize: 16, 
                          fontWeight: isSelected ? 700 : (isToday ? 600 : 400),
                          position: 'relative',
                        }}>
                          {date.date()}
                          {isToday && !isSelected && (
                            <span style={{
                              position: 'absolute',
                              bottom: -2,
                              left: '50%',
                              transform: 'translateX(-50%)',
                              width: 4,
                              height: 4,
                              borderRadius: '50%',
                              background: '#1890ff',
                            }} />
                          )}
                        </div>
                        {isSelected && (
                          <CheckCircleFilled style={{ fontSize: 14, marginTop: 4 }} />
                        )}
                        {isDateSoldOut(date) && (
                          <span style={{ fontSize: 10, marginTop: 2 }}>已售罄</span>
                        )}
                        {isDateAvailable(date) && !isDateSoldOut(date) && !isSelected && (
                          <span style={{ fontSize: 10, color: inCart ? '#722ed1' : '#52c41a', marginTop: 2 }}>
                            {inCart ? '已鎖定' : '可購買'}
                          </span>
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
      <div style={{ width: 320, display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* 已选日期 */}
        <div style={{ background: '#f6ffed', borderRadius: 8, padding: 16, border: '1px solid #b7eb8f' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <h4 style={{ margin: 0, fontSize: 14, color: '#52c41a' }}>
              已選日期 ({selectedDates.length}天)
            </h4>
            {selectedDates.length > 0 && (
              <Button type="link" size="small" onClick={handleClear} style={{ padding: 0 }}>
                清空
              </Button>
            )}
          </div>
          {selectedDates.length > 0 ? (
            <div style={{ maxHeight: 100, overflowY: 'auto' }}>
              {selectedDates.map(date => (
                <Tag
                  key={date}
                  closable
                  onClose={() => setSelectedDates(selectedDates.filter(d => d !== date))}
                  style={{ marginBottom: 4 }}
                >
                  {date}
                </Tag>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: '#8c8c8c' }}>請在左側日曆中點擊選擇日期</div>
          )}
          <Divider style={{ margin: '12px 0' }} />
          {/* 待加购信息 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12 }}>
            <span style={{ color: '#8c8c8c' }}>單價：</span>
            <span>MOP {inventoryItem.dailyPrice} / 天</span>
          </div>
          {currentDiscount && selectedDates.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12 }}>
              <span style={{ color: '#8c8c8c' }}>折扣：</span>
              <Tag color="green" style={{ margin: 0 }}>{currentDiscount.discount} 折</Tag>
            </div>
          )}
          {selectedDates.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600 }}>
              <span>小計：</span>
              <span style={{ color: '#fa541c' }}>MOP {pendingPrice}</span>
            </div>
          )}
          <Button
            type="primary"
            icon={<ShoppingCartOutlined />}
            block
            onClick={handleAddToCart}
            disabled={selectedDates.length === 0}
            style={{ 
              marginTop: 12, 
              height: 40, 
              fontSize: 15,
              background: '#fa8c16',
              borderColor: '#fa8c16',
            }}
          >
            加購
          </Button>
        </div>

        {/* 已加购列表 */}
        <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #e8e8e8' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #e8e8e8', fontWeight: 600, fontSize: 14 }}>
            已加購明細
          </div>
          <div style={{ padding: '0 16px' }}>
            <div style={{ fontSize: 11, color: '#ff4d4f', padding: '8px 0', lineHeight: 1.4 }}>
              (已加購的日期會被鎖定，鎖定狀態下其他商家無法購買，如需解除需手動移除)
            </div>
          </div>
          {cartItems.length > 0 ? (
            <>
              <Table<CartRow>
                dataSource={cartItems.flatMap(item => 
                  item.dates.map((date): CartRow => ({
                    key: `${item.key}-${date}`,
                    date,
                    cartKey: item.key,
                    salePrice: Math.round(item.originalPrice * item.discount / 100 / item.dates.length),
                  }))
                )}
                pagination={false}
                size="small"
                columns={[
                  {
                    title: '日期',
                    dataIndex: 'date',
                    key: 'date',
                    width: 120,
                    render: (text: string) => (
                      <span style={{ fontSize: 12 }}>{text}</span>
                    ),
                  },
                  {
                    title: '售價',
                    dataIndex: 'salePrice',
                    key: 'salePrice',
                    width: 80,
                    align: 'right' as const,
                    render: (price: number) => (
                      <span style={{ fontSize: 12, color: '#ff4d4f', fontWeight: 600 }}>${price}</span>
                    ),
                  },
                  {
                    title: '操作',
                    key: 'action',
                    width: 50,
                    align: 'center' as const,
                    render: (_, record) => (
                      <Button
                        type="link"
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        style={{ padding: 0, fontSize: 12 }}
                        onClick={() => {
                          // 从购物车批次中移除该日期
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
              {/* 折扣汇总 */}
              <div style={{ padding: '12px 16px', borderTop: '1px solid #e8e8e8', background: '#fffbe6' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: '#595959' }}>
                    共購買 <strong>{cartItems.reduce((sum, item) => sum + item.days, 0)}</strong> 天
                  </span>
                  <span style={{ fontSize: 12, color: '#fa8c16', fontWeight: 600 }}>
                    {cartItems.reduce((sum, item) => sum + item.days, 0) >= mockGradients[0].minDays
                      ? `享受 ${(() => { const days = cartItems.reduce((sum, item) => sum + item.days, 0); for (let i = mockGradients.length - 1; i >= 0; i--) { if (days >= mockGradients[i].minDays) return mockGradients[i].discount } return 100 })()} 折`
                      : '未達到折扣門檻'
                    }
                  </span>
                </div>
              </div>
            </>
          ) : (
            <Empty description="暫無已選日期" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: '16px 0' }} />
          )}
        </div>

        {/* 费用结算 */}
        <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #e8e8e8', padding: 16 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>費用結算</div>

          {/* 推广金余额 */}
          <div style={{ 
            padding: '12px 16px', 
            marginBottom: 12, 
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            borderRadius: 6,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <span style={{ fontSize: 13, color: '#fff', opacity: 0.9 }}>推廣金餘額</span>
            <span style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>
              ${merchantBalance.toLocaleString()}
            </span>
          </div>

          {/* 结算表格 */}
          <table style={{ width: '100%', fontSize: 12, marginBottom: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#fafafa' }}>
                <th style={{ padding: '10px 8px', border: '1px solid #e8e8e8', color: '#595959', fontSize: 12, fontWeight: 600 }}>
                  訂單金額（原價）
                </th>
                <th style={{ padding: '10px 8px', border: '1px solid #e8e8e8', color: '#fa8c16', fontSize: 12, fontWeight: 600 }}>
                  訂單優惠
                </th>
                <th style={{ padding: '10px 8px', border: '1px solid #e8e8e8', color: '#ff4d4f', fontSize: 12, fontWeight: 600 }}>
                  實付總額
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ padding: '14px 8px', border: '1px solid #e8e8e8', textAlign: 'center' }}>
                  <span style={{ fontSize: 16, fontWeight: 600, color: '#595959' }}>
                    ${cartSummary.totalOriginal}
                  </span>
                </td>
                <td style={{ padding: '14px 8px', border: '1px solid #e8e8e8', textAlign: 'center' }}>
                  <span style={{ fontSize: 16, fontWeight: 600, color: '#fa8c16' }}>
                    -${cartSummary.totalDiscount}
                  </span>
                </td>
                <td style={{ padding: '14px 8px', border: '1px solid #e8e8e8', textAlign: 'center', background: '#fff7f7' }}>
                  <span style={{ fontSize: 20, fontWeight: 700, color: '#ff4d4f' }}>
                    ${cartSummary.totalSale}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>

          <Button 
            type="primary"
            block 
            size="large"
            disabled={cartItems.length === 0}
            onClick={handlePayment}
            style={{ 
              background: cartItems.length > 0 ? '#ff4d4f' : '#d9d9d9', 
              borderColor: cartItems.length > 0 ? '#ff4d4f' : '#d9d9d9',
              height: 44,
              fontSize: 16,
              fontWeight: 600,
            }}
          >
            訂單支付
          </Button>
        </div>
      </div>

      {/* 支付确认弹窗 */}
      <Modal
        title="確認訂單"
        open={isPaymentModalVisible}
        onOk={handleConfirmPayment}
        onCancel={() => setIsPaymentModalVisible(false)}
        okText="確定支付"
        cancelText="取消"
        okButtonProps={{ style: { background: '#ff4d4f', borderColor: '#ff4d4f' } }}
        width={600}
      >
        <div style={{ marginBottom: 16 }}>
          <h4 style={{ marginBottom: 12, fontSize: 14, color: '#595959' }}>購買明細：</h4>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#fafafa' }}>
                <th style={{ padding: '8px', border: '1px solid #e8e8e8', textAlign: 'left' }}>日期</th>
                <th style={{ padding: '8px', border: '1px solid #e8e8e8', textAlign: 'center' }}>天數</th>
                <th style={{ padding: '8px', border: '1px solid #e8e8e8', textAlign: 'center' }}>折扣</th>
                <th style={{ padding: '8px', border: '1px solid #e8e8e8', textAlign: 'right' }}>售價</th>
              </tr>
            </thead>
            <tbody>
              {cartItems.map(item => (
                <tr key={item.key}>
                  <td style={{ padding: '8px', border: '1px solid #e8e8e8' }}>
                    {item.dates.length <= 3 
                      ? item.dates.join(', ')
                      : `${item.dates.slice(0, 3).join(', ')} ...共${item.dates.length}天`
                    }
                  </td>
                  <td style={{ padding: '8px', border: '1px solid #e8e8e8', textAlign: 'center' }}>{item.days}天</td>
                  <td style={{ padding: '8px', border: '1px solid #e8e8e8', textAlign: 'center' }}>
                    {item.discount < 100 ? `${item.discount}折` : '-'}
                  </td>
                  <td style={{ padding: '8px', border: '1px solid #e8e8e8', textAlign: 'right', color: '#ff4d4f', fontWeight: 600 }}>
                    ${item.salePrice}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ background: '#fafafa', padding: 16, borderRadius: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ color: '#595959' }}>訂單金額（原價）：</span>
            <span style={{ fontWeight: 600 }}>${cartSummary.totalOriginal}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, color: '#fa8c16' }}>
            <span>訂單優惠：</span>
            <span style={{ fontWeight: 600 }}>-${cartSummary.totalDiscount}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, color: '#ff4d4f', borderTop: '1px solid #d9d9d9', paddingTop: 8, marginTop: 8 }}>
            <span style={{ fontWeight: 600 }}>實付金額：</span>
            <span style={{ fontWeight: 700 }}>${cartSummary.totalSale}</span>
          </div>
        </div>
      </Modal>

      {/* 支付成功弹窗 */}
      <Modal
        title="購買成功"
        open={isSuccessModalVisible}
        onCancel={() => setIsSuccessModalVisible(false)}
        footer={[
          <Button key="view" type="primary" onClick={handleViewOrder}>
            查看訂單
          </Button>,
          <Button key="continue" onClick={handleContinuePurchase} style={{ background: '#fa8c16', borderColor: '#fa8c16', color: '#fff' }}>
            繼續購買
          </Button>,
        ]}
        width={400}
      >
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
          <p style={{ fontSize: 16, color: '#595959', marginBottom: 24 }}>
            恭喜！購買成功
          </p>
          <div style={{ 
            background: 'linear-gradient(135deg, #fff7e6 0%, #ffe58f 100%)',
            padding: '20px 16px',
            borderRadius: 8,
            marginBottom: 16,
          }}>
            <p style={{ fontSize: 14, color: '#8c8c8c', marginBottom: 8 }}>
              已扣除推廣金
            </p>
            <p style={{ 
              fontSize: 36, 
              fontWeight: 700, 
              color: '#fa541c',
              margin: 0,
              lineHeight: 1.2,
            }}>
              ${cartSummary.totalSale}
            </p>
          </div>
        </div>
      </Modal>
    </div>
  )
}
