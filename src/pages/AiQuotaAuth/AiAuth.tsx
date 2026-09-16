import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Form, Input, Modal, Popover, Select, Space, Switch, Table, Tabs, Tag, message, Alert } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined, SearchOutlined, ReloadOutlined, DeleteOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import {
  fetchModels,
  fetchDeptAuthGroups,
  deleteDeptAuthGroup,
  toggleDeptAuthGroupStatus,
  type AiModel,
  type DeptAuthGroupItem,
} from '../../api'
import {
  fetchMockEmployeeOverrides,
} from '../../api/mock/aiPlatformMock'
import type {
  EmployeeModelOverride,
} from '../../api/mock/aiPlatformMock'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import { CAPABILITY_SHORT_FIELDS, type CapabilityKey } from './empAuth/modelAuthCapability'

export default function AiAuth({ fixedTab }: { fixedTab?: 'dept' | 'employee' } = {}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  /* ── 基礎數據 ── */
  const [models, setModels] = useState<AiModel[]>([])
  const [deptGroups, setDeptGroups] = useState<DeptAuthGroupItem[]>([])
  const [overrides, setOverrides] = useState<EmployeeModelOverride[]>([])
  const [loading, setLoading] = useState(false)

  /** 加載模型列表 */
  const loadModels = () => {
    fetchModels({ status: 1 }).then(setModels).catch(() => {})
  }

  /** 加載策略列表 */
  const loadDeptGroups = () => {
    setLoading(true)
    fetchDeptAuthGroups()
      .then(setDeptGroups)
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadModels()
    if (fixedTab !== 'employee') {
      loadDeptGroups()
    }
    if (fixedTab === 'employee' || fixedTab == null) {
      fetchMockEmployeeOverrides().then(setOverrides).catch(() => {})
    }
  }, [fixedTab])

  /** 模型 id → 名稱 */
  const modelName = useMemo(() => {
    const map: Record<string, string> = {}
    models.forEach((m) => { map[String(m.id)] = m.name })
    return map
  }, [models])

  /** 模型 id → AiModel 完整對象（用於構建能力配置） */
  const modelMap = useMemo(() => {
    const map: Record<number, AiModel> = {}
    models.forEach((m) => { map[m.id] = m })
    return map
  }, [models])

  /** 為部門策略構建 modelConfigs：後端列表未返回時，從 modelIds + 模型能力自動構建 */
  const buildModelConfigs = (row: DeptAuthGroupItem) => {
    if (row.modelConfigs?.length) return row.modelConfigs
    if (!row.modelIds?.length) return []
    return row.modelIds.map((id) => {
      const m = modelMap[id]
      return {
        modelId: id,
        visionSupport: (m?.visionSupport ?? 0) as number,
        functionCalling: (m?.functionCalling ?? 0) as number,
        jsonMode: (m?.jsonMode ?? 0) as number,
        streaming: (m?.streaming ?? 0) as number,
        thinkingMode: (m?.thinkingMode ?? 0) as number,
      }
    })
  }

  /* ══════════════ Tab1: 部門模型權控（分組策略模式） ══════════════ */
  const [queryGroupName, setQueryGroupName] = useState('')
  const [queryResidency, setQueryResidency] = useState<string | undefined>(undefined)
  const [appliedDept, setAppliedDept] = useState({ name: '', residency: undefined as string | undefined })

  const handleDeptSearch = () => setAppliedDept({ name: queryGroupName.trim(), residency: queryResidency })
  const handleDeptReset = () => {
    setQueryGroupName('')
    setQueryResidency(undefined)
    setAppliedDept({ name: '', residency: undefined })
  }

  const filteredGroups = useMemo(() => deptGroups.filter((g) => {
    if (appliedDept.name && !g.name.toLowerCase().includes(appliedDept.name.toLowerCase())) return false
    if (appliedDept.residency === '1' && !g.dataResidency) return false
    if (appliedDept.residency === '0' && g.dataResidency) return false
    return true
  }), [deptGroups, appliedDept])

  const totalDeptCount = useMemo(() => deptGroups.reduce((s, g) => s + g.deptIds.length, 0), [deptGroups])
  const totalEmployeeCount = useMemo(() => deptGroups.reduce((s, g) => s + g.totalEmployeeCount, 0), [deptGroups])

  /* ── 導航至獨立頁面 ── */
  const handleGroupCreate = () => {
    navigate('/ai-dept-auth-edit?type=add')
  }

  const handleGroupEdit = (row: DeptAuthGroupItem) => {
    navigate(`/ai-dept-auth-edit?id=${row.id}`)
  }

  const handleGroupDetail = (row: DeptAuthGroupItem) => {
    navigate(`/ai-dept-auth-detail?id=${row.id}`)
  }

  const handleGroupDelete = (row: DeptAuthGroupItem) => {
    Modal.confirm({
      title: t('aiQuotaAuth.confirmDeleteDeptStrategy'),
      content: t('aiQuotaAuth.deleteDeptStrategyContent', { name: row.name, count: row.deptIds.length }),
      okText: t('common.delete'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await deleteDeptAuthGroup(row.id)
          message.success(t('aiQuotaAuth.deptStrategyDeleted', { name: row.name }))
          loadDeptGroups()
        } catch {
          message.error(t('aiQuotaAuth.deleteFailed'))
        }
      },
    })
  }

  /* ── 策略啟停（二次確認） ── */
  const handleGroupToggle = (row: DeptAuthGroupItem) => {
    const toDisable = row.status === 1
    Modal.confirm({
      title: toDisable ? t('aiQuotaAuth.confirmDisableDept') : t('aiQuotaAuth.confirmEnableDept'),
      content: toDisable
        ? t('aiQuotaAuth.disableDeptContent', { name: row.name, count: row.deptIds.length })
        : t('aiQuotaAuth.enableDeptContent', { name: row.name, count: row.deptIds.length }),
      okText: t('aiQuotaAuth.confirmOk'),
      cancelText: t('common.cancel'),
      okButtonProps: toDisable ? { danger: true } : undefined,
      onOk: async () => {
        try {
          await toggleDeptAuthGroupStatus(row.id, toDisable ? 0 : 1)
          message.success(toDisable ? t('aiQuotaAuth.deptStrategyDisabled', { name: row.name }) : t('aiQuotaAuth.deptStrategyEnabled', { name: row.name }))
          loadDeptGroups()
        } catch {
          message.error(toDisable ? t('aiQuotaAuth.disableFailed') : t('aiQuotaAuth.enableFailed'))
        }
      },
    })
  }

  /* ── 列字段配置（部門權控） ── */
  const deptColumnMeta = [
    { key: 'configCode', title: t('aiQuotaAuth.configIdCol') },
    { key: 'name', title: t('aiQuotaAuth.strategyNameCol') },
    { key: 'deptNames', title: t('aiQuotaAuth.deptNamesCol') },
    { key: 'totalEmployeeCount', title: t('aiQuotaAuth.coverCountCol') },
    { key: 'modelIds', title: t('aiQuotaAuth.authModelCol') },
    { key: 'capabilities', title: t('aiQuotaAuth.capabilityCol') },
    { key: 'dataResidency', title: t('aiQuotaAuth.dataResidencyTag') },
    { key: 'status', title: t('aiQuotaAuth.statusCol') },
    { key: 'updatedBy', title: t('aiQuotaAuth.lastUpdatedByCol') },
    { key: 'updatedAt', title: t('aiQuotaAuth.lastUpdatedAtCol') },
    { key: 'action', title: t('common.action') },
  ]

  const { configComponent: deptConfigComponent, applyConfig: applyDeptConfig } = useColumnConfig('ai-dept-model-auth', deptColumnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  /* ── 表格列（部門權控） ── */
  const deptColumns: ColumnsType<DeptAuthGroupItem> = [
    {
      key: 'configCode', title: t('aiQuotaAuth.configIdCol'), dataIndex: 'configCode', width: 160, align: 'center',
      render: (v: string) => <Tag color="blue">{v || '-'}</Tag>,
    },
    { key: 'name', title: t('aiQuotaAuth.strategyNameCol'), dataIndex: 'name', width: 170 },
    {
      key: 'deptNames', title: t('aiQuotaAuth.deptNamesCol'), dataIndex: 'deptNames', width: 260,
      render: (v: string[]) => (
        <span>
          {v.slice(0, 3).map((name) => (
            <Tag key={name} style={{ marginRight: 4, marginBottom: 2 }}>{name}</Tag>
          ))}
          {v.length > 3 && (
            <Popover
              content={
                <div style={{ maxWidth: 300 }}>
                  {v.map((name) => (
                    <Tag key={name} style={{ marginRight: 4, marginBottom: 4 }}>{name}</Tag>
                  ))}
                </div>
              }
              title={t('aiQuotaAuth.allDeptPopover', { count: v.length })}
              trigger="click"
            >
              <Tag style={{ marginRight: 4, marginBottom: 2, cursor: 'pointer', color: '#E8720C', borderColor: '#E8720C' }}>+{v.length - 3}</Tag>
            </Popover>
          )}
        </span>
      ),
    },
    { key: 'totalEmployeeCount', title: t('aiQuotaAuth.coverCountCol'), dataIndex: 'totalEmployeeCount', width: 100, align: 'right', render: (v: number) => t('aiQuotaAuth.coverCountRender', { count: v.toLocaleString() }) },
    {
      key: 'modelIds', title: t('aiQuotaAuth.authModelCol'), dataIndex: 'modelIds', width: 200,
      render: (ids: string[]) => {
        if (!ids?.length) return <Tag color="error">{t('aiQuotaAuth.unauthorizedTag')}</Tag>
        return (
          <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {ids.slice(0, 3).map((id) => (
              <Tag key={id} style={{ color: '#E8720C', background: '#FFF7E6', border: '1px solid #FFD8A8' }}>
                {modelName[id] ?? id}
              </Tag>
            ))}
            {ids.length > 3 && (
              <Popover
                trigger="click"
                content={
                  <div style={{ maxWidth: 300 }}>
                    {ids.map((id) => (
                      <Tag key={id} style={{ marginRight: 4, marginBottom: 4, color: '#E8720C', background: '#FFF7E6', border: '1px solid #FFD8A8' }}>
                        {modelName[id] ?? id}
                      </Tag>
                    ))}
                  </div>
                }
                title={t('aiQuotaAuth.allModelPopover', { count: ids.length })}
              >
                <Tag style={{ color: '#E8720C', borderColor: '#E8720C', cursor: 'pointer' }}>+{ids.length - 3}</Tag>
              </Popover>
            )}
          </span>
        )
      },
    },
    {
      key: 'capabilities', title: t('aiQuotaAuth.capabilityCol'), width: 220,
      render: (_: unknown, row: DeptAuthGroupItem) => {
        const configs = buildModelConfigs(row)
        if (!configs.length) return <span style={{ color: '#BFBFBF', fontSize: 12 }}>{t('aiQuotaAuth.notConfiguredShort')}</span>
        // 去重：收集所有模型中已啟用的能力
        const enabledCaps = CAPABILITY_SHORT_FIELDS.filter(({ key }) =>
          configs.some((c) => c[key] === 1),
        )
        if (!enabledCaps.length) return <span style={{ color: '#BFBFBF', fontSize: 12 }}>{t('aiQuotaAuth.noCapability')}</span>
        return (
          <Popover
            trigger="click"
            title={t('aiQuotaAuth.capabilityDetailTitle')}
            content={
              <div style={{ maxWidth: 380 }}>
                {configs.map((c) => {
                  const caps = CAPABILITY_SHORT_FIELDS.filter(({ key }) => c[key] === 1)
                  return (
                    <div key={c.modelId} style={{ marginBottom: 10 }}>
                      <div style={{ fontWeight: 500, marginBottom: 4 }}>{modelName[c.modelId] ?? `#${c.modelId}`}</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {caps.length > 0
                          ? caps.map(({ key, labelKey, color }) => (
                              <Tag key={key} color={color} style={{ fontSize: 11 }}>{t('aiQuotaAuth.' + labelKey)}</Tag>
                            ))
                          : <span style={{ fontSize: 11, color: '#BFBFBF' }}>{t('aiQuotaAuth.noCapability')}</span>
                        }
                      </div>
                    </div>
                  )
                })}
              </div>
            }
          >
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, cursor: 'pointer' }}>
              {enabledCaps.map(({ key, labelKey, color }) => (
                <Tag key={key} color={color} style={{ fontSize: 11 }}>{t('aiQuotaAuth.' + labelKey)}</Tag>
              ))}
            </div>
          </Popover>
        )
      },
    },
    {
      key: 'dataResidency', title: t('aiQuotaAuth.dataResidencyTag'), dataIndex: 'dataResidency', width: 100, align: 'center',
      render: (v: boolean) => (v ? <Tag color="purple">{t('aiQuotaAuth.enabledTag')}</Tag> : <Tag color="default">{t('aiQuotaAuth.disabledTag')}</Tag>),
    },
    {
      key: 'status', title: t('aiQuotaAuth.statusCol'), dataIndex: 'status', width: 80, align: 'center',
      render: (_: unknown, row: DeptAuthGroupItem) => (
        <Switch
          checked={row.status === 1}
          checkedChildren={t('aiQuotaAuth.enableText')}
          unCheckedChildren={t('aiQuotaAuth.disableText')}
          onChange={() => handleGroupToggle(row)}
        />
      ),
    },
    {
      key: 'updatedBy', title: t('aiQuotaAuth.lastUpdatedByCol'), dataIndex: 'updatedBy', width: 100,
      render: (v: string) => <span>{v}</span>,
    },
    { key: 'updatedAt', title: t('aiQuotaAuth.lastUpdatedAtCol'), dataIndex: 'updatedAt', width: 160, render: (v: string) => <span>{v}</span> },
    {
      key: 'action', title: t('common.action'), width: 180, align: 'center',
      render: (_, row) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" onClick={() => handleGroupDetail(row)}>{t('common.detail')}</Button>
          <Button type="link" onClick={() => handleGroupEdit(row)}>{t('common.edit')}</Button>
          <Button type="link" danger onClick={() => handleGroupDelete(row)}>{t('common.delete')}</Button>
        </Space>
      ),
    },
  ]

  /* ══════════════ Tab2: 員工額外授權 ══════════════ */
  const [queryEmp, setQueryEmp] = useState('')
  const [queryEmpDept, setQueryEmpDept] = useState<string | undefined>(undefined)
  const [appliedEmp, setAppliedEmp] = useState({ keyword: '', dept: undefined as string | undefined })

  const handleEmpSearch = () => setAppliedEmp({ keyword: queryEmp.trim(), dept: queryEmpDept })
  const handleEmpReset = () => {
    setQueryEmp('')
    setQueryEmpDept(undefined)
    setAppliedEmp({ keyword: '', dept: undefined })
  }

  const filteredOverrides = useMemo(() => overrides.filter((o) => {
    if (appliedEmp.keyword) {
      const kw = appliedEmp.keyword.toLowerCase()
      if (!o.empName.toLowerCase().includes(kw) && !o.username.toLowerCase().includes(kw) && !o.empId.toLowerCase().includes(kw)) return false
    }
    if (appliedEmp.dept && o.deptName !== appliedEmp.dept) return false
    return true
  }), [overrides, appliedEmp])

  /* ── 員工覆蓋編輯/新增彈窗 ── */
  const [editingOverride, setEditingOverride] = useState<EmployeeModelOverride | 'new' | null>(null)
  const [overrideForm] = Form.useForm()

  const handleOverrideEdit = (row: EmployeeModelOverride) => {
    setEditingOverride(row)
    overrideForm.setFieldsValue({ username: row.username, empName: row.empName, deptName: row.deptName, extraModelIds: row.extraModelIds, remark: row.remark })
  }

  const handleOverrideCreate = () => {
    overrideForm.resetFields()
    setEditingOverride('new')
  }

  const handleOverrideSave = () => {
    overrideForm.validateFields().then((values) => {
      if (editingOverride === 'new') {
        setOverrides((prev) => [...prev, { ...values, empId: values.username.toUpperCase() } as EmployeeModelOverride])
        message.success(t('aiQuotaAuth.overrideAdded'))
      } else if (editingOverride) {
        setOverrides((prev) => prev.map((o) => (o.username === editingOverride.username ? { ...o, ...values } : o)))
        message.success(t('aiQuotaAuth.overrideSavedAiAuth'))
      }
      setEditingOverride(null)
    })
  }

  const handleOverrideDelete = (row: EmployeeModelOverride) => {
    Modal.confirm({
      title: t('aiQuotaAuth.confirmRemoveOverride'),
      content: t('aiQuotaAuth.removeOverrideContent', { name: row.empName }),
      okText: t('aiQuotaAuth.removeBtnOverride'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: () => {
        setOverrides((prev) => prev.filter((o) => o.username !== row.username))
        message.success(t('aiQuotaAuth.overrideRemovedAiAuth'))
      },
    })
  }

  /* ── 列字段配置（員工覆蓋） ── */
  const overrideColumnMeta = [
    { key: 'employee', title: t('aiQuotaAuth.employeeCol') },
    { key: 'deptName', title: t('aiQuotaAuth.deptLabel') },
    { key: 'extraModelIds', title: t('aiQuotaAuth.extraAuthModelsCol') },
    { key: 'remark', title: t('aiQuotaAuth.remarkCol') },
    { key: 'action', title: t('common.action') },
  ]

  const { configComponent: overrideConfigComponent } = useColumnConfig('ai-auth-override', overrideColumnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  /* ── 表格列（員工覆蓋） ── */
  const overrideColumns: ColumnsType<EmployeeModelOverride> = [
    {
      title: t('aiQuotaAuth.employeeCol'), key: 'employee', width: 180,
      render: (_, row) => (
        <div>
          <div style={{ fontWeight: 600 }}>{row.empName}</div>
          <div style={{ fontSize: 11, color: '#8C8C8C' }}>{row.empId} · {row.username}</div>
        </div>
      ),
    },
    { title: t('aiQuotaAuth.deptLabel'), dataIndex: 'deptName', width: 120 },
    {
      title: t('aiQuotaAuth.extraAuthModelsCol'), dataIndex: 'extraModelIds', width: 280,
      render: (v: string[]) => (v.length ? v.map((id) => (
        <Tag key={id} style={{ marginRight: 4, color: '#E8720C', background: '#FFF7E6', border: '1px solid #FFD8A8' }}>
          {modelName[id] ?? id}
        </Tag>
      )) : <span style={{ color: '#BFBFBF' }}>--</span>),
    },
    { title: t('aiQuotaAuth.remarkCol'), dataIndex: 'remark', ellipsis: true },
    {
      title: t('common.action'), key: 'action', width: 110, align: 'center',
      render: (_, row) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" onClick={() => handleOverrideEdit(row)}>{t('common.edit')}</Button>
          <Button type="link" danger onClick={() => handleOverrideDelete(row)}>{t('aiQuotaAuth.removeBtnOverride')}</Button>
        </Space>
      ),
    },
  ]

  /* ── 部門選項（員工覆蓋搜索/表單復用） ── */
  const deptOptions = useMemo(() => {
    const names = new Set<string>()
    deptGroups.forEach((g) => g.deptNames.forEach((n) => names.add(n)))
    return [...names].map((n) => ({ value: n, label: n }))
  }, [deptGroups])

  /* ══════════════ Tab 頁簽 ══════════════ */
  const deptContent = (
        <>
          {/* 查詢區域 */}
          <div className="search-section">
            <Form layout="inline">
              <Form.Item label={t('aiQuotaAuth.strategyNameFilterLabel')}>
                <Input value={queryGroupName} placeholder={t('aiQuotaAuth.strategyNameFilterPh')} allowClear onChange={(e) => setQueryGroupName(e.target.value)} />
              </Form.Item>
              <Form.Item label={t('aiQuotaAuth.dataResidencyTag')}>
                <Select
                  value={queryResidency}
                  placeholder={t('aiQuotaAuth.allOption')}
                  allowClear
                  options={[{ value: '1', label: t('aiQuotaAuth.enabledOption') }, { value: '0', label: t('aiQuotaAuth.disabledOption') }]}
                  onChange={(v) => setQueryResidency(v)}
                />
              </Form.Item>
              <Form.Item>
                <div className="search-actions">
                  <Button type="primary" icon={<SearchOutlined />} onClick={handleDeptSearch}>{t('common.query')}</Button>
                  <Button icon={<ReloadOutlined />} onClick={handleDeptReset}>{t('common.reset')}</Button>
                </div>
              </Form.Item>
            </Form>
          </div>

          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message={t('aiQuotaAuth.deptAuthGroupAlert')}
          />

          {/* 操作區 */}
          <div className="action-section">
            <div className="action-section-left">
              <span style={{ fontSize: 13, color: '#595959' }}>
                {t('aiQuotaAuth.deptStrategySummary', { count: deptGroups.length, deptCount: totalDeptCount, empCount: totalEmployeeCount.toLocaleString() })}
              </span>
            </div>
            <div className="action-section-right">
              <Button type="primary" icon={<PlusOutlined />} onClick={handleGroupCreate}>{t('common.add')}</Button>
              {deptConfigComponent}
            </div>
          </div>

          <Table
            rowKey="id"
            size="middle"
            loading={loading}
            columns={applyDeptConfig(deptColumns)}
            dataSource={filteredGroups}
            pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total) => t('aiQuotaAuth.paginationTotal', { total }) }}
          />
        </>
  )

  const empContent = (
        <>
          {/* 查詢區域 */}
          <div className="search-section">
            <Form layout="inline">
              <Form.Item label={t('aiQuotaAuth.employeeCol')}>
                <Input value={queryEmp} placeholder={t('aiQuotaAuth.empSearchPh')} allowClear onChange={(e) => setQueryEmp(e.target.value)} />
              </Form.Item>
              <Form.Item label={t('aiQuotaAuth.deptLabel')}>
                <Select
                  value={queryEmpDept}
                  placeholder={t('aiQuotaAuth.allOption')}
                  allowClear
                  showSearch
                  options={deptOptions}
                  onChange={(v) => setQueryEmpDept(v)}
                />
              </Form.Item>
              <Form.Item>
                <div className="search-actions">
                  <Button type="primary" icon={<SearchOutlined />} onClick={handleEmpSearch}>{t('common.query')}</Button>
                  <Button icon={<ReloadOutlined />} onClick={handleEmpReset}>{t('common.reset')}</Button>
                </div>
              </Form.Item>
            </Form>
          </div>

          {/* 操作區：右側新增 + 列配置 */}
          <div className="action-section">
            <div className="action-section-right">
              <Button type="primary" icon={<PlusOutlined />} onClick={handleOverrideCreate}>{t('common.add')}</Button>
              {overrideConfigComponent}
            </div>
          </div>

          <Table
            rowKey="username"
            size="middle"
            loading={loading}
            columns={overrideColumns}
            dataSource={filteredOverrides}
            pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total) => t('aiQuotaAuth.recordsTotal', { total }) }}
          />
        </>
  )

  const tabItems = [
    { key: 'dept', label: t('aiQuotaAuth.deptModelAuthTab', { count: deptGroups.length }), children: deptContent },
    { key: 'employee', label: t('aiQuotaAuth.empExtraAuthTab', { count: overrides.length }), children: empContent },
  ]

  return (
    <div className="content-area">
      {fixedTab === 'dept' ? deptContent : fixedTab === 'employee' ? empContent : <Tabs defaultActiveKey="dept" items={tabItems} />}

      {/* 員工額外授權編輯/新增彈窗 */}
      <Modal
        title={editingOverride === 'new' ? t('aiQuotaAuth.addOverride') : t('aiQuotaAuth.editOverride')}
        open={editingOverride !== null}
        onOk={handleOverrideSave}
        onCancel={() => setEditingOverride(null)}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        destroyOnHidden
      >
        <Form form={overrideForm} layout="vertical">
          <Form.Item name="username" label={t('aiQuotaAuth.accountLabel')} rules={[{ required: true, message: t('aiQuotaAuth.accountRequired') }]}>
            <Input disabled={editingOverride !== 'new'} placeholder={t('aiQuotaAuth.accountPh')} />
          </Form.Item>
          <Form.Item name="empName" label={t('aiQuotaAuth.empNameLabel')} rules={[{ required: true, message: t('aiQuotaAuth.empNameRequired') }]}>
            <Input placeholder={t('aiQuotaAuth.empNamePh')} />
          </Form.Item>
          <Form.Item name="deptName" label={t('aiQuotaAuth.deptLabel')} rules={[{ required: true, message: t('aiQuotaAuth.deptRequired') }]}>
            <Select showSearch placeholder={t('aiQuotaAuth.deptPh')} options={deptOptions} />
          </Form.Item>
          <Form.Item name="extraModelIds" label={t('aiQuotaAuth.extraAuthModelsLabel')} rules={[{ required: true, message: t('aiQuotaAuth.extraAuthRequired') }]}>
            <Select mode="multiple" placeholder={t('aiQuotaAuth.selectModelPh')} allowClear options={models.map((m) => ({ value: String(m.id), label: m.name }))} />
          </Form.Item>
          <Form.Item name="remark" label={t('aiQuotaAuth.remarkCol')}><Input placeholder={t('aiQuotaAuth.remarkPh')} /></Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
