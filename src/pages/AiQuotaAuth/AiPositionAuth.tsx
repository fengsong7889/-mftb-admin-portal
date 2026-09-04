import { useEffect, useMemo, useState } from 'react'
import { Button, Checkbox, Form, Input, Modal, Select, Switch, Table, Tag, message, Alert, InputNumber } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined, SearchOutlined, ReloadOutlined } from '@ant-design/icons'
import { fetchMockModels } from '../../api/mock/aiPlatformMock'
import type { AiModel, EnabledStatus } from '../../api/mock/aiPlatformMock'
import { useColumnConfig } from '../../hooks/useColumnConfig'

/** 
 * 按职位模型权限映射表数据结构  
 * 对应 ai_position_model_mapping 表
 */
interface PositionModelMapping {
  id: string
  positionId: string
  positionName: string
  modelName: string
  modelKey: string
  permissionLevel: 'full' | 'restricted' | 'none'
  dailyLimit: number
  monthlyLimit: number
  priority: number
  status: EnabledStatus
}

/* ────────────────── 展示常量 ────────────────── */

const PERMISSION_LEVEL_LABEL: Record<'full' | 'restricted' | 'none', string> = {
  full: '完全訪問',
  restricted: '受限訪問',
  none: '禁止訪問',
}

const PERMISSION_LEVEL_COLOR: Record<'full' | 'restricted' | 'none', string> = {
  full: 'success',
  restricted: 'processing',
  none: 'default',
}

