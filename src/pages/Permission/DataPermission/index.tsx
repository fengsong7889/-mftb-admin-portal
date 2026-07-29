import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Input, Modal, Popconfirm, Radio, Select, Space, Table, Tabs, Tag, TreeSelect, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import type { DataAuthorization, DataTargetType } from '../types'
import { DATA_TARGET_TYPE, STORAGE_KEYS, countryOptions, merchantOptions } from '../types'
import { fetchRoles } from '../../../api/role'
import type { RoleItem } from '../../../api/role'
import { DEPT_STATUS, fetchDepartments } from '../../../api/department'
import type { DepartmentItem } from '../../../api/department'
import { useAuth } from '../../../contexts/AuthContext'
import { useColumnConfig } from '../../../hooks/useColumnConfig'
import './index.css'

/** 角色状态：启用 */
const STATUS_ENABLED = 1

/** 地区 Tag 颜色 */
const COUNTRY_COLOR_MAP: Record<string, string> = {
  china: 'blue',
  hongkong: 'purple',
  macau: 'orange',
  taiwan: 'cyan',
  japan: 'red',
  south_korea: 'magenta',
  singapore: 'green',
  malaysia: 'lime',
  thailand: 'volcano',
  vietnam: 'gold',
  philippines: 'geekblue',
  indonesia: 'purple',
  usa: 'red',
  uk: 'blue',
  australia: 'orange',
}

/** 地区 key → 名称 */
const COUNTRY_NAME_MAP: Record<string, string> = Object.fromEntries(
  countryOptions.map(c => [c.key, c.label]),
)

/** 从 localStorage 加载数据授权记录 */
const loadAuthorizations = (): DataAuthorization[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.DATA_AUTHORIZATIONS)
    return raw ? (JSON.parse(raw) as DataAuthorization[]) : []
  } catch {
    return []
  }
}

/** 平铺部门列表构建 TreeSelect 树数据 */
interface DeptTreeOption {
  value: number
  title: string
  disabled?: boolean
  children?: DeptTreeOption[]
}

function buildDeptTreeData(list: DepartmentItem[]): DeptTreeOption[] {
  const nodeMap = new Map<number, DeptTreeOption>()
  list.forEach(dept => {
    nodeMap.set(dept.id, {
      value: dept.id,
      title: dept.name,
      disabled: dept.status !== DEPT_STATUS.ENABLED,
      children: [],
    })
  })
  const roots: DeptTreeOption[] = []
  list.forEach(dept => {
    const node = nodeMap.get(dept.id)!
    const parent = dept.parentId ? nodeMap.get(dept.parentId) : undefined
    if (parent) {
      parent.children!.push(node)
    } else {
      roots.push(node)
    }
  })
  return roots
}

/** 列表行（授权记录 + 授权对象信息） */
interface AuthRow extends DataAuthorization {
  targetName: string
  parentName?: string
  userCount: number
}

