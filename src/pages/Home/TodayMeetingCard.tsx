/**
 * 首页「今日會議」栏（展示组件）
 *
 * 只在用户持有「我的會議」菜单时存在：没有该菜单的人调 /meeting/my/summary 会拿到 403，
 * 若把 403 当"今天没会"显示，就是拿错误当空数据——比报错更糟，因为它看起来完全正常。
 *
 * 展示规则：
 *   - 有会且未收起：渲染完整会议栏，右侧「查看我的會議」与「收起」是两个独立按钮，
 *     信息区不再整行可点，避免点「收起」时误触跳转；
 *   - 有会但已收起：整栏不占行高，由问候栏里的 TodayMeetingRestoreChip 接管恢复入口；
 *   - 今天没会 / 加载中 / 请求失败：什么都不渲染（数据与状态见 useTodayMeetingBar）。
 */
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Button, Tooltip } from 'antd'
import { CalendarOutlined, DownOutlined, RightOutlined, UpOutlined } from '@ant-design/icons'
import type { TodayMeetingBarState } from './useTodayMeetingBar'

/** 收起后的恢复入口：住在问候栏右侧，不额外占一行；点开恢复完整会议栏 */
export function TodayMeetingRestoreChip({ bar }: { bar: TodayMeetingBarState }) {
  const { t } = useTranslation()
  const { data } = bar
  if (!bar.hasMeeting || !bar.collapsed || !data) return null
  return (
    <button
      type="button"
      className="home-greeting-meeting"
      aria-label={data.todayCount > 0
        ? t('home.meetingChipAria', { count: data.todayCount })
        : t('home.meetingExpandAria')}
      onClick={() => bar.setCollapsed(false)}
    >
      <CalendarOutlined style={{ fontSize: 11 }} />
      <span>{data.todayCount > 0 ? t('home.meetingChip', { count: data.todayCount }) : t('home.meetingTitle')}</span>
      {data.pendingResponseCount > 0 && (
        <span style={{ color: 'var(--brand)' }}>· {t('home.meetingPendingShort', { count: data.pendingResponseCount })}</span>
      )}
      <DownOutlined style={{ fontSize: 9 }} />
    </button>
  )
}

/** 完整会议栏：有会且未收起时独占一行；收起后整行消失（由问候栏胶囊接管恢复入口） */
export default function TodayMeetingCard({ bar }: { bar: TodayMeetingBarState }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data } = bar
  if (!bar.hasMeeting || bar.collapsed || !data) return null

  return (
    /* 样式住在 Home/index.css 的 .home-today-meeting：原先写在本行 inline style 里，
       而 inline 优先级高于任何 CSS 规则，深色侧只能靠 !important 硬碰，
       所以把静态样式移回 CSS。渐变两端已令牌化，浅色逐像素不变。 */
    <div className="home-today-meeting">
      {/* 信息区只做展示，不再整行可点：避免点「收起」时误触跳转我的會議 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{t('home.meetingTitle')}</span>
        <strong style={{ fontSize: 18, color: 'var(--info)' }}>{data.todayCount}</strong>
        <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{t('home.meetingUnit')}</span>
        {data.pendingResponseCount > 0 && (
          <span style={{ fontSize: 13, color: 'var(--brand)' }}>
            {t('home.meetingPending', { count: data.pendingResponseCount })}
          </span>
        )}
        {data.nextTitle && (
          <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
            {t('home.meetingNext', { title: data.nextTitle })}
            {data.nextStartTime && <span style={{ color: 'var(--text-3)' }}> · {data.nextStartTime.slice(11, 16)}</span>}
            {data.nextRoomName && <span style={{ color: 'var(--text-3)' }}> · {data.nextRoomName}</span>}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <Button
          type="link"
          size="small"
          onClick={() => navigate('/meeting-my')}
          style={{ padding: 0, height: 'auto', fontSize: 12, fontWeight: 500, color: 'var(--brand)' }}
        >
          {t('home.meetingView')} <RightOutlined style={{ fontSize: 10 }} />
        </Button>
        <span className="home-today-meeting__divider" aria-hidden="true" />
        <Tooltip title={t('home.meetingCollapseTip')}>
          <Button
            type="text"
            size="small"
            icon={<UpOutlined style={{ fontSize: 11 }} />}
            onClick={() => bar.setCollapsed(true)}
            style={{ fontSize: 12, color: 'var(--text-2)', padding: '0 8px' }}
          >
            {t('home.meetingCollapse')}
          </Button>
        </Tooltip>
      </div>
    </div>
  )
}
