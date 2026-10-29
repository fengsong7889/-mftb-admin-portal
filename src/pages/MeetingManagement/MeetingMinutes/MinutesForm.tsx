/**
 * 会议纪要录入 / 编辑页（非菜单子页：/meeting-minutes-form?bookingId= 或 ?id=）
 *
 * 归属：「我的會議」「預約記錄」操作列的「紀要」按钮与「會議詳情」的纪要模块，
 * 菜单权限挂 meeting-my（见 Permission/types.ts 的 ROUTE_MENU_KEY_MAP）。
 *
 * 三个必须讲清楚的口径：
 *   1. **记录人 = 当前登录人，界面只读**：请求体里没有 recorderUserId 的位置，身份由后端从 JWT 取。
 *      允许前端传记录人等于允许任何人替别人署名记纪要；
 *   2. **会议資訊一律取自会议单**（真实接口 fetchMeetingDetail），本页不造会议数据；
 *      只有纪要接口明确返回 exists=false 才按新建处理，读取失败时禁止保存；
 *   3. **已发送的纪要可以改，但改动不会追溯已发出的批次**：重发时后端生成新的批次与内容快照，
 *      收件人点开的永远是"发给我的那一版"，所以页面要显示发送历史而不是"改了就完事"。
 *
 * 界面遵循 form-page-style：橙渐变头 + 白色 div 模块卡片 + .form-footer 底部按钮。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Alert, Button, DatePicker, Empty, Form, Input, Modal, Radio, Segmented, Select, Space, Spin, Switch, Tag, message } from 'antd'
import {
  ArrowLeftOutlined, CalendarOutlined, CheckCircleOutlined, DeleteOutlined, FileTextOutlined,
  LeftOutlined, PlusOutlined, ProfileOutlined, RightOutlined, SaveOutlined, SendOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import CardTitle from '@/components/CardTitle'
import HelpPopover from '@/components/HelpPopover'
import RemarkTextArea from '@/components/RemarkTextArea'
import { useAuth } from '@/contexts/AuthContext'
import {
  createMinutes, fetchMinutes, fetchMinutesById, searchMinutes, updateMinutes, publishMinutes,
  MINUTES_CONTENT_MAX_LENGTH, MINUTES_LIMITS, emptyMinutesContent, minutesContentLength, minutesPurposeText,
  type MinutesAttendance, type MinutesContent, type MinutesDecisionStatus, type MinutesLinkVO, type MinutesSeriesNode, type MinutesVO,
} from '@/api/meetingMinutes'
import { fetchMeetingDetail, newMeetingRequestKey, toMeetingIsoDate, type MeetingVO } from '@/api/meeting'
import EmployeeSelect from '@/components/EmployeeSelect'
import { bizTypeLabels, minutesStatusMeta, phaseMeta } from '../meetingMeta'
import MinutesContentCard, { MinutesNoticePreview } from './MinutesContentCard'
import useMinutesNavigation from './useMinutesNavigation'
import MinutesAttachmentEditor, { type AttachmentPendingState, type AttachmentUrlResolver } from './MinutesAttachments'
import { fetchMinutesAttachmentAccess, minutesAttachmentFileUrl, type MinutesAttachmentVO } from '@/api/meetingMinutes'
import './minutes.css'

const cardStyle: CSSProperties = {
  border: '1px solid #e8eaed', borderRadius: 8, background: '#fff',
  padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
}

/** 表单内部的扁平结构：嵌套对象在 antd Form 里读写都别扭，提交前再收成 MinutesContent */
interface FormTask {
  itemId?: number; topicKey?: string; content?: string; ownerIds?: number[]; dueDate?: Dayjs | null; deliverable?: string
}
interface FormValues {
  purpose?: string
  chairIds?: number[]
  changeNote?: string
  items: { topicKey?: string; decisionStatus?: MinutesDecisionStatus; topic?: string; discussion?: string; conclusion?: string }[]
  actions: FormTask[]
  followUps: FormTask[]
  nextMeetingAt?: Dayjs | null
  nextMeetingNote?: string
  remark?: string
}

/** 内部员工按 ID 区分；外部人员无 ID，按姓名匹配，不能将全部空 ID 合并成一个人。 */
function attendanceKey(person: Pick<MinutesAttendance, 'userId' | 'name'>): string {
  return person.userId != null ? `user:${person.userId}` : `external:${person.name.trim()}`
}

/**
 * 邀约名单始终带入，补齐旧草稿遗漏的人；保留已保存的确认结果及临时人员。
 * 未确认人员按签到记录初始化是/否，仅作为纪要表单初值，不回写会议签到记录。
 */
function initialAttendance(meeting?: MeetingVO, content?: MinutesContent): MinutesAttendance[] {
  const people = new Map<string, MinutesAttendance>()
  for (const person of meeting?.attendees ?? []) {
    people.set(attendanceKey(person), {
      userId: person.userId, name: person.name, empNo: person.empNo ?? undefined,
      status: person.checkinAt ? 'present' : 'absent',
    })
  }
  const saved: MinutesAttendance[] = content?.attendance?.length
    ? content.attendance : (content?.absentees ?? []).map(person => ({ ...person, status: 'absent' }))
  for (const person of saved) {
    const key = attendanceKey(person)
    const invited = people.get(key)
    const status = person.status === 'unverified' ? invited?.status ?? 'absent' : person.status
    people.set(key, { ...person, empNo: person.empNo ?? invited?.empNo, status,
      reason: status === 'absent' ? person.reason : undefined })
  }
  return [...people.values()]
}

/**
 * 表单扁平值 → MinutesContent：抽成纯函数，供提交与字数即时提示共用。
 * 直接写死在 handleSave 里的话，字数计数器只能靠 getFieldsValue 在渲染期取，
 * 而 getFieldsValue 不触发重渲染，计数器会停在旧值上。
 */
function toContent(values: Partial<FormValues>): MinutesContent {
  return {
    schemaVersion: 2,
    purpose: values.purpose?.trim(),
    chairUserId: values.chairIds?.[0],
    items: (values.items ?? [])
      .map(item => ({ topicKey: item.topicKey, decisionStatus: item.decisionStatus, topic: item.topic?.trim() ?? '', discussion: item.discussion?.trim() ?? '', conclusion: item.conclusion?.trim() ?? '' }))
      .filter(item => item.topic || item.discussion || item.conclusion),
    actions: (values.actions ?? [])
      .map(action => ({
        itemId: action.itemId, topicKey: action.topicKey, deliverable: action.deliverable?.trim(),
        content: action.content?.trim() ?? '',
        // 只传负责人 id：姓名与工号快照由服务端按 id 回查，前端不传名字（与行政代订同一口径，防伪造台账）
        ownerUserId: action.ownerIds?.[0] ?? null,
        dueDate: toMeetingIsoDate(action.dueDate),
      }))
      .filter(action => action.content),
    openIssues: (values.followUps ?? [])
      .map(issue => ({ itemId: issue.itemId, topicKey: issue.topicKey, content: issue.content?.trim() ?? '',
        ownerUserId: issue.ownerIds?.[0], dueDate: toMeetingIsoDate(issue.dueDate) }))
      .filter(issue => issue.content),
    absentees: [],
    nextMeetingAt: values.nextMeetingAt ? values.nextMeetingAt.format('YYYY-MM-DD HH:mm') : null,
    nextMeetingNote: values.nextMeetingNote?.trim() ?? '',
    remark: values.remark?.trim() ?? '',
  }
}

/** 缺席名单由组件外的 state 承载（人选集合，不是文本字段），提交时并入正文 */

