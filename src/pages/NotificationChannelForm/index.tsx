import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Form, Input, Select, Button, Switch, Space, message, Spin } from 'antd'
import { ArrowLeftOutlined, SaveOutlined } from '@ant-design/icons'
import { getChannelDetail, createChannel, updateChannel } from '../../api/notificationChannel'
import type { ChannelSaveDTO } from '../../api/notificationChannel'

/** 预定义场景选项 */
const SCENARIO_OPTIONS = [
  { value: 'general', label: '通用通知' },
  { value: 'oa_approval', label: 'OA審批通知' },
  { value: 'ai_assistant', label: 'AI助手通知' },
  { value: 'rdm', label: '產研需求通知' },
]

/** 平台选项 */
const PLATFORM_OPTIONS = [
  { value: 'dingtalk', label: '釘釘' },
  { value: 'wecom', label: '企業微信' },
  { value: 'feishu', label: '飛書' },
]

/**
 * 通知渠道新增/编辑表单页
 * 独立页面，通过 URL 参数 id 区分新增/编辑模式
 */
export default function NotificationChannelForm() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const editId = searchParams.get('id')
  const isEditMode = !!editId

  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  /** 已保存的 Webhook（后端脱敏值）：编辑时只做提示，不回填输入框 */
  const [maskedWebhook, setMaskedWebhook] = useState('')
  const [secretConfigured, setSecretConfigured] = useState(false)

  /** 加载详情（编辑模式） */
  const loadDetail = useCallback(async () => {
    if (!editId) return
    setLoading(true)
    try {
      const detail = await getChannelDetail(Number(editId))
      // Webhook 与密钥一律不回填输入框：避免把已保存值再写回去，也避免浏览器误当成登录表单
      setMaskedWebhook(detail.webhookUrl || '')
      setSecretConfigured(!!detail.secretConfigured)
      form.setFieldsValue({
        name: detail.name,
        channel: detail.channel,
        atMobiles: detail.atMobiles,
        enabled: detail.enabled === 1,
        isDefault: detail.isDefault === 1,
        scenarios: detail.scenarios ? detail.scenarios.split(',').filter(Boolean) : [],
        remark: detail.remark,
      })
    } catch {
      message.error('加載渠道詳情失敗')
    } finally {
      setLoading(false)
    }
  }, [editId, form])

  useEffect(() => { loadDetail() }, [loadDetail])

  /** 返回 */
  const handleBack = () => navigate('/notification-config')

  /** 保存 */
  const handleSubmit = async () => {
    // 校验失败已在表单项内标红，不再额外弹全局提示
    const values = await form.validateFields().catch(() => null)
    if (!values) return
    setSubmitting(true)
    try {
      const dto: ChannelSaveDTO = {
        name: String(values.name).trim(),
        channel: values.channel,
        webhookUrl: String(values.webhookUrl || '').trim(),
        // undefined = 不修改已保存密钥；空串 = 显式清空（改用关键词模式）
        secret: values.secret,
        atMobiles: values.atMobiles || '',
        enabled: values.enabled ? 1 : 0,
        isDefault: values.isDefault ? 1 : 0,
        scenarios: (values.scenarios || []).join(','),
        remark: values.remark || '',
      }
      if (isEditMode) {
        await updateChannel(Number(editId), dto)
        message.success('渠道已更新')
      } else {
        await createChannel(dto)
        message.success('渠道已創建')
      }
      navigate('/notification-config')
    } catch {
      // 具体失败原因已由 axios 拦截器按后端 message 弹出，此处不重复提示
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="content-area" style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
        <Spin size="large" />
      </div>
    )
  }

  return (
    <div className="content-area">
      {/* ====== 页面头部 ====== */}
      <div style={{
        position: 'relative', background: '#fff', marginBottom: 16,
        borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden',
      }}>
        <div style={{
          height: 3,
          background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
          backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite',
        }} />
        <div style={{
          padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Button type="primary" icon={<ArrowLeftOutlined />} onClick={handleBack}
              style={{
                backgroundColor: '#E8720C', borderColor: '#E8720C', borderRadius: 8,
                height: 36, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              }}>返回</Button>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>
              {isEditMode ? '編輯渠道' : '新增渠道'}
            </h2>
          </div>
        </div>
      </div>

      {/* ====== 表单内容 ====== */}
      {/* autoComplete="off"：本页并非登录表单，禁止浏览器把登录凭据填充进 Webhook/密钥框 */}
      <Form form={form} layout="vertical" autoComplete="off">
        {/* 基本信息 */}
        <div style={{
          borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16,
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 6, background: '#e6f7ff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontSize: 14, color: '#1890ff' }}>📡</span>
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>基本信息</span>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0 16px' }}>
            <Form.Item label="平台類型" name="channel" rules={[{ required: true, message: '請選擇平台類型' }]}>
              <Select placeholder="請選擇平台" options={PLATFORM_OPTIONS} disabled={isEditMode} />
            </Form.Item>

            <Form.Item label="渠道名稱" name="name" rules={[{ required: true, message: '請輸入渠道名稱' }]}>
              <Input placeholder="如：默認群、OA審批群" />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0 16px' }}>
            <Form.Item label="Webhook 地址" name="webhookUrl"
              rules={[
                { required: !isEditMode, message: '請輸入 Webhook 地址' },
                {
                  validator: (_, value: string) => {
                    if (!value) return Promise.resolve()
                    if (!/^https?:\/\//i.test(value)) {
                      return Promise.reject(new Error('Webhook 地址必須以 http:// 或 https:// 開頭'))
                    }
                    if (form.getFieldValue('channel') === 'dingtalk' && !value.includes('access_token=')) {
                      return Promise.reject(new Error('釘釘 Webhook 應包含 access_token 參數'))
                    }
                    return Promise.resolve()
                  },
                },
              ]}>
              <Input id="nc-webhook-url" name="nc-webhook-url" autoComplete="off" data-lpignore="true"
                placeholder="https://oapi.dingtalk.com/robot/send?access_token=..." />
              {isEditMode && (
                <span style={{ fontSize: 12, color: '#8C8C8C' }}>
                  留空表示不修改{maskedWebhook ? `（當前：${maskedWebhook}）` : ''}
                </span>
              )}
            </Form.Item>

            <Form.Item label="加簽密鑰" name="secret"
              rules={[
                {
                  validator: (_, value: string) => {
                    if (!value) return Promise.resolve()
                    if (form.getFieldValue('channel') === 'dingtalk' && !value.startsWith('SEC')) {
                      return Promise.reject(new Error('釘釘加簽密鑰以 SEC 開頭，請勿填寫登錄密碼或其他字符'))
                    }
                    return Promise.resolve()
                  },
                },
              ]}>
              {/* new-password：Chrome 不再把它当成登录密码框做自动填充 */}
              <Input.Password id="nc-sign-secret" name="nc-sign-secret" autoComplete="new-password"
                data-lpignore="true"
                placeholder={isEditMode ? '留空表示不修改' : 'SEC...（關鍵詞模式可留空）'} />
              <span style={{ fontSize: 12, color: '#8C8C8C' }}>
                釘釘機器人安全設置中的加簽密鑰（SEC 開頭），如使用關鍵詞模式可留空
                {isEditMode && `；當前${secretConfigured ? '已配置' : '未配置'}`}
              </span>
            </Form.Item>
          </div>
        </div>

        {/* 通知配置 */}
        <div style={{
          borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16,
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 6, background: '#fff7e6',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontSize: 14, color: '#FA8C16' }}>🔔</span>
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>通知配置</span>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0 16px' }}>
            <Form.Item label="默認 @手機號" name="atMobiles">
              <Input placeholder="13800138000,13900139000" />
            </Form.Item>

            <Form.Item label="綁定場景" name="scenarios">
              <Select mode="tags" placeholder="選擇或輸入場景標識" options={SCENARIO_OPTIONS} />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0 16px' }}>
            <Form.Item label="設為默認渠道" name="isDefault" valuePropName="checked">
              <Switch checkedChildren="是" unCheckedChildren="否" />
              <span style={{ fontSize: 12, color: '#8C8C8C', marginLeft: 8 }}>
                默認渠道作為未匹配場景時的回退通道
              </span>
            </Form.Item>

            <Form.Item label="啟用通知" name="enabled" valuePropName="checked" initialValue={true}>
              <Switch checkedChildren="啟用" unCheckedChildren="停用" />
              <span style={{ fontSize: 12, color: '#8C8C8C', marginLeft: 8 }}>
                停用後該渠道不會接收任何通知
              </span>
            </Form.Item>
          </div>
        </div>

        {/* 备注 */}
        <div style={{
          borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16,
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 6, background: '#f9f0ff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontSize: 14, color: '#722ED1' }}>📝</span>
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>備注</span>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          </div>

          <Form.Item name="remark">
            <Input.TextArea placeholder="選填備注說明" maxLength={500} showCount rows={3} />
          </Form.Item>
        </div>
      </Form>

      {/* ====== 底部操作栏 ====== */}
      <div className="form-footer">
        <Space>
          <Button onClick={handleBack}>取消</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={submitting} onClick={handleSubmit}>
            保存
          </Button>
        </Space>
      </div>
    </div>
  )
}
