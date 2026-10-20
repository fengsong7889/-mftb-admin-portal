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
 *      纪要接口尚未返回时按「本场会还没有纪要」渲染空表单，不回退假纪要；
 *   3. **已发送的纪要可以改，但改动不会追溯已发出的批次**：重发时后端生成新的批次与内容快照，
 *      收件人点开的永远是"发给我的那一版"，所以页面要显示发送历史而不是"改了就完事"。
 *
 * 界面遵循 form-page-style：橙渐变头 + 白色 div 模块卡片 + .form-footer 底部按钮。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Alert, Button, DatePicker, Form, Input, Select, Space, Spin, Tag, message } from 'antd'
import {
  ArrowLeftOutlined, CalendarOutlined, CheckCircleOutlined, DeleteOutlined, FileTextOutlined,
  LeftOutlined, PlusOutlined, ProfileOutlined, RightOutlined, SaveOutlined, SendOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import CardTitle from '../../../components/CardTitle'
import RemarkTextArea from '../../../components/RemarkTextArea'
import { useAuth } from '../../../contexts/AuthContext'
import {
  createMinutes, fetchMinutes, fetchMinutesById, searchMinutes, updateMinutes,
  MINUTES_CONTENT_MAX_LENGTH, emptyMinutesContent, minutesContentLength,
  type MinutesAbsentee, type MinutesContent, type MinutesLinkVO, type MinutesSeriesNode, type MinutesVO,
} from '../../../api/meetingMinutes'
import { fetchMeetingDetail, newMeetingRequestKey, toMeetingIsoDate, type MeetingAttendeeVO, type MeetingVO } from '../../../api/meeting'
import EmployeeSelect from '../EmployeeSelect'
import { bizTypeLabels, minutesStatusMeta, phaseMeta } from '../meetingMeta'
import SendMinutesModal from './SendMinutesModal'
import './minutes.css'

const cardStyle: CSSProperties = {
  border: '1px solid #e8eaed', borderRadius: 8, background: '#fff',
  padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
}

/** 表单内部的扁平结构：嵌套对象在 antd Form 里读写都别扭，提交前再收成 MinutesContent */
interface FormValues {
  items: { topic?: string; discussion?: string; conclusion?: string }[]
  actions: { content?: string; ownerIds?: number[]; dueDate?: Dayjs | null }[]
  followUps: { content?: string; ownerIds?: number[]; dueDate?: Dayjs | null }[]
  nextMeetingAt?: Dayjs | null
  nextMeetingNote?: string
  remark?: string
}

/**
 * 缺席建议值：已婉拒的人确定不来，未婉拒也没签到的人按"未签到缺席"提示。
 * 只作为初始值给记录人参考——开会迟到十分钟不该被系统写成缺席。
 *
 * <p>reason 存的是文案而不是枚举码：后端不解析这个字段，它就是要写进纪要正文给人看的，
 * 所以这里必须走 t() 取当时语言的原文，不能写死中文。
 */
function suggestAbsentees(meeting: MeetingVO, t: TFunction): MinutesAbsentee[] {
  const ended = meeting.phase === 'ended' || meeting.phase === 'finished' || meeting.phase === 'released'
  return (meeting.attendees ?? [])
    .filter((person: MeetingAttendeeVO) => person.attendeeType !== 'organizer'
      && (person.response === 'declined' || (ended && !person.checkinAt)))
    .map(person => ({
      userId: person.userId ?? null,
      name: person.name,
      empNo: person.empNo ?? undefined,
      reason: person.response === 'declined'
        ? t('meeting.minutes.reasonDeclined', { defaultValue: '婉拒邀約' })
        : (ended ? t('meeting.minutes.reasonNoCheckin', { defaultValue: '未簽到' }) : undefined),
    }))
}

/**
 * 表单扁平值 → MinutesContent：抽成纯函数，供提交与字数即时提示共用。
 * 直接写死在 handleSave 里的话，字数计数器只能靠 getFieldsValue 在渲染期取，
 * 而 getFieldsValue 不触发重渲染，计数器会停在旧值上。
 */
function toContent(values: Partial<FormValues>): MinutesContent {
  return {
    items: (values.items ?? [])
      .map(item => ({ topic: item.topic?.trim() ?? '', discussion: item.discussion?.trim() ?? '', conclusion: item.conclusion?.trim() ?? '' }))
      .filter(item => item.topic || item.discussion || item.conclusion),
    actions: (values.actions ?? [])
      .map(action => ({
        content: action.content?.trim() ?? '',
        // 只传负责人 id：姓名与工号快照由服务端按 id 回查，前端不传名字（与行政代订同一口径，防伪造台账）
        ownerUserId: action.ownerIds?.[0] ?? null,
        dueDate: toMeetingIsoDate(action.dueDate),
      }))
      .filter(action => action.content),
    openIssues: (values.followUps ?? [])
      .map(issue => ({ content: issue.content?.trim() ?? '' }))
      .filter(issue => issue.content),
    absentees: [],
    nextMeetingAt: values.nextMeetingAt ? values.nextMeetingAt.format('YYYY-MM-DD HH:mm') : null,
    nextMeetingNote: values.nextMeetingNote?.trim() ?? '',
    remark: values.remark?.trim() ?? '',
  }
}

/** 缺席名单由组件外的 state 承载（人选集合，不是文本字段），提交时并入正文 */
function withAbsentees(content: MinutesContent, absentees: MinutesAbsentee[]): MinutesContent {
  return { ...content, absentees: absentees.filter(person => person.name?.trim()) }
}

export default function MinutesForm() {
  const { t } = useTranslation()
  const navigate = useNavigate()
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
  const [absentees, setAbsentees] = useState<MinutesAbsentee[]>([])
  /** 行动项负责人的 id→姓名快照回显底账：没它时编辑页打开就是一排裸 ID */
  const [ownerSeed, setOwnerSeed] = useState<{ id: number; name: string; empId?: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const [minutesLoadNote, setMinutesLoadNote] = useState<string>()
  const [sendTargetId, setSendTargetId] = useState<number>()
  /** 关联纪要：只存 id，标题/时间由服务端回查做快照 */
  const [linkIds, setLinkIds] = useState<number[]>([])
  const [linkOptions, setLinkOptions] = useState<MinutesLinkVO[]>([])
  /** 签到补录：钉钉未签到但实际到会的人 */
  const [presentIds, setPresentIds] = useState<number[]>([])

  /** 编辑已有纪要时以服务端回传的记录人为准；新建时就是当前登录人 */
  const recorderText = useMemo(() => {
    if (minutes?.exists && minutes.recorderName) {
      return `${minutes.recorderName}${minutes.recorderEmpNo ? `（${minutes.recorderEmpNo}）` : ''}`
    }
    return `${user?.name ?? ''}${user?.empId ? `（${user.empId}）` : ''}`
  }, [minutes, user])

  const load = useCallback(async () => {
    if (!bookingId && !minutesId) {
      setError(t('meeting.minutes.missingMeetingId', { defaultValue: '缺少會議編號，請從會議列表或詳情頁進入' }))
      return
    }
    setLoading(true)
    setError(undefined)
    setMinutesLoadNote(undefined)
    try {
      // 纪要与会议单分开取：纪要读不到仍可按"尚无纪要"继续录入，会议单读不到就没有会议可记
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
        if (vo?.exists && vo.content) {
          const content = vo.content
          form.setFieldsValue({
            items: content.items?.length ? content.items : base.items,
            actions: (vo.items ?? []).filter(item => item.kind === 'ACTION').length
              ? (vo.items ?? []).filter(item => item.kind === 'ACTION').map(item => ({
                  content: item.content,
                  ownerIds: item.ownerUserId ? [item.ownerUserId] : [],
                  dueDate: item.dueDate ? dayjs(item.dueDate) : null,
                }))
              : (content.actions ?? []).map(action => ({
                  content: action.content,
                  ownerIds: action.ownerUserId ? [action.ownerUserId] : [],
                  dueDate: action.dueDate ? dayjs(action.dueDate) : null,
                })),
            followUps: (vo.items ?? []).filter(item => item.kind === 'FOLLOW').map(item => ({
              content: item.content,
              ownerIds: item.ownerUserId ? [item.ownerUserId] : [],
              dueDate: item.dueDate ? dayjs(item.dueDate) : null,
            })),
            nextMeetingAt: content.nextMeetingAt ? dayjs(content.nextMeetingAt) : null,
            nextMeetingNote: content.nextMeetingNote,
            remark: content.remark,
          })
          setAbsentees(content.absentees ?? [])
          setLinkIds((vo.links ?? []).map(link => link.minutesId))
          setLinkOptions(vo.links ?? [])
          const seeds: { id: number; name: string; empId?: string }[] = []
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
          form.setFieldsValue({ items: base.items, actions: [], followUps: [] })
          // 建议缺席只在"还没有纪要"时给，已有纪要以记录人写的内容为准。
          // 优先用服务端骨架里的 suggestedAbsentees（原因码→当前语言），读不到再按会议详情兜底。
          const suggested = (vo?.suggestedAbsentees ?? []).map(person => ({
            userId: person.userId ?? null,
            name: person.name,
            empNo: person.empNo,
            reason: person.reasonCode === 'DECLINED'
              ? t('meeting.minutes.reasonDeclined', { defaultValue: '婉拒邀約' })
              : t('meeting.minutes.reasonNoCheckin', { defaultValue: '未簽到' }),
          }))
          if (suggested.length > 0) {
            setAbsentees(suggested)
          } else if (meetingResult.status === 'fulfilled' && meetingResult.value) {
            setAbsentees(suggestAbsentees(meetingResult.value, t))
          }
        }
        // 由纪要 id 进来时，会议单要从纪要的 bookingId 再补取一次
        if (!bookingId && vo?.bookingId) {
          try { setMeeting(await fetchMeetingDetail(vo.bookingId)) } catch { /* 会议单读取失败已在上方留痕，不重复弹错 */ }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('meeting.failedToLoadThe2', { defaultValue: '會議詳情加載失敗' }))
    } finally {
      setLoading(false)
    }
  }, [bookingId, minutesId, form, t])

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
    try {
      await form.validateFields()
    } catch {
      message.warning(t('meeting.minutes.checkForm', { defaultValue: '請檢查表單填寫' }))
      return
    }
    const content = withAbsentees(toContent(form.getFieldsValue()), absentees)
    const invalid = validateContent(content)
    if (invalid) {
      message.warning(invalid)
      return
    }
    if (minutes?.minutesEnabled === false) {
      message.warning(t('meeting.minutes.featureOff', { defaultValue: '會議紀要功能尚未啟用，請聯繫管理員開啟' }))
      return
    }

    setSaving(true)
    try {
      const values = form.getFieldsValue()
      const items = [
        ...(values.actions ?? []).filter(action => action.content?.trim()).map(action => ({
          kind: 'ACTION' as const,
          content: action.content!.trim(),
          ownerUserId: action.ownerIds?.[0] ?? null,
          dueDate: toMeetingIsoDate(action.dueDate),
        })),
        ...(values.followUps ?? []).filter(issue => issue.content?.trim()).map(issue => ({
          kind: 'FOLLOW' as const,
          content: issue.content!.trim(),
          ownerUserId: issue.ownerIds?.[0] ?? null,
          dueDate: toMeetingIsoDate(issue.dueDate),
        })),
      ]
      const saved = minutes?.exists && minutes.id
        ? await updateMinutes(minutes.id, { content, items, linkedMinutesIds: linkIds, markPresentUserIds: presentIds, version: minutes.version ?? 0 })
        : await createMinutes({ bookingId, content, items, linkedMinutesIds: linkIds, markPresentUserIds: presentIds, requestKey: newMeetingRequestKey('mm') })
      setMinutes(saved)
      message.success(t('meeting.minutes.saveSuccess', { defaultValue: '紀要已保存' }))
      if (send && saved.id) {
        setSendTargetId(saved.id)
      } else if (saved.id) {
        // 保存后进纪要查看页而不是会议详情：那一页才是「正文 + 发送历史」的归属地，
        // 也让用户立刻看到刚才那一版正文长什么样（需求 3：每次会议记录都可以查看）
        navigate(`/meeting-minutes?id=${saved.id}`)
      } else {
        navigate(`/meeting-detail?id=${saved.bookingId ?? meeting?.id}`)
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
  const charCount = minutesContentLength(withAbsentees(toContent(watchedValues ?? {}), absentees))

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
              onClick={() => (meeting ? navigate(`/meeting-detail?id=${meeting.id}`) : navigate('/meeting-my'))}
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
              <Button size="small" onClick={() => navigate(`/meeting-minutes?id=${minutes.id}`)}>
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
        // 纪要读不到不阻断录入（可能是首次），但必须讲清楚原因，不能让用户以为"这就是空的"
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message={t('meeting.minutes.loadNote', { defaultValue: '未能讀取既有紀要，本次將按新錄入處理' })}
          description={minutesLoadNote}
        />
      )}
      {meeting && meeting.status === 'cancelled' && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={t('meeting.minutes.cancelledHint', { defaultValue: '這場會議已取消，一般不需要紀要；確有書面結論需要留檔時可繼續錄入' })}
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
              onOpen={(target) => navigate(`/meeting-minutes-form?bookingId=${target}`)}
            />
          ))}
          {/* 上一場/下一場：chip 适合跳指定一场，连续写纪要时靠这两个按钮而不是用眼睛找当前位置 */}
          <span className="mm-series-nav">
            <Button
              size="small"
              disabled={!previousNode}
              icon={<LeftOutlined />}
              onClick={() => previousNode && navigate(`/meeting-minutes-form?bookingId=${previousNode.bookingId}`)}
            >{t('meeting.minutes.prevSession', { defaultValue: '上一場' })}</Button>
            <Button
              size="small"
              disabled={!nextNode}
              onClick={() => nextNode && navigate(`/meeting-minutes-form?bookingId=${nextNode.bookingId}`)}
            >{t('meeting.minutes.nextSession', { defaultValue: '下一場' })}<RightOutlined /></Button>
          </span>
        </div>
      )}

      <Form form={form} layout="vertical" disabled={minutes?.canEdit === false}>
        {/* 一、会议资讯（自动带出，只读） */}
        <div style={cardStyle}>
          <CardTitle icon={<ProfileOutlined />} tone="info" title={t('meeting.minutes.sectionMeeting', { defaultValue: '會議資訊' })}
            note={t('meeting.minutes.meetingReadonlyHint', { defaultValue: '由會議單自動帶出，不可修改' })} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
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
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 13, color: '#595959', marginBottom: 6 }}>{t('meeting.minutes.attendeeList', { defaultValue: '參會人' })}</div>
            <Space size={6} wrap>
              {(meeting?.attendees ?? []).map(person => (
                <Tag key={person.id} color={person.response === 'declined' ? 'default' : 'blue'}>{person.name}</Tag>
              ))}
              {meeting?.externalAttendees && <Tag color="purple">{`${t('meeting.externalAttendees', { defaultValue: '外部參會人' })}：${meeting.externalAttendees}`}</Tag>}
            </Space>
          </div>
          <AbsenteeEditor value={absentees} onChange={setAbsentees} disabled={minutes?.canEdit === false} />
          {/* 签到补录：有人到了但没点钉钉签到，缺席名单就会错；这里由记录人改成“已参会” */}
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 13, color: '#595959', marginBottom: 6 }}>
              {t('meeting.minutes.markPresent', { defaultValue: '補錄實際參會（釘釘未簽到但已到場）' })}
            </div>
            <Select
              mode="multiple"
              allowClear
              optionFilterProp="label"
              disabled={minutes?.canEdit === false}
              value={presentIds}
              onChange={setPresentIds}
              style={{ width: '100%' }}
              placeholder={t('meeting.minutes.markPresentPlaceholder', { defaultValue: '選擇實際到場的員工；保存後他們會記為已參會' })}
              options={(meeting?.attendees ?? [])
                .filter(person => !person.checkinAt && person.userId)
                .map(person => ({ value: person.userId as number, label: `${person.name}${person.empNo ? `（${person.empNo}）` : ''}` }))}
            />
          </div>
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
              disabled={minutes?.canEdit === false}
              value={linkIds}
              onChange={setLinkIds}
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
                      <Form.Item label={t('meeting.minutes.discussion', { defaultValue: '討論要點' })} name={[field.name, 'discussion']}>
                        <Input.TextArea autoSize={{ minRows: 3, maxRows: 10 }} maxLength={500} showCount placeholder={t('meeting.minutes.discussionPlaceholder', { defaultValue: '各方意見與數據' })} />
                      </Form.Item>
                      <Form.Item label={t('meeting.minutes.conclusion', { defaultValue: '結論 / 決議' })} name={[field.name, 'conclusion']} style={{ marginBottom: 0 }}>
                        <Input.TextArea autoSize={{ minRows: 3, maxRows: 10 }} maxLength={500} showCount placeholder={t('meeting.minutes.conclusionPlaceholder', { defaultValue: '定了什麼、誰負責、什么时候生效' })} />
                      </Form.Item>
                    </div>
                  </div>
                ))}
                <Button type="dashed" block icon={<PlusOutlined />} onClick={() => add({ topic: '', discussion: '', conclusion: '' })}>
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
                        <Input.TextArea autoSize={{ minRows: 2, maxRows: 8 }} placeholder={t('meeting.minutes.actionPlaceholder', { defaultValue: '要做的事，例：輸出預算明細表' })} maxLength={300} />
                      </Form.Item>
                      <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => remove(field.name)} aria-label={t('meeting.minutes.deleteAction', { defaultValue: '刪除行動項' })} />
                    </div>
                    <div className="mm-dyn-body">
                      {/* 负责人只存 sys_user.id：姓名/工号是服务端回查的快照，前端不自报 */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                        <Form.Item label={t('meeting.minutes.owner', { defaultValue: '負責人' })} name={[field.name, 'ownerIds']} style={{ marginBottom: 0 }}>
                          <EmployeeSelect single seed={ownerSeed} placeholder={t('meeting.minutes.ownerPlaceholder', { defaultValue: '搜尋姓名或工號' })} />
                        </Form.Item>
                        <Form.Item label={t('meeting.minutes.dueDate', { defaultValue: '完成時限' })} name={[field.name, 'dueDate']} style={{ marginBottom: 0 }}>
                          <DatePicker style={{ width: '100%' }} placeholder={t('meeting.minutes.dueDatePlaceholder', { defaultValue: '選填' })} />
                        </Form.Item>
                      </div>
                    </div>
                  </div>
                ))}
                <Button type="dashed" block icon={<PlusOutlined />} onClick={() => add({ content: '', ownerIds: [], dueDate: null })}>
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
                        <Input.TextArea autoSize={{ minRows: 2, maxRows: 8 }} placeholder={t('meeting.minutes.followUpPlaceholder', { defaultValue: '待跟進的事項，例：確認 Q4 預算分攤口徑' })} maxLength={300} />
                      </Form.Item>
                      <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => remove(field.name)} aria-label={t('meeting.minutes.deleteIssue', { defaultValue: '刪除跟進事項' })} />
                    </div>
                    <div className="mm-dyn-body">
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                        <Form.Item label={t('meeting.minutes.followOwner', { defaultValue: '跟進人' })} name={[field.name, 'ownerIds']} style={{ marginBottom: 0 }}>
                          <EmployeeSelect single seed={ownerSeed} placeholder={t('meeting.minutes.ownerPlaceholder', { defaultValue: '搜尋姓名或工號' })} />
                        </Form.Item>
                        <Form.Item label={t('meeting.minutes.dueDate', { defaultValue: '完成時限' })} name={[field.name, 'dueDate']} style={{ marginBottom: 0 }}>
                          <DatePicker style={{ width: '100%' }} placeholder={t('meeting.minutes.dueDatePlaceholder', { defaultValue: '選填，逾期會提醒' })} />
                        </Form.Item>
                      </div>
                    </div>
                  </div>
                ))}
                <Button type="dashed" block icon={<PlusOutlined />} onClick={() => add({ content: '', ownerIds: [], dueDate: null })}>
                  {t('meeting.minutes.addFollowUp', { defaultValue: '新增跟進事項' })}
                </Button>
              </>
            )}
          </Form.List>
        </div>

        {/* 五、下次会议 */}
        <div style={cardStyle}>
          <CardTitle icon={<CalendarOutlined />} tone="info" title={t('meeting.minutes.sectionNext', { defaultValue: '下次會議' })} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <Form.Item label={t('meeting.minutes.nextMeetingAt', { defaultValue: '下次會議時間' })} name="nextMeetingAt">
              <DatePicker showTime={{ format: 'HH:mm' }} format="YYYY-MM-DD HH:mm" style={{ width: '100%' }} placeholder={t('meeting.minutes.selectTime', { defaultValue: '選填' })} />
            </Form.Item>
            <Form.Item label={t('meeting.minutes.nextMeetingNote', { defaultValue: '議程預告' })} name="nextMeetingNote" style={{ gridColumn: 'span 2' }}>
              <Input maxLength={200} placeholder={t('meeting.minutes.nextNotePlaceholder', { defaultValue: '例：帶預算明細表復核' })} />
            </Form.Item>
          </div>
        </div>

        {/* 六、补充说明（备注独占整行，见 §C.4.1） */}
        <div style={cardStyle}>
          <CardTitle icon={<FileTextOutlined />} tone="info" title={t('meeting.minutes.sectionRemark', { defaultValue: '補充說明' })} />
          <Form.Item label={t('meeting.minutes.remarkLabel', { defaultValue: '備註' })} name="remark" style={{ marginBottom: 0 }}>
            <RemarkTextArea placeholder={t('meeting.minutes.remarkPlaceholder', { defaultValue: '與會外的補充資訊，例：資料位置、後續對接群' })} />
          </Form.Item>
        </div>
      </Form>

      {/* 底部操作（§C.5）：详情只读模式隐藏 */}
      {minutes?.canEdit !== false && (
        <div className="form-footer">
          <Button onClick={() => navigate(meeting ? `/meeting-detail?id=${meeting.id}` : '/meeting-my')}>{t('meeting.cancel', { defaultValue: '取消' })}</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => void handleSave(false)}>
            {t('meeting.minutes.saveDraft', { defaultValue: '保存紀要' })}
          </Button>
          <Button type="primary" icon={<SendOutlined />} loading={saving} onClick={() => void handleSave(true)}>
            {t('meeting.minutes.saveAndSend', { defaultValue: '保存並發送' })}
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

      {sendTargetId && (
        <SendMinutesModal
          minutesId={sendTargetId}
          meeting={meeting}
          content={withAbsentees(toContent(form.getFieldsValue()), absentees)}
          version={minutes?.version ?? 0}
          linkBaseUrl={minutes?.linkBaseUrl}
          linkBasePublic={minutes?.linkBasePublic}
          onClose={() => setSendTargetId(undefined)}
          onSent={() => {
            setSendTargetId(undefined)
            if (minutes?.id) navigate(`/meeting-minutes?id=${minutes.id}`)
            else if (meeting) navigate(`/meeting-detail?id=${meeting.id}`)
          }}
        />
      )}
    </div>
  )
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

