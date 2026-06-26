import { useState, useMemo } from 'react'
import { Card, Tag, Space, message, Empty, DatePicker, Button, Table, Select } from 'antd'
import { CalendarOutlined, DeleteOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import {
  TimeSlotStatus,
  generateTimeSlotStatuses,
  calcSlotPrice,
  getNoDiscountSlotsByRow,
  type InventoryItem,
} from './types'
import { Region, REGION_OPTIONS } from '../Recommend/constants'

interface CartItem {
  key: string
  date: string
  mealSlot: string
  timeSlots: number[]
  originalPrice: number  // 原价
  salePrice: number      // 售价
}

interface DateTimeGridProps {
  inventoryItem: InventoryItem
}

// 时段定义（早餐/午餐/下午茶/晚餐/夜宵）
const MEAL_TIME_SLOTS = [
  { key: 'breakfast', label: '早餐', timeRange: '07:00-10:00', slots: [14, 15, 16, 17, 18, 19] },
  { key: 'lunch', label: '午餐', timeRange: '11:00-14:00', slots: [22, 23, 24, 25, 26, 27] },
  { key: 'afternoon', label: '下午茶', timeRange: '14:00-17:00', slots: [28, 29, 30, 31, 32, 33] },
  { key: 'dinner', label: '晚餐', timeRange: '17:00-21:00', slots: [34, 35, 36, 37, 38, 39, 40, 41] },
  { key: 'supper', label: '夜宵', timeRange: '21:00-02:00', slots: [42, 43, 44, 45, 46, 47, 0, 1, 2, 3] },
]

export default function DateTimeGrid({ inventoryItem }: DateTimeGridProps) {
  const [selectedDate, setSelectedDate] = useState<Dayjs | null>(null)
  const [selectedMealSlot, setSelectedMealSlot] = useState<string | null>(null)
  const [cartItems, setCartItems] = useState<CartItem[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedRegion, setSelectedRegion] = useState<Region | undefined>(undefined)
  const pageSize = 7

  // 生成所有日期列表
  const allDates = useMemo(() => {
    const startDate = dayjs(inventoryItem.availableStartDate)
    const endDate = dayjs(inventoryItem.availableEndDate)
    const dates: Dayjs[] = []
    
    let current = startDate
    while (current <= endDate) {
      dates.push(current)
      current = current.add(1, 'day')
    }
    return dates
  }, [inventoryItem.availableStartDate, inventoryItem.availableEndDate])

  // 当前页的日期列表
  const dateList = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize
    return allDates.slice(startIndex, startIndex + pageSize)
  }, [allDates, currentPage])

  const totalPages = Math.ceil(allDates.length / pageSize)

  // 计算可选时段数
  const availableCount = useMemo(() => {
    if (!selectedDate) return 0
    const dateStr = selectedDate.format('YYYY-MM-DD')
    const statuses = generateTimeSlotStatuses(inventoryItem.id, dateStr)
    return statuses.filter(s => s === TimeSlotStatus.AVAILABLE).length
  }, [inventoryItem.id, selectedDate])

  // 单个时段价格
  const slotPrice = useMemo(() => {
    return calcSlotPrice(inventoryItem.dailyPrice, availableCount || 1)
  }, [inventoryItem.dailyPrice, availableCount])

  // 检查某个日期的某个时段是否已被加购到购物车
  const isMealSlotLocked = (date: Dayjs, mealSlot: typeof MEAL_TIME_SLOTS[0]) => {
    const dateStr = date.format('YYYY-MM-DD')
    return cartItems.some(item => 
      item.date === dateStr && 
      mealSlot.slots.some(slotIndex => item.timeSlots.includes(slotIndex))
    )
  }

  // 获取某个日期某时段的综合状态
  const getMealSlotStatus = (date: Dayjs, mealSlot: typeof MEAL_TIME_SLOTS[0]) => {
    const dateStr = date.format('YYYY-MM-DD')
    const statuses = generateTimeSlotStatuses(inventoryItem.id, dateStr)
    
    // 检查是否已被锁定（已加购到购物车）
    const locked = isMealSlotLocked(date, mealSlot)
    
    // 统计该时段内所有半小时的状态
    const slotStates = mealSlot.slots.map(slotIndex => statuses[slotIndex])
    
    // 如果已被锁定，显示为"已锁定"
    if (locked) {
      return {
        status: 'locked' as const,
        availableSlots: slotStates.filter(s => s === TimeSlotStatus.AVAILABLE).length,
        totalSlots: mealSlot.slots.length,
      }
    }
    
    // 统计各状态的数量
    const availableCount = slotStates.filter(s => s === TimeSlotStatus.AVAILABLE).length
    const soldOutCount = slotStates.filter(s => s === TimeSlotStatus.SOLD_OUT).length
    const unavailableCount = slotStates.filter(s => s === TimeSlotStatus.UNAVAILABLE).length
    
    // 【修改逻辑】如果有售罄时段且无可用时段，显示为"售罄"
    if (soldOutCount > 0 && availableCount === 0) {
      return { 
        status: 'soldOut' as const, 
        availableSlots: 0, 
        totalSlots: mealSlot.slots.length 
      }
    }
    
    // 如果有可售时段（即使有部分售罄也显示为可售）
    if (availableCount > 0) {
      return {
        status: 'available' as const,
        availableSlots: availableCount,
        totalSlots: mealSlot.slots.length,
      }
    }
    
    // 否则显示为"不可售"
    return { 
      status: 'unavailable' as const, 
      availableSlots: 0, 
      totalSlots: mealSlot.slots.length 
    }
  }

  // 计算时段总价
  const getMealSlotPrice = (mealSlot: typeof MEAL_TIME_SLOTS[0], availableSlots: number) => {
    const pricePerSlot = calcSlotPrice(inventoryItem.dailyPrice, availableCount || 1)
    return pricePerSlot * availableSlots
  }

  // 点击日期
  const handleDateClick = (date: Dayjs) => {
    setSelectedDate(date)
    setSelectedMealSlot(null)
  }

  // 点击时段格子
  const handleMealSlotClick = (date: Dayjs, mealSlot: typeof MEAL_TIME_SLOTS[0]) => {
    const status = getMealSlotStatus(date, mealSlot)
    if (status.status !== 'available') {
      message.info('該時段暫不可購買')
      return
    }
    
    setSelectedDate(date)
    setSelectedMealSlot(mealSlot.key)
  }

  return (
    <div style={{ display: 'flex', gap: 16 }}>
      {/* 左侧：日期×时段表格 */}
      <Card 
        title={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <Space>
              <CalendarOutlined />
              <span>選擇日期：</span>
              <DatePicker 
                value={selectedDate}
                onChange={(date) => {
                  if (date) {
                    setSelectedDate(date)
                    setSelectedMealSlot(null)
                  }
                }}
                format="YYYY-MM-DD"
                style={{ width: 160 }}
              />
              <span>商圈：</span>
              <Select
                placeholder="全部"
                value={selectedRegion}
                onChange={(value) => setSelectedRegion(value)}
                allowClear
                style={{ width: 120 }}
                options={REGION_OPTIONS}
              />
            </Space>
            {/* 图例 */}
            <Space size={16}>
              <Space size={4}>
                <div style={{ width: 16, height: 16, background: '#52c41a', borderRadius: 3 }} />
                <span style={{ fontSize: 12, color: '#595959' }}>可售</span>
              </Space>
              <Space size={4}>
                <div style={{ width: 16, height: 16, background: '#ff4d4f', borderRadius: 3 }} />
                <span style={{ fontSize: 12, color: '#595959' }}>售罄</span>
              </Space>
              <Space size={4}>
                <div style={{ width: 16, height: 16, background: '#d9d9d9', borderRadius: 3 }} />
                <span style={{ fontSize: 12, color: '#595959' }}>不可售</span>
              </Space>
              <Space size={4}>
                <div style={{ width: 16, height: 16, background: '#e6f7ff', border: '1px solid #1890ff', borderRadius: 3 }} />
                <span style={{ fontSize: 12, color: '#595959' }}>已选中</span>
              </Space>
              <Space size={4}>
                <div style={{ width: 16, height: 16, background: '#f9f0ff', border: '1px solid #722ed1', borderRadius: 3 }} />
                <span style={{ fontSize: 12, color: '#595959' }}>已锁定</span>
              </Space>
            </Space>
          </div>
        }
        style={{ flex: 1 }}
      >


        {/* 表格 */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ 
            width: '100%', 
            borderCollapse: 'collapse',
            fontSize: 13,
          }}>
            {/* 表头 */}
            <thead>
              <tr style={{ background: '#f5f5f5' }}>
                <th style={{ 
                  padding: '12px 8px', 
                  border: '1px solid #e8e8e8',
                  fontWeight: 600,
                  color: '#333',
                  width: 100,
                }}>
                  日期
                </th>
                {MEAL_TIME_SLOTS.map(meal => (
                  <th 
                    key={meal.key}
                    style={{ 
                      padding: '12px 8px', 
                      border: '1px solid #e8e8e8',
                      fontWeight: 600,
                      color: '#333',
                      minWidth: 120,
                    }}
                  >
                    <div>{meal.label}</div>
                    <div style={{ fontSize: 11, color: '#8c8c8c', marginTop: 2 }}>{meal.timeRange}</div>
                  </th>
                ))}
              </tr>
            </thead>

            {/* 数据行 */}
            <tbody>
              {dateList.map(date => {
                const isDateSelected = selectedDate?.format('YYYY-MM-DD') === date.format('YYYY-MM-DD')
                return (
                  <tr key={date.format('YYYY-MM-DD')}>
                    {/* 日期列 */}
                    <td 
                      onClick={() => handleDateClick(date)}
                      style={{ 
                        padding: '10px 6px', 
                        border: '1px solid #e8e8e8',
                        textAlign: 'center',
                        cursor: 'pointer',
                        background: isDateSelected ? '#e6f7ff' : '#fff',
                        fontWeight: isDateSelected ? 600 : 400,
                        transition: 'all 0.2s',
                      }}
                    >
                      <div style={{ fontSize: 13, color: '#333' }}>{date.format('MM-DD')}</div>
                      <div style={{ fontSize: 10, color: '#8c8c8c', marginTop: 2 }}>
                        {['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][date.day()]}
                      </div>
                    </td>

                    {/* 时段列 */}
                    {MEAL_TIME_SLOTS.map(meal => {
                      const status = getMealSlotStatus(date, meal)
                      // 售罄时也使用总时段数计算价格
                      const slotsForPrice = status.status === 'soldOut' ? meal.slots.length : status.availableSlots
                      const price = getMealSlotPrice(meal, slotsForPrice)
                      const isSelected = isDateSelected && selectedMealSlot === meal.key
                      const isAvailable = status.status === 'available'
                      const isSoldOut = status.status === 'soldOut'
                      const isLocked = status.status === 'locked'
                      
                      // 检查当前时段是否包含无折扣的半小时
                      const dateStr = date.format('YYYY-MM-DD')
                      const noDiscountSlots = getNoDiscountSlotsByRow(dateStr)
                      const hasNoDiscount = meal.slots.some(slotIndex => noDiscountSlots.includes(slotIndex))
                      
                      return (
                        <td 
                          key={meal.key}
                          onClick={() => handleMealSlotClick(date, meal)}
                          style={{ 
                            padding: '8px 6px', 
                            textAlign: 'center',
                            cursor: isAvailable ? 'pointer' : 'not-allowed',
                            background: isSelected ? '#e6f7ff' : 
                                       isLocked ? '#f9f0ff' :
                                       isSoldOut ? '#ffccc7' : 
                                       !isAvailable ? '#f5f5f5' : '#fff',
                            border: isSelected ? '2px solid #1890ff' : 
                                    isLocked ? '2px solid #722ed1' : 
                                    '1px solid #e8e8e8',
                            transition: 'all 0.2s',
                            opacity: !isAvailable && !isLocked ? 0.6 : 1,
                          }}
                        >
                          {/* 1. 状态标签 */}
                          <div style={{ marginBottom: 4 }}>
                            {status.status === 'available' && (
                              <Tag color="success" style={{ fontSize: 10, padding: '1px 4px' }}>
                                可售
                              </Tag>
                            )}
                            {status.status === 'locked' && (
                              <Tag color="#722ed1" style={{ fontSize: 10, padding: '1px 4px' }}>
                                已鎖定
                              </Tag>
                            )}
                            {status.status === 'soldOut' && (
                              <Tag color="error" style={{ fontSize: 10, padding: '1px 4px' }}>
                                售罄
                              </Tag>
                            )}
                            {status.status === 'unavailable' && (
                              <Tag color="default" style={{ fontSize: 10, padding: '1px 4px' }}>
                                不可售
                              </Tag>
                            )}
                          </div>

                          {/* 2. 售賣價格（折扣价） */}
                          {(isAvailable || isSoldOut || isLocked) && (
                            <>
                              <div style={{ 
                                fontSize: 16, 
                                fontWeight: 700, 
                                color: isSoldOut ? '#bfbfbf' : isLocked ? '#722ed1' : '#fa541c',
                                marginBottom: 2,
                              }}>
                                ${price}
                              </div>
                              
                              {/* 4. 原價展示 / 無折扣提示 */}
                              {hasNoDiscount ? (
                                <div style={{ 
                                  fontSize: 10, 
                                  color: '#fa541c',
                                  marginBottom: 2,
                                  fontWeight: 600,
                                }}>
                                  無折扣
                                </div>
                              ) : (
                                <div style={{ 
                                  fontSize: 10, 
                                  color: '#8c8c8c',
                                  marginBottom: 2,
                                  textDecoration: 'line-through',
                                }}>
                                  原價：${inventoryItem.dailyPrice}
                                </div>
                              )}
                            </>
                          )}
                          {!isAvailable && !isSoldOut && (
                            <div style={{ fontSize: 11, color: '#bfbfbf', marginTop: 4 }}>
                              --
                            </div>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
          
          {/* 分页控件 */}
          {totalPages > 1 && (
            <div style={{ 
              display: 'flex', 
              justifyContent: 'center', 
              alignItems: 'center', 
              gap: 8,
              marginTop: 16,
              paddingTop: 16,
              borderTop: '1px solid #e8e8e8',
            }}>
              <Button
                size="small"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              >
                上一頁
              </Button>
              <span style={{ fontSize: 12, color: '#8c8c8c' }}>
                第 {currentPage} / {totalPages} 頁（共 {allDates.length} 天）
              </span>
              <Button
                size="small"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              >
                下一頁
              </Button>
            </div>
          )}
        </div>
      </Card>

      {/* 右侧：当前所选 + 已选时段 + 费用结算 */}
      <div style={{ width: 400, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* 当前所选 */}
        <Card size="small" title={<Space><CalendarOutlined /><span>當前所選</span></Space>}>
          {selectedDate && selectedMealSlot ? (
            <div>
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: '#8c8c8c', whiteSpace: 'nowrap' }}>所選日期：</span>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{selectedDate.format('YYYY-MM-DD')}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: '#8c8c8c', whiteSpace: 'nowrap' }}>查看時段：</span>
                  <span style={{ fontSize: 14, color: '#52c41a', fontWeight: 600 }}>
                    {MEAL_TIME_SLOTS.find(m => m.key === selectedMealSlot)?.label}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: '#8c8c8c', whiteSpace: 'nowrap' }}>可售狀態：</span>
                  <Tag color="success">可售</Tag>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: '#8c8c8c', whiteSpace: 'nowrap' }}>售賣價格：</span>
                  <span style={{ fontSize: 20, fontWeight: 700, color: '#ff4d4f' }}>
                    ${(() => {
                      const meal = MEAL_TIME_SLOTS.find(m => m.key === selectedMealSlot)
                      if (!meal) return 0
                      const status = getMealSlotStatus(selectedDate, meal)
                      return getMealSlotPrice(meal, status.availableSlots)
                    })()}
                  </span>
                </div>
              </Space>
              
              {/* 底部加购按钮 */}
              <Button 
                type="primary" 
                block 
                size="large"
                onClick={() => {
                  if (!selectedDate || !selectedMealSlot) {
                    message.warning('請先選擇日期和時段')
                    return
                  }
                  
                  const meal = MEAL_TIME_SLOTS.find(m => m.key === selectedMealSlot)
                  if (!meal) return
                  
                  const dateStr = selectedDate.format('YYYY-MM-DD')
                  const statuses = generateTimeSlotStatuses(inventoryItem.id, dateStr)
                  const availableSlots = meal.slots.filter(slotIndex => statuses[slotIndex] === TimeSlotStatus.AVAILABLE)
                  
                  if (availableSlots.length === 0) {
                    message.warning('該時段暫無可售庫存')
                    return
                  }
                  
                  // 计算价格
                  const salePrice = getMealSlotPrice(meal, availableSlots.length)
                  const noDiscountSlots = getNoDiscountSlotsByRow(dateStr)
                  const hasNoDiscount = meal.slots.some(slotIndex => noDiscountSlots.includes(slotIndex))
                  const originalPrice = hasNoDiscount ? salePrice : inventoryItem.dailyPrice
                  
                  // 添加到购物车
                  const newItem: CartItem = {
                    key: `${dateStr}-${selectedMealSlot}-${Date.now()}`,
                    date: dateStr,
                    mealSlot: meal.label,
                    timeSlots: availableSlots,
                    originalPrice,
                    salePrice,
                  }
                  
                  setCartItems(prev => [...prev, newItem])
                  message.success(`已加購 ${dateStr} ${meal.label}`)
                  
                  // 重置选择
                  setSelectedDate(null)
                  setSelectedMealSlot(null)
                }}
                style={{ 
                  marginTop: 16, 
                  height: 40, 
                  fontSize: 15,
                  background: '#fa8c16',
                  borderColor: '#fa8c16',
                }}
              >
                加購
              </Button>
            </div>
          ) : (
            <Empty description="請選擇日期和時段" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          )}
        </Card>

        {/* 已选时段 */}
        <Card 
          size="small" 
          title="已選時段"
        >
          <div style={{ 
            fontSize: 11, 
            color: '#ff4d4f', 
            marginBottom: 12,
            lineHeight: 1.4,
          }}>
            (已加購的時段會被鎖定，鎖定狀態下其他商家無法購買，如需解除需手動移除)
          </div>
          <Table<CartItem>
            dataSource={cartItems}
            pagination={false}
            size="small"
            locale={{ emptyText: <Empty description="暫無已選時段" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
            columns={[
              {
                title: '日期',
                dataIndex: 'date',
                key: 'date',
                width: 110,
                render: (text: string) => (
                  <span style={{ fontSize: 12 }}>{text}</span>
                ),
              },
              {
                title: '時段',
                dataIndex: 'mealSlot',
                key: 'mealSlot',
                width: 70,
                render: (text: string) => (
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{text}</span>
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
                width: 60,
                align: 'center' as const,
                render: (_, record) => (
                  <Button
                    type="link"
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    style={{ padding: 0, fontSize: 12 }}
                    onClick={() => {
                      setCartItems(prev => prev.filter(item => item.key !== record.key))
                      message.success('已移除')
                    }}
                  >
                    移除
                  </Button>
                ),
              },
            ]}
          />
        </Card>

        {/* 费用结算 */}
        <Card 
          size="small" 
          title="費用結算"
        >
          <table style={{ width: '100%', fontSize: 12, marginBottom: 12 }}>
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
                    ${cartItems.reduce((sum, item) => sum + item.originalPrice, 0)}
                  </span>
                </td>
                <td style={{ padding: '14px 8px', border: '1px solid #e8e8e8', textAlign: 'center' }}>
                  <span style={{ fontSize: 16, fontWeight: 600, color: '#fa8c16' }}>
                    -${cartItems.reduce((sum, item) => sum + (item.originalPrice - item.salePrice), 0)}
                  </span>
                </td>
                <td style={{ padding: '14px 8px', border: '1px solid #e8e8e8', textAlign: 'center', background: '#fff7f7' }}>
                  <span style={{ fontSize: 20, fontWeight: 700, color: '#ff4d4f' }}>
                    ${cartItems.reduce((sum, item) => sum + item.salePrice, 0)}
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
        </Card>
      </div>
    </div>
  )
}
