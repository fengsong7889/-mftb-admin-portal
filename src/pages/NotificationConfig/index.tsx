import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Form, Input, Select, Button, Tag, Table, Switch, Popconfirm, Space, message, DatePicker, Modal, Tabs } from 'antd'
import { useTranslation } from 'react-i18next'
import EnterpriseAppList from './EnterpriseAppList'
import NotificationScenarioList from './NotificationScenarioList'
import type { ColumnsType } from 'antd/es/table'
import { SearchOutlined, ReloadOutlined, PlusOutlined } from '@ant-design/icons'
import { fetchChannels, toggleChannel, deleteChannel, testChannel } from '../../api/notificationChannel'
import type { ChannelItem, ChannelQuery } from '../../api/notificationChannel'
import { toDateRangeParams } from '../../utils/dateRange'
import './index.css'

/** 预定义场景 */
const PRESET_SCENARIOS: Record<string, string> = {
  general: '通用通知',
  oa_approval: 'OA審批通知',
  ai_assistant: 'AI助手通知',
}

/** 场景标签颜色 */
const SCENARIO_COLORS: Record<string, string> = {
  general: 'default',
  oa_approval: 'processing',
  ai_assistant: 'purple',
}

const STATUS_OPTIONS = [
  { label: '已啟用', value: 1 },
  { label: '已停用', value: 0 },
]

/**
 * 通知渠道配置列表页
 * 标准三段式布局：搜索区 + 操作区 + Table
 */