export default function DataPermission() {
  const { user } = useAuth()
  const [roles, setRoles] = useState<RoleItem[]>([])
  const [departments, setDepartments] = useState<DepartmentItem[]>([])
  const [loading, setLoading] = useState(false)
  const [authorizations, setAuthorizations] = useState<DataAuthorization[]>(() => loadAuthorizations())
  const [activeTab, setActiveTab] = useState<DataTargetType>(DATA_TARGET_TYPE.ROLE)

  // 新增/编辑授权弹窗
  const [modalVisible, setModalVisible] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [targetId, setTargetId] = useState<number>()
  const [country, setCountry] = useState<string>()
  const [allMerchants, setAllMerchants] = useState(true)
  const [selectedMerchants, setSelectedMerchants] = useState<string[]>([])
  const [merchantSearchText, setMerchantSearchText] = useState('')

  // 授权详情弹窗
  const [detailRecord, setDetailRecord] = useState<AuthRow | null>(null)

  /** 加载角色与部门列表 */
  const fetchList = useCallback(async () => {
    setLoading(true)
    try {
      const [roleList, deptList] = await Promise.all([fetchRoles(), fetchDepartments()])
      setRoles(roleList)
      setDepartments(deptList)
    } catch {
      // 错误提示由请求层统一处理
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchList()
  }, [fetchList])

  /** 持久化授权记录 */
  const saveAuthorizations = (next: DataAuthorization[]) => {
    setAuthorizations(next)
    localStorage.setItem(STORAGE_KEYS.DATA_AUTHORIZATIONS, JSON.stringify(next))
  }

  /** 角色授权列表 */
  const roleRows = useMemo<AuthRow[]>(
    () => authorizations
      .filter(a => a.targetType === DATA_TARGET_TYPE.ROLE)
      .map(a => {
        const role = roles.find(r => r.id === a.targetId)
        return {
          ...a,
          targetName: role?.name ?? '（角色已刪除）',
          userCount: role?.userCount ?? 0,
        }
      }),
    [authorizations, roles],
  )

  /** 部门授权列表 */
  const deptRows = useMemo<AuthRow[]>(
    () => authorizations
      .filter(a => a.targetType === DATA_TARGET_TYPE.DEPARTMENT)
      .map(a => {
        const dept = departments.find(d => d.id === a.targetId)
        return {
          ...a,
          targetName: dept?.name ?? '（部門已刪除）',
          parentName: dept?.parentName,
          userCount: dept?.userCount ?? 0,
        }
      }),
    [authorizations, departments],
  )

  /** 新增授权时可选的角色（启用中） */
  const availableRoles = useMemo(
    () => roles.filter(r => r.status === STATUS_ENABLED),
    [roles],
  )

  /** 弹窗中当前地区的商家列表（按搜索过滤） */
  const merchantList = useMemo(() => {
    if (!country) return []
    return merchantOptions.filter(m =>
      m.country === country &&
      (m.name.includes(merchantSearchText) || m.address.includes(merchantSearchText)),
    )
  }, [country, merchantSearchText])

  /** 详情弹窗：授权覆盖的商家列表 */
  const detailMerchants = useMemo(() => {
    if (!detailRecord) return []
    if (detailRecord.allMerchants) {
      return merchantOptions.filter(m => m.country === detailRecord.country)
    }
    return merchantOptions.filter(m => detailRecord.merchants.includes(m.id))
  }, [detailRecord])

  /** 打开新增授权弹窗 */
  const handleCreate = () => {
    setEditingId(null)
    setTargetId(undefined)
    setCountry(undefined)
    setAllMerchants(true)
    setSelectedMerchants([])
    setMerchantSearchText('')
    setModalVisible(true)
  }

  /** 打开编辑授权弹窗 */
  const handleEdit = (record: AuthRow) => {
    setEditingId(record.id)
    setTargetId(record.targetId)
    setCountry(record.country)
    setAllMerchants(record.allMerchants)
    setSelectedMerchants(record.merchants)
    setMerchantSearchText('')
    setModalVisible(true)
  }

  /** 切换授权地区（清空已选商家） */
  const handleCountryChange = (value: string) => {
    setCountry(value)
    setSelectedMerchants([])
    setMerchantSearchText('')
  }

  /** 保存授权（形成/更新一条授权数据） */
  const handleSave = () => {
    if (targetId == null) {
      message.warning(activeTab === DATA_TARGET_TYPE.ROLE ? '請選擇要授權的角色' : '請選擇要授權的部門')
      return
    }
    if (!country) {
      message.warning('請選擇授權地區')
      return
    }
    if (!allMerchants && selectedMerchants.length === 0) {
      message.warning('請至少選擇一個商家')
      return
    }
    const duplicated = authorizations.some(a =>
      a.id !== editingId &&
      a.targetType === activeTab &&
      a.targetId === targetId &&
      a.country === country,
    )
    if (duplicated) {
      message.warning('該對象在此地區已存在授權，請直接編輯原授權數據')
      return
    }
    // 最后更新人：当前登录人（优先姓名）
    const operator = user?.name || user?.username || '-'
    const updatedAt = new Date().toISOString()
    if (editingId) {
      const next = authorizations.map(a =>
        a.id === editingId
          ? { ...a, targetId, country, allMerchants, merchants: allMerchants ? [] : selectedMerchants, updatedBy: operator, updatedAt }
          : a,
      )
      saveAuthorizations(next)
      message.success('授權已更新')
    } else {
      const record: DataAuthorization = {
        id: Date.now().toString(),
        targetType: activeTab,
        targetId,
        country,
        allMerchants,
        merchants: allMerchants ? [] : selectedMerchants,
        createdAt: updatedAt,
        updatedBy: operator,
        updatedAt,
      }
      saveAuthorizations([...authorizations, record])
      message.success('授權已創建')
    }
    setModalVisible(false)
  }

  /** 删除授权 */
  const handleDelete = (record: AuthRow) => {
    saveAuthorizations(authorizations.filter(a => a.id !== record.id))
    message.success('授權已刪除')
  }

  /** 授权地区列 */
  const renderCountryTag = (value: string) => (
    <Tag color={COUNTRY_COLOR_MAP[value] || 'default'}>{COUNTRY_NAME_MAP[value] ?? value}</Tag>
  )

  /** 操作列（角色/部门通用） */
  const renderActions = (record: AuthRow) => (
    <Space size={4}>
      <Button type="link" size="small" onClick={() => setDetailRecord(record)}>
        詳情
      </Button>
      <Button type="link" size="small" onClick={() => handleEdit(record)}>
        編輯
      </Button>
      <Popconfirm
        title="確認刪除"
        description={`確定要刪除「${record.targetName}」在「${COUNTRY_NAME_MAP[record.country] ?? record.country}」的數據授權嗎？`}
        onConfirm={() => handleDelete(record)}
        okText="確認"
        cancelText="取消"
      >
        <Button type="link" size="small" danger>
          刪除
        </Button>
      </Popconfirm>
    </Space>
  )

  const roleColumns: TableColumnsType<AuthRow> = [
    { title: '角色名稱', dataIndex: 'targetName', key: 'targetName', width: 180 },
    { title: '授權地區', dataIndex: 'country', key: 'country', width: 120, render: renderCountryTag },
    { title: '員工人數', dataIndex: 'userCount', key: 'userCount', width: 110, render: (v: number) => `${v} 人` },
    { title: '最後更新人', dataIndex: 'updatedBy', key: 'updatedBy', width: 120, render: (v: string) => v || '-' },
    {
      title: '最後更新時間',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 170,
      render: (date: string) => (date ? new Date(date).toLocaleString('zh-TW', { hour12: false }) : '-'),
    },
    { title: '操作', key: 'action', width: 180, render: (_, record) => renderActions(record) },
  ]

  const deptColumns: TableColumnsType<AuthRow> = [
    { title: '部門名稱', dataIndex: 'targetName', key: 'targetName', width: 180 },
    { title: '上級部門', dataIndex: 'parentName', key: 'parentName', width: 150, render: (v: string) => v || '-' },
    { title: '授權地區', dataIndex: 'country', key: 'country', width: 120, render: renderCountryTag },
    { title: '員工人數', dataIndex: 'userCount', key: 'userCount', width: 110, render: (v: number) => `${v} 人` },
    { title: '最後更新人', dataIndex: 'updatedBy', key: 'updatedBy', width: 120, render: (v: string) => v || '-' },
    {
      title: '最後更新時間',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 170,
      render: (date: string) => (date ? new Date(date).toLocaleString('zh-TW', { hour12: false }) : '-'),
    },
    { title: '操作', key: 'action', width: 180, render: (_, record) => renderActions(record) },
  ]

  const merchantTableColumns: TableColumnsType<typeof merchantOptions[number]> = [
    { title: '商家ID', dataIndex: 'id', key: 'id', width: 100 },
    { title: '商家名稱', dataIndex: 'name', key: 'name', width: 200 },
    { title: '註冊地址', dataIndex: 'address', key: 'address' },
  ]

  /** 列字段配置 */
  const roleColumnMeta = roleColumns.map(col => ({ key: col.key as string, title: col.title as string }))
  const { configComponent: roleConfigComponent, applyConfig: roleApplyConfig } = useColumnConfig('data-permission-role', roleColumnMeta, [
    { key: 'action', visible: true, locked: 'tail' },
  ])
  const deptColumnMeta = deptColumns.map(col => ({ key: col.key as string, title: col.title as string }))
  const { configComponent: deptConfigComponent, applyConfig: deptApplyConfig } = useColumnConfig('data-permission-dept', deptColumnMeta, [
    { key: 'action', visible: true, locked: 'tail' },
  ])

  /** 授权列表（角色/部门 Tab 内容） */
  const renderTabContent = (type: DataTargetType) => (
    <div>
      <div className="action-section">
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
            新增
          </Button>
          {type === DATA_TARGET_TYPE.ROLE ? roleConfigComponent : deptConfigComponent}
        </div>
      </div>
      <Table
        columns={type === DATA_TARGET_TYPE.ROLE ? roleApplyConfig(roleColumns) : deptApplyConfig(deptColumns)}
        dataSource={type === DATA_TARGET_TYPE.ROLE ? roleRows : deptRows}
        rowKey="id"
        loading={loading}
        pagination={{
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (t) => `共 ${t} 條數據`,
        }}
        locale={{
          emptyText: type === DATA_TARGET_TYPE.ROLE
            ? '暫無授權數據，點擊「新增」為角色授權地區商家數據'
            : '暫無授權數據，點擊「新增」為部門授權地區商家數據',
        }}
      />
    </div>
  )

  /** 弹窗中编辑对象的名称（编辑模式展示） */
  const editingName = editingId != null
    ? (activeTab === DATA_TARGET_TYPE.ROLE ? roleRows : deptRows).find(r => r.id === editingId)?.targetName
    : undefined

  return (
    <div className="content-area">
      <Tabs
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as DataTargetType)}
        items={[
          { key: DATA_TARGET_TYPE.ROLE, label: '角色授權', children: renderTabContent(DATA_TARGET_TYPE.ROLE) },
          { key: DATA_TARGET_TYPE.DEPARTMENT, label: '部門授權', children: renderTabContent(DATA_TARGET_TYPE.DEPARTMENT) },
        ]}
      />

      {/* 新增/编辑授权弹窗 */}
      <Modal
        title={
          editingId
            ? `編輯數據授權 - ${editingName ?? ''}`
            : (activeTab === DATA_TARGET_TYPE.ROLE ? '新增角色數據授權' : '新增部門數據授權')
        }
        open={modalVisible}
        onOk={handleSave}
        onCancel={() => setModalVisible(false)}
        okText="保存"
        cancelText="取消"
        width={760}
        destroyOnClose
      >
        {/* 授权对象选择（编辑模式锁定） */}
        <div className="data-auth-target-bar">
          <span className="data-auth-label">
            {activeTab === DATA_TARGET_TYPE.ROLE ? '授權角色：' : '授權部門：'}
          </span>
          {activeTab === DATA_TARGET_TYPE.ROLE ? (
            <Select
              className="data-auth-target-select"
              placeholder="請選擇角色"
              showSearch
              optionFilterProp="label"
              disabled={editingId != null}
              value={targetId}
              onChange={(id) => setTargetId(id)}
              options={(editingId != null ? roles : availableRoles).map(r => ({
                value: r.id,
                label: r.name,
              }))}
            />
          ) : (
            <TreeSelect
              className="data-auth-target-select"
              placeholder="請選擇部門"
              showSearch
              treeDefaultExpandAll
              treeNodeFilterProp="title"
              disabled={editingId != null}
              value={targetId}
              onChange={(id) => setTargetId(id)}
              treeData={buildDeptTreeData(departments)}
            />
          )}
          <Tag color={activeTab === DATA_TARGET_TYPE.ROLE ? 'blue' : 'purple'}>
            {activeTab === DATA_TARGET_TYPE.ROLE
              ? '加入該角色的員工可查看所授權地區的商家數據'
              : '進入該部門的人員可查看所授權地區的商家數據'}
          </Tag>
        </div>

        {/* 授权地区 + 商家范围 */}
        <div className="data-auth-field">
          <span className="data-auth-label">授權地區：</span>
          <Select
            className="data-auth-target-select"
            placeholder="請選擇地區"
            showSearch
            optionFilterProp="label"
            value={country}
            onChange={handleCountryChange}
            options={countryOptions.map(c => ({ value: c.key, label: c.label }))}
          />
        </div>

        <div className="data-auth-field">
          <span className="data-auth-label">商家範圍：</span>
          <Radio.Group
            value={allMerchants}
            onChange={(e) => setAllMerchants(e.target.value)}
            options={[
              { value: true, label: '該地區全部商家（含後續新入駐商家）' },
              { value: false, label: '指定商家' },
            ]}
          />
        </div>

        {/* 指定商家：搜索 + 勾选 */}
        {!allMerchants && (
          <div className="data-auth-merchant-panel">
            <Input.Search
              placeholder="搜索商家名稱、註冊地址"
              value={merchantSearchText}
              onChange={(e) => setMerchantSearchText(e.target.value)}
              allowClear
              className="data-auth-merchant-search"
            />
            <Table
              columns={merchantTableColumns}
              dataSource={merchantList}
              rowKey="id"
              pagination={false}
              size="small"
              rowSelection={{
                selectedRowKeys: selectedMerchants,
                onChange: (keys) => setSelectedMerchants(keys as string[]),
              }}
              scroll={{ y: 260 }}
              locale={{ emptyText: country ? '該地區暫無商家' : '請先選擇授權地區' }}
            />
            <div className="data-auth-tip">
              已選 {selectedMerchants.length} 個商家
            </div>
          </div>
        )}
      </Modal>

      {/* 授权详情弹窗 */}
      <Modal
        title={`授權詳情 - ${detailRecord?.targetName ?? ''}`}
        open={detailRecord != null}
        onCancel={() => setDetailRecord(null)}
        footer={null}
        width={680}
      >
        {detailRecord && (
          <>
            <div className="data-auth-field">
              <span className="data-auth-label">授權地區：</span>
              {renderCountryTag(detailRecord.country)}
            </div>
            <div className="data-auth-field">
              <span className="data-auth-label">商家範圍：</span>
              {detailRecord.allMerchants ? (
                <Tag color="green">該地區全部商家（{detailMerchants.length} 家，含後續新入駐商家）</Tag>
              ) : (
                <Tag color="purple">指定商家（{detailMerchants.length} 家）</Tag>
              )}
            </div>
            <Table
              columns={merchantTableColumns}
              dataSource={detailMerchants}
              rowKey="id"
              size="small"
              pagination={false}
              scroll={{ y: 320 }}
              locale={{ emptyText: '該地區暫無商家' }}
            />
          </>
        )}
      </Modal>
    </div>
  )
}
