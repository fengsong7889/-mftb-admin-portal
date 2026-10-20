/**
 * 纪要正文只读渲染卡（查看页 / 免登页 / 发送摘要三处共用）。
 *
 * <p>为什么抽成一份而不是每页各写一遍：三处讲的是同一件事（这份纪要写了什么），
 * 分开写必然出现「查看页有行動項、免登页漏了」，用户就会怀疑两个页面看的不是同一份纪要。
 *
 * <p>版式与钉钉卡片的关系：钉钉实际正文由后端 MeetingMinutesRenderer 生成（唯一渲染出口），
 * 本组件按同一分区口径排版，但钉钉 markdown 不支持表格，所以行动项在两处都是列表形态。
 */
import { Space, Tag, Timeline } from 'antd'
import { useTranslation } from 'react-i18next'
import type { CSSProperties, ReactNode } from 'react'
import type { MinutesContent } from '../../../api/meetingMinutes'

interface Props {
  content: MinutesContent
  /** 紧凑模式（弹窗内摘要）：去掉模块标题的留白，只留内容 */
  compact?: boolean
  /**
   * 隐藏行动项与跟进事项：查看页把这两类放在可更新状态的独立表格里，
   * 正文再渲染一遍会出现「行動項 0 / 無行動項」与下方表格自相矛盾。
   * 发送预览/免登页不传，保持它们看到完整正文。
   */
  hideTracked?: boolean
}

const sectionTitleStyle: CSSProperties = { fontSize: 13, fontWeight: 600, color: '#262626', margin: '0 0 8px' }
const mutedStyle: CSSProperties = { fontSize: 12, color: '#8C8C8C' }
const bodyStyle: CSSProperties = { fontSize: 13, color: '#595959', lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }

/**
 * 分区容器：标题 + 可选计数 Tag + 内容。
 * 定义在组件外而不是 render 内部：内部定义会每次渲染换掉组件身份，受控子树被重建。
 */
function Section({ title, tag, compact, children }: { title: string; tag?: ReactNode; compact?: boolean; children: ReactNode }) {
  return (
    <div style={{ marginBottom: compact ? 10 : 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={sectionTitleStyle}>{title}</span>
        {tag}
      </div>
      {children}
    </div>
  )
}

export default function MinutesContentCard({ content, compact, hideTracked }: Props) {
  const { t } = useTranslation()
  const items = content.items ?? []
  const actions = content.actions ?? []
  const openIssues = content.openIssues ?? []
  const absentees = content.absentees ?? []

  return (
    <div>
      <Section title={t('meeting.minutes.sectionAgenda', { defaultValue: '議程與結論' })} compact={compact}>
        {items.length === 0 ? (
          <span style={mutedStyle}>{t('meeting.minutes.agendaEmpty', { defaultValue: '未填寫議題' })}</span>
        ) : (
          // 议题用时间线而不是表格：议题数不定、每项三段文字，表格在窄屏与钉钉里都会挤成一团
          <Timeline
            items={items.map((item, index) => ({
              color: item.conclusion?.trim() ? 'green' : 'blue',
              children: (
                <Space direction="vertical" size={2}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#262626' }}>
                    {`${index + 1}. ${item.topic?.trim() || t('meeting.minutes.topicUntitled', { defaultValue: '未命名議題' })}`}
                  </span>
                  {item.discussion?.trim() && <div style={bodyStyle}>{item.discussion}</div>}
                  {item.conclusion?.trim() && (
                    <div style={{ ...bodyStyle, color: '#389E0D' }}>
                      {`${t('meeting.minutes.conclusionPrefix', { defaultValue: '結論：' })}${item.conclusion}`}
                    </div>
                  )}
                </Space>
              ),
            }))}
          />
        )}
      </Section>

      {!hideTracked && (
      <Section
        title={t('meeting.minutes.sectionActions', { defaultValue: '行動項' })}
        tag={<Tag style={{ fontSize: 11 }}>{actions.length}</Tag>}
        compact={compact}
      >
        {actions.length === 0 ? (
          <span style={mutedStyle}>{t('meeting.minutes.actionsEmpty', { defaultValue: '無行動項' })}</span>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {actions.map((action, index) => (
              <div key={index} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <span style={{ ...mutedStyle, flexShrink: 0 }}>{`A${index + 1}`}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={bodyStyle}>{action.content}</div>
                  <Space size={6} wrap style={{ marginTop: 2 }}>
                    {action.ownerName && (
                      <Tag color="blue">
                        {`${t('meeting.minutes.owner', { defaultValue: '負責人' })}：${action.ownerName}${action.ownerEmpNo ? `（${action.ownerEmpNo}）` : ''}`}
                      </Tag>
                    )}
                    {action.dueDate && <Tag color="orange">{`${t('meeting.minutes.dueDate', { defaultValue: '完成時限' })}：${action.dueDate}`}</Tag>}
                  </Space>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
      )}

      {!hideTracked && openIssues.length > 0 && (
        <Section title={t('meeting.minutes.sectionOpenIssues', { defaultValue: '未決事項' })} compact={compact}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {openIssues.map((issue, index) => (
              <div key={index} style={bodyStyle}>
                {issue.needDecisionBy?.trim()
                  ? t('meeting.minutes.decidedByNote', {
                    content: issue.content, name: issue.needDecisionBy,
                    defaultValue: '• {{content}}（待 {{name}} 決策）',
                  })
                  : `• ${issue.content}`}
              </div>
            ))}
          </div>
        </Section>
      )}

      {!compact && absentees.length > 0 && (
        <Section title={t('meeting.minutes.sectionAbsentees', { defaultValue: '缺席人員' })} compact={compact}>
          <Space size={6} wrap>
            {absentees.map((person, index) => (
              <Tag key={index} color="default">
                {`${person.name}${person.empNo ? `（${person.empNo}）` : ''}${person.reason?.trim() ? ` · ${person.reason}` : ''}`}
              </Tag>
            ))}
          </Space>
        </Section>
      )}

      {(content.nextMeetingAt || content.nextMeetingNote) && (
        <Section title={t('meeting.minutes.sectionNext', { defaultValue: '下次會議' })} compact={compact}>
          <div style={bodyStyle}>
            {[content.nextMeetingAt, content.nextMeetingNote].filter(Boolean).join(' · ')}
          </div>
        </Section>
      )}

      {content.remark?.trim() && (
        <Section title={t('meeting.minutes.sectionRemark', { defaultValue: '補充說明' })} compact={compact}>
          <div style={bodyStyle}>{content.remark}</div>
        </Section>
      )}
    </div>
  )
}
