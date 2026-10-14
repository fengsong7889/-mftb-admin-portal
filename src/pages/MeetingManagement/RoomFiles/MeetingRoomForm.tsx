/**
 * 会议室新增/编辑（独立页面，路由 /meeting-room-form?id=）。
 *
 * <p>为什么是独立页面而不是弹窗（§9.1）：这张表单有 17 个字段、分四组语义，
 * 弹窗里只能滚动查看，既看不清"改的是哪一组"，也无法把 URL 分享给同事直接定位到某间房；
 * 独立页面还顺带解决了刷新丢数据（按 id 回查接口，而不是靠父组件传对象）。
 *
 * <p>关键取舍：
 *   1. 可预约窗与时长上下限**允许留空**，留空=沿用全局默认，页面用文案显式说明来源，
 *      否则行政看到数字却无法判断该改房间还是改全局规则；
 *   2. 房间管理员用员工选择器而不是自由输入：那是"谁能代这间房操作"的授权对象，写错等于授错人；
 *   3. 时间的起止倒挂、上下限倒挂在前端就拦下（后端同样各有一道，那是安全边界）。
 */
import { useCallback, useEffect, useState } from 'react'
import { Button, Form, Input, InputNumber, Select, Spin, Switch, TimePicker, message } from 'antd'
import type { CSSProperties } from 'react'
import {
  ArrowLeftOutlined, ClockCircleOutlined, EnvironmentOutlined, HomeOutlined,
  SaveOutlined, TeamOutlined,
} from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../../contexts/AuthContext'
import RemarkTextArea from '../../../components/RemarkTextArea'
import {
  createMeetingRoom, fetchMeetingRoomDetail, updateMeetingRoom,
  type MeetingRoomForm as MeetingRoomPayload, type MeetingRoomVO,
} from '../../../api/meeting'
import { FACILITY_OPTIONS } from '../meetingMeta'
import EmployeeSelect from '../EmployeeSelect'

const MENU = 'meeting-room'

/**
 * 表单内部结构：时间列存 dayjs（TimePicker 的要求），提交时统一转 'HH:mm' 字串。
 * 直接在 onChange 里回写字串会与 Form.Item 自己的写入相互覆盖，两边顺序一变就错。
 */
type FormShape = Omit<MeetingRoomPayload, 'bookableStartTime' | 'bookableEndTime'> & {
  bookableStartTime?: Dayjs | string | null
  bookableEndTime?: Dayjs | string | null
}

/** dayjs 或已是 'HH:mm' 字串（编辑回填）→ 'HH:mm' */
function hourMinute(value: Dayjs | string | null | undefined): string | undefined {
  if (!value) return undefined
  return dayjs.isDayjs(value) ? value.format('HH:mm') : value
}

/** 表单页模块卡片（§C.3）：白底 + 8px 圆角 + 图标色块标题行 */
const cardStyle: CSSProperties = {
  border: '1px solid #e8eaed', borderRadius: 8, background: '#fff',
  padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
}

/** 三列字段网格（§C.4）：vertical 布局下不给 Form.Item 设 labelCol，否则撑出大片空白 */
const gridStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }

function CardTitle({ icon, bg, color, title, note }: {
  icon: React.ReactNode; bg: string; color: string; title: string; note?: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
      <div style={{
        width: 28, height: 28, borderRadius: 6, background: bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontSize: 14, color }}>{icon}</span>
      </div>
      <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{title}</span>
      <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
      {note && <span style={{ fontSize: 12, color: '#8c8c8c' }}>{note}</span>}
    </div>
  )
}

