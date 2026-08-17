import { useState, useMemo, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Tag, Button, Space, message, Empty, Modal, Select, Card, Form } from 'antd'
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
import { AlgorithmType } from '../Recommend/constants'
import { fetchAdAlgorithms } from '../../api/adPromotion'

// 中文星期映射 → 移入組件內使用 t()
// const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六']

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

/** Mock数据 - 店铺列表（含BD信息） */
const MOCK_STORES = [
  { id: '10001', name: '威尼斯人酒店', bd: 'bd-001', bdName: '張偉' },
  { id: '10002', name: '皇朝廣場店', bd: 'bd-002', bdName: '李娜' },
  { id: '10003', name: '黑馬仕美食街', bd: 'bd-003', bdName: '王強' },
  { id: '10004', name: '新葡京旗艦店', bd: 'bd-001', bdName: '張偉' },
  { id: '10005', name: '官也街老店', bd: 'bd-004', bdName: '劉敏' },
]

/** 店铺下拉选项（展示ID） */
const STORE_OPTIONS = MOCK_STORES.map(s => ({
  label: `${s.name}（ID：${s.id}）`,
  value: s.id,
}))

/** BD选项 */
const BD_OPTIONS = [
  { label: '張偉', value: 'bd-001' },
  { label: '李娜', value: 'bd-002' },
  { label: '王強', value: 'bd-003' },
  { label: '劉敏', value: 'bd-004' },
]

/** 後端品牌名 → UI 品牌值 映射 */
const BACKEND_TO_UI_BRAND: Record<string, string> = { flashBee: 'shanfeng', mFood: 'mfood' }
const UI_TO_BACKEND_BRAND: Record<string, string> = { shanfeng: 'flashBee', mfood: 'mFood' }

/** 门店赠送天数记录（来源：贈送管理菜單的贈送數據） */
interface GiftDaysRecord {
  totalDays: number      // 贈送總天數
  usedDays: number       // 已使用天數
  expireDate: string     // 贈送有效期止
}

/** Mock数据 - 各门店新店廣告贈送天數（10003 无赠送记录） */
const MOCK_GIFT_DAYS: Record<string, GiftDaysRecord> = {
  '10001': { totalDays: 30, usedDays: 12, expireDate: dayjs().add(90, 'day').format('YYYY-MM-DD') },
  '10002': { totalDays: 15, usedDays: 15, expireDate: dayjs().add(30, 'day').format('YYYY-MM-DD') },
  '10004': { totalDays: 60, usedDays: 20, expireDate: dayjs().add(150, 'day').format('YYYY-MM-DD') },
  '10005': { totalDays: 10, usedDays: 0, expireDate: dayjs().add(45, 'day').format('YYYY-MM-DD') },
}

