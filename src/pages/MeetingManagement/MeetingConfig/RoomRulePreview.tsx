/**
 * 預約管理 · 會議室專屬規則（真實讀寫）。
 *
 * 繼承口徑：undefined / null = 繼承通用；0、false 是明確值（如提醒 0 = 不提醒）。
 * 保存前由服務端用「房間版本 + 通用版本」雙樂觀鎖校驗，避免用過期繼承基準覆蓋他人修改。
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Alert, Button, Empty, Form, Input, InputNumber, Modal, Radio, Select, Spin, Table, Tag, TimePicker, message,
} from 'antd'
import type { TableColumnsType } from 'antd'
import { ArrowLeftOutlined, BellOutlined, ClockCircleOutlined, ReloadOutlined, SaveOutlined, SearchOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useConfirmLeave, useUnsavedGuard } from '@/contexts/UnsavedChangesContext'
import { useColumnConfig } from '@/hooks/useColumnConfig'
import CardTitle from '@/components/CardTitle'
import HelpPopover from '@/components/HelpPopover'
import i18n from '@/i18n'
import {
  fetchMeetingRules, fetchRoomRuleList, fetchRoomRules, saveRoomRules,
  type MeetingRuleForm, type RoomRuleOverrides, type RoomRuleRow, type RoomRuleView,
} from '@/api/meeting'
import './rules.css'

/** 模組級取詞：與頁面內 useTranslation 同源，供表格列/確認框等非 JSX 位置使用 */
const tr = (key: string, zh: string, params?: Record<string, string | number>) =>
  i18n.t(key, { defaultValue: zh, ...(params ?? {}) } as never) as unknown as string

/** 逐字段的生效值（通用默认值）；checkinRequired 用布尔便于表单表达 */
export interface GlobalValues {
  advanceDays: number
  minLeadMinutes: number
  granularityMinutes: number
  defaultDuration: number
  minDuration: number
  maxDuration: number
  remindMinutes: number
  checkinOpenMinutes: number
  releaseAfterMinutes: number
  checkinRequired: boolean
  bookableStart: string
  bookableEnd: string
}

/** undefined = 继承通用（与后端 null 同义） */
export type OverrideValues = { [K in keyof GlobalValues]?: GlobalValues[K] }

export function globalsOf(rule: MeetingRuleForm): GlobalValues {
  return {
    advanceDays: rule.advanceDays,
    minLeadMinutes: rule.minLeadMinutes,
    granularityMinutes: rule.granularityMinutes,
    defaultDuration: rule.defaultDuration,
    minDuration: rule.minDuration,
    maxDuration: rule.maxDuration,
    remindMinutes: rule.remindMinutes,
    checkinOpenMinutes: rule.checkinOpenMinutes,
    releaseAfterMinutes: rule.releaseAfterMinutes,
    checkinRequired: rule.checkinRequired === 1,
    bookableStart: rule.bookableStart,
    bookableEnd: rule.bookableEnd,
  }
}

/** 0/1 与 null 的口径转换集中在这里，页面里不出现魔法数字 */
export function overridesFromApi(raw: RoomRuleOverrides): OverrideValues {
  const num = (v?: number | null) => (v == null ? undefined : v)
  const text = (v?: string | null) => (v == null || v === '' ? undefined : v)
  return {
    advanceDays: num(raw.advanceDays),
    minLeadMinutes: num(raw.minLeadMinutes),
    granularityMinutes: num(raw.granularityMinutes),
    defaultDuration: num(raw.defaultDuration),
    minDuration: num(raw.minDuration),
    maxDuration: num(raw.maxDuration),
    remindMinutes: num(raw.remindMinutes),
    checkinOpenMinutes: num(raw.checkinOpenMinutes),
    releaseAfterMinutes: num(raw.releaseAfterMinutes),
    checkinRequired: raw.checkinRequired == null ? undefined : raw.checkinRequired === 1,
    bookableStart: text(raw.bookableStart),
    bookableEnd: text(raw.bookableEnd),
  }
}

