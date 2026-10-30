/**
 * 自由笔记 + AI 提取触发面板（受控组件，真实数据链路）。
 *
 * 状态与请求都由 MinutesForm 持有的 hooks 驱动，这里只负责输入、展示保存/提取状态、
 * 插入 @员工、触发提取与渲染核对结果。不直接调模型或写业务数据。文案全部走 meeting.minutes.ai.* 双语。
 */
import { useEffect, useRef, useState } from 'react'
import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, Button, Mentions, Spin } from 'antd'
import type { MentionsRef } from 'antd/es/mentions'
import { ArrowRightOutlined, CloudOutlined, FileTextOutlined, LoadingOutlined, RobotOutlined } from '@ant-design/icons'
import CardTitle from '@/components/CardTitle'
import EmployeeSelect from '@/components/EmployeeSelect'
import HelpPopover from '@/components/HelpPopover'
import MinutesAiReviewPanel from './MinutesAiReviewPanel'
import type { AiPhase } from './useMinutesAiAssist'
import type { NoteSaveState } from './useMinutesNoteDraft'
import type { MinutesAiExtractionVO, MinutesAiStatusVO, MinutesNoteMention } from '@/api/meetingMinutes'
import { newMeetingRequestKey } from '@/api/meeting'
import type { MergeSelection } from './minutesAiMapper'
import './minutesAi.css'

export interface Props {
  text: string
  onTextChange: (value: string) => void
  mentions: MinutesNoteMention[]
  onMentionsChange: (value: MinutesNoteMention[]) => void
  saveState: NoteSaveState
  maxChars: number
  aiStatus?: MinutesAiStatusVO
  phase: AiPhase
  result?: MinutesAiExtractionVO
  errorCode?: string
  stale: boolean
  disabled?: boolean
  people?: ComponentProps<typeof EmployeeSelect>['seed']
  onExtract: () => void
  onManual: () => void
  onApply: (selection: MergeSelection) => void
  onDiscard: () => void
  onReload: () => void
  onRefreshAiStatus?: () => void
}

const SAVE_LABEL_KEY: Record<NoteSaveState, string> = {
  loading: 'meeting.minutes.ai.saveLoading', idle: 'meeting.minutes.ai.saveIdle', saving: 'meeting.minutes.ai.saveSaving',
  saved: 'meeting.minutes.ai.saveSaved', unsynced: 'meeting.minutes.ai.saveUnsynced', conflict: 'meeting.minutes.ai.saveConflict',
}
const SAVE_TONE: Record<NoteSaveState, string> = {
  loading: '#8c8c8c', idle: '#8c8c8c', saving: '#1890ff', saved: '#52c41a', unsynced: '#fa8c16', conflict: '#fa8c16',
}

/** reasonCode → i18n key（值均为 ASCII，不计入硬编码）；后端已优先回 message，此表仅作旧响应兼容。 */
const AI_REASON_KEYS: Record<string, string> = {
  feature_off: 'meeting.minutes.ai.reason.feature_off',
  scene_disabled: 'meeting.minutes.ai.reason.feature_off',
  no_channel: 'meeting.minutes.ai.reason.no_channel',
  no_model_auth: 'meeting.minutes.ai.reason.no_model_auth',
  quota_reject: 'meeting.minutes.ai.reason.quota_reject',
  quota_exhausted: 'meeting.minutes.ai.reason.quota_reject',
  quota_approval_required: 'meeting.minutes.ai.reason.quota_approval',
  budget_exceeded: 'meeting.minutes.ai.reason.budget',
  no_permission: 'meeting.minutes.ai.reason.no_permission',
  admission_unavailable: 'meeting.minutes.ai.reason.unavailable',
  check_failed: 'meeting.minutes.ai.reason.unavailable',
}

