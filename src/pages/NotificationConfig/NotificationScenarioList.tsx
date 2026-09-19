import { useState } from 'react'
import { Alert, Button, Form, Input, Modal, Space, Switch, Table, Tag, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../contexts/AuthContext'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import { fetchNotificationScenarios, saveNotificationScenario } from '../../api/notificationChannel'
import type { NotificationScenario } from '../../api/notificationChannel'
import { useNotificationList } from './useNotificationList'

export default function NotificationScenarioList() {
  const { t } = useTranslation()
  const { hasPermission } = useAuth()
  const canEdit = hasPermission('notification-config:edit')
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const appId = params.get('appId')
  const [form] = Form.useForm<{ name?: string }>()
  const [name, setName] = useState('')
  const { data, loading, failed, reload } = useNotificationList(fetchNotificationScenarios)
  const filtered = data.filter(item => (!appId || String(item.appId) === appId) && item.name.includes(name))
  const handleToggle = (scenario: NotificationScenario, enabled: boolean) => {
    Modal.confirm({ title: `確定要${enabled ? '啟用' : '停用'}該配置嗎？`, className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      okText: t('notificationApp.confirm'), cancelText: t('notificationApp.cancel'),
      onOk: async () => {
        await saveNotificationScenario(scenario.key, { appId: scenario.appId, enabled })
        message.success(t('notificationApp.updated')); reload()
      },
    })
  }
  const columns: ColumnsType<NotificationScenario> = [
    { title: t('notificationApp.scenarioName'), key: 'name', dataIndex: 'name', width: 180 },
    { title: t('notificationApp.trigger'), key: 'triggerDescription', dataIndex: 'triggerDescription', width: 220 },
    { title: t('notificationApp.recipientRule'), key: 'recipientRule', dataIndex: 'recipientRule', width: 230 },
    { title: t('notificationApp.boundApp'), key: 'appName', width: 180, render: (_, row) => row.appName || t('notificationApp.unbound') },
    { title: t('notificationApp.status'), key: 'enabled', width: 100, render: (_, row) => <Switch checked={row.enabled}
      checkedChildren="啟用" unCheckedChildren="停用" disabled={!canEdit || loading || (!row.enabled && (!row.appId || !row.appEnabled))}
      onChange={enabled => handleToggle(row, enabled)} /> },
    { title: t('notificationApp.deliveryStatus'), key: 'effective', width: 130, render: (_, row) => <Tag color={row.enabled && row.appEnabled ? 'success' : 'default'}>
      {t(!row.appId ? 'notificationApp.unbound' : !row.enabled ? 'notificationApp.scenarioDisabled' : !row.appEnabled ? 'notificationApp.appDisabled' : 'notificationApp.active')}</Tag> },
    { title: t('notificationApp.updatedAt'), key: 'updatedAt', dataIndex: 'updatedAt', width: 170 },
    { title: t('notificationApp.actions'), key: 'action', fixed: 'right', width: 130, render: (_, row) =>
      <Space size={0} split={<span className="action-split">|</span>}>
        <Button type="link" size="small" onClick={() => navigate(`/notification-scenario-form?key=${encodeURIComponent(row.key)}&mode=detail`)}>{t('notificationApp.detail')}</Button>
        {canEdit && <Button type="link" size="small" onClick={() => navigate(`/notification-scenario-form?key=${encodeURIComponent(row.key)}`)}>{t('notificationApp.edit')}</Button>}
      </Space> },
  ]
  const { applyConfig, configComponent } = useColumnConfig('notification-app-scenarios', columns.map(col => ({ key: String(col.key), title: String(col.title) })),
    [{ key: 'action', locked: 'tail' }])
  return <div>
    <Alert type="info" showIcon className="notification-app__notice" message={t('notificationApp.scenarioHint')} />
    {appId && <Alert type="info" className="notification-app__notice" message={t('notificationApp.filteredApp')}
      action={<Button onClick={() => setParams({ tab: 'scenarios' })}>{t('notificationApp.showAll')}</Button>} />}
    <div className="search-section notification-config-search">
      <Form form={form} layout="inline" onFinish={values => setName(values.name?.trim() || '')}>
        <Form.Item name="name" label={t('notificationApp.scenarioName')}><Input allowClear placeholder={t('notificationApp.scenarioName')} /></Form.Item>
        <Form.Item><div className="search-actions">
          <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>{t('notificationApp.search')}</Button>
          <Button icon={<ReloadOutlined />} onClick={() => { form.resetFields(); setName(''); setParams({ tab: 'scenarios' }) }}>{t('notificationApp.reset')}</Button>
        </div></Form.Item>
      </Form>
    </div>
    <div className="action-section">{configComponent}</div>
    {failed ? <Alert type="error" message={t('notificationApp.loadFailed')} action={<Button onClick={reload}>{t('notificationApp.retry')}</Button>} /> :
      <Table rowKey="key" columns={applyConfig(columns) as ColumnsType<NotificationScenario>} dataSource={filtered} loading={loading}
        size="middle" scroll={{ x: 1340 }} pagination={{ defaultPageSize: 10 }} />}
  </div>
}
