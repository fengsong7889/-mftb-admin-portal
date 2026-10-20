/**
 * 纪要发送面板（表单页「保存並發送」与查看页「再次發送」共用）。
 *
 * <p>为什么用受控 Modal 而不是 Modal.confirm：这里要选群、选收件人、看预览，
 * 是一个有状态的操作面板而不是"一句话确认"；§9.1 允许简单确认弹窗用 Modal.confirm，
 * 但把选人控件塞进 confirm 的 content 里会失去受控能力（关掉弹窗值还在、校验没地方落）。
 * 二次确认语义保留在面板本身：正文摘要 + 「將發往…」明细 + 必須點的「確認發送」。
 *
 * <p>两条不能省提示：
 *   1. **群按所选精确投递，不回退默认群**——回退等于把纪要发进一个谁都没确认过的群；
 *   2. **钉钉对同一员工当天相同内容只投一条**，所以每次发送都带批次标记，重发不是"再点一次"。
 */
import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Modal, Space, Select, Tag, message } from 'antd'
import { SendOutlined, TeamOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import EmployeeSelect from '../EmployeeSelect'
import {
  fetchMinutesGroups, sendMinutes,
  type MinutesContent, type MinutesGroupOption, type MinutesSendResult,
} from '../../../api/meetingMinutes'
import { newMeetingRequestKey, type MeetingVO } from '../../../api/meeting'
import MinutesContentCard from './MinutesContentCard'
import './minutes.css'

interface Props {
  minutesId: number
  meeting?: MeetingVO
  content: MinutesContent
  /** 乐观锁：发送也算一次写动作，避免两个人同时改后覆盖彼此的收件人结论 */
  version: number
  /**
   * 免登链接站点地址与可达性（来自 MinutesVO）。
   * <p>内网/本地地址不阻止发送（开发环境要测），但必须在点「確認發送」前说清手机打不开。
   */
  linkBaseUrl?: string | null
  linkBasePublic?: boolean
  onClose: () => void
  onSent: (result: MinutesSendResult) => void
}

export default function SendMinutesModal({ minutesId, meeting, content, version,
  linkBaseUrl, linkBasePublic, onClose, onSent }: Props) {
  const { t } = useTranslation()
  const [groups, setGroups] = useState<MinutesGroupOption[]>([])
  const [groupLoading, setGroupLoading] = useState(false)
  const [groupError, setGroupError] = useState<string>()
  const [channelId, setChannelId] = useState<number>()
  const [receiverIds, setReceiverIds] = useState<number[]>([])
  const [sending, setSending] = useState(false)

  useEffect(() => {
    let alive = true
    setGroupLoading(true)
    fetchMinutesGroups()
      .then(rows => { if (alive) setGroups(rows ?? []) })
      .catch(e => { if (alive) setGroupError(e instanceof Error ? e.message : String(e)) })
      .finally(() => { if (alive) setGroupLoading(false) })
    return () => { alive = false }
  }, [])

  /** 参会人里可被系统识别的人（有 sys_user.id）才能一键带入；外部参会人收不到工作通知 */
  const attendeeIds = useMemo(
    () => (meeting?.attendees ?? [])
      .map(person => person.userId)
      .filter((id): id is number => id != null),
    [meeting],
  )

  const selectedGroup = groups.find(item => item.id === channelId)

  const handleSend = async () => {
    if (!channelId && receiverIds.length === 0) {
      message.warning(t('meeting.minutes.sendNeedTarget', { defaultValue: '請選擇釘釘群或至少一位收件人' }))
      return
    }
    setSending(true)
    try {
      const result = await sendMinutes(minutesId, {
        groupChannelId: channelId ?? null,
        receiverUserIds: receiverIds,
        version,
        requestKey: newMeetingRequestKey('mms'),
      })
      // 提示只报个人工作通知条数：result.queued 不含群行（群只有一个 webhook，报成「2 条」会让人以为发给了两个人）
      const queued = result.queued ?? 0
      if (queued === 0 && !result.groupQueued) {
        message.warning(t('meeting.minutes.sendNothingQueued', { defaultValue: '本次沒有消息進入投遞隊列，請查看未送達原因' }))
      } else if (queued === 0) {
        message.success(t('meeting.minutes.sendGroupOnly', { defaultValue: '已提交到釘釘群，個人收件人本次未發送' }))
      } else {
        message.success(t('meeting.minutes.sendQueued', { count: queued, defaultValue: '已提交投遞 {{count}} 份個人通知' }))
      }
      onSent(result)
    } catch (e) {
      // request.ts 已统一弹错，这里只留日志，避免双弹
      console.warn(t('meeting.minutes.sendFailed', { defaultValue: '紀要發送失敗' }), e instanceof Error ? e.message : e)
    } finally {
      setSending(false)
    }
  }

  return (
    <Modal
      open
      width={720}
      title={t('meeting.minutes.sendModalTitle', { defaultValue: '發送會議紀要' })}
      onCancel={onClose}
      footer={(
        <Space size={12}>
          <Button onClick={onClose}>{t('meeting.cancel', { defaultValue: '取消' })}</Button>
          <Button type="primary" icon={<SendOutlined />} loading={sending} onClick={() => void handleSend()}>
            {t('meeting.minutes.confirmSend', { defaultValue: '確認發送' })}
          </Button>
        </Space>
      )}
    >
      {/* 发往目标摘要：确认前必须看得见"发给谁"，这与取消/释放弹窗同一口径 */}
      <div className="mm-send-summary">
        <div className="mm-send-row"><span>{t('meeting.minutes.labelTopic', { defaultValue: '會議主題：' })}</span><b>{meeting?.title ?? '-'}</b></div>
        <div className="mm-send-row"><span>{t('meeting.minutes.labelGroup', { defaultValue: '發往釘釘群：' })}</span><b>{selectedGroup?.name ?? t('meeting.minutes.groupNotSelected', { defaultValue: '未選擇' })}</b></div>
        <div className="mm-send-row"><span>{t('meeting.minutes.labelReceivers', { defaultValue: '發給個人：' })}</span><b>{`${receiverIds.length} ${t('meeting.personUnit', { defaultValue: '人' })}`}</b></div>
        <div className="mm-send-row"><span>{t('meeting.minutes.notice', { defaultValue: '提醒：' })}</span><b>{t('meeting.minutes.dedupeHint', { defaultValue: '釘釘對同一員工當天相同內容只投一條，本次會附批次標記' })}</b></div>
      </div>

      {/* 链接可达性：这是“发出去了但收件人点不开”的唯一事前拦截点，不能只写在文档里 */}
      {(linkBaseUrl === null || (linkBasePublic === false && linkBaseUrl)) && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message={linkBaseUrl === null
            ? t('meeting.minutes.linkMissingWarning', {
              defaultValue: '尚未配置站點地址：本次發出的卡片不會帶「查看完整紀要」連結。請到「通知配置 → 企業應用」填寫公網 HTTPS 地址。',
            })
            : t('meeting.minutes.linkPrivateWarning', {
              url: linkBaseUrl,
              defaultValue: '目前的免登連結使用內網/本地位址（{{url}}），手機或釘釘將無法打開。',
            })}
          description={linkBaseUrl === null
            ? undefined
            : t('meeting.minutes.linkPrivateHint', {
              defaultValue: '請到「通知配置 → 企業應用」把站點地址改為公網 HTTPS；舊訊息裡的連結不會自動更新，修改後需重新發送。',
            })}
        />
      )}

      {groupError && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 12 }}
          message={t('meeting.minutes.groupLoadFailed', { defaultValue: '釘釘群清單載入失敗' })}
          description={groupError}
        />
      )}

      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <div>
          <div style={{ fontSize: 13, color: '#595959', marginBottom: 6 }}>{t('meeting.minutes.groupLabel', { defaultValue: '發送到釘釘群' })}</div>
          <Select
            allowClear
            style={{ width: '100%' }}
            loading={groupLoading}
            placeholder={groupLoading ? t('common.loading', { defaultValue: '載入中...' }) : t('meeting.minutes.groupPlaceholder', { defaultValue: '選擇已啟用的釘釘群（不選即不發群）' })}
            value={channelId}
            onChange={value => setChannelId(value)}
            options={groups.map(item => ({ value: item.id, label: item.name }))}
            notFoundContent={groupLoading ? null : t('meeting.minutes.groupEmpty', { defaultValue: '暫無已啟用的釘釘群渠道，請先到「通知渠道」新增' })}
          />
          <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 4 }}>
            {t('meeting.minutes.groupExactHint', { defaultValue: '只發選中的群，不會回退到默認群' })}
          </div>
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 13, color: '#595959' }}>{t('meeting.minutes.receiversLabel', { defaultValue: '發送給參會人 / 自選人員' })}</span>
            {attendeeIds.length > 0 && (
              <Button size="small" icon={<TeamOutlined />} onClick={() => setReceiverIds(prev => Array.from(new Set([...prev, ...attendeeIds])))}>
                {t('meeting.minutes.fillAttendees', { defaultValue: '一鍵帶入參會人' })}
              </Button>
            )}
          </div>
          <EmployeeSelect
            value={receiverIds}
            onChange={setReceiverIds}
            maxTagCount={8}
            placeholder={t('meeting.minutes.receiversPlaceholder', { defaultValue: '搜尋姓名或工號，可選非參會人' })}
          />
          <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 4 }}>
            {t('meeting.minutes.receiverHint', { defaultValue: '未綁定釘釘的人會留痕「未送達」並在發送歷史顯示原因' })}
          </div>
        </div>

        {receiverIds.length > 0 && (
          <Space size={6} wrap>
            <Tag color="blue">{`${t('meeting.minutes.receiverCount', { count: receiverIds.length, defaultValue: '已選 {{count}} 人' })}`}</Tag>
          </Space>
        )}

        <div>
          <div style={{ fontSize: 13, color: '#595959', marginBottom: 6 }}>{t('meeting.minutes.previewLabel', { defaultValue: '發送內容預覽' })}</div>
          <div className="mm-send-preview">
            <MinutesContentCard content={content} compact />
          </div>
          <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 4 }}>
            {t('meeting.minutes.previewHint', { defaultValue: '釘釘正文由後端按同一分區渲染，行動項以列表呈現（釘釘不支持表格）；超長時自動摺疊並附完整紀要鏈接' })}
          </div>
        </div>
      </Space>
    </Modal>
  )
}