export default function MinutesAiInputPanel(props: Props) {
  const { t } = useTranslation()
  const { text, onTextChange, mentions, onMentionsChange, saveState, maxChars, aiStatus, phase, result,
    errorCode, stale, disabled, people, onExtract, onManual, onApply, onDiscard, onReload, onRefreshAiStatus } = props
  const textarea = useRef<MentionsRef>(null)
  const selection = useRef<{ start: number; end: number }>()
  const pendingCaret = useRef<number>()
  const changedMentions = useRef<MinutesNoteMention[]>(mentions)
  const acceptedChange = useRef(true)
  const [showMention, setShowMention] = useState(false)
  const [pickedPeople, setPickedPeople] = useState<NonNullable<Props['people']>>([])
  const processing = phase === 'processing'
  const checking = phase === 'checking'
  const inputDisabled = disabled || saveState === 'loading'
  const aiAvailable = aiStatus?.available === true
  // 能记笔记不等于能调 AI：未授权时隐藏提取入口，仅保留手动填写。
  const aiAuthorized = aiStatus?.authorized !== false
  const aiBlockedReason = aiStatus && !aiStatus.available
    ? aiStatus.message ?? t(AI_REASON_KEYS[aiStatus.reasonCode ?? ''] ?? 'meeting.minutes.ai.reason.default')
    : undefined
  const failed = phase === 'failed' || phase === 'unknown'
  // @ 候选只复用本页已获授权的人员快照；其他员工仍走统一 EmployeeSelect 在职搜索。
  const mentionPeople = [...new Map([...(people ?? []), ...pickedPeople]
    .filter(person => person.id > 0 && person.name.trim())
    .map(person => [person.id, person])).values()]
  const options = mentionPeople.map(person => ({
    key: String(person.id), value: person.name,
    label: <span className="mm-ai__person"><span>{person.name}</span><small>{person.empId}</small></span>,
  }))

  useEffect(() => {
    if (pendingCaret.current == null) return
    textarea.current?.focus()
    textarea.current?.textarea?.setSelectionRange(pendingCaret.current, pendingCaret.current)
    pendingCaret.current = undefined
  }, [text])

  const handleTextChange = (nextText: string) => {
    acceptedChange.current = !inputDisabled && nextText.length <= maxChars
    if (!acceptedChange.current) return
    // 删除提及文字后同步清理绑定；真实员工身份与可见范围仍需服务端重验。
    const retained = mentions.filter(mention => nextText.includes(`@${mention.name}`))
    changedMentions.current = retained
    if (retained.length !== mentions.length) onMentionsChange(retained)
    onTextChange(nextText)
  }

  const handleMentionSelect = (option: { key?: string }) => {
    if (!acceptedChange.current || inputDisabled) return
    const person = mentionPeople.find(item => String(item.id) === option.key)
    if (!person) return
    onMentionsChange([...changedMentions.current, {
      mentionRef: newMeetingRequestKey('mention'), userId: person.id, name: person.name,
    }])
  }

  const handlePick = (picked: { id: number; name: string; empId?: string }[]) => {
    const person = picked[0]
    if (!person || inputDisabled) return
    const range = selection.current ?? { start: text.length, end: text.length }
    const before = text.slice(0, range.start)
    // 从通用搜索选人时也插在原光标处，并替换尚未完成的 @ 搜索词，不强制追加到文末。
    const query = before.match(/@[^\s@，。！？,!?]*$/)
    const start = query ? before.length - query[0].length : range.start
    const insertion = `@${person.name} `
    const nextText = text.slice(0, start) + insertion + text.slice(range.end)
    if (nextText.length > maxChars) return
    pendingCaret.current = start + insertion.length
    handleTextChange(nextText)
    onMentionsChange([...changedMentions.current, {
      mentionRef: newMeetingRequestKey('mention'), userId: person.id, name: person.name,
    }])
    setPickedPeople(previous => [...previous.filter(item => item.id !== person.id), person])
    setShowMention(false)
  }

  return (
    <section className="mm-ai" aria-label={t('meeting.minutes.ai.inputRegion')}>
      <div className="mm-ai__input-card">
        <CardTitle icon={<FileTextOutlined />} tone="info" title={t('meeting.minutes.ai.noteCardTitle')}
          note={<HelpPopover title={t('meeting.minutes.ai.helpTitle')} ariaLabel={t('meeting.minutes.ai.helpTitle')} placement="bottomRight" content={[
            { tone: 'info', label: t('meeting.minutes.ai.helpAutosaveLabel'), body: t('meeting.minutes.ai.helpAutosaveBody') },
            { tone: 'neutral', label: t('meeting.minutes.ai.helpManualLabel'), body: t('meeting.minutes.ai.helpManualBody') },
            { tone: 'warn', label: t('meeting.minutes.ai.helpConfirmLabel'), body: t('meeting.minutes.ai.helpConfirmBody') },
          ]} />} />
        <p className="mm-ai__description">{t('meeting.minutes.ai.introSubtitle')}</p>
        <div className="mm-ai__editor-heading">
          <label className="mm-ai__input-label" htmlFor="minutes-note-input">{t('meeting.minutes.ai.noteLabel')}</label>
          <span className="mm-ai__hint" id="minutes-note-mention-hint">{t('meeting.minutes.ai.mentionHint', { defaultValue: '輸入 @ 選參會人' })}</span>
          <Button type="text" size="small" disabled={inputDisabled} onClick={() => setShowMention(open => !open)} aria-expanded={showMention}
            aria-controls="minutes-note-mention">{t('meeting.minutes.ai.insertEmployee')}</Button>
        </div>
        <Mentions ref={textarea} id="minutes-note-input" value={text} disabled={inputDisabled}
          className="mm-ai__editor" popupClassName="mm-ai__people-popup" aria-describedby="minutes-note-mention-hint"
          rows={8} autoSize={{ minRows: 8, maxRows: 18 }} maxLength={maxChars}
          options={options} validateSearch={query => !/[\s@，。！？,!?]/.test(query)}
          filterOption={(query, option) => {
            const person = mentionPeople.find(item => String(item.id) === option.key)
            return `${person?.name ?? ''} ${person?.empId ?? ''}`.toLowerCase().includes(query.toLowerCase())
          }}
          notFoundContent={<span className="mm-ai__hint">{t('meeting.minutes.ai.mentionEmpty', { defaultValue: '未找到參會人，可用「插入 @員工」搜尋' })}</span>}
          placeholder={t('meeting.minutes.ai.notePlaceholder')}
          onChange={handleTextChange} onSelect={handleMentionSelect}
          onKeyDownCapture={event => {
            // 中文输入法确认候选时不能同时选中 @ 人员。
            if (event.nativeEvent.isComposing && event.key === 'Enter') event.stopPropagation()
          }}
          onBlur={event => {
            selection.current = { start: event.target.selectionStart, end: event.target.selectionEnd }
            onReload()
          }} />
        <div className="mm-ai__input-meta">
          <span className="mm-ai__save-state" role="status" style={{ color: SAVE_TONE[saveState] }}>
            <CloudOutlined /> {t(SAVE_LABEL_KEY[saveState])}
          </span>
          <span className="mm-ai__count">{text.length.toLocaleString()} / {maxChars.toLocaleString()}</span>
        </div>
        {showMention && <div className="mm-ai__mention" id="minutes-note-mention" role="group" aria-label={t('meeting.minutes.ai.insertEmployeeRegion')}>
          <EmployeeSelect single seed={people} value={[]} disabled={inputDisabled} onPick={handlePick}
            style={{ width: '100%' }} placeholder={t('meeting.minutes.ai.searchEmployee')} />
          <span className="mm-ai__hint">{t('meeting.minutes.ai.insertEmployeeHint')}</span>
        </div>}

        {aiAuthorized && aiBlockedReason && <Alert className="mm-ai__availability" type="warning" showIcon
          message={t('meeting.minutes.ai.aiUnavailable', { reason: aiBlockedReason })}
          description={t('meeting.minutes.ai.aiUnavailableHint')}
          action={onRefreshAiStatus && <Button size="small" aria-label={t('common.retry')} loading={checking} disabled={disabled || processing || checking}
            onClick={onRefreshAiStatus}>{t('common.retry')}</Button>} />}

        <div className="mm-ai__actions">
          {aiAuthorized && <Button type="primary" aria-label={t('meeting.minutes.ai.extract')} icon={<RobotOutlined aria-hidden="true" />} loading={processing || checking}
            disabled={inputDisabled || !text.trim() || !aiAvailable || processing || checking} onClick={onExtract}>{t('meeting.minutes.ai.extract')}</Button>}
          <Button icon={<ArrowRightOutlined aria-hidden="true" />} disabled={disabled} onClick={onManual}>{t('meeting.minutes.ai.continueManual')}</Button>
          {aiAuthorized && checking && <span className="mm-ai__hint" role="status">{t('meeting.minutes.ai.checkingStatus', { defaultValue: '正在檢查 AI 可用狀態…' })}</span>}
        </div>
      </div>

      {processing && <div className="mm-ai__processing" role="status" aria-live="polite">
        <Spin indicator={<LoadingOutlined spin />} />
        <div><strong>{t('meeting.minutes.ai.processingTitle')}</strong><p>{t('meeting.minutes.ai.processingHint')}</p></div>
      </div>}

      {failed && <Alert className="mm-ai__failure" type="warning" showIcon
        message={t('meeting.minutes.ai.failedTitle')} description={t('meeting.minutes.ai.failedHint', { code: errorCode ?? 'unknown' })}
        action={<Button onClick={onManual} disabled={disabled}>{t('meeting.minutes.ai.continueManual')}</Button>} />}

      {result && (phase === 'succeeded' || stale) && <MinutesAiReviewPanel result={result} noteText={text} stale={stale}
        disabled={disabled} onApply={onApply} onDiscard={onDiscard} onManual={onManual} />}
    </section>
  )
}
