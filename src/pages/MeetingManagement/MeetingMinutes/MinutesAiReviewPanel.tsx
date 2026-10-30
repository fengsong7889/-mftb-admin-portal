/**
 * AI 提取结果核对面板（真实数据，非样例）。
 *
 * 展示模型给出的议题/行动/未决建议 + 待确认问题（重名、模糊期限、缺负责人），
 * 用户勾选后一次性把选中的建议回传给表单合并。这里只做展示与选择，不写业务数据；
 * 应用与保存仍由 MinutesForm 走既有草稿链路。文案全部走 meeting.minutes.ai.* 双语。
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, Button, Checkbox, Tag } from 'antd'
import { AuditOutlined, FileTextOutlined, LinkOutlined } from '@ant-design/icons'
import CardTitle from '@/components/CardTitle'
import HelpPopover from '@/components/HelpPopover'
import type { MinutesAiExtractionVO, MinutesAiIssue } from '@/api/meetingMinutes'
import type { MergeSelection } from './minutesAiMapper'

interface Props {
  result: MinutesAiExtractionVO
  noteText: string
  stale: boolean
  disabled?: boolean
  onApply: (selection: MergeSelection) => void
  onDiscard: () => void
  onManual: () => void
}

function issueFor(issues: MinutesAiIssue[], ref: string | undefined, field: string) {
  return issues.find(issue => issue.proposalKey === ref && issue.field === field)
}

export default function MinutesAiReviewPanel({ result, noteText, stale, disabled, onApply, onDiscard, onManual }: Props) {
  const { t } = useTranslation()
  const proposal = result.proposal
  const issues = result.issues ?? []
  const [selection, setSelection] = useState<MergeSelection>(() => ({
    purpose: !!proposal?.purpose,
    itemRefs: (proposal?.items ?? []).map(item => item.ref!).filter(Boolean),
    actionRefs: (proposal?.actions ?? []).map(action => action.ref!).filter(Boolean),
    openIssueRefs: (proposal?.openIssues ?? []).map(issue => issue.ref!).filter(Boolean),
  }))
  const readOnly = disabled || stale
  const selectedCount = Number(selection.purpose) + selection.itemRefs.length + selection.actionRefs.length + selection.openIssueRefs.length
  const pendingCount = issues.filter(issue => issue.field === 'ownerUserId' || issue.field === 'dueDate').length

  const toggle = (list: string[], ref: string, on: boolean) =>
    on ? [...new Set([...list, ref])] : list.filter(item => item !== ref)

  if (!proposal) {
    return <Alert type="info" showIcon message={t('meeting.minutes.ai.noSuggestion')} description={t('meeting.minutes.ai.noSuggestionHint')}
      action={<Button onClick={onManual} disabled={disabled}>{t('meeting.minutes.ai.continueManual')}</Button>} />
  }

  return (
    <section className="mm-ai-review" aria-label={t('meeting.minutes.ai.reviewRegion')}>
      <CardTitle icon={<AuditOutlined />} tone="purple" title={t('meeting.minutes.ai.reviewTitle')} tag={<Tag color="purple">{t('meeting.minutes.ai.aiSuggestion')}</Tag>} />
      <div className="mm-ai-review__summary">
        <span><b>{proposal.items.length}</b> {t('meeting.minutes.ai.topicCount')}</span>
        <span><b>{proposal.actions.length}</b> {t('meeting.minutes.ai.actionCount')}</span>
        <span><b>{proposal.openIssues.length}</b> {t('meeting.minutes.ai.issueCount')}</span>
        <Tag color={pendingCount ? 'orange' : 'green'}>{pendingCount ? t('meeting.minutes.ai.pendingConfirm', { count: pendingCount }) : t('meeting.minutes.ai.allResolved')}</Tag>
      </div>
      {stale && <Alert type="warning" showIcon style={{ margin: '12px 0' }} message={t('meeting.minutes.ai.staleTitle')} description={t('meeting.minutes.ai.staleHint')} />}

      <div className="mm-ai-review__columns">
        <div className="mm-ai-review__suggestions">
          {proposal.purpose && <div className="mm-ai-review__item">
            <Checkbox checked={selection.purpose} disabled={readOnly}
              onChange={event => setSelection(previous => ({ ...previous, purpose: event.target.checked }))}>
              {t('meeting.minutes.ai.fillPurpose')}
            </Checkbox>
            <p className="mm-ai-review__purpose">{proposal.purpose}</p>
            <p className="mm-ai__hint">{t('meeting.minutes.ai.fillPurposeHint')}</p>
          </div>}

          {proposal.items.map((item, index) => {
            const ref = item.ref ?? `item-${index}`
            const checked = selection.itemRefs.includes(ref)
            return <div className="mm-ai-review__item" key={ref}>
              <div className="mm-ai-review__item-heading">
                <Checkbox checked={checked} disabled={readOnly}
                  onChange={event => setSelection(previous => ({ ...previous, itemRefs: toggle(previous.itemRefs, ref, event.target.checked) }))}>
                  {t('meeting.minutes.ai.includeTopic')}
                </Checkbox>
                <Tag color="blue">{t('meeting.minutes.ai.topicLabel', { no: index + 1 })}</Tag>
              </div>
              <p className="mm-ai-review__strong">{item.topic}</p>
              {item.discussion && <p className="mm-ai-review__body">{item.discussion}</p>}
              {item.conclusion && <p className="mm-ai-review__body">{t('meeting.minutes.ai.conclusionPrefix')}{item.conclusion}</p>}
              <p className="mm-ai__hint"><LinkOutlined /> {t('meeting.minutes.ai.sourcePrefix')}{(item.sourceRefs ?? []).join('、')}</p>
            </div>
          })}

          {proposal.actions.map((action, index) => {
            const ref = action.ref ?? `action-${index}`
            const ownerIssue = issueFor(issues, ref, 'ownerUserId')
            const dueIssue = issueFor(issues, ref, 'dueDate')
            return <div className="mm-ai-review__item" key={ref}>
              <div className="mm-ai-review__item-heading">
                <Checkbox checked={selection.actionRefs.includes(ref)} disabled={readOnly}
                  onChange={event => setSelection(previous => ({ ...previous, actionRefs: toggle(previous.actionRefs, ref, event.target.checked) }))}>
                  {t('meeting.minutes.ai.includeAction')}
                </Checkbox>
                <Tag color="green">{t('meeting.minutes.ai.actionLabel', { no: index + 1 })}</Tag>
              </div>
              <p className="mm-ai-review__strong">{action.content}</p>
              <p className="mm-ai-review__meta">
                {t('meeting.minutes.ai.ownerLabel')}：
                {action.ownerUserId
                  ? <Tag color="blue">{action.ownerName}{action.ownerEmpNo ? `（${action.ownerEmpNo}）` : ''}</Tag>
                  : <Tag color="orange">{t('meeting.minutes.ai.pendingOwner')}{ownerIssue?.candidates?.length ? t('meeting.minutes.ai.candidateSuffix', { count: ownerIssue.candidates.length }) : ''}</Tag>}
                {' '}{t('meeting.minutes.ai.dueLabel')}：
                {action.dueDate ? <Tag>{action.dueDate}</Tag> : <Tag color="orange">{t('meeting.minutes.ai.pendingDue')}{dueIssue ? ` · ${dueIssue.code}` : ''}</Tag>}
              </p>
              {action.deliverable && <p className="mm-ai-review__body">{t('meeting.minutes.ai.deliverablePrefix')}{action.deliverable}</p>}
              <p className="mm-ai__hint"><LinkOutlined /> {t('meeting.minutes.ai.sourcePrefix')}{(action.sourceRefs ?? []).join('、')}</p>
            </div>
          })}

          {proposal.openIssues.map((issue, index) => {
            const ref = issue.ref ?? `issue-${index}`
            return <div className="mm-ai-review__item" key={ref}>
              <div className="mm-ai-review__item-heading">
                <Checkbox checked={selection.openIssueRefs.includes(ref)} disabled={readOnly}
                  onChange={event => setSelection(previous => ({ ...previous, openIssueRefs: toggle(previous.openIssueRefs, ref, event.target.checked) }))}>
                  {t('meeting.minutes.ai.includeIssue')}
                </Checkbox>
                <Tag color="orange">{t('meeting.minutes.ai.pendingDecisionTag')}</Tag>
              </div>
              <p className="mm-ai-review__strong">{issue.content}</p>
              <p className="mm-ai__hint"><LinkOutlined /> {t('meeting.minutes.ai.sourcePrefix')}{(issue.sourceRefs ?? []).join('、')}</p>
            </div>
          })}
        </div>

        <aside className="mm-ai-review__evidence" aria-label={t('meeting.minutes.ai.evidenceRegion')}>
          <h4><FileTextOutlined /> {t('meeting.minutes.ai.evidenceTitle')}</h4>
          <span className="mm-ai__hint">{t('meeting.minutes.ai.meetingDateLabel')} {result.context?.meetingDate ?? '-'} · {result.context?.timezone ?? '-'}</span>
          <blockquote>{noteText}</blockquote>
          {pendingCount > 0 && <div className="mm-ai-review__boundary"><span>{t('meeting.minutes.ai.pendingNote')}</span></div>}
          <p className="mm-ai__hint">
            {t('meeting.minutes.ai.appendOnlyNote')}
            <HelpPopover title={t('meeting.minutes.ai.applyScopeTitle')} ariaLabel={t('meeting.minutes.ai.applyScopeTitle')} content={[
              { tone: 'info', label: t('meeting.minutes.ai.applyScopeKeepLabel'), body: t('meeting.minutes.ai.applyScopeKeepBody') },
              { tone: 'warn', label: t('meeting.minutes.ai.applyScopePublishLabel'), body: t('meeting.minutes.ai.applyScopePublishBody') },
            ]} />
          </p>
        </aside>
      </div>

      <div className="mm-ai-review__footer">
        <span aria-live="polite">{t('meeting.minutes.ai.selectedCount', { count: selectedCount })}</span>
        <Button disabled={disabled} onClick={onDiscard}>{t('meeting.minutes.ai.discard')}</Button>
        <Button type="primary" disabled={readOnly || !selectedCount} onClick={() => onApply(selection)}>{t('meeting.minutes.ai.applyToForm')}</Button>
      </div>
    </section>
  )
}
