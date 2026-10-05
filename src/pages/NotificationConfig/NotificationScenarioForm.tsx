/**
 * 通知场景绑定页。
 *
 * 场景本身（名称/触发条件/接收人规则）由后端预定义，**不可编辑**，页面上三个
 * 只读输入框仅用于展示；本页可写的只有“绑到哪个应用”与“是否启用”两项。
 * 因此保存只提交 appId + enabled，不要以为改名称就能在这里生效。
 *
 * 校验规则：启用状态下必须绑定一个自身也启用的应用，否则通知发不出去；
 * 依赖 enabled 联动重校验，所以开关一变就会重新跑 appId 的 validator。
 * 停用中的仍允许保留绑定（先解绑再停用应用属于两步操作，不应强绑给用户）。
 *
 * 行为细节：拉取失败或 key 不存在都归为 scenario=null，统一渲染重试空态；
 * 脏位由 onValuesChange 维护，未保存直接返回会弹二次确认。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Button, Empty, Form, Input, Modal, Select, Spin, Switch, message } from 'antd'
import { ApiOutlined, SaveOutlined } from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../contexts/AuthContext'
import { fetchNotificationApps, fetchNotificationScenarios, saveNotificationScenario } from '../../api/notificationChannel'
import type { AppNotificationConfig, NotificationScenario, NotificationScenarioPayload } from '../../api/notificationChannel'
import NotificationFormHeader, { notificationCardStyle } from './NotificationFormHeader'
import './index.css'

export default function NotificationScenarioForm() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const key = params.get('key')
  // mode=detail 为只读查看：即使有编辑权也不允许保存
  const isDetail = params.get('mode') === 'detail'
  const { hasPermission } = useAuth()
  const canEdit = hasPermission('notification-config:edit') && !isDetail
  const [form] = Form.useForm<NotificationScenarioPayload>()
  const [scenario, setScenario] = useState<NotificationScenario | null>(null)
  const [apps, setApps] = useState<AppNotificationConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  // busy 防“确认框已弹但尚未关闭”期间重入；与 saving（仅盖提交请求）是两个粒度
  const busy = useRef(false)
  const fetchData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    try {
      // 场景定义与候选应用一起拉：应用列表用于下拉，二者缺一本页都无法校验
      const [rules, appList] = await Promise.all([fetchNotificationScenarios(signal), fetchNotificationApps(undefined, signal)])
      if (signal?.aborted) return
      const rule = rules.find(item => item.key === key)
      if (!rule) throw new Error('invalid scenario')
      setScenario(rule); setApps(appList)
      form.setFieldsValue({ appId: rule.appId, enabled: rule.enabled })
      setDirty(false)
    } catch { if (!signal?.aborted) setScenario(null) }
    finally { if (!signal?.aborted) setLoading(false) }
  }, [key, form])
  useEffect(() => {
    const controller = new AbortController()
    void fetchData(controller.signal)
    return () => controller.abort()
  }, [fetchData])

  const handleBack = () => {
    if (busy.current) return
    const back = () => navigate('/notification-config?tab=scenarios')
    if (!dirty) { back(); return }
    Modal.confirm({ title: t('notificationApp.discard'), className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      okText: t('notificationApp.confirm'), cancelText: t('notificationApp.cancel'), onOk: back })
  }
  const handleSave = async () => {
    if (!scenario || !canEdit || busy.current) return
    busy.current = true
    try {
      const values = await form.validateFields()
      Modal.confirm({ title: t('notificationApp.saveScenarioConfirm'), className: 'custom-confirm-modal',
        icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
        content: <div className="confirm-info-card">
          <div className="confirm-info-row"><span>{t('notificationApp.scenarioName')}</span><b>{scenario.name}</b></div>
          <div className="confirm-info-row"><span>{t('notificationApp.boundApp')}</span><b>{apps.find(a => a.id === values.appId)?.name || t('notificationApp.unbound')}</b></div>
          <div className="confirm-info-row"><span>{t('notificationApp.status')}</span><b>{values.enabled ? '啟用' : '停用'}</b></div>
        </div>,
        okText: t('notificationApp.confirm'), cancelText: t('notificationApp.cancel'),
        afterClose: () => { busy.current = false },
        onOk: async () => {
          setSaving(true)
          try {
            await saveNotificationScenario(scenario.key, { appId: values.appId ?? null, enabled: values.enabled })
            setDirty(false); message.success(t('notificationApp.updated'))
            navigate('/notification-config?tab=scenarios')
          } finally { setSaving(false) }
        },
      })
    } catch { busy.current = false }
  }

  return <div className="content-area notification-config">
    <NotificationFormHeader title={t(isDetail ? 'notificationApp.scenarioDetail' : 'notificationApp.scenarioEdit')} onBack={handleBack} />
    <Spin spinning={loading}>
      {!loading && !scenario ? <Empty description={t('notificationApp.loadFailed')}>
        <Button onClick={() => void fetchData()}>{t('notificationApp.retry')}</Button>
      </Empty> : <>
        <Alert className="notification-app__notice" type="info" showIcon message={t('notificationApp.scenarioHint')} />
        <Form form={form} layout="vertical" disabled={!canEdit || loading || saving} onValuesChange={() => setDirty(true)}>
          <div style={notificationCardStyle}>
            <div className="notification-app__section-title"><span className="notification-app__icon"><ApiOutlined /></span>
              <span>{t('notificationApp.scenarioTab')}</span><div className="notification-app__divider" /></div>
            <div className="notification-app__fields">
              {/* 以下三项后端定义，只读展示；真正可改的只有下面的 appId 与 enabled */}
              <Form.Item label={t('notificationApp.scenarioName')}><Input value={scenario?.name} readOnly /></Form.Item>
              <Form.Item label={t('notificationApp.trigger')}><Input value={scenario?.triggerDescription} readOnly /></Form.Item>
              <Form.Item label={t('notificationApp.recipientRule')}><Input value={scenario?.recipientRule} readOnly /></Form.Item>
              <Form.Item name="appId" label={t('notificationApp.boundApp')} dependencies={['enabled']}
                extra={t('notificationApp.bindingHint')} rules={[{ validator: async (_, value?: number) => {
                  if (form.getFieldValue('enabled') && !apps.some(app => app.id === value && app.enabled)) {
                    throw new Error(t('notificationApp.selectEnabledApp'))
                  }
                } }]}>
                <Select allowClear showSearch optionFilterProp="label" placeholder={t('notificationApp.selectApp')}
                  options={apps.map(app => ({ value: app.id, label: `${app.name}${app.enabled ? '' : ` (${t('notificationApp.appDisabled')})`}` }))} />
              </Form.Item>
              <Form.Item name="enabled" label={t('notificationApp.status')} valuePropName="checked">
                <Switch checkedChildren="啟用" unCheckedChildren="停用" />
              </Form.Item>
            </div>
          </div>
        </Form>
        {canEdit && <div className="form-footer">
          <Button disabled={saving} onClick={handleBack}>{t('notificationApp.cancel')}</Button>
          <Button type="primary" icon={<SaveOutlined />} disabled={loading || !scenario} loading={saving} onClick={() => void handleSave()}>{t('notificationApp.save')}</Button>
        </div>}
      </>}
    </Spin>
  </div>
}
