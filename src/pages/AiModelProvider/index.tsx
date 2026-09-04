import { useEffect, useMemo, useState } from 'react'
import { Button, Modal, Form, Input, Select, Table, Switch, message } from 'antd'
import dayjs from 'dayjs'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined, SearchOutlined, ReloadOutlined } from '@ant-design/icons'
import {
  fetchProviders,
  createProvider,
  updateProvider,
  deleteProvider,
  type AiProvider,
  type ProviderQueryParams
} from '../../api'
import { useColumnConfig } from '../../hooks/useColumnConfig'

export default function AiModelProvider() {
  /* ── 數據 ── */
  const [providers, setProviders] = useState<AiProvider[]>([])
  const [loading, setLoading] = useState(false)
  const [queryName, setQueryName] = useState('')
  const [queryStatus, setQueryStatus] = useState<string | undefined>(undefined)
  const [tick, setTick] = useState(0)

  /* ── 加載數據 ── */
  const loadProviders = async () => {
    setLoading(true)
    try {
      const params: ProviderQueryParams = {}
      if (queryName.trim()) params.name = queryName.trim()
      if (queryStatus) params.status = Number(queryStatus)
      
      const data = await fetchProviders(params)
      setProviders(data)
    } catch (error) {
      console.error('Failed to load providers:', error)
      message.error('加載供應商列表失敗')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadProviders()
  }, [])

  /** 供應商 id → 名稱 */
  const providerName = useMemo(() => {
    const map: Record<string, string> = {}
    providers.forEach((p) => { map[p.id] = p.name })
    return map
  }, [providers])

  /* ── 供應商編輯彈窗 ── */
  const [editingProvider, setEditingProvider] = useState<AiProvider | null>(null)
  const [providerForm] = Form.useForm()

  const handleProviderEdit = (row: AiProvider) => {
    setEditingProvider(row)
    providerForm.setFieldsValue({ 
      name: row.name, 
      providerKey: row.providerKey,
      description: row.description,
      apiUrlBase: row.apiUrlBase,
      remark: row.configJson // 复用 configJson 字段存放 remark
    })
  }

  const handleProviderSave = async () => {
    const values = await providerForm.validateFields()
    
    try {
      if (editingProvider) {
        // 编辑
        await updateProvider(editingProvider.id, {
          providerKey: values.providerKey,
          name: values.name,
          description: values.description,
          apiUrlBase: values.apiUrlBase
        })
        message.success('供應商信息已保存')
      } else {
        // 新增（如果表单支持）
        // await createProvider(values)
        message.info('新增功能待实现')
      }
      
      setEditingProvider(null)
      loadProviders()
    } catch (error: any) {
      console.error('Save failed:', error)
      message.error(error.message || '保存失败')
    }
  }

  const handleProviderDelete = async (row: AiProvider) => {
    Modal.confirm({
      title: '確認刪除該供應商？',
      content: `刪除後「${row.name}」的所有模型將不可用，是否繼續？`,
      okText: '刪除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await deleteProvider(row.id)
          message.success('供應商已刪除')
          loadProviders()
        } catch (error: any) {
          console.error('Delete failed:', error)
          message.error(error.message || '删除失败')
        }
      },
    })
  }

  /* ── 供應商啟停（二次確認） ── */
  const handleProviderToggle = async (row: AiProvider) => {
    const toDisable = row.status === 1
    const newStatus = toDisable ? 0 : 1
    const actionText = toDisable ? '停用' : '啟用'
    
    Modal.confirm({
      title: `確認${actionText}該供應商？`,
      content: `${actionText}後「${row.name}」${toDisable ? '及其下所有模型將立即不可調用' : '將恢復可用，用戶端可正常調用'}`,
      okText: '確認',
      cancelText: '取消',
      onOk: async () => {
        try {
          // TODO: 实现更新状态的 API
          // await updateProvider(row.id, { status: newStatus })
          message.warning(`${actionText}操作暂不支持，请在数据库中手动修改`)
          loadProviders()
        } catch (error: any) {
          console.error('Toggle failed:', error)
          message.error(error.message || '操作失败')
        }
      },
    })
  }

  /* ── 查詢條件 ── */
  const [applied, setApplied] = useState({ name: '', status: undefined as number | undefined })

  const handleSearch = () => {
    setApplied({ name: queryName.trim(), status: queryStatus ? Number(queryStatus) : undefined })
    loadProviders()
  }
  
  const handleReset = () => {
    setQueryName('')
    setQueryStatus(undefined)
    setApplied({ name: '', status: undefined })
    setTick((prev) => prev + 1)
    loadProviders()
  }

  const filteredProviders = useMemo(() => providers.filter((p) => {
    if (applied.name && !p.name.toLowerCase().includes(applied.name.toLowerCase())) return false
    if (applied.status !== undefined && p.status !== applied.status) return false
    return true
  }), [providers, applied])

  /* ── 列字段配置 ── */
  const columnMeta = [
    { key: 'name', title: '供應商' },
    { key: 'providerKey', title: '供应商标识' },
    { key: 'apiUrlBase', title: '接入地址' },
    { key: 'status', title: '状态' },
    { key: 'updatedAt', title: '最后更新时间' },
    { key: 'action', title: '操作' },
  ]

  const { configComponent, applyConfig } = useColumnConfig('ai-model-provider', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  /* ── 表格列 ── */
  const columns: ColumnsType<AiProvider> = [
    { title: '供應商', key: 'name', dataIndex: 'name', width: 200 },
    { title: '供应商标识', key: 'providerKey', dataIndex: 'providerKey', width: 150 },
    {
      title: '接入地址', 
      key: 'apiUrlBase',
      dataIndex: 'apiUrlBase', 
      width: 300, 
      ellipsis: true,
      render: (text: string) => text || '-'
    },
    {
      title: '状态', 
      key: 'status',
      dataIndex: 'status', 
      width: 100, 
      align: 'center',
      render: (_: unknown, row: AiProvider) => (
        <Switch
          checked={row.status === 1}
          checkedChildren="啟用"
          unCheckedChildren="停用"
          onChange={() => handleProviderToggle(row)}
        />
      ),
    },
    {
      title: '最后更新时间', 
      key: 'updatedAt',
      dataIndex: 'updatedAt', 
      width: 180,
      render: (v: string) => v ? <span style={{ whiteSpace: 'nowrap' }}>{dayjs(v).format('YYYY-MM-DD HH:mm:ss')}</span> : '-',
    },
    {
      title: '操作', 
      key: 'action', 
      width: 140, 
      align: 'center',
      render: (_, row) => (
        <>
          <Button type="link" onClick={() => handleProviderEdit(row)}>編輯</Button>
          <Button type="link" danger onClick={() => handleProviderDelete(row)}>刪除</Button>
        </>
      ),
    },
  ]

  return (
    <div className="content-area">
      {/* 智能中心 (AI) 菜單界面頂部沒有菜單名稱 */}

      {/* 查詢區域 */}
      <div className="search-section">
        <Form layout="inline">
          <Form.Item label="供應商名稱">
            <Input value={queryName} placeholder="請輸入供應商名稱" allowClear onChange={(e) => setQueryName(e.target.value)} />
          </Form.Item>
          <Form.Item label="狀態">
            <Select
              value={queryStatus}
              placeholder="全部"
              allowClear
              options={[{ value: '1', label: '啟用' }, { value: '0', label: '停用' }]}
              onChange={(v) => setQueryStatus(v)}
            />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>查詢</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>重置</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 操作區：右側新增 + 列配置 */}
      <div className="action-section">
        <div className="action-section-right">
          <Button 
            type="primary" 
            icon={<PlusOutlined />} 
            onClick={() => message.warning('新增功能待实现')}
          >
            新增
          </Button>
          {configComponent}
        </div>
      </div>

      <Table
        rowKey="id"
        size="middle"
        loading={loading}
        columns={applyConfig(columns)}
        dataSource={filteredProviders}
        pagination={false}
      />

      {/* 供應商編輯彈窗 */}
      <Modal
        title="編輯供應商"
        open={editingProvider !== null}
        onOk={handleProviderSave}
        onCancel={() => {
          setEditingProvider(null)
          providerForm.resetFields()
        }}
        okText="保存"
        cancelText="取消"
        destroyOnHidden
      >
        <Form form={providerForm} layout="vertical">
          <Form.Item name="providerKey" label="供应商标识" rules={[{ required: true, message: '請輸入供应標識' }]}> 
            <Input placeholder="如：bailian、deepseek" disabled={!!editingProvider} />
          </Form.Item>
          <Form.Item name="name" label="供應商名稱" rules={[{ required: true, message: '請輸入供應商名稱' }]}> 
            <Input placeholder="請輸入供應商名稱" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} placeholder="請輸入描述" />
          </Form.Item>
          <Form.Item name="apiUrlBase" label="API Base URL">
            <Input placeholder="https://..." />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
