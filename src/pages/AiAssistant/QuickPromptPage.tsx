import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useColumnConfig } from '@/hooks/useColumnConfig'
import AiScopeSwitch from '@/components/AiScopeSwitch'
import { useAiScope } from '@/constants/aiScope'
import { formatDateTime } from '@/utils/datetime'
import { confirmDelete } from '@/utils/confirmDelete'
import {
  deleteQuickPrompt,
  fetchQuickPrompts,
  saveQuickPrompt,
  type AiQuickPrompt,
} from '@/api/aiQuickPrompt'
import AiAssistantPageShell from './PageShell'

/** 与后端 domain/system_code 约定一致；空值代表全系统可见 */
const SYSTEM_OPTIONS = [
  { value: 'ai', label: 'AI 中心' },
  { value: 'rdm', label: '產研交付' },
  { value: 'finance', label: '財務' },
  { value: 'eam', label: '物資' },
  { value: 'hr', label: '人事' },
]

function systemLabel(code?: string | null) {
  if (!code) return <Tag>全系統</Tag>
  const hit = SYSTEM_OPTIONS.find((o) => o.value === code)
  return <Tag color="blue">{hit?.label ?? code}</Tag>
}

/**
 * 快捷提问配置：维护首页对话底部的建议问题。
 * <p>问题本身只影响“点一下填什么”，不改变权限与工具范围；停用后首页立即不再展示。
 */
