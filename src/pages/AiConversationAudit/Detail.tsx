import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Descriptions, Empty, Spin, Tag, Typography } from 'antd'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import {
  UserOutlined,
  RobotOutlined,
  FileTextOutlined,
  PaperClipOutlined,
  MessageOutlined,
} from '@ant-design/icons'
import DetailPageHeader from '../../components/DetailPageHeader'
import { fetchAuditConversation, parseConversation } from '../../api/aiConversation'
import type { AiConversation } from '../../api/aiConversation'
import type { ChatAttachment } from '../../api/agent'

const { Text } = Typography

/** 将 AI 回覆中的字面 \n 转为真正换行 */
const formatAiText = (text: string) => text.replace(/\\n/g, '\n')

/** 附件渲染 */
const AttachmentView = ({ attachment }: { attachment: ChatAttachment }) => {
  if (attachment.type === 'image') {
    return (
      <div style={{ margin: '8px 0' }}>
        <img
          src={attachment.data}
          alt={attachment.name}
          style={{ maxWidth: 400, maxHeight: 300, borderRadius: 8, border: '1px solid #f0f0f0' }}
        />
        <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 4 }}>{attachment.name}</div>
      </div>
    )
  }
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
      background: '#fafafa', borderRadius: 6, margin: '8px 0', border: '1px solid #f0f0f0',
    }}>
      <FileTextOutlined style={{ color: '#1890ff' }} />
      <Text>{attachment.name}</Text>
    </div>
  )
}

