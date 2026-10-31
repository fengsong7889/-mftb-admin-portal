import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Modal, Form, Input, Select, Space, Table, Switch, message } from 'antd'
import dayjs from 'dayjs'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined, SearchOutlined, ReloadOutlined, KeyOutlined, CheckCircleOutlined, CloseCircleOutlined, ExclamationCircleOutlined } from '@ant-design/icons'
import HelpPopover from '@/components/HelpPopover'
import {
  fetchProviders,
  createProvider,
  updateProvider,
  deleteProvider,
  AI_API_KEY_STATUS,
  resolveApiKeyStatus,
  type AiProvider,
  type ProviderQueryParams
} from '@/api'
import { useColumnConfig } from '@/hooks/useColumnConfig'
import { tablePagination } from '@/utils/tableDisplay'

export default function AiModelProvider() {
  const { t } = useTranslation()
  /* ─ 數據 ── */
  const [providers, setProviders] = useState<AiProvider[]>([])
  const [loading, setLoading] = useState(false)
  const [queryName, setQueryName] = useState('')
  const [queryStatus, setQueryStatus] = useState<string | undefined>(undefined)
  const [tick, setTick] = useState(0)
  
  /* ─ 搜索表單實例 ── */
  const [searchForm] = Form.useForm()

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

  /** 当前编辑行的 Key 是否已失效（存过密文但解不开）：决定弹窗提示与是否强制重填 */
  const editingKeyStale = editingProvider !== null
    && resolveApiKeyStatus(editingProvider) === AI_API_KEY_STATUS.STALE

  const handleProviderEdit = (row: AiProvider) => {
    setEditingProvider(row)
    providerForm.setFieldsValue({ 
      name: row.name, 
      providerKey: row.providerKey,
      description: row.description,
      apiUrlBase: row.apiUrlBase,
      apiKey: '', // 留空表示不修改，輸入新值則覆蓋
      remark: row.configJson // 复用 configJson 字段存放 remark
    })
  }

  const handleProviderSave = async () => {
    const values = await providerForm.validateFields()

    // 纯 UX 拦截：旧密文已解不开，留空保存等于什么都没改，用户会以为已修复
    // （后端语义不变：空值仍保留旧 Key，因此这里不传空值给后端做判断）
    if (editingKeyStale && !String(values.apiKey ?? '').trim()) {
      message.warning('原密鑰已無法解密，請重新輸入 API Key 後再保存')
      return
    }
    
    try {
      if (editingProvider) {
        // 编辑
        await updateProvider(editingProvider.id, {
          providerKey: values.providerKey,
          name: values.name,
          description: values.description,
          apiUrlBase: values.apiUrlBase,
          apiKey: values.apiKey || undefined, // 空值不传，后端保留旧 Key
        })
        message.success('供應商信息已保存')
      } else {
        // 新增（如果表单支持）
        // await createProvider(values)
        message.info('新增功能待實现')
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
      className: 'custom-confirm-modal',
      icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
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
          message.error(error.message || '刪除失败')
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
      className: 'custom-confirm-modal',
      icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
      title: `確認${actionText}該供應商？`,
      content: `${actionText}後「${row.name}」${toDisable ? '及其下所有模型將立即不可調用' : '將恢復可用，用戶端可正常調用'}`,
      okText: '確認',
      cancelText: '取消',
      // 停用会使该供应商及其全部模型立即不可调用，属危险操作（§B.1 要求红色按钮）
      okButtonProps: toDisable ? { danger: true } : undefined,
      onOk: async () => {
        try {
          await updateProvider(row.id, {
            providerKey: row.providerKey,
            name: row.name,
            status: newStatus,
          })
          message.success(`${row.name} 已${actionText}`)
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
    { key: 'providerKey', title: '供應商標識' },
    { key: 'apiUrlBase', title: '接入地址' },
    { key: 'apiKeyStatus', title: 'API Key' },
    { key: 'status', title: '狀態' },
    { key: 'updatedAt', title: '最後更新時間' },
    { key: 'action', title: '操作' },
  ]

  const { configComponent, applyConfig } = useColumnConfig('ai-model-provider', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  /* ── 表格列 ── */
  const columns: ColumnsType<AiProvider> = [
    { title: '供應商', key: 'name', dataIndex: 'name', width: 200 },
    { title: '供應商標識', key: 'providerKey', dataIndex: 'providerKey', width: 150 },
    {
      title: '接入地址', 
      key: 'apiUrlBase',
      dataIndex: 'apiUrlBase', 
      width: 280, 
      ellipsis: true,
      render: (text: string) => text || '-'
    },
    {
      title: 'API Key',
      key: 'apiKeyStatus',
      width: 200,
      align: 'center',
      render: (_: unknown, row: AiProvider) => {
        const keyStatus = resolveApiKeyStatus(row)
        // 三态各回各的：密钥轮换后旧密文解不开，若仍显示「未配置」，管理员会反复重填也定位不到根因
        if (keyStatus === AI_API_KEY_STATUS.STALE) {
          return (
            <span style={{ color: '#FA8C16', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <ExclamationCircleOutlined />
              密鑰已失效
              <HelpPopover
                title="為什麼顯示「密鑰已失效」"
                ariaLabel="密鑰已失效說明"
                placement="left"
                width={420}
                content={[
                  { tone: 'info', label: '含義', body: 'API Key 已存在資料庫，但當前加密密鑰解不開它，所以無法顯示脫敏串。' },
                  { tone: 'warn', label: '成因', body: '加密密鑰發生變更（例如輪換了 JWT_SECRET 或 AI_PROVIDER_CRYPTO_KEY）。' },
                  { tone: 'danger', label: '後果', body: '該供應商的模型調用會直接失敗，與從未配置時表現相同。' },
                  { tone: 'success', label: '處置', body: '點「編輯」重新貼上 API Key 並保存，系統會用當前密鑰重新加密。' },
                ]}
              />
            </span>
          )
        }
        const hasKey = keyStatus === AI_API_KEY_STATUS.OK
        return hasKey ? (
          <span style={{ color: '#52C41A', fontSize: 12 }}>
            <CheckCircleOutlined style={{ marginRight: 4 }} />
            <span style={{ fontFamily: 'monospace' }}>{row.apiKeyMasked}</span>
          </span>
        ) : (
          <span style={{ color: '#FF4D4F', fontSize: 12 }}>
            <CloseCircleOutlined style={{ marginRight: 4 }} />
            未配置
          </span>
        )
      },
    },
    {
      title: '狀態', 
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
      title: '最後更新時間', 
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
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" onClick={() => handleProviderEdit(row)}>編輯</Button>
          <Button type="link" danger onClick={() => handleProviderDelete(row)}>刪除</Button>
        </Space>
      ),
    },
  ]

  return (
    <div className="content-area">
      {/* 智能中心 (AI) 菜單界面頂部沒有菜單名稱 */}

      {/* 查詢區域 */}
      <div className="search-section">
        <Form form={searchForm} layout="inline">
          <Form.Item label="供應商名稱" name="name">
            <Input value={queryName} placeholder="請輸入供應商名稱" allowClear onChange={(e) => setQueryName(e.target.value)} />
          </Form.Item>
          <Form.Item label="狀態" name="status">
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
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>{t('common.search')}</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>重置</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 操作區：左側無按鈕 + 右側新增 + 列配置 */}
      <div className="action-section">
        <div className="action-section-left">
          {/* 預留左側容器，保持標準結構 */}
        </div>
        <div className="action-section-right">
          <Button 
            type="primary" 
            icon={<PlusOutlined />} 
            onClick={() => message.warning('新增功能待實现')}
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
        pagination={tablePagination(t)}
        scroll={{ x: 1200 }}
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
          <Form.Item name="providerKey" label="供應商標識" rules={[{ required: true, message: '請輸入供應標識' }]}> 
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
          <Form.Item 
            name="apiKey" 
            label={
              <span>
                <KeyOutlined style={{ marginRight: 4 }} />
                API Key
                {editingProvider?.apiKeyMasked && (
                  <span style={{ fontSize: 11, color: '#8C8C8C', marginLeft: 8 }}>
                    當前：{editingProvider.apiKeyMasked}
                  </span>
                )}
                {editingKeyStale && (
                  <span style={{ fontSize: 11, color: '#FA8C16', marginLeft: 8 }}>
                    原密鑰已失效，請重新輸入
                  </span>
                )}
              </span>
            }
          >
            <Input.Password 
              placeholder={editingProvider
                ? (editingKeyStale ? '原密鑰已失效，請重新輸入後保存' : '留空保留原 Key，輸入新值則覆蓋')
                : '請輸入 API Key'}
              visibilityToggle
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
