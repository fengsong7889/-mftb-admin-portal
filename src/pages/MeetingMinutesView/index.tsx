/**
 * 会议纪要免登查看页（移动端，钉钉卡片「查看完整紀要」直达）
 *
 * 路由：#/meeting-minutes-view?token=...（公开页，不套后台布局、不带 JWT）
 *
 * 与免登签到页同构：身份由 HMAC 签名令牌裁决，页面只转述后端给的结论。
 * 刻意不放的东西同样是设计：不放投递明细（谁没收到是内部问责信息）、不放参会人手机号、
 * 不做"切换到别的纪要"——切换等于把令牌当通行证用。
 *
 * 展示的是该批次发送瞬间的内容快照：用户点开的是"发给我的那一版"，
 * 而不是记录人后来又改过的新版，否则消息与链接会互相矛盾。
 */
import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Alert, Button, Spin } from 'antd'
import { fetchMinutesPage, type MinutesPageView } from '@/api/meetingMinutesPage'
import MinutesContentCard from '../MeetingManagement/MeetingMinutes/MinutesContentCard'
import { useTranslation } from 'react-i18next'

export default function MeetingMinutesView() {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const [view, setView] = useState<MinutesPageView>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false)
      setError(t('meeting.minutes.pageMissingToken', { defaultValue: '缺少查看令牌，請從釘釘卡片重新進入' }))
      return
    }
    setLoading(true)
    setError(undefined)
    try {
      setView(await fetchMinutesPage(token))
    } catch (e) {
      setError(e instanceof Error ? e.message : t('meeting.minutes.pageLoadFailed', { defaultValue: '紀要頁加載失敗' }))
    } finally {
      setLoading(false)
    }
  }, [token, t])

  useEffect(() => { void load() }, [load])

  const invalid = view != null && view.valid === false

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #F7F9FC 0%, #EEF2F8 100%)',
      padding: '24px 16px 40px',
      display: 'flex',
      justifyContent: 'center',
    }}
    >
      <div style={{ width: '100%', maxWidth: 560 }}>
        <div style={{ fontSize: 13, color: '#8C8C8C', marginBottom: 12 }}>{t('meeting.minutes.pageTitle', { defaultValue: '會議紀要' })}</div>

        {loading && (
          <div style={{ textAlign: 'center', padding: '48px 0' }}><Spin size="large" /></div>
        )}

        {error && !loading && (
          <Alert type="error" showIcon message={t('meeting.minutes.pageUnableToOpen', { defaultValue: '無法打開紀要' })} description={error}
            action={<Button size="small" onClick={() => void load()}>{t('meeting.minutes.pageRetry', { defaultValue: '重試' })}</Button>} />
        )}

        {!loading && invalid && (
          <Alert type="warning" showIcon message={t('meeting.minutes.pageLinkUnavailable', { defaultValue: '查看連結不可用' })}
            description={view?.message ?? t('meeting.minutes.pageLinkUnavailableDesc', { defaultValue: '連結已過期或已被記錄人作廢，請向發送你紀要的人重新索取' })} />
        )}

        {!loading && view?.valid && view.content && (
          <div style={{ background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: 18, fontWeight: 600, lineHeight: 1.4 }}>{view.title}</div>
            <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 4 }}>{`${view.minutesNo ?? ''} · ${view.bookingNo ?? ''}`}</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16, fontSize: 13 }}>
              <Row label={t('meeting.minutes.pageTime', { defaultValue: '時間' })} value={view.meetingTimeText} />
              <Row label={t('meeting.minutes.pageRoom', { defaultValue: '會議室' })} value={view.roomText} />
              <Row label={t('meeting.minutes.pageOrganizer', { defaultValue: '組織者' })} value={view.organizerName} />
              <Row label={t('meeting.minutes.pageRecorder', { defaultValue: '記錄人' })} value={`${view.recorderName ?? '-'}${view.recorderEmpNo ? `（${view.recorderEmpNo}）` : ''}`} />
            </div>

            <div style={{ marginTop: 16, borderTop: '1px solid #f0f0f0', paddingTop: 16 }}>
              <MinutesContentCard content={view.content} />
            </div>

            <div style={{ marginTop: 16, fontSize: 11, color: '#BFBFBF', textAlign: 'center', lineHeight: 1.8 }}>
              {t('meeting.minutes.pageSentBy', {
                defaultValue: '由 {{name}} 於 {{time}} 發送（第 {{seq}} 批）',
                name: view.sentByName ?? '-', time: view.sentAt ?? '-', seq: view.batchSeq ?? 1,
              })}
              <br />
              {t('meeting.minutes.pageExpireHint', { defaultValue: '連結有效期至 {{time}}，逾期或被作廢後需重新索取', time: view.expireAt ?? '-' })}
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