export function overridesToApi(values: OverrideValues): RoomRuleOverrides {
  return {
    advanceDays: values.advanceDays ?? null,
    minLeadMinutes: values.minLeadMinutes ?? null,
    granularityMinutes: values.granularityMinutes ?? null,
    defaultDuration: values.defaultDuration ?? null,
    minDuration: values.minDuration ?? null,
    maxDuration: values.maxDuration ?? null,
    remindMinutes: values.remindMinutes ?? null,
    checkinOpenMinutes: values.checkinOpenMinutes ?? null,
    releaseAfterMinutes: values.releaseAfterMinutes ?? null,
    checkinRequired: values.checkinRequired == null ? null : (values.checkinRequired ? 1 : 0),
    bookableStart: values.bookableStart ?? null,
    bookableEnd: values.bookableEnd ?? null,
  }
}

/** 生效值 = 覆盖值优先，否则回落通用（与服务端同口径，仅用于即时显示） */
export function effectiveOf(globals: GlobalValues, overrides: OverrideValues): GlobalValues {
  return { ...globals, ...Object.fromEntries(Object.entries(overrides).filter(([, v]) => v !== undefined)) } as GlobalValues
}

export function overrideCount(values: OverrideValues): number {
  return Object.values(values).filter(v => v !== undefined).length
}

