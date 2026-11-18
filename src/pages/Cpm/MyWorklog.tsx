/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Button, DatePicker, Input, Modal, Popover, Progress, Segmented, Select, Slider, Space, Tag, Tooltip, message } from 'antd'
import {
  EditOutlined, HistoryOutlined, ImportOutlined,
  LeftOutlined, RightOutlined, RobotOutlined, ThunderboltOutlined, TrophyFilled,
} from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import { useTranslation } from 'react-i18next'
import {
  addCpmProgress, carryCpmItem, createCpmItem, deleteCpmItem, fetchCpmDay, fetchCpmTemplates,
  type CpmDayVO, type CpmItemVO, type CpmTemplateVO,
} from '@/api/cpm'
import { CPM_STATUS_LABELS, CpmStatus, type CpmStatusValue } from './meta'
import AiAssistantDrawer from './AiAssistantDrawer'
import SourceImportModal from './SourceImportModal'
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

const STATUS_GROUPS: { status: CpmStatusValue; accent: string }[] = [
  { status: CpmStatus.DOING, accent: 'var(--info)' },
  { status: CpmStatus.TODO, accent: 'var(--warning)' },
  { status: CpmStatus.DONE, accent: 'var(--success)' },
  { status: CpmStatus.BLOCKED, accent: 'var(--danger)' },
]

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
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

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

interface ItemRowProps {
  item: CpmItemVO
  dateStr: string
  showWorkHours: boolean
  onFinish: () => void
  onDelete: () => void
  onEdit: () => void
  onChanged: () => Promise<void> | void
}

function ItemRow({ item, showWorkHours, onFinish, onDelete, onEdit, onChanged }: ItemRowProps) {
  const [progressOpen, setProgressOpen] = useState(false)
  const [draftProgress, setDraftProgress] = useState(item.progress)
  const [draftStatus, setDraftStatus] = useState<CpmStatusValue>(item.status)
  const [draftNote, setDraftNote] = useState('')
  const [saving, setSaving] = useState(false)

  const sourceTag = item.sourceType !== 'manual' ? (
    <Tag color={item.sourceType === 'ai' ? 'purple' : 'blue'} style={{ fontSize: 11, marginInlineEnd: 0 }}>
      {SOURCE_LABELS[item.sourceType] ?? item.sourceType}{item.sourceLabel ? ` · ${item.sourceLabel.slice(0, 16)}` : ''}
    </Tag>
  ) : null

  const confirmProgress = async () => {
    setSaving(true)
    try {
      await addCpmProgress(item.id, {
        progress: draftStatus === CpmStatus.DONE ? 100 : draftProgress,
        status: draftStatus,
        note: draftNote.trim() || undefined,
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
          {item.status === CpmStatus.DONE ? <span style={{ color: 'var(--text-3)' }}>{item.title}</span> : item.title}
        </div>
        <div className="cpm-item__meta">
          <Tag style={{ marginInlineEnd: 0 }}>{item.categoryLabel}</Tag>
          {item.status === CpmStatus.BLOCKED && <Tag color="red" style={{ marginInlineEnd: 0 }}>受阻</Tag>}
          {sourceTag}
          {showWorkHours && item.workHours ? <span>工時 {item.workHours}h</span> : null}
          {item.detail && <Tooltip title={item.detail}><span style={{ color: 'var(--text-3)' }}>詳情…</span></Tooltip>}
        </div>
      </div>
      <Progress
        percent={item.progress}
        size="small"
        className="cpm-item__progress"
        status={item.status === CpmStatus.BLOCKED ? 'exception' : item.status === CpmStatus.DONE ? 'success' : 'active'}
      />
      {item.recognized && (
        <Tooltip title="已被上級成果認定（績效證據）">
          <span className="cpm-item__badge-recognized"><TrophyFilled /> 已認定</span>
        </Tooltip>
      )}
      <div className="cpm-item__ops">
        <Space size={0} split={<span className="action-split">|</span>}>
          <Popover
            open={progressOpen}
            onOpenChange={open => {
              setProgressOpen(open)
              if (open) { setDraftProgress(item.progress); setDraftStatus(item.status) }
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
          {item.status !== CpmStatus.DONE && <Button type="link" size="small" onClick={onFinish}>完成</Button>}
          <Button type="link" size="small" icon={<EditOutlined style={{ fontSize: 11 }} />} onClick={onEdit}>編輯</Button>
          <Button type="link" size="small" danger onClick={onDelete}>刪除</Button>
        </Space>
      </div>
    </div>
  )
}

const SOURCE_LABELS: Record<string, string> = {
  ai: 'AI 整理',
  rdm_requirement: 'RDM 需求',
  meeting_action: '會議行動項',
}
