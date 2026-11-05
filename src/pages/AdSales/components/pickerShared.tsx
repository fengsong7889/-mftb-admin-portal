/**
 * GoldenSignboardLabelPicker 與 PopularSkinPicker 共享代碼
 * - 常量：MAX_BUY_DAYS、PRESALE_OPEN_HOUR、MONTHS_PER_PAGE
 * - 工具函數：parseDayTiers、getPresaleOpenTime
 * - 組件：MonthTabBar、PickerPresaleInfoModal、PickerPaymentSuccessModal
 */
import { useState } from 'react'
import { Modal, Button, Space } from 'antd'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'

// ===== 常量 =====

/** 最長可購買天數（默認值，查詢後從後端獲取） */
export const MAX_BUY_DAYS = 180

/** 待開售日期每日放票時間 */
export const PRESALE_OPEN_HOUR = 10

/** 月份選擇器每頁展示數 */
export const MONTHS_PER_PAGE = 6

// ===== 工具函數 =====

/** 解析梯度折扣 JSON（過濾 + 類型轉換 + 按 minDays 升序排序） */
export function parseDayTiers(json?: string): Array<{ minDays: number; discount: number }> {
  if (!json) return []
  try {
    const arr = JSON.parse(json)
    if (!Array.isArray(arr)) return []
    return (arr as Array<{ minDays?: number; discount?: number }>)
      .filter(t => t && Number(t.minDays) > 0 && Number(t.discount) > 0)
      .map(t => ({ minDays: Number(t.minDays), discount: Number(t.discount) }))
      .sort((a, b) => a.minDays - b.minDays)
  } catch {
    return []
  }
}

/** 待開售日期的開售時間（提前 sellableDays 天、於 PRESALE_OPEN_HOUR 點開售） */
export function getPresaleOpenTime(date: Dayjs, sellableDays: number): Dayjs {
  return date.startOf('day').subtract(sellableDays, 'day').hour(PRESALE_OPEN_HOUR).minute(0).second(0)
}

// ===== 共享組件 =====

/**
 * 月份選擇 Tab 條（廣告銷售各選購頁共用）
 *
 * 等寬 grid（每頁固定 MONTHS_PER_PAGE 列）+「待開售」標籤獨立成行並預留行高：
 * 避免舊 flex+行內 nowrap 樣式導致短月份（如 11月）窄小不均、長月份（如 2027年4月 🔒待開售）撐破容器。
 */
interface MonthTabBarProps {
  /** 當前頁可見月份 */
  months: Dayjs[]
  /** 當前選中月份 */
  current: Dayjs
  /** 整月待開售判定（樣式優先於選中/懸停） */
  isPresaleMonth: (m: Dayjs) => boolean
  /** 該月是否已有選中日期（右上角紅點） */
  hasSelectedDates?: (m: Dayjs) => boolean
  /** 點擊月份（待開售月也回調，由調用方決定切換或彈開售提醒） */
  onChange: (m: Dayjs) => void
  /** 月份文案格式化（默認：同年「M月」，跨年「YYYY年M月」） */
  labelOf?: (m: Dayjs) => string
  /** 待開售標籤文案（i18n 或硬編碼，統一帶鎖圖標） */
  presaleTag: string
}

