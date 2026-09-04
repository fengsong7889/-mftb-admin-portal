import { useEffect, useMemo, useState } from 'react'
import { Button, Form, Input, Modal, Popover, Select, Switch, Table, Tabs, Tag, message, Alert } from 'antd'
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
import { CAPABILITY_SHORT_FIELDS } from './empAuth/modelAuthCapability'

export default function AiAuth({ fixedTab }: { fixedTab?: 'dept' | 'employee' } = {}) {
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
    navigate('/ai-dept-auth-edit')
  }

  const handleGroupEdit = (row: DeptAuthGroupItem) => {
    navigate(`/ai-dept-auth-edit?id=${row.id}`)
  }

  const handleGroupDetail = (row: DeptAuthGroupItem) => {
    navigate(`/ai-dept-auth-detail?id=${row.id}`)
  }

  const handleGroupDelete = (row: DeptAuthGroupItem) => {
    Modal.confirm({
      title: '確認刪除該策略？',
      content: `刪除後「${row.name}」關聯的 ${row.deptIds.length} 個部門將失去模型授權配置`,
      okText: '刪除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await deleteDeptAuthGroup(row.id)
          message.success(`策略「${row.name}」已刪除`)
          loadDeptGroups()
        } catch {
          message.error('刪除失敗')
        }
      },
    })
  }

  /* ── 策略啟停（二次確認） ── */
  const handleGroupToggle = (row: DeptAuthGroupItem) => {
    const toDisable = row.status === 1
    const actionText = toDisable ? '停用' : '啟用'
    Modal.confirm({
      title: `確認${actionText}該策略？`,
      content: `${actionText}後「${row.name}」關聯的 ${row.deptIds.length} 個部門${toDisable ? '將失去模型授權配置' : '將恢復模型授權'}`,
      okText: '確認',
      cancelText: '取消',
      onOk: async () => {
        try {
          await toggleDeptAuthGroupStatus(row.id, toDisable ? 0 : 1)
          message.success(`策略「${row.name}」已${actionText}`)
          loadDeptGroups()
        } catch {
          message.error(`${actionText}失敗`)
        }
      },
    })
  }

  /* ── 列字段配置（部門權控） ── */
  const deptColumnMeta = [
    { key: 'name', title: '策略名稱' },
    { key: 'deptNames', title: '適用部門' },
    { key: 'totalEmployeeCount', title: '覆蓋人數' },
    { key: 'modelIds', title: '授權模型' },
    { key: 'capabilities', title: '授權能力' },
    { key: 'dataResidency', title: '數據不出域' },
    { key: 'status', title: '狀態' },
    { key: 'updatedBy', title: '最後更新人' },
    { key: 'updatedAt', title: '最後更新時間' },
    { key: 'action', title: '操作' },
  ]

  const { configComponent: deptConfigComponent, applyConfig: applyDeptConfig } = useColumnConfig('ai-dept-model-auth', deptColumnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  /* ── 表格列（部門權控） ── */
  const deptColumns: ColumnsType<DeptAuthGroupItem> = [
    { key: 'name', title: '策略名稱', dataIndex: 'name', width: 170 },
    {
      key: 'deptNames', title: '適用部門', dataIndex: 'deptNames', width: 260,
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
              title={`全部部門（${v.length}）`}
              trigger="click"
            >
              <Tag style={{ marginRight: 4, marginBottom: 2, cursor: 'pointer', color: '#E8720C', borderColor: '#E8720C' }}>+{v.length - 3}</Tag>
            </Popover>
          )}
        </span>
      ),
    },
    { key: 'totalEmployeeCount', title: '覆蓋人數', dataIndex: 'totalEmployeeCount', width: 100, align: 'right', render: (v: number) => `${v.toLocaleString()} 人` },
    {
      key: 'modelIds', title: '授權模型', dataIndex: 'modelIds', width: 200,
      render: (ids: string[]) => {
        if (!ids?.length) return <Tag color="error">未授權</Tag>
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
                title={`全部模型（${ids.length}）`}
              >
                <Tag style={{ color: '#E8720C', borderColor: '#E8720C', cursor: 'pointer' }}>+{ids.length - 3}</Tag>
              </Popover>
            )}
          </span>
        )
      },
    },
    {
      key: 'capabilities', title: '授權能力', width: 220,
      render: (_: unknown, row: DeptAuthGroupItem) => {
        const configs = row.modelConfigs
        if (!configs?.length) return <span style={{ color: '#BFBFBF', fontSize: 12 }}>未配置</span>
        // 去重：收集所有模型中已啟用的能力
        const enabledCaps = CAPABILITY_SHORT_FIELDS.filter(({ key }) =>
          configs.some((c) => c[key] === 1),
        )
        if (!enabledCaps.length) return <span style={{ color: '#BFBFBF', fontSize: 12 }}>未開放任何能力</span>
        return (
          <Popover
            trigger="click"
            title="各模型授權能力明細"
            content={
              <div style={{ maxWidth: 380 }}>
                {configs.map((c) => {
                  const caps = CAPABILITY_SHORT_FIELDS.filter(({ key }) => c[key] === 1)
                  return (
                    <div key={c.modelId} style={{ marginBottom: 10 }}>
                      <div style={{ fontWeight: 500, marginBottom: 4 }}>{modelName[c.modelId] ?? `#${c.modelId}`}</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {caps.length > 0
                          ? caps.map(({ key, label, color }) => (
                              <Tag key={key} color={color} style={{ fontSize: 11 }}>{label}</Tag>
                            ))
                          : <span style={{ fontSize: 11, color: '#BFBFBF' }}>未開放任何能力</span>
                        }
                      </div>
                    </div>
                  )
                })}
              </div>
            }
          >
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, cursor: 'pointer' }}>
              {enabledCaps.map(({ key, label, color }) => (
                <Tag key={key} color={color} style={{ fontSize: 11 }}>{label}</Tag>
              ))}
            </div>
          </Popover>
        )
      },
    },
    {
      key: 'dataResidency', title: '數據不出域', dataIndex: 'dataResidency', width: 100, align: 'center',
      render: (v: boolean) => (v ? <Tag color="purple">已啟用</Tag> : <Tag color="default">未啟用</Tag>),
    },
    {
      key: 'status', title: '狀態', dataIndex: 'status', width: 80, align: 'center',
      render: (_: unknown, row: DeptAuthGroupItem) => (
        <Switch
          checked={row.status === 1}
          checkedChildren="啟用"
          unCheckedChildren="停用"
          onChange={() => handleGroupToggle(row)}
        />
      ),
    },
    {
      key: 'updatedBy', title: '最後更新人', dataIndex: 'updatedBy', width: 100,
      render: (v: string) => <span>{v}</span>,
    },
    { key: 'updatedAt', title: '最後更新時間', dataIndex: 'updatedAt', width: 160, render: (v: string) => <span>{v}</span> },
    {
      key: 'action', title: '操作', width: 180, align: 'center',
      render: (_, row) => (
        <>
          <Button type="link" onClick={() => handleGroupDetail(row)}>詳情</Button>
          <Button type="link" onClick={() => handleGroupEdit(row)}>編輯</Button>
          <Button type="link" danger onClick={() => handleGroupDelete(row)}>刪除</Button>
        </>
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
        message.success('員工額外授權已新增')
      } else if (editingOverride) {
        setOverrides((prev) => prev.map((o) => (o.username === editingOverride.username ? { ...o, ...values } : o)))
        message.success('員工額外授權已保存（在部門授權基礎上追加）')
      }
      setEditingOverride(null)
    })
  }

  const handleOverrideDelete = (row: EmployeeModelOverride) => {
    Modal.confirm({
      title: '確認移除該員工的額外授權？',
      content: `移除後「${row.empName}」將僅保留其所屬部門的基礎模型授權`,
      okText: '移除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => {
        setOverrides((prev) => prev.filter((o) => o.username !== row.username))
        message.success('已移除該員工的額外授權')
      },
    })
  }

  /* ── 列字段配置（員工覆蓋） ── */
  const overrideColumnMeta = [
    { key: 'employee', title: '員工' },
    { key: 'deptName', title: '部門' },
    { key: 'extraModelIds', title: '額外授權模型' },
    { key: 'remark', title: '備注' },
    { key: 'action', title: '操作' },
  ]

  const { configComponent: overrideConfigComponent } = useColumnConfig('ai-auth-override', overrideColumnMeta, [
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  /* ── 表格列（員工覆蓋） ── */
  const overrideColumns: ColumnsType<EmployeeModelOverride> = [
    {
      title: '員工', key: 'employee', width: 180,
      render: (_, row) => (
        <div>
          <div style={{ fontWeight: 600 }}>{row.empName}</div>
          <div style={{ fontSize: 11, color: '#8C8C8C' }}>{row.empId} · {row.username}</div>
        </div>
      ),
    },
    { title: '部門', dataIndex: 'deptName', width: 120 },
    {
      title: '額外授權模型', dataIndex: 'extraModelIds', width: 280,
      render: (v: string[]) => (v.length ? v.map((id) => (
        <Tag key={id} style={{ marginRight: 4, color: '#E8720C', background: '#FFF7E6', border: '1px solid #FFD8A8' }}>
          {modelName[id] ?? id}
        </Tag>
      )) : <span style={{ color: '#BFBFBF' }}>--</span>),
    },
    { title: '備注', dataIndex: 'remark', ellipsis: true },
    {
      title: '操作', key: 'action', width: 110, align: 'center',
      render: (_, row) => (
        <>
          <Button type="link" onClick={() => handleOverrideEdit(row)}>編輯</Button>
          <Button type="link" danger onClick={() => handleOverrideDelete(row)}>移除</Button>
        </>
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
              <Form.Item label="策略名稱">
                <Input value={queryGroupName} placeholder="請輸入策略名稱" allowClear onChange={(e) => setQueryGroupName(e.target.value)} />
              </Form.Item>
              <Form.Item label="數據不出域">
                <Select
                  value={queryResidency}
                  placeholder="全部"
                  allowClear
                  options={[{ value: '1', label: '已啟用' }, { value: '0', label: '未啟用' }]}
                  onChange={(v) => setQueryResidency(v)}
                />
              </Form.Item>
              <Form.Item>
                <div className="search-actions">
                  <Button type="primary" icon={<SearchOutlined />} onClick={handleDeptSearch}>查詢</Button>
                  <Button icon={<ReloadOutlined />} onClick={handleDeptReset}>重置</Button>
                </div>
              </Form.Item>
            </Form>
          </div>

          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message="每條策略可關聯多個部門，共享同一組模型授權配置。部門員工的模型選擇器僅展示其所屬策略中已授權的模型。"
          />

          {/* 操作區 */}
          <div className="action-section">
            <div className="action-section-left">
              <span style={{ fontSize: 13, color: '#595959' }}>
                共 {deptGroups.length} 條策略，覆蓋 {totalDeptCount} 個部門 {totalEmployeeCount.toLocaleString()} 人
              </span>
            </div>
            <div className="action-section-right">
              <Button type="primary" icon={<PlusOutlined />} onClick={handleGroupCreate}>新增</Button>
              {deptConfigComponent}
            </div>
          </div>

          <Table
            rowKey="id"
            size="middle"
            loading={loading}
            columns={applyDeptConfig(deptColumns)}
            dataSource={filteredGroups}
            pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total) => `共 ${total} 條策略` }}
          />
        </>
  )

  const empContent = (
        <>
          {/* 查詢區域 */}
          <div className="search-section">
            <Form layout="inline">
              <Form.Item label="員工">
                <Input value={queryEmp} placeholder="姓名 / 賬號 / 工號" allowClear onChange={(e) => setQueryEmp(e.target.value)} />
              </Form.Item>
              <Form.Item label="部門">
                <Select
                  value={queryEmpDept}
                  placeholder="全部"
                  allowClear
                  showSearch
                  options={deptOptions}
                  onChange={(v) => setQueryEmpDept(v)}
                />
              </Form.Item>
              <Form.Item>
                <div className="search-actions">
                  <Button type="primary" icon={<SearchOutlined />} onClick={handleEmpSearch}>查詢</Button>
                  <Button icon={<ReloadOutlined />} onClick={handleEmpReset}>重置</Button>
                </div>
              </Form.Item>
            </Form>
          </div>

          {/* 操作區：右側新增 + 列配置 */}
          <div className="action-section">
            <div className="action-section-right">
              <Button type="primary" icon={<PlusOutlined />} onClick={handleOverrideCreate}>新增</Button>
              {overrideConfigComponent}
            </div>
          </div>

          <Table
            rowKey="username"
            size="middle"
            loading={loading}
            columns={overrideColumns}
            dataSource={filteredOverrides}
            pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total) => `共 ${total} 條記錄` }}
          />
        </>
  )

  const tabItems = [
    { key: 'dept', label: `部門模型權控（${deptGroups.length}）`, children: deptContent },
    { key: 'employee', label: `員工額外授權（${overrides.length}）`, children: empContent },
  ]

  return (
    <div className="content-area">
      {fixedTab === 'dept' ? deptContent : fixedTab === 'employee' ? empContent : <Tabs defaultActiveKey="dept" items={tabItems} />}

      {/* 員工額外授權編輯/新增彈窗 */}
      <Modal
        title={editingOverride === 'new' ? '新增員工額外授權' : '編輯員工額外授權'}
        open={editingOverride !== null}
        onOk={handleOverrideSave}
        onCancel={() => setEditingOverride(null)}
        okText="保存"
        cancelText="取消"
        destroyOnHidden
      >
        <Form form={overrideForm} layout="vertical">
          <Form.Item name="username" label="賬號" rules={[{ required: true, message: '請輸入員工賬號' }]}>
            <Input disabled={editingOverride !== 'new'} placeholder="請輸入員工賬號" />
          </Form.Item>
          <Form.Item name="empName" label="姓名" rules={[{ required: true, message: '請輸入員工姓名' }]}>
            <Input placeholder="請輸入員工姓名" />
          </Form.Item>
          <Form.Item name="deptName" label="部門" rules={[{ required: true, message: '請選擇部門' }]}>
            <Select showSearch placeholder="請選擇部門" options={deptOptions} />
          </Form.Item>
          <Form.Item name="extraModelIds" label="額外授權模型（在部門授權基礎上追加）" rules={[{ required: true, message: '請選擇額外授權模型' }]}>
            <Select mode="multiple" placeholder="請選擇模型" allowClear options={models.map((m) => ({ value: String(m.id), label: m.name }))} />
          </Form.Item>
          <Form.Item name="remark" label="備注"><Input placeholder="請輸入備注" /></Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