export default function QuickPromptPage() {
  const { t } = useTranslation()
  const [rows, setRows] = useState<AiQuickPrompt[]>([])
  const [loading, setLoading] = useState(false)
  const [scope, setScope] = useAiScope('ai-quick-prompt', 'all')
  const [keyword, setKeyword] = useState<string | undefined>()
  const [pagination, setPagination] = useState({ page: 1, size: 20 })
  const [editing, setEditing] = useState<AiQuickPrompt | null>(null)
  const [saving, setSaving] = useState(false)
  const [searchForm] = Form.useForm<{ keyword?: string }>()
  const [form] = Form.useForm<AiQuickPrompt>()

  const load = useCallback(() => {
    setLoading(true)
    fetchQuickPrompts({ systemCode: scope === 'all' ? undefined : scope, keyword })
      .then(setRows)
      .catch(() => message.error('載入快捷提問失敗'))
      .finally(() => setLoading(false))
  }, [scope, keyword])

  useEffect(() => {
    load()
  }, [load])

  const handleSearch = () => {
    setPagination((prev) => ({ ...prev, page: 1 }))
    setKeyword((searchForm.getFieldValue('keyword') ?? '').trim() || undefined)
  }

  const handleReset = () => {
    searchForm.resetFields()
    setPagination((prev) => ({ ...prev, page: 1 }))
    setKeyword(undefined)
  }

  const openEdit = (row?: AiQuickPrompt) => {
    const next: AiQuickPrompt = row ?? {
      domain: 'common', question: '', enabled: 1, sort: 0,
      systemCode: scope === 'all' ? null : scope,
    }
    setEditing(next)
    form.setFieldsValue(next)
  }

  const save = async () => {
    const values = await form.validateFields()
    setSaving(true)
    try {
      await saveQuickPrompt({
        ...editing,
        ...values,
        enabled: values.enabled ? 1 : 0,
      })
      message.success('已保存')
      setEditing(null)
      load()
    } catch (e) {
      message.error(e instanceof Error ? e.message : '保存失敗')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (row: AiQuickPrompt) => {
    if (!row.id) return
    try {
      await deleteQuickPrompt(row.id)
      message.success('已刪除')
      load()
    } catch (e) {
      message.error(e instanceof Error ? e.message : '刪除失敗')
    }
  }

  const columns: ColumnsType<AiQuickPrompt> = [
    {
      key: 'question',
      title: '問題',
      dataIndex: 'question',
      render: (value: string) => <span style={{ whiteSpace: 'pre-wrap' }}>{value}</span>,
    },
    {
      key: 'systemCode',
      title: '適用系統',
      dataIndex: 'systemCode',
      width: 130,
      render: (value: string | null) => systemLabel(value),
    },
    {
      key: 'roleCode',
      title: '適用角色',
      dataIndex: 'roleCode',
      width: 140,
      render: (value: string | null) => (value ? <Tag>{value}</Tag> : <Tag>全角色</Tag>),
    },
    { key: 'sort', title: '排序', dataIndex: 'sort', width: 80 },
    {
      key: 'enabled',
      title: '狀態',
      dataIndex: 'enabled',
      width: 90,
      render: (value: number) =>
        value === 1 ? <Tag color="success">啟用</Tag> : <Tag>停用</Tag>,
    },
    { key: 'updatedBy', title: '更新人', dataIndex: 'updatedBy', width: 120, render: (v) => v || '--' },
    {
      key: 'updatedAt',
      title: '更新時間',
      dataIndex: 'updatedAt',
      width: 170,
      render: (value?: string | number) => formatDateTime(value),
    },
    {
      key: 'action',
      title: '操作',
      width: 120,
      render: (_, row) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => openEdit(row)}>編輯</Button>
          <Button type="link" size="small" danger
            onClick={() => confirmDelete({
              title: '確認刪除這條快捷提問？',
              content: '刪除後首頁不再展示該問題；已產生的對話記錄不受影響。',
              onOk: () => remove(row),
            })}>
            刪除
          </Button>
        </Space>
      ),
    },
  ]

  const columnMeta = useMemo(() => [
    { key: 'question', title: '問題' },
    { key: 'systemCode', title: '適用系統' },
    { key: 'roleCode', title: '適用角色' },
    { key: 'sort', title: '排序' },
    { key: 'enabled', title: '狀態' },
    { key: 'updatedBy', title: '更新人' },
    { key: 'updatedAt', title: '更新時間' },
    { key: 'action', title: '操作' },
  ], [])

  const { configComponent, applyConfig } = useColumnConfig('ai-quick-prompt', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' },
  ])

  return (
    <AiAssistantPageShell
      title="快捷提問"
      intro="首頁對話底部的建議問題由這裡維護：按系統與角色收斂，最多展示 6 條；問題只影響「點一下填什麼」，不改變權限與工具範圍。"
    >
      <div className="search-section">
        <Form form={searchForm} layout="inline" onFinish={handleSearch}>
          <Form.Item label="問題關鍵詞" name="keyword">
            <Input allowClear placeholder="輸入關鍵詞" onPressEnter={handleSearch} />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>查詢</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>重置</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      <div className="action-section">
        <div className="action-section-left">
          <AiScopeSwitch value={scope} onChange={setScope} includeAll />
        </div>
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openEdit()}>
            新增快捷提問
          </Button>
          {configComponent}
        </div>
      </div>

      <Table
        className="nowrap-table"
        rowKey={(row) => String(row.id)}
        loading={loading}
        columns={applyConfig(columns)}
        dataSource={rows}
        scroll={{ x: 'max-content' }}
        pagination={{
          current: pagination.page,
          pageSize: pagination.size,
          total: rows.length,
          showSizeChanger: true,
          showQuickJumper: true,
          pageSizeOptions: ['10', '20', '50', '100'],
          showTotal: (total) => t('common.total', { count: total, defaultValue: '共 {{count}} 條' }),
          onChange: (page, size) =>
            setPagination({ page: size !== pagination.size ? 1 : page, size: size || 20 }),
        }}
        locale={{ emptyText: '暫無快捷提問' }}
      />

      <Modal
        open={!!editing}
        title={editing?.id ? '編輯快捷提問' : '新增快捷提問'}
        onCancel={() => setEditing(null)}
        onOk={save}
        confirmLoading={saving}
        okText="保存"
        destroyOnHidden
        width={560}
      >
        <Form form={form} layout="vertical" initialValues={{ domain: 'common', enabled: 1, sort: 0 }}>
          <Form.Item
            name="question"
            label="問題"
            rules={[{ required: true, message: '請輸入問題' }]}
          >
            <Input.TextArea rows={3} maxLength={200} showCount placeholder="例如：待我審批的需求有哪些？" />
          </Form.Item>
          <Form.Item name="systemCode" label="適用系統" extra="留空表示全系統可見">
            <Select allowClear placeholder="全系統" options={SYSTEM_OPTIONS} />
          </Form.Item>
          <Form.Item name="roleCode" label="適用角色">
            <Input allowClear placeholder="留空表示全角色可見" maxLength={64} />
          </Form.Item>
          <Form.Item name="sort" label="排序" extra="數字越小越靠前">
            <InputNumber min={0} max={9999} style={{ width: 160 }} />
          </Form.Item>
          <Form.Item name="enabled" label="啟用" valuePropName="checked">
            <Switch checkedChildren="啟用" unCheckedChildren="停用" />
          </Form.Item>
        </Form>
      </Modal>
    </AiAssistantPageShell>
  )
}
