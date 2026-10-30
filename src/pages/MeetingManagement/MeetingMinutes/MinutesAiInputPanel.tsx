/**
 * 自由笔记 + AI 提取触发面板（受控组件，真实数据链路）。
 *
 * 状态与请求都由 MinutesForm 持有的 hooks 驱动，这里只负责输入、展示保存/提取状态、
 * 插入 @员工、触发提取与渲染核对结果。不直接调模型或写业务数据。文案全部走 meeting.minutes.ai.* 双语。
 */
import { useRef, useState } from 'react'
import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, Button, Input, Spin } from 'antd'
import type { TextAreaRef } from 'antd/es/input/TextArea'
import { ArrowRightOutlined, CloudOutlined, LoadingOutlined, RobotOutlined } from '@ant-design/icons'
import CardTitle from '@/components/CardTitle'
import EmployeeSelect from '@/components/EmployeeSelect'
import HelpPopover from '@/components/HelpPopover'
import MinutesAiReviewPanel from './MinutesAiReviewPanel'
import type { AiPhase } from './useMinutesAiAssist'
import type { NoteSaveState } from './useMinutesNoteDraft'
import type { MinutesAiExtractionVO, MinutesAiStatusVO, MinutesNoteMention } from '@/api/meetingMinutes'
import type { MergeSelection } from './minutesAiMapper'

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
}

const SAVE_LABEL_KEY: Record<NoteSaveState, string> = {
  loading: 'meeting.minutes.ai.saveLoading', idle: 'meeting.minutes.ai.saveIdle', saving: 'meeting.minutes.ai.saveSaving',
  saved: 'meeting.minutes.ai.saveSaved', unsynced: 'meeting.minutes.ai.saveUnsynced', conflict: 'meeting.minutes.ai.saveConflict',
}
const SAVE_TONE: Record<NoteSaveState, string> = {
  loading: '#8c8c8c', idle: '#8c8c8c', saving: '#1890ff', saved: '#52c41a', unsynced: '#fa8c16', conflict: '#fa8c16',
}

export default function MinutesAiInputPanel(props: Props) {
  const { t } = useTranslation()
  const { text, onTextChange, mentions, onMentionsChange, saveState, maxChars, aiStatus, phase, result,
    errorCode, stale, disabled, people, onExtract, onManual, onApply, onDiscard, onReload } = props
  const textarea = useRef<TextAreaRef>(null)
  const [showMention, setShowMention] = useState(false)
  const processing = phase === 'processing' || phase === 'checking'
  const aiAvailable = aiStatus?.available === true
  const aiBlockedReason = aiStatus && !aiStatus.available ? aiStatus.reasonCode : undefined
  const failed = phase === 'failed' || phase === 'unknown'

  const handlePick = (picked: { id: number; name: string; empId?: string }[]) => {
    const person = picked[0]
    if (!person) return
    const mentionRef = `m${Date.now().toString(36)}`
    const insertion = ` @${person.name}`
    if ((text + insertion).length > maxChars) return
    const next: MinutesNoteMention = { mentionRef, userId: person.id, name: person.name }
    onMentionsChange([...mentions, next])
    onTextChange(text + insertion)
    setShowMention(false)
    textarea.current?.focus()
  }

  return (
    <section className="mm-ai" aria-label={t('meeting.minutes.ai.inputRegion')}>
      <div className="mm-ai__intro">
        <div className="mm-ai__intro-icon"><RobotOutlined /></div>
        <div>
          <h3>{t('meeting.minutes.ai.introTitle')}</h3>
          <p>{t('meeting.minutes.ai.introSubtitle')}</p>
        </div>
        <HelpPopover title={t('meeting.minutes.ai.helpTitle')} ariaLabel={t('meeting.minutes.ai.helpTitle')} placement="bottomRight" content={[
          { tone: 'info', label: t('meeting.minutes.ai.helpAutosaveLabel'), body: t('meeting.minutes.ai.helpAutosaveBody') },
          { tone: 'neutral', label: t('meeting.minutes.ai.helpManualLabel'), body: t('meeting.minutes.ai.helpManualBody') },
          { tone: 'warn', label: t('meeting.minutes.ai.helpConfirmLabel'), body: t('meeting.minutes.ai.helpConfirmBody') },
        ]} />
      </div>

      <div className="mm-ai__input-card">
        <CardTitle icon={<RobotOutlined />} tone="info" title={t('meeting.minutes.ai.noteCardTitle')} />
        <label className="mm-ai__input-label" htmlFor="minutes-note-input">{t('meeting.minutes.ai.noteLabel')}</label>
        <Input.TextArea ref={textarea} id="minutes-note-input" value={text} disabled={disabled}
          rows={8} autoSize={{ minRows: 8, maxRows: 22 }} maxLength={maxChars} showCount
          placeholder={t('meeting.minutes.ai.notePlaceholder')}
          onChange={event => onTextChange(event.target.value)} onBlur={() => void onReload} />
        <div className="mm-ai__input-meta">
          <span className="mm-ai__save-state" role="status" style={{ color: SAVE_TONE[saveState] }}>
            <CloudOutlined /> {t(SAVE_LABEL_KEY[saveState])}
          </span>
          <Button type="text" disabled={disabled} onClick={() => setShowMention(open => !open)} aria-expanded={showMention}
            aria-controls="minutes-note-mention">{t('meeting.minutes.ai.insertEmployee')}</Button>
        </div>
        {showMention && <div className="mm-ai__mention" id="minutes-note-mention" role="group" aria-label={t('meeting.minutes.ai.insertEmployeeRegion')}>
          <EmployeeSelect single seed={people} value={[]} disabled={disabled} onPick={handlePick}
            style={{ width: '100%' }} placeholder={t('meeting.minutes.ai.searchEmployee')} />
          <span className="mm-ai__hint">{t('meeting.minutes.ai.insertEmployeeHint')}</span>
        </div>}

        {aiBlockedReason && <Alert type="warning" showIcon style={{ marginTop: 12 }}
          message={t('meeting.minutes.ai.aiUnavailable', { reason: aiBlockedReason })}
          description={t('meeting.minutes.ai.aiUnavailableHint')} />}

        <div className="mm-ai__actions">
          <Button type="primary" icon={<RobotOutlined aria-hidden="true" />} loading={processing}
            disabled={disabled || !text.trim() || !aiAvailable} onClick={onExtract}>{t('meeting.minutes.ai.extract')}</Button>
          <Button icon={<ArrowRightOutlined aria-hidden="true" />} disabled={disabled} onClick={onManual}>{t('meeting.minutes.ai.continueManual')}</Button>
          {!aiAvailable && <span className="mm-ai__hint">{t('meeting.minutes.ai.aiUnavailableFallback')}</span>}
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
