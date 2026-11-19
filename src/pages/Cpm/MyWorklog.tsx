/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Button, DatePicker, Input, Modal, Popover, Progress, Segmented, Select, Slider, Space, Tag, Tooltip, message } from 'antd'
import {
  EditOutlined, HistoryOutlined,
  ImportOutlined,
  LeftOutlined, RightOutlined, RobotOutlined, ThunderboltOutlined, TrophyFilled,
} from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import { useTranslation } from 'react-i18next'
import {
  addCpmProgress, carryCpmItem, createCpmItem, deleteCpmItem, fetchCpmDay, fetchCpmRdmSyncStatus, fetchCpmTemplates,
  realignCpmRdmSync, setCpmRdmSync,
  type CpmDayVO, type CpmItemTimeVO, type CpmItemVO, type CpmTemplateVO,
} from '@/api/cpm'
import {
  CPM_SOURCE_LABELS, CPM_STATUS_ACCENTS, CPM_STATUS_DEFAULT_COLLAPSED, CPM_STATUS_LABELS,
  CPM_STATUS_ORDER, CPM_STATUS_TAG_COLORS, CpmStatus, type CpmStatusValue,
} from './meta'
import AiAssistantDrawer from './AiAssistantDrawer'
import SourceImportModal from './SourceImportModal'
import TimeEntryPopover from './TimeEntryPopover'
import RdmSyncBadge from './RdmSyncBadge'
import { formatMinutes, formatSegmentRange } from './cpmTime'
import './cpm.css'

/**
 * P1 我的工作記錄（cpm-my，使用侧）。
 *
 * 极简主义三条硬约束（方案 §七-P1，阶段二接真实 API 后不变）：
 * 1. 快捷录入一行回车即存——默认值吃掉「日期/状态/分类」三个选择成本；
 * 2. 延续建议一键带入——跨周期追踪零重录（写进度流水，条目身份不变）；
 * 3. 90% 操作行内完成（更新进度/完成/删除），只有编辑详情走独立页。
 *
 * 数据边界在服务端：本页面不传任何身份字段；后端不可用走错误横幅+重试，
 * 绝不回退到假数据（BACKEND_CONNECTED_KEYS 名单成员）。
 */

/**
 * 状态分组：顺序与颜色一律取自 meta 的真值（CPM_STATUS_ORDER / CPM_STATUS_ACCENTS），
 * 不在页面里另排一次——日视图与汇报明细给出两种「重要程度」是最难解释的分叉。
 */
const STATUS_GROUPS = CPM_STATUS_ORDER.map(status => ({ status, accent: CPM_STATUS_ACCENTS[status] }))
/** 这些组默认折叠：已取消不参与日常注意力，但事实必须看得见（折叠 ≠ 隐藏） */
const DEFAULT_COLLAPSED = Object.fromEntries(CPM_STATUS_DEFAULT_COLLAPSED.map(status => [status, true]))