function RobotChannels() {
  const navigate = useNavigate()
  const [form] = Form.useForm()
  const [dataSource, setDataSource] = useState<ChannelItem[]>([])
  const [loading, setLoading] = useState(false)

  /** 加载数据 */
  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const values = form.getFieldsValue()
      const params: ChannelQuery = {}
      if (values.channel) params.channel = values.channel
      if (values.name) params.name = values.name
      if (values.enabled !== undefined && values.enabled !== null) params.enabled = values.enabled
      if (values.updatedBy) params.updatedBy = values.updatedBy
      const dateRange = toDateRangeParams(values.updatedDateRange)
      if (dateRange.from) params.updatedAfter = dateRange.from
      if (dateRange.to) params.updatedBefore = dateRange.to
      const data = await fetchChannels(params)
      setDataSource(data)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [form])

  useEffect(() => { loadData() }, [loadData])

  /** 搜索 */
  const handleSearch = () => loadData()

  /** 重置 */
  const handleReset = () => {
    form.resetFields()
    setTimeout(() => loadData(), 0)
  }

  /** 启停切换（二次确认） */
  const handleToggle = (id: number, enabled: boolean) => {
    const actionText = enabled ? '啟用' : '停用'
    Modal.confirm({
      title: `確定要${actionText}該配置嗎？`,
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      okText: '確認',
      cancelText: '取消',
      onOk: async () => {
        try {
          await toggleChannel(id, enabled)
          message.success(enabled ? '已啟用' : '已停用')
          await loadData()
        } catch {
          message.error('操作失敗')
        }
      },
    })
  }

  /** 删除 */
  const handleDelete = async (id: number) => {
    try {
      await deleteChannel(id)
      message.success('渠道已刪除')
      await loadData()
    } catch {
      message.error('刪除失敗')
    }
  }

  /** 测试 */
  const [testingId, setTestingId] = useState<number | null>(null)
  const handleTest = async (id: number) => {
    setTestingId(id)
    try {
      const result = await testChannel(id)
      message.success(result)
    } catch {
      message.error('測試消息發送失敗')
    } finally {
      setTestingId(null)
    }
  }

  /** 场景标识 → 显示名 */
  const scenarioLabel = (val: string) => PRESET_SCENARIOS[val] || val

  /** 表格列 */
  const columns: ColumnsType<ChannelItem> = [
    {
      title: '渠道名稱', dataIndex: 'name', key: 'name', width: 150,
      render: (text: string, record: ChannelItem) => (
        <span style={{ fontWeight: record.isDefault === 1 ? 600 : 400 }}>
          {text}
          {record.isDefault === 1 && <Tag color="gold" style={{ marginLeft: 6, fontSize: 11 }}>默認</Tag>}
        </span>
      ),
    },
    {
      title: 'Webhook', dataIndex: 'webhookUrl', key: 'webhookUrl', width: 240,
      ellipsis: true,
      render: (text: string) => (
        <span style={{ color: '#8C8C8C', fontSize: 12, fontFamily: 'monospace' }}>{text || '—'}</span>
      ),
    },
    {
      title: '綁定場景', dataIndex: 'scenarios', key: 'scenarios', width: 180,
      render: (text: string) => {
        if (!text) return <Tag>通用</Tag>
        return text.split(',').filter(Boolean).map(s => (
          <Tag key={s} color={SCENARIO_COLORS[s] || 'default'}>{scenarioLabel(s)}</Tag>
        ))
      },
    },
    {
      title: '@手機號', dataIndex: 'atMobiles', key: 'atMobiles', width: 140,
      ellipsis: true,
      render: (text: string) => text || <span style={{ color: '#D9D9D9' }}>—</span>,
    },
    {
      title: '狀態', dataIndex: 'enabled', key: 'enabled', width: 80,
      render: (_: unknown, record: ChannelItem) => (
        <Switch
          checked={record.enabled === 1}
          checkedChildren="啟用"
          unCheckedChildren="停用"
          onChange={checked => handleToggle(record.id, checked)}
        />
      ),
    },
    {
      title: '最後更新人', dataIndex: 'updatedBy', key: 'updatedBy', width: 120,
      render: (text: string) => text || <span style={{ color: '#D9D9D9' }}>—</span>,
    },
    {
      title: '最後更新時間', dataIndex: 'updatedAt', key: 'updatedAt', width: 165,
      render: (text: string) => text || <span style={{ color: '#D9D9D9' }}>—</span>,
    },
    {
      title: '操作', key: 'action', width: 160, fixed: 'right' as const,
      render: (_: unknown, record: ChannelItem) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => navigate(`/notification-channel-form?id=${record.id}`)}>編輯</Button>
          <Button type="link" size="small" loading={testingId === record.id}
            disabled={record.enabled !== 1} onClick={() => handleTest(record.id)}>測試</Button>
          {record.isDefault !== 1 && (
            <Popconfirm title="確認刪除該渠道？" onConfirm={() => handleDelete(record.id)}
              okText="確認" cancelText="取消">
              <Button type="link" size="small" danger>刪除</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ]

  return (
    <div>
      {/* ====== 搜索区 ====== */}
      <div className="search-section notification-config-search">
        <Form form={form} layout="inline">
          <Form.Item label="渠道名稱" name="name">
            <Input placeholder="請輸入渠道名稱" allowClear onPressEnter={handleSearch} />
          </Form.Item>
          <Form.Item label="狀態" name="enabled">
            <Select placeholder="全部" allowClear options={STATUS_OPTIONS} />
          </Form.Item>
          <Form.Item label="最後更新人" name="updatedBy">
            <Input placeholder="請輸入更新人" allowClear onPressEnter={handleSearch} />
          </Form.Item>
          <Form.Item label="最後更新時間" name="updatedDateRange">
            <DatePicker.RangePicker />
          </Form.Item>
          <Form.Item>
            <div className="search-actions" style={{ justifyContent: 'flex-end' }}>
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>查詢</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>重置</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* ====== 操作区 ====== */}
      <div className="action-section">
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />}
            onClick={() => navigate('/notification-channel-form')}>
            新增渠道
          </Button>
        </div>
      </div>

      {/* ====== 表格 ====== */}
      <Table
        columns={columns}
        dataSource={dataSource}
        rowKey="id"
        loading={loading}
        pagination={false}
        size="middle"
        scroll={{ x: 1235 }}
        locale={{ emptyText: '暫無渠道配置，請點擊「新增渠道」添加' }}
      />
    </div>
  )
}

export default function NotificationConfig() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const activeTab = ['app', 'scenarios'].includes(params.get('tab') || '') ? params.get('tab')! : 'robot'
  return (
    <div className="content-area notification-config">
      <Tabs activeKey={activeTab} onChange={tab => setParams({ tab })} destroyOnHidden items={[
        { key: 'robot', label: t('notificationApp.robotTab'), children: <RobotChannels /> },
        { key: 'app', label: t('notificationApp.appTab'), children: <EnterpriseAppList /> },
        { key: 'scenarios', label: t('notificationApp.scenarioTab'), children: <NotificationScenarioList /> },
      ]} />
    </div>
  )
}
