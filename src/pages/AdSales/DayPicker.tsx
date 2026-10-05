import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Tag, Button, Space, message, Table, Empty, Modal, Select, Card, Form, InputNumber, Alert, Radio } from 'antd'
import {
  ShoppingCartOutlined,
  CalendarOutlined,
  SearchOutlined,
  ReloadOutlined,
  DeleteOutlined,
} from '@ant-design/icons'
import type { InventoryItem } from './types'
import GradientDiscountBanner from './GradientDiscountBanner'
import NoRefundBadge from './NoRefundBadge'
import PaymentDetailContent from './PaymentDetailContent'
import dayjs from 'dayjs'
import {
  isPresaleDate,
  getPresaleOpenTime,
  PRESALE_OPEN_HOUR,
  type CartRow,
} from '../_shared/ad-promotion/dayPickerConstants'
import { useDayPickerCommon } from '../_shared/ad-promotion/hooks/useDayPickerCommon'
import PaymentSuccessModal from '../_shared/ad-promotion/components/PaymentSuccessModal'

interface DayPickerProps {
  inventoryItem: InventoryItem
  storeMode?: boolean
}

export default function DayPicker({ inventoryItem, storeMode }: DayPickerProps) {
  const common = useDayPickerCommon({ inventoryItem, storeMode, showAlgoCode: true })
  const { t } = common
  const WEEKDAY_LABELS = t('weekdayShort', { returnObjects: true }) as string[]

  // AdSales 独有：支付成功弹窗展示赠送天数和支付方式
  const [paidGiftDays, setPaidGiftDays] = useState(0)
  const [paidPaymentMode, setPaidPaymentMode] = useState<'promo' | 'gift' | 'mixed'>('promo')

  // 包装 handleConfirmPayment 以记录额外状态
  const handleConfirmPayment = async () => {
    if (!common.searchAlgorithm || !common.searchStoreName) return
    if (common.storeRegion == null) { message.warning(t('storeNoRegionCannotOrder')); return }
    common.setIsPaymentModalVisible(false)
    setPaidGiftDays(common.effectiveGiftDays)
    setPaidPaymentMode(common.mixedPayment ? 'mixed' : common.activeMode)
    await common.handleConfirmPayment()
  }

  // 包装 handleViewOrder 和 handleContinuePurchase
  const handleViewOrder = () => {
    common.handleViewOrder()
  }
  const handleContinuePurchase = () => {
    common.handleContinuePurchase()
  }

  return (
    <div>
      {/* 查询区域 - 始终显示 */}
      <div className="search-section" style={{ marginBottom: 16 }}>
          <Form layout="inline" style={{ display: 'grid', gridTemplateColumns: storeMode ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: '16px 12px' }}>
            <Form.Item label={t('brandLabel')}>
              <Select placeholder={t('brandAutoHint')} value={common.searchBrand} onChange={common.handleBrandChange} allowClear
                options={[{ label: t('flashBee'), value: 'shanfeng' }, { label: 'mFood', value: 'mfood' }]} />
            </Form.Item>
            <Form.Item label={t('algoNameLabel')}>
              <Select placeholder={common.searchBrand ? t('dpAlgoPlaceholder') : t('selectBrandFirst')} value={common.searchAlgorithm} onChange={common.handleAlgorithmChange} allowClear showSearch optionFilterProp="label"
                options={common.algorithmOptions} disabled={!common.searchBrand} />
            </Form.Item>
            {!storeMode && (
              <Form.Item label={t('storeNameLabel')}>
                <Select placeholder={t('storeSearchHint')} value={common.searchStoreName} onChange={common.handleStoreChange} allowClear showSearch optionFilterProp="label" options={common.storeOptions} />
              </Form.Item>
            )}
            {!storeMode && (
              <Form.Item label={t('bdLabel')}>
                <Select placeholder={t('bdAutoHint')} value={common.searchBD} onChange={(v) => common.setSearchBD(v)} allowClear showSearch
                  filterOption={(input, option) => { const keyword = input.toLowerCase(); const label = (option?.label ?? '').toString().toLowerCase(); return label.includes(keyword) }}
                  options={common.bdOptions} />
              </Form.Item>
            )}
            <Form.Item>
              <div className="search-actions">
                <Button type="primary" icon={<SearchOutlined />} onClick={common.handleSearch}>{t('searchQuery')}</Button>
                <Button icon={<ReloadOutlined />} onClick={common.handleReset}>{t('common:reset')}</Button>
              </div>
            </Form.Item>
          </Form>
      </div>

      {/* 购物车冲突提醒弹窗 */}
      <Modal
        title={t('switchConfirmTitle')}
        open={common.isConflictModalVisible}
        onOk={common.handleConfirmSwitch}
        onCancel={common.handleCancelSwitch}
        okText={t('switchConfirmOk')}
        cancelText={t('common:cancel')}
        okButtonProps={{ danger: true }}
      >
        <div style={{ padding: '8px 0' }}>
          <p style={{ marginBottom: 12, fontSize: 14, color: '#262626' }}>
            {t('switchWarnLine1')}
          </p>
          <p style={{ marginBottom: 0, fontSize: 13, color: '#595959' }}>
            {t('dpSwitchWarnLine2')}
          </p>
          <ul style={{ margin: '8px 0 0', paddingLeft: 20, fontSize: 13, color: '#595959' }}>
            <li>{t('dpSwitchOption1')}</li>
            <li>{t('dpSwitchOption2')}</li>
          </ul>
        </div>
      </Modal>

      {!common.hasSearched ? (
        <Card bodyStyle={{ padding: '48px 24px' }}>
          <Empty description={t('searchFirstHint')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
        </Card>
      ) : common.regionBlocked ? (
        <Card bodyStyle={{ padding: '48px 24px' }}>
          <Alert
            type="warning"
            showIcon
            style={{ maxWidth: 680, margin: '0 auto' }}
            message={common.storeRegion == null
              ? t('storeRegionNotConfigured')
              : t('pricingNotConfigured', { region: common.regionLabel })}
            description={common.storeRegion == null
              ? t('storeRegionHint')
              : t('noInventoryInRegion')}
          />
        </Card>
      ) : (
      <>
      <GradientDiscountBanner
        tiers={common.dayTiers.map(g => ({ threshold: g.minDays, discount: g.discount }))}
        unitLabel={t('unitDay')}
        currentCount={common.selectedDates.length + common.cartSummary.totalDays}
      />
      <div style={{ display: 'flex', gap: 16 }}>
        {/* 左侧：月份选择 + 日历 */}
        <div style={{ flex: 1 }}>
        <div style={{ marginBottom: 12, fontSize: 13, color: '#595959' }}>
          {t('currentRegion')}<Tag color="orange">{common.regionLabel}</Tag>
          <span style={{ fontSize: 12, color: '#8c8c8c' }}>{t('sellByDayRegion')}</span>
        </div>
        <Card title={<Space><CalendarOutlined /><span>{t('selectMonth')}</span></Space>} extra={common.currentAlgorithmRefundEnabled === false && <NoRefundBadge />} style={{ marginBottom: 16 }} bodyStyle={{ padding: '12px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Button
              size="small"
              disabled={common.monthPage === 0}
              onClick={() => common.setMonthPage(prev => Math.max(0, prev - 1))}
            >
              ◀
            </Button>
            <div style={{ flex: 1, display: 'flex', gap: 4 }}>
            {common.visibleMonths.map(month => {
              const monthStr = month.format('YYYY-MM')
              const isSelected = common.currentMonth.format('YYYY-MM') === monthStr
              const isHovered = common.hoveredMonth === monthStr
              const hasSelectedDates = common.datesByMonth.some(g => g.month === monthStr)
              const monthPresale = isPresaleDate(month.startOf('month'), common.sellableDays)
              return (
                <div
                  key={monthStr}
                  onClick={() => common.handleMonthChange(month)}
                  onMouseEnter={() => common.setHoveredMonth(monthStr)}
                  onMouseLeave={() => common.setHoveredMonth(null)}
                  style={{
                    flex: 1, padding: '8px 4px', borderRadius: 6, position: 'relative',
                    border: monthPresale
                      ? '1px dashed #d9d9d9'
                      : isSelected ? '2px solid #fa8c16' : isHovered ? '2px solid #fa8c16' : '1px solid #e8e8e8',
                    background: monthPresale
                      ? '#fafafa'
                      : isSelected ? '#fff7e6' : isHovered ? '#fff7e6' : '#fff',
                    cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s', whiteSpace: 'nowrap', overflow: 'hidden',
                  }}
                >
                  <span style={{ fontSize: 15, fontWeight: !monthPresale && (isSelected || isHovered) ? 700 : 500, color: monthPresale ? '#bfbfbf' : isSelected || isHovered ? '#fa8c16' : '#333' }}>
                    {month.year() === dayjs().year() ? month.format(t('monthFormat')) : month.format(t('yearMonthFormat'))}
                  </span>
                  {monthPresale && (
                    <span style={{ fontSize: 11, color: '#8c8c8c', marginLeft: 4, border: '1px solid #d9d9d9', borderRadius: 3, padding: '0 3px', background: '#f5f5f5' }}>{t('presaleTag')}</span>
                  )}
                  {hasSelectedDates && (
                    <div style={{
                      position: 'absolute', top: 3, right: 3,
                      width: 8, height: 8, borderRadius: '50%',
                      background: '#ff4d4f',
                      animation: 'dotPulse 1.5s ease-in-out infinite',
                    }} />
                  )}
                </div>
              )
            })}
            </div>
            <Button
              size="small"
              disabled={common.monthPage >= common.monthPageCount - 1}
              onClick={() => common.setMonthPage(prev => Math.min(common.monthPageCount - 1, prev + 1))}
            >
              ▶
            </Button>
          </div>
        </Card>

        {/* 日历网格 */}
        <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', background: '#FAFAFA', borderBottom: '1px solid #f0f0f0' }}>
            {WEEKDAY_LABELS.map((label, index) => (
              <div key={label} style={{ padding: '8px 0', textAlign: 'center', fontWeight: 600, fontSize: 12, color: index === 0 || index === 6 ? '#FA8C16' : '#595959' }}>
                {label}
              </div>
            ))}
          </div>
          {common.calendarGrid.map((week, weekIndex) => (
            <div key={weekIndex} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
              {week.map((date, dayIndex) => {
                const cellStyle = common.getCellStyle(date)
                const isSelected = date ? common.selectedDates.includes(date.format('YYYY-MM-DD')) : false
                const isToday = date?.isSame(dayjs(), 'day')
                const inCart = date ? common.isDateLocked(date.format('YYYY-MM-DD')) : false
                const remaining = date ? common.getLockedRemaining(date.format('YYYY-MM-DD')) : 0
                const presale = date ? isPresaleDate(date, common.sellableDays) : false
                const realCell = date ? common.getRealCell(date.format('YYYY-MM-DD')) : undefined
                return (
                  <div key={`${weekIndex}-${dayIndex}`} onClick={() => common.handleDateClick(date)}
                    style={{ minHeight: 56, margin: 2, borderRadius: 6, padding: '4px 2px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1, ...cellStyle, transition: 'all 0.2s' }}>
                    {date ? (
                      <>
                        <span style={{ fontSize: 14, fontWeight: isSelected ? 700 : isToday ? 600 : 400, position: 'relative', lineHeight: 1.2 }}>
                          {date.date()}
                          {isToday && !isSelected && <span style={{ position: 'absolute', bottom: -3, left: '50%', transform: 'translateX(-50%)', width: 4, height: 4, borderRadius: '50%', background: '#1890ff' }} />}
                        </span>
                        {presale && (
                          <span style={{ fontSize: 10, color: '#8c8c8c', marginTop: 2, border: '1px solid #d9d9d9', borderRadius: 3, padding: '0 3px', background: '#f5f5f5' }}>{t('presaleTag')}</span>
                        )}
                        {!presale && inCart && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginTop: 1 }}>
                            <span style={{ fontSize: 9, color: '#722ed1' }}>{t('lockedTag')}</span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#ff4d4f' }}>{remaining}</span>
                            <span style={{ fontSize: 8, color: '#ff7875' }}>{t('secondUnit')}</span>
                          </div>
                        )}
                        {!presale && !inCart && common.isDateSoldOut(date) && (
                          <>
                            <span style={{ fontSize: 9, marginTop: 1 }}>{t('soldOutTag')}</span>
                            <span style={{ fontSize: 9, color: '#bfbfbf', textDecoration: 'line-through' }}>${realCell?.dailyPrice ?? ''}</span>
                            <span style={{ fontSize: 9, color: '#bfbfbf' }}>{t('inventoryLabel')}：0</span>
                          </>
                        )}
                        {!presale && !inCart && !common.isDateSoldOut(date) && common.isDateUnavailable(date) && (
                          <>
                            <span style={{ fontSize: 9, marginTop: 1 }}>{t('unavailableTag')}</span>
                            <span style={{ fontSize: 9, color: '#bfbfbf' }}>—</span>
                          </>
                        )}
                        {!presale && !inCart && !common.isDateSoldOut(date) && !common.isDateUnavailable(date) && (
                          <>
                            {isSelected
                              ? <span style={{ fontSize: 9, color: '#E8720C', marginTop: 1, fontWeight: 600 }}>{t('selectedTag')}</span>
                              : <span style={{ fontSize: 9, color: '#52c41a', marginTop: 1 }}>{t('availableTag')}</span>
                            }
                            <span style={{ fontSize: 9, color: '#ff4d4f', fontWeight: 500 }}>${realCell?.dailyPrice ?? ''}</span>
                            {realCell && (
                              <span style={{ fontSize: 9, color: realCell.remaining <= 1 ? '#ff4d4f' : '#8c8c8c', fontWeight: realCell.remaining <= 1 ? 600 : 400 }}>{t('inventoryLabel')}：{realCell.remaining}</span>
                            )}
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
        <Card size="small" title={<Space><CalendarOutlined /><span>{t('currentSelection')}</span></Space>}
                  extra={common.selectedDates.length > 0 && <Button type="link" size="small" danger onClick={() => common.setSelectedDates([])} icon={<DeleteOutlined />}>{t('clearAction')}</Button>}>
          {common.selectedDates.length > 0 ? (
            <div>
              {common.datesByMonth.map(({ month, days }) => (
                <div key={month} style={{ marginBottom: 12, border: '1px solid #d9f7be', borderRadius: 8, overflow: 'hidden', background: '#fcfff5' }}>
                  <div style={{ padding: '8px 12px', background: '#f6ffed', borderBottom: '1px solid #d9f7be' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#389e0d' }}>📅 {month}</span>
                  </div>
                  <div style={{ padding: '8px 12px' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {days.map(d => (
                        <Tag key={d} color="orange" style={{ fontSize: 11, margin: 0 }}>{d}日</Tag>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
              
              <div style={{ 
                padding: '10px 12px', borderRadius: 8, marginBottom: 12,
                background: 'linear-gradient(135deg, #fff7e6, #fff1cc)',
                border: '1px solid #ffe58f',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, color: '#595959' }}>{t('totalDaysSelected')}：</span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#52c41a' }}>{t('dayCount', { count: common.selectedDates.length })}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, color: '#595959' }}>{t('discount')}：</span>
                  {common.currentDiscount ? (
                    <Tag color="orange" style={{ fontSize: 13, fontWeight: 600 }}>{common.currentDiscount.discount > 10 ? common.currentDiscount.discount / 10 : common.currentDiscount.discount}{t('discountUnit')}</Tag>
                  ) : (
                    <span style={{ fontSize: 13, color: '#bfbfbf' }}>{t('noDiscount')}</span>
                  )}
                </div>
              </div>
              
              <Button type="primary" icon={<ShoppingCartOutlined />} block onClick={common.handleAddToCart} loading={common.locking}
                style={{ marginTop: 12, height: 40, fontSize: 15, background: '#fa8c16', borderColor: '#fa8c16' }}>
                {t('addCart')}
              </Button>
            </div>
          ) : (
            <Empty description={t('selectDateInCalendar')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
          )}
        </Card>

        <Card size="small" title={t('selectedDays')}>
          <div style={{ fontSize: 11, color: '#ff4d4f', marginBottom: 12, lineHeight: 1.4 }}>
            {t('lockWarningDay', { seconds: common.LOCK_SECONDS })}
          </div>
          {common.cartItems.length > 0 ? (
            <Table<CartRow>
              dataSource={common.cartItems.flatMap(item =>
                item.dates.map((date): CartRow => ({
                  key: `${item.key}-${date}`, date, cartKey: item.key,
                  salePrice: Math.round(item.originalPrice * item.discount / 100 / item.dates.length),
                  lockTime: item.lockTime,
                }))
              )}
              pagination={false} size="small"
              locale={{ emptyText: <Empty description={t('noSelectedDate')} image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
              columns={[
                { title: t('purchaseDateCol'), dataIndex: 'date', key: 'date', width: 110, render: (text: string) => <span style={{ fontSize: 12 }}>{text}</span> },
                { title: t('cartColLockTime'), key: 'countdown', width: 100, align: 'center' as const,
                  render: (_, record) => {
                    const remaining = Math.max(0, common.LOCK_SECONDS - Math.floor((common.currentTime - record.lockTime) / 1000))
                    if (remaining <= 0) return <span style={{ fontSize: 11, color: '#bfbfbf' }}>{t('lockReleased')}</span>
                    return (
                      <span style={{ fontSize: 12 }}>
                        <span style={{ fontWeight: 700, color: remaining <= 10 ? '#ff4d4f' : '#fa8c16' }}>{remaining}</span>
                        <span style={{ fontSize: 10, color: '#8c8c8c', marginLeft: 2 }}>{t('secondUnit')}</span>
                      </span>
                    )
                  }
                },
                { title: t('salePriceCol'), dataIndex: 'salePrice', key: 'salePrice', width: 80, align: 'right' as const, render: (price: number) => <span style={{ fontSize: 12, color: '#ff4d4f', fontWeight: 600 }}>${price}</span> },
                { title: t('common:action'), key: 'action', width: 60, align: 'center' as const,
                  render: (_, record) => (
                    <Button type="link" size="small" danger style={{ padding: 0, fontSize: 12 }}
                      onClick={() => common.handleRemoveCartDate(record.cartKey, record.date)}
                    >{t('common:remove')}</Button>
                  ),
                },
              ]}
            />
          ) : (
            <Empty description={t('noSelectedDate')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
          )}
        </Card>

        <Card size="small" title={t('orderSettlement')}>
          {common.switchable && (
            <div style={{ marginBottom: 12, padding: '10px 12px', background: '#F6FFED', border: '1px solid #B7EB8F', borderRadius: 6 }}>
              <div style={{ fontSize: 12, color: '#595959', marginBottom: 8, fontWeight: 500 }}>支付方式選擇</div>
              <Radio.Group value={common.paymentMode} onChange={(e) => common.setPaymentMode(e.target.value)}>
                  <Radio value="promo">推廣金支付</Radio>
                  <Radio value="gift">贈送天數抵扣</Radio>
                </Radio.Group>
            </div>
          )}
          {(common.mixedPayment || common.activeMode === 'promo') && (
            <div style={{ padding: '12px 16px', marginBottom: 12, background: 'linear-gradient(135deg, #E8720C 0%, #F39C12 100%)', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: '#fff', opacity: 0.9 }}>{t('promoBalance')}</span>
              <span style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>{common.merchantBalance == null ? '--' : `$${common.merchantBalance.toLocaleString()}`}</span>
            </div>
          )}
          {(common.mixedPayment || common.activeMode === 'gift') && (
            <>
              <div style={{ padding: '12px 16px', marginBottom: 12, background: 'linear-gradient(135deg, #E8720C 0%, #F39C12 100%)', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: '#fff', opacity: 0.9 }}>{t('remainingGiftDays')}</span>
                <span style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>{common.giftDaysBalance} {t('dayUnitCount')}</span>
              </div>
            </>
          )}
          <div style={{ background: '#fafafa', padding: 16, borderRadius: 8, marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ color: '#595959' }}>{t('orderOriginal')}：</span>
              <span style={{ fontWeight: 600 }}>${common.cartSummary.totalOriginal}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ color: '#595959' }}>享受折扣：</span>
              {common.currentDiscount ? (
                <span style={{ fontWeight: 600, color: '#52C41A' }}>{common.currentDiscount.discount > 10 ? common.currentDiscount.discount / 10 : common.currentDiscount.discount}折</span>
              ) : (
                <span style={{ color: '#BFBFBF' }}>{t('noDiscount')}</span>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, color: '#fa8c16' }}>
              <span>{t('orderDiscount')}：</span>
              <span style={{ fontWeight: 600 }}>-{common.cartSummary.totalDiscount}</span>
            </div>
            {common.effectiveGiftDays > 0 && common.giftDeduction > 0 && !common.mixedPayment && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, color: '#fa8c16' }}>
                <span>赠送天數抵扣：</span>
                <span style={{ fontWeight: 600 }}>-{common.giftDeduction}</span>
              </div>
            )}
            {common.mixedPayment && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 16, color: '#ff4d4f', borderTop: '1px solid #d9d9d9', paddingTop: 8, marginTop: 8 }}>
                <span style={{ fontWeight: 600 }}>抵扣天數：</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {common.giftDaysBalance === 0 || common.cartSummary.totalDays === 0 ? (
                    <span style={{ fontWeight: 700 }}>{common.effectiveGiftDays}天</span>
                  ) : (
                    <>
                      <InputNumber
                        size="small" min={0} max={common.maxGiftDaysUsable} value={common.effectiveGiftDays} precision={0}
                        onChange={(v) => common.setGiftDaysUsed(typeof v === 'number' ? v : 0)}
                        style={{ width: 64 }}
                      />
                      <span style={{ fontSize: 12, color: '#8c8c8c' }}>天</span>
                      <Button size="small" type="link" style={{ padding: 0, fontSize: 12 }}
                        onClick={() => common.setGiftDaysUsed(common.maxGiftDaysUsable)}>{t('deductAll')}</Button>
                    </>
                  )}
                </span>
              </div>
            )}
            {common.activeMode === 'gift' && !common.mixedPayment && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, color: '#ff4d4f', borderTop: '1px solid #d9d9d9', paddingTop: 8, marginTop: 8 }}>
                <span style={{ fontWeight: 600 }}>抵扣天數：</span>
                <span style={{ fontWeight: 700 }}>{common.effectiveGiftDays}天</span>
              </div>
            )}
            {(common.mixedPayment || common.activeMode === 'promo') && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, color: '#ff4d4f', borderTop: '1px solid #d9d9d9', paddingTop: 8, marginTop: 8 }}>
                <span style={{ fontWeight: 600 }}>{t('totalPayable')}：</span>
                <span style={{ fontWeight: 700 }}>${common.payableAmount}</span>
              </div>
            )}
          </div>
          <Button type="primary" block size="large" icon={<ShoppingCartOutlined />} disabled={common.cartItems.length === 0} onClick={common.handlePayment}
            style={{ background: common.cartItems.length > 0 ? '#ff4d4f' : '#d9d9d9', borderColor: common.cartItems.length > 0 ? '#ff4d4f' : '#d9d9d9', height: 44, fontSize: 16, fontWeight: 600 }}>
            {t('payButton')}
          </Button>
        </Card>
      </div>
      </div>
      </>
      )}

      {/* 支付确认弹窗 */}
      <Modal title={t('confirmOrder')} open={common.isPaymentModalVisible} onOk={handleConfirmPayment} onCancel={() => common.setIsPaymentModalVisible(false)}
        okText={t('confirmPay')} cancelText={t('common:cancel')} confirmLoading={common.paying} okButtonProps={{ style: { background: '#ff4d4f', borderColor: '#ff4d4f' } }} width={600}>

        {common.activeMode === 'promo' && !common.mixedPayment && (
          <PaymentDetailContent
            cartItems={common.cartItems}
            totalOriginal={common.cartSummary.totalOriginal}
            currentDiscount={common.currentDiscount}
            totalDiscount={common.cartSummary.totalDiscount}
            payableAmount={common.payableAmount}
          />
        )}

        {common.activeMode === 'gift' && !common.mixedPayment && (
          <PaymentDetailContent
            cartItems={common.cartItems}
            totalOriginal={common.cartSummary.totalOriginal}
            currentDiscount={common.currentDiscount}
            totalDiscount={common.cartSummary.totalDiscount}
            giftDeduction={common.giftDeduction}
            effectiveGiftDays={common.effectiveGiftDays}
          />
        )}

        {common.mixedPayment && (
          <PaymentDetailContent
            cartItems={common.cartItems}
            totalOriginal={common.cartSummary.totalOriginal}
            currentDiscount={common.currentDiscount}
            totalDiscount={common.cartSummary.totalDiscount}
            giftDeduction={common.giftDeduction}
            effectiveGiftDays={common.effectiveGiftDays}
          />
        )}
            </Modal>

      <PaymentSuccessModal
        visible={common.isSuccessModalVisible}
        onCancel={() => common.setIsSuccessModalVisible(false)}
        onViewOrder={handleViewOrder}
        onContinuePurchase={handleContinuePurchase}
        paidAmount={common.paidAmount}
        paidGiftDays={paidGiftDays}
        paidPaymentMode={paidPaymentMode}
      />

      {/* 待开售日期提醒弹窗 */}
      <Modal
        title={
          <Space>
            <span style={{ fontSize: 18 }}>⏳</span>
            <span style={{ color: '#1890ff', fontWeight: 600 }}>{t('notYetOnSale')}</span>
          </Space>
        }
        open={!!common.presaleInfo}
        onCancel={() => common.setPresaleInfo(null)}
        footer={[
          <Button key="ok" type="primary" onClick={() => common.setPresaleInfo(null)} style={{ minWidth: 100 }}>
            {t('gotIt')}
          </Button>
        ]}
        width={420}
      >
        {common.presaleInfo && (
          <div style={{ padding: '8px 0' }}>
            <div style={{
              background: '#e6f4ff', border: '1px solid #91caff', borderRadius: 8,
              padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ fontSize: 13, color: '#595959' }}>{t('saleTimeLabel')}</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#1890ff' }}>{common.presaleInfo.openTime}</span>
            </div>
            <p style={{ fontSize: 12, color: '#8c8c8c', marginTop: 12, marginBottom: 0 }}>
              {t('dailyReleaseHint', { hour: PRESALE_OPEN_HOUR })}
            </p>
          </div>
        )}
      </Modal>
    </div>
  )
}