export default function MyWorklog() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [date, setDate] = useState<Dayjs>(dayjs())
  const dateStr = date.format('YYYY-MM-DD')

  const [day, setDay] = useState<CpmDayVO | null>(null)
  const [templates, setTemplates] = useState<CpmTemplateVO[]>([])
  const [templateKey, setTemplateKey] = useState<string>('general')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [quickText, setQuickText] = useState('')
  const [aiOpen, setAiOpen] = useState(false)
  const [sourceOpen, setSourceOpen] = useState(false)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(DEFAULT_COLLAPSED)
  /**
   * 回写总闸状态：整页取一次，不给每行发请求。
   * 取失败时按「开」处理（见 RdmSyncBadge 默认值）——把正常状态误报成「系统未开启」
   * 比沉默更糟，用户会因此不去检查自己那一侧的开关。
   */
  const [syncGateOpen, setSyncGateOpen] = useState(true)

  useEffect(() => {
    fetchCpmRdmSyncStatus()
      .then(status => setSyncGateOpen(status.enabled))
      .catch(() => undefined)
  }, [])

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const [dayData, templateData] = await Promise.all([fetchCpmDay(dateStr), fetchCpmTemplates()])
      setDay(dayData)
      const enabled = templateData.filter(t => t.enabled)
      setTemplates(enabled)
      setTemplateKey(prev => (enabled.some(t => t.templateKey === prev) ? prev : (enabled[0]?.templateKey ?? 'general')))
      setLoadError(null)
    } catch (err) {
      // request.ts 已弹错，这里补页面级横幅：列表不能停在上一天的数据上假装正常（错日期比空列表更误导）
      setLoadError(err instanceof Error ? err.message : '載入失敗')
    } finally {
      setLoading(false)
    }
  }, [dateStr])

  useEffect(() => { void reload() }, [reload])

  const activeTemplate = templates.find(t => t.templateKey === templateKey) ?? templates[0]
  const categories = activeTemplate?.categories ?? []
  const items = day?.items ?? []
  const carries = day?.carryCandidates ?? []
  /**
   * 当日时段按条目索引：日视图接口一次带回（times），不在这里逐条目补发请求。
   * Map 记忆化而不是每次渲染重建，否则条目行会因为新 Map 而全量重渲染。
   */
  const timeByItem = useMemo(() => {
    const map = new Map<number, CpmItemTimeVO>()
    ;(day?.times ?? []).forEach(row => map.set(row.itemId, row))
    return map
  }, [day])
  const grouped: Record<string, CpmItemVO[]> = {}
  STATUS_GROUPS.forEach(g => { grouped[g.status] = [] })
  items.forEach(i => { (grouped[i.status] ??= []).push(i) })

  const handleQuickAdd = async () => {
    const title = quickText.trim()
    if (!title) return
    await createCpmItem({
      title, category: categories[0]?.key, status: CpmStatus.DOING, progress: 0,
      workDate: dateStr, templateKey: activeTemplate?.templateKey, sourceType: 'manual',
    })
    setQuickText('')
    message.success('已記錄')
    void reload()
  }

  const handleFinish = async (item: CpmItemVO) => {
    await addCpmProgress(item.id, { progress: 100, status: CpmStatus.DONE })
    void reload()
  }

  const handleDelete = (item: CpmItemVO) => {
    Modal.confirm({
      title: '確定刪除該條工作記錄？',
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper confirm-icon-wrapper--danger"><span className="confirm-icon-text">!</span></span>,
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>事項：</span><b>{item.title}</b></div>
          <div className="confirm-info-row"><span>進度：</span><b>{CPM_STATUS_LABELS[item.status]} · {item.progress}%</b></div>
        </div>
      ),
      okText: '確認刪除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => { await deleteCpmItem(item.id); void reload() },
    })
  }

  return (
    <div className="content-area">
      {loadError && (
        <Alert type="error" showIcon style={{ marginBottom: 14 }} message="工作記錄載入失敗" description={loadError}
          action={<Button size="small" onClick={() => void reload()}>重試</Button>} />
      )}

      {/* 工具行：日期切换 + 岗位模板 + AI 助手 */}
      <div className="cpm-my__toolbar">
        <Space.Compact>
          <Button icon={<LeftOutlined />} onClick={() => setDate(d => d.subtract(1, 'day'))} aria-label="前一天" />
          <DatePicker value={date} onChange={v => v && setDate(v)} allowClear={false} style={{ width: 150 }} />
          <Button icon={<RightOutlined />} onClick={() => setDate(d => d.add(1, 'day'))} aria-label="后一天" />
        </Space.Compact>
        <Button onClick={() => setDate(dayjs())}>今天</Button>
        <Space size={6}>
          <span style={{ fontSize: 13, color: 'var(--text-2)' }}>崗位模板:</span>
          <Select
            value={templateKey}
            style={{ width: 150 }}
            onChange={setTemplateKey}
            options={templates.map(t => ({ value: t.templateKey, label: t.name }))}
          />
        </Space>
      </div>

      {/* 快捷录入：一行回车即存（低录入成本主入口） */}
      <div className="cpm-my__quickbar">
        <Input
          value={quickText}
          onChange={e => setQuickText(e.target.value)}
          onPressEnter={() => void handleQuickAdd()}
          placeholder="一句話記錄今天做了什麼，回車即存"
          maxLength={200}
          suffix={<span style={{ fontSize: 11, color: 'var(--text-3)' }}>{quickText.trim().length}/200</span>}
        />
        <Button type="primary" icon={<ThunderboltOutlined />} onClick={() => void handleQuickAdd()} disabled={!quickText.trim()}>記錄</Button>
        <Button icon={<RobotOutlined />} onClick={() => setAiOpen(true)}>AI 助手</Button>
        <Tooltip title={t('cpm.sourceImport.tip', { defaultValue: '一鍵帶入本人的需求與會議行動項' })}>
          <Button icon={<ImportOutlined />} onClick={() => setSourceOpen(true)}>{t('cpm.sourceImport.button', { defaultValue: '關聯導入' })}</Button>
        </Tooltip>
      </div>

      {/* 延续建议：昨日未完结条目一键带入今天（跨周期零重录） */}
      {carries.length > 0 && (
        <div className="cpm-my__carry">
          <HistoryOutlined style={{ color: 'var(--brand)' }} />
          <span style={{ fontSize: 12, color: 'var(--text-2)' }}>未完結，點擊帶入今天:</span>
          {carries.map(c => (
            <Tooltip key={c.id} title={`進度 ${c.progress}% · ${CPM_STATUS_LABELS[c.status]}`}>
              <Tag
                className="cpm-my__carry-chip"
                color="orange"
                onClick={async () => { await carryCpmItem(c.id); message.success('已帶入今天'); void reload() }}
              >
                {c.title.length > 18 ? `${c.title.slice(0, 18)}…` : c.title}
              </Tag>
            </Tooltip>
          ))}
        </div>
      )}

      {/* 条目流：按状态分组折叠 */}
      {!loading && items.length === 0 && !loadError && (
        <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
          今天還沒有記錄 —— 在上方輸入一行，或點「AI 助手」把流水账交給系統整理
        </div>
      )}
      {STATUS_GROUPS.map(g => {
        const list = grouped[g.status] ?? []
        if (list.length === 0) return null
        const isCollapsed = collapsed[g.status]
        return (
          <div key={g.status} className="cpm-card">
            <div className="cpm-group__head" onClick={() => setCollapsed(c => ({ ...c, [g.status]: !c[g.status] }))}>
              <span style={{ width: 8, height: 8, borderRadius: 4, background: g.accent, display: 'inline-block' }} />
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>{CPM_STATUS_LABELS[g.status]}</span>
              <span className="cpm-group__count">{list.length} 條</span>
              <div className="cpm-card__line" />
              <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{isCollapsed ? '展開 ⌄' : '收起 ⌃'}</span>
            </div>
            {!isCollapsed && list.map(item => (
              <ItemRow
                key={item.id}
                item={item}
                dateStr={dateStr}
                showWorkHours={activeTemplate?.workHoursEnabled ?? false}
                day={timeByItem.get(item.id)}
                sync={item.rdmSync}
                syncGateOpen={syncGateOpen}
                onFinish={() => void handleFinish(item)}
                onDelete={() => handleDelete(item)}
                onEdit={() => navigate(`/cpm-item-form?id=${item.id}`)}
                onChanged={reload}
              />
            ))}
          </div>
        )
      })}

      <AiAssistantDrawer
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        dateStr={dateStr}
        templateKey={activeTemplate?.templateKey}
        categories={categories}
        onConfirmed={() => { setAiOpen(false); void reload() }}
      />

      <SourceImportModal
        open={sourceOpen}
        onClose={() => setSourceOpen(false)}
        dateStr={dateStr}
        templateKey={activeTemplate?.templateKey}
        categories={categories}
        onImported={() => void reload()}
      />
    </div>
  )
}

