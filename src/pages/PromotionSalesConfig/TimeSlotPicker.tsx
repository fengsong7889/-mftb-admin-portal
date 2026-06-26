import { useState, useMemo } from 'react'
import { Card, DatePicker, Button, Tag, Space, message } from 'antd'
import { ShoppingCartOutlined, CalendarOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import {
  TimeSlotStatus,
  TIME_SLOT_COLORS,
  TIME_SLOT_LABELS,
  generateTimeSlotDefs,
  generateTimeSlotStatuses,
  calcSlotPrice,
  type InventoryItem,
  type TimeSlotDef,
} from './types'

interface TimeSlotPickerProps {
  inventoryItem: InventoryItem
  onAddToCart: (date: string, timeSlots: number[], totalPrice: number) => void
}

export default function TimeSlotPicker({ inventoryItem, onAddToCart }: TimeSlotPickerProps) {
  const [selectedDate, setSelectedDate] = useState<Dayjs | null>(null)
  const [selectedSlots, setSelectedSlots] = useState<number[]>([])

  // 可购买日期范围
  const startDate = dayjs(inventoryItem.availableStartDate)
  const endDate = dayjs(inventoryItem.availableEndDate)

  // 日期禁用逻辑
  const disabledDate = (current: Dayjs) => {
    return current < startDate || current > endDate
  }

  // 当前日期的时段定义（含状态）
  const timeSlotDefs = useMemo<TimeSlotDef[]>(() => {
    if (!selectedDate) return []
    const dateStr = selectedDate.format('YYYY-MM-DD')
    const statuses = generateTimeSlotStatuses(inventoryItem.id, dateStr)
    return generateTimeSlotDefs(statuses)
  }, [selectedDate, inventoryItem.id])

  // 可选时段数
  const availableCount = useMemo(() => {
    return timeSlotDefs.filter(s => s.status === TimeSlotStatus.AVAILABLE).length
  }, [timeSlotDefs])

  // 单个时段价格
  const slotPrice = useMemo(() => {
    return calcSlotPrice(inventoryItem.dailyPrice, availableCount)
  }, [inventoryItem.dailyPrice, availableCount])

  // 选中时段总价
  const totalPrice = selectedSlots.length * slotPrice

  // 点击时段
  const handleSlotClick = (slot: TimeSlotDef) => {
    if (slot.status === TimeSlotStatus.UNAVAILABLE || slot.status === TimeSlotStatus.SOLD_OUT) {
      return
    }
    if (slot.status === TimeSlotStatus.SELECTED) {
      setSelectedSlots(prev => prev.filter(i => i !== slot.index))
    } else {
      setSelectedSlots(prev => [...prev, slot.index].sort((a, b) => a - b))
    }
  }

  // 日期变更
  const handleDateChange = (date: Dayjs | null) => {
    setSelectedDate(date)
    setSelectedSlots([])
  }

  // 加购
  const handleAddToCart = () => {
    if (selectedSlots.length === 0) {
      message.warning('請先選擇時段')
      return
    }
    const dateStr = selectedDate!.format('YYYY-MM-DD')
    onAddToCart(dateStr, selectedSlots, totalPrice)
    setSelectedSlots([])
    message.success(`已加購 ${selectedSlots.length} 個時段`)
  }

  // 获取时段最终状态（覆盖 selected 状态）
  const getSlotDisplayStatus = (slot: TimeSlotDef): TimeSlotStatus => {
    if (selectedSlots.includes(slot.index) && slot.status === TimeSlotStatus.AVAILABLE) {
      return TimeSlotStatus.SELECTED
    }
    return slot.status
  }

  return (
    <Card
      title={
        <Space>
          <CalendarOutlined />
          <span>選擇日期和時段</span>
        </Space>
      }
      style={{ marginTop: 16 }}
    >
      {/* 价格信息 */}
      <div style={{ marginBottom: 16, padding: '12px 16px', background: '#fffbe6', borderRadius: 8, border: '1px solid #ffe58f' }}>
        <Space size={24}>
          <span>
            單日單價：<strong style={{ color: '#fa8c16', fontSize: 16 }}>MOP {inventoryItem.dailyPrice.toLocaleString()}</strong>
          </span>
          <span>
            可選時段：<strong style={{ color: '#52c41a' }}>{availableCount}</strong> 個
          </span>
          <span>
            單時段價格：<strong style={{ color: '#1890ff' }}>MOP {slotPrice}</strong>
          </span>
        </Space>
      </div>

      {/* 日期选择 */}
      <div style={{ marginBottom: 20 }}>
        <span style={{ marginRight: 12, fontWeight: 500 }}>選擇日期：</span>
        <DatePicker
          value={selectedDate}
          onChange={handleDateChange}
          disabledDate={disabledDate}
          placeholder="請選擇購買日期"
          style={{ width: 200 }}
        />
        <span style={{ marginLeft: 12, color: '#8c8c8c', fontSize: 13 }}>
          可購買範圍：{inventoryItem.availableStartDate} ~ {inventoryItem.availableEndDate}
        </span>
      </div>

      {/* 24小时时间轴时段选择器 */}
      {selectedDate && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ marginBottom: 12, fontWeight: 500 }}>
            選擇時段（{selectedDate.format('YYYY-MM-DD')}）：
          </div>

          {/* 图例 */}
          <div style={{ marginBottom: 16, display: 'flex', gap: 16 }}>
            {Object.entries(TIME_SLOT_LABELS).map(([status, label]) => (
              <Space key={status} size={4}>
                <div style={{
                  width: 16,
                  height: 16,
                  borderRadius: 3,
                  background: TIME_SLOT_COLORS[status as TimeSlotStatus],
                  border: status === TimeSlotStatus.SELECTED ? '2px solid #096dd9' : '1px solid #d9d9d9',
                  backgroundImage: status === TimeSlotStatus.SOLD_OUT
                    ? 'repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(255,255,255,0.3) 3px, rgba(255,255,255,0.3) 6px)'
                    : undefined,
                }} />
                <span style={{ fontSize: 13, color: '#595959' }}>{label}</span>
              </Space>
            ))}
          </div>

          {/* 时间轴容器 */}
          <div style={{
            background: '#fafafa',
            borderRadius: 8,
            padding: '16px 12px',
            border: '1px solid #f0f0f0',
          }}>
            {/* 时间刻度标签 */}
            <div style={{ display: 'flex', marginBottom: 4, paddingLeft: 2 }}>
              {Array.from({ length: 25 }, (_, i) => (
                <div
                  key={i}
                  style={{
                    flex: i < 24 ? 1 : 0,
                    fontSize: 11,
                    color: '#8c8c8c',
                    textAlign: 'left',
                    minWidth: i < 24 ? undefined : 0,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {String(i % 24).padStart(2, '0')}:00
                </div>
              ))}
            </div>

            {/* 时段色块行 */}
            <div style={{ display: 'flex', gap: 2, height: 40 }}>
              {timeSlotDefs.map(slot => {
                const displayStatus = getSlotDisplayStatus(slot)
                const color = TIME_SLOT_COLORS[displayStatus]
                const isClickable = slot.status === TimeSlotStatus.AVAILABLE
                const isSelected = displayStatus === TimeSlotStatus.SELECTED

                return (
                  <div
                    key={slot.index}
                    onClick={() => handleSlotClick(slot)}
                    title={`${slot.startLabel} - ${slot.endLabel} | ${TIME_SLOT_LABELS[displayStatus]}${isClickable ? ` | MOP ${slotPrice}` : ''}`}
                    style={{
                      flex: 1,
                      background: color,
                      borderRadius: 3,
                      cursor: isClickable ? 'pointer' : 'not-allowed',
                      border: isSelected ? '2px solid #096dd9' : '1px solid rgba(0,0,0,0.06)',
                      boxShadow: isSelected ? '0 0 6px rgba(24,144,255,0.4)' : undefined,
                      transition: 'all 0.15s ease',
                      backgroundImage: displayStatus === TimeSlotStatus.SOLD_OUT
                        ? 'repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(255,255,255,0.3) 3px, rgba(255,255,255,0.3) 6px)'
                        : undefined,
                      opacity: displayStatus === TimeSlotStatus.UNAVAILABLE ? 0.5 : 1,
                      position: 'relative',
                    }}
                  >
                    {isSelected && (
                      <div style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        color: '#fff',
                        fontSize: 10,
                        fontWeight: 700,
                      }}>
                        ✓
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* 半小时刻度 */}
            <div style={{ display: 'flex', marginTop: 4, paddingLeft: 2 }}>
              {Array.from({ length: 24 }, (_, i) => (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    fontSize: 10,
                    color: '#bfbfbf',
                    textAlign: 'left',
                    paddingLeft: 4,
                  }}
                >
                  :30
                </div>
              ))}
            </div>
          </div>

          {/* 选中时段汇总 */}
          {selectedSlots.length > 0 && (
            <div style={{ marginTop: 16, padding: '12px 16px', background: '#e6f7ff', borderRadius: 8, border: '1px solid #91d5ff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong>已選 {selectedSlots.length} 個時段：</strong>
                  <span style={{ color: '#595959', marginLeft: 8 }}>
                    {selectedSlots.map(i => {
                      const def = timeSlotDefs[i]
                      return def ? `${def.startLabel}-${def.endLabel}` : ''
                    }).join('、')}
                  </span>
                </div>
                <div>
                  <Tag color="blue" style={{ fontSize: 14, padding: '4px 12px' }}>
                    小計：MOP {totalPrice.toLocaleString()}
                  </Tag>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 加购按钮 */}
      <div style={{ textAlign: 'right', marginTop: 16 }}>
        <Button
          type="primary"
          size="large"
          icon={<ShoppingCartOutlined />}
          disabled={selectedSlots.length === 0}
          onClick={handleAddToCart}
        >
          加入購物車{selectedSlots.length > 0 ? ` (${selectedSlots.length}個時段)` : ''}
        </Button>
      </div>
    </Card>
  )
}
