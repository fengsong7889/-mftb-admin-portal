/**
 * 会议免登签到页（移动端，扫码/钉钉链接直达）
 *
 * 路由：#/meeting-checkin?token=...（公开页，不套后台布局、不带 JWT）
 *
 * 页面只做三件事：显示"我是谁 + 哪场会"、给出一个签到按钮、把后端给的结论原样转述。
 * 刻意不放的东西同样是设计：不放参会人名单（免登页不受登录态保护）、不放议程与关联需求、
 * 不做"切换到别人的会议"——切换就等于把令牌当通行证用。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Alert, Button, Spin } from 'antd'
import { CheckCircleOutlined, ClockCircleOutlined } from '@ant-design/icons'
import { fetchCheckinDetail, submitCheckin, type CheckinView } from '../../api/meetingCheckinPage'
import { attendeeTypeLabels } from '../MeetingManagement/meetingMeta'
import { useTranslation } from 'react-i18next'

export default function MeetingCheckin() {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const [view, setView] = useState<CheckinView>()
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string>()

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false)
      setError(t('meeting.checkin.missingAttendeeTokenPlease', { defaultValue: '缺少參會令牌，請重新掃描會議室簽到碼' }))
      return
    }
    setLoading(true)
    setError(undefined)
    try {
      setView(await fetchCheckinDetail(token))
    } catch (e) {
      setError(e instanceof Error ? e.message : t('meeting.checkin.failedToLoadCheck', { defaultValue: '簽到頁加載失敗' }))
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { void load() }, [load])

  const sign = async () => {
    setSubmitting(true)
    try {
      setView(await submitCheckin(token))
    } catch (e) {
      setError(e instanceof Error ? e.message : t('meeting.checkin.checkInFailed', { defaultValue: '簽到失敗' }))
    } finally {
      setSubmitting(false)
    }
  }

  const invalid = view != null && view.valid === false

  // 三句状态提示都带变量：走 i18next 的 {{var}} 插值而不是字符串拼接。
  // 拼接会把语序锁死在中文（英文是 "Checked in at 10:00"，语序相反），插值让译文自己决定变量位置。
  const hint = useMemo(() => {
    if (!view || !view.valid) return ''
    if (view.checkedIn) {
      return t('meeting.checkin.checkedInAt', { defaultValue: '已於 {{time}} 簽到', time: view.checkinAt ?? '' })
    }
    if (view.canCheckin) {
      return t('meeting.checkin.checkinDeadline', {
        defaultValue: '簽到截止：{{time}}',
        time: view.checkinDeadlineAt ?? t('meeting.checkin.beforeMeetingEnd', { defaultValue: '會議結束前' }),
      })
    }
    return view.checkinOpenAt
      ? t('meeting.checkin.checkinOpenFrom', { defaultValue: '可簽到時間：{{time}}', time: view.checkinOpenAt })
      : t('meeting.checkin.notCheckableNow', { defaultValue: '當前不可簽到' })
  }, [view, t])

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #F7F9FC 0%, #EEF2F8 100%)',
      padding: '24px 16px 40px',
      display: 'flex',
      justifyContent: 'center',
    }}
    >
      <div style={{ width: '100%', maxWidth: 460 }}>
        <div style={{ fontSize: 13, color: '#8C8C8C', marginBottom: 12 }}>{t('meeting.checkin.scanToCheckIn', { defaultValue: '會議掃描簽到' })}</div>

        {loading && (
          <div style={{ textAlign: 'center', padding: '48px 0' }}><Spin size="large" /></div>
        )}

        {error && !loading && (
          <Alert type="error" showIcon message={t('meeting.checkin.unableToOpenCheck', { defaultValue: '無法打開簽到頁' })} description={error}
            action={<Button size="small" onClick={() => void load()}>{t('meeting.checkin.retry', { defaultValue: '重試' })}</Button>} />
        )}

        {!loading && invalid && (
          <Alert type="warning" showIcon message={t('meeting.checkin.checkInLinkUnavailable', { defaultValue: '簽到連結不可用' })}
            description={view?.message ?? t('meeting.checkin.regenerateItOnThe', { defaultValue: '請在會議詳情頁重新生成' })} />
        )}

        {!loading && view?.valid && (
          <div style={{ background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: 18, fontWeight: 600, lineHeight: 1.4 }}>{view.title}</div>
            <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 4 }}>{view.bookingNo}</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16, fontSize: 13 }}>
              <Row label={t('meeting.checkin.time', { defaultValue: '時間' })} value={`${view.startTime} ~ ${view.endTime}`} />
              <Row label={t('meeting.checkin.meetingRoom', { defaultValue: '會議室' })} value={[view.roomName, view.roomLocation].filter(Boolean).join(' · ')} />
              <Row label={t('meeting.checkin.organizer', { defaultValue: '組織者' })} value={view.organizerName ?? '-'} />
              <Row label={t('meeting.checkin.myRole', { defaultValue: '我的身份' })} value={`${view.myName ?? '-'}${view.myRole ? `（${attendeeTypeLabels()[view.myRole] ?? view.myRole}）` : ''}`} />
            </div>

            <div style={{ marginTop: 20 }}>
              {view.checkedIn ? (
                <Alert type="success" showIcon icon={<CheckCircleOutlined />}
                  message={t('meeting.checkin.youHaveCheckedIn', { defaultValue: '你已簽到' })} description={hint} />
              ) : (
                <>
                  <Button
                    type="primary"
                    block
                    size="large"
                    loading={submitting}
                    disabled={!view.canCheckin}
                    onClick={() => void sign()}
                    icon={view.canCheckin ? undefined : <ClockCircleOutlined />}
                  >
                    {view.canCheckin ? t('meeting.checkin.checkInNow', { defaultValue: '一鍵簽到' }) : t('meeting.checkin.checkInNotAvailable', { defaultValue: '暫不可簽到' })}
                  </Button>
                  {hint && <div style={{ marginTop: 8, fontSize: 12, color: '#8C8C8C', textAlign: 'center' }}>{hint}</div>}
                </>
              )}
            </div>

            <div style={{ marginTop: 16, fontSize: 11, color: '#BFBFBF', textAlign: 'center' }}>
              連結有效期至 {view.tokenExpireAt}（會議結束後 2 小時自動失效）
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div style={{ display: 'flex', gap: 12 }}>
      <span style={{ color: '#8C8C8C', width: 56, flexShrink: 0 }}>{label}</span>
      <span style={{ color: '#262626' }}>{value || '-'}</span>
    </div>
  )
}