/**
 * 缺席名单编辑：建议值来自参会人（婉拒 / 未签到），记录人可删可加。
 * 用组件外函数而不是塞进 Form：这一份是"人选集合"而不是文本字段，Form.List 反而写不出来的更啰嗦。
 */
function AbsenteeEditor({ value, onChange, disabled }: { value: MinutesAbsentee[]; onChange: (next: MinutesAbsentee[]) => void; disabled?: boolean }) {
  const { t } = useTranslation()
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 13, color: '#595959', marginBottom: 6 }}>
        {t('meeting.minutes.absentees', { defaultValue: '缺席 / 未到場人員' })}
        <span style={{ marginLeft: 6, fontSize: 12, color: '#8C8C8C' }}>{t('meeting.minutes.absenteesHint', { defaultValue: '系統按邀約響應與簽到給出建議，可自由增刪' })}</span>
      </div>
      <Space direction="vertical" size={8} style={{ width: '100%' }}>
        {value.map((person, index) => (
          <Space key={`${person.userId ?? person.name}-${index}`} size={8} wrap>
            <Tag closable={!disabled} onClose={() => onChange(value.filter((_, i) => i !== index))}>
              {`${person.name}${person.empNo ? `（${person.empNo}）` : ''}`}
            </Tag>
            <Input
              size="small"
              style={{ width: 180 }}
              maxLength={40}
              disabled={disabled}
              placeholder={t('meeting.minutes.absentReasonPlaceholder', { defaultValue: '缺席原因，選填' })}
              value={person.reason ?? ''}
              onChange={e => onChange(value.map((item, i) => (i === index ? { ...item, reason: e.target.value } : item)))}
            />
          </Space>
        ))}
        {!disabled && (
          <EmployeeSelect
            single
            placeholder={t('meeting.minutes.addAbsentee', { defaultValue: '追加缺席人員' })}
            value={[]}
            excludeIds={value.map(person => person.userId).filter((id): id is number => id != null)}
            onPick={(picked) => {
              const person = picked[0]
              if (!person) return
              onChange([...value, { userId: person.id, name: person.name }])
            }}
          />
        )}
      </Space>
    </div>
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
