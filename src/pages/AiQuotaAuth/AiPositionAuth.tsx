import { useEffect, useMemo, useState } from 'react'
import { Button, Checkbox, Form, Input, Modal, Select, Space, Switch, Table, Tag, message, Alert, InputNumber } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined, SearchOutlined, ReloadOutlined } from '@ant-design/icons'
import { fetchMockModels } from '../../api/mock/aiPlatformMock'
import type { AiModel, EnabledStatus } from '../../api/mock/aiPlatformMock'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import { useTranslation } from 'react-i18next'

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
  full: 'permFull',
  restricted: 'permRestricted',
  none: 'permNone',
}

const PERMISSION_LEVEL_COLOR: Record<'full' | 'restricted' | 'none', string> = {
  full: 'success',
  restricted: 'processing',
  none: 'default',
}

export default function AiPositionAuth() {
  const { t } = useTranslation()
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
        message.success(t('aiQuotaAuth.posPermSet', { pos: newMapping.positionName, model: newMapping.modelName }))
      } else if (editingMapping) {
        setMappings((prev) => prev.map((m) => (
          m.id === editingMapping.id
            ? { ...m, ...values, updatedBy: 'admin', updatedAt: new Date().toISOString().replace('T', ' ').slice(0, 19) }
            : m
        )))
        message.success(t('aiQuotaAuth.posPermSaved'))
      }
      setEditingMapping(null)
    })
  }

  const handleMappingDelete = (row: PositionModelMapping) => {
    Modal.confirm({
      title: t('aiQuotaAuth.confirmDeletePosPerm'),
      content: t('aiQuotaAuth.deletePosPermContent', { pos: row.positionName, model: row.modelName }),
      okText: t('common.delete'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: () => {
        setMappings((prev) => prev.filter((m) => m.id !== row.id))
        message.success(t('aiQuotaAuth.posPermDeleted'))
      },
    })
  }

  /* ── 權限啟停（二次確認） ── */
  const handleMappingToggle = (row: PositionModelMapping) => {
    const toDisable = row.status === 1
    const action = toDisable ? t('aiQuotaAuth.disableText') : t('aiQuotaAuth.enableText')
    const effect = toDisable ? t('aiQuotaAuth.cannotCallModel') : t('aiQuotaAuth.canCallModel')
    Modal.confirm({
      title: t('aiQuotaAuth.confirmTogglePosPerm', { action }),
      content: t('aiQuotaAuth.togglePosPermContent', { action, pos: row.positionName, effect, model: row.modelName }),
      okText: t('aiQuotaAuth.confirmOk'),
      cancelText: t('common.cancel'),
      onOk: () => {
        setMappings((prev) => prev.map((m) => (m.id === row.id ? { ...m, status: toDisable ? 0 : 1 } : m)))
        message.success(t('aiQuotaAuth.posPermToggled', { action }))
      },
    })
  }

  /* ── 列字段配置 ── */
  const columnMeta = [
    { key: 'positionName', title: t('aiQuotaAuth.positionNameCol') },
    { key: 'modelName', title: t('aiQuotaAuth.authModelCol') },
    { key: 'permissionLevel', title: t('aiQuotaAuth.permLevelCol') },
    { key: 'dailyLimit', title: t('aiQuotaAuth.dailyLimitCol') },
    { key: 'monthlyLimit', title: t('aiQuotaAuth.monthlyLimitCol') },
    { key: 'priority', title: t('aiQuotaAuth.priorityCol') },
    { key: 'status', title: t('aiQuotaAuth.statusCol') },
    { key: 'action', title: t('common.action') },
  ]

  const { configComponent, applyConfig } = useColumnConfig('ai-pos-auth', columnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  /* ── 表格列 ── */
  const columns: ColumnsType<PositionModelMapping> = [
    { title: t('aiQuotaAuth.positionNameCol'), key: 'positionName', dataIndex: 'positionName', width: 160 },
    {
      key: 'modelName', title: t('aiQuotaAuth.authModelCol'), dataIndex: 'modelName', width: 180,
      render: (_, row) => <span style={{ fontWeight: 500 }}>{row.modelName}</span>,
    },
    {
      key: 'permissionLevel', title: t('aiQuotaAuth.permLevelCol'), dataIndex: 'permissionLevel', width: 120, align: 'center',
      render: (v: 'full' | 'restricted' | 'none') => (
        <Tag color={PERMISSION_LEVEL_COLOR[v]}>{t(`aiQuotaAuth.${PERMISSION_LEVEL_LABEL[v]}`)}</Tag>
      ),
    },
    { key: 'dailyLimit', title: t('aiQuotaAuth.dailyLimitCol'), dataIndex: 'dailyLimit', width: 110, align: 'right', render: (v: number) => v.toLocaleString() },
    { key: 'monthlyLimit', title: t('aiQuotaAuth.monthlyLimitCol'), dataIndex: 'monthlyLimit', width: 110, align: 'right', render: (v: number) => v.toLocaleString() },
    { key: 'priority', title: t('aiQuotaAuth.priorityCol'), dataIndex: 'priority', width: 80, align: 'center', render: (v: number) => v.toLocaleString() },
    {
      key: 'status', title: t('aiQuotaAuth.statusCol'), dataIndex: 'status', width: 80, align: 'center',
      render: (_: unknown, row: PositionModelMapping) => (
        <Switch
          checked={row.status === 1}
          checkedChildren={t('aiQuotaAuth.enableText')}
          unCheckedChildren={t('aiQuotaAuth.disableText')}
          onChange={() => handleMappingToggle(row)}
        />
      ),
    },
    {
      title: t('common.action'), key: 'action', width: 140, align: 'center',
      render: (_, row) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" onClick={() => handleMappingEdit(row)}>{t('common.edit')}</Button>
          <Button type="link" danger onClick={() => handleMappingDelete(row)}>{t('common.delete')}</Button>
        </Space>
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
          <Form.Item label={t('aiQuotaAuth.positionNameCol')}>
            <Input
              value={queryPosition}
              placeholder={t('aiQuotaAuth.positionNamePh')}
              allowClear
              onChange={(e) => setQueryPosition(e.target.value)}
            />
          </Form.Item>
          <Form.Item label={t('aiQuotaAuth.authModelCol')}>
            <Select
              value={queryModel}
              placeholder={t('common.all')}
              allowClear
              options={modelOptions}
              showSearch
              filterOption={(input, option) =>
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
              onChange={(v) => setQueryModel(v)}
            />
          </Form.Item>
          <Form.Item label={t('aiQuotaAuth.permLevelLabel')}>
            <Select
              value={queryPermission}
              placeholder={t('common.all')}
              allowClear
              options={[
                { value: 'full', label: t('aiQuotaAuth.permFull') },
                { value: 'restricted', label: t('aiQuotaAuth.permRestricted') },
                { value: 'none', label: t('aiQuotaAuth.permNone') },
              ]}
              onChange={(v) => setQueryPermission(v)}
            />
          </Form.Item>
          <Form.Item label={t('aiQuotaAuth.statusCol')}>
            <Select
              value={queryStatus}
              placeholder={t('common.all')}
              allowClear
              options={[{ value: '1', label: t('aiQuotaAuth.enableText') }, { value: '0', label: t('aiQuotaAuth.disableText') }]}
              onChange={(v) => setQueryStatus(v)}
            />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>{t('common.search')}</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>{t('common.reset')}</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message={t('aiQuotaAuth.posAuthAlertMsg')}
      />

      {/* 操作區：右側新增 + 列配置 */}
      <div className="action-section">
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={handleMappingCreate}>{t('common.add')}</Button>
          {configComponent}
        </div>
      </div>

      <Table
        rowKey="id"
        size="middle"
        loading={loading}
        columns={applyConfig(columns)}
        dataSource={filteredMappings}
        pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total) => t('aiQuotaAuth.recordsTotalPos', { total }) }}
      />

      {/* 新增/編輯職位權限彈窗 */}
      <Modal
        title={editingMapping === 'new' ? t('aiQuotaAuth.addPosMapping') : t('aiQuotaAuth.editPosMapping')}
        open={editingMapping !== null}
        onOk={handleMappingSave}
        onCancel={() => setEditingMapping(null)}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        width={720}
        destroyOnHidden
      >
        <Form form={mappingForm} layout="vertical">
          <Form.Item name="positionId" label={t('aiQuotaAuth.posLabel')} rules={[{ required: true, message: t('aiQuotaAuth.posRequired') }]}>
            <Select
              placeholder={t('aiQuotaAuth.posPh')}
              options={positionOptions}
              onChange={(value) => {
                const selectedPos = positions.find((p) => p.id === value)
                mappingForm.setFieldValue('positionName', selectedPos?.name || '')
              }}
            />
          </Form.Item>
          <Form.Item name="positionName" label={t('aiQuotaAuth.positionNameCol')} hidden />

          <Form.Item name="modelId" label={t('aiQuotaAuth.authModelCol')} rules={[{ required: true, message: t('aiQuotaAuth.modelRequired') }]}>
            <Select
              placeholder={t('aiQuotaAuth.modelPh')}
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
          <Form.Item name="modelName" label={t('aiQuotaAuth.modelNameCol')} hidden />
          <Form.Item name="modelKey" label={t('aiQuotaAuth.modelKeyCol')} hidden />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="permissionLevel" label={t('aiQuotaAuth.permLevelCol')} rules={[{ required: true }]}>
              <Select
                options={[
                  { value: 'full', label: t('aiQuotaAuth.permFullUnlimited') },
                  { value: 'restricted', label: t('aiQuotaAuth.permRestrictedQuota') },
                  { value: 'none', label: t('aiQuotaAuth.permNone') },
                ]}
              />
            </Form.Item>
            <Form.Item name="priority" label={t('aiQuotaAuth.priorityLabel')} initialValue={0}>
              <InputNumber min={-1000} max={1000} style={{ width: '100%' }} />
            </Form.Item>
          </div>

          <Form.Item name="dailyLimit" label={t('aiQuotaAuth.dailyLimitLabel')} initialValue={0}>
            <InputNumber min={0} max={999999999} style={{ width: '100%' }} placeholder={t('aiQuotaAuth.dailyLimitPh')} />
          </Form.Item>
          <Form.Item name="monthlyLimit" label={t('aiQuotaAuth.monthlyLimitLabel')} initialValue={0}>
            <InputNumber min={0} max={999999999} style={{ width: '100%' }} placeholder={t('aiQuotaAuth.monthlyLimitPh')} />
          </Form.Item>

          <Form.Item label={t('aiQuotaAuth.noteLabel')}>
            <div style={{ fontSize: 12, color: '#8C8C8C', padding: '8px 12px', background: '#F9F0FF', borderRadius: 6 }}>
              <strong>{t('aiQuotaAuth.tipLabel')}</strong><br />
              {t('aiQuotaAuth.posNote1')}<br />
              {t('aiQuotaAuth.posNote2')}<br />
              {t('aiQuotaAuth.posNote3')}<br />
              {t('aiQuotaAuth.posNote4')}
            </div>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
