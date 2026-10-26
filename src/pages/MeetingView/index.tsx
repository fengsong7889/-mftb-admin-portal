/**
 * 会议详情免登查看页（移动端，钉钉邀约卡片「查看會議詳情」直达）
 *
 * 路由：#/meeting-view?token=...（公开页，不套后台布局、不带 JWT）
 *
 * 与免登签到页/纪要页同构：身份由 HMAC 签名令牌裁决，页面只转述后端给的结论。
 * 刻意不放的东西同样是设计：不放参会人名单、不放手机号、不放投递明细——
 * 免登链接可被转发，每一个字段的暴露都不受登录态保护。
 *
 * 会议已取消/释放/结束时（closed=true）页面只回看：不给线上会议入口、不给任何动作按钮，
 * 与服务端"终态卡片不挂跳转按钮"的口径一致。
 */
import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Alert, Button, Spin, Tag } from 'antd'
import { CalendarOutlined, ClockCircleOutlined, EnvironmentOutlined, TeamOutlined } from '@ant-design/icons'
import { fetchMeetingViewPage, type MeetingViewPage as MeetingView } from '../../api/meetingViewPage'
import { useTranslation } from 'react-i18next'

/** 状态 → Tag 颜色：与后台会议状态口径一致（蓝=进行中，绿=完成，灰=取消，橙=释放） */
function statusColor(phase?: string | null) {
  switch (phase) {
    case 'pending':
      return 'blue'
    case 'ongoing':
      return 'processing'
    case 'ended':
    case 'finished':
      return 'green'
    case 'released':
      return 'orange'
    default:
      return 'default'
  }
}

