/**
 * 预约规则与黑名单（会议管理 → 會議治理 → 預約規則）
 *
 * 两个 Tab 共用一页的理由：它们都是"行政治理会议预约"的开关，
 * 拆两页会让改规则的人还要另外记住黑名单在哪；但两者的授权动作与写入路径完全独立。
 *
 * 四条界面口径：
 *   1. 规则改动必须填变更原因并二次确认——它影响全站所有人的预约结果，
 *      改完页面还能看到旧数字而不留原因，事后无法解释；
 *   2. 黑名单统计卡在筛选区下方且跟随筛选条件（AGENTS.md §E.8）；
 *   3. 「已到期」与「已撤銷」分开展示：一个是时间到了自动释放，一个是行政主动放人，
 *      合并成一个状态就看不出当前治理力度；
 *   4. 新增黑名单走独立页面（§9.1 禁止用弹窗承载表单）；撤销属于二次确认，用 Modal.confirm。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  Alert, Button, Form, Input, InputNumber, Modal, Select, Space, Spin, Table, Tabs, Tag, TimePicker, message,
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  BellOutlined, CheckCircleOutlined, ClockCircleOutlined, FolderOpenOutlined,
  PlusOutlined, ReloadOutlined, SearchOutlined, StopOutlined, ThunderboltOutlined,
} from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../../contexts/AuthContext'
import { useColumnConfig } from '../../../hooks/useColumnConfig'
import {
  fetchBlacklist,
  fetchMeetingRules,
  revokeBlacklist,
  saveMeetingRules,
  type BlacklistItem,
  type BlacklistQuery,
  type BlacklistStats,
  type MeetingRuleForm,
} from '../../../api/meeting'
import MeetingStatCards from '../MeetingStatCards'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'

const MENU = 'meeting-config'

const EMPTY_STATS: BlacklistStats = { total: 0, effective: 0, expired: 0, revoked: 0 }

const DISPLAY_STATE = (t: TFunction): Record<string, { label: string; color: string }> => ({
  effective: { label: t('meeting.effective', { defaultValue: '生效中' }), color: 'red' },
  expired: { label: t('meeting.expired', { defaultValue: '已到期' }), color: 'default' },
  revoked: { label: t('meeting.revoked', { defaultValue: '已撤銷' }), color: 'green' },
})

const SOURCE_LABEL = (t: TFunction): Record<string, string> => ({ auto: t('meeting.automatic', { defaultValue: '系統自動' }), admin: t('meeting.manualByAdmin', { defaultValue: '行政手動' }) })

const STATUS_OPTIONS = (t: TFunction) => [
  { value: 'active', label: t('meeting.effective', { defaultValue: '生效中' }) },
  { value: 'expired', label: t('meeting.expired', { defaultValue: '已到期' }) },
  { value: 'revoked', label: t('meeting.revoked', { defaultValue: '已撤銷' }) },
]

/** 模块卡片（§C.3）：白底 + 8px 圆角 + 图标色块标题行，不用 antd Card 的彩色标题头 */
const cardStyle: CSSProperties = {
  border: '1px solid #e8eaed', borderRadius: 8, background: '#fff',
  padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
}

const gridStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }

