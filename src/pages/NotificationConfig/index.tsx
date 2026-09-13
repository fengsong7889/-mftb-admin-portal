import { useState, useEffect, useCallback } from 'react'
import { Button, Switch, Input, Tag, Modal, message, Spin } from 'antd'
import {
  BellOutlined,
  SettingOutlined,
  SendOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
  CheckCircleFilled,
  CloseCircleFilled,
  MessageOutlined,
  RocketOutlined,
} from '@ant-design/icons'
import { getChannelConfig, updateChannelConfig, testChannel } from '../../api/notificationChannel'
import type { ChannelConfig } from '../../api/notificationChannel'
import './index.css'

/** 渠道定义 */
interface ChannelMeta {
  key: string
  name: string
  icon: React.ReactNode
  color: string
  bgColor: string
  description: string
  available: boolean
}

const CHANNELS: ChannelMeta[] = [
  {
    key: 'dingtalk',
    name: '钉钉',
    icon: <BellOutlined style={{ fontSize: 32 }} />,
    color: '#0089FF',
    bgColor: '#E6F4FF',
    description: '通过钉钉自定义机器人 Webhook 向群聊推送通知，支持审批提醒、到期提醒等场景',
    available: true,
  },
  {
    key: 'wecom',
    name: '企业微信',
    icon: <MessageOutlined style={{ fontSize: 32 }} />,
    color: '#07C160',
    bgColor: '#F6FFED',
    description: '通过企业微信应用或群机器人推送消息，适用于企业内部通知与审批提醒',
    available: false,
  },
  {
    key: 'feishu',
    name: '飞书',
    icon: <RocketOutlined style={{ fontSize: 32 }} />,
    color: '#3370FF',
    bgColor: '#F0F5FF',
    description: '通过飞书自定义机器人 Webhook 推送消息，支持富文本和交互卡片',
    available: false,
  },
]

/**
 * 通知渠道配置页
 *
 * 以卡片形式展示各通知渠道（钉钉/企微/飞书）的接入状态，
 * 支持配置 Webhook URL / Secret、启用开关、发送测试消息。
 * 当前仅钉钉渠道已接入，企微/飞书为预留位（available=false）。
 */