/** 模块卡片标题行（全局规范） */
const SectionHeader = ({ icon, iconBg, iconColor, title, count }: {
  icon: React.ReactNode
  iconBg: string
  iconColor: string
  title: string
  count?: number
}) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
    <div style={{
      width: 28, height: 28, borderRadius: 6, background: iconBg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <span style={{ fontSize: 14, color: iconColor }}>{icon}</span>
    </div>
    <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{title}</span>
    {count !== undefined && (
      <Tag color="blue" style={{ marginLeft: 4, fontSize: 11 }}>{count}</Tag>
    )}
    <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
  </div>
)

export default function AiConversationAuditDetail() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const [loading, setLoading] = useState(true)
  const [conversation, setConversation] = useState<AiConversation | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    fetchAuditConversation(Number(id))
      .then(setConversation)
      .catch(() => setError(t('conversationAudit.detailLoadError')))
      .finally(() => setLoading(false))
  }, [id, t])

  if (loading) {
    return (
      <div className="content-area" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" />
      </div>
    )
  }

  if (error || !conversation) {
    return (
      <div className="content-area">
        <Empty description={error || t('conversationAudit.detailNotFound')} />
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Button onClick={() => navigate('/ai-conversation-audit')}>{t('common.back')}</Button>
        </div>
      </div>
    )
  }

  const parsed = parseConversation(conversation)

  /** 员工显示名：姓名(工号) */
  const empDisplayName = conversation.empName
    ? `${conversation.empName}(${conversation.username})`
    : conversation.username

  /** 状态标签 */
  const statusTag = conversation.deleted === 1
    ? <Tag color="orange">{t('conversationAudit.statusTrashed')}</Tag>
    : conversation.deleted === 2
      ? <Tag color="red">{t('conversationAudit.statusPurged')}</Tag>
      : <Tag color="green">{t('conversationAudit.statusActive')}</Tag>

  return (
    <div className="content-area">
      {/* ── 页面头部（全局 DetailPageHeader） ── */}
      <DetailPageHeader
        title={conversation.title || t('conversationAudit.untitled')}
        tags={statusTag}
        meta={`${empDisplayName} · ${dayjs(conversation.createdAt).format('YYYY-MM-DD HH:mm')}`}
        onBack={() => navigate('/ai-conversation-audit')}
      />

      {/* ── 基本信息卡片 ── */}
      <div style={{
        border: '1px solid #e8eaed', borderRadius: 8, background: '#fff',
        padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
      }}>
        <SectionHeader
          icon={<UserOutlined />}
          iconBg="#e6f7ff"
          iconColor="#1890ff"
          title="基础信息"
        />
        <Descriptions column={4} size="small" labelStyle={{ color: '#8c8c8c', fontSize: 13 }}>
          <Descriptions.Item label={t('conversationAudit.colId')}>
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{conversation.conversationId || '--'}</span>
          </Descriptions.Item>
          <Descriptions.Item label={t('conversationAudit.colEmpId')}>
            <Tag color="blue">{conversation.username}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label={t('conversationAudit.colEmpName')}>
            {conversation.empName || <Text type="secondary">--</Text>}
          </Descriptions.Item>
          <Descriptions.Item label={t('conversationAudit.colModel')}>
            {conversation.modelKey ? <Tag color="green">{conversation.modelKey}</Tag> : <Text type="secondary">--</Text>}
          </Descriptions.Item>
          <Descriptions.Item label={t('conversationAudit.colStatus')}>
            {statusTag}
          </Descriptions.Item>
          <Descriptions.Item label={t('conversationAudit.colTokens')}>
            <Text strong>{conversation.totalTokens > 0 ? conversation.totalTokens.toLocaleString() : '--'}</Text>
          </Descriptions.Item>
          <Descriptions.Item label={t('conversationAudit.colRequests')}>
            <Text strong>{conversation.requestCount > 0 ? conversation.requestCount : '--'}</Text>
          </Descriptions.Item>
          <Descriptions.Item label={t('conversationAudit.colCreatedAt')}>
            {dayjs(conversation.createdAt).format('YYYY-MM-DD HH:mm:ss')}
          </Descriptions.Item>
          <Descriptions.Item label={t('conversationAudit.colUpdatedAt')}>
            {dayjs(conversation.updatedAt).format('YYYY-MM-DD HH:mm:ss')}
          </Descriptions.Item>
          {conversation.deletedAt && (
            <Descriptions.Item label={t('conversationAudit.deletedAt')}>
              <Text type="danger">{dayjs(conversation.deletedAt).format('YYYY-MM-DD HH:mm:ss')}</Text>
            </Descriptions.Item>
          )}
        </Descriptions>
      </div>

      {/* ── 对话内容卡片 ── */}
      <div style={{
        border: '1px solid #e8eaed', borderRadius: 8, background: '#fff',
        padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
      }}>
        <SectionHeader
          icon={<MessageOutlined />}
          iconBg="#f6ffed"
          iconColor="#52c41a"
          title={t('conversationAudit.messageList')}
          count={parsed.messages.length}
        />

        {parsed.messages.length === 0 ? (
          <Empty description={t('conversationAudit.noMessages')} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {parsed.messages.map((msg) => (
              <div
                key={msg.id}
                style={{
                  display: 'flex',
                  gap: 12,
                  padding: '16px 20px',
                  borderRadius: 10,
                  background: msg.role === 'user' ? '#fff7e6' : '#f6ffed',
                  border: `1px solid ${msg.role === 'user' ? '#ffe7ba' : '#d9f7be'}`,
                }}
              >
                {/* 头像 */}
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: msg.role === 'user' ? '#e8720c' : '#52c41a',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  {msg.role === 'user'
                    ? <UserOutlined style={{ color: '#fff', fontSize: 16 }} />
                    : <RobotOutlined style={{ color: '#fff', fontSize: 16 }} />}
                </div>

                {/* 内容 */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <Text strong style={{ color: msg.role === 'user' ? '#e8720c' : '#52c41a' }}>
                      {msg.role === 'user' ? empDisplayName : t('conversationAudit.roleAssistant')}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {dayjs(msg.timestamp).format('YYYY-MM-DD HH:mm:ss')}
                    </Text>
                  </div>

                  {/* 消息文本 */}
                  <div style={{
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    fontSize: 14,
                    lineHeight: 1.7,
                    color: '#262626',
                  }}>
                    {msg.role === 'assistant' ? formatAiText(msg.content) : msg.content}
                  </div>

                  {/* 附件 */}
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                        <PaperClipOutlined style={{ color: '#8c8c8c', fontSize: 12 }} />
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {t('conversationAudit.attachments')} ({msg.attachments.length})
                        </Text>
                      </div>
                      {msg.attachments.map((att, idx) => (
                        <AttachmentView key={idx} attachment={att} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
