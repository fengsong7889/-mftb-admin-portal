import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Button, Empty, Form, Input, Spin, Tag, message } from 'antd'
import { ApiOutlined, SafetyCertificateOutlined, SaveOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../contexts/AuthContext'
import { fetchAppConfig, saveAppConfig, testAppConnection } from '../../api/notificationChannel'
import type { AppNotificationConfig, AppNotificationConfigPayload } from '../../api/notificationChannel'

const cardStyle = {
  borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16,
  border: '1px solid #e8eaed', boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
}

/** 单例应用配置与群机器人隔离；密钥只在编辑期间存在，不回填、不持久化到浏览器。 */
export default function EnterpriseAppConfig() {
  const { t } = useTranslation()
  const { hasPermission } = useAuth()
  const canEdit = hasPermission('notification-config:edit')
  const [form] = Form.useForm<AppNotificationConfigPayload>()
  const [config, setConfig] = useState<AppNotificationConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [dirty, setDirty] = useState(false)
  const busy = useRef(false)

  const fetchConfig = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    try {
      const data = await fetchAppConfig(signal)
      if (signal?.aborted) return
      setConfig(data)
      form.setFieldsValue({ appKey: data.appKey, agentId: data.agentId, baseUrl: data.baseUrl, appSecret: '' })
      setDirty(false)
    } catch {
      // 读取失败用页内错误态承接并禁止写入，避免把未知配置覆盖为空。
      if (!signal?.aborted) setConfig(null)
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [form])

  useEffect(() => {
    const controller = new AbortController()
    void fetchConfig(controller.signal)
    return () => controller.abort()
  }, [fetchConfig])

  const handleSave = async () => {
    if (busy.current || !canEdit || !config) return
    busy.current = true
    setSaving(true)
    try {
      const values = await form.validateFields()
      await saveAppConfig({
        appKey: values.appKey.trim(), agentId: values.agentId.trim(), baseUrl: values.baseUrl.trim(),
        ...(values.appSecret?.trim() ? { appSecret: values.appSecret.trim() } : {}),
      })
      form.setFieldValue('appSecret', '')
      message.success(t('notificationApp.saved'))
      await fetchConfig()
    } catch {
      // 字段校验显示在表单内，接口失败由统一拦截器提示；保留未保存输入。
    } finally {
      busy.current = false
      setSaving(false)
    }
  }

  const handleTest = async () => {
    if (busy.current || !canEdit || dirty || !config?.appSecretConfigured) return
    busy.current = true
    setTesting(true)
    try {
      await testAppConnection()
      message.success(t('notificationApp.testSuccess'))
    } catch {
      // 不把连接失败显示为成功，也不重复弹出接口错误。
    } finally {
      busy.current = false
      setTesting(false)
    }
  }

  const handleCancel = () => {
    if (!config || busy.current) return
    form.resetFields()
    form.setFieldsValue({ appKey: config.appKey, agentId: config.agentId, baseUrl: config.baseUrl, appSecret: '' })
    setDirty(false)
  }

  return (
    <Spin spinning={loading}>
      {!loading && !config ? (
        <Empty description={t('notificationApp.loadFailed')} image={Empty.PRESENTED_IMAGE_SIMPLE}>
          <Button onClick={() => void fetchConfig()}>{t('notificationApp.retry')}</Button>
        </Empty>
      ) : (
        <>
          <Alert type="info" showIcon message={t('notificationApp.intro')} description={t('notificationApp.recipientHint')}
            className="notification-app__notice" />
          {!canEdit && <Alert type="warning" showIcon message={t('notificationApp.readOnly')} className="notification-app__notice" />}
          <Form form={form} name="notification-app" layout="vertical" autoComplete="off"
            disabled={!canEdit || loading || saving || testing} onValuesChange={() => setDirty(true)}>
            <div style={cardStyle}>
              <div className="notification-app__section-title">
                <span className="notification-app__icon"><ApiOutlined /></span>
                <span>{t('notificationApp.credentials')}</span>
                <div className="notification-app__divider" />
              </div>
              {/* 此处校验只负责输入体验，后端 DTO 和服务层必须重新校验。 */}
              <div className="notification-app__fields">
                <Form.Item name="appKey" label="AppKey" rules={[
                  { required: true, whitespace: true, message: t('notificationApp.appKeyRequired') },
                  { max: 100, pattern: /^[A-Za-z0-9_-]+$/, message: t('notificationApp.appKeyInvalid') },
                ]}>
                  <Input maxLength={100} placeholder={t('notificationApp.appKeyPlaceholder')} />
                </Form.Item>
                <Form.Item name="agentId" label="AgentId" rules={[
                  { required: true, whitespace: true, message: t('notificationApp.agentIdInvalid') },
                  { validator: async (_, value: string) => {
                    const text = value?.trim() || ''
                    if (!/^[1-9][0-9]{0,18}$/.test(text) || BigInt(text) > BigInt('9223372036854775807')) {
                      throw new Error(t('notificationApp.agentIdInvalid'))
                    }
                  } },
                ]}>
                  <Input maxLength={19} inputMode="numeric" placeholder={t('notificationApp.agentIdPlaceholder')} />
                </Form.Item>
                <Form.Item name="appSecret" label="AppSecret" dependencies={['appKey']}
                  extra={t(config?.appSecretConfigured ? 'notificationApp.secretKeep' : 'notificationApp.secretRequired')}
                  rules={[{ validator: async (_, value?: string) => {
                    if (!value?.trim()) {
                      if (!config?.appSecretConfigured || form.getFieldValue('appKey')?.trim() !== config.appKey) {
                        throw new Error(t('notificationApp.secretRequired'))
                      }
                    } else if (value.length > 256 || /[\s*•]/.test(value)) {
                      throw new Error(t('notificationApp.secretInvalid'))
                    }
                  } }]}>
                  <Input.Password maxLength={256} autoComplete="new-password"
                    placeholder={t(config?.appSecretConfigured ? 'notificationApp.secretPlaceholder' : 'notificationApp.secretRequired')} />
                </Form.Item>
                <Form.Item name="baseUrl" label={t('notificationApp.baseUrl')} extra={t('notificationApp.baseUrlHint')}
                  rules={[
                    { required: true, whitespace: true, max: 500, message: t('notificationApp.baseUrlInvalid') },
                    { validator: async (_, value: string) => {
                      try {
                        const text = value?.trim() || ''
                        const url = new URL(text)
                        if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password
                          || text.includes('?') || text.includes('#') || /\s|\\/.test(text) || url.port === '0') throw new Error()
                      } catch {
                        throw new Error(t('notificationApp.baseUrlInvalid'))
                      }
                    } },
                  ]}>
                  <Input maxLength={500} placeholder="https://admin.example.com" />
                </Form.Item>
              </div>
            </div>
            <div style={cardStyle}>
              <div className="notification-app__section-title">
                <span className="notification-app__icon notification-app__icon--security"><SafetyCertificateOutlined /></span>
                <span>{t('notificationApp.signingSecret')}</span>
                <div className="notification-app__divider" />
                <Tag color={config?.tokenSecretConfigured ? 'success' : 'warning'}>
                  {t(config?.tokenSecretConfigured ? 'notificationApp.configured' : 'notificationApp.autoGenerate')}
                </Tag>
              </div>
              <p className="notification-app__hint">{t('notificationApp.signingSecretHint')}</p>
              <p className="notification-app__hint">{t('notificationApp.testHint')}</p>
              {dirty && <span className="notification-app__hint">{t('notificationApp.unsavedHint')}</span>}
            </div>
          </Form>
          {canEdit && <div className="form-footer">
            <Button disabled={!dirty || loading || saving || testing} onClick={handleCancel}>{t('notificationApp.cancel')}</Button>
            <Button icon={<ApiOutlined />} loading={testing} onClick={handleTest}
              disabled={loading || saving || dirty || !config?.appKey || !config.agentId || !config.appSecretConfigured}>
              {t('notificationApp.test')}
            </Button>
            <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSave}
              disabled={loading || testing || !config}>
              {t('notificationApp.save')}
            </Button>
          </div>}
        </>
      )}
    </Spin>
  )
}
