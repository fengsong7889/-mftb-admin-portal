/**
 * 会议室预约（会议管理「會議室預約」）
 *
 * 左侧/上方筛选 + 一日忙闲矩阵 + 新建预约。对标飞书会议室的"日历选房"体验：
 * 先看见谁占着哪一段，再决定订哪里 —— 而不是提交后才知道冲突。
 *
 * 三条界面口径：
 *   1. 统计卡片在搜索区下方，且数字来自当前筛选结果（房间数/占用场次/完全空闲房）；
 *      新建预约走独立页面 /meeting-booking-form（§9.1 禁止用弹窗承载表单），
 *      本页只负责"看忙闲 + 选时段"，选好即带 roomId/date/start 跳过去；
 *   2. hide_title=1 的房间后端已脱敏，前端只渲染返回值，绝不自行"猜"主题；
 *   3. 提交前的冲突预检只是少一次往返，真正的防护在服务端（锁房间行 + 锁内当前读）。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, DatePicker, Empty, Form, InputNumber, Select, Space, Spin, Tag, message } from 'antd'
import { CheckCircleOutlined, EnvironmentOutlined, GlobalOutlined, HomeOutlined, PushpinOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import { useNavigate } from 'react-router-dom'
import {
  fetchCities,
  fetchRoomAvailability,
  toMeetingIso,
  type RoomAvailability,
} from '@/api/meeting'
import { facilityLabels, facilityOptions } from '../meetingMeta'
import { minuteOfDateTimeText, toMinutesOfDay } from '../meetingRules'
import MeetingStatCards from '../MeetingStatCards'
import { useTranslation } from 'react-i18next'

const WINDOW_FALLBACK_START = 480   // 08:00
const WINDOW_FALLBACK_END = 1320    // 22:00

export default function RoomBooking() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [form] = Form.useForm()
  const [day, setDay] = useState<Dayjs>(dayjs())
  const [rooms, setRooms] = useState<RoomAvailability[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const [cities, setCities] = useState<string[]>([])

  /** 当前查询条件快照：统计卡片口径与重载依据 */
  const [criteria, setCriteria] = useState<{ city?: string; minCapacity?: number; facilities?: string[] }>({})

  const load = useCallback(async () => {
    setLoading(true)
    setError(undefined)
    try {
      const from = day.startOf('day')
      const to = day.endOf('day')
      const list = await fetchRoomAvailability({
        from: toMeetingIso(from) ?? from.format('YYYY-MM-DDTHH:mm:ss'),
        to: toMeetingIso(to) ?? to.format('YYYY-MM-DDTHH:mm:ss'),
        city: criteria.city,
        minCapacity: criteria.minCapacity,
        facilities: criteria.facilities?.length ? criteria.facilities : undefined,
      })
      setRooms(Array.isArray(list) ? list : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : t('meeting.failedToLoadBusy', { defaultValue: '忙閒數據加載失敗' }))
      setRooms([])
    } finally {
      setLoading(false)
    }
  }, [day, criteria])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    void fetchCities().then(setCities).catch(() => setCities([]))
  }, [])

  const handleSearch = () => {
    const values = form.getFieldsValue()
    setCriteria({
      city: values.city ?? undefined,
      minCapacity: values.minCapacity ?? undefined,
      facilities: values.facilities?.length ? values.facilities : undefined,
    })
  }

  const occupiedCount = useMemo(
    () => rooms.reduce((sum, room) => sum + room.slots.length, 0),
    [rooms],
  )
  const freeCount = useMemo(() => rooms.filter(room => room.slots.length === 0).length, [rooms])
  const statsKey = useMemo(() => `${day.format('YYYY-MM-DD')}-${JSON.stringify(criteria)}`, [day, criteria])

  /** 带着房间与点击到的时段跳到独立表单页：URL 可分享，刷新也不会丢上下文 */
  const openBooking = (room: RoomAvailability, start?: Dayjs) => {
    if (!room.bookable) {
      message.warning(t('meeting.thisMeetingRoomCurrently', { defaultValue: '該會議室當前不可預約，請改選其他會議室' }))
      return
    }
    const params = new URLSearchParams({ roomId: String(room.roomId), date: day.format('YYYY-MM-DD') })
    if (start) params.set('start', start.format('HH:mm'))
    navigate(`/meeting-booking-form?${params.toString()}`)
  }

  return (
    <div className="content-area">
      {error && (
        <Alert
          type="error"
          showIcon
          message={t('meeting.failedToLoadBusy', { defaultValue: '忙閒數據加載失敗' })}
          description={error}
          style={{ marginBottom: 16 }}
          action={<Button size="small" icon={<ReloadOutlined />} onClick={() => void load()}>{t('meeting.retry', { defaultValue: '重試' })}</Button>}
        />
      )}

      <div className="search-section">
        <Form form={form} layout="inline">
          <Form.Item label={t('meeting.date', { defaultValue: '查詢日期' })}>
            <DatePicker
              value={day}
              allowClear={false}
              disabledDate={current => current && current < dayjs().startOf('day')}
              onChange={value => value && setDay(value)}
            />
          </Form.Item>
          {/* 城市筛选放最前：跨城办公先锁城市再选房，避免看错栋 */}
          <Form.Item label={t('meeting.city', { defaultValue: '城市' })} name="city">
            <Select placeholder={t('meeting.all', { defaultValue: '全部' })} allowClear style={{ width: '100%' }}
              options={cities.map(c => ({ value: c, label: c }))} />
          </Form.Item>
          <Form.Item label={t('meeting.minimumCapacity', { defaultValue: '最少人數' })} name="minCapacity">
            {/* §E.1：搜索区控件一律 100% 宽末端对齐，不写死像素宽（参考 RoomFiles 同名字段） */}
            <InputNumber min={1} placeholder={t('meeting.any', { defaultValue: '不限' })} style={{ width: '100%' }} addonAfter={t('meeting.people', { defaultValue: '人' })} />
          </Form.Item>
          <Form.Item label={t('meeting.facilities', { defaultValue: '設備' })} name="facilities">
            <Select mode="multiple" allowClear placeholder={t('meeting.all', { defaultValue: '全部' })} style={{ width: '100%' }} options={facilityOptions()} />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>{t('meeting.search', { defaultValue: '查詢' })}</Button>
              <Button icon={<ReloadOutlined />} onClick={() => { form.resetFields(); setCriteria({}) }}>{t('meeting.reset', { defaultValue: '重置' })}</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      <MeetingStatCards key={statsKey} loading={loading} items={[
        { icon: <HomeOutlined />, color: '#1890FF', bg: '#E6F7FF', value: rooms.length, label: t('meeting.matchingMeetingRooms', { defaultValue: '符合條件的會議室' }), hint: t('meeting.followsDateAndFilters', { defaultValue: '隨日期與篩選條件變化' }) },
        { icon: <PushpinOutlined />, color: '#E8720C', bg: '#FFF7E6', value: occupiedCount, label: t('meeting.occupiedSlotsThatDay', { defaultValue: '當日已佔用時段' }) },
        { icon: <CheckCircleOutlined />, color: '#52C41A', bg: '#F6FFED', value: freeCount, label: t('meeting.freeAllDay', { defaultValue: '當日完全空閒' }) },
      ]} />

      <div className="action-section">
        <div className="action-section-left">
          <span style={{ fontSize: 13, color: '#262626', fontWeight: 500 }}>
            {t('meeting.busyIdleMatrix', { date: day.format('YYYY-MM-DD'), defaultValue: `${day.format('YYYY-MM-DD')} 忙閒矩陣` })}
          </span>
        </div>
        <div className="action-section-right" />
      </div>

      <Spin spinning={loading}>
        {rooms.length === 0 && !loading ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('meeting.noRoomMatchesThe', { defaultValue: '沒有符合條件的會議室' })} style={{ padding: '48px 0' }} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {rooms.map(room => (
              <RoomRow key={room.roomId} room={room} onPick={start => openBooking(room, start)} />
            ))}
          </div>
        )}
      </Spin>

    </div>
  )
}