export default function MinutesForm() {
  const { t, i18n } = useTranslation()
  const { open: navigate, back, finishEditing } = useMinutesNavigation()
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const bookingIdParam = searchParams.get('bookingId')
  const minutesIdParam = searchParams.get('id')
  const bookingId = bookingIdParam && /^[1-9]\d*$/.test(bookingIdParam) ? Number(bookingIdParam) : undefined
  const minutesId = minutesIdParam && /^[1-9]\d*$/.test(minutesIdParam) ? Number(minutesIdParam) : undefined

  const [form] = Form.useForm<FormValues>()
  /** useWatch 整体监听：字数计数器与发送预览要跟着输入变，getFieldsValue 不触发重渲染 */
  const watchedValues = Form.useWatch([], form) as Partial<FormValues> | undefined
  const [meeting, setMeeting] = useState<MeetingVO>()
  const [minutes, setMinutes] = useState<MinutesVO>()
  const [attendance, setAttendance] = useState<MinutesAttendance[]>([])
  /** 行动项负责人的 id→姓名快照回显底账：没它时编辑页打开就是一排裸 ID */
  const [ownerSeed, setOwnerSeed] = useState<{ id: number; name: string; empId?: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const [minutesLoadNote, setMinutesLoadNote] = useState<string>()
  const saveRequestKey = useRef(newMeetingRequestKey('mm'))
  const publishRequest = useRef<{ signature: string; key: string }>()
  const [nextMeetingEnabled, setNextMeetingEnabled] = useState(false)
  /** 附件是组件外 state（对象集合不是文本字段）：保存时按号写进正文 attachments，与正文同事务绑定 */
  const [attachmentList, setAttachmentList] = useState<MinutesAttachmentVO[]>([])
  const [attachmentPending, setAttachmentPending] = useState<AttachmentPendingState>({ uploading: 0, failed: 0 })

  /** 站内附件地址：每次现取 5 分钟票据，不拼任何可收藏的长期地址 */
  const resolveAttachmentUrl: AttachmentUrlResolver = async (item, purpose) => {
    const access = await fetchMinutesAttachmentAccess(item.attachmentNo, purpose)
    return minutesAttachmentFileUrl({ attachmentNo: item.attachmentNo, ticket: access.ticket })
  }
  /** 关联纪要：只存 id，标题/时间由服务端回查做快照 */
  const [linkIds, setLinkIds] = useState<number[]>([])
  const [linkOptions, setLinkOptions] = useState<MinutesLinkVO[]>([])
  /** 签到补录：钉钉未签到但实际到会的人 */
  const [displayMode, setDisplayMode] = useState('edit')
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const modeRef = useRef<HTMLDivElement>(null)

  // 新字段本阶段只展示禁用控件，避免填写了未接入字段后被旧保存接口静默丢弃。
  const showDocumentPreview = () => {
    setDisplayMode('preview')
    modeRef.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' })
  }

  const navigateSafely = (target?: string) => {
    const leave = () => target ? navigate(target) : back()
    if (!hasUnsavedChanges) { leave(); return }
    Modal.confirm({
      title: t('meeting.minutes.publicationText.discardUnsavedChangesBeforeLeaving'),
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      content: <div className="confirm-info-card">{t('meeting.minutes.publicationText.yourChangesHaveNotBeenSavedAnd')}</div>,
      okText: t('meeting.minutes.publicationText.discardAndLeave'),
      cancelText: t('meeting.minutes.publicationText.continueEditing'),
      onOk: leave,
    })
  }

  useEffect(() => {
    if (!hasUnsavedChanges) return
    const warnBeforeLeave = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warnBeforeLeave)
    return () => window.removeEventListener('beforeunload', warnBeforeLeave)
  }, [hasUnsavedChanges])

  /** 编辑已有纪要时以服务端回传的记录人为准；新建时就是当前登录人 */
  const recorderText = useMemo(() => {
    if (minutes?.exists && minutes.recorderName) {
      return `${minutes.recorderName}${minutes.recorderEmpNo ? `（${minutes.recorderEmpNo}）` : ''}`
    }
    return `${user?.name ?? ''}${user?.empId ? `（${user.empId}）` : ''}`
  }, [minutes, user])

  const load = useCallback(async () => {
    const t = i18n.t.bind(i18n)
    if (!bookingId && !minutesId) {
      setError(t('meeting.minutes.missingMeetingId', { defaultValue: '缺少會議編號，請從會議列表或詳情頁進入' }))
      return
    }
    setLoading(true)
    setError(undefined)
    setMinutesLoadNote(undefined)
    try {
      // 纪要与会议单分开取：失败保留对应错误，界面据此禁用编辑与保存，不把失败冒充尚无纪要
      // 编辑态只有纪要 id，会议单要等回包拿到 bookingId 再取；传 NaN 会打出一条
      // /api/meeting/bookings/NaN 的 400，并在打开页面时连弹两次“請求參數格式錯誤”
      const meetingPromise: Promise<MeetingVO | null> = minutesId
        ? Promise.resolve(null)
        : fetchMeetingDetail(bookingId!)
      const [minutesResult, meetingResult] = await Promise.allSettled([
        minutesId ? fetchMinutesById(minutesId) : fetchMinutes(bookingId!),
        meetingPromise,
      ])
      if (meetingResult.status === 'fulfilled' && meetingResult.value) setMeeting(meetingResult.value)

      if (minutesResult.status === 'rejected') {
        const reason = minutesResult.reason instanceof Error ? minutesResult.reason.message : String(minutesResult.reason)
        setMinutes(undefined)
        setMinutesLoadNote(reason)
      } else {
        const vo = minutesResult.value
        setMinutes(vo)
        const base = emptyMinutesContent()
        const fullMeeting = meetingResult.status === 'fulfilled' && meetingResult.value
          ? meetingResult.value : await fetchMeetingDetail(vo.bookingId)
        setMeeting(fullMeeting)
        if (vo?.exists && !vo.content) {
          setMinutesLoadNote(t('meeting.minutes.noEditPermission'))
          return
        }
        const content = vo.content
        setAttendance(initialAttendance(fullMeeting, content))
        if (vo?.exists && content) {
          form.setFieldsValue({
            purpose: minutesPurposeText(content),
            chairIds: content.chairUserId ? [content.chairUserId] : [fullMeeting.organizerId],
            items: content.items?.length ? content.items.map(item => ({ ...item, topicKey: item.topicKey || crypto.randomUUID() })) : base.items,
            actions: content.schemaVersion !== 2 && (vo.items ?? []).filter(item => item.kind === 'ACTION').length
              ? (vo.items ?? []).filter(item => item.kind === 'ACTION').map(item => ({
                  itemId: item.id, topicKey: item.topicKey, deliverable: item.deliverable,
                  content: item.content,
                  ownerIds: item.ownerUserId ? [item.ownerUserId] : [],
                  dueDate: item.dueDate ? dayjs(item.dueDate) : null,
                }))
              : (content.actions ?? []).map(action => ({
                  itemId: action.itemId, topicKey: action.topicKey, deliverable: action.deliverable,
                  content: action.content,
                  ownerIds: action.ownerUserId ? [action.ownerUserId] : [],
                  dueDate: action.dueDate ? dayjs(action.dueDate) : null,
                })),
            followUps: content.schemaVersion === 2 ? content.openIssues.map(item => ({ ...item,
              ownerIds: item.ownerUserId ? [item.ownerUserId] : [], dueDate: item.dueDate ? dayjs(item.dueDate) : null,
            })) : (vo.items ?? []).filter(item => item.kind === 'FOLLOW').map(item => ({
              itemId: item.id, topicKey: item.topicKey, content: item.content,
              ownerIds: item.ownerUserId ? [item.ownerUserId] : [],
              dueDate: item.dueDate ? dayjs(item.dueDate) : null,
            })),
            nextMeetingAt: content.nextMeetingAt ? dayjs(content.nextMeetingAt) : null,
            nextMeetingNote: content.nextMeetingNote,
            remark: content.remark,
          })
          // 旧纪要已经写了下次会议 → 开关自动开，不能让用户以为这场会没安排
          setNextMeetingEnabled(Boolean(content.nextMeetingAt || content.nextMeetingNote?.trim()))
          // 附件回显用服务端按号回查的元数据（不是前端自报名字）；读不到的号不展示，保存时自然移除
          setAttachmentList(vo.attachments ?? [])
          setLinkIds((vo.links ?? []).map(link => link.minutesId))
          setLinkOptions(vo.links ?? [])
          const seeds: { id: number; name: string; empId?: string }[] = [
            { id: fullMeeting.organizerId, name: fullMeeting.organizerName, empId: fullMeeting.organizerEmpNo ?? undefined },
            ...(content.chairUserId ? [{ id: content.chairUserId, name: content.chairName || '', empId: content.chairEmpNo }] : []),
            ...content.openIssues.filter(item => item.ownerUserId).map(item => ({ id: item.ownerUserId!, name: item.ownerName || '', empId: item.ownerEmpNo })),
          ]
          for (const item of vo.items ?? []) {
            if (item.ownerUserId && item.ownerName) {
              seeds.push({ id: item.ownerUserId, name: item.ownerName, empId: item.ownerEmpNo || undefined })
            }
          }
          for (const action of content.actions ?? []) {
            if (action.ownerUserId && action.ownerName) {
              seeds.push({ id: action.ownerUserId, name: action.ownerName, empId: action.ownerEmpNo || undefined })
            }
          }
          setOwnerSeed(seeds.filter((person, index, all) => all.findIndex(other => other.id === person.id) === index))
        } else {
          form.setFieldsValue({ items: base.items, actions: [], followUps: [], chairIds: [fullMeeting.organizerId] })
          setNextMeetingEnabled(false)
          setAttachmentList([])
          setOwnerSeed([{ id: fullMeeting.organizerId, name: fullMeeting.organizerName, empId: fullMeeting.organizerEmpNo ?? undefined }])
        }
        setHasUnsavedChanges(false)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('meeting.failedToLoadThe2', { defaultValue: '會議詳情加載失敗' }))
    } finally {
      setLoading(false)
    }
  }, [bookingId, minutesId, form, i18n])

  useEffect(() => { void load() }, [load])

  /** 至少要有议题或行动项之一：空纪要发出去只会让收件人以为会议没结论 */
  const validateContent = (content: MinutesContent): string | undefined => {
    if (content.items.length === 0 && content.actions.length === 0) {
      return t('meeting.minutes.contentRequired', { defaultValue: '請至少填寫一項議題與結論或行動項' })
    }
    if (content.items.some(item => !item.topic)) {
      return t('meeting.minutes.topicRequired', { defaultValue: '每條議題都需要填寫標題' })
    }
    const length = minutesContentLength(content)
    if (length > MINUTES_CONTENT_MAX_LENGTH) {
      return t('meeting.minutes.tooLong', {
        count: length, max: MINUTES_CONTENT_MAX_LENGTH,
        defaultValue: '正文 {{count}} 字，已超過 {{max}} 字上限',
      })
    }
    return undefined
  }

  /** 保存：send=true 时保存成功后直接打开发送面板（一次点击只做一件事，但动线不断） */
  const handleSave = async (send: boolean) => {
    // 附件未传完/有失败时拦住保存：不能静默丢附件后提示"保存成功"，也不能把失败项当没发生
    if (attachmentPending.uploading > 0) {
      message.warning(t('meeting.minutes.attachmentUploadingBlock'))
      return
    }
    if (attachmentPending.failed > 0) {
      message.warning(t('meeting.minutes.attachmentFailedBlock'))
      return
    }
    try {
      await form.validateFields()
    } catch {
      message.warning(t('meeting.minutes.checkForm', { defaultValue: '請檢查表單填寫' }))
      return
    }
    /** 全文预览需要保留已卸载字段的草稿值，所以取数用 getFieldsValue(true)；
     *  但「下次会议」开关关掉等于这场会不安排下次会议，必须显式清空，
     *  否则隐藏控件里的旧值会被一起提交，开关就成了纯粹的视觉摆设。 */
    const values = form.getFieldsValue(true)
    if (!nextMeetingEnabled) {
      values.nextMeetingAt = null
      values.nextMeetingNote = ''
    }
    // 附件号列表永远随正文一起提交（含空数组）：服务端据此完成绑定/解绑，旧字段语义不丢
    const content = { ...toContent(values), attendance, attachments: attachmentList.map(item => item.attachmentNo) }
    const invalid = validateContent(content)
    if (invalid) {
      message.warning(invalid)
      return
    }
    if (minutes?.minutesEnabled === false) {
      message.warning(t('meeting.minutes.featureOff', { defaultValue: '會議紀要功能尚未啟用，請聯繫管理員開啟' }))
      return
    }

    if (saving || !minutes || minutes.canEdit === false || error || minutesLoadNote) return
    const changeNote = form.getFieldValue('changeNote')?.trim()
    // 只提供即时反馈，发布完整性与资源权限仍由后端重新校验。
    if (send && (!content.purpose || !content.chairUserId || content.items.some(item => !item.decisionStatus
      || (item.decisionStatus !== 'information' && !item.conclusion)
      || (item.decisionStatus === 'information' && !item.discussion && !item.conclusion))
      || [...content.actions, ...content.openIssues].some(item => !item.ownerUserId || !item.dueDate)
      || (!!minutes.publishedRevisionId && !changeNote))) {
      message.warning(t('meeting.minutes.publicationRequired', { defaultValue: '發布前請補齊會議目的、主持人、決議狀態與內容、事項負責人及期限；修訂版需填寫修訂說明。' }))
      return
    }
    setSaving(true)
    try {
      const saved = minutes?.exists && minutes.id
        ? await updateMinutes(minutes.id, { content, linkedMinutesIds: linkIds, version: minutes.version ?? 0 })
        : await createMinutes({ bookingId, content, linkedMinutesIds: linkIds, requestKey: saveRequestKey.current })
      setMinutes(saved)
      setHasUnsavedChanges(false)
      message.success(t('meeting.minutes.saveSuccess', { defaultValue: '紀要已保存' }))
      if (send && saved.id) {
        const signature = JSON.stringify([saved.id, saved.version, changeNote])
        if (publishRequest.current?.signature !== signature) publishRequest.current = { signature, key: newMeetingRequestKey('mmp') }
        const key = publishRequest.current.key
        Modal.confirm({
          title: t('meeting.minutes.confirmPublication', { defaultValue: '確認發布正式紀要？' }),
          className: 'custom-confirm-modal',
          icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
          content: <div className="confirm-info-card">{saved.minutesNo} · V{(saved.publishedRevisionNo ?? 0) + 1}<p>{t('meeting.minutes.publicationImmutable', { defaultValue: '發布後保留不可覆蓋的版本；通知另行設定，本次不會發送訊息。' })}</p></div>,
          okText: t('meeting.minutes.publish', { defaultValue: '正式發布' }), cancelText: t('common.cancel'),
          onOk: async () => {
            await publishMinutes(saved.id!, { version: saved.version ?? 0, requestKey: key, changeNote })
            message.success(t('meeting.minutes.published', { defaultValue: '紀要已發布，可另行通知收件人' }))
            finishEditing(saved.id!)
          },
        })
      } else if (saved.id) {
        // 保存后进纪要查看页而不是会议详情：那一页才是「正文 + 发送历史」的归属地，
        // 阅读页继续优先显示正式版，未发布修改不会覆盖已发布内容。
        finishEditing(saved.id)
      } else {
        back()
      }
    } catch (e) {
      // request.ts 已统一弹错，这里只留日志，避免双弹
      console.warn(t('meeting.minutes.saveFailed', { defaultValue: '紀要保存失敗' }), e instanceof Error ? e.message : e)
    } finally {
      setSaving(false)
    }
  }

  const status = minutes?.status ? minutesStatusMeta()[minutes.status] : undefined
  const series = minutes?.series ?? []
  /** 系列导航的上一场/下一场：按 seriesSeq 排序后取当前位的前后一项 */
  const currentIndex = series.findIndex(node => node.current)
  const previousNode = currentIndex > 0 ? series[currentIndex - 1] : undefined
  const nextNode = currentIndex >= 0 && currentIndex < series.length - 1 ? series[currentIndex + 1] : undefined
  /** 表单扁平值 → MinutesContent 的空壳（仅用于 useWatch 尚未回传时的计数基准） */
  const previewContent = { ...toContent(watchedValues ?? {}), attendance, attachments: attachmentList.map(item => item.attachmentNo) }
  const charCount = minutesContentLength(previewContent)

  if (loading && !meeting) {
    return (
      <div className="content-area" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" tip={t('meeting.minutes.loading', { defaultValue: '載入會議紀要...' })} />
      </div>
    )
  }

  return (
    <div className="content-area">
      {/* 页面头部（§C.2：橙渐变条 + 返回 + 标题） */}
      <div style={{ position: 'relative', background: '#fff', marginBottom: 16, borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
        <div style={{
          height: 3,
          background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
          backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite',
        }} />
        <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Button
              type="primary"
              icon={<ArrowLeftOutlined />}
              onClick={() => navigateSafely()}
              style={{
                backgroundColor: '#E8720C', borderColor: '#E8720C', borderRadius: 8, height: 36, padding: '0 16px',
                display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            >{t('meeting.back', { defaultValue: '返回' })}</Button>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>
              {minutes?.exists ? t('meeting.minutes.editTitle', { defaultValue: '編輯會議紀要' }) : t('meeting.minutes.newTitle', { defaultValue: '錄入會議紀要' })}
            </h2>
            {minutes?.minutesNo && <Tag>{minutes.minutesNo}</Tag>}
            {status && <Tag color={status.color}>{status.label}</Tag>}
          </div>
          <Space size={8}>
            <span className="mm-char-counter">{t('meeting.minutes.charCount', { count: charCount, defaultValue: '已寫 {{count}} 字' })}</span>
            {minutes?.sendCount ? (
              <Button size="small" onClick={() => navigateSafely(`/meeting-minutes?id=${minutes.id}`)}>
                {t('meeting.minutes.viewSends', { count: minutes.sendCount, defaultValue: '發送歷史（{{count}} 次）' })}
              </Button>
            ) : null}
          </Space>
        </div>
      </div>

      {error && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message={t('meeting.unableToLoadThe', { defaultValue: '無法載入會議詳情' })}
          description={error}
          action={<Button size="small" onClick={() => void load()}>{t('meeting.retry', { defaultValue: '重試' })}</Button>}
        />
      )}
      {!error && minutesLoadNote && (
        // 读取失败保留表单结构和重试入口，但不能按新建放行保存
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message={t('meeting.minutes.publicationText.couldNotLoadExistingMinutesRetryBefore')}
          action={<Button size="small" onClick={() => void load()}>{t('meeting.retry', { defaultValue: '重試' })}</Button>}
          description={minutesLoadNote}
        />
      )}
      {meeting && meeting.status === 'cancelled' && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={t('meeting.minutes.publicationText.thisMeetingWasCancelledEditingDependsOn')}
        />
      )}

      {/* 系列纪要连续查看：同一周期系列的各场纪要横向时间轴，满足"开了多场要连着看" */}
      {series.length > 1 && (
        <div className="mm-series-bar">
          <span className="mm-series-label">{t('meeting.minutes.seriesLabel', { defaultValue: '系列紀要' })}</span>
          {series.map(node => (
            <SeriesChip
              key={node.bookingId}
              node={node}
              onOpen={(target) => navigateSafely(`/meeting-minutes-form?bookingId=${target}`)}
            />
          ))}
          {/* 上一場/下一場：chip 适合跳指定一场，连续写纪要时靠这两个按钮而不是用眼睛找当前位置 */}
          <span className="mm-series-nav">
            <Button
              size="small"
              disabled={!previousNode}
              icon={<LeftOutlined />}
              onClick={() => previousNode && navigateSafely(`/meeting-minutes-form?bookingId=${previousNode.bookingId}`)}
            >{t('meeting.minutes.prevSession', { defaultValue: '上一場' })}</Button>
            <Button
              size="small"
              disabled={!nextNode}
              onClick={() => nextNode && navigateSafely(`/meeting-minutes-form?bookingId=${nextNode.bookingId}`)}
            >{t('meeting.minutes.nextSession', { defaultValue: '下一場' })}<RightOutlined /></Button>
          </span>
        </div>
      )}

      <div className="mm-form-mode" ref={modeRef}>
        <Segmented value={displayMode} onChange={value => setDisplayMode(String(value))} options={[
          { value: 'edit', label: t('meeting.minutes.publicationText.editMinutes') }, { value: 'preview', label: t('meeting.minutes.publicationText.fullPreview') },
        ]} />
        <span className="mm-form-mode__hint">{hasUnsavedChanges ? t('meeting.minutes.unsaved', { defaultValue: '有未保存的修改 · ' }) : ''}{t('meeting.minutes.draftIsolated', { defaultValue: '保存只更新草稿，正式發布後才更新跟進事項' })}</span>
      </div>

      {displayMode === 'preview' && (
        <div className="mm-reading-surface">
          <MinutesContentCard content={previewContent} people={ownerSeed} attachments={attachmentList} resolveAttachmentUrl={resolveAttachmentUrl}
            followUpDetails={(watchedValues?.followUps ?? []).filter(item => item.content?.trim()).map(item => ({
              content: item.content || '', ownerUserId: item.ownerIds?.[0], dueDate: item.dueDate?.format('YYYY-MM-DD'),
            }))}
            document={{
              title: meeting?.title,
              minutesNo: minutes?.minutesNo,
              bookingNo: meeting?.bookingNo,
              editionLabel: t('meeting.minutes.publicationText.draftPreviewUnpublished'),
              meetingTime: meeting?.timeText,
              chair: ownerSeed.find(person => person.id === watchedValues?.chairIds?.[0])?.name,
              meetingType: meeting ? (bizTypeLabels()[meeting.bizType] ?? meeting.bizType) : undefined,
              organizer: meeting?.organizerName,
              recorder: recorderText,
              room: meeting?.roomName,
              attendees: meeting?.attendees,
              externalAttendees: meeting?.externalAttendees,
              footer: <><span>{t('meeting.minutes.recorderColumn')} {recorderText || t('meeting.minutes.notRecorded')}</span><span>{t('meeting.minutes.publicationText.previewDoesNotSaveOrSendMinutes')}</span></>,
            }}
            references={linkIds.length > 0 ? <div>{linkOptions.filter(link => linkIds.includes(link.minutesId)).map(link => <p key={link.minutesId}>{t('meeting.minutes.quotedFrom')}{link.title} · {link.minutesNo} · {link.timeText}</p>)}</div> : undefined}
          />
        </div>
      )}

      <div hidden={displayMode !== 'edit'}>
      <Form form={form} layout="vertical" className="mm-editor-form" disabled={minutes?.canEdit === false || !!minutesLoadNote || !!error || loading}
        onValuesChange={() => setHasUnsavedChanges(true)}>
        {/* 一、会议资讯（自动带出，只读） */}
        <div style={cardStyle}>
          <CardTitle icon={<ProfileOutlined />} tone="info" title={t('meeting.minutes.sectionMeeting', { defaultValue: '會議資訊' })}
            note={t('meeting.minutes.meetingReadonlyHint', { defaultValue: '由會議單自動帶出，不可修改' })} />
          <div className="mm-form-grid">
            <InfoField label={t('meeting.labelTopic', { defaultValue: '會議主題：' })} value={meeting?.title ?? '-'} />
            <InfoField label={t('meeting.bookingNo2', { defaultValue: '單號：' })} value={meeting?.bookingNo ?? '-'} />
            <InfoField label={t('meeting.minutes.recorder', { defaultValue: '記錄人：' })} value={recorderText} tag={t('meeting.minutes.recorderLocked', { defaultValue: '自動取當前登錄人' })} />
            <InfoField label={t('meeting.meetingTime', { defaultValue: '會議時間' })} value={meeting?.timeText ?? '-'} />
            <InfoField label={t('meeting.meetingRoom', { defaultValue: '會議室' })} value={meeting ? `${meeting.roomName}${meeting.roomLocation ? ` · ${meeting.roomLocation}` : ''}` : '-'} />
            <InfoField
              label={t('meeting.organizer', { defaultValue: '組織者' })}
              value={meeting ? `${meeting.organizerName}${meeting.organizerEmpNo ? `（${meeting.organizerEmpNo}）` : ''}` : '-'}
            />
            <InfoField label={t('meeting.attendeeCount', { defaultValue: '參會人數' })} value={meeting ? `${meeting.attendeeCount} ${t('meeting.personUnit', { defaultValue: '人' })}` : '-'} />
            <InfoField label={t('meeting.meetingType', { defaultValue: '會議類型' })} value={meeting ? (bizTypeLabels()[meeting.bizType] ?? meeting.bizType) : '-'} />
            <InfoField label={t('meeting.status', { defaultValue: '狀態' })} value={meeting ? phaseMeta(meeting.phase).label : '-'} />
          </div>
          {meeting?.externalAttendees && <div className="mm-attendance-hint">
            <span>{t('meeting.externalAttendees', { defaultValue: '外部參會人' })}：{meeting.externalAttendees}</span>
          </div>}
          <div className="mm-form-grid" style={{ marginTop: 16 }}>
            <Form.Item name="chairIds" label={<PreviewFieldLabel title={t('meeting.minutes.chair')} />}>
              <EmployeeSelect single style={{ width: '100%' }} seed={ownerSeed}
                onPick={picked => setOwnerSeed(previous => [...previous, ...picked.filter(person => !previous.some(known => known.id === person.id))])}
                placeholder={t('meeting.minutes.ownerPlaceholder')} />
            </Form.Item>
          </div>
          <AttendanceEditor value={attendance} invited={meeting?.attendees ?? []}
            onChange={value => { setAttendance(value); setHasUnsavedChanges(true) }}
            disabled={minutes?.canEdit === false || !!minutesLoadNote || !!error || loading} />
          {/* 关联其他会议纪要：只选 id，标题与时间由服务端回查快照，收件人才知道“引自哪场会” */}
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 13, color: '#595959', marginBottom: 6 }}>
              {t('meeting.minutes.linkedMinutes', { defaultValue: '關聯其它會議紀要（詳情頁會標注引自哪場會）' })}
            </div>
            <Select
              mode="multiple"
              allowClear
              showSearch
              filterOption={false}
              disabled={minutes?.canEdit === false || !!minutesLoadNote || !!error || loading}
              value={linkIds}
              onChange={value => { setLinkIds(value); setHasUnsavedChanges(true) }}
              style={{ width: '100%' }}
              placeholder={t('meeting.minutes.linkedMinutesPlaceholder', { defaultValue: '輸入紀要單號、會議單號或主題搜尋' })}
              onSearch={(keyword) => {
                if (!keyword.trim()) return
                void searchMinutes(keyword, minutes?.id).then(found => {
                  setLinkOptions(previous => [...previous, ...found]
                    .filter((link, index, all) => all.findIndex(other => other.minutesId === link.minutesId) === index))
                })
              }}
              options={linkOptions.map(link => ({
                value: link.minutesId,
                label: `${link.minutesNo ?? ''} ｜ ${link.title ?? ''}（${link.timeText ?? ''}）`,
              }))}
            />
          </div>
        </div>

        <div style={cardStyle}>
          <CardTitle icon={<FileTextOutlined />} tone="info" title={t('meeting.minutes.purpose')} />
          <Form.Item name="purpose" style={{ marginBottom: 0 }} rules={[{ max: MINUTES_LIMITS.purpose }]}>
            <Input.TextArea rows={4} showCount maxLength={MINUTES_LIMITS.purpose} aria-label={t('meeting.minutes.purpose')}
              placeholder={t('meeting.minutes.publicationText.describeTheProblemAndExpectedOutcomeOptional')} />
          </Form.Item>
        </div>

        {/* 二、议程与结论 */}
        <div style={cardStyle}>
          <CardTitle icon={<UnorderedListOutlined />} tone="purple" title={t('meeting.minutes.sectionAgenda', { defaultValue: '議程與結論' })}
            tag={<Tag color="orange" style={{ fontSize: 11 }}>{t('meeting.minutes.requiredTag', { defaultValue: '必填' })}</Tag>}
            note={t('meeting.minutes.agendaHint', { defaultValue: '一個議題一行，結論寫明確' })} />
          <Form.List name="items">
            {(fields, { add, remove }) => (
              <>
                {fields.map((field, index) => (
                  <div className="mm-dyn-row" key={field.key}>
                    <div className="mm-dyn-head">
                      <span className="mm-dyn-index">{index + 1}</span>
                      <Form.Item name={[field.name, 'topic']} noStyle rules={[{ max: 100, message: t('meeting.minutes.topicTooLong', { defaultValue: '議題不超過 100 字' }) }]}>
                        <Input placeholder={t('meeting.minutes.topicPlaceholder', { defaultValue: '議題，例：Q4 預算分攤口徑' })} maxLength={100} />
                      </Form.Item>
                      {fields.length > 1 && (
                        <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => remove(field.name)} aria-label={t('meeting.minutes.deleteTopic', { defaultValue: '刪除議題' })} />
                      )}
                    </div>
                    <div className="mm-dyn-body">
                      <Form.Item name={[field.name, 'topicKey']} hidden><Input /></Form.Item>
                      <Form.Item name={[field.name, 'decisionStatus']} label={<PreviewFieldLabel title={t('meeting.minutes.publicationText.decisionStatus')} />}>
                        <Select allowClear placeholder={t('meeting.minutes.publicationText.selectDecisionStatus')} options={[
                          { value: 'decided', label: t('meeting.minutes.publicationText.decisionMade') }, { value: 'pending', label: t('meeting.minutes.publicationText.decisionPending') }, { value: 'information', label: t('meeting.minutes.publicationText.informationOnly') },
                        ]} />
                      </Form.Item>
                      <Form.Item label={t('meeting.minutes.discussion', { defaultValue: '討論要點' })} name={[field.name, 'discussion']}>
                        <Input.TextArea rows={5} autoSize={{ minRows: 5, maxRows: 14 }} maxLength={500} showCount placeholder={t('meeting.minutes.discussionPlaceholder', { defaultValue: '各方意見與數據' })} />
                      </Form.Item>
                      <Form.Item label={t('meeting.minutes.conclusion', { defaultValue: '結論 / 決議' })} name={[field.name, 'conclusion']} style={{ marginBottom: 0 }}>
                        <Input.TextArea rows={5} autoSize={{ minRows: 5, maxRows: 14 }} maxLength={500} showCount placeholder={t('meeting.minutes.conclusionPlaceholder', { defaultValue: '定了什麼、誰負責、什么时候生效' })} />
                      </Form.Item>
                    </div>
                  </div>
                ))}
                <Button type="dashed" block icon={<PlusOutlined />} disabled={fields.length >= 20} onClick={() => add({ topicKey: crypto.randomUUID(), topic: '', discussion: '', conclusion: '' })}>
                  {t('meeting.minutes.addTopic', { defaultValue: '新增議題' })}
                </Button>
              </>
            )}
          </Form.List>
        </div>

        {/* 三、行动项 */}
        <div style={cardStyle}>
          <CardTitle icon={<CheckCircleOutlined />} tone="success" title={t('meeting.minutes.sectionActions', { defaultValue: '行動項' })}
            note={t('meeting.minutes.actionsHintV2', { defaultValue: '填寫負責人與完成時限後，負責人可直接在紀要頁回填處理結果；逾期會自動提醒' })} />
          <Form.List name="actions">
            {(fields, { add, remove }) => (
              <>
                {fields.map((field, index) => (
                  <div className="mm-dyn-row" key={field.key}>
                    <div className="mm-dyn-head">
                      <span className="mm-dyn-index">A{index + 1}</span>
                      <Form.Item name={[field.name, 'content']} noStyle rules={[{ max: 300, message: t('meeting.minutes.actionTooLong', { defaultValue: '行動項不超過 300 字' }) }]}>
                        <Input.TextArea rows={3} autoSize={{ minRows: 3, maxRows: 10 }} placeholder={t('meeting.minutes.actionPlaceholder', { defaultValue: '要做的事，例：輸出預算明細表' })} maxLength={300} />
                      </Form.Item>
                      <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => remove(field.name)} aria-label={t('meeting.minutes.deleteAction', { defaultValue: '刪除行動項' })} />
                    </div>
                    <div className="mm-dyn-body">
                      <Form.Item name={[field.name, 'itemId']} hidden><Input /></Form.Item>
                      {/* 负责人只存 sys_user.id：姓名/工号是服务端回查的快照，前端不自报 */}
                      <div className="mm-form-grid">
                        <Form.Item label={t('meeting.minutes.owner', { defaultValue: '負責人' })} name={[field.name, 'ownerIds']} style={{ marginBottom: 0 }}>
                          <EmployeeSelect single seed={ownerSeed} style={{ width: '100%' }} placeholder={t('meeting.minutes.ownerPlaceholder', { defaultValue: '搜尋姓名或工號' })}
                            onPick={picked => setOwnerSeed(previous => [...previous, ...picked.filter(person => !previous.some(known => known.id === person.id))])} />
                        </Form.Item>
                        <Form.Item label={t('meeting.minutes.dueDate', { defaultValue: '完成時限' })} name={[field.name, 'dueDate']} style={{ marginBottom: 0 }}>
                          <DatePicker style={{ width: '100%' }} placeholder={t('meeting.minutes.dueDatePlaceholder', { defaultValue: '選填' })} />
                        </Form.Item>
                        <Form.Item name={[field.name, 'topicKey']} label={<PreviewFieldLabel title={t('meeting.minutes.publicationText.relatedTopic')} />} style={{ marginBottom: 0 }}>
                          <Select allowClear placeholder={t('meeting.minutes.publicationText.selectTheRelatedTopic')} options={(watchedValues?.items ?? []).filter(item => item.topicKey).map(item => ({ value: item.topicKey, label: item.topic }))} />
                        </Form.Item>
                      </div>
                      <Form.Item name={[field.name, 'deliverable']} label={<PreviewFieldLabel title={t('meeting.minutes.publicationText.deliverableAcceptanceCriteria')} />} style={{ marginTop: 16, marginBottom: 0 }}>
                        <Input.TextArea rows={3} showCount maxLength={300} placeholder={t('meeting.minutes.publicationText.describeTheDeliverableAndAcceptanceCriteriaEg')} />
                      </Form.Item>
                    </div>
                  </div>
                ))}
                <Button type="dashed" block icon={<PlusOutlined />} disabled={fields.length >= 30} onClick={() => add({ content: '', ownerIds: [], dueDate: null })}>
                  {t('meeting.minutes.addAction', { defaultValue: '新增行動項' })}
                </Button>
              </>
            )}
          </Form.List>
        </div>

        {/* 四、跟进事项（原「未決事項」）：必须能被负责人跟踪，否则写进纪要也没人管 */}
        <div style={cardStyle}>
          <CardTitle icon={<FileTextOutlined />} tone="warn" title={t('meeting.minutes.sectionFollowUps', { defaultValue: '跟進事項' })}
            note={t('meeting.minutes.followUpsHint', { defaultValue: '需後續解決的事項：選跟進人與完成時限，逾期會提醒跟進人' })} />
          <Form.List name="followUps">
            {(fields, { add, remove }) => (
              <>
                {fields.map((field, index) => (
                  <div className="mm-dyn-row" key={field.key}>
                    <div className="mm-dyn-head">
                      <span className="mm-dyn-index">F{index + 1}</span>
                      <Form.Item name={[field.name, 'content']} noStyle rules={[{ max: 300, message: t('meeting.minutes.actionTooLong', { defaultValue: '事項不超過 300 字' }) }]}>
                        <Input.TextArea rows={3} autoSize={{ minRows: 3, maxRows: 10 }} placeholder={t('meeting.minutes.followUpPlaceholder', { defaultValue: '待跟進的事項，例：確認 Q4 預算分攤口徑' })} maxLength={300} />
                      </Form.Item>
                      <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => remove(field.name)} aria-label={t('meeting.minutes.deleteIssue', { defaultValue: '刪除跟進事項' })} />
                    </div>
                    <div className="mm-dyn-body">
                      <div className="mm-form-grid">
                        <Form.Item name={[field.name, 'itemId']} hidden><Input /></Form.Item>
                        <Form.Item name={[field.name, 'topicKey']} hidden><Input /></Form.Item>
                        <Form.Item label={t('meeting.minutes.followOwner', { defaultValue: '跟進人' })} name={[field.name, 'ownerIds']} style={{ marginBottom: 0 }}>
                          <EmployeeSelect single seed={ownerSeed} style={{ width: '100%' }} placeholder={t('meeting.minutes.ownerPlaceholder', { defaultValue: '搜尋姓名或工號' })}
                            onPick={picked => setOwnerSeed(previous => [...previous, ...picked.filter(person => !previous.some(known => known.id === person.id))])} />
                        </Form.Item>
                        <Form.Item label={t('meeting.minutes.dueDate', { defaultValue: '完成時限' })} name={[field.name, 'dueDate']} style={{ marginBottom: 0 }}>
                          <DatePicker style={{ width: '100%' }} placeholder={t('meeting.minutes.dueDatePlaceholder', { defaultValue: '選填，逾期會提醒' })} />
                        </Form.Item>
                      </div>
                    </div>
                  </div>
                ))}
                <Button type="dashed" block icon={<PlusOutlined />} disabled={fields.length >= 20} onClick={() => add({ content: '', ownerIds: [], dueDate: null })}>
                  {t('meeting.minutes.addFollowUp', { defaultValue: '新增跟進事項' })}
                </Button>
              </>
            )}
          </Form.List>
        </div>

        {/* 五、下次会议 */}
        <div style={cardStyle}>
          <CardTitle icon={<CalendarOutlined />} tone="info" title={t('meeting.minutes.sectionNext', { defaultValue: '下次會議' })}
            tag={<Switch
              checked={nextMeetingEnabled}
              disabled={saving || minutes?.canEdit === false}
              aria-label={t('meeting.minutes.sectionNext', { defaultValue: '下次會議' })}
              checkedChildren={t('common.enable')}
              unCheckedChildren={t('common.close')}
              onChange={setNextMeetingEnabled}
            />} />
          {/* 卸载字段后 getFieldsValue 不会提交隐藏值；Form 保留草稿，重新开启可恢复本次输入。 */}
          {nextMeetingEnabled && (
            <div className="mm-form-grid">
              <Form.Item label={t('meeting.minutes.nextMeetingAt', { defaultValue: '下次會議時間' })} name="nextMeetingAt">
                <DatePicker showTime={{ format: 'HH:mm' }} format="YYYY-MM-DD HH:mm" style={{ width: '100%' }} placeholder={t('meeting.minutes.selectTime', { defaultValue: '選填' })} />
              </Form.Item>
              <Form.Item label={t('meeting.minutes.nextMeetingNote', { defaultValue: '議程預告' })} name="nextMeetingNote" style={{ gridColumn: '1 / -1' }}>
                <Input maxLength={200} placeholder={t('meeting.minutes.nextNotePlaceholder', { defaultValue: '例：帶預算明細表復核' })} />
              </Form.Item>
            </div>
          )}
        </div>

        {/* 六、补充说明（备注独占整行，见 §C.4.1） */}
        <div style={cardStyle}>
          <CardTitle icon={<FileTextOutlined />} tone="info" title={t('meeting.minutes.sectionRemark', { defaultValue: '補充說明' })} />
          <Form.Item label={t('meeting.minutes.remarkLabel', { defaultValue: '備註' })} name="remark" style={{ marginBottom: 0 }}>
            <RemarkTextArea placeholder={t('meeting.minutes.remarkPlaceholder', { defaultValue: '與會外的補充資訊，例：資料位置、後續對接群' })} />
          </Form.Item>
          <div style={{ marginTop: 24 }}>
            <div style={{ fontSize: 13, color: '#595959', marginBottom: 8 }}>{t('docKnowledge.attachments')}</div>
            <MinutesAttachmentEditor
              bookingId={meeting?.id ?? minutes?.bookingId}
              value={attachmentList}
              onChange={next => { setAttachmentList(next); setHasUnsavedChanges(true) }}
              onPendingChange={setAttachmentPending}
              disabled={loading || saving || minutes?.canEdit === false}
            />
          </div>
        </div>
        <div style={cardStyle}>
          <CardTitle icon={<SendOutlined />} tone="info" title={t('meeting.minutes.publicationText.publicationAndNotificationSettings')} />
          <div className="mm-form-publish">
            <div className="mm-form-publish__fields">
              <p className="mm-form-section-note">{t('meeting.minutes.publicationImmutable', { defaultValue: '發布後保留不可覆蓋的版本；通知另行設定，本次不會發送訊息。' })}</p>
              <div className="mm-form-grid mm-form-grid--two">
                <Form.Item label={<PreviewFieldLabel title={t('meeting.minutes.publicationText.publishedVersion')} />}><Input disabled value={`V${(minutes?.publishedRevisionNo ?? 0) + 1}`} /></Form.Item>
                <Form.Item label={<PreviewFieldLabel title={t('meeting.minutes.publisher')} />}><Input disabled value={user?.name} /></Form.Item>
              </div>
              <Form.Item name="changeNote" label={<PreviewFieldLabel title={t('meeting.minutes.changeNote')} />}><RemarkTextArea placeholder={t('meeting.minutes.publicationText.requiredForRevisionsDescribeChangesToDecisions')} /></Form.Item>
              <p className="mm-form-section-note">{t('meeting.minutes.publicationText.publicLinksCanBeForwardedAnyoneHolding')}</p>
            </div>
            <div className="mm-form-publish__preview">
              <MinutesNoticePreview title={meeting?.title} timeText={meeting?.timeText} minutesNo={minutes?.minutesNo}
                topicCount={(watchedValues?.items ?? []).filter(item => item.topic?.trim()).length}
                actionCount={(watchedValues?.actions ?? []).filter(item => item.content?.trim()).length}
                followCount={(watchedValues?.followUps ?? []).filter(item => item.content?.trim()).length}
                onView={showDocumentPreview} />
            </div>
          </div>
        </div>
      </Form>
      </div>

      {/* 底部操作（§C.5）：详情只读模式隐藏 */}
      {minutes?.canEdit !== false && !minutesLoadNote && !error && !loading && (
        <div className="form-footer">
          <Button onClick={() => navigateSafely()}>{t('meeting.cancel', { defaultValue: '取消' })}</Button>
          <Button onClick={() => displayMode === 'preview' ? setDisplayMode('edit') : showDocumentPreview()}>{displayMode === 'preview' ? t('meeting.minutes.publicationText.backToEditing') : t('meeting.minutes.publicationText.fullPreview')}</Button>
          {/* 附件上传中/有失败时禁用保存与发布：比"点了再弹一次错"少一次失败往返。 */}
          <Button type="primary" icon={<SaveOutlined />} loading={saving} disabled={attachmentPending.uploading > 0 || attachmentPending.failed > 0} onClick={() => void handleSave(false)}>
            {t('meeting.minutes.saveDraft', { defaultValue: '保存紀要' })}
          </Button>
          <Button icon={<SendOutlined />} disabled={minutes?.publicationEnabled === false || attachmentPending.uploading > 0 || attachmentPending.failed > 0} loading={saving} onClick={() => void handleSave(true)}>
            {t('meeting.minutes.saveAndPublish', { defaultValue: '保存並發布' })}
          </Button>
        </div>
      )}
      {minutes?.canEdit === false && (
        <Alert
          type="warning"
          showIcon
          message={minutes.editLockReason === 'MEETING_NOT_RECORDED'
            // 已取消/未开始的会开不了页时，说“没权限”会把用户带去敲错的门：他要做的是等会开完，不是找管理员
            ? t('meeting.minutes.lockNotYet', { defaultValue: '這場會議尚未開始或已取消/釋放，目前不需要錄入紀要' })
            : t('meeting.minutes.noEditPermission', { defaultValue: '只有記錄人、會議組織者或行政可以編輯本紀要，當前為只讀' })}
        />
      )}


    </div>
  )
}