export function MonthTabBar({
  months, current, isPresaleMonth, hasSelectedDates, onChange, labelOf, presaleTag,
}: MonthTabBarProps) {
  const [hovered, setHovered] = useState<string | null>(null)
  const fmt = labelOf ?? ((m: Dayjs) => (m.year() === dayjs().year() ? m.format('M月') : m.format('YYYY年M月')))
  return (
    <div style={{ flex: 1, minWidth: 0, display: 'grid', gridTemplateColumns: `repeat(${MONTHS_PER_PAGE}, 1fr)`, gap: 4 }}>
      {months.map(m => {
        const monthStr = m.format('YYYY-MM')
        const isSelected = current.format('YYYY-MM') === monthStr
        const isHovered = hovered === monthStr
        const presale = isPresaleMonth(m)
        return (
          <div
            key={monthStr}
            onClick={() => onChange(m)}
            onMouseEnter={() => setHovered(monthStr)}
            onMouseLeave={() => setHovered(null)}
            style={{
              minWidth: 0, padding: '5px 2px 4px', borderRadius: 6, position: 'relative', textAlign: 'center',
              border: presale
                ? '1px dashed #d9d9d9'
                : isSelected ? '2px solid #fa8c16' : isHovered ? '2px solid #fa8c16' : '1px solid #e8e8e8',
              background: presale
                ? '#fafafa'
                : isSelected ? '#fff7e6' : isHovered ? '#fff7e6' : '#fff',
              cursor: 'pointer', transition: 'all 0.2s',
            }}
          >
            <div style={{
              fontSize: 13, lineHeight: '20px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              fontWeight: !presale && (isSelected || isHovered) ? 700 : 500,
              color: presale ? '#bfbfbf' : isSelected || isHovered ? '#fa8c16' : '#333',
            }}>
              {fmt(m)}
            </div>
            {/* 待開售標籤獨立成行（固定行高保持各 Tab 等高） */}
            <div style={{ height: 15, lineHeight: '15px', whiteSpace: 'nowrap', overflow: 'hidden' }}>
              {presale && (
                <span style={{ fontSize: 10, color: '#8c8c8c', border: '1px solid #d9d9d9', borderRadius: 3, padding: '0 3px', background: '#f5f5f5' }}>{presaleTag}</span>
              )}
            </div>
            {hasSelectedDates?.(m) && (
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
  )
}

/** 待開售提醒彈窗 */
interface PickerPresaleInfoModalProps {
  presaleInfo: { date: string; weekday: string; openTime: string } | null
  onClose: () => void
  /** 額外提示文案（Golden 展示硬編碼，Popular 使用 i18n） */
  hintContent?: React.ReactNode
}

export function PickerPresaleInfoModal({ presaleInfo, onClose, hintContent }: PickerPresaleInfoModalProps) {
  const { t } = useTranslation('adSales')
  return (
    <Modal
      title={
        <Space>
          <span style={{ fontSize: 18 }}>⏳</span>
          <span style={{ color: '#1890ff', fontWeight: 600 }}>{t('notYetOnSale')}</span>
        </Space>
      }
      open={!!presaleInfo}
      onCancel={onClose}
      footer={[
        <Button key="ok" type="primary" onClick={onClose} style={{ minWidth: 100 }}>
          {t('gotIt')}
        </Button>,
      ]}
      width={420}
    >
      {presaleInfo && (
        <div style={{ padding: '8px 0' }}>
          <div style={{
            background: '#e6f4ff', border: '1px solid #91caff', borderRadius: 8,
            padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ fontSize: 13, color: '#595959' }}>{t('saleTimeLabel')}</span>
            <span style={{ fontSize: 16, fontWeight: 700, color: '#1890ff' }}>{presaleInfo.openTime}</span>
          </div>
          <p style={{ fontSize: 12, color: '#8c8c8c', marginTop: 12, marginBottom: 0 }}>
            {hintContent ?? t('dailyReleaseHint', { hour: PRESALE_OPEN_HOUR })}
          </p>
        </div>
      )}
    </Modal>
  )
}

/** 支付成功彈窗 */
interface PickerPaymentSuccessModalProps {
  visible: boolean
  onClose: () => void
  onViewOrder: () => void
  onContinuePurchase: () => void
  paidAmount: number
  paidGiftDays: number
  paidPaymentMode: 'promo' | 'gift' | 'mixed'
  /** 自定義成功提示文案（Golden 硬編碼，Popular 使用 i18n） */
  successMessage?: string
}

export function PickerPaymentSuccessModal({
  visible,
  onClose,
  onViewOrder,
  onContinuePurchase,
  paidAmount,
  paidGiftDays,
  paidPaymentMode,
  successMessage,
}: PickerPaymentSuccessModalProps) {
  const { t } = useTranslation('adSales')
  return (
    <Modal
      title={t('purchaseSuccess')}
      open={visible}
      onCancel={onClose}
      footer={[
        <Button key="view" type="primary" onClick={onViewOrder}>{t('viewOrder')}</Button>,
        <Button key="continue" onClick={onContinuePurchase} style={{ background: '#fa8c16', borderColor: '#fa8c16', color: '#fff' }}>{t('continueBuy')}</Button>,
      ]}
      width={400}
    >
      <div style={{ textAlign: 'center', padding: '20px 0' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
        <p style={{ fontSize: 16, color: '#595959', marginBottom: 24 }}>
          {successMessage ?? t('successMessage')}
        </p>
        <div style={{ background: 'linear-gradient(135deg, #fff7e6 0%, #ffe58f 100%)', padding: '20px 16px', borderRadius: 8 }}>
          {/* 混合支付：同時展示推廣金花費和贈送天數 */}
          {paidPaymentMode === 'mixed' && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 32 }}>
              <div>
                <p style={{ fontSize: 14, color: '#8c8c8c', marginBottom: 8 }}>{t('deductedPromo')}</p>
                <p style={{ fontSize: 30, fontWeight: 700, color: '#E8720C', margin: 0, lineHeight: 1.2 }}>${paidAmount}</p>
              </div>
              {paidGiftDays > 0 && (
                <div>
                  <p style={{ fontSize: 14, color: '#8c8c8c', marginBottom: 8 }}>{t('usedGiftPromoDays')}</p>
                  <p style={{ fontSize: 30, fontWeight: 700, color: '#fa541c', margin: 0, lineHeight: 1.2 }}>{paidGiftDays} {t('dayUnitCount')}</p>
                </div>
              )}
            </div>
          )}
          {/* 僅推廣金支付 */}
          {paidPaymentMode === 'promo' && (
            <>
              <p style={{ fontSize: 14, color: '#8c8c8c', marginBottom: 8 }}>{t('deductedPromo')}</p>
              <p style={{ fontSize: 36, fontWeight: 700, color: '#fa541c', margin: 0, lineHeight: 1.2 }}>${paidAmount}</p>
            </>
          )}
          {/* 僅贈送天數抵扣 */}
          {paidPaymentMode === 'gift' && (
            <>
              <p style={{ fontSize: 14, color: '#8c8c8c', marginBottom: 8 }}>{t('usedGiftPromoDays')}</p>
              <p style={{ fontSize: 36, fontWeight: 700, color: '#fa541c', margin: 0, lineHeight: 1.2 }}>{paidGiftDays} {t('dayUnitCount')}</p>
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}