/* ==================== 条目行 ==================== */

/** 行内工时 chip：一键代替「打开编辑页填数字」，模板未开启时整排不出现 */
const WORK_HOUR_CHIPS = [0.5, 1, 2, 4, 8]


interface ItemRowProps {
  item: CpmItemVO
  dateStr: string
  showWorkHours: boolean
  /** 本条目当天的投入时段（日视图一次带回，缺失=当天没记过时间） */
  day?: CpmItemTimeVO
  /** RDM 回写状态（仅关联过 RDM 任务的条目有值） */
  sync: CpmItemVO['rdmSync']
  /** 服务端回写总闸；关掉时徽标要说「系統未開啟回寫」而不是停在「未回寫」 */
  syncGateOpen: boolean
  onFinish: () => void
  onDelete: () => void
  onEdit: () => void
  onChanged: () => Promise<void> | void
}

function ItemRow({ item, dateStr, showWorkHours, day, sync, syncGateOpen, onFinish, onDelete, onEdit, onChanged }: ItemRowProps) {
  const { t } = useTranslation()
  const [progressOpen, setProgressOpen] = useState(false)
  const [draftProgress, setDraftProgress] = useState(item.progress)
  const [draftStatus, setDraftStatus] = useState<CpmStatusValue>(item.status)
  const [draftNote, setDraftNote] = useState('')
  const [draftHours, setDraftHours] = useState<number | undefined>(item.workHours ?? undefined)
  const [saving, setSaving] = useState(false)
  const segments = day?.segments ?? []
  const dayMinutes = day?.dayMinutes ?? 0
  /** 契约已随 `cpm:schema:v1.2` 扩到六值，这里不再需要向 TS 妥协的转型 */
  const itemStatus = item.status

  const sourceTag = item.sourceType !== 'manual' ? (
    <Tag color={item.sourceType === 'ai' ? 'purple' : 'blue'} style={{ fontSize: 11, marginInlineEnd: 0 }}>
      {SOURCE_LABELS[item.sourceType] ?? item.sourceType}{item.sourceLabel ? ` · ${item.sourceLabel.slice(0, 16)}` : ''}
    </Tag>
  ) : null

  /**
   * 进度写入只走一条路：交给后端。回写不在这里发起——`CpmItemService.addProgress`
   * 在进度落库后触发 `CpmRdmSyncService`，前端再推一次会出现「本地先成功、后端后失败」
   * 两种互相矛盾的提示，而徽标读的是后端落库后的回写结果。
   */
  const confirmProgress = async () => {
    setSaving(true)
    const progress = draftStatus === CpmStatus.DONE ? 100 : draftProgress
    try {
      await addCpmProgress(item.id, {
        progress,
        status: draftStatus,
        note: draftNote.trim() || undefined,
        // 工时只在模板开启时才提交：未开启的岗位连字段都不出现（低录入成本优先）
        workHours: showWorkHours ? draftHours : undefined,
      })
      setProgressOpen(false)
      setDraftNote('')
      await onChanged()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="cpm-item">
      <div className="cpm-item__main">
        <div className="cpm-item__title">
          {/* 已完成与已取消都降为次要文本：前者是历史、后者不再占用注意力 */}
          {itemStatus === CpmStatus.DONE || itemStatus === CpmStatus.CANCELLED
            ? <span style={{ color: 'var(--text-3)' }}>{item.title}</span>
            : item.title}
        </div>
        <div className="cpm-item__meta">
          <Tag style={{ marginInlineEnd: 0 }}>{item.categoryLabel}</Tag>
          {/* 进行中与待办是这一行的默认语义，不重复标注；其余状态必须显式说出来 */}
          {itemStatus !== CpmStatus.DOING && itemStatus !== CpmStatus.TODO && (
            <Tag color={STATUS_TAG_COLOR[itemStatus]} style={{ marginInlineEnd: 0 }}>{CPM_STATUS_LABELS[itemStatus]}</Tag>
          )}
          {sourceTag}
          {dayMinutes > 0 && (
            <Tooltip title={segments.map(s => `${formatSegmentRange(s.startTime, s.endTime, s.crossesMidnight) ?? formatMinutes(s.durationMinutes)}`).join(' ／ ')}>
              <span className="cpm-item__hours">{t('cpm.worklog.todayInvested', { minutes: formatMinutes(dayMinutes), defaultValue: '今天 {{minutes}}' })}</span>
            </Tooltip>
          )}
          {dayMinutes === 0 && showWorkHours && item.workHours
            ? <span className="cpm-item__hours">{t('cpm.worklog.workHoursChip', { hours: item.workHours, defaultValue: '工時 {{hours}}h' })}</span>
            : null}
          <RdmSyncBadge
            sync={sync}
            globalEnabled={syncGateOpen}
            onToggle={async enabled => { await setCpmRdmSync(item.id, enabled); void onChanged() }}
            onRealign={async () => { await realignCpmRdmSync(item.id); void onChanged() }}
          />
          {item.detail && <Tooltip title={item.detail}><span style={{ color: 'var(--text-3)' }}>{t('cpm.worklog.detailEllipsis', { defaultValue: '詳情…' })}</span></Tooltip>}
        </div>
      </div>
      <Progress
        percent={item.progress}
        size="small"
        className="cpm-item__progress"
        status={itemStatus === CpmStatus.BLOCKED ? 'exception' : itemStatus === CpmStatus.DONE ? 'success' : 'active'}
      />
      {item.recognized && (
        <Tooltip title="已被上級成果認定（績效證據）">
          <span className="cpm-item__badge-recognized"><TrophyFilled /> 已認定</span>
        </Tooltip>
      )}
      <div className="cpm-item__ops">
        <Space size={0} split={<span className="action-split">|</span>}>
          <TimeEntryPopover item={item} dateStr={dateStr} day={day} onChanged={onChanged} />
          <Popover
            open={progressOpen}
            onOpenChange={open => {
              setProgressOpen(open)
              if (open) { setDraftProgress(item.progress); setDraftStatus(item.status); setDraftHours(item.workHours ?? undefined) }
            }}
            trigger="click"
            placement="left"
            title="更新進度"
            content={(
              <div style={{ width: 260 }}>
                <Slider
                  value={draftProgress}
                  onChange={setDraftProgress}
                  marks={{ 0: '0', 50: '50', 100: '100' }}
                  disabled={draftStatus === CpmStatus.DONE}
                />
                <Segmented
                  block
                  value={draftStatus}
                  onChange={v => {
                    const status = v as CpmStatusValue
                    setDraftStatus(status)
                    if (status === CpmStatus.DONE) setDraftProgress(100)
                  }}
                  options={STATUS_GROUPS.map(g => ({ label: CPM_STATUS_LABELS[g.status], value: g.status }))}
                  style={{ margin: '8px 0' }}
                />
                {showWorkHours && (
                  <Space size={4} wrap style={{ marginBottom: 8 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{t('cpm.workHours.label', { defaultValue: '工時:' })}</span>
                    {WORK_HOUR_CHIPS.map(h => (
                      <Tag
                        key={h}
                        color={draftHours === h ? 'orange' : undefined}
                        style={{ cursor: 'pointer', marginInlineEnd: 0 }}
                        onClick={() => setDraftHours(prev => (prev === h ? undefined : h))}
                      >{h}h</Tag>
                    ))}
                  </Space>
                )}
                <Input
                  value={draftNote}
                  onChange={e => setDraftNote(e.target.value)}
                  placeholder="一句話說明（選填）"
                  maxLength={120}
                  size="small"
                />
                <div style={{ textAlign: 'right', marginTop: 8 }}>
                  <Button type="primary" size="small" loading={saving} onClick={() => void confirmProgress()}>保存更新</Button>
                </div>
              </div>
            )}
          >
            <Button type="link" size="small">更新進度</Button>
          </Popover>
          {itemStatus !== CpmStatus.DONE && itemStatus !== CpmStatus.CANCELLED
            && <Button type="link" size="small" onClick={onFinish}>{t('cpm.worklog.finish', { defaultValue: '完成' })}</Button>}
          <Button type="link" size="small" icon={<EditOutlined style={{ fontSize: 11 }} />} onClick={onEdit}>{t('cpm.common.edit', { defaultValue: '編輯' })}</Button>
          <Button type="link" size="small" danger onClick={onDelete}>{t('cpm.common.delete', { defaultValue: '刪除' })}</Button>
        </Space>
      </div>
    </div>
  )
}

/**
 * 来源标签与状态色板一律引用 meta 的单一真源：
 * 页面各存一份词表，六语改造时必然出现「日视图是英文、汇报明细还是中文」这类分叉。
 */
const SOURCE_LABELS = CPM_SOURCE_LABELS
const STATUS_TAG_COLOR = CPM_STATUS_TAG_COLORS
