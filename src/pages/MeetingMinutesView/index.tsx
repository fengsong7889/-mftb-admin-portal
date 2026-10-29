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
import { minutesAttachmentFileUrl } from '@/api/meetingMinutes'
import MinutesContentCard from '../MeetingManagement/MeetingMinutes/MinutesContentCard'
import type { AttachmentUrlResolver } from '../MeetingManagement/MeetingMinutes/MinutesAttachments'
import { useTranslation } from 'react-i18next'
import MeetingPublicHeader from '../MeetingManagement/MeetingPublicHeader'

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
    setView(undefined)
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

  /** 免登页附件地址：直接复用页面自带的纪要令牌（查看/下载同一令牌不同用途），
   *  后端会验证附件属于本批快照才放行 */
  const resolveAttachmentUrl: AttachmentUrlResolver = (item, purpose) =>
    minutesAttachmentFileUrl({ attachmentNo: item.attachmentNo, token, purpose })

  return (
    <div className="mm-public-page">
      <div className="mm-public-page__inner">
        {/* 公共页头（语言切换/复制链接/浏览器打开）由 MeetingPublicHeader 统一提供，与免登签到页同源；
            「只读文档」口径提示留在 label 行，避免改版后丢失批次快照语义。 */}
        <MeetingPublicHeader kind="minutes" />
        <div className="mm-public-page__label"><span>{t('meeting.minutes.publicationText.readonlyDocument')}</span></div>

        {loading && (
          <div className="mm-public-page__loading"><Spin size="large" /></div>
        )}

        {error && !loading && (
          <Alert type="error" showIcon message={t('meeting.minutes.pageUnableToOpen', { defaultValue: '無法打開紀要' })} description={error}
            action={<Button size="small" onClick={() => void load()}>{t('meeting.minutes.pageRetry', { defaultValue: '重試' })}</Button>} />
        )}

        {!loading && invalid && (
          <Alert type="warning" showIcon message={t('meeting.minutes.pageLinkUnavailable', { defaultValue: '查看連結不可用' })}
            description={view?.message ?? t('meeting.minutes.pageLinkUnavailableDesc', { defaultValue: '連結已過期或已被記錄人作廢，請向發送你紀要的人重新索取' })} />
        )}

        {!loading && !error && view?.valid && view.content && (
          <>
            <MinutesContentCard content={view.content} snapshot={view.document} attachments={view.document?.attachments ?? view.attachments ?? undefined} resolveAttachmentUrl={resolveAttachmentUrl} document={{
              title: view.title || undefined,
              minutesNo: view.minutesNo || undefined,
              bookingNo: view.bookingNo || undefined,
              editionLabel: t('meeting.minutes.legacyBatchTitle', { seq: view.batchSeq ?? 1 }),
              meetingTime: view.meetingTimeText,
              organizer: view.organizerName,
              recorder: `${view.recorderName || t('meeting.minutes.notRecorded')}${view.recorderEmpNo ? `（${view.recorderEmpNo}）` : ''}`,
              room: view.roomText,
              footer: <><span>{t('meeting.minutes.recorderColumn')} {view.recorderName || t('meeting.minutes.notRecorded')}</span><span>{t('meeting.minutes.publicationText.sender')}{view.sentByName || t('meeting.minutes.notRecorded')}</span><span>{t('meeting.minutes.publicationText.batch')}{view.batchSeq ?? 1} {t('meeting.minutes.publicationText.historicalSnapshot')}</span></>,
            }} />

            <div className="mm-public-page__footnote">
              {t('meeting.minutes.pageSentBy', {
                defaultValue: '由 {{name}} 於 {{time}} 發送（第 {{seq}} 批）',
                name: view.sentByName ?? '-', time: view.sentAt ?? '-', seq: view.batchSeq ?? 1,
              })}
              <br />
              {t('meeting.minutes.pageExpireHint', { defaultValue: '連結有效期至 {{time}}，逾期或被作廢後需重新索取', time: view.expireAt ?? '-' })}
              <br />{t('meeting.minutes.publicationText.anyoneHoldingThisLinkCanReadThese')}</div>
          </>
        )}
      </div>
    </div>
  )
}
