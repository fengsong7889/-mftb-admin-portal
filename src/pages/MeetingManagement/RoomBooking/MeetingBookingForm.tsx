/**
 * 新建会议预约（独立页面，路由 /meeting-booking-form?roomId=&date=&start=）。
 *
 * <p>为什么是独立页面而不是弹窗（§9.1）：预约要同时决定"哪间房、哪段时间、谁参加、是否周期"，
 * 周期设置还会展开出 4~5 个字段与场次预览；弹窗里这些内容只能滚动查看，
 * 用户看不到自己刚选的房间与时间就已经在填参会人了。独立页面把这些拆成三张卡片，
 * 并且 URL 可分享（把"订这间房这个点"的链接发给同事，他打开就是同一张表单）。
 *
 * <p>时间选择只给"日期 + 开始时刻 + 时长"三项，不让用户手输结束时间：
 * 结束时间由时长算出，才能保证与后端 15 分钟粒度、单场时长上下限一致，
 * 也避免出现"结束早于开始"这类要来回纠正的输入。
 *
 * <p>参会人数含组织者本人与外部人员，与后端容量校验同一口径 ——
 * 前端少算一个人，就会出现"页面说能坐 8 人、提交被拒"的不一致。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  Alert, Button, DatePicker, Form, Input, InputNumber, Modal, Select, Space, Spin, Switch, Table, Tag, message,
} from 'antd'
import {
  ArrowLeftOutlined, ClockCircleOutlined, EnvironmentOutlined, ProfileOutlined, SendOutlined, TeamOutlined,
} from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import RemarkTextArea from '@/components/RemarkTextArea'
import {
  createMeeting,
  createSeries,
  fetchMeetingRoomDetail,
  newMeetingRequestKey,
  previewSeries,
  toMeetingIso,
  type MeetingCreateForm,
  type MeetingRoomVO,
  type SeriesPreview,
} from '@/api/meeting'
import { bizTypeLabels } from '../meetingMeta'
import { durationOptions, ruleForRoom, validateBookingWindow } from '../meetingRules'
import EmployeeSelect from '@/components/EmployeeSelect'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import CardTitle from '@/components/CardTitle'

/** 周期会议的跳过清单：只给一句 toast 等于让用户自己去数哪几天没订上 */
interface SkippedItem { seq: number; startTime: string; endTime: string; reason: string }

/**
 * 时间选择器的分钟档位：antd DatePicker 的 minuteStep 只接受 1~59，
 * 规则粒度 60 分钟（按小时对齐）在这里必须降级成 30 档——小时位仍由用户单选，
 * 不会出现"选不到整点"的问题，也不会把非法值塞进组件类型。
 */
function pickerMinuteStep(granularity?: number): 5 | 10 | 15 | 20 | 30 {
  const value = granularity ?? 15
  if (value >= 30) return 30
  if (value >= 20) return 20
  if (value >= 15) return 15
  if (value >= 10) return 10
  return 5
}

type FormShape = Omit<MeetingCreateForm,
  'startTime' | 'endTime' | 'attendeeUserIds' | 'optionalUserIds' | 'externalAttendees' | 'delegateForId'> & {
  start?: Dayjs
  duration?: number
  attendeeUserIds?: number[]
  optionalUserIds?: number[]
  externalAttendees?: string[]
  /** 代订开关：只是 UI 状态，提交时决定是否带 delegateForId（关掉即回到自订） */
  delegateEnabled?: boolean
  /** EmployeeSelect 统一以数组承载值，单选模式也回数组 */
  delegateForId?: number[]
  /** 周期设置：none=单场；daily/weekly 走 /meeting/series */
  repeat?: 'none' | 'daily' | 'weekly'
  intervalN?: number
  byWeekday?: number[]
  repeatEndDate?: Dayjs
  occurrenceLimit?: number
}

// 必须是函数：模块级常量会在 import 那一刻冻结语言，切英文后星期选项仍是中文
const WEEKDAY_OPTIONS = (t: TFunction) => [
  { value: 1, label: t('meeting.weekdayMon', { defaultValue: '一' }) },
  { value: 2, label: t('meeting.weekdayTue', { defaultValue: '二' }) },
  { value: 3, label: t('meeting.weekdayWed', { defaultValue: '三' }) },
  { value: 4, label: t('meeting.weekdayThu', { defaultValue: '四' }) },
  { value: 5, label: t('meeting.weekdayFri', { defaultValue: '五' }) },
  { value: 6, label: t('meeting.weekdaySat', { defaultValue: '六' }) },
  { value: 7, label: t('meeting.weekdaySun', { defaultValue: '日' }) },
]

const cardStyle: CSSProperties = {
  border: '1px solid #e8eaed', borderRadius: 8, background: '#fff',
  padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
}

const gridStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }

export default function MeetingBookingForm() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const [form] = Form.useForm<FormShape>()

  const roomId = Number(searchParams.get('roomId'))
  const dateParam = searchParams.get('date')
  const startParam = searchParams.get('start')
  const day = dateParam && dayjs(dateParam).isValid() ? dayjs(dateParam) : dayjs()
  const initialStart = startParam && dayjs(`${day.format('YYYY-MM-DD')} ${startParam}`).isValid()
    ? dayjs(`${day.format('YYYY-MM-DD')} ${startParam}`)
    : undefined

  const [room, setRoom] = useState<MeetingRoomVO>()
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string>()
  const [submitting, setSubmitting] = useState(false)
  /** 同一时刻只允许一个确认框：连点两次会叠两层，用户容易对着旧弹窗提交 */
  const confirmOpen = useRef(false)
  const [previewing, setPreviewing] = useState(false)
  const [issues, setIssues] = useState<string[]>([])
  const [preview, setPreview] = useState<SeriesPreview[]>([])
  const [skipped, setSkipped] = useState<SkippedItem[]>([])
  const [skippedOpen, setSkippedOpen] = useState(false)
  /** 代订人的姓名快照只用于二次确认展示；落库与判定一律按 id 由服务端回查 */
  const [delegateName, setDelegateName] = useState('')
  const { hasPermission } = useAuth()
  // 与手动释放、代取消同一个权限锚：能代操作他人预约的人才有权替他人占用会议室
  const canDelegate = hasPermission('meeting-record:edit')

  // Form.useWatch 的数组参数是「嵌套路径」而不是「多个字段名」：
  // 传 ['start','duration',...] 会被当成 start.duration 这种嵌套取值，结果永远是 undefined，
  // 于是周期字段整块不展开、结束时间恒为「待选择」、人数恒为 1 而容量超额告警永不触发。
  // 多字段必须逐个 useWatch。
  const start = Form.useWatch('start', form) as Dayjs | undefined
  const duration = Form.useWatch('duration', form) as number | undefined
  const required = (Form.useWatch('attendeeUserIds', form) as number[] | undefined) ?? []
  const optional = (Form.useWatch('optionalUserIds', form) as number[] | undefined) ?? []
  const externals = (Form.useWatch('externalAttendees', form) as string[] | undefined) ?? []
  const watchedRepeat = (Form.useWatch('repeat', form) as 'none' | 'daily' | 'weekly' | undefined) ?? 'none'
  const watchedDelegateEnabled = Form.useWatch('delegateEnabled', form) ?? false
  const watchedDelegateIds = (Form.useWatch('delegateForId', form) as number[] | undefined) ?? []
  const delegateUserId = watchedDelegateEnabled ? watchedDelegateIds[0] : undefined

  const rule = useMemo(() => (room ? ruleForRoom(room) : undefined), [room])
  // 后端会把实际使用人并入必参名单，前端必须同口径算人数：人数不当容量门槛了，
  // 但它仍是预约单上的參會人數（详情/纪要/统计都拿它），少算一个就是单据写错
  const delegateExtra = delegateUserId != null
    && !required.includes(delegateUserId) && !optional.includes(delegateUserId) ? 1 : 0
  const attendeeCount = 1 + required.length + optional.length + externals.filter(Boolean).length + delegateExtra

  // 关掉代订时清掉挂名人：不能在 Switch 上写 onChange，那会覆盖 Form.Item 注入的 onChange，
  // 导致开关自己的值都写不进表单
  useEffect(() => {
    if (!watchedDelegateEnabled) {
      form.setFieldValue('delegateForId', [])
      setDelegateName('')
    }
  }, [watchedDelegateEnabled, form])
  const end = start && duration ? start.add(duration, 'minute') : undefined

  const goBack = useCallback(() => {
    navigate('/meeting-booking', { replace: true, state: { closeMenuTab: location.pathname + location.search } })
  }, [navigate, location.pathname, location.search])

  /** 按 roomId 回查房间档案：忙闲页只带展示字段，容量与生效规则必须从档案接口取 */
  useEffect(() => {
    if (!roomId || Number.isNaN(roomId)) {
      setLoading(false)
      setLoadError(t('meeting.missingRoomParameterPlease', { defaultValue: '缺少會議室參數，請從「會議室預約」頁重新進入' }))
      return
    }
    let alive = true
    setLoading(true)
    setLoadError(undefined)
    fetchMeetingRoomDetail(roomId)
      .then((data) => {
        if (!alive) return
        setRoom(data)
        if (!data.bookable || data.status !== 'active') {
          setLoadError(t('meeting.thisRoomIsNot', { defaultValue: '該會議室目前不接受預約（維護中或已停用），請改選其他會議室' }))
        }
      })
      .catch((e: unknown) => {
        if (alive) setLoadError(e instanceof Error ? e.message : t('meeting.failedToLoadThe5', { defaultValue: '會議室檔案加載失敗' }))
      })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [roomId])

  /** 房间规则到手后才能算默认时长，因此初始化放在 room 之后（否则默认值会先按无规则算一次） */
  useEffect(() => {
    if (!room) return
    const roomRule = ruleForRoom(room)
    form.setFieldsValue({
      start: initialStart ?? day.hour(10).minute(0).second(0),
      duration: roomRule.minDuration && roomRule.minDuration >= 30 ? roomRule.minDuration : 60,
      attendeeUserIds: [],
      optionalUserIds: [],
      externalAttendees: [],
      bizType: 'general',
      delegateEnabled: false,
      delegateForId: [],
      repeat: 'none',
      intervalN: 1,
      byWeekday: [],
      occurrenceLimit: 12,
    })
    setPreview([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, form])

  /** 预览周期场次：与后端 occurrences 同一算法，只算不写库 */
  const doPreview = async () => {
    if (!room) return
    const values = form.getFieldsValue() as FormShape
    if (!values.start || !values.duration) {
      setIssues([t('meeting.chooseTheStartTime', { defaultValue: '請先選擇開始時間與時長' })])
      return
    }
    if (values.repeat === 'weekly' && !(values.byWeekday ?? []).length) {
      setIssues([t('meeting.weeklyRecurrenceNeedsAt', { defaultValue: '每週重複請至少選擇一個星期' })])
      return
    }
    setIssues([])
    setPreviewing(true)
    try {
      const list = await previewSeries({
        title: (values.title ?? '').trim(),
        roomId: room.id,
        startDate: values.start.format('YYYY-MM-DD'),
        timeStart: values.start.format('HH:mm'),
        timeEnd: values.start.add(values.duration, 'minute').format('HH:mm'),
        freq: values.repeat === 'weekly' ? 'weekly' : 'daily',
        intervalN: values.intervalN ?? 1,
        byWeekday: values.byWeekday ?? [],
        endDate: values.repeatEndDate ? values.repeatEndDate.format('YYYY-MM-DD') : undefined,
        occurrenceLimit: values.occurrenceLimit ?? 12,
      })
      setPreview(list)
    } catch (e) {
      setIssues([e instanceof Error ? e.message : t('meeting.previewFailed', { defaultValue: '預覽失敗' })])
    } finally {
      setPreviewing(false)
    }
  }

  /** 真正的提交：单次与周期共用，失败留在本页（冲突原因已由 request.ts 弹出） */
  const doSubmit = async (payload: MeetingCreateForm, raw: FormShape, startValue: Dayjs, endValue: Dayjs) => {
    setSubmitting(true)
    try {
      if (raw.repeat && raw.repeat !== 'none') {
        const series = await createSeries({
          title: payload.title,
          roomId: payload.roomId,
          startDate: startValue.format('YYYY-MM-DD'),
          timeStart: startValue.format('HH:mm'),
          timeEnd: endValue.format('HH:mm'),
          freq: raw.repeat,
          intervalN: raw.intervalN ?? 1,
          byWeekday: raw.repeat === 'weekly' ? raw.byWeekday : undefined,
          endDate: raw.repeatEndDate ? raw.repeatEndDate.format('YYYY-MM-DD') : undefined,
          occurrenceLimit: raw.occurrenceLimit ?? 12,
          attendeeUserIds: payload.attendeeUserIds,
          optionalUserIds: payload.optionalUserIds,
          externalAttendees: payload.externalAttendees,
          description: payload.description,
          onlineMeetingUrl: payload.onlineMeetingUrl,
          bizType: payload.bizType,
          delegateForId: payload.delegateForId,
          bizId: payload.bizId,
          bizNo: payload.bizNo,
          bizUrl: payload.bizUrl,
          requestKey: payload.requestKey,
        })
        if (series.skippedCount && series.skippedCount > 0) {
          message.warning(t('meeting.seriesSkippedWarning', {
            count: series.generatedCount, skipped: series.skippedCount,
            defaultValue: `已生成 ${series.generatedCount} 場，${series.skippedCount} 場因時段衝突被跳過`,
          }))
          setSkipped(series.skipped ?? [])
          setSkippedOpen(true)
        } else if (series.scenarioActive === false) {
          // 只看 scenarioActive：inviteQueued=false 也可能是「没选其他参会人，根本没人要发」，
          // 拿它当场景未启用会让行政跑去通知配置乱改
          message.warning(t('meeting.seriesCreatedNoInvite', {
            count: series.generatedCount,
            defaultValue: `已生成 ${series.generatedCount} 場週期會議，但通知場景未啟用或未綁定企業應用，邀約未發送`,
          }))
          goBack()
        } else if ((series.notifySkippedCount ?? 0) > 0) {
          message.warning(t('meeting.seriesCreatedSkipped', {
            count: series.generatedCount, skipped: series.notifySkippedCount ?? 0,
            defaultValue: `已生成 ${series.generatedCount} 場週期會議，${series.notifySkippedCount ?? 0} 人未綁定釘釘，首场邀約未送達`,
          }))
          goBack()
        } else {
          message.success(t('meeting.seriesCreated', {
            count: series.generatedCount, no: series.seriesNo,
            defaultValue: `已生成 ${series.generatedCount} 場週期會議：${series.seriesNo}`,
          }))
          goBack()
        }
        return
      }
      const result = await createMeeting(payload)
      // 三分支口径：场景未启用才说未启用；只有「确实要发却发不出去」才是警告；
      // 只选自己一人时本来就没邀约可发，不该弹任何异常提示
      if (result.scenarioActive === false) {
        message.warning(t('meeting.bookedNoInvite', {
          no: result.bookingNo, defaultValue: `會議已預約（${result.bookingNo}），但通知場景未啟用或未綁定企業應用，邀約未發送`,
        }))
      } else if (result.notifySkippedCount > 0) {
        message.warning(t('meeting.bookedSkippedInvite', {
          no: result.bookingNo, count: result.notifySkippedCount,
          defaultValue: `會議已預約（${result.bookingNo}），${result.notifySkippedCount} 人未綁定釘釘，邀約未送達`,
        }))
      } else {
        message.success(t('meeting.bookedSuccess', { no: result.bookingNo, defaultValue: `會議已預約：${result.bookingNo}` }))
      }
      goBack()
    } catch (e) {
      const text = e instanceof Error ? e.message : t('meeting.bookingFailed', { defaultValue: '預約失敗' })
      setIssues([text])
    } finally {
      setSubmitting(false)
    }
  }

  /** 校验 → 二次确认 → 调接口（§B.3 顺序不可颠倒） */
  const handleSubmit = async () => {
    if (!room || submitting) return
    let raw: FormShape
    try {
      raw = await form.validateFields()
    } catch {
      return // antd 已在字段下方标出原因
    }
    const startValue = raw.start as Dayjs
    const durationValue = raw.duration as number
    const endValue = startValue.add(durationValue, 'minute')
    const payload: MeetingCreateForm = {
      title: (raw.title ?? '').trim(),
      roomId: room.id,
      startTime: toMeetingIso(startValue) ?? '',
      endTime: toMeetingIso(endValue) ?? '',
      attendeeUserIds: raw.attendeeUserIds ?? [],
      optionalUserIds: raw.optionalUserIds ?? [],
      externalAttendees: (raw.externalAttendees ?? []).filter(Boolean),
      description: raw.description?.trim() || undefined,
      onlineMeetingUrl: raw.onlineMeetingUrl?.trim() || undefined,
      bizType: raw.bizType || undefined,
      // 关掉代订时明确传 undefined：留旧值会让"改回自订"仍挂着上一次的被代订人
      delegateForId: raw.delegateEnabled ? raw.delegateForId?.[0] : undefined,
      // 幂等键：一次进入页面生成一次，重复点击提交不会长出第二场会
      requestKey: raw.requestKey ?? newMeetingRequestKey('book'),
    }

    // 周期场景只对"第一场"做前端校验：后续场次都落在同一星期几与同一时段，
    // 每日窗/时长/粒度/容量的结论与之完全相同，逐场重复校验只会给出同一个答案
    const errors = validateBookingWindow({ room, start: startValue.toDate(), end: endValue.toDate(), attendeeCount })
    if (errors.length > 0) {
      setIssues(errors)
      return
    }
    if (raw.repeat === 'weekly' && !(raw.byWeekday ?? []).length) {
      setIssues([t('meeting.weeklyRecurrenceNeedsAt', { defaultValue: '每週重複請至少選擇一個星期' })])
      return
    }
    setIssues([])

    const everyText = raw.repeat === 'weekly'
      ? t('meeting.everyNWeeksValue', { n: raw.intervalN ?? 1, defaultValue: `每 ${raw.intervalN ?? 1} 週` })
      : t('meeting.everyNDaysValue', { n: raw.intervalN ?? 1, defaultValue: `每 ${raw.intervalN ?? 1} 天` })
    const repeatText = raw.repeat === 'none'
      ? t('meeting.noRepeatSingle', { defaultValue: '不重複（單場）' })
      : t('meeting.repeatMaxSuffix', {
        every: everyText, count: raw.occurrenceLimit ?? 12,
        defaultValue: `${everyText}，最多 ${raw.occurrenceLimit ?? 12} 場`,
      })
    // 开关只在真要弹框前置位：校验不通过会提前 return，锁住了就再也提交不了
    if (confirmOpen.current) return
    confirmOpen.current = true
    Modal.confirm({
      title: t('meeting.confirmThisBooking', { defaultValue: '確認提交預約？' }),
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      okText: t('meeting.confirmBooking', { defaultValue: '確認預約' }),
      cancelText: t('meeting.cancel', { defaultValue: '取消' }),
      afterClose: () => { confirmOpen.current = false },
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>{t('meeting.labelTopic', { defaultValue: '會議主題：' })}</span><b>{payload.title}</b></div>
          <div className="confirm-info-row"><span>{t('meeting.labelRoom', { defaultValue: '會議室：' })}</span><b>{room.roomNo} · {room.roomName}{room.locationText ? ` · ${room.locationText}` : ''}</b></div>
          <div className="confirm-info-row">
            <span>{t('meeting.time2', { defaultValue: '時間：' })}</span>
            <b>{t('meeting.confirmTimeValue', {
              start: startValue.format('YYYY-MM-DD HH:mm'), end: endValue.format('HH:mm'), count: durationValue,
              defaultValue: `${startValue.format('YYYY-MM-DD HH:mm')} ~ ${endValue.format('HH:mm')}（${durationValue} 分鐘）`,
            })}</b>
          </div>
          <div className="confirm-info-row"><span>{t('meeting.attendees4', { defaultValue: '參會人數：' })}</span><b>{t('meeting.confirmAttendeeValue', { count: attendeeCount, capacity: room.capacity, defaultValue: `${attendeeCount} 人（含組織者）／容納 ${room.capacity} 人` })}</b></div>
          {payload.delegateForId != null && (
            <div className="confirm-info-row">
              <span>{t('meeting.actualUser2', { defaultValue: '實際使用人：' })}</span>
              <b>{t('meeting.confirmDelegateValue', {
                name: delegateName || `id ${payload.delegateForId}`,
                defaultValue: `${delegateName || `id ${payload.delegateForId}`}（由你代訂，名額與衝突按此人判定）`,
              })}</b>
            </div>
          )}
          <div className="confirm-info-row"><span>{t('meeting.repeatLabel', { defaultValue: '重複：' })}</span><b>{repeatText}</b></div>
        </div>
      ),
      onOk: () => doSubmit(payload, raw, startValue, endValue),
    })
  }

  if (loading) {
    return (
      <div className="content-area" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" tip={t('meeting.loadingRoom', { defaultValue: '載入會議室...' })} />
      </div>
    )
  }

  return (
    <div className="content-area">
      {/* 页面头部：橙色渐变顶条 + 返回 + 标题（§C.2，头部不放提交按钮） */}
      <div style={{
        position: 'relative', background: '#fff', marginBottom: 16,
        borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden',
      }}>
        <div style={{
          height: 3, background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
          backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite',
        }} />
        <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Button type="primary" icon={<ArrowLeftOutlined />} onClick={goBack}
              style={{
                backgroundColor: '#E8720C', borderColor: '#E8720C', borderRadius: 8, height: 36,
                padding: '0 16px', display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
              }}>{t('meeting.back', { defaultValue: '返回' })}</Button>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>{t('meeting.bookAMeetingRoom', { defaultValue: '預約會議室' })}</h2>
          </div>
          {room && (
            <Space size={6} wrap>
              <Tag color="blue">{room.roomNo}</Tag>
              <Tag>{room.roomName}</Tag>
              {/* 提交前最后一道提醒：跨城/跨大厦会议室同名常态，位置带上避免订错 */}
              {room.locationText && <Tag color="orange" icon={<EnvironmentOutlined />}>{room.locationText}</Tag>}
              <Tag color={attendeeCount > room.capacity ? 'orange' : 'green'}>
                {t('meeting.currentCapacityNote', { count: attendeeCount, capacity: room.capacity, defaultValue: `當前 ${attendeeCount} 人／容納 ${room.capacity} 人` })}
              </Tag>
            </Space>
          )}
        </div>
      </div>

      {loadError && (
        <Alert
          type="error"
          showIcon
          message={t('meeting.cannotBook', { defaultValue: '無法預約' })}
          description={loadError}
          style={{ marginBottom: 16 }}
          action={<Button size="small" onClick={goBack}>{t('meeting.backToBooking', { defaultValue: '返回預約頁' })}</Button>}
        />
      )}

      {issues.length > 0 && (
        <Alert
          type="error"
          showIcon
          message={t('meeting.cannotSubmit', { defaultValue: '無法提交' })}
          description={<ul style={{ margin: 0, paddingLeft: 18 }}>{issues.map(item => <li key={item}>{item}</li>)}</ul>}
          style={{ marginBottom: 16 }}
        />
      )}

      <Form form={form} layout="vertical" requiredMark="optional" disabled={!room || submitting}>
        {/* 一、会议室与时间 */}
        <div style={cardStyle}>
          <CardTitle
            icon={<ClockCircleOutlined />} tone="info" title={t('meeting.roomTime', { defaultValue: '會議室與時間' })}
            note={room ? t('meeting.roomWindowNote', {
              location: room.locationText ?? '',
              start: room.bookableStartTime ?? '08:00', end: room.bookableEndTime ?? '22:00',
              min: room.minDuration ?? rule?.minDuration ?? 15, max: room.maxDuration ?? rule?.maxDuration ?? 240,
              defaultValue: `${room.locationText ?? ''} · 可預約 ${room.bookableStartTime ?? '08:00'}–${room.bookableEndTime ?? '22:00'} · 單場 ${room.minDuration ?? rule?.minDuration ?? 15}~${room.maxDuration ?? rule?.maxDuration ?? 240} 分鐘`,
            }) : undefined}
          />
          <div style={gridStyle}>
            <Form.Item label={t('meeting.startTime', { defaultValue: '開始時間' })} name="start" rules={[{ required: true, message: t('meeting.pleaseChooseTheStart', { defaultValue: '請選擇開始時間' }) }]}>
              <DatePicker
                showTime={{ format: 'HH:mm', minuteStep: pickerMinuteStep(rule?.granularity) }}
                format="YYYY-MM-DD HH:mm"
                style={{ width: '100%' }}
                disabledDate={current => !!current && current < dayjs().startOf('day')}
              />
            </Form.Item>
            <Form.Item label={t('meeting.duration2', { defaultValue: '時長' })} name="duration" rules={[{ required: true, message: t('meeting.pleaseChooseTheDuration', { defaultValue: '請選擇時長' }) }]}
              extra={t('meeting.endTimeIsDerived', { defaultValue: '結束時間由時長算出，保證符合粒度與上下限' })}>
              <Select
                placeholder={t('meeting.select', { defaultValue: '選擇' })}
                options={(rule ? durationOptions(rule.granularity, rule.maxDuration) : []).map(m => ({
                  value: m,
                  label: m >= 60
                    ? `${Math.floor(m / 60)} ${t('meeting.hourUnit', { defaultValue: '小時' })}${m % 60 ? ` ${m % 60} ${t('meeting.minuteShortUnit', { defaultValue: '分' })}` : ''}`
                    : t('meeting.minutesUnit', { count: m, defaultValue: '{{count}} 分鐘' }),
                }))}
              />
            </Form.Item>
            <Form.Item label={t('meeting.endTime', { defaultValue: '結束時間' })} extra={t('meeting.halfOpenIntervalBack', { defaultValue: '左閉右開：與下一場背靠背不衝突' })}>
              <div style={{
                height: 32, lineHeight: '32px', padding: '0 11px', borderRadius: 6,
                border: '1px solid #d9d9d9', background: '#fafafa', color: '#262626', fontSize: 14,
              }}>
                {end ? end.format('YYYY-MM-DD HH:mm') : t('meeting.pendingChoice', { defaultValue: '待選擇' })}
              </div>
            </Form.Item>
          </div>

          <div style={{ ...gridStyle, gridTemplateColumns: 'repeat(2, 1fr)' }}>
            <Form.Item label={t('meeting.recurrence', { defaultValue: '重複頻率' })} name="repeat"
              extra={t('meeting.seriesSubmitHint', { defaultValue: '週期會議提交時一次性生成全部場次，衝突場次跳過並列明原因' })}>
              <Select options={[
                { value: 'none', label: t('meeting.noRepeatSingle', { defaultValue: '不重複（單場）' }) },
                { value: 'daily', label: t('meeting.daily', { defaultValue: '每天重複' }) },
                { value: 'weekly', label: t('meeting.weekly', { defaultValue: '每週重複' }) },
              ]} />
            </Form.Item>
            {watchedRepeat !== 'none' && (
              <Form.Item label={t('meeting.repeatUntil', { defaultValue: '重複截止日期' })} name="repeatEndDate" extra={t('meeting.leaveEmptyToEnd', { defaultValue: '留空表示只按場次上限結束' })}>
                <DatePicker style={{ width: '100%' }}
                  disabledDate={current => !!current && current < dayjs().startOf('day')} />
              </Form.Item>
            )}
          </div>

          {watchedRepeat !== 'none' && (
            <>
              <div style={gridStyle}>
                <Form.Item label={t('meeting.repeatEvery', { defaultValue: '重複間隔' })} name="intervalN" rules={[{ required: true, message: t('meeting.pleaseEnterTheInterval', { defaultValue: '請填寫間隔' }) }]}
                  extra={watchedRepeat === 'weekly' ? t('meeting.everyNWeeks', { defaultValue: '每 N 週重複一次' }) : t('meeting.everyNDays', { defaultValue: '每 N 天重複一次' })}>
                  <InputNumber min={1} max={30} style={{ width: '100%' }}
                    addonAfter={watchedRepeat === 'weekly' ? t('meeting.weekUnit', { defaultValue: '週' }) : t('meeting.days', { defaultValue: '天' })} />
                </Form.Item>
                <Form.Item label={t('meeting.occurrenceLimit', { defaultValue: '場次上限' })} name="occurrenceLimit" rules={[{ required: true, message: t('meeting.pleaseEnterTheOccurrence', { defaultValue: '請填寫場次上限' }) }]}
                  extra={t('meeting.whicheverComesFirstUp', { defaultValue: '與截止日期取先到者，單次最多 100 場' })}>
                  <InputNumber min={1} max={100} style={{ width: '100%' }} addonAfter={t('meeting.occurrences', { defaultValue: '場' })} />
                </Form.Item>
                {watchedRepeat === 'weekly' && (
                  <Form.Item label={t('meeting.daysOfWeek', { defaultValue: '重複星期' })} name="byWeekday" rules={[{ required: true, message: t('meeting.pleaseChooseWeekdays', { defaultValue: '請選擇星期' }) }]}
                    extra={t('meeting.countingStartsFromThe', { defaultValue: '從起始日所在周開始，該周已過的星期不補生成' })}>
                    <Select mode="multiple" options={WEEKDAY_OPTIONS(t)} placeholder={t('meeting.chooseWeekdays', { defaultValue: '選擇重複的星期' })} maxTagCount={7} />
                  </Form.Item>
                )}
              </div>
              <Space style={{ marginBottom: 4 }} wrap>
                <Button size="small" loading={previewing} onClick={() => void doPreview()}>{t('meeting.previewOccurrences', { defaultValue: '預覽場次' })}</Button>
                {preview.length > 0 && (
                  <span style={{ fontSize: 12, color: '#8C8C8C' }}>
                    {t('meeting.previewSummary', {
                      count: preview.length,
                      list: preview.slice(0, 3).map(d => `${d.date}(${d.weekdayText})`).join('、'),
                      defaultValue: `共 ${preview.length} 場：${preview.slice(0, 3).map(d => `${d.date}(${d.weekdayText})`).join('、')}`,
                    })}
                    {preview.length > 3
                      ? t('meeting.previewLastDate', { date: preview[preview.length - 1].date, defaultValue: ` … 最後 ${preview[preview.length - 1].date}` })
                      : ''}
                  </span>
                )}
              </Space>
            </>
          )}
        </div>

        {/* 二、参会人员 */}
        <div style={cardStyle}>
          <CardTitle
            icon={<TeamOutlined />} tone="success" title={t('meeting.attendees5', { defaultValue: '參會人員' })}
            note={t('meeting.attendeeCapacityNote', {
              count: attendeeCount, capacity: room?.capacity ?? '-',
              defaultValue: `含組織者共 ${attendeeCount} 人／容納 ${room?.capacity ?? '-'} 人`,
            })} />
          {/* 行政代订：房间记在"实际使用人"名下，组织者仍是登录的行政（保留操作权）。
              只对 meeting-record:edit 开放——普通员工能替别人订会，等于能给别人强塞日程、
              也能替被黑名单的人绕开限制。 */}
          {canDelegate && (
            <div style={{ ...gridStyle, gridTemplateColumns: 'repeat(2, 1fr)' }}>
              <Form.Item label={t('meeting.bookForSomeoneElse', { defaultValue: '替他人預訂' })} name="delegateEnabled" valuePropName="checked"
                extra={t('meeting.whenOnTheMeeting', { defaultValue: '開啟後這場會記在使用人名下' })}>
                <Switch checkedChildren={t('meeting.onBehalf', { defaultValue: '代訂' })} unCheckedChildren={t('meeting.self', { defaultValue: '自訂' })} />
              </Form.Item>
              {watchedDelegateEnabled && (
                <Form.Item label={t('meeting.actualUser', { defaultValue: '實際使用人' })} name="delegateForId"
                  rules={[{ required: true, message: t('meeting.pleaseChooseTheActual', { defaultValue: '請選擇實際使用人' }) }]}
                  extra={t('meeting.countedAsRequiredAttendee', { defaultValue: '自動計入必參；衝突與名額按此人判定' })}>
                  <EmployeeSelect single placeholder={t('meeting.searchByNameOr', { defaultValue: '搜尋姓名或工號' })}
                    onPick={items => setDelegateName(items[0]?.name ?? '')} />
                </Form.Item>
              )}
            </div>
          )}
          <div style={gridStyle}>
            <Form.Item label={t('meeting.requiredAttendees', { defaultValue: '必參人員' })} name="attendeeUserIds" extra={t('meeting.theOrganizerComesFrom', { defaultValue: '組織者由登入態確定，不需也不能選自己' })}>
              <EmployeeSelect placeholder={t('meeting.searchByNameOr3', { defaultValue: '搜尋姓名或工號（可多選）' })} />
            </Form.Item>
            <Form.Item label={t('meeting.optionalAttendees', { defaultValue: '選參人員' })} name="optionalUserIds" extra={t('meeting.reminderOnlyStillCounted', { defaultValue: '只提醒不強制出席，同樣計入參會人數' })}>
              <EmployeeSelect placeholder={t('meeting.searchByNameOr3', { defaultValue: '搜尋姓名或工號（可多選）' })} />
            </Form.Item>
            <Form.Item label={t('meeting.externalAttendees', { defaultValue: '外部參會人' })} name="externalAttendees" extra={t('meeting.guestsOrCandidatesName', { defaultValue: '訪客／面試者，只留姓名快照，收不到釘釘邀約' })}>
              <Select mode="tags" allowClear open={false} placeholder={t('meeting.typeANameAnd', { defaultValue: '輸入姓名後回車' })} tokenSeparators={[',', '、']} />
            </Form.Item>
          </div>
          {/* 超容量只做提示、不做拦截（会议室容量指的是现场座位数，线上参会的人不占座）：
              没选出房间时容量未知，拿 ?? 0 参与比较会让空白表单刚打开就弹提醒 */}
          {room != null && attendeeCount > room.capacity && (
            <Alert
              type="info"
              showIcon
              message={t('meeting.attendeeExceedsCapacity', {
                count: attendeeCount, capacity: room.capacity,
                defaultValue: '參會人數 {{count}} 人已超過該會議室容納 {{capacity}} 人',
              })}
              description={t('meeting.capacityIsOfflineSeats', { defaultValue: '容量只指現場座位數，線上參會不受影響，可繼續邀約。若需全部人到場，可改選容納更多的會議室。' })}
            />
          )}
        </div>

        {/* 三、会议信息 */}
        <div style={cardStyle}>
          <CardTitle icon={<ProfileOutlined />} tone="warn" title={t('meeting.meetingInfo', { defaultValue: '會議信息' })} />
          <div style={{ ...gridStyle, gridTemplateColumns: 'repeat(2, 1fr)' }}>
            <Form.Item label={t('meeting.meetingTopic', { defaultValue: '會議主題' })} name="title" rules={[
              { required: true, message: t('meeting.pleaseEnterTheMeeting', { defaultValue: '請填寫會議主題' }) },
              { max: 200, message: t('meeting.max200Characters', { defaultValue: '最長 200 字' }) },
            ]}>
              <Input placeholder={t('meeting.eGQ4Requirement', { defaultValue: '如 Q4 需求評審' })} maxLength={200} allowClear />
            </Form.Item>
            <Form.Item label={t('meeting.meetingType', { defaultValue: '會議類型' })} name="bizType">
              <Select options={Object.entries(bizTypeLabels()).map(([value, label]) => ({ value, label }))} />
            </Form.Item>
          </div>
          <Form.Item label={t('meeting.onlineMeetingLink', { defaultValue: '線上會議鏈接' })} name="onlineMeetingUrl" rules={[{ max: 500, message: t('meeting.max500Characters', { defaultValue: '最長 500 字' }) }]}>
            <Input placeholder="https://..." allowClear maxLength={500} />
          </Form.Item>
          {/* 议程独占一整行（§C.4.1 备注类长文本同款处理） */}
          <Form.Item label={t('meeting.agenda', { defaultValue: '會議議程' })} name="description" rules={[{ max: 1000, message: t('meeting.max1000Characters', { defaultValue: '最長 1000 字' }) }]}>
            <RemarkTextArea rows={4} maxLength={1000} placeholder={t('meeting.optionalTopicsAndMaterials', { defaultValue: '選填：議題、需要提前準備的材料' })} />
          </Form.Item>
        </div>
      </Form>

      {/* 规则说明：把"免审批先到先得"这类容易被追问的口径写在页面上，而不是等用户踩到再解释 */}
      <div style={{ ...cardStyle, background: '#FAFAFA', border: '1px solid #f0f0f0', boxShadow: 'none' }}>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#8C8C8C', lineHeight: 1.9 }}>
          <li>{t('meeting.noApprovalNeededSubmitting', { defaultValue: '免審批先到先得：提交即佔用時段，行政不再二次審核。' })}</li>
          <li>{t('meeting.invitationsAreSentVia', { defaultValue: '邀約經釘釘工作通知發給必參與會人與選參與會人；未綁定釘釘的人會在會議詳情頁列明。' })}</li>
          <li>{t('meeting.reschedulingIsNotAllowed', { defaultValue: '會議開始後不可改期，需取消後重新預約；開啟簽到保留的房間，超時未簽到將被自動釋放。' })}</li>
        </ul>
      </div>

      {/* 底部操作栏（§C.5） */}
      <div className="form-footer">
        <Button onClick={goBack}>{t('meeting.cancel', { defaultValue: '取消' })}</Button>
        <Button type="primary" icon={<SendOutlined />} loading={submitting} disabled={!room}
          onClick={() => void handleSubmit()}>{t('meeting.submitBooking', { defaultValue: '提交預約' })}</Button>
      </div>

      {/* 周期会议被跳过的场次：纯展示型提示（§9.1 允许 Modal），逐条列明原因而不是只给一句 toast */}
      <Modal
        title={t('meeting.someOccurrencesWereSkipped', { defaultValue: '部分場次因時段衝突被跳過' })}
        open={skippedOpen}
        onCancel={() => { setSkippedOpen(false); goBack() }}
        onOk={() => { setSkippedOpen(false); goBack() }}
        okText={t('meeting.gotIt', { defaultValue: '知道了' })}
        cancelButtonProps={{ style: { display: 'none' } }}
      >
        <Table<SkippedItem>
          size="small"
          rowKey="seq"
          dataSource={skipped}
          pagination={false}
          scroll={{ y: 240 }}
          columns={[
            { title: t('meeting.occurrence', { defaultValue: '場次' }), dataIndex: 'seq', key: 'seq', width: 60 },
            { title: t('meeting.time', { defaultValue: '時間' }), key: 'time', render: (_, row) => `${row.startTime.slice(5, 16)} ~ ${row.endTime.slice(11, 16)}` },
            { title: t('meeting.reason', { defaultValue: '原因' }), dataIndex: 'reason', key: 'reason' },
          ]}
        />
        <p style={{ marginTop: 8, fontSize: 12, color: '#8C8C8C' }}>
          {t('meeting.skippedNoOccupancyNote', { defaultValue: '跳過的場次不會佔用房間：如需那幾天的時段，請改選其他時間或與其他組織者協調。' })}
        </p>
      </Modal>
    </div>
  )
}
