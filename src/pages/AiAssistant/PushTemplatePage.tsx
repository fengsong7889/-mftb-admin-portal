import { useCallback, useEffect, useState } from 'react'
import {
  Alert,
  Button,
  Form,
  Input,
  Modal,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { ReloadOutlined, UndoOutlined } from '@ant-design/icons'
import {
  deletePushTemplate,
  fetchBuiltinTemplate,
  fetchPushTemplates,
  renderTemplate,
  savePushTemplate,
  type AiPushTemplate,
} from '@/api/aiPushTemplate'
import AiAssistantPageShell from './PageShell'
import AiScopeSwitch from '@/components/AiScopeSwitch'
import { aiScopeLabel, useAiScope } from '@/constants/aiScope'
import { formatDateTime } from '@/utils/datetime'
import { confirmDelete } from '@/utils/confirmDelete'

const TYPE_LABEL: Record<string, string> = {
  group: '釘釘群',
  person: '個人工作通知',
}

function formatTime(value?: string | null) {
  return formatDateTime(value)
}

/**
 * 推送模板配置：只改“推送长什么样”。
 * <p>推送对象、确认卡、权限与限流仍由服务端控制；模板留空/停用时回落内置文案，
 * 因此这里删错模板不会导致推送不可用，只会回到系统默认。
 */
export default function PushTemplatePage() {
  const [rows, setRows] = useState<AiPushTemplate[]>([])
  const [loading, setLoading] = useState(false)
  const [scope, setScope] = useAiScope('ai-push-template', 'rdm')
  const [editing, setEditing] = useState<AiPushTemplate | null>(null)
  const [saving, setSaving] = useState(false)
  const [placeholders, setPlaceholders] = useState<Record<string, string>>({})
  const [builtinContent, setBuiltinContent] = useState('')
  const [preview, setPreview] = useState('')
  const [form] = Form.useForm<AiPushTemplate>()

  const load = useCallback(() => {
    setLoading(true)
    fetchPushTemplates(scope === 'all' ? undefined : scope)
      .then((data) => setRows(data.map((row) => ({ ...row, builtin: !row.id }))))
      .catch(() => message.error('載入推送模板失敗'))
      .finally(() => setLoading(false))
  }, [scope])

  useEffect(() => {
    load()
  }, [load])
  const openEdit = async (row: AiPushTemplate) => {
    setEditing(row)
    form.setFieldsValue(row)
    setPreview('')
    try {
      const info = await fetchBuiltinTemplate(row.templateKey)
      setPlaceholders(info.placeholders)
      setBuiltinContent(info.template.contentTpl)
      setPreview(renderTemplate(row.contentTpl, info.placeholders))
    } catch {
      setPlaceholders({})
      setBuiltinContent('')
    }
  }

  const refreshPreview = () => {
    setPreview(renderTemplate(form.getFieldValue('contentTpl') ?? '', placeholders))
  }

  const restoreBuiltin = () => {
    form.setFieldsValue({ contentTpl: builtinContent })
    setPreview(renderTemplate(builtinContent, placeholders))
  }

  const save = async () => {
    if (!editing) return
    const values = await form.validateFields()
    setSaving(true)
    try {
      await savePushTemplate({
        ...editing,
        ...values,
        systemCode: (values as AiPushTemplate).systemCode ?? editing.systemCode ?? (scope === 'all' ? 'rdm' : scope),
        status: values.status ? 'active' : 'disabled',
      })
      message.success('已保存，下一次生成推送預覽時生效')
      setEditing(null)
      load()
    } catch (e) {
      message.error(e instanceof Error ? e.message : '保存失敗')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (row: AiPushTemplate) => {
    if (!row.id) return
    try {
      await deletePushTemplate(row.id)
      message.success('已刪除，將回落內置模板')
      load()
    } catch (e) {
      message.error(e instanceof Error ? e.message : '刪除失敗')
    }
  }

  const columns: ColumnsType<AiPushTemplate> = [
    {
      title: '模板',
      dataIndex: 'name',
      render: (value: string, row) => (
        <Space size={6}>
          <span>{value}</span>
          {row.builtin && <Tag>內置</Tag>}
        </Space>
      ),
    },
    { title: '標識', dataIndex: 'templateKey', width: 200 },
    {
      title: '所屬系統',
      dataIndex: 'systemCode',
      width: 120,
      render: (value?: string | null) => <Tag>{aiScopeLabel(value)}</Tag>,
    },
    {
      title: '類型',
      dataIndex: 'targetType',
      width: 140,
      render: (value: string) => TYPE_LABEL[value] ?? value,
    },
    {
      title: '狀態',
      dataIndex: 'status',
      width: 100,
      render: (value: string, row) =>
        row.builtin ? (
          <Tag color="default">未自定義</Tag>
        ) : value === 'active' ? (
          <Tag color="success">啟用</Tag>
        ) : (
          <Tag>停用</Tag>
        ),
    },
    { title: '更新人', dataIndex: 'updatedBy', width: 120, render: (v) => v || '--' },
    {
      title: '更新時間',
      dataIndex: 'updatedAt',
      width: 170,
      render: (value?: string) => formatTime(value),
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_, row) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => openEdit(row)}>編輯</Button>
          <Button type="link" size="small" danger disabled={!row.id}
            onClick={() => confirmDelete({
              title: '確認刪除該模板？',
              content: '刪除後回落到內置模板，推送仍然可用；不會影響已發送的消息。',
              onOk: () => remove(row),
            })}>
            刪除
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <AiAssistantPageShell
      title="推送模板"
      intro="模板只決定推送文案的呈現；推送對象、聊天內確認卡、權限與限流仍由服務端控制。留空或停用時回落至內置模板。"
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 12 }}
        message="佔位符格式 {{key}}；未知佔位符會渲染為 --，避免把 {{xxx}} 直接發到群裡。"
      />

      <div className="action-section">
        <div className="action-section-left">
          <AiScopeSwitch value={scope} onChange={setScope} includeAll />
        </div>
        <div className="action-section-right">
          <Button icon={<ReloadOutlined />} onClick={load}>
            刷新
          </Button>
        </div>
      </div>

      <Table
        rowKey={(row) => row.templateKey}
        loading={loading}
        columns={columns}
        dataSource={rows}
        scroll={{ x: 'max-content' }}
        pagination={{ showSizeChanger: true, showQuickJumper: true, hideOnSinglePage: true }}
        locale={{ emptyText: '暫無推送模板' }}
      />

      <Modal
        open={!!editing}
        title={editing ? `編輯模板 · ${editing.name}` : '編輯模板'}
        onCancel={() => setEditing(null)}
        onOk={save}
        confirmLoading={saving}
        okText="保存"
        width={860}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="模板名稱" rules={[{ required: true, message: '請輸入名稱' }]}>
            <Input maxLength={128} />
          </Form.Item>
          <Form.Item
            name="titleTpl"
            label="推送標題"
            rules={[{ required: true, message: '請輸入標題模板' }]}
          >
            <Input maxLength={200} />
          </Form.Item>
          <Form.Item
            name="contentTpl"
            label="推送正文（Markdown）"
            rules={[{ required: true, message: '請輸入正文模板' }]}
            extra="支援 Markdown；釘釘群與個人工作通知共用該正文"
          >
            <Input.TextArea rows={12} maxLength={8000} showCount onChange={refreshPreview} />
          </Form.Item>
          <Form.Item name="status" label="啟用" valuePropName="checked" getValueProps={(v) => ({ checked: v !== 'disabled' })} normalize={(v) => (v ? 'active' : 'disabled')}>
            <Switch checkedChildren="啟用" unCheckedChildren="停用" />
          </Form.Item>
        </Form>

        <Space wrap style={{ marginBottom: 8 }}>
          <Button size="small" icon={<UndoOutlined />} onClick={restoreBuiltin}>
            還原內置模板
          </Button>
        </Space>

        {Object.keys(placeholders).length > 0 && (
          <div style={{ marginBottom: 8 }}>
            <Typography.Text type="secondary">可用占位符：</Typography.Text>{' '}
            {Object.keys(placeholders).map((key) => (
              <Tag key={key} style={{ marginBottom: 4 }}>{`{{${key}}}`}</Tag>
            ))}
          </div>
        )}

        <Typography.Text type="secondary">預覽（示例數據）</Typography.Text>
        <pre style={{ maxHeight: 260, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{preview || '--'}</pre>
      </Modal>
    </AiAssistantPageShell>
  )
}
