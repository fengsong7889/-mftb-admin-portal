/**
 * 12306 风格日期选择条 — AdSales 与 PromotionSalesConfig 共享
 */
import { Button } from 'antd'
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import { useTranslation } from 'react-i18next'
import { isPresaleDate, getPresaleOpenTime } from './gridConstants'

export interface DateStripProps {
  dateList: Dayjs[]
  selectedDates: Dayjs[]
  activeDate: Dayjs | null
  hoveredDate: string | null
  sellableDays: number
  currentPage: number
  totalPages: number
  /** 当前选中的格子列表（用于红点提示） */
  selectedCells: Array<{ date: string }>
  onDateClick: (date: Dayjs) => void
  onHover: (dateStr: string | null) => void
  onPageChange: (page: number) => void
  /** 可选：自定义 Card 标题区域（AdSales 放 CalendarOutlined，Promotion 放 Card title） */
  titleExtra?: React.ReactNode
}

export default function DateStrip({
  dateList,
  selectedDates,
  activeDate: _activeDate,
  hoveredDate,
  sellableDays,
  currentPage,
  totalPages,
  selectedCells,
  onDateClick,
  onHover,
  onPageChange,
}: DateStripProps) {
  const { t } = useTranslation('adSales')
  const WEEKDAY_LABELS = t('weekdayFull', { returnObjects: true }) as string[]

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Button
        size="small"
        disabled={currentPage === 1}
        onClick={() => onPageChange(Math.max(1, currentPage - 1))}
      >
        ◀
      </Button>
      <div style={{ flex: 1, display: 'flex', gap: 4, padding: '4px 0' }}>
        {dateList.map(date => {
          const dateStr = date.format('YYYY-MM-DD')
          const isSelected = selectedDates.some(d => d.format('YYYY-MM-DD') === dateStr)
          const isToday = dateStr === dayjs().format('YYYY-MM-DD')
          const isHovered = hoveredDate === dateStr
          const presale = isPresaleDate(date, sellableDays)
          return (
            <div
              key={dateStr}
              onClick={() => onDateClick(date)}
              onMouseEnter={() => onHover(dateStr)}
              onMouseLeave={() => onHover(null)}
              style={{
                flex: 1,
                padding: '6px 4px',
                borderRadius: 6,
                border: presale
                  ? '1px dashed #d9d9d9'
                  : isSelected ? '2px solid #fa8c16' : isHovered ? '2px solid #fa8c16' : '1px solid #e8e8e8',
                background: presale
                  ? '#fafafa'
                  : isSelected ? '#fff7e6' : isHovered ? '#fff7e6' : isToday ? '#f6ffed' : '#fff',
                cursor: 'pointer',
                textAlign: 'center',
                transition: 'all 0.2s',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                position: 'relative',
              }}
            >
              {selectedCells.some(c => c.date === dateStr) && (
                <div style={{
                  position: 'absolute', top: 2, right: 2,
                  width: 8, height: 8, borderRadius: '50%',
                  background: '#ff4d4f',
                  animation: 'dotPulse 1.5s ease-in-out infinite',
                }} />
              )}
              <span style={{ fontSize: 14, fontWeight: isSelected || isHovered ? 700 : 500, color: presale ? '#bfbfbf' : isSelected || isHovered ? '#fa8c16' : '#333' }}>
                {date.format('MM-DD')}
              </span>
              {presale ? (
                <span style={{ fontSize: 11, color: '#8c8c8c', marginLeft: 4, border: '1px solid #d9d9d9', borderRadius: 3, padding: '0 3px', background: '#f5f5f5' }}>{t('presaleTag')}</span>
              ) : (
                <span style={{ fontSize: 12, color: isSelected || isHovered ? '#fa8c16' : '#8c8c8c', marginLeft: 4 }}>
                  {isToday ? t('today') : WEEKDAY_LABELS[date.day()]}
                </span>
              )}
            </div>
          )
        })}
      </div>
      <Button
        size="small"
        disabled={currentPage === totalPages}
        onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
      >
        ▶
      </Button>
    </div>
  )
}

/** 预售日期提醒弹窗 */
export interface PresaleInfo {
  date: string
  weekday: string
  openTime: string
}

export function buildPresaleInfo(date: Dayjs, sellableDays: number, weekdayLabels: string[], presaleDateFormat: string): PresaleInfo {
  return {
    date: date.format('YYYY-MM-DD'),
    weekday: weekdayLabels[date.day()],
    openTime: getPresaleOpenTime(date, sellableDays).format(presaleDateFormat),
  }
}