export default function MeetingRoomForm() {
  const navigate = useNavigate()
  const location = useLocation()
  const { hasPermission } = useAuth()
  const canEdit = hasPermission(`${MENU}:edit`) || hasPermission(`${MENU}:create`)
  const [searchParams] = useSearchParams()

  const idParam = searchParams.get('id')
  const editId = idParam ? Number(idParam) : undefined
  const isEdit = editId != null && !Number.isNaN(editId)

  const [form] = Form.useForm<FormShape>()
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(isEdit)
  const [record, setRecord] = useState<MeetingRoomVO>()
  const [loadError, setLoadError] = useState<string>()

  const handleBack = useCallback(() => {
    navigate('/meeting-room', { replace: true, state: { closeMenuTab: location.pathname + location.search } })
  }, [navigate, location.pathname, location.search])

  /** 编辑模式按 id 回查：靠父页面传对象的话，刷新或直接粘贴 URL 进来就是一片空白表单 */
  useEffect(() => {
    if (!isEdit || editId == null) {
      form.setFieldsValue({ status: 'active', bookable: true, hideTitle: false, checkinRequired: false, capacity: 8 })
      return
    }
    let alive = true
    setLoading(true)
    setLoadError(undefined)
    fetchMeetingRoomDetail(editId)
      .then((data) => {
        if (!alive) return
        setRecord(data)
        form.setFieldsValue({
          roomNo: data.roomNo,
          roomName: data.roomName,
          campus: data.campus ?? undefined,
          building: data.building ?? undefined,
          floorCode: data.floorCode ?? undefined,
          locationDesc: data.locationDesc ?? undefined,
          capacity: data.capacity,
          facilities: data.facilities,
          photoUrls: data.photoUrls,
          status: data.status,
          bookable: data.bookable,
          bookableStartTime: data.bookableStartTime ? dayjs(data.bookableStartTime, 'HH:mm') : undefined,
          bookableEndTime: data.bookableEndTime ? dayjs(data.bookableEndTime, 'HH:mm') : undefined,
          minDuration: data.minDuration ?? undefined,
          maxDuration: data.maxDuration ?? undefined,
          checkinRequired: data.checkinRequired,
          releaseAfterMinutes: data.releaseAfterMinutes ?? undefined,
          hideTitle: data.hideTitle,
          adminUserIds: data.adminUserIds,
          remark: data.remark ?? undefined,
        })
      })
      .catch((e: unknown) => { if (alive) setLoadError(e instanceof Error ? e.message : '加載失敗') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [isEdit, editId, form])

  const handleSubmit = async () => {
    // 前端只控交互，写入权限与规则自洽仍由后端校验
    if (!canEdit || submitting) return
    let raw: FormShape
    try {
      raw = await form.validateFields()
    } catch {
      return // antd 已在字段下方标出原因
    }
    const values: MeetingRoomPayload = {
      ...raw,
      bookableStartTime: hourMinute(raw.bookableStartTime) ?? null,
      bookableEndTime: hourMinute(raw.bookableEndTime) ?? null,
      expectVersion: record?.version,
    }
    // 跨字段自洽性：这类错误 antd 的单字段规则表达不了，统一在校验后提示第一条
    const errors: string[] = []
    const start = values.bookableStartTime
    const end = values.bookableEndTime
    if ((start && !end) || (!start && end)) errors.push('每日可預約起止時間需一起填寫或一起清空')
    if (start && end && start >= end) errors.push('每日可預約結束時間必須晚於開始時間')
    if (values.minDuration != null && values.maxDuration != null && values.maxDuration < values.minDuration) {
      errors.push('單場最長時長不得小於最短時長')
    }
    if (values.checkinRequired && values.releaseAfterMinutes != null && values.releaseAfterMinutes < 1) {
      errors.push('未簽到釋放分鐘必須大於 0')
    }
    if (errors.length > 0) {
      message.warning(errors[0])
      return
    }
    setSubmitting(true)
    try {
      if (isEdit && editId != null) {
        await updateMeetingRoom(editId, values)
        message.success('會議室檔案已保存')
      } else {
        await createMeetingRoom(values)
        message.success('會議室已創建')
      }
      // 仅保存成功时关闭当前表单页签；失败留在原页，用户改完再提交
      navigate('/meeting-room', {
        replace: true,
        state: { closeMenuTab: location.pathname + location.search },
      })
    } catch (e) {
      // 编号撞车/并发修改的原因已由 request.ts 统一提示，这里只留日志，避免双弹
      if (e instanceof Error && e.message) console.warn('保存會議室失敗', e.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="content-area" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" tip="載入會議室檔案..." />
      </div>
    )
  }

  return (
    <div className="content-area">
      {/* 页面头部：橙色渐变顶条 + 返回 + 标题（§C.2，头部不放保存按钮） */}
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
            <Button type="primary" icon={<ArrowLeftOutlined />} onClick={handleBack}
              style={{
                backgroundColor: '#E8720C', borderColor: '#E8720C', borderRadius: 8, height: 36,
                padding: '0 16px', display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
              }}>返回</Button>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>
              {isEdit ? '編輯會議室' : '新增會議室'}
            </h2>
          </div>
          {isEdit && record && (
            <span style={{ fontSize: 12, color: '#8C8C8C' }}>
              {record.roomNo} · 最後更新 {record.updatedAt ?? '-'}／{record.updatedBy ?? '-'}
            </span>
          )}
        </div>
      </div>

      {loadError && (
        <div style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 8, background: '#FFF1F0', border: '1px solid #FFCCC7', color: '#CF1322', fontSize: 13 }}>
          會議室檔案加載失敗：{loadError}
        </div>
      )}

      <Form form={form} layout="vertical" requiredMark="optional" disabled={!canEdit || submitting}>
        {/* 一、基本信息 */}
        <div style={cardStyle}>
          <CardTitle icon={<HomeOutlined />} bg="#e6f7ff" color="#1890ff" title="基本信息" />
          <div style={gridStyle}>
            <Form.Item label="會議室編號" name="roomNo"
              rules={[{ required: true, message: '請填寫編號' }, { max: 32, message: '編號不得超過 32 字' }]}
              extra={isEdit ? '編號為業務主鍵，不可修改' : '如 MR-1F-01'}>
              <Input placeholder="如 MR-1F-01" allowClear maxLength={32} disabled={isEdit || !canEdit || submitting} />
            </Form.Item>
            <Form.Item label="會議室名稱" name="roomName"
              rules={[{ required: true, message: '請填寫名稱' }, { max: 64, message: '名稱不得超過 64 字' }]}>
              <Input placeholder="如 大會議室" allowClear maxLength={64} />
            </Form.Item>
            <Form.Item label="容納人數" name="capacity" rules={[{ required: true, message: '請填寫容納人數' }]}>
              <InputNumber min={1} max={500} style={{ width: '100%' }} addonAfter="人" />
            </Form.Item>
            <Form.Item label="狀態" name="status" extra="維護中不接受新預約">
              <Select options={[
                { value: 'active', label: '使用中' },
                { value: 'maintenance', label: '維護中' },
                { value: 'disabled', label: '已停用' },
              ]} />
            </Form.Item>
            <Form.Item label="接受預約" name="bookable" valuePropName="checked"
              extra="關閉後不再出現在可訂列表">
              <Switch checkedChildren="接受" unCheckedChildren="不接受" />
            </Form.Item>
            <Form.Item label="忙閒視圖脫敏主題" name="hideTitle" valuePropName="checked"
              extra="開啟後他人只看到「已佔用」">
              <Switch checkedChildren="脫敏" unCheckedChildren="公開" />
            </Form.Item>
          </div>
        </div>

        {/* 二、位置与设备 */}
        <div style={cardStyle}>
          <CardTitle icon={<EnvironmentOutlined />} bg="#e6f7ff" color="#1890ff" title="位置與設備"
            note="位置用於預約頁篩選與門口指引" />
          <div style={gridStyle}>
            <Form.Item label="園區" name="campus" rules={[{ max: 64, message: '園區不得超過 64 字' }]}>
              <Input placeholder="如 總部" allowClear maxLength={64} />
            </Form.Item>
            <Form.Item label="樓棟" name="building" rules={[{ max: 64, message: '樓棟不得超過 64 字' }]}>
              <Input placeholder="如 1 棟" allowClear maxLength={64} />
            </Form.Item>
            <Form.Item label="樓層" name="floorCode" rules={[{ max: 32, message: '樓層不得超過 32 字' }]}>
              <Input placeholder="如 1F" allowClear maxLength={32} />
            </Form.Item>
          </div>
          <Form.Item label="位置描述" name="locationDesc" rules={[{ max: 200, message: '位置描述不得超過 200 字' }]}>
            <Input placeholder="如 電梯左側／2 樓走廊盡頭" allowClear maxLength={200} />
          </Form.Item>
          <div style={{ ...gridStyle, gridTemplateColumns: 'repeat(2, 1fr)' }}>
            <Form.Item label="設備" name="facilities" extra="多選；忙閒視圖與篩選按設備精確匹配">
              <Select mode="multiple" allowClear placeholder="選擇設備" options={FACILITY_OPTIONS} />
            </Form.Item>
            <Form.Item label="照片鏈接" name="photoUrls" extra="粘貼圖片地址後回車，可多條">
              <Select mode="tags" allowClear placeholder="粘貼圖片地址後回車" open={false} tokenSeparators={[',', '\n']} />
            </Form.Item>
          </div>
        </div>

        {/* 三、预约规则（留空=沿用全局默认） */}
        <div style={cardStyle}>
          <CardTitle icon={<ClockCircleOutlined />} bg="#fff7e6" color="#fa8c16" title="預約規則"
            note={record?.windowConfigured === false ? '目前全部沿用全局默認' : '留空即沿用全局默認'} />
          <div style={gridStyle}>
            <Form.Item label="每日可預約開始" name="bookableStartTime" extra="留空＝全局 08:00">
              <TimePicker format="HH:mm" minuteStep={15 as const} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="每日可預約結束" name="bookableEndTime" extra="留空＝全局 22:00">
              <TimePicker format="HH:mm" minuteStep={15 as const} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="單場最短時長" name="minDuration" rules={[{ type: 'integer', min: 1, message: '最短時長需為正整數' }]}
              extra="留空＝按 15 分鐘粒度">
              <InputNumber min={1} max={1440} style={{ width: '100%' }} addonAfter="分鐘" />
            </Form.Item>
            <Form.Item label="單場最長時長" name="maxDuration" rules={[{ type: 'integer', min: 1, message: '最長時長需為正整數' }]}
              extra="留空＝全局 240 分鐘">
              <InputNumber min={1} max={1440} style={{ width: '100%' }} addonAfter="分鐘" />
            </Form.Item>
            <Form.Item label="需簽到保留" name="checkinRequired" valuePropName="checked"
              extra="開啟後超時未簽到自動釋放">
              <Switch checkedChildren="需要" unCheckedChildren="不需要" />
            </Form.Item>
            <Form.Item label="未簽到釋放分鐘" name="releaseAfterMinutes"
              rules={[{ type: 'integer', min: 1, message: '釋放分鐘需為正整數' }]} extra="留空＝默認 15 分鐘">
              <InputNumber min={1} max={240} style={{ width: '100%' }} addonAfter="分鐘" placeholder="默認 15" />
            </Form.Item>
          </div>
        </div>

        {/* 四、房间管理员与备注 */}
        <div style={cardStyle}>
          <CardTitle icon={<TeamOutlined />} bg="#f9f0ff" color="#722ed1" title="管理員與備註" />
          <Form.Item label="房間管理員" name="adminUserIds"
            extra="可代這間房處理現場問題的人（行政代訂讀取此列）">
            <EmployeeSelect />
          </Form.Item>
          {/* 备注独占一整行（§C.4.1）：与其它字段并排时列宽变窄，三行装不下 200 字 */}
          <Form.Item label="備註" name="remark" rules={[{ max: 200, message: '備註不得超過 200 字' }]}>
            <RemarkTextArea placeholder="如 需行政開門、設備報修聯絡人" maxLength={200} />
          </Form.Item>
        </div>
      </Form>

      {/* 底部操作栏（§C.5）：详情页/无权限时隐藏 */}
      {canEdit && (
        <div className="form-footer">
          <Button onClick={handleBack}>取消</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={submitting} onClick={() => void handleSubmit()}>保存</Button>
        </div>
      )}
    </div>
  )
}