export default function AiPositionAuth() {
  /* ── 基礎數據 ── */
  const [mappings, setMappings] = useState<PositionModelMapping[]>([])
  const [models, setModels] = useState<AiModel[]>([])
  const [loading, setLoading] = useState(false)
  const [tick, setTick] = useState(0)

  /** 職位模擬數據（實際應從 EmployeeManagement 獲取） */
  const positions = useMemo(() => [
    { id: '1', name: '高級算法工程師' },
    { id: '2', name: '產品經理' },
    { id: '3', name: '運營專員' },
    { id: '4', name: '測試工程師' },
    { id: '5', name: '架構師' },
  ], [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      fetchMockModels(),
    ]).then(([m]) => {
      if (!cancelled) {
        setModels(m)
      }
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  /** 模型 id → 名稱 */
  const modelNameMap = useMemo(() => {
    const map: Record<string, string> = {}
    models.forEach((m) => { map[m.id] = m.displayName })
    return map
  }, [models])

  /* ── 查詢條件 ── */
  const [queryPosition, setQueryPosition] = useState('')
  const [queryModel, setQueryModel] = useState<string | undefined>(undefined)
  const [queryPermission, setQueryPermission] = useState<string | undefined>(undefined)
  const [queryStatus, setQueryStatus] = useState<string | undefined>(undefined)
  const [applied, setApplied] = useState({
    position: '',
    model: undefined as string | undefined,
    permission: undefined as string | undefined,
    status: undefined as string | undefined,
  })

  const handleSearch = () => {
    setApplied({
      position: queryPosition.trim(),
      model: queryModel,
      permission: queryPermission,
      status: queryStatus,
    })
    setTick((prev) => prev + 1)
  }

  const handleReset = () => {
    setQueryPosition('')
    setQueryModel(undefined)
    setQueryPermission(undefined)
    setQueryStatus(undefined)
    setApplied({ position: '', model: undefined, permission: undefined, status: undefined })
    setTick((prev) => prev + 1)
  }

  const filteredMappings = useMemo(() => mappings.filter((m) => {
    if (applied.position && !m.positionName.toLowerCase().includes(applied.position.toLowerCase())) return false
    if (applied.model && m.modelKey !== applied.model) return false
    if (applied.permission && m.permissionLevel !== applied.permission) return false
    if (applied.status && m.status !== (Number(applied.status) as EnabledStatus)) return false
    return true
  }), [mappings, applied])

  const totalPositionCount = useMemo(() => {
    return [...new Set(mappings.map((m) => m.positionName))].length
  }, [mappings])

  const totalEmployeeCount = useMemo(() => {
    // 假設每個職位平均 5 人
    return totalPositionCount * 5
  }, [totalPositionCount])

  /* ── 新增 / 編輯彈窗 ── */
  const [editingMapping, setEditingMapping] = useState<PositionModelMapping | 'new' | null>(null)
  const [mappingForm] = Form.useForm()

  const handleMappingEdit = (row: PositionModelMapping) => {
    setEditingMapping(row)
    mappingForm.setFieldsValue({
      permissionLevel: row.permissionLevel,
      dailyLimit: row.dailyLimit,
      monthlyLimit: row.monthlyLimit,
      priority: row.priority,
    })
  }

  const handleMappingCreate = () => {
    mappingForm.resetFields()
    mappingForm.setFieldsValue({ status: 1 })
    setEditingMapping('new')
  }

  const handleMappingSave = () => {
    mappingForm.validateFields().then((values) => {
      if (editingMapping === 'new') {
        const newMapping: PositionModelMapping = {
          id: `pm-${Date.now()}`,
          positionId: values.positionId!,
          positionName: values.positionName!,
          modelName: values.modelName!,
          modelKey: values.modelKey!,
          permissionLevel: values.permissionLevel,
          dailyLimit: values.dailyLimit || 0,
          monthlyLimit: values.monthlyLimit || 0,
          priority: values.priority || 0,
          status: 1,
        }
        setMappings((prev) => [...prev, newMapping])
        message.success(`職位「${newMapping.positionName}」對「${newMapping.modelName}」的權限已設置`)
      } else if (editingMapping) {
        setMappings((prev) => prev.map((m) => (
          m.id === editingMapping.id
            ? { ...m, ...values, updatedBy: 'admin', updatedAt: new Date().toISOString().replace('T', ' ').slice(0, 19) }
            : m
        )))
        message.success('職位權限配置已保存')
      }
      setEditingMapping(null)
    })
  }

  const handleMappingDelete = (row: PositionModelMapping) => {
    Modal.confirm({
      title: '確認刪除該職位權限？',
      content: `刪除後「${row.positionName}」將失去對「${row.modelName}」的訪問權限`,
      okText: '刪除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => {
        setMappings((prev) => prev.filter((m) => m.id !== row.id))
        message.success('職位權限已刪除')
      },
    })
  }

  /* ── 權限啟停（二次確認） ── */
  const handleMappingToggle = (row: PositionModelMapping) => {
    const toDisable = row.status === 1
    const actionText = toDisable ? '停用' : '啟用'
    Modal.confirm({
      title: `確認${actionText}該職位權限？`,
      content: `${actionText}後「${row.positionName}」關聯的員工將${toDisable ? '無法調用該模型' : '可恢復調用'} ${row.modelName}`,
      okText: '確認',
      cancelText: '取消',
      onOk: () => {
        setMappings((prev) => prev.map((m) => (m.id === row.id ? { ...m, status: toDisable ? 0 : 1 } : m)))
        message.success(`職位權限已${actionText}`)
      },
    })
  }

  /* ── 列字段配置 ── */
  const columnMeta = [
    { key: 'positionName', title: '職位名稱' },
    { key: 'modelName', title: '授權模型' },
    { key: 'permissionLevel', title: '權限級別' },
    { key: 'dailyLimit', title: '每日限额' },
    { key: 'monthlyLimit', title: '月度限额' },
    { key: 'priority', title: '優先級' },
    { key: 'status', title: '狀態' },
    { key: 'action', title: '操作' },
  ]

  const { configComponent, applyConfig } = useColumnConfig('ai-pos-auth', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  /* ── 表格列 ── */
  const columns: ColumnsType<PositionModelMapping> = [
    { title: '職位名稱', key: 'positionName', dataIndex: 'positionName', width: 160 },
    {
      key: 'modelName', title: '授權模型', dataIndex: 'modelName', width: 180,
      render: (_, row) => <span style={{ fontWeight: 500 }}>{row.modelName}</span>,
    },
    {
      key: 'permissionLevel', title: '權限級別', dataIndex: 'permissionLevel', width: 120, align: 'center',
      render: (v: 'full' | 'restricted' | 'none') => (
        <Tag color={PERMISSION_LEVEL_COLOR[v]}>{PERMISSION_LEVEL_LABEL[v]}</Tag>
      ),
    },
    { key: 'dailyLimit', title: '每日限额', dataIndex: 'dailyLimit', width: 110, align: 'right', render: (v: number) => v.toLocaleString() },
    { key: 'monthlyLimit', title: '月度限额', dataIndex: 'monthlyLimit', width: 110, align: 'right', render: (v: number) => v.toLocaleString() },
    { key: 'priority', title: '優先級', dataIndex: 'priority', width: 80, align: 'center', render: (v: number) => v.toLocaleString() },
    {
      key: 'status', title: '狀態', dataIndex: 'status', width: 80, align: 'center',
      render: (_: unknown, row: PositionModelMapping) => (
        <Switch
          checked={row.status === 1}
          checkedChildren="啟用"
          unCheckedChildren="停用"
          onChange={() => handleMappingToggle(row)}
        />
      ),
    },
    {
      title: '操作', key: 'action', width: 140, align: 'center',
      render: (_, row) => (
        <>
          <Button type="link" onClick={() => handleMappingEdit(row)}>編輯</Button>
          <Button type="link" danger onClick={() => handleMappingDelete(row)}>刪除</Button>
        </>
      ),
    },
  ]

  /* ── 位置選項 ── */
  const positionOptions = positions.map((p) => ({ value: p.id, label: p.name }))

  /* ── 模型選項 ── */
  const modelOptions = models.map((m) => ({ value: m.id, label: m.displayName }))

  return (
    <div className="content-area">
      {/* 智能中心 (AI) 菜單界面頂部沒有菜單名稱 */}

      {/* 查詢區域 */}
      <div className="search-section">
        <Form layout="inline">
          <Form.Item label="職位名稱">
            <Input
              value={queryPosition}
              placeholder="請輸入職位名稱"
              allowClear
              onChange={(e) => setQueryPosition(e.target.value)}
            />
          </Form.Item>
          <Form.Item label="授權模型">
            <Select
              value={queryModel}
              placeholder="全部"
              allowClear
              options={modelOptions}
              showSearch
              filterOption={(input, option) =>
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
              onChange={(v) => setQueryModel(v)}
            />
          </Form.Item>
          <Form.Item label="權限級別">
            <Select
              value={queryPermission}
              placeholder="全部"
              allowClear
              options={[
                { value: 'full', label: '完全訪問' },
                { value: 'restricted', label: '受限訪問' },
                { value: 'none', label: '禁止訪問' },
              ]}
              onChange={(v) => setQueryPermission(v)}
            />
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

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="基於職位的模型權限管理：为不同职位的员工批量分配 AI 模型访问权限和额度限制"
      />

      {/* 操作區：右側新增 + 列配置 */}
      <div className="action-section">
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={handleMappingCreate}>新增</Button>
          {configComponent}
        </div>
      </div>

      <Table
        rowKey="id"
        size="middle"
        loading={loading}
        columns={applyConfig(columns)}
        dataSource={filteredMappings}
        pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total) => `共 ${total} 條記錄` }}
      />

      {/* 新增/編輯職位權限彈窗 */}
      <Modal
        title={editingMapping === 'new' ? '新增職位模型權限' : '編輯職位模型權限'}
        open={editingMapping !== null}
        onOk={handleMappingSave}
        onCancel={() => setEditingMapping(null)}
        okText="保存"
        cancelText="取消"
        width={720}
        destroyOnHidden
      >
        <Form form={mappingForm} layout="vertical">
          <Form.Item name="positionId" label="職位" rules={[{ required: true, message: '請選擇職位' }]}>
            <Select
              placeholder="請選擇職位"
              options={positionOptions}
              onChange={(value) => {
                const selectedPos = positions.find((p) => p.id === value)
                mappingForm.setFieldValue('positionName', selectedPos?.name || '')
              }}
            />
          </Form.Item>
          <Form.Item name="positionName" label="職位名稱" hidden />

          <Form.Item name="modelId" label="授權模型" rules={[{ required: true, message: '請選擇模型' }]}>
            <Select
              placeholder="請選擇模型"
              options={modelOptions}
              onChange={(value) => {
                const selectedModel = models.find((m) => m.id === value)
                mappingForm.setFieldsValue({
                  modelName: selectedModel?.displayName || '',
                  modelKey: selectedModel?.id || '',
                })
              }}
            />
          </Form.Item>
          <Form.Item name="modelName" label="模型名稱" hidden />
          <Form.Item name="modelKey" label="模型 Key" hidden />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="permissionLevel" label="權限級別" rules={[{ required: true }]}>
              <Select
                options={[
                  { value: 'full', label: '完全訪問（無限制）' },
                  { value: 'restricted', label: '受限訪問（可配額度）' },
                  { value: 'none', label: '禁止訪問' },
                ]}
              />
            </Form.Item>
            <Form.Item name="priority" label="優先級（越大越優先）" initialValue={0}>
              <InputNumber min={-1000} max={1000} style={{ width: '100%' }} />
            </Form.Item>
          </div>

          <Form.Item name="dailyLimit" label="每日限额（tokens）" initialValue={0}>
            <InputNumber min={0} max={999999999} style={{ width: '100%' }} placeholder="0=不限制" />
          </Form.Item>
          <Form.Item name="monthlyLimit" label="月度限额（tokens）" initialValue={0}>
            <InputNumber min={0} max={999999999} style={{ width: '100%' }} placeholder="0=不限制" />
          </Form.Item>

          <Form.Item label="說明">
            <div style={{ fontSize: 12, color: '#8C8C8C', padding: '8px 12px', background: '#F9F0FF', borderRadius: 6 }}>
              <strong>提示：</strong><br />
              1. "完全訪問"：员工可无限制调用该模型<br />
              2. "受限访问"：需设置日/月额度上限，超出后自动拒绝请求<br />
              3. "禁止访问"：完全不可调用该模型<br />
              4. 额度单位为 tokens，0 表示不限制
            </div>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