/** 未保存离开保护：覆盖页签、侧栏与前进后退（不支持暂存，必须明确放弃） */
export function useRulePreviewGuard(dirty: boolean, onDiscard: () => void, title: string) {
  const { register } = useUnsavedGuard()
  const latest = useRef({ dirty, onDiscard, title })
  latest.current = { dirty, onDiscard, title }
  useEffect(() => register({
    isDirty: () => latest.current.dirty,
    discard: () => { latest.current.dirty = false; latest.current.onDiscard() },
    describe: () => latest.current.title,
  }), [register])
  useEffect(() => {
    if (!dirty) return
    const handleBeforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [dirty])
}

export function RulePageHeader({ title, subtitle, onBack, tag }: {
  title: string; subtitle?: ReactNode; onBack?: () => void; tag?: ReactNode
}) {
  return <header className="mr-header">
    <div className="mr-header__accent" />
    <div className="mr-header__body">
      {onBack && <Button type="primary" icon={<ArrowLeftOutlined />} onClick={onBack}>{tr('meetingReservation.back', '返回')}</Button>}
      <div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
      {tag}
    </div>
  </header>
}

const unitLabel = (unit: 'day' | 'minute') =>
  unit === 'day' ? tr('meetingReservation.day', '天') : tr('meetingReservation.minute', '分鐘')

const NUMERIC_FIELDS = [
  { key: 'advanceDays', labelKey: 'advanceDays', min: 1, max: 365, unit: 'day' },
  { key: 'minLeadMinutes', labelKey: 'minLeadMinutes', min: 0, max: 1440, unit: 'minute' },
  { key: 'defaultDuration', labelKey: 'defaultDuration', min: 5, max: 720, unit: 'minute' },
  { key: 'minDuration', labelKey: 'minDuration', min: 1, max: 720, unit: 'minute' },
  { key: 'maxDuration', labelKey: 'maxDuration', min: 1, max: 720, unit: 'minute' },
  { key: 'remindMinutes', labelKey: 'remindMinutes', min: 0, max: 1440, unit: 'minute' },
  { key: 'checkinOpenMinutes', labelKey: 'checkinOpenMinutes', min: 0, max: 120, unit: 'minute' },
  { key: 'releaseAfterMinutes', labelKey: 'releaseAfterMinutes', min: 1, max: 240, unit: 'minute' },
] as const

const FIELD_KEY = 'meetingReservation.field'

function InheritanceField({ label, inherited, common, effective, onInherit, disabled, children }: {
  label: string; inherited: boolean; common: string; effective: string; onInherit: (inherit: boolean) => void
  disabled?: boolean; children: ReactNode
}) {
  return <div className="mr-rule-field" role="group" aria-label={label}>
    <div className="mr-rule-field__heading"><span>{label}</span>
      <Tag color={inherited ? 'default' : 'blue'}>
        {inherited ? tr('meetingReservation.inherit', '繼承通用') : tr('meetingReservation.custom', '單獨設定')}
      </Tag>
    </div>
    <Radio.Group aria-label={`${label}${tr('meetingReservation.sourceSuffix', '來源')}`} value={inherited} disabled={disabled}
      onChange={event => onInherit(event.target.value)}>
      <Radio value>{tr('meetingReservation.inherit', '繼承通用')}</Radio>
      <Radio value={false}>{tr('meetingReservation.custom', '單獨設定')}</Radio>
    </Radio.Group>
    <div className="mr-rule-field__control">{children}</div>
    <div className="mr-rule-field__values">
      <span>{tr('meetingReservation.commonValue', '通用值')}：{common}</span>
      <strong>{tr('meetingReservation.effectiveValue', '生效值')}：{effective}</strong>
    </div>
  </div>
}

/** 规则编辑区：同一套控件用于房间规则页（会议室档案只保留入口链接，不另存一份逻辑） */
export function RoomRuleFields({ globals, overrides, onChange, disabled }: {
  globals: GlobalValues; overrides: OverrideValues; onChange: (value: OverrideValues) => void; disabled?: boolean
}) {
  const effective = effectiveOf(globals, overrides)
  const setField = <K extends keyof GlobalValues>(key: K, value: GlobalValues[K] | undefined) =>
    onChange({ ...overrides, [key]: value } as OverrideValues)
  const numeric = (field: typeof NUMERIC_FIELDS[number]) => {
    const inherited = overrides[field.key] === undefined
    const label = tr(`${FIELD_KEY}.${field.labelKey}`, field.labelKey)
    const unit = unitLabel(field.unit)
    return <InheritanceField key={field.key} label={label} disabled={disabled} inherited={inherited}
      common={`${globals[field.key]} ${unit}`} effective={`${effective[field.key]} ${unit}`}
      onInherit={inherit => setField(field.key, inherit ? undefined : globals[field.key])}>
      <InputNumber aria-label={label} value={effective[field.key]} precision={0}
        min={field.min} max={field.max} addonAfter={unit} disabled={disabled || inherited}
        onChange={value => { if (value != null) setField(field.key, value) }} />
    </InheritanceField>
  }
  const windowInherited = overrides.bookableStart === undefined && overrides.bookableEnd === undefined
  const toggleWindow = (inherit: boolean) => onChange({ ...overrides,
    bookableStart: inherit ? undefined : globals.bookableStart,
    bookableEnd: inherit ? undefined : globals.bookableEnd })
  const time = (value: string) => dayjs(`2000-01-01T${value.length === 5 ? `${value}:00` : value}`)
  return <>
    <div className="mr-card">
      <CardTitle icon={<ClockCircleOutlined />} tone="warn" title={tr('meetingReservation.timeSection', '預約時間與時長')} />
      <div className="mr-rule-grid">
        <InheritanceField label={tr('meetingReservation.field.bookableWindow', '每日可預約時段')} inherited={windowInherited} disabled={disabled}
          common={`${globals.bookableStart}–${globals.bookableEnd}`}
          effective={`${effective.bookableStart}–${effective.bookableEnd}`} onInherit={toggleWindow}>
          <div className="mr-time-range">
            <TimePicker aria-label={tr('meetingReservation.field.bookableStart', '每日可預約開始')} format="HH:mm" allowClear={false}
              value={time(effective.bookableStart)} disabled={disabled || windowInherited}
              onChange={value => { if (value) setField('bookableStart', value.format('HH:mm')) }} />
            <span>{tr('meetingReservation.to', '至')}</span>
            <TimePicker aria-label={tr('meetingReservation.field.bookableEnd', '每日可預約結束')} format="HH:mm" allowClear={false}
              value={time(effective.bookableEnd)} disabled={disabled || windowInherited}
              onChange={value => { if (value) setField('bookableEnd', value.format('HH:mm')) }} />
          </div>
        </InheritanceField>
        {NUMERIC_FIELDS.slice(0, 2).map(numeric)}
        <InheritanceField label={tr('meetingReservation.field.granularityMinutes', '時間粒度')}
          inherited={overrides.granularityMinutes === undefined} disabled={disabled}
          common={`${globals.granularityMinutes} ${unitLabel('minute')}`}
          effective={`${effective.granularityMinutes} ${unitLabel('minute')}`}
          onInherit={inherit => setField('granularityMinutes', inherit ? undefined : globals.granularityMinutes)}>
          <Select aria-label={tr('meetingReservation.field.granularityMinutes', '時間粒度')} value={effective.granularityMinutes}
            disabled={disabled || overrides.granularityMinutes === undefined}
            options={[5, 10, 15, 20, 30, 60].map(value => ({ value, label: `${value} ${unitLabel('minute')}` }))}
            onChange={value => setField('granularityMinutes', value)} />
        </InheritanceField>
        {NUMERIC_FIELDS.slice(2, 5).map(numeric)}
      </div>
    </div>
    <div className="mr-card">
      <CardTitle icon={<BellOutlined />} tone="info" title={tr('meetingReservation.remindSection', '提醒、簽到與自動釋放')}
        note={<HelpPopover title={tr('meetingReservation.helpTitle', '提醒與簽到')} ariaLabel={tr('meetingReservation.helpAria', '提醒與簽到說明')} content={[
          { tone: 'info', body: tr('meetingReservation.helpRemind', '開始前提醒設為 0 表示不提醒；0 是明確設定，不等於繼承。') },
          { tone: 'neutral', body: tr('meetingReservation.helpCheckin', '不需要簽到保留時，不啟用未簽到自動釋放。已預約的會議保持其預約時的規則。') },
        ]} />} />
      <div className="mr-rule-grid">
        <InheritanceField label={tr('meetingReservation.field.checkinRequired', '需簽到保留')}
          inherited={overrides.checkinRequired === undefined} disabled={disabled}
          common={globals.checkinRequired ? tr('meetingReservation.yes', '是') : tr('meetingReservation.no', '否')}
          effective={effective.checkinRequired ? tr('meetingReservation.yes', '是') : tr('meetingReservation.no', '否')}
          onInherit={inherit => setField('checkinRequired', inherit ? undefined : globals.checkinRequired)}>
          <Radio.Group aria-label={tr('meetingReservation.field.checkinRequired', '需簽到保留')} buttonStyle="solid"
            value={effective.checkinRequired} disabled={disabled || overrides.checkinRequired === undefined}
            onChange={event => setField('checkinRequired', event.target.value)}>
            <Radio.Button value>{tr('meetingReservation.yes', '是')}</Radio.Button>
            <Radio.Button value={false}>{tr('meetingReservation.no', '否')}</Radio.Button>
          </Radio.Group>
        </InheritanceField>
        {NUMERIC_FIELDS.slice(5).map(numeric)}
      </div>
    </div>
  </>
}

/** 會議室規則清單：來源篩選由服務端按「是否有任一覆蓋」判定 */
export function RoomRulesPanel() {
  const navigate = useNavigate()
  const [query, setQuery] = useState<{ page: number; size: number; keyword: string; source: string }>(
    { page: 1, size: 20, keyword: '', source: 'all' })
  const [keyword, setKeyword] = useState('')
  const [source, setSource] = useState('all')
  const [rows, setRows] = useState<RoomRuleRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [retry, setRetry] = useState(0)
  const { configComponent, applyConfig } = useColumnConfig('meeting-room-rule', [
    { key: 'roomNo', title: tr('meetingReservation.col.roomNo', '會議室編號') },
    { key: 'roomName', title: tr('meetingReservation.col.roomName', '會議室') },
    { key: 'location', title: tr('meetingReservation.col.location', '位置') },
    { key: 'source', title: tr('meetingReservation.col.source', '規則來源') },
    { key: 'window', title: tr('meetingReservation.col.window', '可預約時段') },
    { key: 'duration', title: tr('meetingReservation.col.duration', '單場時長') },
    { key: 'checkin', title: tr('meetingReservation.field.checkinRequired', '需簽到保留') },
    { key: 'action', title: tr('meetingReservation.col.action', '操作') },
  ], [{ key: 'roomNo', visible: true, locked: 'head' }, { key: 'action', visible: true, locked: 'tail' }])
  useEffect(() => {
    let active = true
    setLoading(true); setError(undefined)
    void fetchRoomRuleList(query).then(result => {
      if (!active) return
      setRows(result.records ?? []); setTotal(result.total ?? 0)
    }).catch((err: unknown) => {
      if (active) setError(err instanceof Error ? err.message : tr('meetingReservation.loadFailed', '會議室規則載入失敗'))
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [query, retry])
  const search = () => setQuery({ ...query, page: 1, keyword: keyword.trim(), source })
  const reset = () => { setKeyword(''); setSource('all'); setQuery({ page: 1, size: query.size, keyword: '', source: 'all' }) }
  const columns: TableColumnsType<RoomRuleRow> = [
    { key: 'roomNo', title: tr('meetingReservation.col.roomNo', '會議室編號'), dataIndex: 'roomNo', width: 140, fixed: 'left' },
    { key: 'roomName', title: tr('meetingReservation.col.roomName', '會議室'), dataIndex: 'roomName', width: 180 },
    { key: 'location', title: tr('meetingReservation.col.location', '位置'), dataIndex: 'locationText', width: 200, render: v => v || '-' },
    {
      key: 'source', title: tr('meetingReservation.col.source', '規則來源'), width: 130,
      render: (_, row) => <Tag color={row.source === 'custom' ? 'blue' : 'default'}>
        {row.source === 'custom' ? tr('meetingReservation.hasCustom', '有專屬配置') : tr('meetingReservation.allInherit', '全部繼承')}
      </Tag>,
    },
    { key: 'window', title: tr('meetingReservation.col.window', '可預約時段'), width: 170, render: (_, row) => row.bookableStart && row.bookableEnd ? `${row.bookableStart}–${row.bookableEnd}` : '-' },
    { key: 'duration', title: tr('meetingReservation.col.duration', '單場時長'), width: 190, render: (_, row) => `${row.minDuration ?? '-'}–${row.maxDuration ?? '-'} ${unitLabel('minute')}` },
    { key: 'checkin', title: tr('meetingReservation.field.checkinRequired', '需簽到保留'), width: 130, render: (_, row) => (row.checkinRequired == null ? '—' : row.checkinRequired === 1 ? tr('meetingReservation.yes', '是') : tr('meetingReservation.no', '否')) },
    {
      key: 'action', title: tr('meetingReservation.col.action', '操作'), width: 120, fixed: 'right',
      render: (_, row) => <Button type="link" size="small" onClick={() => navigate(`/meeting-room-rules?id=${row.roomId}`)}>
        {tr('meetingReservation.configure', '配置規則')}
      </Button>,
    },
  ]
  return <>
    <Alert type="info" showIcon className="mr-notice" message={tr('meetingReservation.listBanner', '會議室專屬值優先；未設定的項目自動繼承通用規則')}
      description={tr('meetingReservation.listBannerDesc', '新預約使用最新規則；已預約的會議保留其預約時的規則，僅改期或換房時重新計算。')} />
    {error && <Alert type="error" showIcon className="mr-notice" message={tr('meetingReservation.loadFailed', '會議室規則載入失敗')} description={error}
      action={<Button onClick={() => setRetry(value => value + 1)}>{tr('meetingReservation.retry', '重試')}</Button>} />}
    <div className="search-section">
      <Form layout="inline">
        <Form.Item label={tr('meetingReservation.roomOrLocation', '會議室 / 位置')}>
          <Input aria-label={tr('meetingReservation.roomOrLocation', '會議室 / 位置')}
            placeholder={tr('meetingReservation.roomPlaceholder', '編號、名稱或位置')} value={keyword}
            onChange={event => setKeyword(event.target.value)} onPressEnter={search} />
        </Form.Item>
        <Form.Item label={tr('meetingReservation.col.source', '規則來源')}>
          <Select aria-label={tr('meetingReservation.col.source', '規則來源')} value={source} onChange={setSource}
            options={[
              { value: 'all', label: tr('meetingReservation.all', '全部') },
              { value: 'inherit', label: tr('meetingReservation.inheritOnly', '全部繼承') },
              { value: 'custom', label: tr('meetingReservation.hasCustom', '有專屬配置') },
            ]} />
        </Form.Item>
        <Form.Item><div className="search-actions">
          <Button type="primary" icon={<SearchOutlined />} onClick={search}>{tr('meetingReservation.search', '查詢')}</Button>
          <Button icon={<ReloadOutlined />} onClick={reset}>{tr('meetingReservation.reset', '重置')}</Button>
        </div></Form.Item>
      </Form>
    </div>
    <div className="action-section">
      <div className="action-section-left"><span className="mr-muted">{tr('meetingReservation.ruleNote', '一間會議室一套覆蓋設定，不重複建立通用規則')}</span></div>
      <div className="action-section-right">{configComponent}</div>
    </div>
    <Table rowKey="roomId" columns={applyConfig(columns)} dataSource={rows} loading={loading} scroll={{ x: 'max-content' }}
      locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={error ? tr('meetingReservation.retryEmpty', '請重試載入') : tr('meetingReservation.empty', '暫無會議室')} /> }}
      pagination={{ current: query.page, pageSize: query.size, total, showSizeChanger: true, showQuickJumper: true,
        pageSizeOptions: ['10', '20', '50', '100'],
        showTotal: count => tr('meetingReservation.totalRooms', '共 {{count}} 間', { count }),
        onChange: (page, size) => setQuery({ ...query, page: size !== query.size ? 1 : page, size }) }} />
  </>
}

function RoomRuleEditor({ view, globals }: { view: RoomRuleView; globals: GlobalValues }) {
  const navigate = useNavigate()
  const location = useLocation()
  const confirmLeave = useConfirmLeave()
  const [overrides, setOverrides] = useState<OverrideValues>(() => overridesFromApi(view.overrides))
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const canEdit = view.canEdit
  useRulePreviewGuard(dirty, () => setDirty(false), `${view.roomName} · ${tr('meetingReservation.title', '會議室專屬規則')}`)
  const backTarget = new URLSearchParams(location.search).get('from') === 'room'
    ? `/meeting-room-form?id=${view.roomId}` : '/meeting-config?tab=rooms'
  const handleBack = async () => {
    if (await confirmLeave(backTarget)) navigate(backTarget, { replace: true, state: { closeMenuTab: location.pathname + location.search } })
  }
  const apply = (value: OverrideValues) => { setOverrides(value); setDirty(true) }
  const overridesCount = overrideCount(overrides)

  const handleSave = () => {
    if (!canEdit || saving) return
    let reason = ''
    Modal.confirm({
      title: tr('meetingReservation.confirmTitle', '確認保存會議室規則？'),
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      okText: tr('meetingReservation.confirm', '確認保存'), cancelText: tr('meetingReservation.back', '返回'),
      content: <div className="confirm-info-card">
        <div className="confirm-info-row"><span>{tr('meetingReservation.roomLabel', '會議室')}：</span><b>{view.roomNo} · {view.roomName}</b></div>
        <div className="confirm-info-row"><span>{tr('meetingReservation.overridesLabel', '專屬項目')}：</span><b>
          {overridesCount > 0 ? tr('meetingReservation.itemsCount', '{{count}} 項', { count: overridesCount }) : tr('meetingReservation.allInheritSuffix', '全部繼承通用')}
        </b></div>
        <div className="confirm-info-row"><span>{tr('meetingReservation.impactLabel', '影響範圍')}：</span><b>{tr('meetingReservation.impactValue', '新預約與改期；已預約會議保持原規則')}</b></div>
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 13, color: '#595959', marginBottom: 4 }}>{tr('meetingReservation.reasonLabel', '變更原因（必填）')}</div>
          <Input.TextArea rows={3} maxLength={200} showCount style={{ resize: 'none' }}
            placeholder={tr('meetingReservation.reasonPlaceholder', '例：大會議室支持夜間例會，可預約窗延後至 23:00')}
            onChange={e => { reason = e.target.value }} />
        </div>
      </div>,
      onOk: async () => {
        if (!reason.trim()) {
          message.warning(tr('meetingReservation.reasonRequired', '請填寫變更原因'))
          throw new Error('reason required')
        }
        setSaving(true)
        try {
          await saveRoomRules(view.roomId, {
            overrides: overridesToApi(overrides), changeReason: reason.trim(),
            expectRoomVersion: view.roomVersion, expectConfigVersion: view.configVersion,
          })
          message.success(tr('meetingReservation.saved', '會議室規則已保存'))
          setDirty(false)
          navigate('/meeting-config?tab=rooms', { replace: true })
        } catch {
          // 版本冲突/校验失败已由 request.ts 统一提示；留在原页让用户刷新后重试
          throw new Error('save failed')
        } finally {
          setSaving(false)
        }
      },
    })
  }

  return <>
    <RulePageHeader title={tr('meetingReservation.title', '會議室專屬規則')}
      subtitle={`${view.roomNo} · ${view.roomName} · ${view.locationText || tr('meetingReservation.noLocation', '未填位置')}`}
      onBack={() => void handleBack()}
      tag={<Tag color={overridesCount ? 'blue' : 'default'}>
        {overridesCount ? tr('meetingReservation.hasCustom', '有專屬配置') : tr('meetingReservation.allInherit', '全部繼承')}
      </Tag>} />
    <Alert type="info" showIcon className="mr-notice"
      message={tr('meetingReservation.banner', '未設定（繼承通用）的項目跟隨通用規則；單獨設定的項目以本房間為準')}
      description={tr('meetingReservation.bannerDesc', '保存需填寫變更原因並二次確認；影響新預約與改期，已預約會議保持其預約時規則。')} />
    <div className="mr-summary"><span>{dirty ? tr('meetingReservation.dirty', '有未保存的修改') : tr('meetingReservation.loaded', '已載入目前房間規則')}</span>
      <Button disabled={!canEdit || overridesCount === 0} onClick={() => apply({})}>
        {tr('meetingReservation.resetAll', '全部恢復通用')}
      </Button></div>
    <Form layout="vertical" disabled={!canEdit || saving}>
      <RoomRuleFields globals={globals} overrides={overrides} onChange={apply} disabled={!canEdit || saving} />
    </Form>
    <div className="mr-policy-note"><strong>{tr('meetingReservation.policyTitle', '爽約與黑名單使用統一規則')}</strong>
      <span>{tr('meetingReservation.policyDesc', '不按會議室單獨累計或處罰，請到通用規則查看。')}</span></div>
    <div className="form-footer">
      <Button onClick={() => void handleBack()}>{tr('meetingReservation.cancel', '取消')}</Button>
      {canEdit && <>
        <Button onClick={() => { setOverrides(overridesFromApi(view.overrides)); setDirty(false) }}>{tr('meetingReservation.revert', '還原')}</Button>
        <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSave}>{tr('meetingReservation.save', '保存規則')}</Button>
      </>}
    </div>
  </>
}

