/**
 * 纪要正文只读渲染卡（查看页 / 免登页 / 发送摘要三处共用）。
 *
 * <p>为什么抽成一份而不是每页各写一遍：三处讲的是同一件事（这份纪要写了什么），
 * 分开写必然出现「查看页有行動項、免登页漏了」，用户就会怀疑两个页面看的不是同一份纪要。
 *
 * <p>版式与钉钉卡片的关系：钉钉实际正文由后端 MeetingMinutesRenderer 生成（唯一渲染出口），
 * 本组件保留相同的内容分区，阅读正文使用文件表格；钉钉 markdown 的列表排版不受影响。
 */
import { Button } from 'antd'
import { FileTextOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import type { ReactNode } from 'react'
import { minutesPurposeText, type MinutesAction, type MinutesAttendance, type MinutesContent, type MinutesDocument, type MinutesItemView } from '@/api/meetingMinutes'
import GroupLogo from '@/components/GroupLogo'
import { bizTypeLabels } from '../meetingMeta'
import { MinutesAttachmentList } from './MinutesAttachments'
import './minutes.css'

/** 仅承载展示信息；正式发布快照接入前，不用编辑锁版本冒充文档版本。 */
interface DocumentInfo {
  title?: string
  minutesNo?: string
  bookingNo?: string
  editionLabel?: string
  meetingTime?: ReactNode
  chair?: ReactNode
  meetingType?: ReactNode
  organizer?: ReactNode
  recorder?: ReactNode
  room?: ReactNode
  attendees?: { userId?: number | null; name: string; empNo?: string | null }[]
  externalAttendees?: string | null
  footer?: ReactNode
}

interface Props {
  content: MinutesContent
  snapshot?: MinutesDocument
  /** 界面预览附件；真实附件待受控上传和读取契约接入后提供，禁止把 File 塞进正文 JSON。 */
  attachmentFiles?: File[]
  /** 紧凑模式（弹窗内摘要）：去掉模块标题的留白，只留内容 */
  compact?: boolean
  /**
   * 隐藏行动项与跟进事项：查看页把这两类放在可更新状态的独立表格里，
   * 正文再渲染一遍会出现「行動項 0 / 無行動項」与下方表格自相矛盾。
   * 发送预览/免登页不传，保持它们看到完整正文。
   */
  hideTracked?: boolean
  document?: DocumentInfo
  /** 当前事项仅用于后台工作稿展示；免登页只能使用批次正文快照。 */
  trackedItems?: MinutesItemView[]
  /** 表单预览使用现有跟进字段，不修改 API 的旧正文结构。 */
  followUpDetails?: MinutesAction[]
  references?: ReactNode
  /** 表单预览的姓名回显，不改写提交数据。 */
  people?: { id: number; name: string; empId?: string }[]
}

// 第一阶段新增展示文案暂用繁中，界面确认后再统一接入 i18n。

/**
 * 分区容器：连续编号标题 + 正文，不以彩色卡片区分文件章节。
 * 定义在组件外而不是 render 内部：内部定义会每次渲染换掉组件身份，受控子树被重建。
 */
function Section({ title, number, children }: {
  title: string; number: string; children: ReactNode
}) {
  return (
    <section className="mm-document__section">
      <h3 className="mm-document__section-title"><span>{number}</span>{title}</h3>
      {children}
    </section>
  )
}

const ATTENDANCE_ORDER = { present: 0, unverified: 1, absent: 2 } as const

function personText(name?: string, empNo?: string) {
  return name ? `${name}${empNo ? `（${empNo}）` : ''}` : undefined
}

/** 仅派生阅读顺序，不改写快照；旧受邀名单不能推定实际出席。 */
function attendanceRows(content: MinutesContent, invited: DocumentInfo['attendees'] = []): MinutesAttendance[] {
  if (content.attendance != null) {
    return [...content.attendance].sort((a, b) => (ATTENDANCE_ORDER[a.status] ?? 1) - (ATTENDANCE_ORDER[b.status] ?? 1))
  }
  const rows: MinutesAttendance[] = invited.map(person => ({ ...person, empNo: person.empNo ?? undefined, status: 'unverified' }))
  for (const absentee of content.absentees ?? []) {
    const matches = rows.map((person, index) => ({ person, index })).filter(({ person }) => {
      if (person.userId != null && absentee.userId != null) return person.userId === absentee.userId
      if (person.empNo && absentee.empNo) return person.empNo === absentee.empNo
      return person.userId == null && absentee.userId == null && !person.empNo && !absentee.empNo && person.name === absentee.name
    })
    if (matches.length === 1) rows[matches[0].index] = { ...matches[0].person, ...absentee, status: 'absent' }
    else rows.push({ ...absentee, status: 'absent' })
  }
  return rows.sort((a, b) => ATTENDANCE_ORDER[a.status] - ATTENDANCE_ORDER[b.status])
}

function AttendanceNames({ people }: { people: MinutesAttendance[] }) {
  const { t } = useTranslation()
  return <div className="mm-document__names">{people.map((person, index) => {
    const status = person.status in ATTENDANCE_ORDER ? person.status : 'unverified'
    return <span className="mm-document__attendee" key={`${person.userId ?? person.empNo ?? person.name}-${index}`}>
      <span>{personText(person.name, person.empNo)}</span>
      <span aria-hidden="true"> · </span>
      <span className={`mm-document__attendance-status mm-document__attendance-status--${status}`}>{t(`meeting.minutes.${status}`)}</span>
      {status !== 'absent' && person.reason && <span className="mm-document__attendance-reason"> · {person.reason}</span>}
    </span>
  })}</div>
}

export default function MinutesContentCard({ content: suppliedContent, attachmentFiles, compact, hideTracked, document: suppliedInfo, snapshot, trackedItems, followUpDetails, references: suppliedReferences, people = [] }: Props) {
  const { t } = useTranslation()
  const content = snapshot?.content ?? suppliedContent
  const purpose = minutesPurposeText(content)
  const info: DocumentInfo | undefined = snapshot ? {
    title: snapshot.meetingTitle, minutesNo: snapshot.minutesNo, bookingNo: snapshot.bookingNo,
    editionLabel: `V${snapshot.revisionNo} · ${t('meeting.minutes.formallyPublished', { defaultValue: '已發布' })}`,
    meetingTime: snapshot.meetingTimeText,
    chair: personText(content.chairName, content.chairEmpNo),
    meetingType: snapshot.meetingType ? bizTypeLabels()[snapshot.meetingType] : undefined,
    organizer: personText(snapshot.organizerName, snapshot.organizerEmpNo),
    recorder: personText(snapshot.recorderName, snapshot.recorderEmpNo),
    room: snapshot.roomText,
    externalAttendees: snapshot.externalAttendees,
    footer: <><span>{t('meeting.minutes.recorderColumn')} {personText(snapshot.recorderName, snapshot.recorderEmpNo)}</span><span>{t('meeting.minutes.publisher', { defaultValue: '發布人' })} {snapshot.publisherName}</span><span>{snapshot.publishedAt} · V{snapshot.revisionNo}</span>{snapshot.changeNote && <p>{t('meeting.minutes.changeNote', { defaultValue: '修訂說明' })}：{snapshot.changeNote}</p>}</>,
  } : suppliedInfo
  const references = snapshot?.references?.length ? <div>{snapshot.references.map(ref => <p key={ref.minutesId}>{ref.minutesNo} · {ref.title} · {ref.timeText}</p>)}</div> : suppliedReferences
  const items = content.items ?? []
  const actions: (MinutesAction & { id?: number })[] = content.schemaVersion === 2 ? content.actions ?? [] : trackedItems ? trackedItems.filter(item => item.kind === 'ACTION') : content.actions ?? []
  const follows: (MinutesAction & { id?: number })[] | undefined = content.schemaVersion === 2 ? content.openIssues ?? [] : followUpDetails ?? trackedItems?.filter(item => item.kind === 'FOLLOW')
  const openIssues = content.openIssues ?? []
  const attendees = attendanceRows(content, info?.attendees)
  const presentAttendees = attendees.filter(person => person.status === 'present')
  const absentees = attendees.filter(person => person.status === 'absent')
  const unverifiedAttendees = attendees.filter(person => person.status !== 'present' && person.status !== 'absent')
  const fields = [
    { label: t('meeting.meetingTime'), value: info?.meetingTime },
    { label: t('meeting.minutes.chair'), value: info?.chair ?? personText(content.chairName, content.chairEmpNo) },
    { label: t('meeting.meetingType'), value: info?.meetingType },
    { label: t('meeting.organizer'), value: info?.organizer },
    { label: t('meeting.minutes.recorderColumn'), value: info?.recorder },
    { label: t('meeting.minutes.publicationText.meetingLocation'), value: info?.room },
  ]
  const conclusions = items.filter(item => item.conclusion?.trim())

  return (
    <article className={`mm-document${info ? ' mm-document--sheet' : ''}${compact ? ' mm-document--compact' : ''}`} aria-label={t('meeting.minutes.publicationText.meetingMinutesDocument')}>
      {info && (
        <header className="mm-document__header">
          <div className="mm-document__eyebrow">
            <div className="mm-document__brand">
              <span role="img" aria-label={t('meeting.minutes.publicationText.groupLogo')}><span aria-hidden="true"><GroupLogo size={36} /></span></span>
              <span>{t('meeting.minutes.adminTitle')}</span>
            </div>
            <span className="mm-document__english-title">MEETING MINUTES</span>
          </div>
          <div className="mm-document__rule" aria-hidden="true" />
          <h2 className="mm-document__title">{info.title || t('meeting.minutes.publicationText.meetingTitleNotRecorded')}</h2>
          <div className="mm-document__identity">
            <span>{t('meeting.minutes.publicationText.minutesNumber')}：{info.minutesNo || t('meeting.minutes.publicationText.minutesNumberPending')}</span>
            {info.bookingNo && <span>{t('meeting.minutes.publicationText.meetingNumber')}：{info.bookingNo}</span>}
            <span className="mm-document__edition">{info.editionLabel || t('meeting.minutes.publicationText.workingDraftUnpublished')}</span>
          </div>
          <dl className="mm-document__metadata">
            {fields.map(field => (
              <div key={field.label}><dt>{field.label}</dt><dd>{field.value || t('meeting.minutes.publicationText.notRecorded')}</dd></div>
            ))}
            <div className="mm-document__metadata-wide">
              <dt>{t('meeting.attendees5')}</dt>
              <dd>{presentAttendees.length > 0 ? <AttendanceNames people={presentAttendees} /> : <span className="mm-document__muted">{content.attendance != null ? t('meeting.viewPage.attendeesEmpty') : t('meeting.minutes.publicationText.attendanceWasNotRecordedInTheseHistorical')}</span>}</dd>
            </div>
            {absentees.length > 0 && (
              <div className="mm-document__metadata-wide mm-document__absentees">
                <dt>{t('meeting.minutes.sectionAbsentees')}</dt>
                <dd><AttendanceNames people={absentees} /></dd>
              </div>
            )}
            {(unverifiedAttendees.length > 0 || info.externalAttendees) && (
              <div className="mm-document__metadata-wide mm-document__unverified">
                <dt>{t('meeting.minutes.unverified')}</dt>
                <dd><AttendanceNames people={unverifiedAttendees} />
                  {info.externalAttendees && <p>{t('meeting.externalAttendees')}：{info.externalAttendees}</p>}
                </dd>
              </div>
            )}
          </dl>
        </header>
      )}

      {!compact && (
        <Section title={t('meeting.minutes.purpose', { defaultValue: '會議目的' })} number="01">
          {purpose ? <p className="mm-document__body">{purpose}</p> : <p className="mm-document__muted">{t('meeting.minutes.notRecorded')}</p>}
          <div className="mm-document__summary">
            <div className="mm-document__label">{t('meeting.minutes.publicationText.keyConclusions')}</div>
            {conclusions.length > 0 ? (
              <ol>{conclusions.map((item, index) => <li key={index}>{item.conclusion}</li>)}</ol>
            ) : <p className="mm-document__muted">{t('meeting.minutes.publicationText.noConclusionRecordedSeeTheDiscussionBelow')}</p>}
            <div className="mm-document__muted">{t('meeting.minutes.conclusionsSource', { defaultValue: '摘自各議題結論，實際發布狀態以文檔版本為準。' })}</div>
          </div>
        </Section>
      )}

      <Section title={t('meeting.minutes.sectionAgenda', { defaultValue: '議程與結論' })} number="02">
        {items.length === 0 ? <p className="mm-document__muted">{t('meeting.minutes.agendaEmpty', { defaultValue: '未填寫議題' })}</p> : (
          <div className="mm-document__agenda">{items.map((item, index) => (
            <section key={index} className="mm-document__topic">
              <div className="mm-document__topic-head">
                <h4><span>{`2.${index + 1}`}</span>{item.topic?.trim() || t('meeting.minutes.topicUntitled', { defaultValue: '未命名議題' })}</h4>
                {item.decisionStatus && <span className="mm-document__topic-status">{t(`meeting.minutes.decision.${item.decisionStatus}`)}</span>}
              </div>
              {item.discussion?.trim() && <div className="mm-document__record-row"><span className="mm-document__label">{t('meeting.minutes.discussion')}</span><p>{item.discussion}</p></div>}
              {item.conclusion?.trim() ? (
                <div className="mm-document__decision"><span className="mm-document__label">{t('meeting.minutes.publicationText.conclusionDecision')}</span><p>{item.conclusion}</p></div>
              ) : <p className="mm-document__muted">{t('meeting.minutes.publicationText.noConclusionRecorded')}</p>}
            </section>
          ))}</div>
        )}
      </Section>

      {!hideTracked && (
        <Section title={t('meeting.minutes.sectionActions', { defaultValue: '行動項' })} number="03">
          {actions.length === 0 ? <p className="mm-document__muted">{t('meeting.minutes.actionsEmpty', { defaultValue: '無行動項' })}</p> : (
            <div className="mm-document__table-scroll" role="region" tabIndex={0} aria-label={t('meeting.minutes.sectionActions')}>
              <table className="mm-document__table" aria-label={t('meeting.minutes.sectionActions')}>
                <colgroup><col className="mm-document__col-no" /><col /><col className="mm-document__col-person" /><col className="mm-document__col-date" />{!compact && <col className="mm-document__col-deliverable" />}</colgroup>
                <thead><tr>
                  <th scope="col">#</th><th scope="col">{t('meeting.minutes.sectionActions')}</th>
                  <th scope="col">{t('meeting.minutes.owner', { defaultValue: '負責人' })}</th>
                  <th scope="col">{t('meeting.minutes.dueDate', { defaultValue: '完成時限' })}</th>
                  {!compact && <th scope="col">{t('meeting.minutes.publicationText.deliverableAcceptanceCriteria')}</th>}
                </tr></thead>
                <tbody>{actions.map((action, index) => {
                  const person = people.find(candidate => candidate.id === action.ownerUserId)
                  return <tr key={action.id ?? index}>
                    <th scope="row">{`A${String(index + 1).padStart(2, '0')}`}</th>
                    <td>{action.content}</td>
                    <td>{action.ownerName || person?.name || (action.ownerUserId ? t('meeting.minutes.publicationText.employeeAssignedNamePending') : t('meeting.minutes.publicationText.notAssigned'))}{(action.ownerEmpNo || person?.empId) ? `（${action.ownerEmpNo || person?.empId}）` : ''}</td>
                    <td>{action.dueDate || t('meeting.minutes.publicationText.notAssigned')}</td>
                    {!compact && <td>{action.deliverable || t('meeting.minutes.notRecorded', { defaultValue: '未記錄' })}</td>}
                  </tr>
                })}</tbody>
              </table>
            </div>
          )}
        </Section>
      )}

      {!hideTracked && (
        <Section title={t('meeting.minutes.publicationText.openIssuesAndFollowups')} number="04">
          {follows ? (follows.length > 0 ? (
            <div className="mm-document__table-scroll" role="region" tabIndex={0} aria-label={t('meeting.minutes.publicationText.openIssuesAndFollowups')}>
              <table className="mm-document__table" aria-label={t('meeting.minutes.publicationText.openIssuesAndFollowups')}>
                <colgroup><col className="mm-document__col-no" /><col /><col className="mm-document__col-person" /><col className="mm-document__col-date" /></colgroup>
                <thead><tr>
                  <th scope="col">#</th><th scope="col">{t('meeting.minutes.publicationText.openIssuesAndFollowups')}</th>
                  <th scope="col">{t('meeting.minutes.followOwner')}</th><th scope="col">{t('meeting.minutes.publicationText.targetDate')}</th>
                </tr></thead>
                <tbody>{follows.map((item, index) => (
                  <tr key={item.id ?? index}>
                    <th scope="row">{`F${String(index + 1).padStart(2, '0')}`}</th><td>{item.content}</td>
                    <td>{item.ownerName || people.find(person => person.id === item.ownerUserId)?.name || (item.ownerUserId ? t('meeting.minutes.publicationText.employeeAssignedNamePending') : t('meeting.minutes.publicationText.notAssigned'))}{item.ownerEmpNo ? `（${item.ownerEmpNo}）` : ''}</td>
                    <td>{item.dueDate || t('meeting.minutes.publicationText.notAssigned')}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <p className="mm-document__muted">{t('meeting.minutes.publicationText.noFollowupsForThisMeeting')}</p>) : (openIssues.length > 0 ? (
            <ol className="mm-document__tasks">{openIssues.map((issue, index) => (
              <li key={index}><div className="mm-document__task-title"><span>{`F${String(index + 1).padStart(2, '0')}`}</span><strong>{issue.content}</strong></div>
                {issue.needDecisionBy && <p className="mm-document__muted">{t('meeting.minutes.publicationText.awaiting')}{issue.needDecisionBy} {t('meeting.minutes.publicationText.decision')}</p>}
              </li>
            ))}</ol>
          ) : <p className="mm-document__muted">{t('meeting.minutes.publicationText.noFollowupsForThisMeeting')}</p>)}
        </Section>
      )}

      {!info && !compact && absentees.length > 0 && (
        <div className="mm-document__participants"><span className="mm-document__label">{t('meeting.minutes.sectionAbsentees', { defaultValue: '缺席人員' })}</span>
          <AttendanceNames people={absentees} />
        </div>
      )}

      {(content.nextMeetingAt || content.nextMeetingNote || content.remark?.trim() || references || attachmentFiles?.length) && (
        <Section title={t('meeting.minutes.publicationText.nextStepsAndReferences')} number="05">
          {(content.nextMeetingAt || content.nextMeetingNote) && <div className="mm-document__body"><span className="mm-document__label">{t('meeting.minutes.sectionNext', { defaultValue: '下次會議' })}</span><p>{[content.nextMeetingAt, content.nextMeetingNote].filter(Boolean).join(' · ')}</p></div>}
          {references && <div className="mm-document__body"><span className="mm-document__label">{t('meeting.minutes.publicationText.relatedMinutes')}</span>{references}</div>}
          {(content.remark?.trim() || attachmentFiles?.length) && <div className="mm-document__body"><span className="mm-document__label">{t('meeting.minutes.sectionRemark', { defaultValue: '補充說明' })}</span>{content.remark?.trim() && <p>{content.remark}</p>}{attachmentFiles && attachmentFiles.length > 0 && <MinutesAttachmentList files={attachmentFiles} />}</div>}
        </Section>
      )}
      {info?.footer && <footer className="mm-document__footer">{info.footer}</footer>}
    </article>
  )
}

/** 纯展示卡片：不拼令牌、不请求接口；只允许在当前页面切换全文预览。 */
export function MinutesNoticePreview({ title, timeText, minutesNo, revisionNo, publisher, topicCount, actionCount, followCount, onView }: {
  title?: string; timeText?: string; minutesNo?: string; revisionNo?: number; publisher?: string
  topicCount: number; actionCount: number; followCount: number; onView?: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="mm-notice-preview" aria-label={t('meeting.minutes.publicationText.dingtalkNotificationCardPreview')}>
      <div className="mm-notice-preview__source"><FileTextOutlined />{t('meeting.minutes.publicationText.meetingManagement')}<span>{t('meeting.minutes.publicationText.stylePreview')}</span></div>
      <h4>{t('meeting.minutes.publicationText.meetingMinutesNotification')}</h4>
      <div className="mm-notice-preview__subject">{title || t('meeting.minutes.meetingTitle')}</div>
      <dl>
        <div><dt>{t('meeting.viewPage.time')}</dt><dd>{timeText || t('meeting.minutes.publicationText.pending')}</dd></div>
        <div><dt>{t('meeting.minutes.publicationText.minutesNumber')}</dt><dd>{minutesNo || t('meeting.minutes.publicationText.generatedAfterSaving')}</dd></div>
        <div><dt>{t('meeting.minutes.publicationText.publishedVersion')}</dt><dd>{revisionNo ? `V${revisionNo}` : t('meeting.minutes.versionAfterPublish', { defaultValue: '發布後生成' })}</dd></div>
        {publisher && <div><dt>{t('meeting.minutes.publisher', { defaultValue: '發布人' })}</dt><dd>{publisher}</dd></div>}
      </dl>
      <p className="mm-notice-preview__counts">{t('meeting.minutes.cardCounts', { topic: topicCount, action: actionCount, follow: followCount })}</p>
      <Button block onClick={onView} disabled={!onView}>{t('meeting.minutes.viewMinutesShort')}{onView ? t('meeting.minutes.publicationText.preview') : ''}</Button>
      <div className="mm-notice-preview__hint">{t('meeting.minutes.publicationText.thisIsACardPreviewNoNotification')}</div>
    </div>
  )
}
