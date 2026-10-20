/**
 * 推送开关（顶级菜单，紧邻「通知渠道配置」与「通知模板」）。
 *
 * 关掉某一场景×渠道只影响"现在发不发"，不动企业应用绑定：
 * 临时静音结束后重新打开即可，不需要重新校验凭据。
 * 静音期间投递仍会留一行 skipped（原因「推送開關已關閉（靜音）」），"没发"必须能在发送历史看见。
 */
import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Modal, Space, Switch, Table, Tag, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import DetailPageHeader from '../../components/DetailPageHeader'
import { fetchNotifySwitches, saveNotifySwitch, type NotifySwitchVO } from '../../api/meetingNotify'

export default function NotificationSwitch() {
  const { t } = useTranslation()
  const [rows, setRows] = useState<NotifySwitchVO[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const [pendingKey, setPendingKey] = useState<string>()

  const load = useCallback(async () => {
    setLoading(true)
    setError(undefined)
    try {
      setRows(await fetchNotifySwitches())
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.loadFailed', { defaultValue: '加載失敗' }))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { void load() }, [load])

  const toggle = async (row: NotifySwitchVO, enabled: boolean) => {
    setPendingKey(`${row.sceneKey}:${row.channel}`)
    try {
      setRows(await saveNotifySwitch({ sceneKey: row.sceneKey, channel: row.channel, enabled }))
      message.success(enabled
        ? t('notification.switch.on', { defaultValue: '已開啟推送' })
        : t('notification.switch.off', { defaultValue: '已靜音' }))
    } catch {
      /* request.ts 已统一弹错 */
    } finally {
      setPendingKey(undefined)
    }
  }

  /** 静音后该场景一段时间内不再打扰；用二次确认避免误点（规范要求 Modal.confirm 带 custom-confirm-modal） */
  const confirmToggle = (row: NotifySwitchVO, enabled: boolean) => {
    if (enabled) {
      void toggle(row, true)
      return
    }
    Modal.confirm({
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      title: t('notification.switch.confirmTitle', { defaultValue: '確認靜音這類通知？' }),
      content: t('notification.switch.confirmContent', {
        scene: row.sceneKey,
        defaultValue: '靜音後，這類通知不會再發出；已存在的待發送任務會留痕為「推送開關已關閉」，可隨時重新開啟。',
      }),
      okText: t('notification.switch.confirmOk', { defaultValue: '靜音' }),
      okButtonProps: { danger: true },
      cancelText: t('meeting.cancel', { defaultValue: '取消' }),
      onOk: () => toggle(row, false),
    })
  }

  const columns: TableColumnsType<NotifySwitchVO> = [
    { title: t('notification.template.scene', { defaultValue: '場景' }), dataIndex: 'sceneKey', key: 'scene', width: 240,
      render: (value: string) => <span style={{ fontFamily: 'monospace' }}>{value}</span> },
    {
      title: t('notification.switch.channel', { defaultValue: '渠道' }), dataIndex: 'channel', key: 'channel', width: 220,
      render: (value: string) => (value === 'DINGTALK_WORK'
        ? t('notification.switch.channelWork', { defaultValue: '工作通知（發給個人）' })
        : t('notification.switch.channelGroup', { defaultValue: '群機器人（發到群）' })),
    },
    {
      title: t('notification.switch.status', { defaultValue: '狀態' }), key: 'status', width: 120,
      render: (_, row) => (row.enabled ? <Tag color="green">{t('notification.switch.sending', { defaultValue: '發送中' })}</Tag>
        : <Tag color="default">{t('notification.switch.muted', { defaultValue: '已靜音' })}</Tag>),
    },
    {
      title: t('notification.switch.toggle', { defaultValue: '開關' }), key: 'toggle', width: 100,
      render: (_, row) => (
        <Switch
          checked={row.enabled}
          loading={pendingKey === `${row.sceneKey}:${row.channel}`}
          onChange={checked => confirmToggle(row, checked)}
          checkedChildren={t('notification.switch.onShort', { defaultValue: '開' })}
          unCheckedChildren={t('notification.switch.offShort', { defaultValue: '關' })}
        />
      ),
    },
    {
      title: t('notification.template.updatedBy', { defaultValue: '最後更新' }), key: 'updated',
      render: (_, row) => `${row.updatedBy || '-'}${row.updatedAt ? ` · ${row.updatedAt}` : ''}`,
    },
  ]

  return (
    <div className="content-area">
      <DetailPageHeader title={t('notification.switch.pageTitle', { defaultValue: '推送開關' })} onBack={() => history.back()} />

      {error && <Alert type="error" showIcon style={{ marginBottom: 16 }} message={t('common.loadFailed', { defaultValue: '加載失敗' })} description={error} />}

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message={t('notification.switch.intro', { defaultValue: '這裡只控制「現在發不發」，不會解除企業應用綁定；關閉後可隨時重新開啟。' })}
      />

      <div className="action-section">
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>{t('meeting.refresh', { defaultValue: '重新整理' })}</Button>
        </Space>
      </div>

      <Table<NotifySwitchVO>
        rowKey={row => `${row.sceneKey}:${row.channel}`}
        size="small"
        loading={loading}
        columns={columns}
        dataSource={rows}
        pagination={false}
        scroll={{ x: 'max-content' }}
        locale={{ emptyText: error ? t('notification.switch.forbidden', { defaultValue: '載入失敗：請確認目前帳號有「推送開關」的查看權限' }) : t('notification.switch.empty', { defaultValue: '尚無開關配置，請先執行資料庫遷移' }) }}
      />
    </div>
  )
}