function CardTitle({ icon, bg, color, title, note }: {
  icon: React.ReactNode; bg: string; color: string; title: string; note?: React.ReactNode
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

/** 黑名单列配置元数据（§E.3）：人员锁头、操作锁尾 */
const COLUMN_META = (t: TFunction) => [
  { key: 'name', title: t('meeting.person', { defaultValue: '人員' }) },
  { key: 'departmentName', title: t('meeting.department', { defaultValue: '部門' }) },
  { key: 'source', title: t('meeting.source', { defaultValue: '來源' }) },
  { key: 'noShowCount', title: t('meeting.noShowCount', { defaultValue: '爽約次數' }) },
  { key: 'reason', title: t('meeting.reason', { defaultValue: '原因' }) },
  { key: 'period', title: t('meeting.restrictedPeriod', { defaultValue: '限制期' }) },
  { key: 'displayState', title: t('meeting.status', { defaultValue: '狀態' }) },
  { key: 'revoke', title: t('meeting.revoke', { defaultValue: '撤銷' }) },
  { key: 'createdBy', title: t('meeting.recordedBy', { defaultValue: '登記人' }) },
  { key: 'action', title: t('meeting.actions', { defaultValue: '操作' }) },
]

export default function MeetingConfig() {
  const { t } = useTranslation()
  return (
    <div className="content-area">
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message={t('meeting.theseAreGlobalDefaults', { defaultValue: '這裡的規則是全域默認值：房間檔案留空時回落到這裡，房間自身配置過的欄位以房間為準' })}
        description={t('meeting.rulesAffectEveryoneS', { defaultValue: '修改規則會影響所有人的預約結果（含已有會議的改期判定），因此必須填寫變更原因並二次確認；變更會寫入審計。' })}
      />
      <Tabs
        defaultActiveKey="rules"
        items={[
          { key: 'rules', label: t('meeting.bookingRules', { defaultValue: '預約規則' }), children: <RulePanel /> },
          { key: 'blacklist', label: t('meeting.blacklist', { defaultValue: '黑名單' }), children: <BlacklistPanel /> },
        ]}
      />
    </div>
  )
}

/* ==================== 规则 Tab ==================== */

/**
 * Modal.confirm 里的"变更原因"不在外层 Form 内，用一个模块级引用承载。
 * 每次打开确认框前都会被重置，所以它等价于弹窗局部状态——
 * 比把原因塞回主表单更直白：主表单的字段是"规则本身"，混进原因会让 dirty 判定出错。
 */
const reasonRef: { value: string } = { value: '' }

function RulePanel() {
  const { t } = useTranslation()
  const { hasPermission } = useAuth()
  const canEdit = hasPermission(`${MENU}:edit`)
  const [form] = Form.useForm<MeetingRuleForm>()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const [missing, setMissing] = useState<string[]>([])
  const [updated, setUpdated] = useState<{ by?: string | null; at?: string | null }>({})

  const load = useCallback(async () => {
    setLoading(true)
    setError(undefined)
    try {
      const view = await fetchMeetingRules()
      const rule = view.rule
      form.setFieldsValue({ ...rule, bookableStart: dayjs(rule.bookableStart, 'HH:mm'),
        bookableEnd: dayjs(rule.bookableEnd, 'HH:mm') } as never)
      setMissing(view.missingKeys ?? [])
      setUpdated({ by: view.updatedBy, at: view.updatedAt })
    } catch (e) {
      setError(e instanceof Error ? e.message : t('meeting.failedToLoadRules', { defaultValue: '規則加載失敗' }))
    } finally {
      setLoading(false)
    }
  }, [form])

  useEffect(() => { void load() }, [load])

  const submit = async () => {
    let values: MeetingRuleForm
    try {
      values = await form.validateFields()
    } catch {
      return // antd 已在字段下方标出原因
    }
    const payload: MeetingRuleForm = {
      ...values,
      // TimePicker 存的是 dayjs，提交前定格式成 HH:mm：直接把 dayjs 对象发过去会变成 ISO 全时间串
      bookableStart: fmtTime(values.bookableStart as unknown as Dayjs),
      bookableEnd: fmtTime(values.bookableEnd as unknown as Dayjs),
    }
    if (payload.maxDuration < payload.minLeadMinutes) {
      message.warning(t('meeting.maximumDurationShouldNot', { defaultValue: '單場最長時長不應小於最少提前分鐘數' }))
      return
    }
    reasonRef.value = ''
    Modal.confirm({
      title: t('meeting.changeTheGlobalBooking', { defaultValue: '確認修改全局預約規則？' }),
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      okText: t('meeting.confirmSave', { defaultValue: '確認保存' }),
      cancelText: t('meeting.back', { defaultValue: '返回' }),
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row">
            <span>{t('meeting.bookableWindow', { defaultValue: '可預約窗：' })}</span>
            <b>{payload.bookableStart}–{payload.bookableEnd}</b>
          </div>
          <div className="confirm-info-row">
            <span>{t('meeting.leadTime', { defaultValue: '提前量：' })}</span>
            <b>最遠 {payload.advanceDays} 天／最少提前 {payload.minLeadMinutes} 分鐘</b>
          </div>
          <div className="confirm-info-row">
            <span>{t('meeting.duration', { defaultValue: '單場時長：' })}</span>
            <b>默認 {payload.defaultDuration} 分鐘，最長 {payload.maxDuration} 分鐘，粒度 {payload.granularityMinutes} 分鐘</b>
          </div>
          <div className="confirm-info-row">
            <span>{t('meeting.checkInRelease', { defaultValue: '簽到與釋放：' })}</span>
            <b>可提前 {payload.checkinOpenMinutes} 分鐘簽到，未簽到 {payload.releaseAfterMinutes} 分鐘後釋放</b>
          </div>
          <div className="confirm-info-row">
            <span>{t('meeting.noShowControl', { defaultValue: '爽約治理：' })}</span>
            <b>近 30 天爽約 {payload.noShowThreshold} 次自動限制 {payload.blacklistDays} 天</b>
          </div>
          <div className="confirm-info-row"><span>{t('meeting.blastRadius', { defaultValue: '影響範圍：' })}</span><b>{t('meeting.everyoneIncludingRescheduleChecks', { defaultValue: '全站所有人（含已有會議的改期判定）' })}</b></div>
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 13, color: '#595959', marginBottom: 4 }}>{t('meeting.changeReasonRequired', { defaultValue: '變更原因（必填）' })}</div>
            <Input.TextArea
              rows={3}
              maxLength={200}
              showCount
              style={{ resize: 'none' }}
              placeholder={t('meeting.eGAdminMoved', { defaultValue: '例：行政統一將可預約窗延後至 23:00，配合夜班例會' })}
              onChange={e => { reasonRef.value = e.target.value }}
            />
          </div>
        </div>
      ),
      onOk: async () => {
        if (!reasonRef.value.trim()) {
          message.warning(t('meeting.pleaseEnterTheChange', { defaultValue: '請填寫變更原因' }))
          // 抛出以阻止弹窗关闭：全局规则不留原因就等于事后无法解释
          throw new Error('reason required')
        }
        setSaving(true)
        try {
          await saveMeetingRules({ ...payload, changeReason: reasonRef.value.trim() })
          message.success(t('meeting.bookingRulesSaved', { defaultValue: '預約規則已保存' }))
          reasonRef.value = ''
          await load()
        } finally {
          setSaving(false)
        }
      },
    })
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" tip={t('meeting.loadingBookingRules', { defaultValue: '載入預約規則...' })} />
      </div>
    )
  }

  return (
    <>
      {error && (
        <Alert
          type="error"
          showIcon
          message={t('meeting.failedToLoadRules', { defaultValue: '規則加載失敗' })}
          description={error}
          style={{ marginBottom: 16 }}
          action={<Button size="small" icon={<ReloadOutlined />} onClick={() => void load()}>{t('meeting.retry', { defaultValue: '重試' })}</Button>}
        />
      )}
      {missing.length > 0 && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={`${missing.length} 個規則尚未落庫，當前顯示的是代碼兜底值`}
          description={t('meeting.savingOnceWritesAll', { defaultValue: '保存一次即全部寫入 sys_config；之後再改只會更新已存在的值，啟動不會把管理員的調整打回默認值。' })}
        />
      )}

      <Form form={form} layout="vertical" disabled={!canEdit}>
        {/* 一、可预约窗口与时长 */}
        <div style={cardStyle}>
          <CardTitle icon={<ClockCircleOutlined />} bg="#e6f7ff" color="#1890ff" title={t('meeting.bookableWindowDuration', { defaultValue: '可預約窗與時長' })}
            note={t('meeting.roomsFallBackHere', { defaultValue: '房間檔案留空時回落到這裡' })} />
          <div style={gridStyle}>
            <Form.Item label={t('meeting.maximumAdvanceDays', { defaultValue: '最遠可預約天數' })} name="advanceDays" rules={[{ required: true, message: t('meeting.pleaseEnterTheNumber', { defaultValue: '請填寫天數' }) }]}
              extra={t('meeting.laterOccurrencesOfA', { defaultValue: '週期會議的後續場次不受此限制' })}>
              <InputNumber min={1} max={365} style={{ width: '100%' }} addonAfter={t('meeting.days', { defaultValue: '天' })} />
            </Form.Item>
            <Form.Item label={t('meeting.minimumLeadTime', { defaultValue: '最少提前分鐘數' })} name="minLeadMinutes" rules={[{ required: true, message: t('meeting.pleaseEnterTheMinutes', { defaultValue: '請填寫分鐘數' }) }]}
              extra={t('meeting.0AllowsBookingRight', { defaultValue: '0 表示允許即時預約' })}>
              <InputNumber min={0} max={1440} style={{ width: '100%' }} addonAfter={t('meeting.min', { defaultValue: '分鐘' })} />
            </Form.Item>
            <Form.Item label={t('meeting.timeGranularity', { defaultValue: '時間粒度' })} name="granularityMinutes" rules={[{ required: true, message: t('meeting.pleaseChooseTheGranularity', { defaultValue: '請選擇粒度' }) }]}
              extra={t('meeting.startTimeAndDuration', { defaultValue: '開始時間與時長都要對齊該刻度' })}>
              <Select options={[5, 10, 15, 20, 30, 60].map(v => ({ value: v, label: `${v} 分鐘` }))} />
            </Form.Item>
            <Form.Item label={t('meeting.dailyBookableStart', { defaultValue: '每日可預約開始' })} name="bookableStart" rules={[{ required: true, message: t('meeting.pleaseChooseTheStart', { defaultValue: '請選擇開始時間' }) }]}>
              <TimePicker format="HH:mm" minuteStep={5 as const} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label={t('meeting.bookableUntil', { defaultValue: '每日可預約結束' })} name="bookableEnd" rules={[{ required: true, message: t('meeting.pleaseChooseTheEnd', { defaultValue: '請選擇結束時間' }) }]}>
              <TimePicker format="HH:mm" minuteStep={5 as const} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label={t('meeting.defaultDuration', { defaultValue: '默認時長' })} name="defaultDuration" rules={[{ required: true, message: t('meeting.pleaseEnterTheDefault', { defaultValue: '請填寫默認時長' }) }]}>
              <InputNumber min={5} max={720} style={{ width: '100%' }} addonAfter={t('meeting.min', { defaultValue: '分鐘' })} />
            </Form.Item>
            <Form.Item label={t('meeting.maximumDuration', { defaultValue: '單場最長時長' })} name="maxDuration" rules={[{ required: true, message: t('meeting.pleaseEnterTheMaximum', { defaultValue: '請填寫最長時長' }) }]}>
              <InputNumber min={15} max={720} style={{ width: '100%' }} addonAfter={t('meeting.min', { defaultValue: '分鐘' })} />
            </Form.Item>
          </div>
        </div>

        {/* 二、提醒、签到与爽约治理 */}
        <div style={cardStyle}>
          <CardTitle icon={<BellOutlined />} bg="#fff7e6" color="#fa8c16" title={t('meeting.reminderCheckInAnd', { defaultValue: '提醒、簽到與爽約治理' })}
            note={t('meeting.eachMeetingIsReminded', { defaultValue: '同一場會只提醒一次' })} />
          <div style={gridStyle}>
            <Form.Item label={t('meeting.reminderBeforeStart', { defaultValue: '開始前提醒' })} name="remindMinutes" rules={[{ required: true, message: t('meeting.pleaseEnterTheReminder', { defaultValue: '請填寫提醒分鐘數' }) }]}
              extra={t('meeting.0DisablesTheReminder', { defaultValue: '0 表示不發提醒' })}>
              <InputNumber min={0} max={1440} style={{ width: '100%' }} addonAfter={t('meeting.min', { defaultValue: '分鐘' })} />
            </Form.Item>
            <Form.Item label={t('meeting.checkInOpensEarly', { defaultValue: '可提前簽到' })} name="checkinOpenMinutes" rules={[{ required: true, message: t('meeting.pleaseEnterTheMinutes', { defaultValue: '請填寫分鐘數' }) }]}>
              <InputNumber min={0} max={120} style={{ width: '100%' }} addonAfter={t('meeting.min', { defaultValue: '分鐘' })} />
            </Form.Item>
            <Form.Item label={t('meeting.autoReleaseOnNo', { defaultValue: '未簽到自動釋放' })} name="releaseAfterMinutes" rules={[{ required: true, message: t('meeting.pleaseEnterTheMinutes', { defaultValue: '請填寫分鐘數' }) }]}
              extra={t('meeting.appliesOnlyToRooms', { defaultValue: '僅對開了「需簽到保留」的房間生效' })}>
              <InputNumber min={1} max={240} style={{ width: '100%' }} addonAfter={t('meeting.min', { defaultValue: '分鐘' })} />
            </Form.Item>
            <Form.Item label={t('meeting.noShowThresholdFor', { defaultValue: '爽約自動拉黑閾值' })} name="noShowThreshold" rules={[{ required: true, message: t('meeting.pleaseEnterTheCount', { defaultValue: '請填寫次數' }) }]}
              extra={t('meeting.noShowsIn30', { defaultValue: '近 30 天爽約達該次數即暫停預約；0 表示只做人工黑名單' })}>
              <InputNumber min={0} max={30} style={{ width: '100%' }} addonAfter={t('meeting.times', { defaultValue: '次' })} />
            </Form.Item>
            <Form.Item label={t('meeting.autoRestrictionDays', { defaultValue: '自動限制天數' })} name="blacklistDays" rules={[{ required: true, message: t('meeting.pleaseEnterTheNumber', { defaultValue: '請填寫天數' }) }]}>
              <InputNumber min={1} max={365} style={{ width: '100%' }} addonAfter={t('meeting.days', { defaultValue: '天' })} />
            </Form.Item>
          </div>
        </div>
      </Form>

      {/* 最后更新（§D.4 同款灰底 footer）：规则被谁在什么时候改过，是事后追责的唯一线索 */}
      <div style={{
        background: '#fafafa', borderRadius: 8, padding: '12px 24px', marginBottom: 16,
        border: '1px solid #f0f0f0', display: 'flex', justifyContent: 'flex-end', gap: 24,
      }}>
        <span style={{ fontSize: 12, color: '#8C8C8C' }}>
          最後更新人：<span style={{ color: '#595959' }}>{updated.by ?? '—'}</span>
        </span>
        <span style={{ fontSize: 12, color: '#8C8C8C' }}>
          最後更新時間：<span style={{ color: '#595959' }}>{updated.at ?? '—'}</span>
        </span>
      </div>

      {/* 底部操作栏（§C.5）：保存统一放页面底部，不放卡片内 */}
      {canEdit && (
        <div className="form-footer">
          <Button onClick={() => void load()}>還原</Button>
          <Button type="primary" icon={<ThunderboltOutlined />} loading={saving} onClick={() => void submit()}>
            保存規則
          </Button>
        </div>
      )}
    </>
  )
}