export default function MeetingRoomRulePreview() {
  const [params] = useSearchParams()
  const id = Number(params.get('id'))
  const [data, setData] = useState<{ view: RoomRuleView; globals: GlobalValues }>()
  const [error, setError] = useState<string>()
  const [retry, setRetry] = useState(0)
  const load = useCallback(() => {
    setData(undefined); setError(undefined)
    if (!Number.isSafeInteger(id) || id <= 0) { setError(tr('meetingReservation.missingId', '缺少有效的會議室編號')); return }
    void Promise.all([fetchRoomRules(id), fetchMeetingRules()]).then(([view, rules]) => {
      setData({ view, globals: globalsOf(rules.rule) })
    }).catch((err: unknown) => setError(err instanceof Error ? err.message : tr('meetingReservation.loadFailedDesc', '規則載入失敗')))
  }, [id])
  useEffect(load, [load, retry])
  return <div className="content-area mr-workspace">
    {error ? <Alert type="error" showIcon message={tr('meetingReservation.loadFailedTitle', '無法載入會議室規則')} description={error}
      action={<Button onClick={() => setRetry(value => value + 1)}>{tr('meetingReservation.retry', '重試')}</Button>} />
      : data ? <RoomRuleEditor key={`${id}-${retry}`} view={data.view} globals={data.globals} /> : <div className="mr-loading"><Spin size="large" /></div>}
  </div>
}
