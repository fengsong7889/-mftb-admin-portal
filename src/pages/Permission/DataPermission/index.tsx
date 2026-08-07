import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Input, Modal, Popconfirm, Radio, Select, Space, Table, Tabs, Tag, TreeSelect, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
  // 功能权限校验（菜单 key: data-permission）
  const { user, hasPermission } = useAuth()
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
          targetName: role?.name ?? t('dataPermission.roleDeleted'),
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
          targetName: dept?.name ?? t('dataPermission.deptDeleted'),
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
      message.warning(activeTab === DATA_TARGET_TYPE.ROLE ? t('dataPermission.selectRole') : t('dataPermission.selectDept'))
      return
    }
    if (!country) {
      message.warning(t('dataPermission.selectCountry'))
      return
    }
    if (!allMerchants && selectedMerchants.length === 0) {
      message.warning(t('dataPermission.selectMerchant'))
      return
    }
    const duplicated = authorizations.some(a =>
      a.id !== editingId &&
      a.targetType === activeTab &&
      a.targetId === targetId &&
      a.country === country,
    )
    if (duplicated) {
      message.warning(t('dataPermission.duplicateAuth'))
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
      message.success(t('dataPermission.authUpdated'))
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
      message.success(t('dataPermission.authCreated'))
    }
    setModalVisible(false)
  }

  /** 删除授权 */
  const handleDelete = (record: AuthRow) => {
    saveAuthorizations(authorizations.filter(a => a.id !== record.id))
    message.success(t('common.deleteSuccess'))
  }

  /** 授权地区列 */
  const renderCountryTag = (value: string) => (
    <Tag color={COUNTRY_COLOR_MAP[value] || 'default'}>{COUNTRY_NAME_MAP[value] ?? value}</Tag>
  )

  /** 操作列（角色/部门通用） */
  const renderActions = (record: AuthRow) => (
    <Space size={4}>
      <Button type="link" size="small" onClick={() => setDetailRecord(record)}>
        {t('common.detail')}
      </Button>
      {hasPermission('data-permission:edit') && (
        <Button type="link" size="small" onClick={() => handleEdit(record)}>
          {t('common.edit')}
        </Button>
      )}
      {hasPermission('data-permission:delete') && (
        <Popconfirm
          title={t('common.confirmDelete')}
          description={t('dataPermission.confirmDeleteContent', { name: record.targetName, country: COUNTRY_NAME_MAP[record.country] ?? record.country })}
          onConfirm={() => handleDelete(record)}
          okText={t('common.confirm')}
          cancelText={t('common.cancel')}
        >
          <Button type="link" size="small" danger>
            {t('common.delete')}
          </Button>
        </Popconfirm>
      )}
    </Space>
  )

  const roleColumns: TableColumnsType<AuthRow> = [
    { title: t('dataPermission.colRoleName'), dataIndex: 'targetName', key: 'targetName', width: 180 },
    { title: t('dataPermission.colCountry'), dataIndex: 'country', key: 'country', width: 120, render: renderCountryTag },
    { title: t('dataPermission.colUserCount'), dataIndex: 'userCount', key: 'userCount', width: 110, render: (v: number) => t('dataPermission.personCount', { count: v }) },
    { title: t('dataPermission.colUpdatedBy'), dataIndex: 'updatedBy', key: 'updatedBy', width: 120, render: (v: string) => v || '-' },
    {
      title: t('dataPermission.colUpdatedAt'),
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 170,
      render: (date: string) => (date ? new Date(date).toLocaleString('zh-TW', { hour12: false }) : '-'),
    },
    { title: t('common.colAction'), key: 'action', width: 180, render: (_, record) => renderActions(record) },
  ]

  const deptColumns: TableColumnsType<AuthRow> = [
    { title: t('dataPermission.colDeptName'), dataIndex: 'targetName', key: 'targetName', width: 180 },
    { title: t('organization.colParentDept'), dataIndex: 'parentName', key: 'parentName', width: 150, render: (v: string) => v || '-' },
    { title: t('dataPermission.colCountry'), dataIndex: 'country', key: 'country', width: 120, render: renderCountryTag },
    { title: t('dataPermission.colUserCount'), dataIndex: 'userCount', key: 'userCount', width: 110, render: (v: number) => t('dataPermission.personCount', { count: v }) },
    { title: t('dataPermission.colUpdatedBy'), dataIndex: 'updatedBy', key: 'updatedBy', width: 120, render: (v: string) => v || '-' },
    {
      title: t('dataPermission.colUpdatedAt'),
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 170,
      render: (date: string) => (date ? new Date(date).toLocaleString('zh-TW', { hour12: false }) : '-'),
    },
    { title: t('common.colAction'), key: 'action', width: 180, render: (_, record) => renderActions(record) },
  ]

  const merchantTableColumns: TableColumnsType<typeof merchantOptions[number]> = [
    { title: t('dataPermission.merchantId'), dataIndex: 'id', key: 'id', width: 100 },
    { title: t('dataPermission.merchantName'), dataIndex: 'name', key: 'name', width: 200 },
    { title: t('dataPermission.merchantAddress'), dataIndex: 'address', key: 'address' },
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
          {hasPermission('data-permission:create') && (
            <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
              {t('common.add')}
            </Button>
          )}
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
          showTotal: (total) => t('common.total', { count: total }),
        }}
        locale={{
          emptyText: type === DATA_TARGET_TYPE.ROLE
            ? t('dataPermission.emptyRole')
            : t('dataPermission.emptyDept'),
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
          { key: DATA_TARGET_TYPE.ROLE, label: t('dataPermission.tabRoleAuth'), children: renderTabContent(DATA_TARGET_TYPE.ROLE) },
          { key: DATA_TARGET_TYPE.DEPARTMENT, label: t('dataPermission.tabDeptAuth'), children: renderTabContent(DATA_TARGET_TYPE.DEPARTMENT) },
        ]}
      />

      {/* 新增/编辑授权弹窗 */}
      <Modal
        title={
          editingId
            ? t('dataPermission.editTitle', { name: editingName ?? '' })
            : (activeTab === DATA_TARGET_TYPE.ROLE ? t('dataPermission.addRoleTitle') : t('dataPermission.addDeptTitle'))
        }
        open={modalVisible}
        onOk={handleSave}
        onCancel={() => setModalVisible(false)}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        width={760}
        destroyOnClose
      >
        {/* 授权对象选择（编辑模式锁定） */}
        <div className="data-auth-target-bar">
          <span className="data-auth-label">
            {activeTab === DATA_TARGET_TYPE.ROLE ? t('dataPermission.targetRole') : t('dataPermission.targetDept')}
          </span>
          {activeTab === DATA_TARGET_TYPE.ROLE ? (
            <Select
              className="data-auth-target-select"
              placeholder={activeTab === DATA_TARGET_TYPE.ROLE ? t('dataPermission.selectRolePlaceholder') : t('dataPermission.selectDeptPlaceholder')}
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
              placeholder={t('dataPermission.selectDeptPlaceholder')}
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
              ? t('dataPermission.roleTip')
              : t('dataPermission.deptTip')}
          </Tag>
        </div>

        {/* 授权地区 + 商家范围 */}
        <div className="data-auth-field">
          <span className="data-auth-label">{t('dataPermission.countryLabel')}</span>
          <Select
            className="data-auth-target-select"
            placeholder={t('dataPermission.countryPlaceholder')}
            showSearch
            optionFilterProp="label"
            value={country}
            onChange={handleCountryChange}
            options={countryOptions.map(c => ({ value: c.key, label: c.label }))}
          />
        </div>

        <div className="data-auth-field">
          <span className="data-auth-label">{t('dataPermission.merchantScope')}</span>
          <Radio.Group
            value={allMerchants}
            onChange={(e) => setAllMerchants(e.target.value)}
            options={[
              { value: true, label: t('dataPermission.allMerchants') },
              { value: false, label: t('dataPermission.specifiedMerchants') },
            ]}
          />
        </div>

        {/* 指定商家：搜索 + 勾选 */}
        {!allMerchants && (
          <div className="data-auth-merchant-panel">
            <Input.Search
              placeholder={t('dataPermission.merchantSearchPlaceholder')}
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
              locale={{ emptyText: country ? t('dataPermission.noMerchantInRegion') : t('dataPermission.selectCountryFirst') }}
            />
            <div className="data-auth-tip">
              {t('dataPermission.selectedMerchants', { count: selectedMerchants.length })}
            </div>
          </div>
        )}
      </Modal>

      {/* 授权详情弹窗 */}
      <Modal
        title={t('dataPermission.detailTitle', { name: detailRecord?.targetName ?? '' })}
        open={detailRecord != null}
        onCancel={() => setDetailRecord(null)}
        footer={null}
        width={680}
      >
        {detailRecord && (
          <>
            <div className="data-auth-field">
              <span className="data-auth-label">{t('dataPermission.countryLabel')}</span>
              {renderCountryTag(detailRecord.country)}
            </div>
            <div className="data-auth-field">
              <span className="data-auth-label">{t('dataPermission.merchantScope')}</span>
              {detailRecord.allMerchants ? (
                <Tag color="green">{t('dataPermission.allMerchantsTag', { count: detailMerchants.length })}</Tag>
              ) : (
                <Tag color="purple">{t('dataPermission.specifiedMerchantsTag', { count: detailMerchants.length })}</Tag>
              )}
            </div>
            <Table
              columns={merchantTableColumns}
              dataSource={detailMerchants}
              rowKey="id"
              size="small"
              pagination={false}
              scroll={{ y: 320 }}
              locale={{ emptyText: t('dataPermission.noMerchantInRegion') }}
            />
          </>
        )}
      </Modal>
    </div>
  )
}