function fmtTime(value: Dayjs | string | undefined | null): string {
  if (!value) return ''
  return dayjs.isDayjs(value) ? value.format('HH:mm') : String(value)
}

/* ==================== 黑名单 Tab ==================== */

function BlacklistPanel() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { hasPermission } = useAuth()
  const canEdit = hasPermission(`${MENU}:edit`)
  const [rows, setRows] = useState<BlacklistItem[]>([])
  const [stats, setStats] = useState<BlacklistStats>(EMPTY_STATS)
  const [total, setTotal] = useState(0)
  const [query, setQuery] = useState<BlacklistQuery>({ page: 1, size: 20 })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const [form] = Form.useForm()

  const { configComponent, applyConfig } = useColumnConfig('meeting-blacklist', COLUMN_META(t), [
    { key: 'name', visible: true, locked: 'head' },
    { key: 'action', visible: true, locked: 'tail' },
  ])

  const load = useCallback(async () => {
    setLoading(true)
    setError(undefined)
    try {
      const res = await fetchBlacklist(query)
      setRows(res.page?.records ?? [])
      setTotal(res.page?.total ?? 0)
      setStats(res.stats ?? EMPTY_STATS)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('meeting.failedToLoadThe', { defaultValue: '黑名單加載失敗' }))
    } finally {
      setLoading(false)
    }
  }, [query])

  useEffect(() => { void load() }, [load])
  const statsKey = useMemo(() => JSON.stringify(query), [query])

  const search = () => {
    const values = form.getFieldsValue()
    setQuery(q => ({
      ...q,
      keyword: (values.keyword ?? '').trim() || undefined,
      source: values.source ?? undefined,
      status: values.status ?? undefined,
      page: 1,
    }))
  }

  const reset = () => {
    form.resetFields()
    setQuery({ page: 1, size: query.size ?? 20 })
  }

  /** 撤销：保留记录行只翻状态，必填原因（删行等于毁掉处置凭据） */
  const handleRevoke = (row: BlacklistItem) => {
    let reason = ''
    Modal.confirm({
      title: `確認撤銷「${row.name}」的預約限制？`,
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      okText: t('meeting.confirmRevoke', { defaultValue: '確認撤銷' }),
      cancelText: t('meeting.back', { defaultValue: '返回' }),
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>{t('meeting.person2', { defaultValue: '人員：' })}</span><b>{row.name}{row.empNo ? `（${row.empNo}）` : ''}</b></div>
          <div className="confirm-info-row"><span>{t('meeting.department2', { defaultValue: '部門：' })}</span><b>{row.departmentName || '-'}</b></div>
          <div className="confirm-info-row"><span>{t('meeting.restrictedPeriod2', { defaultValue: '限制期：' })}</span><b>{row.startDate} ~ {row.endDate}</b></div>
          <div className="confirm-info-row"><span>{t('meeting.source2', { defaultValue: '登記來源：' })}</span><b>{SOURCE_LABEL(t)[row.source] ?? row.source}</b></div>
          <div className="confirm-info-row"><span>{t('meeting.impact', { defaultValue: '影響：' })}</span><b>{t('meeting.theEmployeeCanBook', { defaultValue: '撤銷後該員工立即可預約，記錄行保留不刪除' })}</b></div>
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 13, color: '#595959', marginBottom: 4 }}>{t('meeting.revokeReasonRequired', { defaultValue: '撤銷原因（必填）' })}</div>
            <Input.TextArea
              rows={3}
              maxLength={200}
              showCount
              style={{ resize: 'none' }}
              placeholder={t('meeting.eGExplainedHe', { defaultValue: '例：本人已說明當時在客戶現場，行政複核後解除' })}
              onChange={(e) => { reason = e.target.value }}
            />
          </div>
        </div>
      ),
      onOk: async () => {
        if (!reason.trim()) {
          message.warning(t('meeting.pleaseEnterTheRevoke', { defaultValue: '請填寫撤銷原因' }))
          // 抛出以阻止弹窗关闭：撤销不留原因，事后无法解释"为什么放人"
          throw new Error('reason required')
        }
        await revokeBlacklist(row.id, { reason: reason.trim(), version: row.version })
        message.success(t('meeting.restrictionRevoked', { defaultValue: '限制已撤銷' }))
        void load()
      },
    })
  }

  const columns: TableColumnsType<BlacklistItem> = [
    {
      title: t('meeting.person', { defaultValue: '人員' }), key: 'name', width: 150, fixed: 'left', ellipsis: true,
      render: (_, row) => `${row.name}${row.empNo ? `（${row.empNo}）` : ''}`,
    },
    { title: t('meeting.department', { defaultValue: '部門' }), dataIndex: 'departmentName', key: 'departmentName', width: 140, render: v => v || '-' },
    {
      title: t('meeting.source', { defaultValue: '來源' }), dataIndex: 'source', key: 'source', width: 110,
      render: (v: string) => <Tag color={v === 'auto' ? 'orange' : 'blue'}>{SOURCE_LABEL(t)[v] ?? v}</Tag>,
    },
    {
      title: t('meeting.noShowCount', { defaultValue: '爽約次數' }), dataIndex: 'noShowCount', key: 'noShowCount', width: 100,
      render: (v: number, row) => (row.source === 'auto' ? `${v} 次` : '—'),
    },
    { title: t('meeting.reason', { defaultValue: '原因' }), dataIndex: 'reason', key: 'reason', width: 260, ellipsis: true },
    { title: t('meeting.restrictedPeriod', { defaultValue: '限制期' }), key: 'period', width: 200, render: (_, row) => `${row.startDate} ~ ${row.endDate}` },
    {
      title: t('meeting.status', { defaultValue: '狀態' }), key: 'displayState', width: 130,
      render: (_, row) => {
        const meta = DISPLAY_STATE(t)[row.displayState] ?? { label: row.displayState, color: 'default' }
        return (
          <Space direction="vertical" size={2}>
            <Tag color={meta.color}>{meta.label}</Tag>
            {typeof row.remainingDays === 'number' && (
              <span style={{ fontSize: 12, color: '#8C8C8C' }}>剩 {row.remainingDays} 天</span>
            )}
          </Space>
        )
      },
    },
    {
      title: t('meeting.revoke', { defaultValue: '撤銷' }), key: 'revoke', width: 200, ellipsis: true,
      render: (_, row) => (row.displayState === 'revoked'
        ? <span style={{ fontSize: 12, color: '#8C8C8C' }} title={`${row.revokedByName ?? ''} ${row.revokeReason ?? ''}`}>
          {row.revokedByName ?? ''} {row.revokeReason ?? ''}
        </span>
        : '—'),
    },
    { title: t('meeting.recordedBy', { defaultValue: '登記人' }), key: 'createdBy', width: 120, render: (_, row) => row.createdBy || '-' },
    {
      title: t('meeting.actions', { defaultValue: '操作' }), key: 'action', width: 90, fixed: 'right',
      // 操作列（§B.9）：纯文本 link + 危险色，撤销是唯一动作，不需要分隔符
      render: (_, row) => (canEdit && row.displayState === 'effective'
        ? <Button type="link" size="small" danger onClick={() => handleRevoke(row)}>{t('meeting.revoke', { defaultValue: '撤銷' })}</Button>
        : <span style={{ color: '#BFBFBF' }}>—</span>),
    },
  ]

  return (
    <>
      {error && (
        <Alert
          type="error"
          showIcon
          message={t('meeting.failedToLoadThe', { defaultValue: '黑名單加載失敗' })}
          description={error}
          style={{ marginBottom: 16 }}
          action={<Button size="small" icon={<ReloadOutlined />} onClick={() => void load()}>{t('meeting.retry', { defaultValue: '重試' })}</Button>}
        />
      )}

      <div className="search-section">
        <Form form={form} layout="inline">
          <Form.Item label={t('meeting.keyword', { defaultValue: '關鍵字' })} name="keyword">
            <Input placeholder={t('meeting.nameEmployeeNo', { defaultValue: '姓名／工號' })} allowClear style={{ width: '100%' }} onPressEnter={search} />
          </Form.Item>
          <Form.Item label={t('meeting.source', { defaultValue: '來源' })} name="source">
            <Select placeholder={t('meeting.allSources', { defaultValue: '全部來源' })} allowClear style={{ width: '100%' }}
              options={Object.entries(SOURCE_LABEL(t)).map(([value, label]) => ({ value, label }))} />
          </Form.Item>
          <Form.Item label={t('meeting.status', { defaultValue: '狀態' })} name="status">
            <Select placeholder={t('meeting.allStatuses', { defaultValue: '全部狀態' })} allowClear style={{ width: '100%' }} options={STATUS_OPTIONS(t)} />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={search}>{t('meeting.search', { defaultValue: '查詢' })}</Button>
              <Button icon={<ReloadOutlined />} onClick={reset}>{t('meeting.reset', { defaultValue: '重置' })}</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 统计卡片：搜索区之后、操作区之前（§E.8），口径随筛选条件变化 */}
      <MeetingStatCards key={statsKey} loading={loading} items={[
        { icon: <FolderOpenOutlined />, color: '#1890FF', bg: '#E6F7FF', value: stats.total, label: t('meeting.restrictionRecords', { defaultValue: '限制記錄總數' }), hint: t('meeting.followsCurrentFilters', { defaultValue: '隨篩選條件變化' }) },
        { icon: <StopOutlined />, color: '#FF4D4F', bg: '#FFF1F0', value: stats.effective, label: t('meeting.effective', { defaultValue: '生效中' }) },
        { icon: <ClockCircleOutlined />, color: '#8C8C8C', bg: '#FAFAFA', value: stats.expired, label: t('meeting.expiredLiftedAutomatically', { defaultValue: '已到期（自動解除）' }) },
        { icon: <CheckCircleOutlined />, color: '#52C41A', bg: '#F6FFED', value: stats.revoked, label: t('meeting.revokedByAdmin', { defaultValue: '行政已撤銷' }) },
      ]} />

      {/* 操作区（§E.2）：右侧只放「新增」与列配置 */}
      <div className="action-section">
        <div className="action-section-left">
          <span style={{ fontSize: 12, color: '#8C8C8C' }}>
            到期由日期自動失效（不需要定時任務翻狀態）；撤銷保留記錄行，刪行等於毀掉處置憑據
          </span>
        </div>
        <div className="action-section-right">
          {canEdit && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/meeting-blacklist-form')}>
              手動加入黑名單
            </Button>
          )}
          {configComponent}
        </div>
      </div>

      <Table<BlacklistItem>
        rowKey="id"
        columns={applyConfig(columns)}
        dataSource={rows}
        loading={loading}
        scroll={{ x: 'max-content' }}
        size="middle"
        pagination={{
          current: query.page,
          pageSize: query.size,
          total,
          showSizeChanger: true,
          showQuickJumper: true,
          pageSizeOptions: ['10', '20', '50', '100'],
          showTotal: t => `共 ${t} 條`,
          // pageSize 变化必须回到第 1 页，否则会停在一个可能不存在的页码上
          onChange: (page, size) => setQuery(q => ({ ...q, page: size !== q.size ? 1 : page, size: size || 20 })),
        }}
      />
    </>
  )
}
