import { useState, useMemo, useEffect, useRef } from 'react'
import { Tag, Button, Space, message, Empty, Modal, Select, Card, Form, Spin } from 'antd'
import {
  CalendarOutlined,
  SearchOutlined,
  ReloadOutlined,
  GiftOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import { fetchAdAlgorithms, fetchAdNewStoreInventory, placeAdNewStoreOrder } from '../../api/adPromotion'
import type { AdNewStoreInventoryVO } from '../../api/adPromotion'
import { fetchStores } from '../../api/store'

// 中文星期映射
const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六']

/* ---- 數字動畫 Hook（與訂單詳情推廣數據卡片一致） ---- */
function useCountUp(target: number, duration = 1200) {
  const [value, setValue] = useState(0)
  const rafRef = useRef<number>(0)
  useEffect(() => {
    const start = performance.now()
    const animate = (now: number) => {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress)
      setValue(Math.round(target * eased))
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate)
      }
    }
    rafRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafRef.current)
  }, [target, duration])
  return value
}

/* ---- 動畫數字組件 ---- */
function AnimatedNumber({ value, suffix }: { value: number; suffix?: string }) {
  const animated = useCountUp(value)
  return <>{animated.toLocaleString()}{suffix && <span style={{ fontSize: 13, fontWeight: 400, marginLeft: 2 }}>{suffix}</span>}</>
}

// algorithm/store/BD options from backend