/** 单间房的忙闲行：可预约窗内的占用段按比例画在时间轴上，点击空白段直接带出开始时间 */
function RoomRow({ room, onPick }: { room: RoomAvailability; onPick: (start?: Dayjs) => void }) {
  const { t } = useTranslation()
  const windowStart = toMinutesOfDay(room.bookableStartTime) || WINDOW_FALLBACK_START
  const windowEnd = toMinutesOfDay(room.bookableEndTime) || WINDOW_FALLBACK_END
  const span = Math.max(1, windowEnd - windowStart)
  const dayDate = room.slots[0]?.startTime?.slice(0, 10)

  const pickFromClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    const ratio = (event.clientX - box.left) / box.width
    const total = windowStart + Math.round(ratio * span / 15) * 15
    // 吸附到 15 分钟刻度，与后端粒度校验一致；超出可预约窗右端的点击忽略
    if (total >= windowEnd) return
    const date = dayDate || dayjs().format('YYYY-MM-DD')
    onPick(dayjs(`${date} ${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`))
  }

  return (
    <div style={{ border: '1px solid #F0F0F0', borderRadius: 8, padding: '12px 16px', background: '#FAFAFA' }}>
      <Space size={8} wrap style={{ marginBottom: 8 }}>
        <span style={{ fontWeight: 600 }}>{room.roomName}</span>
        <span style={{ color: '#8C8C8C', fontSize: 12 }}>{room.roomNo}</span>
        {/* 城市单独蓝色徽章：跨城办公第一眼先确认城市，再往下看位置 */}
        {room.city && <Tag color="blue" icon={<GlobalOutlined />}>{room.city}</Tag>}
        {/* 位置醒目徽章：跨城市/大厦的会议室名往往雷同（如都叫“會議室 A”），订错多半栽在位置不够显眼 */}
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '1px 10px', borderRadius: 6, fontSize: 13, fontWeight: 600,
          color: '#E8720C', background: '#FFF7F0', border: '1px solid #FFE7D1',
        }}>
          <EnvironmentOutlined style={{ fontSize: 13 }} />
          {room.locationText}
        </span>
        <Tag>{t('meeting.headcount', { count: room.capacity, defaultValue: '{{count}} 人' })}</Tag>
        {room.facilities.map(code => <Tag key={code} color="blue">{facilityLabels()[code] ?? code}</Tag>)}
        {!room.bookable && <Tag color="orange">{t('meeting.notBookable', { defaultValue: '暫不可約' })}</Tag>}
        <span style={{ color: '#8C8C8C', fontSize: 12 }}>
          {t('meeting.bookableWindowRange', {
            start: room.bookableStartTime, end: room.bookableEndTime,
            defaultValue: `可預約 ${room.bookableStartTime}–${room.bookableEndTime}`,
          })}
        </span>
        <Button
          size="small"
          type="primary"
          disabled={!room.bookable}
          onClick={() => onPick(undefined)}
        >{t('meeting.book', { defaultValue: '預約' })}</Button>
      </Space>

      <div
        onClick={room.bookable ? pickFromClick : undefined}
        style={{
          position: 'relative',
          height: 46,
          borderRadius: 6,
          background: '#FFFFFF',
          border: '1px solid #E8E8E8',
          cursor: room.bookable ? 'pointer' : 'default',
          overflow: 'hidden',
        }}
      >
        {room.slots.map(slot => {
          const start = minuteOfDateTimeText(slot.startTime)
          const end = minuteOfDateTimeText(slot.endTime)
          if (Number.isNaN(start) || Number.isNaN(end)) return null
          const left = Math.max(0, ((start - windowStart) / span) * 100)
          const width = Math.max(0.6, ((end - start) / span) * 100)
          return (
            <div
              key={slot.bookingNo ?? `${slot.startTime}-${slot.endTime}`}
              title={`${slot.title}${slot.organizerName ? `（${slot.organizerName}）` : ''} ${slot.startTime.slice(11, 16)}–${slot.endTime.slice(11, 16)}`}
              style={{
                position: 'absolute',
                left: `${left}%`,
                width: `${width}%`,
                top: 0,
                bottom: 0,
                background: '#FFF7E6',
                borderLeft: '1px solid #FA8C16',
                borderRight: '1px solid #FA8C16',
                padding: '5px 6px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                overflow: 'hidden',
              }}
            >
              {/* 两行展示：主题 + 起止时间，窄段靠省略号收尾，悬浮 title 看全量信息 */}
              <div style={{ fontSize: 11, fontWeight: 500, color: '#E8720C', lineHeight: '18px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {slot.title}
              </div>
              <div style={{ fontSize: 10, color: '#FA8C16', lineHeight: '14px', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                {slot.startTime.slice(11, 16)}–{slot.endTime.slice(11, 16)}
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#BFBFBF', marginTop: 4 }}>
        <span>{room.bookableStartTime}</span>
        <span>{room.slots.length === 0
          ? t('meeting.freeAllDay2', { defaultValue: '全天空閒' })
          : t('meeting.occupiedSegments', { count: room.slots.length, defaultValue: `已佔 ${room.slots.length} 段` })}</span>
        <span>{room.bookableEndTime}</span>
      </div>
    </div>
  )
}