export default function MeetingViewPage() {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const [view, setView] = useState<MeetingView>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false)
      setError(t('meeting.viewPage.missingToken', { defaultValue: '缺少查看令牌，請從釘釘卡片重新進入' }))
      return
    }
    setLoading(true)
    setError(undefined)
    try {
      setView(await fetchMeetingViewPage(token))
    } catch (e) {
      setError(e instanceof Error ? e.message : t('meeting.viewPage.loadFailed', { defaultValue: '會議詳情加載失敗' }))
    } finally {
      setLoading(false)
    }
  }, [token, t])

  useEffect(() => { void load() }, [load])

  const invalid = view != null && view.valid === false
  const closed = view?.closed === true
  const roomText = [view?.roomName, view?.roomLocation].filter(Boolean).join(' · ')
  // 终态提示：已取消/已释放/已结束分别说清，不给“可能还能进”的模糊话术
  const closedMessage = view?.status === 'cancelled'
    ? t('meeting.viewPage.closedCancelled', { defaultValue: '這場會議已取消，無需到場' })
    : view?.status === 'released'
      ? t('meeting.viewPage.closedReleased', { defaultValue: '這場會議的會議室已釋放' })
      : view?.status === 'finished'
        ? t('meeting.viewPage.closedFinished', { defaultValue: '這場會議已結束' })
        : t('meeting.viewPage.closedEnded', { defaultValue: '這場會議已結束，以下資訊僅供回看' })

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #F7F9FC 0%, #EEF2F8 100%)',
      padding: '24px 16px 40px',
      display: 'flex',
      justifyContent: 'center',
    }}
    >
      <div style={{ width: '100%', maxWidth: 520 }}>
        <div style={{ fontSize: 13, color: '#8C8C8C', marginBottom: 12 }}>
          {t('meeting.viewPage.pageTitle', { defaultValue: '會議詳情' })}
        </div>

        {loading && (
          <div style={{ textAlign: 'center', padding: '48px 0' }}><Spin size="large" /></div>
        )}

        {error && !loading && (
          <Alert
            type="error"
            showIcon
            message={t('meeting.viewPage.unableToOpen', { defaultValue: '無法打開會議詳情' })}
            description={error}
            action={<Button size="small" onClick={() => void load()}>{t('meeting.viewPage.retry', { defaultValue: '重試' })}</Button>}
          />
        )}

        {!loading && invalid && (
          <Alert
            type="warning"
            showIcon
            message={t('meeting.viewPage.linkUnavailable', { defaultValue: '查看連結不可用' })}
            description={view?.message ?? t('meeting.viewPage.linkUnavailableDesc', { defaultValue: '連結已過期，請向組織者重新索取' })}
          />
        )}

        {!loading && view?.valid && (
          <div style={{ background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ flex: 1, fontSize: 18, fontWeight: 600, lineHeight: 1.4 }}>{view.title}</div>
              {view.statusText && <Tag color={statusColor(view.phase)} style={{ marginTop: 2 }}>{view.statusText}</Tag>}
            </div>
            <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 4 }}>{view.bookingNo}</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 20, fontSize: 13 }}>
              <Row icon={<CalendarOutlined />} label={t('meeting.viewPage.time', { defaultValue: '會議時間' })}
                value={view.timeText || [view.startTime, view.endTime].filter(Boolean).join(' ~ ')} />
              <Row icon={<EnvironmentOutlined />} label={t('meeting.viewPage.room', { defaultValue: '會議室' })} value={roomText} />
              <Row icon={<TeamOutlined />} label={t('meeting.viewPage.organizer', { defaultValue: '組織者' })} value={view.organizerName} />
              {view.delegateForName && (
                <Row icon={<TeamOutlined />} label={t('meeting.viewPage.delegate', { defaultValue: '實際使用人' })} value={view.delegateForName} />
              )}
              {view.description && (
                <Row icon={<ClockCircleOutlined />} label={t('meeting.viewPage.agenda', { defaultValue: '議程' })} value={view.description} />
              )}
            </div>

            {closed && (
              <div style={{ marginTop: 20 }}>
                <Alert
                  type="info"
                  showIcon
                  message={closedMessage}
                />
                {view.cancelReason && (
                  <div style={{ marginTop: 8, fontSize: 12, color: '#8C8C8C' }}>
                    {t('meeting.viewPage.cancelReason', { defaultValue: '取消原因：{{reason}}', reason: view.cancelReason })}
                  </div>
                )}
                {view.releaseReason && (
                  <div style={{ marginTop: 8, fontSize: 12, color: '#8C8C8C' }}>
                    {t('meeting.viewPage.releaseReason', { defaultValue: '釋放原因：{{reason}}', reason: view.releaseReason })}
                  </div>
                )}
              </div>
            )}

            {!closed && view.onlineMeetingUrl && (
              <div style={{ marginTop: 20 }}>
                <Button type="primary" block size="large" href={view.onlineMeetingUrl} target="_blank" rel="noreferrer">
                  {t('meeting.viewPage.joinOnline', { defaultValue: '進入線上會議' })}
                </Button>
              </div>
            )}

            <div style={{ marginTop: 20, borderTop: '1px solid #f0f0f0', paddingTop: 12, fontSize: 11, color: '#BFBFBF', lineHeight: 1.8 }}>
              {t('meeting.viewPage.publicHint', { defaultValue: '此連結免登查看，僅顯示會議公開資訊；轉發給他人同樣可打開' })}
              <br />
              {t('meeting.viewPage.expireHint', { defaultValue: '連結有效期至 {{time}}，逾期後請向組織者重新索取', time: view.tokenExpireAt ?? '-' })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/** 信息行：图标 + 标签 + 值（长文本自动换行） */
function Row({ icon, label, value }: { icon: ReactNode; label: string; value?: string | null }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <span style={{ color: '#8C8C8C', width: 72, flexShrink: 0, display: 'inline-flex', gap: 6, alignItems: 'center' }}>
        {icon}
        {label}
      </span>
      <span style={{ color: '#262626', flex: 1, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{value || '-'}</span>
    </div>
  )
}
