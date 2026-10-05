/**
 * 通知渠道·企业应用配置列表（当前仅钉钉）。
 *
 * 密钥可见性：接口只回传 appSecretConfigured / tokenSecretConfigured 两个布尔位，
 * 明文不过前端，所以列表只能展示“已配置/不完整”，没有查看密钥的入口（有意设计）。
 *
 * 删除约束与后端一致：已绑定通知场景的应用不允许删（按钮置灰并提示），
 * 需先到场景页解绑；前端置灰仅为体验，后端会再校验一遍。
 *
 * 启用/停用是即时生效的写操作，必须经过 Modal.confirm 二次确认；AppSecret 未配
 * 齐时“测试”按钮不可点（测了必失败，不如直接拦住）；同一时刻只允许一个测试在跑。
 */
import { useCallback, useState } from 'react'
import { Alert, Button, Form, Input, Modal, Select, Space, Switch, Table, Tag, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../contexts/AuthContext'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import { fetchNotificationApps, deleteNotificationApp, toggleNotificationApp, testAppConnection } from '../../api/notificationChannel'
import type { AppNotificationConfig, NotificationAppQuery } from '../../api/notificationChannel'
import { useNotificationList } from './useNotificationList'

export default function EnterpriseAppList() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { hasPermission } = useAuth()
  const canEdit = hasPermission('notification-config:edit')
  const [form] = Form.useForm<{ name?: string; enabled?: 'true' | 'false' }>()
  const [query, setQuery] = useState<NotificationAppQuery>({})
  // 筛选条件走 query state 而非直接请求：表单提交时一次性写回，避免边输入边查
  const fetchList = useCallback((signal: AbortSignal) => fetchNotificationApps(query, signal), [query])
  const { data, loading, failed, reload } = useNotificationList(fetchList)
  // 正在测试中的应用 id；非 null 时其他行的测试按钮一律禁用
  const [testingId, setTestingId] = useState<number | null>(null)

  const handleToggle = (app: AppNotificationConfig, enabled: boolean) => {
    Modal.confirm({
      title: `確定要${enabled ? '啟用' : '停用'}該配置嗎？`, className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      content: enabled ? t('notificationApp.enableHint') : t('notificationApp.disableHint'),
      okText: t('notificationApp.confirm'), cancelText: t('notificationApp.cancel'),
      onOk: async () => { await toggleNotificationApp(app.id, enabled); message.success(t('notificationApp.updated')); reload() },
    })
  }
  const handleDelete = (app: AppNotificationConfig) => {
    Modal.confirm({
      title: t('notificationApp.deleteConfirm', { name: app.name }), className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      content: t('notificationApp.deleteHint'), okButtonProps: { danger: true },
      okText: t('notificationApp.confirm'), cancelText: t('notificationApp.cancel'),
      onOk: async () => { await deleteNotificationApp(app.id); message.success(t('notificationApp.deleted')); reload() },
    })
  }
  const handleTest = async (id: number) => {
    setTestingId(id)
    try { await testAppConnection(id); message.success(t('notificationApp.testSuccess')) }
    catch { /* 统一请求层提示错误。 */ }
    // testingId 在 finally 里无条件清除，否则异常时所有测试按钮会永久锁住
    finally { setTestingId(null) }
  }

  const columns: ColumnsType<AppNotificationConfig> = [
    { title: t('notificationApp.name'), key: 'name', dataIndex: 'name', width: 180 },
    // 类型已把 platform 收窄为字面量 'dingtalk'（系统当前只接了钉钉），
    // 所以这里直接渲染常量而非 app.platform。接入第二平台时要同时改本列与类型定义。
    { title: t('notificationApp.platform'), key: 'platform', width: 90, render: () => '釘釘' },
    { title: 'AgentId', key: 'agentId', dataIndex: 'agentId', width: 150 },
    { title: t('notificationApp.boundScenarios'), key: 'scenarios', width: 220,
      render: (_, app) => app.scenarios.length ? app.scenarios.map(name => <Tag key={name}>{name}</Tag>) : t('notificationApp.unbound') },
    { title: t('notificationApp.credentialStatus'), key: 'credentials', width: 110,
      render: (_, app) => <Tag color={app.appSecretConfigured ? 'success' : 'warning'}>
        {t(app.appSecretConfigured ? 'notificationApp.configured' : 'notificationApp.incomplete')}</Tag> },
    { title: t('notificationApp.status'), key: 'enabled', width: 100,
      render: (_, app) => <Switch checked={app.enabled} checkedChildren="啟用" unCheckedChildren="停用" disabled={!canEdit || loading}
        onChange={enabled => handleToggle(app, enabled)} /> },
    { title: t('notificationApp.updatedBy'), key: 'updatedBy', dataIndex: 'updatedBy', width: 130 },
    { title: t('notificationApp.updatedAt'), key: 'updatedAt', dataIndex: 'updatedAt', width: 170 },
    // 无编辑权限时只保留详情与场景入口，操作列宽度随之收缩
    { title: t('notificationApp.actions'), key: 'action', fixed: 'right', width: canEdit ? 330 : 180,
      render: (_, app) => <Space size={0} split={<span className="action-split">|</span>}>
        <Button type="link" size="small" onClick={() => navigate(`/notification-app-form?id=${app.id}&mode=detail`)}>{t('notificationApp.detail')}</Button>
        {canEdit && <Button type="link" size="small" onClick={() => navigate(`/notification-app-form?id=${app.id}`)}>{t('notificationApp.edit')}</Button>}
        {canEdit && <Button type="link" size="small" loading={testingId === app.id} disabled={testingId !== null || !app.appSecretConfigured}
          onClick={() => void handleTest(app.id)}>{t('notificationApp.test')}</Button>}
        <Button type="link" size="small" onClick={() => navigate(`/notification-config?tab=scenarios&appId=${app.id}`)}>{t('notificationApp.scenarioTab')}</Button>
        {canEdit && <Button type="link" size="small" danger disabled={app.scenarios.length > 0}
          title={app.scenarios.length ? t('notificationApp.deleteHint') : undefined} onClick={() => handleDelete(app)}>{t('notificationApp.delete')}</Button>}
      </Space> },
  ]
  const { applyConfig, configComponent } = useColumnConfig('notification-apps', columns.map(col => ({ key: String(col.key), title: String(col.title) })),
    [{ key: 'action', locked: 'tail' }])

  return <div>
    <Alert className="notification-app__notice" type="info" showIcon message={t('notificationApp.listHint')} />
    <div className="search-section notification-config-search">
      <Form form={form} layout="inline" onFinish={values => setQuery({ name: values.name, enabled: values.enabled === undefined ? undefined : values.enabled === 'true' })}>
        <Form.Item name="name" label={t('notificationApp.name')}><Input allowClear placeholder={t('notificationApp.name')} /></Form.Item>
        <Form.Item name="enabled" label={t('notificationApp.status')}><Select allowClear placeholder={t('notificationApp.all')}
          options={[{ value: 'true', label: '啟用' }, { value: 'false', label: '停用' }]} /></Form.Item>
        <Form.Item><div className="search-actions">
          <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>{t('notificationApp.search')}</Button>
          <Button icon={<ReloadOutlined />} onClick={() => { form.resetFields(); setQuery({}) }}>{t('notificationApp.reset')}</Button>
        </div></Form.Item>
      </Form>
    </div>
    <div className="action-section"><Space>
      {canEdit && <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/notification-app-form')}>{t('notificationApp.addTitle')}</Button>}
      {configComponent}
    </Space></div>
    {failed ? <Alert type="error" showIcon message={t('notificationApp.loadFailed')} action={<Button onClick={reload}>{t('notificationApp.retry')}</Button>} />
      : <Table rowKey="id" columns={applyConfig(columns) as ColumnsType<AppNotificationConfig>} dataSource={data} loading={loading}
        size="middle" scroll={{ x: 1430 }} pagination={{ defaultPageSize: 10, showSizeChanger: true }} locale={{ emptyText: t('notificationApp.emptyApps') }} />}
  </div>
}