/** 预览字段不参与 Form 保存，统一标记未接入，避免用户误以为填写内容会落库。 */
function PreviewFieldLabel({ title }: { title: string }) {
  return <span className="mm-form-preview-label">{title}</span>
}

/** 只读行内字段（会议资讯模块）：标签在左、值在右，与全站详情页口径一致 */
function InfoField({ label, value, tag }: { label: string; value: string; tag?: string }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 4 }}>{label}</div>
      <div className="mm-readonly-value">
        {value}
        {tag && <span style={{ marginLeft: 6, fontSize: 11, color: '#8C8C8C' }}>({tag})</span>}
      </div>
    </div>
  )
}

/** 出席确认采用限高表格式编辑，邀约人员不可移除，避免名单在反复编辑时丢失。 */
function AttendanceEditor({ value, invited, onChange, disabled }: {
  value: MinutesAttendance[]
  invited: NonNullable<MeetingVO['attendees']>
  onChange: (next: MinutesAttendance[]) => void
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const [adding, setAdding] = useState(false)
  const [pickerVersion, setPickerVersion] = useState(0)
  const invitedByKey = new Map(invited.map(person => [attendanceKey(person), person]))
  const presentCount = value.filter(person => person.status === 'present').length
  const temporaryCount = value.filter(person => !invitedByKey.has(attendanceKey(person))).length
  const atLimit = value.length >= MINUTES_LIMITS.attendance

  const handleStatusChange = (index: number, status: 'present' | 'absent') => {
    if (disabled) return
    onChange(value.map((person, i) => i === index
      ? { ...person, status, reason: status === 'present' ? undefined : person.reason } : person))
  }
  const handleAdd = (picked: { id: number; name: string }[]) => {
    const person = picked[0]
    if (disabled || atLimit || !person || value.some(item => item.userId === person.id)) return
    onChange([...value, { userId: person.id, name: person.name, status: 'present' }])
    // 添加后重置选择器，避免上一个选择仍占据输入框，方便连续追加临时人员。
    setPickerVersion(version => version + 1)
  }

  // 第一阶段先确认交互，新增繁中文案待界面确认后统一补齐 i18n。
  return (
    <section className="mm-attendance" aria-label={t('meeting.minutes.attendance')}>
      <div className="mm-attendance__toolbar">
        <div className="mm-attendance__heading">
          <span className="mm-attendance__icon"><CheckCircleOutlined /></span>
          <h3>{t('meeting.minutes.attendance', { defaultValue: '實際出席確認' })}</h3>
          <HelpPopover title={t('meeting.minutes.attendanceHelpTitle')} ariaLabel={t('meeting.minutes.attendanceHelpTitle')} placement="topLeft" content={[
            { tone: 'info', label: t('meeting.minutes.attendanceHelpAutoLabel'), body: t('meeting.minutes.attendanceHelpAutoBody') },
            { tone: 'neutral', label: t('meeting.minutes.attendanceHelpRecordLabel'), body: t('meeting.minutes.attendanceHelpRecordBody') },
            { tone: 'info', label: t('meeting.minutes.attendanceHelpTempLabel'), body: t('meeting.minutes.attendanceHelpTempBody') },
          ]} />
          <span className="mm-attendance__summary" aria-live="polite">
            {t('meeting.minutes.attendanceSummary', { present: presentCount, total: value.length, temporary: temporaryCount })}
          </span>
        </div>
        {!disabled && <Button icon={<PlusOutlined />} disabled={atLimit} onClick={() => setAdding(open => !open)}
          aria-label={t('meeting.minutes.addTemporaryAttendee')} aria-expanded={adding} aria-controls="minutes-attendance-add">
          {t('meeting.minutes.addTemporaryAttendee')}</Button>}
      </div>
      <p className="mm-attendance__hint">{t('meeting.minutes.attendanceHint')}</p>
      {adding && !disabled && <div className="mm-attendance__add" id="minutes-attendance-add">
        <span>{t('meeting.minutes.temporaryAttendee')}</span>
        <div className="mm-attendance__picker">
          <EmployeeSelect key={pickerVersion} single style={{ width: '100%' }} disabled={atLimit}
            placeholder={t('meeting.minutes.ownerPlaceholder')} value={[]}
            excludeIds={value.map(person => person.userId).filter((id): id is number => id != null)}
            onPick={handleAdd} />
        </div>
        <span className="mm-attendance__hint">{t('meeting.minutes.temporaryPickHint')}</span>
        <Button type="text" onClick={() => setAdding(false)}>{t('meeting.minutes.finishAdding')}</Button>
      </div>}
      <div className="mm-attendance__scroll" tabIndex={0} role="region" aria-label={t('meeting.minutes.attendanceListRegion')}>
        <table className="mm-attendance__table" aria-label={t('meeting.minutes.attendanceListTable')}>
          <colgroup>
            <col className="mm-attendance__person-col" /><col className="mm-attendance__status-col" />
            <col /><col className="mm-attendance__action-col" />
          </colgroup>
          <thead><tr>
            <th scope="col">{t('meeting.minutes.colAttendee')}</th><th scope="col">{t('meeting.minutes.colAttendanceStatus')}</th>
            <th scope="col">{t('meeting.minutes.colAbsentReason')}</th><th scope="col">{t('meeting.minutes.colAction')}</th>
          </tr></thead>
          <tbody>
            {value.map((person, index) => {
              const key = attendanceKey(person)
              const invitation = invitedByKey.get(key)
              const personLabel = `${person.name}${person.empNo ? `（${person.empNo}）` : ''}`
              return <tr key={key}>
                <th scope="row">
                  <span className="mm-attendance__name">{personLabel}</span>
                  <span className="mm-attendance__badges">
                    <Tag color={invitation ? 'blue' : 'orange'}>{invitation ? t('meeting.minutes.invited') : t('meeting.minutes.temporaryTag')}</Tag>
                    {invitation?.checkinAt && <Tag color="green">{t('meeting.checkedIn')}</Tag>}
                  </span>
                </th>
                <td>
                  <div role="radiogroup" aria-label={t('meeting.minutes.attendanceStatusAria', { name: personLabel })}>
                    <Radio.Group name={`attendance-${key}`} value={person.status} disabled={disabled} buttonStyle="solid"
                      onChange={event => handleStatusChange(index, event.target.value)}>
                      <Radio.Button value="present">{t('common.yes')}</Radio.Button>
                      <Radio.Button value="absent">{t('common.no')}</Radio.Button>
                    </Radio.Group>
                  </div>
                </td>
                <td>
                  {person.status === 'absent' ? <Input
                    maxLength={200} disabled={disabled} aria-label={t('meeting.minutes.absentReasonAria', { name: personLabel })}
                    placeholder={t('meeting.minutes.absentReasonPlaceholder', { defaultValue: '缺席原因，選填' })}
                    value={person.reason ?? ''}
                    onChange={event => onChange(value.map((item, i) => i === index ? { ...item, reason: event.target.value } : item))}
                  /> : <span className="mm-attendance__hint">{t('meeting.minutes.presentNoReason')}</span>}
                </td>
                <td>
                  {!invitation && !disabled ? <Button type="link" size="small" danger aria-label={t('meeting.minutes.removeAttendeeAria', { name: personLabel })}
                    onClick={() => onChange(value.filter((_, i) => i !== index))}>{t('common.remove')}</Button>
                    : <span className="mm-attendance__hint">—</span>}
                </td>
              </tr>
            })}
          </tbody>
        </table>
        {value.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('meeting.minutes.attendanceEmpty')} />}
      </div>
      {atLimit && <p className="mm-attendance__hint">{t('meeting.minutes.attendanceLimit', { count: MINUTES_LIMITS.attendance })}</p>}
    </section>
  )
}

/** 系列纪要条目：已录入的可点回那一场的纪要，未录入的只标状态（点了没有内容可看） */
function SeriesChip({ node, onOpen }: { node: MinutesSeriesNode; onOpen: (bookingId: number) => void }) {
  const { t } = useTranslation()
  const date = node.startTime ? dayjs(node.startTime).format('MM-DD') : '-'
  const clickable = node.hasMinutes || node.current
  const classNames = ['mm-series-chip', node.current ? 'mm-series-chip--current' : '',
    node.hasMinutes ? 'mm-series-chip--done' : 'mm-series-chip--todo'].filter(Boolean).join(' ')
  return (
    <span
      className={classNames}
      onClick={() => (clickable ? onOpen(node.bookingId) : undefined)}
      title={`${date} ${node.title}`}
    >
      {`${t('meeting.minutes.seriesSeq', { seq: node.seriesSeq, defaultValue: '第 {{seq}} 場' })} · ${date}`}
    </span>
  )
}