export default function NewStoreDayPicker() {
  const { t } = useTranslation('adSales')
  const navigate = useNavigate()
  const WEEKDAY_LABELS = t('weekdayShort', { returnObjects: true }) as string[]

  // 查询条件状态
  const [searchAlgorithm, setSearchAlgorithm] = useState<string | null>(null)
  const [searchBrand, setSearchBrand] = useState<string | null>(null)
  const [searchStoreName, setSearchStoreName] = useState<string | null>(null)
  const [searchBD, setSearchBD] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(false)
  const [queriedStoreId, setQueriedStoreId] = useState<string | null>(null)
  // 真实算法下拉（從算法庫 API 動態加載，value=算法ID）
  const [algorithmOptions, setAlgorithmOptions] = useState<Array<{ label: string; value: string }>>([])
  const [_algorithmBrandOverrides, setAlgorithmBrandOverrides] = useState<Record<string, string>>({})

  // 加载算法库已启用的新店广告算法（按品牌过滤）
  useEffect(() => {
    if (!searchBrand) {
      setAlgorithmOptions([])
      setAlgorithmBrandOverrides({})
      return
    }
    const backendBrand = UI_TO_BACKEND_BRAND[searchBrand]
    fetchAdAlgorithms({ page: 1, size: 200, algoType: AlgorithmType.NEW_STORE_AD, brand: backendBrand, status: 1 })
      .then(res => {
        if (!res) return
        const brandOverrides: Record<string, string> = {}
        const options = res.records.map(a => {
          const value = String(a.id)
          const uiBrand = BACKEND_TO_UI_BRAND[a.brand || '']
          if (uiBrand) brandOverrides[value] = uiBrand
          return { label: a.algoName, value }
        })
        setAlgorithmOptions(options)
        setAlgorithmBrandOverrides(brandOverrides)
      }).catch(() => {})
  }, [searchBrand])

  // 各门店已额外消耗的赠送天数（本地提交订单后累加）
  const [extraUsedDays, setExtraUsedDays] = useState<Record<string, number>>({})

  // 日期选择状态
  const [selectedDates, setSelectedDates] = useState<string[]>([])
  const [currentMonth, setCurrentMonth] = useState<Dayjs>(dayjs())
  const [isConfirmModalVisible, setIsConfirmModalVisible] = useState(false)
  const [isSuccessModalVisible, setIsSuccessModalVisible] = useState(false)
  const [lastSubmitDays, setLastSubmitDays] = useState(0)

  // 当前查询门店的赠送天数信息
  const giftInfo = useMemo(() => {
    if (!queriedStoreId) return null
    const record = MOCK_GIFT_DAYS[queriedStoreId]
    if (!record) return null
    const usedDays = record.usedDays + (extraUsedDays[queriedStoreId] || 0)
    return {
      totalDays: record.totalDays,
      usedDays,
      remainingDays: Math.max(0, record.totalDays - usedDays),
      expireDate: record.expireDate,
    }
  }, [queriedStoreId, extraUsedDays])

  const queriedStore = MOCK_STORES.find(s => s.id === queriedStoreId)

  // 品牌变更处理：清空已选算法
  const handleBrandChange = (value: string | null) => {
    setSearchBrand(value)
    setSearchAlgorithm(null)
    setAlgorithmOptions([])
  }

  // 算法名称变更处理（品牌已由用户预先选择）
  const handleAlgorithmChange = (value: string | null) => {
    setSearchAlgorithm(value)
  }

  // 门店名称变更处理：自动带出BD
  const handleStoreChange = (value: string | null) => {
    setSearchStoreName(value)
    const store = MOCK_STORES.find(s => s.id === value)
    setSearchBD(store ? store.bd : null)
  }

  // 查询：必须选择算法名称、品牌、门店名称
  const handleSearch = () => {
    if (!searchAlgorithm) { message.warning(t('selectAlgorithm')); return }
    if (!searchBrand) { message.warning(t('selectBrand')); return }
    if (!searchStoreName) { message.warning(t('selectStore')); return }
    setQueriedStoreId(searchStoreName)
    setSelectedDates([])
    setCurrentMonth(dayjs())
    setHasSearched(true)
  }

  // 重置查询条件
  const handleReset = () => {
    setSearchAlgorithm(null); setSearchBrand(null)
    setSearchStoreName(null); setSearchBD(null)
    setQueriedStoreId(null); setSelectedDates([])
    setHasSearched(false)
    setAlgorithmOptions([])
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
    if (!isDateSelectable(date)) { message.warning(t('dateNotInGiftPeriod')); return }
    const dateStr = date.format('YYYY-MM-DD')
    if (selectedDates.includes(dateStr)) {
      setSelectedDates(selectedDates.filter(d => d !== dateStr))
      return
    }
    if (selectedDates.length >= giftInfo.remainingDays) {
      message.warning(t('maxDaysSelectable', { max: giftInfo.remainingDays }))
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
    if (selectedDates.length === 0) { message.warning(t('selectPromoDatesFirst')); return }
    setIsConfirmModalVisible(true)
  }

  // 确认支付：扣减赠送天数
  const handleConfirmPayment = () => {
    if (!queriedStoreId) return
    const days = selectedDates.length
    setExtraUsedDays(prev => ({ ...prev, [queriedStoreId]: (prev[queriedStoreId] || 0) + days }))
    setLastSubmitDays(days)
    setSelectedDates([])
    setIsConfirmModalVisible(false)
    setIsSuccessModalVisible(true)
  }

  const handleViewOrder = () => {
    setIsSuccessModalVisible(false)
    navigate(`/promotion-order-manage?type=${encodeURIComponent('新店廣告')}`)
  }
  const handleContinuePurchase = () => { setIsSuccessModalVisible(false); message.success(t('continueSelectDays')) }

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
          <Form.Item label={t('brandLabel')}>
            <Select placeholder={t('brandAutoHint')} value={searchBrand} onChange={handleBrandChange} allowClear
              options={[{ label: t('flashBee'), value: 'shanfeng' }, { label: 'mFood', value: 'mfood' }]} />
          </Form.Item>
          <Form.Item label={t('algoNameLabel')}>
            <Select placeholder={searchBrand ? t('dpAlgoPlaceholder') : t('selectBrandFirst')} value={searchAlgorithm} onChange={handleAlgorithmChange} allowClear showSearch optionFilterProp="label"
              options={algorithmOptions} disabled={!searchBrand} />
          </Form.Item>
          <Form.Item label={t('storeNameLabel')}>
            <Select placeholder={t('storeSearchHint')} value={searchStoreName} onChange={handleStoreChange} allowClear showSearch optionFilterProp="label" options={STORE_OPTIONS} />
          </Form.Item>
          <Form.Item label={t('bdLabel')}>
            <Select placeholder={t('bdAutoHint')} value={searchBD} onChange={(v) => setSearchBD(v)} allowClear showSearch
              filterOption={(input, option) => { const keyword = input.toLowerCase(); const label = (option?.label ?? '').toString().toLowerCase(); return label.includes(keyword) }}
              options={BD_OPTIONS} />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>{t('searchQuery')}</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>{t('reset')}</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {!hasSearched ? (
        <Card bodyStyle={{ padding: '48px 24px' }}>
          <Empty description={t('newStoreSearchHint')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
        </Card>
      ) : !giftInfo ? (
        <Card bodyStyle={{ padding: '48px 24px' }}>
          <Empty
            description={
              <span style={{ color: '#8c8c8c' }}>
                {t('noNewStoreGift')}
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
            title={<Space><GiftOutlined style={{ color: '#E8720C' }} /><span>{t('newStorePromoDays')}</span><span style={{ fontSize: 12, fontWeight: 400, color: '#8c8c8c' }}>{t('daysSourceHint')}</span></Space>}
            style={{ marginBottom: 16 }}
          >
            <div key={queriedStoreId} style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
              {[
                { label: t('totalGiftDays'), value: <AnimatedNumber value={giftInfo.totalDays} suffix={t('dayUnitSuffix')} />, icon: <GiftOutlined />, color: '#1890ff', bg: '#E6F7FF' },
                { label: t('usedDays'), value: <AnimatedNumber value={giftInfo.usedDays} suffix={t('dayUnitSuffix')} />, icon: <CheckCircleOutlined />, color: '#E8720C', bg: '#FFF7E6' },
                { label: t('remainingDays'), value: <AnimatedNumber value={giftInfo.remainingDays} suffix={t('dayUnitSuffix')} />, icon: <CalendarOutlined />, color: '#52C41A', bg: '#F6FFED' },
                { label: t('expireDate'), value: <span style={{ fontSize: 18 }}>{giftInfo.expireDate}</span>, icon: <ClockCircleOutlined />, color: '#722ED1', bg: '#F9F0FF' },
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
                description={<span style={{ color: '#8c8c8c' }}>{t('daysUsedUp')}</span>}
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            </Card>
          ) : (
            <div style={{ display: 'flex', gap: 16 }}>
              {/* 左侧：月份选择 + 日历 */}
              <div style={{ flex: 1 }}>
                <Card title={<Space><CalendarOutlined /><span>{t('selectPromoDate')}</span><span style={{ fontSize: 12, fontWeight: 400, color: '#8c8c8c' }}>{t('dateRangeHint', { date: giftInfo.expireDate })}</span></Space>} style={{ marginBottom: 16 }} bodyStyle={{ padding: '12px 20px' }}>
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
                            {month.format(t('monthFormat'))}
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
                                    ? <span style={{ fontSize: 9, color: '#E8720C', marginTop: 1, fontWeight: 600 }}>{t('selectedTag')}</span>
                                    : <span style={{ fontSize: 9, color: '#52c41a', marginTop: 1 }}>{t('canPromote')}</span>
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
                <Card size="small" title={<Space><CalendarOutlined /><span>{t('selectPromoDaysTitle')}</span></Space>}
                  extra={selectedDates.length > 0 && <Button type="link" size="small" danger onClick={handleClearSelected}>{t('clearAction')}</Button>}>
                  {selectedDates.length > 0 ? (
                    <Space direction="vertical" size={12} style={{ width: '100%' }}>
                      {datesByMonth.map(({ month, days }) => (
                        <div key={month} style={{ background: '#fafafa', borderRadius: 6, padding: '10px 12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <span style={{ fontSize: 12, color: '#8c8c8c', whiteSpace: 'nowrap' }}>{t('selectedMonth')}</span>
                            <span style={{ fontSize: 14, fontWeight: 600 }}>{month}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                            <span style={{ fontSize: 12, color: '#8c8c8c', whiteSpace: 'nowrap' }}>{t('selectedDatesLabel')}</span>
                            <span style={{ fontSize: 13, fontWeight: 500 }}>{days.map(d => `${d}號`).join('、')}</span>
                          </div>
                        </div>
                      ))}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 12, color: '#8c8c8c', whiteSpace: 'nowrap' }}>{t('totalDaysSelected')}</span>
                        <span style={{ fontSize: 14, fontWeight: 600, color: '#52c41a' }}>{selectedDates.length}{t('dayUnitSuffix')}</span>
                      </div>
                    </Space>
                  ) : (
                    <Empty description={t('selectPromoDateCalendar')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
                  )}
                </Card>

                {/* 订单结算：赠送天数抵扣 */}
                <Card size="small" title={t('orderSettlement')}>
                  <div style={{ padding: '12px 16px', marginBottom: 12, background: 'linear-gradient(135deg, #E8720C 0%, #F39C12 100%)', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, color: '#fff', opacity: 0.9 }}>{t('remainingGiftDays')}</span>
                    <span style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>{giftInfo.remainingDays} {t('dayUnitSuffix')}</span>
                  </div>
                  <div style={{ background: '#fafafa', borderRadius: 6, padding: '12px 16px', marginBottom: 12, fontSize: 13 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ color: '#595959' }}>{t('useGiftDays')}</span>
                      <span style={{ fontWeight: 600, color: '#E8720C' }}>{selectedDates.length} {t('dayUnitSuffix')}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ color: '#595959' }}>{t('afterSubmitRemaining')}</span>
                      <span style={{ fontWeight: 600, color: '#52c41a' }}>{giftInfo.remainingDays - selectedDates.length} {t('dayUnitSuffix')}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #d9d9d9', paddingTop: 8 }}>
                      <span style={{ color: '#595959', fontWeight: 600 }}>{t('actualAmount')}</span>
                      <span style={{ fontWeight: 700, fontSize: 16, color: '#ff4d4f' }}>$0<span style={{ fontSize: 11, fontWeight: 400, color: '#8c8c8c', marginLeft: 4 }}>{t('fullGiftDeduction')}</span></span>
                    </div>
                  </div>
                  <Button type="primary" block size="large" disabled={selectedDates.length === 0} onClick={handleSubmitOrder}
                    style={{ background: selectedDates.length > 0 ? '#ff4d4f' : '#d9d9d9', borderColor: selectedDates.length > 0 ? '#ff4d4f' : '#d9d9d9', height: 44, fontSize: 16, fontWeight: 600 }}>
                    {t('payOrder')}
                  </Button>
                </Card>
              </div>
            </div>
          )}
        </>
      )}

      {/* 确认订单弹窗 */}
      <Modal title={t('confirmOrder')} open={isConfirmModalVisible} onOk={handleConfirmPayment} onCancel={() => setIsConfirmModalVisible(false)}
        okText={t('confirmPay')} cancelText={t('cancel')} okButtonProps={{ style: { background: '#ff4d4f', borderColor: '#ff4d4f' } }} width={560}>
        <div style={{ marginBottom: 16 }}>
          <h4 style={{ marginBottom: 12, fontSize: 14, color: '#595959' }}>{t('promoDetail')}</h4>
          <div style={{ background: '#fafafa', borderRadius: 6, padding: '12px 16px', marginBottom: 12, fontSize: 13 }}>
            <div style={{ display: 'flex', marginBottom: 8 }}>
              <span style={{ color: '#8c8c8c', whiteSpace: 'nowrap' }}>{t('promoStore')}</span>
              <span style={{ fontWeight: 600 }}>{queriedStore ? `${queriedStore.name}（ID：${queriedStore.id}）` : '-'}</span>
            </div>
            <div style={{ display: 'flex', marginBottom: 8 }}>
              <span style={{ color: '#8c8c8c', whiteSpace: 'nowrap' }}>{t('promoType')}</span>
              <span style={{ fontWeight: 600 }}>{t('newStoreAd')}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start' }}>
              <span style={{ color: '#8c8c8c', whiteSpace: 'nowrap' }}>{t('promoDates')}</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {selectedDates.map(d => <Tag key={d} color="orange" style={{ margin: 0 }}>{d}</Tag>)}
              </div>
            </div>
          </div>
        </div>
        <div style={{ background: '#fafafa', padding: 16, borderRadius: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}><span style={{ color: '#595959' }}>{t('promoDaysTotal')}</span><span style={{ fontWeight: 600 }}>{selectedDates.length} {t('dayUnitSuffix')}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, color: '#fa8c16' }}><span>{t('giftDaysDeduction')}</span><span style={{ fontWeight: 600 }}>-{selectedDates.length} {t('dayUnitSuffix')}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, color: '#ff4d4f', borderTop: '1px solid #d9d9d9', paddingTop: 8, marginTop: 8 }}><span style={{ fontWeight: 600 }}>{t('actualAmount')}</span><span style={{ fontWeight: 700 }}>$0</span></div>
        </div>
      </Modal>

      {/* 支付成功弹窗 */}
      <Modal title={t('submitSuccess')} open={isSuccessModalVisible} onCancel={() => setIsSuccessModalVisible(false)}
        footer={[<Button key="view" type="primary" onClick={handleViewOrder}>{t('viewOrder')}</Button>, <Button key="continue" onClick={handleContinuePurchase} style={{ background: '#fa8c16', borderColor: '#fa8c16', color: '#fff' }}>{t('continueBuy')}</Button>]} width={400}>
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
          <p style={{ fontSize: 16, color: '#595959', marginBottom: 24 }}>{t('submitSuccessMsg')}</p>
          <div style={{ background: 'linear-gradient(135deg, #fff7e6 0%, #ffe58f 100%)', padding: '20px 16px', borderRadius: 8, marginBottom: 16 }}>
            <p style={{ fontSize: 14, color: '#8c8c8c', marginBottom: 8 }}>{t('usedGiftPromoDays')}</p>
            <p style={{ fontSize: 36, fontWeight: 700, color: '#fa541c', margin: 0, lineHeight: 1.2 }}>{lastSubmitDays} {t('dayUnitSuffix')}</p>
          </div>
        </div>
      </Modal>
    </div>
  )
}