export default function NewStoreDayPicker() {
  const navigate = useNavigate()

  // 查询条件状态
  const [searchAlgorithm, setSearchAlgorithm] = useState<number | null>(null)
  const [searchBrand, setSearchBrand] = useState<string | null>(null)
  const [searchStoreCode, setSearchStoreCode] = useState<string | null>(null)
  const [searchBD, setSearchBD] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(false)
  const [queriedStoreCode, setQueriedStoreCode] = useState<string | null>(null)
  const [queriedGroupCode, setQueriedGroupCode] = useState<string | null>(null)

  const [algorithmOptions, setAlgorithmOptions] = useState<{ label: string; value: number; brand?: string }[]>([])
  const [storeOptions, setStoreOptions] = useState<{ label: string; value: string }[]>([])
  const [fetchedStores, setFetchedStores] = useState<{ storeCode: string; storeName: string; id?: number; bdList?: { bdEmpId: string; bdName?: string }[] }[]>([])
  const [bdOptions, setBdOptions] = useState<{ label: string; value: string }[]>([])
  const [inventory, setInventory] = useState<AdNewStoreInventoryVO | null>(null)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [selectedDates, setSelectedDates] = useState<string[]>([])
  const [currentMonth, setCurrentMonth] = useState<Dayjs>(dayjs())
  const [isConfirmModalVisible, setIsConfirmModalVisible] = useState(false)
  const [isSuccessModalVisible, setIsSuccessModalVisible] = useState(false)
  const [lastSubmitDays, setLastSubmitDays] = useState(0)

  useEffect(() => {
    fetchAdAlgorithms({ algoType: 2, status: 1, size: 100 }).then(res => {
      setAlgorithmOptions(
        (res.records || []).map(a => ({ label: a.algoName, value: a.id!, brand: a.brand }))
      )
    }).catch(() => {})
  }, [])

  const giftInfo = useMemo(() => {
    if (!inventory) return null
    return {
      totalDays: inventory.totalGiftDays,
      usedDays: inventory.usedGiftDays,
      remainingDays: inventory.remainingGiftDays,
      expireDate: inventory.expireDate || '',
    }
  }, [inventory])

  const queriedStoreName = inventory?.storeName || queriedStoreCode

  const handleAlgorithmChange = (value: number | null) => {
    setSearchAlgorithm(value)
    const algo = algorithmOptions.find(a => a.value === value)
    setSearchBrand(algo?.brand || null)
    // 切换算法时清空门店和BD
    setSearchStoreCode(null)
    setSearchBD(null)
    setStoreOptions([])
    setBdOptions([])
    setFetchedStores([])
    if (algo?.brand) {
      fetchStores({ brand: algo.brand, size: 200 }).then(res => {
        const records = res.records || []
        setStoreOptions(
          records.map(s => ({ label: `${s.storeName}（${s.storeCode}）`, value: s.storeCode }))
        )
        setFetchedStores(
          records.map(s => ({ storeCode: s.storeCode, storeName: s.storeName, id: s.id, bdList: s.bdList || [] }))
        )
      }).catch(() => {})
    }
  }

  const handleStoreChange = (value: string | null) => {
    setSearchStoreCode(value)
    setSearchBD(null)
    setBdOptions([])
    if (value) {
      const store = fetchedStores.find(s => s.storeCode === value)
      if (store?.bdList && store.bdList.length > 0) {
        const opts = store.bdList.map(bd => ({
          label: bd.bdName ? `${bd.bdName}（${bd.bdEmpId}）` : bd.bdEmpId,
          value: bd.bdEmpId,
        }))
        setBdOptions(opts)
        // 只有一个BD时自动选中
        if (opts.length === 1) {
          setSearchBD(opts[0].value)
        }
      }
    }
  }

  const handleSearch = async () => {
    if (!searchAlgorithm) { message.warning('請選擇算法名稱'); return }
    if (!searchStoreCode) { message.warning('請選擇門店名稱'); return }
    setQueriedStoreCode(searchStoreCode)
    setSelectedDates([])
    setCurrentMonth(dayjs())
    setHasSearched(true)
    setLoading(true)
    try {
      const data = await fetchAdNewStoreInventory(searchAlgorithm, searchStoreCode)
      setInventory(data)
    } catch {
      setInventory(null)
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    setSearchAlgorithm(null); setSearchBrand(null)
    setSearchStoreCode(null); setSearchBD(null)
    setQueriedStoreCode(null); setQueriedGroupCode(null)
    setSelectedDates([]); setInventory(null)
    setHasSearched(false)
  }

  // 可选日期范围：今天 → 赠送有效期止
  const rangeStart = dayjs().startOf('day')
  const rangeEnd = giftInfo ? dayjs(giftInfo.expireDate).startOf('day') : rangeStart

  // 可选月份列表（用于月份切换器）
  const months = useMemo(() => {
    if (!giftInfo) return []
    const result: Dayjs[] = []
    let current = rangeStart.startOf('month')
    while (current.isBefore(rangeEnd) || current.isSame(rangeEnd, 'month')) {
      result.push(current)
      current = current.add(1, 'month')
    }
    return result
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [giftInfo?.expireDate])

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

  // 日期是否在可选范围内（今天 → 有效期止）
  const isDateSelectable = (date: Dayjs | null) => {
    if (!date) return false
    return !date.isBefore(rangeStart) && !date.isAfter(rangeEnd)
  }

  // 切换日期选择（选择数量不可超过剩余赠送天数）
  const handleDateClick = (date: Dayjs | null) => {
    if (!date || !giftInfo) return
    if (!isDateSelectable(date)) { message.warning('該日期不在贈送有效期內'); return }
    const dateStr = date.format('YYYY-MM-DD')
    if (selectedDates.includes(dateStr)) {
      setSelectedDates(selectedDates.filter(d => d !== dateStr))
      return
    }
    if (selectedDates.length >= giftInfo.remainingDays) {
      message.warning(`最多可選 ${giftInfo.remainingDays} 天（剩餘贈送天數）`)
      return
    }
    setSelectedDates([...selectedDates, dateStr].sort())
  }

  const handleClearSelected = () => setSelectedDates([])

  // 按月分组已选日期
  const datesByMonth = useMemo(() => {
    const grouped: Record<string, number[]> = {}
    selectedDates.forEach(dateStr => {
      const date = dayjs(dateStr)
      const monthKey = date.format('YYYY-MM')
      if (!grouped[monthKey]) grouped[monthKey] = []
      grouped[monthKey].push(date.date())
    })
    return Object.entries(grouped)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, days]) => ({ month, days: days.sort((a, b) => a - b) }))
  }, [selectedDates])

  // 提交订单：打开确认弹窗
  const handleSubmitOrder = () => {
    if (selectedDates.length === 0) { message.warning('請先選擇推廣日期'); return }
    setIsConfirmModalVisible(true)
  }

  const handleConfirmPayment = async () => {
    if (!queriedStoreCode || !searchAlgorithm || !inventory) return
    setSubmitting(true)
    try {
      await placeAdNewStoreOrder({
        algoId: searchAlgorithm,
        groupCode: queriedGroupCode || '',
        storeCode: queriedStoreCode,
        bdEmpId: searchBD || undefined,
        giftDays: selectedDates.length,
        cells: selectedDates.map(d => ({ bizDate: d })),
      })
      setLastSubmitDays(selectedDates.length)
      setSelectedDates([])
      setIsConfirmModalVisible(false)
      setIsSuccessModalVisible(true)
      const data = await fetchAdNewStoreInventory(searchAlgorithm, queriedStoreCode)
      setInventory(data)
    } catch {
      message.error('下單失敗，請重試')
    } finally {
      setSubmitting(false)
    }
  }

  const handleViewOrder = () => {
    setIsSuccessModalVisible(false)
    navigate(`/promotion-order-manage?type=${encodeURIComponent('新店廣告')}&from=ad-sales`)
  }
  const handleContinuePurchase = () => { setIsSuccessModalVisible(false); message.success('繼續選擇推廣天數') }

  // 获取日历单元格样式
  const getCellStyle = (date: Dayjs | null) => {
    if (!date) return { background: '#fafafa', cursor: 'default', border: '1px solid #e8e8e8' }
    const selectable = isDateSelectable(date)
    if (!selectable) return { background: '#f5f5f5', cursor: 'not-allowed', border: '1px solid #e8e8e8', color: '#bfbfbf' }
    const isSelected = selectedDates.includes(date.format('YYYY-MM-DD'))
    if (isSelected) return { background: '#f6ffed', cursor: 'pointer', border: '2px solid #52c41a', color: '#52c41a', fontWeight: 600 }
    return { background: '#fff', cursor: 'pointer', border: '1px solid #e8e8e8', color: '#333' }
  }

  return (
    <div>
      {/* 查询区域 - 始终显示 */}
      <div className="search-section" style={{ marginBottom: 16 }}>
        <Form layout="inline" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px 12px' }}>
          <Form.Item label="算法名稱">
            <Select placeholder="請選擇算法" value={searchAlgorithm} onChange={handleAlgorithmChange} allowClear showSearch optionFilterProp="label"
              options={algorithmOptions} />
          </Form.Item>
          <Form.Item label="所屬品牌">
            <Select placeholder="選擇算法後自動帶出" value={searchBrand} onChange={(v) => setSearchBrand(v)} allowClear
              options={[{ label: '閃蜂', value: 'flashBee' }, { label: 'mFood', value: 'mFood' }]} disabled />
          </Form.Item>
          <Form.Item label="門店名稱">
            <Select placeholder="支持ID和名稱搜索" value={searchStoreCode} onChange={handleStoreChange} allowClear showSearch optionFilterProp="label" options={storeOptions} />
          </Form.Item>
          <Form.Item label="歸屬BD">
            <Select placeholder="選擇門店後自動帶出" value={searchBD} onChange={(v) => setSearchBD(v)} allowClear showSearch
              filterOption={(input, option) => { const keyword = input.toLowerCase(); const label = (option?.label ?? '').toString().toLowerCase(); return label.includes(keyword) }}
              options={bdOptions} />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>查詢</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>重置</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      <Spin spinning={loading}>
      {!hasSearched ? (
        <Card bodyStyle={{ padding: '48px 24px' }}>
          <Empty description="請先選擇算法名稱、所屬品牌、門店名稱，點擊查詢後展示該門店的新店剩餘推廣天數" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        </Card>
      ) : !giftInfo ? (
        <Card bodyStyle={{ padding: '48px 24px' }}>
          <Empty
            description={
              <span style={{ color: '#8c8c8c' }}>
                該門店暫無新店廣告贈送天數記錄，請先到「贈送管理」菜單為該門店贈送推廣天數
              </span>
            }
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        </Card>
      ) : (
        <>
          {/* 赠送天数概览 */}
          <Card
            size="small"
            title={<Space><GiftOutlined style={{ color: '#E8720C' }} /><span>新店剩餘推廣天數</span><span style={{ fontSize: 12, fontWeight: 400, color: '#8c8c8c' }}>（天數來源：贈送管理菜單）</span></Space>}
            style={{ marginBottom: 16 }}
          >
            <div key={queriedStoreCode} style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
              {[
                { label: '贈送總天數', value: <AnimatedNumber value={giftInfo.totalDays} suffix="天" />, icon: <GiftOutlined />, color: '#1890ff', bg: '#E6F7FF' },
                { label: '已使用天數', value: <AnimatedNumber value={giftInfo.usedDays} suffix="天" />, icon: <CheckCircleOutlined />, color: '#E8720C', bg: '#FFF7E6' },
                { label: '剩餘推廣天數', value: <AnimatedNumber value={giftInfo.remainingDays} suffix="天" />, icon: <CalendarOutlined />, color: '#52C41A', bg: '#F6FFED' },
                { label: '有效期止', value: <span style={{ fontSize: 18 }}>{giftInfo.expireDate}</span>, icon: <ClockCircleOutlined />, color: '#722ED1', bg: '#F9F0FF' },
              ].map((stat, i) => (
                <div key={i} style={{
                  padding: '16px', borderRadius: 12, background: stat.bg,
                  border: `1px solid ${stat.color}22`, textAlign: 'center',
                  transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)', cursor: 'default',
                  position: 'relative', overflow: 'hidden',
                }}
                  onMouseEnter={e => {
                    e.currentTarget.style.transform = 'translateY(-4px)'
                    e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.1)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = 'translateY(0)'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                >
                  <div style={{ fontSize: 20, color: stat.color, marginBottom: 6 }}>{stat.icon}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: stat.color }}>{stat.value}</div>
                  <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 2 }}>{stat.label}</div>
                </div>
              ))}
            </div>
          </Card>

          {giftInfo.remainingDays === 0 && selectedDates.length === 0 ? (
            <Card bodyStyle={{ padding: '48px 24px' }}>
              <Empty
                description={<span style={{ color: '#8c8c8c' }}>該門店贈送天數已全部使用完畢，如需繼續推廣請到「贈送管理」菜單追加贈送</span>}
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            </Card>
          ) : (
            <div style={{ display: 'flex', gap: 16 }}>
              {/* 左侧：月份选择 + 日历 */}
              <div style={{ flex: 1 }}>
                <Card title={<Space><CalendarOutlined /><span>選擇推廣日期</span><span style={{ fontSize: 12, fontWeight: 400, color: '#8c8c8c' }}>（可選範圍：今天 ~ {giftInfo.expireDate}）</span></Space>} style={{ marginBottom: 16 }} bodyStyle={{ padding: '12px 20px' }}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {months.map(month => {
                      const monthStr = month.format('YYYY-MM')
                      const isSelected = currentMonth.format('YYYY-MM') === monthStr
                      const hasSelectedDates = datesByMonth.some(g => g.month === monthStr)
                      return (
                        <div
                          key={monthStr}
                          onClick={() => setCurrentMonth(month)}
                          style={{
                            flex: 1, padding: '8px 4px', borderRadius: 6, position: 'relative',
                            border: isSelected ? '2px solid #fa8c16' : '1px solid #e8e8e8',
                            background: isSelected ? '#fff7e6' : '#fff',
                            cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s',
                          }}
                        >
                          <span style={{ fontSize: 15, fontWeight: isSelected ? 700 : 500, color: isSelected ? '#fa8c16' : '#333' }}>
                            {month.format('M月')}
                          </span>
                          {hasSelectedDates && (
                            <div style={{
                              position: 'absolute', top: 3, right: 3,
                              width: 8, height: 8, borderRadius: '50%',
                              background: '#ff4d4f',
                            }} />
                          )}
                        </div>
                      )
                    })}
                  </div>
                </Card>

                {/* 日历网格 */}
                <div style={{ border: '1px solid #e8e8e8', borderRadius: 8, overflow: 'hidden' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', background: '#f5f5f5', borderBottom: '1px solid #e8e8e8' }}>
                    {WEEKDAY_LABELS.map((label, index) => (
                      <div key={label} style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 600, fontSize: 13, color: index === 0 || index === 6 ? '#fa541c' : '#333', borderRight: index < 6 ? '1px solid #e8e8e8' : 'none' }}>
                        {label}
                      </div>
                    ))}
                  </div>
                  {calendarGrid.map((week, weekIndex) => (
                    <div key={weekIndex} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: weekIndex < calendarGrid.length - 1 ? '1px solid #e8e8e8' : 'none' }}>
                      {week.map((date, dayIndex) => {
                        const cellStyle = getCellStyle(date)
                        const dateStr = date?.format('YYYY-MM-DD') || ''
                        const isSelected = date ? selectedDates.includes(dateStr) : false
                        const isToday = date?.isSame(dayjs(), 'day')
                        const selectable = date ? isDateSelectable(date) : false
                        return (
                          <div key={`${weekIndex}-${dayIndex}`} onClick={() => handleDateClick(date)}
                            style={{ padding: '8px 6px', textAlign: 'center', minHeight: 52, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRight: dayIndex < 6 ? '1px solid #e8e8e8' : 'none', ...cellStyle, transition: 'all 0.2s' }}>
                            {date ? (
                              <>
                                <div style={{ fontSize: 14, fontWeight: isSelected ? 700 : (isToday ? 600 : 400), position: 'relative' }}>
                                  {date.date()}
                                  {isToday && !isSelected && <span style={{ position: 'absolute', bottom: -2, left: '50%', transform: 'translateX(-50%)', width: 4, height: 4, borderRadius: '50%', background: '#1890ff' }} />}
                                </div>
                                {selectable && (
                                  isSelected
                                    ? <span style={{ fontSize: 9, color: '#E8720C', marginTop: 1, fontWeight: 600 }}>已選擇</span>
                                    : <span style={{ fontSize: 9, color: '#52c41a', marginTop: 1 }}>可推廣</span>
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

              {/* 右侧：已选天数 + 提交订单 */}
              <div style={{ width: 400, display: 'flex', flexDirection: 'column', gap: 16 }}>
                <Card size="small" title={<Space><CalendarOutlined /><span>已選推廣天數</span></Space>}
                  extra={selectedDates.length > 0 && <Button type="link" size="small" danger onClick={handleClearSelected}>清空</Button>}>
                  {selectedDates.length > 0 ? (
                    <Space direction="vertical" size={12} style={{ width: '100%' }}>
                      {datesByMonth.map(({ month, days }) => (
                        <div key={month} style={{ background: '#fafafa', borderRadius: 6, padding: '10px 12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <span style={{ fontSize: 12, color: '#8c8c8c', whiteSpace: 'nowrap' }}>所選月份：</span>
                            <span style={{ fontSize: 14, fontWeight: 600 }}>{month}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                            <span style={{ fontSize: 12, color: '#8c8c8c', whiteSpace: 'nowrap' }}>已選擇：</span>
                            <span style={{ fontSize: 13, fontWeight: 500 }}>{days.map(d => `${d}號`).join('、')}</span>
                          </div>
                        </div>
                      ))}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 12, color: '#8c8c8c', whiteSpace: 'nowrap' }}>選擇天數合計：</span>
                        <span style={{ fontSize: 14, fontWeight: 600, color: '#52c41a' }}>{selectedDates.length}天</span>
                      </div>
                    </Space>
                  ) : (
                    <Empty description="請在日曆中選擇推廣日期" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                  )}
                </Card>

                {/* 订单结算：赠送天数抵扣 */}
                <Card size="small" title="訂單結算">
                  <div style={{ padding: '12px 16px', marginBottom: 12, background: 'linear-gradient(135deg, #E8720C 0%, #F39C12 100%)', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, color: '#fff', opacity: 0.9 }}>剩餘贈送天數</span>
                    <span style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>{giftInfo.remainingDays} 天</span>
                  </div>
                  <div style={{ background: '#fafafa', borderRadius: 6, padding: '12px 16px', marginBottom: 12, fontSize: 13 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ color: '#595959' }}>本次使用贈送天數：</span>
                      <span style={{ fontWeight: 600, color: '#E8720C' }}>{selectedDates.length} 天</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ color: '#595959' }}>提交後剩餘天數：</span>
                      <span style={{ fontWeight: 600, color: '#52c41a' }}>{giftInfo.remainingDays - selectedDates.length} 天</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #d9d9d9', paddingTop: 8 }}>
                      <span style={{ color: '#595959', fontWeight: 600 }}>實付金額：</span>
                      <span style={{ fontWeight: 700, fontSize: 16, color: '#ff4d4f' }}>$0<span style={{ fontSize: 11, fontWeight: 400, color: '#8c8c8c', marginLeft: 4 }}>（贈送天數全額抵扣）</span></span>
                    </div>
                  </div>
                  <Button type="primary" block size="large" disabled={selectedDates.length === 0} onClick={handleSubmitOrder}
                    style={{ background: selectedDates.length > 0 ? '#ff4d4f' : '#d9d9d9', borderColor: selectedDates.length > 0 ? '#ff4d4f' : '#d9d9d9', height: 44, fontSize: 16, fontWeight: 600 }}>
                    支付訂單
                  </Button>
                </Card>
              </div>
            </div>
          )}
        </>
      )}
      </Spin>

      {/* 确认订单弹窗 */}
      <Modal title="確認訂單" open={isConfirmModalVisible} onOk={handleConfirmPayment} onCancel={() => setIsConfirmModalVisible(false)}
        okText="確定支付" cancelText="取消" okButtonProps={{ style: { background: '#ff4d4f', borderColor: '#ff4d4f' } }} width={560}>
        <div style={{ marginBottom: 16 }}>
          <h4 style={{ marginBottom: 12, fontSize: 14, color: '#595959' }}>推廣明細：</h4>
          <div style={{ background: '#fafafa', borderRadius: 6, padding: '12px 16px', marginBottom: 12, fontSize: 13 }}>
            <div style={{ display: 'flex', marginBottom: 8 }}>
              <span style={{ color: '#8c8c8c', whiteSpace: 'nowrap' }}>推廣門店：</span>
              <span style={{ fontWeight: 600 }}>{queriedStoreCode ? `${queriedStoreName}（${queriedStoreCode}）` : '-'}</span>
            </div>
            <div style={{ display: 'flex', marginBottom: 8 }}>
              <span style={{ color: '#8c8c8c', whiteSpace: 'nowrap' }}>推廣類型：</span>
              <span style={{ fontWeight: 600 }}>🏪 新店廣告</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start' }}>
              <span style={{ color: '#8c8c8c', whiteSpace: 'nowrap' }}>推廣日期：</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {selectedDates.map(d => <Tag key={d} color="orange" style={{ margin: 0 }}>{d}</Tag>)}
              </div>
            </div>
          </div>
        </div>
        <div style={{ background: '#fafafa', padding: 16, borderRadius: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}><span style={{ color: '#595959' }}>推廣天數合計：</span><span style={{ fontWeight: 600 }}>{selectedDates.length} 天</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, color: '#fa8c16' }}><span>贈送天數抵扣：</span><span style={{ fontWeight: 600 }}>-{selectedDates.length} 天</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, color: '#ff4d4f', borderTop: '1px solid #d9d9d9', paddingTop: 8, marginTop: 8 }}><span style={{ fontWeight: 600 }}>實付金額：</span><span style={{ fontWeight: 700 }}>$0</span></div>
        </div>
      </Modal>

      {/* 支付成功弹窗 */}
      <Modal title="提交成功" open={isSuccessModalVisible} onCancel={() => setIsSuccessModalVisible(false)}
        footer={[<Button key="view" type="primary" onClick={handleViewOrder}>查看訂單</Button>, <Button key="continue" onClick={handleContinuePurchase} style={{ background: '#fa8c16', borderColor: '#fa8c16', color: '#fff' }}>繼續購買</Button>]} width={400}>
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
          <p style={{ fontSize: 16, color: '#595959', marginBottom: 24 }}>恭喜！訂單提交成功</p>
          <div style={{ background: 'linear-gradient(135deg, #fff7e6 0%, #ffe58f 100%)', padding: '20px 16px', borderRadius: 8, marginBottom: 16 }}>
            <p style={{ fontSize: 14, color: '#8c8c8c', marginBottom: 8 }}>已使用贈送推廣天數</p>
            <p style={{ fontSize: 36, fontWeight: 700, color: '#fa541c', margin: 0, lineHeight: 1.2 }}>{lastSubmitDays} 天</p>
          </div>
        </div>
      </Modal>
    </div>
  )
}