export default function NotificationConfig() {
  const [channelConfigs, setChannelConfigs] = useState<Record<string, ChannelConfig>>({})
  const [loading, setLoading] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [activeChannel, setActiveChannel] = useState<ChannelMeta | null>(null)
  const [form, setForm] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [showSecret, setShowSecret] = useState(false)

  /** 加载所有渠道配置 */
  useEffect(() => {
    setLoading(true)
    Promise.all(
      CHANNELS.map(ch =>
        getChannelConfig(ch.key).catch(() => ({ channel: ch.key }))
      )
    ).then(configs => {
      const map: Record<string, ChannelConfig> = {}
      configs.forEach(c => { map[c.channel] = c })
      setChannelConfigs(map)
    }).finally(() => setLoading(false))
  }, [])

  /** 打开配置抽屉 */
  const handleOpenDrawer = useCallback(async (channel: ChannelMeta) => {
    setActiveChannel(channel)
    setDrawerOpen(true)
    setShowSecret(false)
    try {
      const config = await getChannelConfig(channel.key)
      setForm({
        webhookUrl: config.webhookUrl || '',
        secret: config.secret || '',
        enabled: config.enabled || 'false',
        atMobiles: config.atMobiles || '',
      })
    } catch {
      setForm({ webhookUrl: '', secret: '', enabled: 'false', atMobiles: '' })
    }
  }, [])

  /** 保存配置 */
  const handleSave = useCallback(async () => {
    if (!activeChannel) return
    if (!form.webhookUrl?.trim()) {
      message.warning('请填写 Webhook 地址')
      return
    }
    setSaving(true)
    try {
      await updateChannelConfig(activeChannel.key, form)
      message.success('配置已保存')
      // 刷新列表并关闭弹窗
      const config = await getChannelConfig(activeChannel.key)
      setChannelConfigs(prev => ({ ...prev, [activeChannel.key]: config }))
      setDrawerOpen(false)
    } catch {
      message.error('保存失败')
    } finally {
      setSaving(false)
    }
  }, [activeChannel, form])

  /** 发送测试消息（携带当前表单值，无需先保存） */
  const handleTest = useCallback(async () => {
    if (!activeChannel) return
    if (!form.webhookUrl?.trim()) {
      message.warning('请先填写 Webhook 地址')
      return
    }
    setTesting(true)
    try {
      const result = await testChannel(activeChannel.key, form as Record<string, string>)
      message.success(result)
    } catch {
      message.error('测试消息发送失败')
    } finally {
      setTesting(false)
    }
  }, [activeChannel, form])

  /** 判断渠道是否已配置 */
  const isConfigured = (ch: ChannelMeta) => {
    const config = channelConfigs[ch.key]
    return config?.webhookUrl && config.webhookUrl.length > 0
  }

  /** 判断渠道是否已启用 */
  const isEnabled = (ch: ChannelMeta) => {
    const config = channelConfigs[ch.key]
    return config?.enabled === 'true'
  }

  return (
    <div className="content-area">
      {/* 页面头部 */}
      <div style={{
        position: 'relative', background: '#fff', marginBottom: 16,
        borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden',
      }}>
        <div style={{
          height: 3,
          background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
          backgroundSize: '200% 100%',
          animation: 'headerGradientShift 4s ease infinite',
        }} />
        <div style={{
          padding: '16px 24px', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 8,
              background: 'linear-gradient(135deg, #E8720C, #F59432)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(232,114,12,0.3)',
            }}>
              <BellOutlined style={{ fontSize: 18, color: '#fff' }} />
            </div>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>
                通知渠道配置
              </h2>
              <span style={{ fontSize: 14, color: '#595959' }}>管理系统各通知渠道的接入配置</span>
            </div>
          </div>
        </div>
      </div>

      {/* 卡片网格 */}
      <Spin spinning={loading}>
        <div className="notification-channel-grid">
          {CHANNELS.map(ch => {
            const configured = isConfigured(ch)
            const enabled = isEnabled(ch)
            return (
              <div
                key={ch.key}
                className={`notification-channel-card ${!ch.available ? 'card-disabled' : ''}`}
              >
                {/* 平台图标 */}
                <div className="channel-card-icon" style={{ background: ch.bgColor, color: ch.color }}>
                  {ch.icon}
                </div>

                {/* 平台名称 + 状态 */}
                <div className="channel-card-header">
                  <span className="channel-card-name">{ch.name}</span>
                  {ch.available ? (
                    configured && enabled ? (
                      <Tag icon={<CheckCircleFilled />} color="success">已接入</Tag>
                    ) : configured ? (
                      <Tag color="warning">已配置</Tag>
                    ) : (
                      <Tag icon={<CloseCircleFilled />} color="default">未接入</Tag>
                    )
                  ) : (
                    <Tag color="default">即将上线</Tag>
                  )}
                </div>

                {/* 简介 */}
                <div className="channel-card-desc">{ch.description}</div>

                {/* 操作区 */}
                <div className="channel-card-actions">
                  {ch.available ? (
                    <>
                      <Button
                        size="small"
                        icon={<SettingOutlined />}
                        onClick={() => handleOpenDrawer(ch)}
                      >
                        配置
                      </Button>
                      <Button
                        size="small"
                        icon={<SendOutlined />}
                        disabled={!configured || !enabled}
                        onClick={async () => {
                          setTesting(true)
                          try {
                            const result = await testChannel(ch.key)
                            message.success(result)
                          } catch {
                            message.error('测试消息发送失败')
                          } finally {
                            setTesting(false)
                          }
                        }}
                        loading={testing}
                      >
                        测试
                      </Button>
                      <Switch
                        size="small"
                        checked={enabled}
                        disabled={!configured}
                        onChange={async (checked) => {
                          try {
                            await updateChannelConfig(ch.key, { enabled: String(checked) })
                            const config = await getChannelConfig(ch.key)
                            setChannelConfigs(prev => ({ ...prev, [ch.key]: config }))
                            message.success(checked ? '已启用' : '已停用')
                          } catch {
                            message.error('操作失败')
                          }
                        }}
                      />
                    </>
                  ) : (
                    <Button size="small" disabled>即将上线</Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </Spin>

      {/* 配置弹窗 */}
      <Modal
        title={
          activeChannel ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: activeChannel.color, fontSize: 18 }}>{activeChannel.icon}</span>
              <span>{activeChannel.name} 配置</span>
            </div>
          ) : '渠道配置'
        }
        width={520}
        open={drawerOpen}
        onCancel={() => setDrawerOpen(false)}
        onOk={handleSave}
        confirmLoading={saving}
        okText="保存"
        cancelText="取消"
        okButtonProps={{ style: { backgroundColor: '#E8720C', borderColor: '#E8720C' } }}
      >
        <div className="drawer-form">
          <div className="drawer-form-item">
            <label>Webhook 地址 <span className="required">*</span></label>
            <div style={{ display: 'flex', gap: 8 }}>
              <Input
                style={{ flex: 1 }}
                placeholder="https://oapi.dingtalk.com/robot/send?access_token=..."
                value={form.webhookUrl || ''}
                onChange={e => setForm(prev => ({ ...prev, webhookUrl: e.target.value }))}
              />
              <Button
                icon={<SendOutlined />}
                onClick={handleTest}
                loading={testing}
                disabled={!form.webhookUrl}
              >
                测试
              </Button>
            </div>
          </div>
          <div className="drawer-form-item">
            <label>
              加签密钥
              <Button
                type="link"
                size="small"
                icon={showSecret ? <EyeInvisibleOutlined /> : <EyeOutlined />}
                onClick={() => setShowSecret(!showSecret)}
                style={{ marginLeft: 8, padding: 0, fontSize: 12 }}
              >
                {showSecret ? '隐藏' : '显示'}
              </Button>
            </label>
            <Input.Password
              placeholder="SEC..."
              value={form.secret || ''}
              visibilityToggle={showSecret}
              onChange={e => setForm(prev => ({ ...prev, secret: e.target.value }))}
            />
            <span className="drawer-form-hint">钉钉机器人安全设置中的加签密钥（SEC 开头），如使用关键词模式可留空</span>
          </div>
          <div className="drawer-form-item">
            <label>默认 @手机号</label>
            <Input
              placeholder="13800138000,13900139000"
              value={form.atMobiles || ''}
              onChange={e => setForm(prev => ({ ...prev, atMobiles: e.target.value }))}
            />
            <span className="drawer-form-hint">多个手机号用逗号分隔，发送通知时自动 @这些人</span>
          </div>
          <div className="drawer-form-item">
            <label>启用通知</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Switch
                checked={form.enabled === 'true'}
                onChange={checked => setForm(prev => ({ ...prev, enabled: String(checked) }))}
                checkedChildren="开"
                unCheckedChildren="关"
              />
              <span style={{ fontSize: 12, color: '#8c8c8c' }}>
                {form.enabled === 'true' ? '已启用，系统将自动推送通知到钉钉群' : '未启用，通知不会推送到钉钉'}
              </span>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}
